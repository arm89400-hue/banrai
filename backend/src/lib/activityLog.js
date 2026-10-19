import { pool } from '../db/pool.js';

export async function logEvent(type, { actor = null, bookingId = null, details = {} } = {}) {
  try {
    await pool.query(
      'INSERT INTO activity_log (type, actor, booking_id, details) VALUES ($1, $2, $3, $4)',
      [type, actor, bookingId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('activity log failed:', type, err.message);
  }
}
