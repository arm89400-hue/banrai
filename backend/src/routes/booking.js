import { randomInt } from 'node:crypto';
import express, { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireMember } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';
import { MAX_PARTY, priceStay, splitGuests } from '../lib/pricing.js';
import { bestPromotion, currentPromotions } from '../lib/promotions.js';
import { MAX_UPLOAD_BYTES, imageExtension, saveUpload } from '../lib/photos.js';
import { CHECKER_PROBLEMS, checkSlip, satang, slipokConfigured } from '../lib/slipok.js';
import {
  KINDS,
  PAYMENT_COLUMNS,
  PAYMENT_TEST_MODE,
  confirms,
  logPayment,
  paymentOptions,
  paymentScope,
  recordSlip,
  settlePayment,
} from '../lib/payments.js';

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

// Uploads per booking per hour - every check uses SlipOK quota.
const SLIP_TRIES_PER_HOUR = 8;
// A slip must be made after the booking (minus this slack for clock drift).
const SLIP_CLOCK_SLACK_MS = 10 * 60 * 1000;

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
  b.discount, b.promo_name, b.group_code, b.stay_username, b.stay_password, b.created_at,
  r.name AS room_name, a.name AS activity_name, ${PAYMENT_COLUMNS}`;

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
    res.json({ bookings: rows, notices: notices.rows, ...paymentOptions() });
  })
);

// Which payment a request is about: ?kind=deposit (the default), ?kind=full
// (the whole price instead of the deposit) or ?kind=balance.
const kindOf = (req) => (KINDS.includes(req.query.kind) ? req.query.kind : 'deposit');

// Answers a payment for something that isn't owed (already paid, cancelled,
// not the member's booking).
function notPayable(res, error, kind) {
  if (error === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
  return confirms(kind)
    ? res.status(409).json({ error: 'This booking is not waiting for payment', reason: 'NOT_PENDING' })
    : res.status(409).json({ error: 'Nothing is left to pay on this booking', reason: 'BALANCE_NOT_DUE' });
}

// After a payment: the booking paid from plus the rooms booked with it, so
// the page can update every card.
export async function paidResponse(bookingId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM bookings b
     LEFT JOIN activities a ON a.id = b.activity_id
     LEFT JOIN rooms r ON r.id = b.room_id
     WHERE b.id = $1
        OR b.group_code = (SELECT t.group_code FROM bookings t WHERE t.id = $1)
     ORDER BY b.id`,
    [bookingId]
  );
  return { booking: rows.find((b) => b.id === Number(bookingId)), bookings: rows };
}

