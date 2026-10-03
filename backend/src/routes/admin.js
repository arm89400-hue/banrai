import { Router } from 'express';
import { pool } from '../db/pool.js';
import { isAdminEmail, memberCode, requireAuth, requireAdmin } from '../middleware/auth.js';
import { ensureStayAccount, removeStayAccount } from '../lib/stayAccount.js';
import { logEvent } from '../lib/activityLog.js';
import { PROMOTION_COLUMNS } from '../lib/promotions.js';
import { CHAT_COLUMNS, MAX_CHAT_LENGTH, readChatBody } from './chat.js';

export const adminRouter = Router();

// Every route below is admin-only.
adminRouter.use(requireAuth, requireAdmin);

// Express 4 doesn't catch rejected promises from async handlers - this
// forwards them to the app's error handler instead of crashing the process.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Headline numbers for the dashboard's Overview tab.
adminRouter.get(
  '/stats',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        (SELECT count(*) FROM users WHERE stay_booking_id IS NULL)::int AS users,
        (SELECT count(*) FROM rooms)::int AS rooms,
        (SELECT count(*) FROM activities)::int AS activities,
        (SELECT count(*) FROM bookings WHERE status <> 'cancelled')::int AS bookings,
        (SELECT count(*) FROM bookings WHERE status = 'pending')::int AS pending_bookings,
        (SELECT count(*) FROM bookings
          WHERE status <> 'cancelled'
            AND coalesce(booked_until, booked_for) >= now())::int AS upcoming_bookings,
        (SELECT count(*) FROM bookings b JOIN rooms r ON r.id = b.room_id
          WHERE b.status <> 'cancelled'
            AND now() >= b.booked_for AND now() < b.booked_until)::int AS rooms_occupied_now,
        (SELECT count(*) FROM contact_messages)::int AS messages,
        (SELECT count(*) FROM chat_messages WHERE NOT from_admin AND read_at IS NULL)::int AS unread_chats,
        (SELECT coalesce(sum(coalesce(b.total,
                   r.price * greatest(1, extract(day FROM b.booked_until - b.booked_for)))), 0)
          FROM bookings b JOIN rooms r ON r.id = b.room_id
          WHERE b.status = 'confirmed'
            AND b.booked_for >= date_trunc('month', now())
            AND b.booked_for < date_trunc('month', now()) + interval '1 month'
        )::float AS room_revenue_this_month
    `);
    res.json({ stats: rows[0] });
  })
);

// Every booking (rooms and activities) with who made it, newest stay first.
adminRouter.get(
  '/bookings',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT b.id, b.code, b.status, b.room_id, b.activity_id, b.booked_for, b.booked_until,
              b.created_at, b.guests, b.extra_guests, b.pets, b.guest_name, b.guest_phone, b.guest_email, b.guest_line,
              b.requests, b.note, b.total, b.deposit, b.discount, b.promo_name, b.stay_username, b.stay_password,
              b.user_id, u.email AS user_email, r.name AS room_name, r.price AS room_price,
              a.name AS activity_name, s.account_expires_at AS stay_expires_at
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN users s ON s.stay_booking_id = b.id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN activities a ON a.id = b.activity_id
       ORDER BY b.booked_for DESC`
    );
    res.json({
      bookings: rows.map((b) => ({ ...b, member_code: b.user_id ? memberCode(b.user_id) : null })),
    });
  })
);

