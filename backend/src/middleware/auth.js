import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

// Admins are configured by email in ADMIN_EMAILS (comma-separated) rather
// than in the database, so granting/revoking admin is an env change that
// can't be done from inside the app itself.
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isAdminEmail(email) {
  return adminEmails.has(String(email).toLowerCase());
}

// Express middleware that verifies the Bearer JWT on the request, loads the
// matching user from the database, rejects expired accounts, and attaches
// the user to req.user for downstream route handlers to use.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(
      'SELECT id, email, account_expires_at FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.account_expires_at && new Date(user.account_expires_at) < new Date()) {
      return res.status(403).json({ error: 'Account expired' });
    }

    req.user = { ...user, is_admin: isAdminEmail(user.email) };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Must run after requireAuth: lets the request through only for users
// listed in ADMIN_EMAILS.
export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
