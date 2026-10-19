// The admin's booking rows grouped the way the guest booked them, shared by
// the admin pages (pages/AdminBookings.jsx) and the menu's Today count.
import { addDays, roomNames } from './booking';

export const dayOf = (ts) => String(ts ?? '').slice(0, 10);
// A room's name in the admin's language ('th' or 'en').
export const roomTitle = (name, lang = 'th') => roomNames(name, lang).title;

// The admin's booking rows as bookings the way the guest made them: rooms
// booked together (same group code) become one. Activities stay one each.
export function groupRows(list, lang = 'th') {
  const map = new Map();
  for (const b of list) {
    const key = b.room_id ? b.group_code || b.code || `#${b.id}` : `activity-${b.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  return [...map.entries()].map(([key, unsorted]) => {
    const rows = [...unsorted].sort((a, b) => a.id - b.id);
    const live = rows.filter((r) => r.status !== 'cancelled');
    const status = live.length === 0 ? 'cancelled' : live.some((r) => r.status === 'pending') ? 'pending' : 'confirmed';
    const lead = live[0] ?? rows[0];
    const sum = (field) => live.reduce((n, r) => n + Number(r[field] ?? 0), 0);
    const owing = status === 'confirmed' ? live.filter((r) => !r.balance_paid_at && Number(r.total) > Number(r.deposit)) : [];
    return {
      key,
      code: lead.room_id ? key : lead.code || `#${lead.id}`,
      rows,
      live,
      lead,
      status,
      isRoom: Boolean(lead.room_id),
      checkIn: dayOf(lead.booked_for),
      checkOut: lead.booked_until ? dayOf(lead.booked_until) : dayOf(lead.booked_for),
      guests: sum('guests'),
      total: sum('total'),
      deposit: sum('deposit'),
      restDue: owing.reduce((n, r) => n + Number(r.total) - Number(r.deposit), 0),
      paidAtFarm: live.some((r) => r.balance_method === 'at_farm'),
      depositReview: status === 'pending' && rows.some((r) => r.slip_status === 'review'),
      balanceReview: status === 'confirmed' && owing.some((r) => r.balance_slip_status === 'review'),
      rooms: lead.room_id ? (live.length ? live : rows).map((r) => roomTitle(r.room_name, lang)).join(' + ') : lead.activity_name,
    };
  });
}

// Whether a booking needs the owner now: a slip to check, a deposit not
// paid yet, or the rest to collect from guests arriving today or tomorrow.
export function needsYou(g, today) {
  if (!g.isRoom || g.status === 'cancelled' || g.checkOut < today) return false;
  return g.depositReview || g.balanceReview || g.status === 'pending' || (g.restDue > 0 && g.checkIn <= addDays(today, 1));
}

