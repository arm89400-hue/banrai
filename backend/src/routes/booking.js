import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const bookingRouter = Router();

// Lists the signed-in user's own bookings - rooms and activities both -
// soonest first. Exactly one of activity_name/room_name is set per row;
// booked_until is only set for room stays (see POST / below).
bookingRouter.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.activity_id, b.room_id, b.booked_for, b.booked_until, b.created_at,
            a.name AS activity_name, r.name AS room_name
     FROM bookings b
     LEFT JOIN activities a ON a.id = b.activity_id
     LEFT JOIN rooms r ON r.id = b.room_id
     WHERE b.user_id = $1
     ORDER BY b.booked_for`,
    [req.user.id]
  );
  res.json({ bookings: rows });
});

// Creates a new booking for the signed-in user - either a room stay
// (room_id + booked_for/booked_until check-in/check-out) or an activity
// slot (activity_id + booked_for), never both, matching the
// bookings_exactly_one_target check constraint in the database.
bookingRouter.post('/', requireAuth, async (req, res) => {
  const { activity_id, room_id, booked_for, booked_until } = req.body;

  if (!booked_for || !(activity_id || room_id) || (activity_id && room_id)) {
    return res
      .status(400)
      .json({ error: 'booked_for and exactly one of activity_id/room_id are required' });
  }
  if (activity_id && booked_until) {
    return res.status(400).json({ error: 'booked_until only applies to room bookings' });
  }
  if (room_id) {
    if (!booked_until) {
      return res
        .status(400)
        .json({ error: 'booked_until (check-out) is required when booking a room' });
    }
    if (new Date(booked_until) <= new Date(booked_for)) {
      return res.status(400).json({ error: 'booked_until must be after booked_for' });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (user_id, activity_id, room_id, booked_for, booked_until)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, activity_id, room_id, booked_for, booked_until, created_at`,
      [req.user.id, activity_id ?? null, room_id ?? null, booked_for, room_id ? booked_until : null]
    );
    res.status(201).json({ booking: rows[0] });
  } catch (err) {
    // Postgres foreign-key violation - the given activity_id/room_id
    // doesn't exist.
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Room or activity not found' });
    }
    // Postgres exclusion-constraint violation - bookings_room_no_overlap
    // caught a scheduling clash with an existing room booking (including a
    // race against a second request that landed first).
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Room is already booked for those dates' });
    }
    throw err;
  }
});
