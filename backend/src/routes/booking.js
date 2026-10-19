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

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const REQUEST_OPTIONS = ['bbq', 'extra_bed', 'pets'];
const MAX_NIGHTS = 30;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let code = 'BR-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

const SLIP_TRIES_PER_HOUR = 8;
const SLIP_CLOCK_SLACK_MS = 10 * 60 * 1000;

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const PUBLIC_COLUMNS = `
  b.id, b.code, b.status, b.room_id, b.activity_id, b.booked_for, b.booked_until,
  b.guests, b.extra_guests, b.pets, b.guest_name, b.guest_phone, b.requests, b.note, b.total, b.deposit,
  b.discount, b.promo_name, b.group_code, b.stay_username, b.stay_password, b.created_at,
  r.name AS room_name, a.name AS activity_name, ${PAYMENT_COLUMNS}`;

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

const kindOf = (req) => (KINDS.includes(req.query.kind) ? req.query.kind : 'deposit');

function notPayable(res, error, kind) {
  if (error === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
  return confirms(kind)
    ? res.status(409).json({ error: 'This booking is not waiting for payment', reason: 'NOT_PENDING' })
    : res.status(409).json({ error: 'Nothing is left to pay on this booking', reason: 'BALANCE_NOT_DUE' });
}

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

bookingRouter.post(
  '/request',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const fail = (status, error, reason) => res.status(status).json({ error, reason });

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

    const split = splitGuests(rooms, guests);
    if (!split) {
      return fail(400, 'The chosen rooms cannot sleep that many guests', 'TOO_MANY_GUESTS');
    }

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
        return res.status(201).json({ booking: bookings[0], bookings, ...paymentOptions() });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23P01') {
          return fail(409, 'A room is already booked for those dates', 'ROOM_TAKEN');
        }
        if (err.code === '23505') continue;
        throw err;
      } finally {
        client.release();
      }
    }
    throw new Error('Could not generate a unique booking code');
  })
);

