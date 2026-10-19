// What a guest owes and how it's paid. Shared by the guest routes
// (routes/booking.js) and admin (routes/admin.js) so both follow one set of
// rules.
//
// Two payments per stay:
// - deposit: half the price, paid online to confirm the booking (required).
// - balance: the other half (total - deposit), paid online before arriving
//   or at the farm (the owner marks it in admin).
// Or one: 'full', the whole price at once instead of the deposit - it
// confirms the booking and pays the other half in the same go.
// Rooms booked together (same group_code) are one payment: one QR for the
// sum, one slip pays for all of them. The amount always comes from the
// bookings in the database, never from the guest.

import { logEvent } from './activityLog.js';
import { ensureStayAccount } from './stayAccount.js';
import { opnConfigured, opnTestMode } from './opn.js';
import { satang, slipokConfigured } from './slipok.js';

// Shows the "PassPay" test button that marks a payment as paid without real
// money. On unless PAYMENT_TEST_MODE=false - turn it off before going live.
export const PAYMENT_TEST_MODE = process.env.PAYMENT_TEST_MODE !== 'false';

// Where the money goes: a 10-digit phone number, 13-digit citizen/tax ID or
// 15-digit e-wallet ID. Until it is set, guests see a sample QR.
const PROMPTPAY_ID = String(process.env.PROMPTPAY_ID ?? '').replace(/\D/g, '');
const PROMPTPAY_OK = [10, 13, 15].includes(PROMPTPAY_ID.length);
// The account name the guest's bank app shows, printed under the QR so they
// can check it before paying.
const PROMPTPAY_NAME = String(process.env.PROMPTPAY_NAME ?? '').trim().slice(0, 80);

export const KINDS = ['deposit', 'balance', 'full'];

// Whether a kind of payment confirms the booking (the first payment).
export const confirms = (kind) => kind !== 'balance';

// What the payment panel needs to know, sent with the guest's bookings.
// qr_pay 'opn': the QR comes from Opn and the payment is confirmed by itself
// (no slip); otherwise the PromptPay QR and a slip.
export const paymentOptions = () => ({
  qr_pay: opnConfigured() ? 'opn' : null,
  test_pay: PAYMENT_TEST_MODE,
  slip_pay: true,
  slip_check: slipokConfigured() ? 'auto' : 'manual',
  promptpay: PROMPTPAY_OK ? PROMPTPAY_ID : null,
  promptpay_name: PROMPTPAY_OK ? PROMPTPAY_NAME || null : null,
});

// The admin's go-live checklist.
export const paymentSetup = () => ({
  promptpay: PROMPTPAY_OK,
  promptpay_name: PROMPTPAY_NAME || null,
  slipok: slipokConfigured(),
  opn: opnMode(),
  test_pay: PAYMENT_TEST_MODE,
});

function opnMode() {
  if (!opnConfigured()) return null;
  return opnTestMode() ? 'test' : 'live';
}

// Whether one booking still owes this kind of payment.
const owes = (b, kind) =>
  confirms(kind)
    ? b.status === 'pending'
    : b.status === 'confirmed' && !b.balance_paid_at && satang(b.total) > satang(b.deposit);

const SHARES = {
  deposit: (b) => satang(b.deposit),
  balance: (b) => satang(b.total) - satang(b.deposit),
  full: (b) => satang(b.total),
};
const share = (b, kind) => SHARES[kind](b);

// The bookings one payment covers: the booking itself plus the rooms booked
// with it. Returns
//   { target, due, amount, code }  - due: the bookings this payment pays for
//   { error: 'NOT_FOUND' | 'NOT_DUE' }
// `userId` limits it to that member's own bookings (admin passes null).
// `lock` locks the rows (call inside a transaction).
export async function paymentScope(db, bookingId, { kind, userId = null, lock = false }) {
  const { rows } = await db.query(
    `SELECT b.id, b.status, b.code, b.group_code, b.user_id, b.room_id, b.total, b.deposit,
            b.balance_paid_at, b.created_at, b.guest_name, r.name AS room_name,
            to_char(b.booked_for AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_in,
            to_char(b.booked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_out
     FROM bookings b
     LEFT JOIN rooms r ON r.id = b.room_id
     WHERE b.room_id IS NOT NULL
       AND b.id IN (
         SELECT g.id FROM bookings g, bookings t
         WHERE t.id = $1
           AND (g.id = t.id OR (t.group_code IS NOT NULL AND g.group_code = t.group_code))
           AND g.user_id IS NOT DISTINCT FROM t.user_id)
       AND ($2::int IS NULL OR b.user_id = $2)
     ORDER BY b.id
     ${lock ? 'FOR UPDATE OF b' : ''}`,
    [bookingId, userId]
  );
  const target = rows.find((b) => b.id === Number(bookingId));
  if (!target) return { error: 'NOT_FOUND' };
  if (!owes(target, kind)) return { error: 'NOT_DUE', target };
  const due = rows.filter((b) => owes(b, kind));
  const amount = due.reduce((sum, b) => sum + share(b, kind), 0) / 100;
  return { target, due, amount, code: target.group_code ?? target.code };
}

