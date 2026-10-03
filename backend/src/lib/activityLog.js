import { pool } from '../db/pool.js';

// Writes one row to the admin activity log (see
// db/migrations/006_activity_log.sql). Logging must never break the action
// it records, so failures are only reported to the server console.
//
//   logEvent('booking.confirmed', { actor: admin.email, bookingId, details: { code } })
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
