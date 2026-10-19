import { Router } from 'express';
import { pool } from '../db/pool.js';
import { PRICING } from '../lib/pricing.js';
import { photosJson } from '../lib/photos.js';

export const roomRouter = Router();

const ROOM_COLUMNS = `id, name, description, price, capacity, max_extra_guests, image_url,
  ${photosJson('room_id', 'rooms.id')} AS photos`;

roomRouter.get('/', async (req, res) => {
  const { checkIn, checkOut } = req.query;

  if (!checkIn || !checkOut) {
    const { rows } = await pool.query(
      `SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY name`
    );
    return res.json({ rooms: rows, ...PRICING });
  }

  const checkInAt = new Date(`${checkIn}T00:00:00.000Z`);
  const checkOutAt = new Date(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(checkInAt.getTime()) || Number.isNaN(checkOutAt.getTime())) {
    return res.status(400).json({ error: 'checkIn/checkOut must be valid dates' });
  }
  if (checkOutAt <= checkInAt) {
    return res.status(400).json({ error: 'checkOut must be after checkIn' });
  }

  const { rows } = await pool.query(
    `SELECT ${ROOM_COLUMNS}
     FROM rooms
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings b
       WHERE b.room_id = rooms.id
         AND b.status <> 'cancelled'
         AND tstzrange(b.booked_for, b.booked_until, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
     )
     ORDER BY name`,
    [checkInAt.toISOString(), checkOutAt.toISOString()]
  );
  res.json({ rooms: rows, ...PRICING });
});

roomRouter.get('/:id/booked', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT to_char(booked_for AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_in,
              to_char(booked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS check_out
       FROM bookings
       WHERE room_id = $1 AND status <> 'cancelled' AND booked_until > now() - interval '1 day'
       ORDER BY booked_for`,
      [req.params.id]
    );
    res.json({ booked: rows });
  } catch (err) {
    next(err);
  }
});

roomRouter.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const { rows } = await pool.query(
    `SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ room: rows[0], ...PRICING });
});
