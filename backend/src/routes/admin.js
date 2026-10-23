import express, { Router } from 'express';
import { pool } from '../db/pool.js';
import { isAdminEmail, memberCode, requireAuth, requireAdmin } from '../middleware/auth.js';
import { ensureStayAccount, removeStayAccount } from '../lib/stayAccount.js';
import { logEvent } from '../lib/activityLog.js';
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, PHOTO_OWNERS, imageExtension, removeUploads, saveUpload } from '../lib/photos.js';
import { PROMOTION_COLUMNS } from '../lib/promotions.js';
import { logPayment, paymentScope, paymentSetup, settlePayment } from '../lib/payments.js';
import { CHAT_COLUMNS, MAX_CHAT_LENGTH, readChatBody } from './chat.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

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
        (SELECT count(*) FROM chat_messages WHERE NOT from_admin AND read_at IS NULL)::int AS unread_chats,
        -- Guests whose last message has no reply yet (what the Messages page counts).
        (SELECT count(*) FROM (
          SELECT DISTINCT ON (user_id) from_admin FROM chat_messages ORDER BY user_id, id DESC
        ) last WHERE NOT last.from_admin)::int AS waiting_chats,
        -- Payments with a slip waiting for a manual check that are still owed.
        (SELECT count(DISTINCT x.kind || x.booking_ids::text) FROM slip_payments x
          WHERE x.status = 'review' AND EXISTS (
            SELECT 1 FROM bookings y WHERE y.id = ANY(x.booking_ids)
              AND CASE WHEN x.kind <> 'balance' THEN y.status = 'pending'
                       ELSE y.status = 'confirmed' AND y.balance_paid_at IS NULL END))::int AS slips_to_review,
        (SELECT coalesce(sum(coalesce(b.total,
                   r.price * greatest(1, extract(day FROM b.booked_until - b.booked_for)))), 0)
          FROM bookings b JOIN rooms r ON r.id = b.room_id
          WHERE b.status = 'confirmed'
            AND b.booked_for >= date_trunc('month', now())
            AND b.booked_for < date_trunc('month', now()) + interval '1 month'
        )::float AS room_revenue_this_month
    `);
    res.json({ stats: rows[0], payment_setup: paymentSetup() });
  })
);

adminRouter.get(
  '/bookings',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT b.id, b.code, b.status, b.room_id, b.activity_id, b.booked_for, b.booked_until,
              b.created_at, b.guests, b.extra_guests, b.pets, b.guest_name, b.guest_phone, b.guest_email, b.guest_line,
              b.requests, b.note, b.total, b.deposit, b.discount, b.promo_name, b.group_code, b.stay_username, b.stay_password,
              b.user_id, u.email AS user_email, r.name AS room_name, r.price AS room_price,
              a.name AS activity_name, s.account_expires_at AS stay_expires_at,
              sp.status AS slip_status, sp.reason AS slip_reason, sp.amount AS slip_amount,
              sp.trans_ref AS slip_ref, sp.slip_file, sp.slips AS slip_count, sp.id AS slip_id,
              sp.rooms AS slip_rooms, sp.expected AS slip_expected,
              b.balance_paid_at, b.balance_method,
              bs.status AS balance_slip_status, bs.reason AS balance_slip_reason, bs.amount AS balance_slip_amount,
              bs.slip_file AS balance_slip_file, bs.id AS balance_slip_id, bs.expected AS balance_slip_expected
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN users s ON s.stay_booking_id = b.id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN activities a ON a.id = b.activity_id
       -- The deposit slip that matters most: the verified one, else one
       -- waiting for a check, else the latest try. A slip can pay for
       -- several rooms booked together (booking_ids).
       LEFT JOIN LATERAL (
         SELECT x.id, x.status, x.reason, x.amount, x.expected, x.trans_ref, x.slip_file,
                cardinality(x.booking_ids) AS rooms, count(*) OVER ()::int AS slips
         FROM slip_payments x
         WHERE b.id = ANY(x.booking_ids) AND x.kind IN ('deposit', 'full')
         ORDER BY (x.status = 'verified') DESC, (x.status = 'review') DESC, x.created_at DESC
         LIMIT 1
       ) sp ON true
       -- The same for a slip paying the other half (balance).
       LEFT JOIN LATERAL (
         SELECT x.id, x.status, x.reason, x.amount, x.expected, x.slip_file
         FROM slip_payments x
         WHERE b.id = ANY(x.booking_ids) AND x.kind = 'balance'
         ORDER BY (x.status = 'verified') DESC, (x.status = 'review') DESC, x.created_at DESC
         LIMIT 1
       ) bs ON true
       ORDER BY b.booked_for DESC`
    );
    res.json({
      bookings: rows.map((b) => ({ ...b, member_code: b.user_id ? memberCode(b.user_id) : null })),
    });
  })
);

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

      if (status !== 'pending') {
        const closed = await client.query(
          `UPDATE slip_payments SET status = $2, reason = $3, reviewed_at = now()
           WHERE $1 = ANY(booking_ids) AND kind IN ('deposit', 'full') AND status = 'review'
           RETURNING kind`,
          [req.params.id, status === 'confirmed' ? 'verified' : 'rejected', status === 'confirmed' ? 'MANUAL' : 'BOOKING_CANCELLED']
        );
        if (status === 'confirmed' && closed.rows.some((s) => s.kind === 'full')) {
          await client.query(
            "UPDATE bookings SET balance_paid_at = now(), balance_method = 'online' WHERE id = $1 AND balance_paid_at IS NULL",
            [req.params.id]
          );
        }
      }

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
    res.json({
      users: rows.map((u) => ({
        ...u,
        member_code: memberCode(u.id),
        is_admin: u.stay_booking_id == null && isAdminEmail(u.email),
      })),
    });
  })
);

