import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireMember } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';
import { KINDS, confirms, logPayment, paymentScope, settlePayment } from '../lib/payments.js';
import { createPromptPay, getCharge, opnConfigured } from '../lib/opn.js';
import { satang } from '../lib/slipok.js';
import { paidResponse } from './booking.js';

// Paying by PromptPay QR through Opn (lib/opn.js): no slip, the guest scans
// and waits.
//   POST /api/pay/:bookingId/qr?kind=deposit|full|balance  -> a QR for what is due
//   GET  /api/pay/charges/:chargeId                         -> paid yet? (the page asks every few seconds)
//   POST /api/pay/opn-webhook                                -> Opn says a charge finished
// The amount always comes from the bookings in the database. A charge is
// recorded on the bookings once only (opn_charges.settled_at).
export const opnRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const kindOf = (req) => (KINDS.includes(req.query.kind) ? req.query.kind : 'deposit');

// Records a paid charge on its bookings, once. Returns true when the
// bookings were updated now or before.
async function settleCharge(chargeId, actor) {
  const client = await pool.connect();
  let row;
  let scope;
  let stays;
  try {
    await client.query('BEGIN');
    row = (await client.query('SELECT * FROM opn_charges WHERE id = $1 FOR UPDATE', [chargeId])).rows[0];
    if (!row || row.settled_at) {
      await client.query('ROLLBACK');
      return Boolean(row);
    }
    scope = await paymentScope(client, row.booking_id, { kind: row.kind, lock: true });
    // Paid, but nothing (or a different amount) is owed any more - paid
    // twice, cancelled or re-priced meanwhile. Kept for the owner to sort out.
    if (scope.error || satang(scope.amount) !== satang(row.amount)) {
      await client.query("UPDATE opn_charges SET status = 'successful', settled_at = now() WHERE id = $1", [chargeId]);
      await client.query('COMMIT');
      await logEvent('payment.unmatched', {
        actor,
        bookingId: row.booking_id,
        details: { charge: chargeId, amount: row.amount, payment: row.kind, owed: scope.error ? 0 : scope.amount },
      });
      return false;
    }
    stays = await settlePayment(client, scope.due.map((b) => b.id), row.kind, 'online');
    await client.query("UPDATE opn_charges SET status = 'successful', settled_at = now() WHERE id = $1", [chargeId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await logPayment(actor, scope, row.kind, stays, { paidWith: `PromptPay QR (Opn) ${chargeId}` });
  return true;
}

// Asks Opn about a charge, stores its status and records it if paid.
async function refreshCharge(chargeId, actor) {
  const charge = await getCharge(chargeId);
  await pool.query('UPDATE opn_charges SET status = $2 WHERE id = $1 AND settled_at IS NULL', [chargeId, charge.status]);
  if (charge.status === 'successful') await settleCharge(chargeId, actor);
  return charge.status;
}

// A QR for what is due on one of the member's own room bookings (and the
// rooms booked with it). An unpaid QR for the same payment and amount that
// is still good for a few minutes is shown again instead of a new one.
opnRouter.post(
  '/:id/qr',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    if (!opnConfigured()) return res.status(409).json({ error: 'QR payments are not set up', reason: 'QR_NOT_CONFIGURED' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const kind = kindOf(req);
    const scope = await paymentScope(pool, req.params.id, { kind, userId: req.user.id });
    if (scope.error === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (scope.error) {
      const reason = confirms(kind) ? 'NOT_PENDING' : 'BALANCE_NOT_DUE';
      return res.status(409).json({ error: 'Nothing is waiting to be paid', reason });
    }
    const ids = scope.due.map((b) => b.id);

    const open = (
      await pool.query(
        `SELECT id, amount, qr_uri, expires_at FROM opn_charges
         WHERE booking_ids && $1::int[] AND kind = $2 AND amount = $3 AND user_id = $4
           AND status = 'pending' AND settled_at IS NULL AND expires_at > now() + interval '5 minutes'
         ORDER BY created_at DESC LIMIT 1`,
        [ids, kind, scope.amount, req.user.id]
      )
    ).rows[0];
    if (open) return res.json({ charge: open.id, qr: open.qr_uri, amount: Number(open.amount), expires_at: open.expires_at });

    let charge;
    try {
      charge = await createPromptPay(scope.amount, { booking: scope.code, payment: kind });
    } catch (err) {
      console.error(err.message);
      return res.status(502).json({ error: 'Could not make the QR code - try again in a moment', reason: 'QR_SERVICE' });
    }
    await pool.query(
      `INSERT INTO opn_charges (id, booking_id, booking_ids, kind, user_id, amount, status, qr_uri, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [charge.id, scope.target.id, ids, kind, req.user.id, scope.amount, charge.status, charge.qr, charge.expiresAt]
    );
    res.status(201).json({ charge: charge.id, qr: charge.qr, amount: scope.amount, expires_at: charge.expiresAt });
  })
);

// Paid yet? The page asks every few seconds while the guest waits.
// { status: 'pending' | 'successful' | 'failed' | 'expired', bookings? }
opnRouter.get(
  '/charges/:chargeId',
  requireAuth,
  requireMember,
  wrap(async (req, res) => {
    const row = (
      await pool.query('SELECT id, booking_id, status, settled_at FROM opn_charges WHERE id = $1 AND user_id = $2', [
        req.params.chargeId,
        req.user.id,
      ])
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'Payment not found' });

    let status = row.status;
    if (!row.settled_at && status === 'pending') {
      try {
        status = await refreshCharge(row.id, req.user.email);
      } catch (err) {
        // Opn didn't answer this time; the page simply asks again.
        console.error(err.message);
      }
    }
    if (status === 'successful') return res.json({ status, ...(await paidResponse(row.booking_id)) });
    res.json({ status });
  })
);

// Opn's webhook (set it in the Opn dashboard to https://<site>/api/pay/opn-webhook).
// The message itself is not trusted: the charge is fetched from Opn with
// the secret key before anything is recorded.
opnRouter.post(
  '/opn-webhook',
  wrap(async (req, res) => {
    const id = req.body?.data?.id;
    if (req.body?.key === 'charge.complete' && typeof id === 'string' && id.startsWith('chrg_')) {
      const known = (await pool.query('SELECT 1 FROM opn_charges WHERE id = $1', [id])).rowCount;
      if (known) await refreshCharge(id, 'Opn').catch((err) => console.error(err.message));
    }
    res.json({ ok: true });
  })
);
