import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db/pool.js';
import { isAdminEmail } from '../middleware/auth.js';

export const authRouter = Router();

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

// Builds a signed 7-day JWT identifying the given user id - this is the
// token clients attach as "Authorization: Bearer <token>" on future requests.
function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Creates a new account from an email + password. Rejects if the email is
// already registered (unique constraint violation, Postgres code 23505).
authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, account_expires_at`,
      [email, passwordHash]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

// Verifies an email + password against the stored hash and, on success,
// returns a JWT plus the public user fields.
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT id, email, password_hash, account_expires_at FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({
    token: signToken(user.id),
    user: {
      id: user.id,
      email: user.email,
      account_expires_at: user.account_expires_at,
      is_admin: isAdminEmail(user.email),
    },
  });
});

// Signs in with a Google ID token from the frontend's "Login with Google"
// button. A first-time Google user gets an account created automatically.
authRouter.post('/google', async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }

  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'credential is required' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google credential' });
  }

  if (!payload?.email_verified) {
    return res.status(401).json({ error: 'Google email is not verified' });
  }

  // Google emails are lowercase; match case-insensitively so an account
  // registered with different casing still resolves to the same user.
  let { rows } = await pool.query(
    'SELECT id, email, account_expires_at FROM users WHERE lower(email) = lower($1)',
    [payload.email]
  );
  if (!rows[0]) {
    // First Google sign-in for this email: create the account. It gets an
    // unusable random password, so it can only be reached through Google
    // (until the user registers a password via the normal sign-up).
    const unusablePassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    ({ rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, account_expires_at`,
      [payload.email, unusablePassword]
    ));
  }
  const user = rows[0];

  res.json({ token: signToken(user.id), user: { ...user, is_admin: isAdminEmail(user.email) } });
});
