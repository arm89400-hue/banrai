import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const stayRouter = Router();

// The room dashboard's data, for the stay account that is signed in: its
// own booking and room, nothing else. requireAuth has already refused the
// account if it is past its check-out expiry.
stayRouter.get('/', requireAuth, async (req, res, next) => {
  if (!req.user.is_stay) {
    return res.status(403).json({ error: 'This page is for room accounts', reason: 'NOT_STAY_ACCOUNT' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT b.code, b.status, b.booked_for, b.booked_until, b.guests, b.extra_guests, b.pets, b.guest_name,
              b.requests, b.note, b.total, b.deposit,
              r.id AS room_id, r.name AS room_name, r.description AS room_description,
              r.capacity AS room_capacity, r.image_url AS room_image_url
       FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       WHERE b.id = $1`,
      [req.user.stay_booking_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Booking not found' });
    res.json({ stay: { ...rows[0], expires_at: req.user.account_expires_at } });
  } catch (err) {
    next(err);
  }
});
