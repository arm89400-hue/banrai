import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Stay accounts are the temporary logins for a confirmed room booking's
// guest dashboard. See db/migrations/005_stay_accounts.sql.

// No 0/O/1/I, so codes are easy to read out and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// Check-out is 12:00 Thailand time (UTC+7). booked_until is stored as UTC
// midnight of the check-out date, so the stay ends 5 hours after it.
const CHECKOUT_OFFSET = "interval '5 hours'";

// Creates the room login for a confirmed room booking, if it doesn't have
// one yet: username = the booking code, a random 8-character password, and
// an expiry at check-out. Must be called inside a transaction on `client`.
// Returns the booking's { stay_username, stay_password }.
export async function ensureStayAccount(client, bookingId) {
  const booking = (
    await client.query(
      'SELECT id, code, room_id, stay_username, stay_password FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    )
  ).rows[0];
  if (!booking || !booking.room_id) return null; // activities have no room dashboard
  if (booking.stay_username) {
    return { stay_username: booking.stay_username, stay_password: booking.stay_password };
  }

  // Older bookings (made before codes existed) get one now.
  const username = booking.code ?? `BR-${randomCode(6)}`;
  const password = randomCode(8);
  const passwordHash = await bcrypt.hash(password, 10);

  await client.query(
    `INSERT INTO users (email, password_hash, stay_booking_id, account_expires_at)
     SELECT $1, $2, b.id, b.booked_until + ${CHECKOUT_OFFSET}
     FROM bookings b WHERE b.id = $3`,
    [username, passwordHash, bookingId]
  );
  await client.query(
    'UPDATE bookings SET code = $1, stay_username = $1, stay_password = $2 WHERE id = $3',
    [username, password, bookingId]
  );
  return { stay_username: username, stay_password: password };
}

// Removes a booking's room login (when the booking stops being confirmed),
// so it can no longer sign in. Must be called inside a transaction.
export async function removeStayAccount(client, bookingId) {
  await client.query('DELETE FROM users WHERE stay_booking_id = $1', [bookingId]);
  await client.query(
    'UPDATE bookings SET stay_username = NULL, stay_password = NULL WHERE id = $1',
    [bookingId]
  );
}
