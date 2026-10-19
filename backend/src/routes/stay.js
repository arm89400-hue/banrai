import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { photosJson } from '../lib/photos.js';

export const stayRouter = Router();

const STAY_COLUMNS = `
  b.id, b.code, b.group_code, b.status, b.booked_for, b.booked_until, b.guests, b.extra_guests, b.pets,
  b.guest_name, b.requests, b.note, b.total, b.deposit, b.balance_paid_at,
  r.id AS room_id, r.name AS room_name, r.description AS room_description,
  r.capacity AS room_capacity, r.image_url AS room_image_url,
  ${photosJson('room_id', 'r.id')} AS room_photos`;

const NOT_CHECKED_OUT = "b.booked_until + interval '5 hours' > now()";

stayRouter.get('/', requireAuth, async (req, res, next) => {
  if (req.user.is_admin) {
    return res.status(403).json({ error: 'This page is for guests', reason: 'ADMIN_ACCOUNT' });
  }
  try {
    const { rows } = req.user.is_stay
      ? await pool.query(
          `SELECT ${STAY_COLUMNS} FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1`,
          [req.user.stay_booking_id]
        )
      : await pool.query(
          `WITH lead AS (
             SELECT b.id, b.code, b.group_code FROM bookings b
             WHERE b.user_id = $1 AND b.room_id IS NOT NULL AND b.status = 'confirmed' AND ${NOT_CHECKED_OUT}
             ORDER BY b.booked_for, b.id LIMIT 1)
           SELECT ${STAY_COLUMNS} FROM bookings b JOIN rooms r ON r.id = b.room_id, lead
           WHERE b.user_id = $1 AND b.status = 'confirmed'
             AND (b.id = lead.id OR b.group_code = COALESCE(lead.group_code, lead.code))
           ORDER BY b.id`,
          [req.user.id]
        );
    if (!rows[0]) return res.json({ stay: null, rooms: [] });
    const balance = rows
      .filter((b) => !b.balance_paid_at && b.total != null)
      .reduce((sum, b) => sum + Math.max(0, Number(b.total) - Number(b.deposit)), 0);
    res.json({
      stay: { ...rows[0], balance_due: balance, expires_at: req.user.account_expires_at ?? null },
      rooms: rows,
    });
  } catch (err) {
    next(err);
  }
});