function readListingBody(body, { withRoomFields }) {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const price = Number(body.price);
  if (!name) return { error: 'name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'price must be 0 or more' };
  if (!withRoomFields) return { values: { name, description, price } };
  return readRoomFields(body, { name, description, price });
}

function readActivityBody(body) {
  const text = (key, max = 2000) => String(body[key] ?? '').trim().slice(0, max) || null;
  const nameEn = text('name', 120);
  const nameTh = text('name_th', 120);
  if (!nameEn && !nameTh) return { error: 'Give the activity a name (English or Thai)' };
  const price = Number(body.price ?? 0);
  if (!Number.isFinite(price) || price < 0) return { error: 'price must be 0 or more' };
  const position = body.position === '' || body.position == null ? null : Number.parseInt(body.position, 10);
  if (position !== null && !(position >= 0 && position <= 9999)) return { error: 'order must be 0 or more' };
  return {
    values: {
      name: nameEn ?? nameTh,
      name_th: nameTh,
      description: text('description'),
      description_th: text('description_th'),
      tag: text('tag', 60),
      tag_th: text('tag_th', 60),
      price,
      position,
    },
  };
}

function readRoomFields(body, { name, description, price }) {
  const capacity =
    body.capacity === '' || body.capacity == null ? null : Number.parseInt(body.capacity, 10);
  if (capacity !== null && !(capacity > 0)) return { error: 'capacity must be 1 or more' };
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
    res.status(201).json({ room: { ...rows[0], photos: [] } });
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

async function deleteListing(kind, id) {
  const { table, column } = PHOTO_OWNERS[kind];
  if (!/^\d+$/.test(String(id))) return false;
  const files = (await pool.query(`SELECT file FROM photos WHERE ${column} = $1`, [id])).rows.map((r) => r.file);
  const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  if (rowCount) await removeUploads(files);
  return rowCount > 0;
}

adminRouter.delete(
  '/rooms/:id',
  wrap(async (req, res) => {
    if (!(await deleteListing('rooms', req.params.id))) return res.status(404).json({ error: 'Room not found' });
    res.json({ ok: true });
  })
);

const ACTIVITY_RETURNING = 'id, name, name_th, description, description_th, tag, tag_th, price, position';

adminRouter.post(
  '/activities',
  wrap(async (req, res) => {
    const { error, values: v } = readActivityBody(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO activities (name, name_th, description, description_th, tag, tag_th, price, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               coalesce($8, (SELECT coalesce(max(position), 0) + 1 FROM activities)))
       RETURNING ${ACTIVITY_RETURNING}`,
      [v.name, v.name_th, v.description, v.description_th, v.tag, v.tag_th, v.price, v.position]
    );
    res.status(201).json({ activity: { ...rows[0], photos: [] } });
  })
);

adminRouter.put(
  '/activities/:id',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Activity not found' });
    const { error, values: v } = readActivityBody(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE activities
       SET name = $1, name_th = $2, description = $3, description_th = $4, tag = $5, tag_th = $6,
           price = $7, position = coalesce($8, position)
       WHERE id = $9
       RETURNING ${ACTIVITY_RETURNING}`,
      [v.name, v.name_th, v.description, v.description_th, v.tag, v.tag_th, v.price, v.position, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
    res.json({ activity: rows[0] });
  })
);

adminRouter.delete(
  '/activities/:id',
  wrap(async (req, res) => {
    if (!(await deleteListing('activities', req.params.id))) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json({ ok: true });
  })
);

async function listPhotos(db, column, id) {
  const { rows } = await db.query(
    `SELECT id, file FROM photos WHERE ${column} = $1 ORDER BY position, id`,
    [id]
  );
  return rows;
}

adminRouter.post(
  '/:kind(rooms|activities|announcements)/:id/photos',
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  wrap(async (req, res) => {
    const { table, column } = PHOTO_OWNERS[req.params.kind];
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const ext = imageExtension(req.body);
    if (!ext) {
      return res.status(400).json({ error: 'Only JPEG, PNG or WebP photos can be uploaded', reason: 'BAD_IMAGE' });
    }

    const client = await pool.connect();
    let file = null;
    try {
      await client.query('BEGIN');
      const owner = (await client.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!owner) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not found' });
      }
      const { count, last } = (
        await client.query(
          `SELECT count(*)::int AS count, coalesce(max(position), 0) AS last FROM photos WHERE ${column} = $1`,
          [owner.id]
        )
      ).rows[0];
      if (count >= MAX_PHOTOS) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: `This already has ${MAX_PHOTOS} photos. Delete one to add another.`, reason: 'MAX_PHOTOS' });
      }
      const prefix = { rooms: 'room', activities: 'activity', announcements: 'announcement' }[req.params.kind];
      file = await saveUpload(req.body, ext, `${prefix}-${owner.id}`);
      await client.query(`INSERT INTO photos (${column}, file, position) VALUES ($1, $2, $3)`, [owner.id, file, last + 1]);
      await client.query('COMMIT');
      res.status(201).json({ photos: await listPhotos(pool, column, owner.id) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (file) await removeUploads([file]);
      throw err;
    } finally {
      client.release();
    }
  })
);

adminRouter.put(
  '/:kind(rooms|activities|announcements)/:id/photos/order',
  wrap(async (req, res) => {
    const { column } = PHOTO_OWNERS[req.params.kind];
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    const current = await listPhotos(pool, column, req.params.id);
    const same = ids.length === current.length && current.every((p) => ids.includes(p.id));
    if (!same) return res.status(400).json({ error: 'ids must list each of its photos once' });
    await pool.query(
      `UPDATE photos p SET position = o.position
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, position)
       WHERE p.id = o.id AND p.${column} = $2`,
      [ids, req.params.id]
    );
    res.json({ photos: await listPhotos(pool, column, req.params.id) });
  })
);

adminRouter.delete(
  '/photos/:id',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Photo not found' });
    const { rows } = await pool.query(
      'DELETE FROM photos WHERE id = $1 RETURNING file, room_id, activity_id, announcement_id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Photo not found' });
    await removeUploads([rows[0].file]);
    const column = ['room_id', 'activity_id', 'announcement_id'].find((c) => rows[0][c] != null);
    res.json({ photos: await listPhotos(pool, column, rows[0][column]) });
  })
);

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

