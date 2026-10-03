import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireMember } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';
import { ensureStayAccount } from '../lib/stayAccount.js';
import { maxGuests, priceStay } from '../lib/pricing.js';
import { bestPromotion, currentPromotions } from '../lib/promotions.js';

export const bookingRouter = Router();

// Express 4 doesn't catch rejected promises from async handlers - this
// forwards them to the app's error handler instead of crashing the process.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Extra requests a guest can tick when booking a room.
const REQUEST_OPTIONS = ['bbq', 'extra_bed', 'pets'];
const MAX_NIGHTS = 30;

// Booking codes look like "BR-7K3Q9M": no 0/O/1/I so they're easy to read
// out over the phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let code = 'BR-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

// Until real QR payment (PromptPay + SlipOK) is wired up, guests get a
// "PassPay" test button that marks their deposit as paid. On unless
// PAYMENT_TEST_MODE=false - turn it off before taking real bookings.
const PAYMENT_TEST_MODE = process.env.PAYMENT_TEST_MODE !== 'false';

// Parses a bare "YYYY-MM-DD" calendar date as UTC midnight (the same
// convention the room availability search uses), or null if it isn't one.
function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Columns safe to return to the account that owns the booking. Includes
// the room dashboard login (set once the booking is confirmed).
const PUBLIC_COLUMNS = `
  b.id, b.code, b.status, b.room_id, b.activity_id, b.booked_for, b.booked_until,
  b.guests, b.extra_guests, b.pets, b.guest_name, b.guest_phone, b.requests, b.note, b.total, b.deposit,
  b.discount, b.promo_name, b.stay_username, b.stay_password, b.created_at,
  r.name AS room_name, a.name AS activity_name`;

// Lists the signed-in user's own bookings - rooms and activities both -
// soonest first. Exactly one of activity_name/room_name is set per row;
// booked_until is only set for room stays (see POST / below).
bookingRouter.get(
  '/',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS}
       FROM bookings b
       LEFT JOIN activities a ON a.id = b.activity_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.user_id = $1
       ORDER BY b.booked_for`,
      [req.user.id]
    );
    // Bookings of theirs the property deleted, with the reason given.
    const notices = await pool.query(
      `SELECT id, code, booked, to_char(check_in, 'YYYY-MM-DD') AS check_in,
              to_char(check_out, 'YYYY-MM-DD') AS check_out, reason, created_at
       FROM booking_notices
       WHERE user_id = $1
       ORDER BY id DESC`,
      [req.user.id]
    );
    res.json({ bookings: rows, notices: notices.rows, test_pay: PAYMENT_TEST_MODE });
  })
);

// TEST ONLY ("PassPay"): marks the member's own pending room booking as
// paid - the same as the admin confirming it - so the whole flow can be
// tried before real payments exist. Disabled when PAYMENT_TEST_MODE=false.
bookingRouter.post(
  '/:id/pass-pay',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    if (!PAYMENT_TEST_MODE) return res.status(403).json({ error: 'Test payments are turned off' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });

    const client = await pool.connect();
    let stay;
    let booking;
    try {
      await client.query('BEGIN');
      booking = (
        await client.query(
          `SELECT b.id, b.status, b.code, b.room_id, b.guest_name, b.deposit, r.name AS room_name,
                  to_char(b.booked_for AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_in,
                  to_char(b.booked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_out
           FROM bookings b
           LEFT JOIN rooms r ON r.id = b.room_id
           WHERE b.id = $1 AND b.user_id = $2
           FOR UPDATE OF b`,
          [req.params.id, req.user.id]
        )
      ).rows[0];
      if (!booking?.room_id) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found' });
      }
      if (booking.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This booking is not waiting for payment', reason: 'NOT_PENDING' });
      }
      await client.query("UPDATE bookings SET status = 'confirmed' WHERE id = $1", [booking.id]);
      stay = await ensureStayAccount(client, booking.id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await logEvent('booking.confirmed', {
      actor: req.user.email,
      bookingId: booking.id,
      details: {
        code: stay?.stay_username ?? booking.code,
        room: booking.room_name,
        guest: booking.guest_name,
        check_in: booking.check_in,
        check_out: booking.check_out,
        paid_with: 'PassPay (test payment)',
        deposit: booking.deposit,
        room_username: stay?.stay_username,
        room_password: stay?.stay_password,
      },
    });

    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS}
       FROM bookings b
       LEFT JOIN activities a ON a.id = b.activity_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.id = $1`,
      [booking.id]
    );
    res.json({ booking: rows[0] });
  })
);

