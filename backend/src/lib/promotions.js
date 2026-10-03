import { pool } from '../db/pool.js';

// Promotions (see db/migrations/011_promotions.sql): a percentage off the
// room rate for stays that check in within the promotion's dates.

export const PROMOTION_COLUMNS = `
  p.id, p.name, p.percent::float AS percent, p.room_id, p.active,
  to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on,
  to_char(p.ends_on, 'YYYY-MM-DD') AS ends_on`;

// Promotions guests can still use: switched on and not yet over. One day of
// slack so a guest in a timezone ahead of the server isn't cut off early.
export async function currentPromotions() {
  const { rows } = await pool.query(
    `SELECT ${PROMOTION_COLUMNS}
     FROM promotions p
     WHERE p.active AND p.ends_on >= current_date - 1
     ORDER BY p.starts_on, p.id`
  );
  return rows;
}

// The promotion a stay gets: the biggest discount among those covering its
// check-in day ("YYYY-MM-DD") and its room. null if none applies. The
// frontend picks the same way (promoFor in frontend/src/lib/booking.js).
export function bestPromotion(promotions, roomId, checkIn) {
  let best = null;
  for (const p of promotions) {
    if (p.room_id != null && p.room_id !== roomId) continue;
    if (checkIn < p.starts_on || checkIn > p.ends_on) continue;
    if (!best || p.percent > best.percent) best = p;
  }
  return best;
}
