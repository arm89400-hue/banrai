import express, { Router } from 'express';
import { MAX_UPLOAD_BYTES, imageExtension, saveUpload } from '../lib/photos.js';
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
export const CHAT_COLUMNS = 'id, from_admin, body, image, created_at, read_at';

export function readChatBody(body) {
  const text = String(body?.body ?? '').trim();
  return text && text.length <= MAX_CHAT_LENGTH ? text : null;
}

// A photo sent in chat: the raw image is the request body, an optional
// caption comes as ?text=. Shared by the guest and admin routes.
export const chatImageUpload = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
export async function saveChatImage(req, res) {
  const ext = imageExtension(req.body);
  if (!ext) {
    res.status(400).json({ error: 'Only JPEG, PNG or WebP photos can be sent', reason: 'BAD_IMAGE' });
    return null;
  }
  const caption = String(req.query.text ?? '').trim().slice(0, MAX_CHAT_LENGTH);
  const file = await saveUpload(req.body, ext, 'chat');
  return { file, caption };
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

chatRouter.post(
  '/image',
  chatImageUpload,
  wrap(async (req, res) => {
    const saved = await saveChatImage(req, res);
    if (!saved) return;
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (user_id, from_admin, body, image) VALUES ($1, false, $2, $3)
       RETURNING ${CHAT_COLUMNS}`,
      [req.user.id, saved.caption, saved.file]
    );
    res.status(201).json({ message: rows[0] });
  })
);