adminRouter.post(
  '/slips/:id/approve',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Slip not found' });
    const client = await pool.connect();
    let slip;
    let scope;
    let stays;
    try {
      await client.query('BEGIN');
      slip = (
        await client.query('SELECT id, booking_id, kind, status, slip_file FROM slip_payments WHERE id = $1 FOR UPDATE', [
          req.params.id,
        ])
      ).rows[0];
      if (slip?.status !== 'review') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This slip is not waiting for review' });
      }
      scope = await paymentScope(client, slip.booking_id, { kind: slip.kind, lock: true });
      if (scope.error) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Nothing is owed on this booking any more' });
      }
      const ids = scope.due.map((b) => b.id);
      stays = await settlePayment(client, ids, slip.kind, 'online');
      await client.query(
        `UPDATE slip_payments SET status = 'verified', reason = 'MANUAL', reviewed_at = now(), booking_ids = $2
         WHERE id = $1`,
        [slip.id, ids]
      );
      await client.query(
        `UPDATE slip_payments SET status = 'rejected', reason = 'SUPERSEDED', reviewed_at = now()
         WHERE id <> $1 AND status = 'review' AND booking_ids && $3::int[]
           AND (kind = $2 OR ($2 <> 'balance' AND kind <> 'balance'))`,
        [slip.id, slip.kind, ids]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await logPayment(req.user.email, scope, slip.kind, stays, { paidWith: 'Slip checked by hand', slipFile: slip.slip_file });
    res.json({ ok: true, amount: scope.amount, bookings: scope.due.map((b) => b.id) });
  })
);

