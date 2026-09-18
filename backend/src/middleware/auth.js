import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

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

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
