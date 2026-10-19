import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isAdminEmail(email) {
  return adminEmails.has(String(email).toLowerCase());
}

export function memberCode(userId) {
  return `M${String(userId).padStart(5, '0')}`;
}

export function isExpired(user) {
  return Boolean(user.account_expires_at && new Date(user.account_expires_at) < new Date());
}

export const USER_COLUMNS = 'id, email, account_expires_at, stay_booking_id';

export function publicUser(user) {
  const isStay = user.stay_booking_id != null;
  return {
    id: user.id,
    email: user.email,
    member_code: memberCode(user.id),
    account_expires_at: user.account_expires_at,
    stay_booking_id: user.stay_booking_id ?? null,
    is_stay: isStay,
    is_admin: !isStay && isAdminEmail(user.email),
  };
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      payload.sub,
    ]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found', reason: 'SESSION_ENDED' });
    }
    if (isExpired(user)) {
      return res.status(403).json({ error: 'Account expired', reason: 'ACCOUNT_EXPIRED' });
    }

    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', reason: 'SESSION_ENDED' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireMember(req, res, next) {
  if (req.user?.is_stay) {
    return res
      .status(403)
      .json({ error: 'Room accounts cannot do this. Log in with your own account.', reason: 'STAY_ACCOUNT' });
  }
  next();
}
