import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { photosJson, removeUploads } from '../lib/photos.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const PUBLIC_COLUMNS = `id, title, title_th, body, body_th, audience, starts_at, ends_at,
  ${photosJson('announcement_id', 'announcements.id')} AS photos`;
const SHOWING_NOW = 'active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())';

export const announcementRouter = Router();

announcementRouter.get(
  '/home',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM announcements
       WHERE ${SHOWING_NOW} AND audience IN ('home', 'both')
       ORDER BY starts_at DESC, id DESC`
    );
    res.json({ announcements: rows });
  })
);

announcementRouter.get(
  '/mine',
  requireAuth,
  wrap(async (req, res) => {
    let booked = Boolean(req.user.is_stay);
    if (!booked) {
      const { rows } = await pool.query(
        `SELECT 1 FROM bookings
         WHERE user_id = $1 AND status <> 'cancelled'
           AND coalesce(booked_until, booked_for) > now() - interval '1 day'
         LIMIT 1`,
        [req.user.id]
      );
      booked = rows.length > 0;
    }
    if (!booked) return res.json({ announcements: [] });
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM announcements
       WHERE ${SHOWING_NOW} AND audience IN ('booked', 'both')
       ORDER BY starts_at DESC, id DESC`
    );
    res.json({ announcements: rows });
  })
);

export const adminAnnouncementRouter = Router();
adminAnnouncementRouter.use(requireAuth, requireAdmin);

const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, active, created_at`;
const AUDIENCES = ['home', 'booked', 'both'];

function readBody(body) {
  const text = (key, max) => String(body[key] ?? '').trim().slice(0, max) || null;
  const values = {
    title: text('title', 120),
    title_th: text('title_th', 120),
    body: text('body', 2000),
    body_th: text('body_th', 2000),
    audience: AUDIENCES.includes(body.audience) ? body.audience : null,
    starts_at: body.starts_at ? new Date(body.starts_at) : new Date(),
    ends_at: body.ends_at ? new Date(body.ends_at) : null,
    active: body.active !== false,
  };
  if (!values.title && !values.title_th) return { error: 'Give the announcement a title (English or Thai)' };
  if (!values.audience) return { error: 'Choose who sees it' };
  if (Number.isNaN(values.starts_at.getTime())) return { error: 'The start time is not a valid date' };
  if (values.ends_at && Number.isNaN(values.ends_at.getTime())) return { error: 'The end time is not a valid date' };
  if (values.ends_at && values.ends_at <= values.starts_at) return { error: 'The end must be after the start' };
  return { values };
}

const valid = (id) => /^\d+$/.test(String(id));

adminAnnouncementRouter.get(
  '/',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(`SELECT ${ADMIN_COLUMNS} FROM announcements ORDER BY starts_at DESC, id DESC`);
    res.json({ announcements: rows });
  })
);

adminAnnouncementRouter.post(
  '/',
  wrap(async (req, res) => {
    const { error, values: v } = readBody(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO announcements (title, title_th, body, body_th, audience, starts_at, ends_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${ADMIN_COLUMNS}`,
      [v.title, v.title_th, v.body, v.body_th, v.audience, v.starts_at, v.ends_at, v.active]
    );
    res.status(201).json({ announcement: rows[0] });
  })
);

adminAnnouncementRouter.put(
  '/:id',
  wrap(async (req, res) => {
    if (!valid(req.params.id)) return res.status(404).json({ error: 'Announcement not found' });
    const { error, values: v } = readBody(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE announcements
       SET title = $1, title_th = $2, body = $3, body_th = $4, audience = $5, starts_at = $6, ends_at = $7, active = $8
       WHERE id = $9
       RETURNING ${ADMIN_COLUMNS}`,
      [v.title, v.title_th, v.body, v.body_th, v.audience, v.starts_at, v.ends_at, v.active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ announcement: rows[0] });
  })
);

adminAnnouncementRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    if (!valid(req.params.id)) return res.status(404).json({ error: 'Announcement not found' });
    const files = (await pool.query('SELECT file FROM photos WHERE announcement_id = $1', [req.params.id])).rows;
    const { rowCount } = await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Announcement not found' });
    await removeUploads(files.map((r) => r.file));
    res.json({ ok: true });
  })
);
