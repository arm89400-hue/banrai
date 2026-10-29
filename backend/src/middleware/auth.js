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

// The farm owner is always an admin; nobody can take that away.
export const OWNER_EMAIL = 'arm89400@gmail.com';
export const isOwnerEmail = (email) => String(email).toLowerCase() === OWNER_EMAIL;

// users.is_admin is true or false once an admin has set the role on the
// People page. Until then (empty) the ADMIN_EMAILS server setting decides.
export function isAdminUser(user) {
  if (user.stay_booking_id != null) return false;
  if (isOwnerEmail(user.email)) return true;
  return user.is_admin ?? isAdminEmail(user.email);
}

export function memberCode(userId) {
  return `M${String(userId).padStart(5, '0')}`;
}

export function isExpired(user) {
  return Boolean(user.account_expires_at && new Date(user.account_expires_at) < new Date());
}

export const USER_COLUMNS = 'id, email, account_expires_at, stay_booking_id, is_admin';

export function publicUser(user) {
  const isStay = user.stay_booking_id != null;
  return {
    id: user.id,
    email: user.email,
    member_code: memberCode(user.id),
    account_expires_at: user.account_expires_at,
    stay_booking_id: user.stay_booking_id ?? null,
    is_stay: isStay,
    is_admin: isAdminUser(user),
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

    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS}, password_changed_at FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found', reason: 'SESSION_ENDED' });
    }
    // A password reset signs out every login made before it.
    if (user.password_changed_at && payload.iat < Math.floor(new Date(user.password_changed_at) / 1000)) {
      return res.status(401).json({ error: 'Password was changed', reason: 'SESSION_ENDED' });
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
