import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const paymentRouter = Router();

const ACCESS_DAYS = Number(process.env.ACCOUNT_ACCESS_DAYS ?? 30);

// Placeholder for the real okslip integration. Swap this out once
// OKSLIP_API_KEY / OKSLIP_API_URL are available - it should call out to
// okslip and return a redirect/QR/reference the client can act on.
async function createOkslipCharge({ reference, amount }) {
  return {
    provider: 'okslip',
    reference,
    amount,
    status: 'pending',
  };
}

// Placeholder for asking okslip whether a charge actually cleared.
// Swap for a real call to okslip's payment-status API (or verify
// their webhook signature with OKSLIP_WEBHOOK_SECRET) once available -
// this must never just trust the client's say-so.
async function verifyOkslipPayment(reference) {
  return { reference, status: 'paid' };
}

// Starts a charge tied to the logged-in user so it can only ever be
// confirmed against that same account.
paymentRouter.post('/checkout', requireAuth, async (req, res) => {
  const { amount } = req.body;
  if (!amount) {
    return res.status(400).json({ error: 'amount is required' });
  }

  const reference = `okslip_${req.user.id}_${Date.now()}`;
  await pool.query(
    `INSERT INTO payments (user_id, reference, amount, status)
     VALUES ($1, $2, $3, 'pending')`,
    [req.user.id, reference, amount]
  );

  const charge = await createOkslipCharge({ reference, amount });
  res.json({ charge });
});

// Extends account_expires_at only when: the payment reference exists,
// it belongs to the logged-in account (not just whoever calls this),
// and okslip actually verifies it as paid. Applies to that account's
// row (i.e. the login email that made the payment) - never a
// different, currently-logged-in account.
paymentRouter.post('/confirm', requireAuth, async (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ error: 'reference is required' });
  }

  const { rows: paymentRows } = await pool.query(
    'SELECT id, user_id, status FROM payments WHERE reference = $1',
    [reference]
  );
  const payment = paymentRows[0];

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  if (payment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Payment does not belong to this account' });
  }

  if (payment.status === 'paid') {
    const { rows } = await pool.query(
      'SELECT id, email, account_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    return res.json({ user: rows[0] });
  }

  const verification = await verifyOkslipPayment(reference);
  if (verification.status !== 'paid') {
    return res.status(402).json({ error: 'Payment not completed' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1",
      [payment.id]
    );
    const { rows } = await client.query(
      `UPDATE users
       SET account_expires_at = GREATEST(COALESCE(account_expires_at, now()), now())
         + ($2 || ' days')::interval
       WHERE id = $1
       RETURNING id, email, account_expires_at`,
      [payment.user_id, ACCESS_DAYS]
    );
    await client.query('COMMIT');
    res.json({ user: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
