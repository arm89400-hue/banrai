import { pool } from '../db/pool.js';

export const PROMOTION_COLUMNS = `
  p.id, p.name, p.percent::float AS percent, p.room_id, p.active,
  to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on,
  to_char(p.ends_on, 'YYYY-MM-DD') AS ends_on`;

export async function currentPromotions() {
  const { rows } = await pool.query(
    `SELECT ${PROMOTION_COLUMNS}
     FROM promotions p
     WHERE p.active AND p.ends_on >= current_date - 1
     ORDER BY p.starts_on, p.id`
  );
  return rows;
}

export function bestPromotion(promotions, roomId, checkIn) {
  let best = null;
  for (const p of promotions) {
    if (p.room_id != null && p.room_id !== roomId) continue;
    if (checkIn < p.starts_on || checkIn > p.ends_on) continue;
    if (!best || p.percent > best.percent) best = p;
  }
  return best;
}
