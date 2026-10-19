import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const chatRouter = Router();

chatRouter.use(requireAuth);

chatRouter.use((req, res, next) => {
  if (req.user.is_admin) {
    return res.status(403).json({ error: 'Admins chat from the admin dashboard', reason: 'ADMIN_ACCOUNT' });
  }
  next(); 
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export const MAX_CHAT_LENGTH = 2000;
export const CHAT_COLUMNS = 'id, from_admin, body, created_at, read_at';

export function readChatBody(body) {
  const text = String(body?.body ?? '').trim();
  return text && text.length <= MAX_CHAT_LENGTH ? text : null;
}

chatRouter.get(
  '/',
  wrap(async (req, res) => {
    await pool.query(
      'UPDATE chat_messages SET read_at = now() WHERE user_id = $1 AND from_admin AND read_at IS NULL',
      [req.user.id]
    );
    const { rows } = await pool.query(
      `SELECT ${CHAT_COLUMNS} FROM chat_messages WHERE user_id = $1 ORDER BY id`,
      [req.user.id]
    );
    res.json({ messages: rows });
  })
);

chatRouter.get(
  '/unread',
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS unread FROM chat_messages WHERE user_id = $1 AND from_admin AND read_at IS NULL',
      [req.user.id]
    );
    res.json(rows[0]);
  })
);

chatRouter.post(
  '/',
  wrap(async (req, res) => {
    const body = readChatBody(req.body);
    if (!body) {
      return res.status(400).json({ error: `Message must be 1-${MAX_CHAT_LENGTH} characters` });
    }
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, false, $2)
       RETURNING ${CHAT_COLUMNS}`,
      [req.user.id, body]
    );
    res.status(201).json({ message: rows[0] });
  })
);
