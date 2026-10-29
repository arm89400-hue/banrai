import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const CHECKOUT_OFFSET = "interval '5 hours'";

export async function ensureStayAccount(client, bookingId) {
  const booking = (
    await client.query(
      'SELECT id, code, room_id, stay_username, stay_password FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    )
  ).rows[0];
  if (!booking || !booking.room_id) return null;
  if (booking.stay_username) {
    return { stay_username: booking.stay_username, stay_password: booking.stay_password };
  }

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

export async function removeStayAccount(client, bookingId) {
  await client.query('DELETE FROM users WHERE stay_booking_id = $1', [bookingId]);
  await client.query(
    'UPDATE bookings SET stay_username = NULL, stay_password = NULL WHERE id = $1',
    [bookingId]
  );
}
