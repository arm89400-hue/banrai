import { Router } from 'express';
import { pool } from '../db/pool.js';
import { PRICING } from '../lib/pricing.js';

export const roomRouter = Router();

// Lists rooms, alphabetically - feeds the Home page's "Available Rooms"
// section. Public - no auth required. With ?checkIn=&checkOut= (ISO
// dates/timestamps), excludes rooms that already have an overlapping
// booking for that range, so only genuinely available rooms come back.
// Without both, returns every room (e.g. before a search is made).
roomRouter.get('/', async (req, res) => {
  const { checkIn, checkOut } = req.query;

  if (!checkIn || !checkOut) {
    const { rows } = await pool.query(
      'SELECT id, name, description, price, capacity, max_extra_guests, image_url FROM rooms ORDER BY name'
    );
    return res.json({ rooms: rows, ...PRICING });
  }

  // checkIn/checkOut arrive as bare "YYYY-MM-DD" dates from the date
  // picker - anchor them to UTC midnight explicitly instead of letting the
  // ::timestamptz cast fall back to the database session's timezone,
  // which would silently disagree with how POST /api/bookings below
  // stores booked_for/booked_until (also explicit UTC).
  const checkInAt = new Date(`${checkIn}T00:00:00.000Z`);
  const checkOutAt = new Date(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(checkInAt.getTime()) || Number.isNaN(checkOutAt.getTime())) {
    return res.status(400).json({ error: 'checkIn/checkOut must be valid dates' });
  }
  if (checkOutAt <= checkInAt) {
    return res.status(400).json({ error: 'checkOut must be after checkIn' });
  }

  const { rows } = await pool.query(
    `SELECT id, name, description, price, capacity, max_extra_guests, image_url
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

// Lists the date ranges a room is already taken for (today onwards), as
// bare "YYYY-MM-DD" check-in/check-out pairs, so the booking calendar can
// cross those nights out. Cancelled bookings don't count.
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

// Fetches a single room by id, or 404 if it doesn't exist.
roomRouter.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const { rows } = await pool.query(
    'SELECT id, name, description, price, capacity, max_extra_guests, image_url FROM rooms WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ room: rows[0], ...PRICING });
});