// Moves a booking between pending / confirmed / cancelled.
// - Confirming (the deposit has been paid) creates the room dashboard login
//   for that booking, which expires at check-out.
// - Any other status removes that login again.
// - Cancelling frees the room's dates; re-opening a cancelled booking can
//   fail if someone else has taken those dates in the meantime.
adminRouter.patch(
  '/bookings/:id',
  wrap(async (req, res) => {
    const { status } = req.body ?? {};
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, confirmed or cancelled' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // What the booking looked like before the change, for the activity log.
      const before = (
        await client.query(
          `SELECT b.status, b.code, b.guest_name, b.stay_username,
                  coalesce(r.name, a.name) AS booked,
                  to_char(b.booked_for AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_in,
                  to_char(b.booked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_out
           FROM bookings b
           LEFT JOIN rooms r ON r.id = b.room_id
           LEFT JOIN activities a ON a.id = b.activity_id
           WHERE b.id = $1
           FOR UPDATE OF b`,
          [req.params.id]
        )
      ).rows[0];
      if (!before) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found' });
      }

      const { rows } = await client.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id, status',
        [status, req.params.id]
      );

      let stay = null;
      let expiresAt = null;
      if (status === 'confirmed') {
        stay = await ensureStayAccount(client, rows[0].id);
        expiresAt = (
          await client.query('SELECT account_expires_at FROM users WHERE stay_booking_id = $1', [
            rows[0].id,
          ])
        ).rows[0]?.account_expires_at;
      } else {
        await removeStayAccount(client, rows[0].id);
      }

      await client.query('COMMIT');

      if (before.status !== status) {
        const about = {
          code: stay?.stay_username ?? before.code,
          room: before.booked,
          guest: before.guest_name,
          check_in: before.check_in,
          check_out: before.check_out,
        };
        const event = { confirmed: 'booking.confirmed', cancelled: 'booking.cancelled', pending: 'booking.reopened' }[status];
        await logEvent(event, {
          actor: req.user.email,
          bookingId: rows[0].id,
          details:
            status === 'confirmed'
              ? { ...about, room_username: stay?.stay_username, room_password: stay?.stay_password, expires_at: expiresAt }
              : { ...about, was: before.status, room_login_removed: before.stay_username ?? undefined },
        });
      }

      res.json({ booking: { ...rows[0], ...stay } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23P01') {
        return res
          .status(409)
          .json({ error: 'Another booking now covers those dates, so this one cannot be re-opened' });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

// Permanently deletes a booking record (and, with it, the room login of a
// confirmed booking). The admin must give a reason. The member who made the
// booking is told: a notice with the reason appears on their "My bookings"
// page, and the same text is sent to their chat so the chat button shows it
// as unread. Bookings without an account can't be notified here.
adminRouter.delete(
  '/bookings/:id',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ error: 'Give a reason for deleting (3-500 characters)', reason: 'BAD_REASON' });
    }

    const client = await pool.connect();
    let deleted;
    try {
      await client.query('BEGIN');
      // What the booking was, read before it goes, for the notice and the log.
      deleted = (
        await client.query(
          `SELECT b.code, b.guest_name, b.status, b.user_id, b.stay_username,
                  coalesce(r.name, a.name) AS booked,
                  to_char(b.booked_for AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_in,
                  to_char(b.booked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_out
           FROM bookings b
           LEFT JOIN rooms r ON r.id = b.room_id
           LEFT JOIN activities a ON a.id = b.activity_id
           WHERE b.id = $1
           FOR UPDATE OF b`,
          [req.params.id]
        )
      ).rows[0];
      if (!deleted) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found' });
      }
      await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);

      if (deleted.user_id) {
        await client.query(
          `INSERT INTO booking_notices (user_id, code, booked, check_in, check_out, reason)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [deleted.user_id, deleted.code, deleted.booked, deleted.check_in, deleted.check_out, reason]
        );
        // Thai first (the site's default language), then English.
        const what = [deleted.code, deleted.booked].filter(Boolean).join(' · ');
        await client.query(
          'INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, true, $2)',
          [
            deleted.user_id,
            `การจอง ${what} ถูกลบโดยที่พัก\nเหตุผล: ${reason}\n\nYour booking ${what} was deleted by the property.\nReason: ${reason}`,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await logEvent('booking.deleted', {
      actor: req.user.email,
      details: {
        code: deleted.code,
        room: deleted.booked,
        guest: deleted.guest_name,
        check_in: deleted.check_in,
        check_out: deleted.check_out ?? undefined,
        was: deleted.status,
        reason,
        room_login_removed: deleted.stay_username ?? undefined,
        notified: Boolean(deleted.user_id),
      },
    });
    res.json({ ok: true, notified: Boolean(deleted.user_id) });
  })
);

// The activity log, newest first: bookings requested / confirmed /
// cancelled, room logins created, sign-ups and logins.
adminRouter.get(
  '/log',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, created_at, type, actor, booking_id, details
       FROM activity_log
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    );
    res.json({ log: rows });
  })
);

// Accounts with how many bookings each has made. Never returns password
// hashes. Room accounts (stay_booking_id set) are listed too, with their expiry.
adminRouter.get(
  '/users',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.created_at, u.account_expires_at, u.stay_booking_id,
              count(b.id)::int AS booking_count
       FROM users u
       LEFT JOIN bookings b ON b.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: rows.map((u) => ({ ...u, member_code: memberCode(u.id) })) });
  })
);

// Messages sent from the public Contact page, newest first.
adminRouter.get(
  '/messages',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC'
    );
    res.json({ messages: rows });
  })
);

adminRouter.delete(
  '/messages/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  })
);

// ---- Rooms & activities: create / edit / delete ----

// Validates and normalizes the editable fields shared by rooms and
// activities. Returns { error } or { values }.
function readListingBody(body, { withRoomFields }) {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const price = Number(body.price);
  if (!name) return { error: 'name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'price must be 0 or more' };
  if (!withRoomFields) return { values: { name, description, price } };

  const capacity =
    body.capacity === '' || body.capacity == null ? null : Number.parseInt(body.capacity, 10);
  if (capacity !== null && !(capacity > 0)) return { error: 'capacity must be 1 or more' };
  // Extra guests allowed on top of `capacity` (each charged the extra-guest fee).
  const max_extra_guests = Number.parseInt(body.max_extra_guests, 10) || 0;
  if (max_extra_guests < 0 || max_extra_guests > 10) {
    return { error: 'extra guests must be between 0 and 10' };
  }
  const image_url = String(body.image_url ?? '').trim() || null;
  return { values: { name, description, price, capacity, max_extra_guests, image_url } };
}

adminRouter.post(
  '/rooms',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: true });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO rooms (name, description, price, capacity, image_url, max_extra_guests)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, price, capacity, max_extra_guests, image_url`,
      [v.name, v.description, v.price, v.capacity, v.image_url, v.max_extra_guests]
    );
    res.status(201).json({ room: rows[0] });
  })
);

