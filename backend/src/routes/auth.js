import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db/pool.js';
import { USER_COLUMNS, isExpired, publicUser } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';

export const authRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

function logLogin(user, details = {}) {
  const pub = publicUser(user);
  const kind = pub.is_admin ? 'admin' : pub.is_stay ? 'room' : 'member';
  return logEvent(`login.${kind}`, {
    actor: user.email,
    bookingId: pub.stay_booking_id,
    details: pub.is_stay ? details : { member_code: pub.member_code, ...details },
  });
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const password = String(req.body.password ?? '');
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address', reason: 'BAD_EMAIL' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING ${USER_COLUMNS}`,
        [email, passwordHash]
      );
      const created = publicUser(rows[0]);
      await logEvent('member.registered', { actor: created.email, details: { member_code: created.member_code } });
      res.status(201).json({ user: created });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Email already registered', reason: 'EMAIL_TAKEN' });
      }
      throw err;
    }
  })
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const password = String(req.body.password ?? '');
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS}, password_hash FROM users
       WHERE lower(email) = lower($1)
       ORDER BY (email = $1) DESC
       LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res
        .status(401)
        .json({ error: 'Invalid email or password', reason: 'BAD_CREDENTIALS' });
    }
    if (isExpired(user)) {
      await logEvent('login.expired', {
        actor: user.email,
        bookingId: user.stay_booking_id,
        details: { expired_at: user.account_expires_at },
      });
      return res.status(403).json({ error: 'Account expired', reason: 'ACCOUNT_EXPIRED' });
    }

    await logLogin(user);
    res.json({ token: signToken(user.id), user: publicUser(user) });
  })
);

authRouter.post(
  '/google',
  wrap(async (req, res) => {
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

    let { rows } = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [payload.email]
    );
    const isNew = !rows[0];
    if (isNew) {
      const unusablePassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      ({ rows } = await pool.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING ${USER_COLUMNS}`,
        [payload.email, unusablePassword]
      ));
    }
    const user = rows[0];
    if (isExpired(user)) {
      return res.status(403).json({ error: 'Account expired', reason: 'ACCOUNT_EXPIRED' });
    }

    if (isNew) {
      await logEvent('member.registered', {
        actor: user.email,
        details: { member_code: publicUser(user).member_code, via: 'google' },
      });
    }
    await logLogin(user, { via: 'google' });
    res.json({ token: signToken(user.id), user: publicUser(user) });
  })
);
