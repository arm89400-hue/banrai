import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db/pool.js';
import { USER_COLUMNS, isExpired, publicUser } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';
import { sendMail } from '../lib/mailer.js';

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

// ---- Forgot password ----
// A one-time link is emailed to the account. Only a hash of the token is
// stored, the link works once and for 30 minutes, and the answer never says
// whether an email has an account.
const RESET_MINUTES = 30;
const RESETS_PER_HOUR = 3;
export const MIN_PASSWORD = 8;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');

export function resetEmail(link, lang) {
  const escaped = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const th = {
    subject: 'ตั้งรหัสผ่านใหม่ · บ้านไร่ของพ่อ 344',
    hello: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณที่บ้านไร่ของพ่อ 344',
    button: 'ตั้งรหัสผ่านใหม่',
    expires: `ลิงก์นี้ใช้ได้ครั้งเดียว ภายใน ${RESET_MINUTES} นาที`,
    ignore: 'ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้',
  };
  const en = {
    subject: 'Reset your password · Baanrai 344',
    hello: 'Someone asked to reset the password for your Baanrai 344 account.',
    button: 'Choose a new password',
    expires: `The link works once, within ${RESET_MINUTES} minutes.`,
    ignore: "If it wasn't you, ignore this email. Your password stays the same.",
  };
  const c = lang === 'en' ? en : th;
  const text = `${c.hello}\n\n${c.button}: ${link}\n\n${c.expires}\n${c.ignore}\n`;
  const sign = `${SITE_URL}/images/farm/email-sign.jpg`;
  const font = "font-family:'Noto Sans Thai',Tahoma,Arial,sans-serif";
  // Tables and inline styles: the only layout every mail app agrees on.
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3efe7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe7"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td><img src="${sign}" width="520" alt="บ้านไร่ของพ่อ 344" style="display:block;width:100%;height:auto;border:0"></td></tr>
  <tr><td style="padding:32px 32px 8px;${font};color:#1f2b22">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#1f2b22">${c.subject.split(' · ')[0]}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6">${c.hello}</p>
    <a href="${escaped}" style="display:inline-block;background:#326649;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:16px;font-weight:bold">${c.button}</a>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5c665f">${c.expires}<br>${c.ignore}</p>
  </td></tr>
  <tr><td style="padding:24px 32px 32px;${font};font-size:13px;line-height:1.6;color:#8a918c;border-top:1px solid #eee9df">
    บ้านไร่ของพ่อ 344 · ปากช่อง นครราชสีมา
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject: c.subject, text, html };
}

async function findReset(token) {
  if (!token || typeof token !== 'string') return null;
  const { rows } = await pool.query(
    `SELECT r.id, r.user_id, u.email
       FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

authRouter.post(
  '/forgot',
  wrap(async (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const lang = req.body.lang === 'en' ? 'en' : 'th';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address', reason: 'BAD_EMAIL' });
    }

    const { rows } = await pool.query(
      `SELECT id, email FROM users
        WHERE lower(email) = lower($1) AND stay_booking_id IS NULL
        ORDER BY (email = $1) DESC
        LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (user) {
      const recent = await pool.query(
        `SELECT count(*)::int AS n FROM password_resets
          WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
        [user.id]
      );
      if (recent.rows[0].n < RESETS_PER_HOUR) {
        const token = randomBytes(32).toString('base64url');
        await pool.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + make_interval(mins => $3))`,
          [user.id, hashToken(token), RESET_MINUTES]
        );
        const mail = resetEmail(`${SITE_URL}/reset-password?token=${token}`, lang);
        try {
          await sendMail({ to: user.email, ...mail });
        } catch (err) {
          console.error('reset email failed:', err.message);
        }
        await logEvent('password.reset_requested', { actor: user.email });
      }
    }
    // Same answer either way, so the form can't be used to find accounts.
    res.json({ ok: true });
  })
);

authRouter.get(
  '/reset',
  wrap(async (req, res) => {
    const reset = await findReset(req.query.token);
    if (!reset) return res.status(400).json({ error: 'This link has expired', reason: 'BAD_TOKEN' });
    res.json({ email: maskEmail(reset.email) });
  })
);

authRouter.post(
  '/reset',
  wrap(async (req, res) => {
    const password = String(req.body.password ?? '');
    if (password.length < MIN_PASSWORD) {
      return res
        .status(400)
        .json({ error: `Use at least ${MIN_PASSWORD} characters`, reason: 'WEAK_PASSWORD' });
    }
    const reset = await findReset(req.body.token);
    if (!reset) return res.status(400).json({ error: 'This link has expired', reason: 'BAD_TOKEN' });

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      // Logins made before this moment stop working (see requireAuth).
      const { rows } = await client.query(
        `UPDATE users SET password_hash = $1, password_changed_at = date_trunc('second', now())
          WHERE id = $2
          RETURNING ${USER_COLUMNS}`,
        [passwordHash, reset.user_id]
      );
      user = rows[0];
      await client.query(
        'UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
        [reset.user_id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await logEvent('password.reset', { actor: user.email });
    res.json({ token: signToken(user.id), user: publicUser(user) });
  })
);