adminRouter.put(
  '/rooms/:id',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: true });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE rooms SET name = $1, description = $2, price = $3, capacity = $4, image_url = $5,
              max_extra_guests = $7
       WHERE id = $6
       RETURNING id, name, description, price, capacity, max_extra_guests, image_url`,
      [v.name, v.description, v.price, v.capacity, v.image_url, req.params.id, v.max_extra_guests]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Room not found' });
    res.json({ room: rows[0] });
  })
);

// Note: deleting a room also deletes its bookings (ON DELETE CASCADE).
adminRouter.delete(
  '/rooms/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Room not found' });
    res.json({ ok: true });
  })
);

adminRouter.post(
  '/activities',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: false });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO activities (name, description, price) VALUES ($1, $2, $3)
       RETURNING id, name, description, price`,
      [v.name, v.description, v.price]
    );
    res.status(201).json({ activity: rows[0] });
  })
);

adminRouter.put(
  '/activities/:id',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: false });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE activities SET name = $1, description = $2, price = $3 WHERE id = $4
       RETURNING id, name, description, price`,
      [v.name, v.description, v.price, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
    res.json({ activity: rows[0] });
  })
);

// Note: deleting an activity also deletes its bookings (ON DELETE CASCADE).
adminRouter.delete(
  '/activities/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM activities WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Activity not found' });
    res.json({ ok: true });
  })
);

// ---- Booking amounts & promotions (see db/migrations/011_promotions.sql) ----

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// Corrects what a booking costs: the admin sets the total and the deposit
// directly (a price agreed by phone, a goodwill discount, a mistake to fix).
// The member who booked is told the new amounts in their chat.
adminRouter.patch(
  '/bookings/:id/amount',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const total = Number(req.body?.total);
    const deposit = Number(req.body?.deposit);
    if (req.body?.total === '' || !Number.isFinite(total) || total < 0 || total > 10_000_000) {
      return res.status(400).json({ error: 'Total must be 0 or more' });
    }
    if (req.body?.deposit === '' || !Number.isFinite(deposit) || deposit < 0 || deposit > total) {
      return res.status(400).json({ error: 'Deposit must be between 0 and the total' });
    }
    const note = String(req.body?.reason ?? '').trim().slice(0, 500);

    const before = (
      await pool.query('SELECT code, guest_name, user_id, total, deposit FROM bookings WHERE id = $1', [
        req.params.id,
      ])
    ).rows[0];
    if (!before) return res.status(404).json({ error: 'Booking not found' });

    const { rows } = await pool.query(
      'UPDATE bookings SET total = $1, deposit = $2 WHERE id = $3 RETURNING id, total, deposit',
      [total, deposit, req.params.id]
    );

    if (before.user_id) {
      const why = note ? `\n${note}` : '';
      await pool.query('INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, true, $2)', [
        before.user_id,
        `ยอดการจอง ${before.code} ถูกปรับเป็น ${baht(total)} (มัดจำ ${baht(deposit)})${why}\n\n` +
          `The amount for booking ${before.code} was changed to ${baht(total)} (deposit ${baht(deposit)}).${why}`,
      ]);
    }
    await logEvent('booking.repriced', {
      actor: req.user.email,
      bookingId: rows[0].id,
      details: {
        code: before.code,
        guest: before.guest_name,
        old_total: before.total == null ? undefined : Number(before.total),
        total,
        deposit,
        reason: note || undefined,
        notified: Boolean(before.user_id),
      },
    });
    res.json({ booking: rows[0] });
  })
);

// Validates a promotion's fields. Returns { error } or { values }.
function readPromotionBody(body) {
  const name = String(body?.name ?? '').trim();
  const percent = Number(body?.percent);
  const starts_on = String(body?.starts_on ?? '');
  const ends_on = String(body?.ends_on ?? '');
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
  if (!name || name.length > 80) return { error: 'Name is required (up to 80 characters)' };
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return { error: 'Discount must be more than 0 and at most 100 percent' };
  }
  if (!isDay(starts_on) || !isDay(ends_on)) return { error: 'Choose the first and last check-in date' };
  if (ends_on < starts_on) return { error: 'The last date must not be before the first date' };
  const room_id = body?.room_id === '' || body?.room_id == null ? null : Number.parseInt(body.room_id, 10);
  if (room_id !== null && !Number.isInteger(room_id)) return { error: 'Unknown room' };
  return { values: { name, percent, starts_on, ends_on, room_id, active: body?.active !== false } };
}

// Every promotion, including switched-off and finished ones, newest first.
adminRouter.get(
  '/promotions',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${PROMOTION_COLUMNS}, r.name AS room_name
       FROM promotions p
       LEFT JOIN rooms r ON r.id = p.room_id
       ORDER BY p.ends_on DESC, p.id DESC`
    );
    res.json({ promotions: rows });
  })
);

