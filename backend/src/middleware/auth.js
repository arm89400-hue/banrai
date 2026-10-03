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

// Every account's ID code, shown to the user and to the property: "M00042".
// Derived from the row id, so it never changes and needs no extra column.
export function memberCode(userId) {
  return `M${String(userId).padStart(5, '0')}`;
}

export function isExpired(user) {
  return Boolean(user.account_expires_at && new Date(user.account_expires_at) < new Date());
}

// Columns every auth query needs to build publicUser().
export const USER_COLUMNS = 'id, email, account_expires_at, stay_booking_id';

// The user fields the frontend gets. A "stay account" (stay_booking_id set)
// is the temporary login created for a confirmed room booking - it only
// opens that room's guest dashboard and expires at check-out.
export function publicUser(user) {
  const isStay = user.stay_booking_id != null;
  return {
    id: user.id,
    email: user.email,
    member_code: memberCode(user.id),
    account_expires_at: user.account_expires_at,
    stay_booking_id: user.stay_booking_id ?? null,
    is_stay: isStay,
    // A stay account is never an admin, whatever its username is.
    is_admin: !isStay && isAdminEmail(user.email),
  };
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

    const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      payload.sub,
    ]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (isExpired(user)) {
      return res.status(403).json({ error: 'Account expired', reason: 'ACCOUNT_EXPIRED' });
    }

    req.user = publicUser(user);
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

// Must run after requireAuth: blocks stay accounts, which may only use the
// stay dashboard endpoint.
export function requireMember(req, res, next) {
  if (req.user?.is_stay) {
    return res
      .status(403)
      .json({ error: 'Room accounts cannot do this. Log in with your own account.', reason: 'STAY_ACCOUNT' });
  }
  next();
}