adminRouter.patch(
  '/bookings/:id/balance',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    if (req.body?.paid === false) {
      const { rows } = await pool.query(
        `UPDATE bookings SET balance_paid_at = NULL, balance_method = NULL
         WHERE balance_method = 'at_farm'
           AND (id = $1 OR group_code = (SELECT t.group_code FROM bookings t WHERE t.id = $1))
         RETURNING id, code`,
        [req.params.id]
      );
      if (!rows.length) return res.status(409).json({ error: 'This booking was not marked as paid at the farm' });
      await logEvent('booking.balance_unpaid', {
        actor: req.user.email,
        bookingId: Number(req.params.id),
        details: { codes: rows.map((r) => r.code).join(', ') },
      });
      return res.json({ ok: true });
    }

    const client = await pool.connect();
    let scope;
    try {
      await client.query('BEGIN');
      scope = await paymentScope(client, req.params.id, { kind: 'balance', lock: true });
      if (scope.error) {
        await client.query('ROLLBACK');
        return scope.error === 'NOT_FOUND'
          ? res.status(404).json({ error: 'Booking not found' })
          : res.status(409).json({ error: 'Nothing is left to pay on this booking (confirm the deposit first)' });
      }
      const ids = scope.due.map((b) => b.id);
      await settlePayment(client, ids, 'balance', 'at_farm');
      await client.query(
        `UPDATE slip_payments SET status = 'rejected', reason = 'PAID_AT_FARM', reviewed_at = now()
         WHERE status = 'review' AND kind = 'balance' AND booking_ids && $1::int[]`,
        [ids]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await logPayment(req.user.email, scope, 'balance', {}, { paidWith: 'Paid at the farm', method: 'at_farm' });
    res.json({ ok: true, amount: scope.amount });
  })
);

adminRouter.patch(
  '/slips/:id/reject',
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Slip not found' });
    const { rows } = await pool.query(
      `UPDATE slip_payments SET status = 'rejected', reason = 'MANUAL_REJECT', reviewed_at = now()
       WHERE id = $1 AND status = 'review'
       RETURNING id, booking_id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'This slip is not waiting for review' });
    await logEvent('booking.slip_rejected', { actor: req.user.email, bookingId: rows[0].booking_id, details: { slip: rows[0].id } });
    res.json({ ok: true });
  })
);

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

adminRouter.get(
  '/chats',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.email, u.stay_booking_id, b.guest_name, b.guest_phone,
              b.booked_for, b.booked_until, r.name AS room_name,
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
      if (err.code === '23503') return res.status(404).json({ error: 'Account not found' });
      throw err;
    }
  })
);