// Marks a payment as paid, inside the caller's transaction.
// - deposit: the bookings become 'confirmed' and each gets its room
//   dashboard login. Returns { [bookingId]: { stay_username, stay_password } }.
// - balance: the other half is recorded as paid (`method` online | at_farm).
// - full: both of the above.
export async function settlePayment(client, ids, kind, method = 'online') {
  let stays = {};
  if (confirms(kind)) {
    await client.query("UPDATE bookings SET status = 'confirmed' WHERE id = ANY($1) AND status = 'pending'", [ids]);
    for (const id of ids) stays[id] = await ensureStayAccount(client, id);
    if (kind === 'deposit') return stays;
  }
  await client.query(
    'UPDATE bookings SET balance_paid_at = now(), balance_method = $2 WHERE id = ANY($1) AND balance_paid_at IS NULL',
    [ids, method]
  );
  return stays;
}

// Writes a finished payment to the activity log: one "confirmed" entry per
// room for a deposit (with its room login), one entry for a balance; a full
// payment writes both.
export async function logPayment(actor, scope, kind, stays, { paidWith, slipFile, method = 'online' }) {
  if (confirms(kind)) {
    for (const b of scope.due) {
      await logEvent('booking.confirmed', {
        actor,
        bookingId: b.id,
        details: {
          code: b.code,
          group: b.group_code ?? undefined,
          room: b.room_name,
          guest: b.guest_name,
          check_in: b.check_in,
          check_out: b.check_out,
          paid_with: paidWith,
          deposit: b.deposit,
          paid_in_full: kind === 'full' ? b.total : undefined,
          paid_together: scope.due.length > 1 ? scope.amount : undefined,
          slip: slipFile,
          room_username: stays[b.id]?.stay_username,
          room_password: stays[b.id]?.stay_password,
        },
      });
    }
    if (kind === 'deposit') return;
  }
  await logEvent('booking.balance_paid', {
    actor,
    bookingId: scope.target.id,
    details: {
      code: scope.code,
      rooms: scope.due.map((b) => b.room_name).join(', '),
      guest: scope.target.guest_name,
      amount: scope.amount,
      method,
      paid_with: paidWith,
      slip: slipFile,
    },
  });
}

// Records one slip upload (passed or not) for the owner to look at later.
export async function recordSlip(db, { scope, kind, userId, status, reason, slip, slipFile, raw }) {
  const transAt = slip?.transTimestamp ? new Date(slip.transTimestamp) : null;
  const { rows } = await db.query(
    `INSERT INTO slip_payments
       (booking_id, booking_ids, kind, user_id, status, reason, trans_ref, amount, expected, sending_bank,
        sender_name, receiver_name, trans_at, slip_file, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      scope.target.id,
      scope.due.map((b) => b.id),
      kind,
      userId,
      status,
      reason ?? null,
      slip?.transRef || null,
      slip?.amount ?? null,
      scope.amount,
      slip?.sendingBank || null,
      slip?.sender?.displayName || slip?.sender?.name || null,
      slip?.receiver?.displayName || slip?.receiver?.name || null,
      transAt && !Number.isNaN(transAt.getTime()) ? transAt : null,
      slipFile,
      raw ? JSON.stringify(raw) : null,
    ]
  );
  return rows[0].id;
}

// SQL for the guest's view of a booking's payments (`b` = the booking row):
// what is still owed for it and the rooms booked with it, and the latest
// slip of each kind.
export const PAYMENT_COLUMNS = `
  b.balance_paid_at, b.balance_method,
  CASE WHEN b.room_id IS NOT NULL THEN (
    SELECT sum(g.deposit) FROM bookings g
    WHERE g.status = 'pending' AND g.user_id IS NOT DISTINCT FROM b.user_id
      AND (g.id = b.id OR g.group_code = b.group_code)) END AS deposit_due,
  CASE WHEN b.room_id IS NOT NULL THEN (
    SELECT sum(g.total) FROM bookings g
    WHERE g.status = 'pending' AND g.user_id IS NOT DISTINCT FROM b.user_id
      AND (g.id = b.id OR g.group_code = b.group_code)) END AS full_due,
  CASE WHEN b.room_id IS NOT NULL THEN (
    SELECT sum(g.total - g.deposit) FROM bookings g
    WHERE g.status = 'confirmed' AND g.balance_paid_at IS NULL AND g.total > g.deposit
      AND g.user_id IS NOT DISTINCT FROM b.user_id
      AND (g.id = b.id OR g.group_code = b.group_code)) END AS balance_due,
  (SELECT x.status FROM slip_payments x WHERE b.id = ANY(x.booking_ids) AND x.kind IN ('deposit', 'full')
    ORDER BY x.created_at DESC LIMIT 1) AS slip_status,
  (SELECT x.reason FROM slip_payments x WHERE b.id = ANY(x.booking_ids) AND x.kind IN ('deposit', 'full')
    ORDER BY x.created_at DESC LIMIT 1) AS slip_reason,
  (SELECT x.status FROM slip_payments x WHERE b.id = ANY(x.booking_ids) AND x.kind = 'balance'
    ORDER BY x.created_at DESC LIMIT 1) AS balance_slip_status,
  (SELECT x.reason FROM slip_payments x WHERE b.id = ANY(x.booking_ids) AND x.kind = 'balance'
    ORDER BY x.created_at DESC LIMIT 1) AS balance_slip_reason`;