adminRouter.post(
  '/promotions',
  wrap(async (req, res) => {
    const { error, values: v } = readPromotionBody(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const { rows } = await pool.query(
        `INSERT INTO promotions (name, percent, starts_on, ends_on, room_id, active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [v.name, v.percent, v.starts_on, v.ends_on, v.room_id, v.active]
      );
      await logEvent('promotion.created', { actor: req.user.email, details: { name: v.name, percent: v.percent } });
      res.status(201).json({ promotion: { id: rows[0].id, ...v } });
    } catch (err) {
      if (err.code === '23503') return res.status(400).json({ error: 'Unknown room' });
      throw err;
    }
  })
);

adminRouter.put(
  '/promotions/:id',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Promotion not found' });
    const { error, values: v } = readPromotionBody(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const { rowCount } = await pool.query(
        `UPDATE promotions SET name = $1, percent = $2, starts_on = $3, ends_on = $4, room_id = $5, active = $6
         WHERE id = $7`,
        [v.name, v.percent, v.starts_on, v.ends_on, v.room_id, v.active, req.params.id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Promotion not found' });
      res.json({ promotion: { id: Number(req.params.id), ...v } });
    } catch (err) {
      if (err.code === '23503') return res.status(400).json({ error: 'Unknown room' });
      throw err;
    }
  })
);

// Bookings already made keep the discount they were given.
adminRouter.delete(
  '/promotions/:id',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Promotion not found' });
    const { rows } = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING name, percent::float', [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });
    await logEvent('promotion.deleted', { actor: req.user.email, details: rows[0] });
    res.json({ ok: true });
  })
);

// ---- Chat with accounts (see db/migrations/008_chat.sql) ----

// Every account the property can chat with, with its latest message and how
// many of its messages are still unread. Conversations with messages come
// first (newest first), then the accounts nobody has written to yet.
adminRouter.get(
  '/chats',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.email, u.stay_booking_id, b.guest_name, r.name AS room_name,
              last.body AS last_body, last.from_admin AS last_from_admin, last.created_at AS last_at,
              (SELECT count(*) FROM chat_messages m
                WHERE m.user_id = u.id AND NOT m.from_admin AND m.read_at IS NULL)::int AS unread
       FROM users u
       LEFT JOIN bookings b ON b.id = u.stay_booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN LATERAL (
         SELECT body, from_admin, created_at FROM chat_messages m
         WHERE m.user_id = u.id ORDER BY m.id DESC LIMIT 1
       ) last ON true
       ORDER BY last.created_at DESC NULLS LAST, u.created_at DESC`
    );
    res.json({
      chats: rows
        .filter((c) => c.stay_booking_id != null || !isAdminEmail(c.email))
        .map((c) => ({ ...c, member_code: c.stay_booking_id ? null : memberCode(c.user_id) })),
    });
  })
);

// One account's conversation, oldest first. Opening it marks that
// account's messages as seen.
adminRouter.get(
  '/chats/:userId',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.userId)) return res.status(404).json({ error: 'Account not found' });
    await pool.query(
      'UPDATE chat_messages SET read_at = now() WHERE user_id = $1 AND NOT from_admin AND read_at IS NULL',
      [req.params.userId]
    );
    const { rows } = await pool.query(
      `SELECT ${CHAT_COLUMNS} FROM chat_messages WHERE user_id = $1 ORDER BY id`,
      [req.params.userId]
    );
    res.json({ messages: rows });
  })
);

adminRouter.post(
  '/chats/:userId',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.userId)) return res.status(404).json({ error: 'Account not found' });
    const body = readChatBody(req.body);
    if (!body) {
      return res.status(400).json({ error: `Message must be 1-${MAX_CHAT_LENGTH} characters` });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, true, $2)
         RETURNING ${CHAT_COLUMNS}`,
        [req.params.userId, body]
      );
      res.status(201).json({ message: rows[0] });
    } catch (err) {
      // 23503: no such account (foreign key).
      if (err.code === '23503') return res.status(404).json({ error: 'Account not found' });
      throw err;
    }
  })
);