// TEST ONLY ("PassPay"): marks the member's own payment as paid - a deposit
// confirms the booking (and the rooms booked with it) the same as the admin
// confirming it; ?kind=balance marks the other half paid. Lets the whole
// flow be tried before real payments exist. Off when PAYMENT_TEST_MODE=false.
bookingRouter.post(
  '/:id/pass-pay',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    if (!PAYMENT_TEST_MODE) return res.status(403).json({ error: 'Test payments are turned off' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const kind = kindOf(req);

    const client = await pool.connect();
    let scope;
    let stays;
    try {
      await client.query('BEGIN');
      scope = await paymentScope(client, req.params.id, { kind, userId: req.user.id, lock: true });
      if (scope.error) {
        await client.query('ROLLBACK');
        return notPayable(res, scope.error, kind);
      }
      stays = await settlePayment(client, scope.due.map((b) => b.id), kind, 'online');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await logPayment(req.user.email, scope, kind, stays, { paidWith: 'PassPay (test payment)' });
    res.json(await paidResponse(scope.target.id));
  })
);

const SLIP_MESSAGES = {
  SLIP_UNREADABLE: 'Could not read a payment QR code on this slip',
  SLIP_NOT_FOUND: 'The bank could not find this transfer',
  SLIP_PENDING: 'The bank has not confirmed this transfer yet - try again in a few minutes',
  SLIP_DUPLICATE: 'This slip has already been used',
  SLIP_AMOUNT: 'The amount on the slip does not match the amount due',
  SLIP_RECEIVER: 'The money was sent to a different account',
  SLIP_OLD: 'This slip was made before the booking',
  SLIP_SERVICE: 'The slip check service is not available right now',
  SLIP_NOT_CONFIGURED: 'Slip checking is not set up yet',
  SLIP_TOO_MANY: 'Too many slips for this booking - try again in an hour or call us',
};

// Payment by bank transfer: the guest uploads the slip for one of their own
// room bookings - ?kind=deposit (default, confirms the booking), ?kind=full
// (confirms it and pays the other half too) or ?kind=balance (the other half). Rooms booked together are paid with one
// slip for their sum (see lib/payments.js).
// - SlipOK not set up: the slip waits for the owner to check it in admin (202).
// - SlipOK set up: SlipOK checks it is a real transfer, for exactly the
//   amount due, to the property's account, and not used before; this route
//   then checks the amount and transfer reference again itself, and that the
//   transfer was made after the booking. If everything passes the payment is
//   recorded at once - the same as the owner approving it.
// - SlipOK can't answer (account, quota, bank down or delayed): the slip
//   waits for the owner instead of being turned down (202).
// Every upload is kept in slip_payments.
bookingRouter.post(
  '/:id/slip',
  requireAuth,
  requireMember,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  wrap(async (req, res) => {
    const fail = (status, reason) => res.status(status).json({ error: SLIP_MESSAGES[reason] ?? reason, reason });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const kind = kindOf(req);
    const ext = imageExtension(req.body);
    if (!ext) return fail(400, 'SLIP_UNREADABLE');

    const scope = await paymentScope(pool, req.params.id, { kind, userId: req.user.id });
    if (scope.error) return notPayable(res, scope.error, kind);
    const { target } = scope;

    const recent = (
      await pool.query(
        `SELECT count(*)::int AS n FROM slip_payments
         WHERE booking_ids && $1::int[] AND created_at > now() - interval '1 hour'`,
        [scope.due.map((b) => b.id)]
      )
    ).rows[0].n;
    if (recent >= SLIP_TRIES_PER_HOUR) return fail(429, 'SLIP_TOO_MANY');

    const slipFile = await saveUpload(req.body, ext, 'slip');

    // Keeps the slip for the owner to check by hand.
    const toReview = async (reason, slip, raw) => {
      await recordSlip(pool, { scope, kind, userId: req.user.id, status: 'review', reason, slip, slipFile, raw });
      await logEvent('booking.slip_sent', {
        actor: req.user.email,
        bookingId: target.id,
        details: {
          code: scope.code,
          payment: kind,
          rooms: scope.due.map((b) => b.room_name).join(', '),
          guest: target.guest_name,
          amount: scope.amount,
          slip: slipFile,
          slipok: reason ?? undefined,
        },
      });
      return res.status(202).json({ ...(await paidResponse(target.id)), review: true });
    };

    if (!slipokConfigured()) return toReview(null);

    const result = await checkSlip({
      image: req.body,
      contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
      amount: scope.amount,
    });
    const slip = result.ok ? result.slip : null;

    // Our own checks on top of SlipOK's answer.
    let reason = result.ok ? null : result.reason;
    if (slip) {
      const madeAt = new Date(slip.transTimestamp);
      if (satang(slip.amount) !== satang(scope.amount)) reason = 'SLIP_AMOUNT';
      else if (!slip.transRef) reason = 'SLIP_NOT_FOUND';
      else if (!Number.isNaN(madeAt.getTime()) && madeAt < new Date(target.created_at).getTime() - SLIP_CLOCK_SLACK_MS) {
        reason = 'SLIP_OLD';
      }
    }
    if (reason && CHECKER_PROBLEMS.has(reason)) return toReview(reason, slip, result.raw);
    if (reason) {
      await recordSlip(pool, { scope, kind, userId: req.user.id, status: 'rejected', reason, slip, slipFile, raw: result.raw });
      return fail(422, reason);
    }

    // Passed: record it in one transaction. The bookings are locked and
    // checked again (paid, cancelled or re-priced meanwhile); the unique index
    // on verified trans_ref stops one transfer paying twice.
    const client = await pool.connect();
    let current;
    let stays;
    try {
      await client.query('BEGIN');
      current = await paymentScope(client, target.id, { kind, userId: req.user.id, lock: true });
      if (current.error || satang(current.amount) !== satang(scope.amount)) {
        await client.query('ROLLBACK');
        const notDue = confirms(kind) ? 'NOT_PENDING' : 'BALANCE_NOT_DUE';
        const why = current.error ? notDue : 'SLIP_AMOUNT';
        await recordSlip(pool, { scope, kind, userId: req.user.id, status: 'rejected', reason: why, slip, slipFile, raw: result.raw });
        return why === 'SLIP_AMOUNT' ? fail(422, why) : notPayable(res, 'NOT_DUE', kind);
      }
      try {
        await recordSlip(client, { scope: current, kind, userId: req.user.id, status: 'verified', slip, slipFile, raw: result.raw });
      } catch (err) {
        if (err.code !== '23505') throw err;
        await client.query('ROLLBACK');
        await recordSlip(pool, { scope, kind, userId: req.user.id, status: 'rejected', reason: 'SLIP_DUPLICATE', slip, slipFile, raw: result.raw });
        return fail(422, 'SLIP_DUPLICATE');
      }
      stays = await settlePayment(client, current.due.map((b) => b.id), kind, 'online');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await logPayment(req.user.email, current, kind, stays, { paidWith: `Bank transfer slip (SlipOK) ${slip.transRef}`, slipFile });
    res.json(await paidResponse(target.id));
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

    // One room (`room_id`) or several booked together (`rooms`, in the
    // order the guest picked them).
    const roomIds = [
      ...new Set(
        (Array.isArray(body.rooms) ? body.rooms : [body.room_id]).map((id) => Number.parseInt(id, 10))
      ),
    ];
    const checkIn = parseDay(body.check_in);
    const checkOut = parseDay(body.check_out);
    if (roomIds.length === 0 || roomIds.some((id) => !Number.isInteger(id)) || !checkIn || !checkOut) {
      return fail(400, 'rooms, check_in and check_out (YYYY-MM-DD) are required', 'MISSING_FIELDS');
    }
    if (roomIds.length > 5) return fail(400, 'At most 5 rooms per booking', 'TOO_MANY_ROOMS');

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
    if (!Number.isInteger(guests) || guests < 1 || guests > MAX_PARTY) {
      return fail(400, `guests must be between 1 and ${MAX_PARTY}`, 'BAD_GUESTS');
    }

    const found = (
      await pool.query('SELECT id, name, price, capacity, max_extra_guests FROM rooms WHERE id = ANY($1)', [roomIds])
    ).rows;
    const rooms = roomIds.map((id) => found.find((r) => r.id === id));
    if (rooms.some((r) => !r)) return fail(404, 'Room not found', 'ROOM_NOT_FOUND');

    // How many guests sleep in each room (included places first, then extra).
    const split = splitGuests(rooms, guests);
    if (!split) {
      return fail(400, 'The chosen rooms cannot sleep that many guests', 'TOO_MANY_GUESTS');
    }

    // Each room is priced on its own: its rate (covering room.capacity
    // guests) + the nightly fee for each extra guest, minus the best
    // promotion for that room on the check-in day. Pets and extra requests
    // go with the first room.
    const promotions = await currentPromotions();
    const plans = rooms.map((room, i) => {
      const promo = bestPromotion(promotions, room.id, body.check_in);
      const roomPets = i === 0 ? pets : 0;
      return {
        room,
        guests: split[i],
        pets: roomPets,
        requests: i === 0 ? requests : [],
        promoName: promo ? `${promo.name} (-${promo.percent}%)` : null,
        ...priceStay(room, nights, split[i], roomPets, promo),
      };
    });

    // Retry on the (very unlikely) chance a random code already exists.
    for (let attempt = 0; attempt < 5; attempt++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const codes = plans.map(() => newCode());
        const groupCode = plans.length > 1 ? codes[0] : null;
        const ids = [];
        for (const [i, p] of plans.entries()) {
          const { rows } = await client.query(
            `INSERT INTO bookings
               (user_id, room_id, booked_for, booked_until, status, code, guests,
                guest_name, guest_phone, guest_email, guest_line, requests, note, total, deposit,
                extra_guests, pets, discount, promo_name, group_code)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING id`,
            [
              req.user.id, p.room.id, checkIn.toISOString(), checkOut.toISOString(), codes[i],
              p.guests, name, phone, email, line, p.requests, note, p.total, p.deposit,
              p.extraGuests, p.pets, p.discount, p.promoName, groupCode,
            ]
          );
          ids.push(rows[0].id);
        }
        await client.query('COMMIT');

        const bookings = (
          await pool.query(
            `SELECT ${PUBLIC_COLUMNS}
             FROM bookings b
             LEFT JOIN activities a ON a.id = b.activity_id
             LEFT JOIN rooms r ON r.id = b.room_id
             WHERE b.id = ANY($1)
             ORDER BY array_position($1::int[], b.id)`,
            [ids]
          )
        ).rows;
        for (const [i, booking] of bookings.entries()) {
          const p = plans[i];
          await logEvent('booking.requested', {
            actor: req.user.email,
            bookingId: booking.id,
            details: {
              code: booking.code,
              group: groupCode ?? undefined,
              member_code: req.user.member_code,
              room: booking.room_name,
              guest: name,
              phone,
              check_in: body.check_in,
              check_out: body.check_out,
              guests: p.guests,
              extra_guests: p.extraGuests || undefined,
              pets: p.pets || undefined,
              promotion: p.promoName ?? undefined,
              total: p.total,
            },
          });
        }
        // `booking` (the first room) keeps older clients working.
        return res.status(201).json({ booking: bookings[0], bookings, ...paymentOptions() });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        // bookings_room_no_overlap: another active booking already covers
        // some of these nights (including a request that landed a moment ago).
        if (err.code === '23P01') {
          return fail(409, 'A room is already booked for those dates', 'ROOM_TAKEN');
        }
        // Unique violation on a booking code: generate new ones and retry.
        if (err.code === '23505') continue;
        throw err;
      } finally {
        client.release();
      }
    }
    throw new Error('Could not generate a unique booking code');
  })
);

