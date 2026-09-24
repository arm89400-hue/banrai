import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const adminRouter = Router();

// Every route below is admin-only.
adminRouter.use(requireAuth, requireAdmin);

// Express 4 doesn't catch rejected promises from async handlers - this
// forwards them to the app's error handler instead of crashing the process.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Headline numbers for the dashboard's Overview tab.
adminRouter.get(
  '/stats',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM rooms)::int AS rooms,
        (SELECT count(*) FROM activities)::int AS activities,
        (SELECT count(*) FROM bookings)::int AS bookings,
        (SELECT count(*) FROM bookings
          WHERE coalesce(booked_until, booked_for) >= now())::int AS upcoming_bookings,
        (SELECT count(*) FROM bookings b JOIN rooms r ON r.id = b.room_id
          WHERE now() >= b.booked_for AND now() < b.booked_until)::int AS rooms_occupied_now,
        (SELECT count(*) FROM contact_messages)::int AS messages,
        (SELECT coalesce(sum(r.price * greatest(1, extract(day FROM b.booked_until - b.booked_for))), 0)
          FROM bookings b JOIN rooms r ON r.id = b.room_id
          WHERE b.booked_for >= date_trunc('month', now())
            AND b.booked_for < date_trunc('month', now()) + interval '1 month'
        )::float AS room_revenue_this_month
    `);
    res.json({ stats: rows[0] });
  })
);

// Every booking (rooms and activities) with who made it, newest stay first.
adminRouter.get(
  '/bookings',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT b.id, b.room_id, b.activity_id, b.booked_for, b.booked_until, b.created_at,
              u.email AS user_email, r.name AS room_name, r.price AS room_price,
              a.name AS activity_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN activities a ON a.id = b.activity_id
       ORDER BY b.booked_for DESC`
    );
    res.json({ bookings: rows });
  })
);

// Cancels (deletes) a booking, freeing the room for those dates again.
adminRouter.delete(
  '/bookings/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Booking not found' });
    res.json({ ok: true });
  })
);

// Accounts with how many bookings each has made. Never returns password hashes.
adminRouter.get(
  '/users',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.created_at, u.account_expires_at,
              count(b.id)::int AS booking_count
       FROM users u
       LEFT JOIN bookings b ON b.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: rows });
  })
);

// Messages sent from the public Contact page, newest first.
adminRouter.get(
  '/messages',
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC'
    );
    res.json({ messages: rows });
  })
);

adminRouter.delete(
  '/messages/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  })
);

// ---- Rooms & activities: create / edit / delete ----

// Validates and normalizes the editable fields shared by rooms and
// activities. Returns { error } or { values }.
function readListingBody(body, { withRoomFields }) {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const price = Number(body.price);
  if (!name) return { error: 'name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'price must be 0 or more' };
  if (!withRoomFields) return { values: { name, description, price } };

  const capacity =
    body.capacity === '' || body.capacity == null ? null : Number.parseInt(body.capacity, 10);
  if (capacity !== null && !(capacity > 0)) return { error: 'capacity must be 1 or more' };
  const image_url = String(body.image_url ?? '').trim() || null;
  return { values: { name, description, price, capacity, image_url } };
}

adminRouter.post(
  '/rooms',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: true });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO rooms (name, description, price, capacity, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, price, capacity, image_url`,
      [v.name, v.description, v.price, v.capacity, v.image_url]
    );
    res.status(201).json({ room: rows[0] });
  })
);

adminRouter.put(
  '/rooms/:id',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: true });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE rooms SET name = $1, description = $2, price = $3, capacity = $4, image_url = $5
       WHERE id = $6
       RETURNING id, name, description, price, capacity, image_url`,
      [v.name, v.description, v.price, v.capacity, v.image_url, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Room not found' });
    res.json({ room: rows[0] });
  })
);

// Note: deleting a room also deletes its bookings (ON DELETE CASCADE).
adminRouter.delete(
  '/rooms/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Room not found' });
    res.json({ ok: true });
  })
);

adminRouter.post(
  '/activities',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: false });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO activities (name, description, price) VALUES ($1, $2, $3)
       RETURNING id, name, description, price`,
      [v.name, v.description, v.price]
    );
    res.status(201).json({ activity: rows[0] });
  })
);

adminRouter.put(
  '/activities/:id',
  wrap(async (req, res) => {
    const { error, values: v } = readListingBody(req.body, { withRoomFields: false });
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `UPDATE activities SET name = $1, description = $2, price = $3 WHERE id = $4
       RETURNING id, name, description, price`,
      [v.name, v.description, v.price, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
    res.json({ activity: rows[0] });
  })
);

// Note: deleting an activity also deletes its bookings (ON DELETE CASCADE).
adminRouter.delete(
  '/activities/:id',
  wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM activities WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Activity not found' });
    res.json({ ok: true });
  })
);