// Dismisses one of the member's own "your booking was deleted" notices.
bookingRouter.delete(
  '/notices/:id',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Notice not found' });
    const { rowCount } = await pool.query('DELETE FROM booking_notices WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Notice not found' });
    res.json({ ok: true });
  })
);

// Creates a room booking request for the signed-in account (logging in is
// required to book). The guest gives a contact name and phone number and
// gets back a booking code. The request starts as 'pending' (it holds the
// room) until the property confirms it once the deposit is paid - which
// also creates the room dashboard login - or cancels it. The price is always computed here
// from the room's current rate, never taken from the client.
// `reason` codes let the frontend show its own translated message.
bookingRouter.post(
  '/request',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const fail = (status, error, reason) => res.status(status).json({ error, reason });

    const roomId = Number.parseInt(body.room_id, 10);
    const checkIn = parseDay(body.check_in);
    const checkOut = parseDay(body.check_out);
    if (!Number.isInteger(roomId) || !checkIn || !checkOut) {
      return fail(400, 'room_id, check_in and check_out (YYYY-MM-DD) are required', 'MISSING_FIELDS');
    }

    const nights = Math.round((checkOut - checkIn) / 86_400_000);
    if (nights < 1) return fail(400, 'check_out must be after check_in', 'BAD_DATES');
    if (nights > MAX_NIGHTS) return fail(400, `Stays are limited to ${MAX_NIGHTS} nights`, 'TOO_LONG');
    // One day of slack so a guest in a timezone behind UTC can still book "today".
    if (checkIn.getTime() < Date.now() - 2 * 86_400_000) {
      return fail(400, 'check_in is in the past', 'BAD_DATES');
    }

    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const phoneDigits = digitsOnly(phone);
    if (name.length < 2 || name.length > 100) return fail(400, 'Please enter your name', 'BAD_NAME');
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return fail(400, 'Please enter a valid phone number', 'BAD_PHONE');
    }

    const email = String(body.email ?? '').trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(400, 'Please enter a valid email', 'BAD_EMAIL');
    }
    const line = String(body.line ?? '').trim().slice(0, 50) || null;
    const note = String(body.note ?? '').trim().slice(0, 500) || null;
    // Any number of pets may come (each is charged per night). The 'pets'
    // request tag simply mirrors whether the count is above zero.
    const pets = body.pets == null || body.pets === '' ? 0 : Number.parseInt(body.pets, 10);
    if (!Number.isInteger(pets) || pets < 0 || pets > 99) {
      return fail(400, 'pets must be a whole number of 0 or more', 'BAD_PETS');
    }
    const requests = (
      Array.isArray(body.requests) ? REQUEST_OPTIONS.filter((option) => body.requests.includes(option)) : []
    ).filter((option) => option !== 'pets');
    if (pets > 0) requests.push('pets');

    const guests = Number.parseInt(body.guests, 10);
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
      return fail(400, 'guests must be between 1 and 20', 'BAD_GUESTS');
    }

    const room = (
      await pool.query('SELECT id, price, capacity, max_extra_guests FROM rooms WHERE id = $1', [roomId])
    ).rows[0];
    if (!room) return fail(404, 'Room not found', 'ROOM_NOT_FOUND');
    const limit = maxGuests(room);
    if (limit && guests > limit) {
      return fail(400, `This room sleeps up to ${limit} guests`, 'TOO_MANY_GUESTS');
    }

    // Room rate (covers room.capacity guests) + the per-night fee for each
    // extra guest and each pet.
    // A promotion covering the check-in day takes a percentage off the room rate.
    const promo = bestPromotion(await currentPromotions(), roomId, body.check_in);
    const { total, deposit, extraGuests, discount } = priceStay(room, nights, guests, pets, promo);

    // Retry on the (very unlikely) chance the random code already exists.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO bookings
             (user_id, room_id, booked_for, booked_until, status, code, guests,
              guest_name, guest_phone, guest_email, guest_line, requests, note, total, deposit,
              extra_guests, pets, discount, promo_name)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           RETURNING id`,
          [
            req.user.id, roomId, checkIn.toISOString(), checkOut.toISOString(), newCode(),
            guests, name, phone, email, line, requests, note, total, deposit, extraGuests, pets,
            discount, promo ? `${promo.name} (-${promo.percent}%)` : null,
          ]
        );
        const booking = (
          await pool.query(
            `SELECT ${PUBLIC_COLUMNS}
             FROM bookings b
             LEFT JOIN activities a ON a.id = b.activity_id
             LEFT JOIN rooms r ON r.id = b.room_id
             WHERE b.id = $1`,
            [rows[0].id]
          )
        ).rows[0];
        await logEvent('booking.requested', {
          actor: req.user.email,
          bookingId: booking.id,
          details: {
            code: booking.code,
            member_code: req.user.member_code,
            room: booking.room_name,
            guest: name,
            phone,
            check_in: body.check_in,
            check_out: body.check_out,
            guests,
            extra_guests: extraGuests || undefined,
            pets: pets || undefined,
            promotion: promo ? `${promo.name} (-${promo.percent}%)` : undefined,
            total,
          },
        });
        return res.status(201).json({ booking, test_pay: PAYMENT_TEST_MODE });
      } catch (err) {
        // bookings_room_no_overlap: another active booking already covers
        // some of these nights (including a request that landed a moment ago).
        if (err.code === '23P01') {
          return fail(409, 'Room is already booked for those dates', 'ROOM_TAKEN');
        }
        // Unique violation on the booking code: generate another and retry.
        if (err.code === '23505') continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique booking code');
  })
);

// Creates a new booking for the signed-in user - either a room stay
// (room_id + booked_for/booked_until check-in/check-out) or an activity
// slot (activity_id + booked_for), never both, matching the
// bookings_exactly_one_target check constraint in the database.
bookingRouter.post(
  '/',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    const { activity_id, room_id, booked_for, booked_until } = req.body;

    if (!booked_for || !(activity_id || room_id) || (activity_id && room_id)) {
      return res
        .status(400)
        .json({ error: 'booked_for and exactly one of activity_id/room_id are required' });
    }
    if (activity_id && booked_until) {
      return res.status(400).json({ error: 'booked_until only applies to room bookings' });
    }
    if (room_id) {
      if (!booked_until) {
        return res
          .status(400)
          .json({ error: 'booked_until (check-out) is required when booking a room' });
      }
      if (new Date(booked_until) <= new Date(booked_for)) {
        return res.status(400).json({ error: 'booked_until must be after booked_for' });
      }
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO bookings (user_id, activity_id, room_id, booked_for, booked_until)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, activity_id, room_id, booked_for, booked_until, status, created_at`,
        [req.user.id, activity_id ?? null, room_id ?? null, booked_for, room_id ? booked_until : null]
      );
      res.status(201).json({ booking: rows[0] });
    } catch (err) {
      // Postgres foreign-key violation - the given activity_id/room_id
      // doesn't exist.
      if (err.code === '23503') {
        return res.status(404).json({ error: 'Room or activity not found' });
      }
      // Postgres exclusion-constraint violation - bookings_room_no_overlap
      // caught a scheduling clash with an existing room booking (including a
      // race against a second request that landed first).
      if (err.code === '23P01') {
        return res.status(409).json({ error: 'Room is already booked for those dates' });
      }
      throw err;
    }
  })
);
