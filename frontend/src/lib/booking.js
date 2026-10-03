// Helpers shared by the booking flow, room pages and booking status page.
// Stay dates are bare "YYYY-MM-DD" strings everywhere on the frontend; the
// backend stores them as UTC midnight.

// Extra requests offered as checkboxes. Pets are asked for as a count
// instead (they're charged per pet), and saved as the 'pets' request.
export const REQUEST_OPTIONS = ['bbq', 'extra_bed'];
export const MAX_PETS = 99;
export const MAX_GUESTS = 10;

// Local calendar date -> "YYYY-MM-DD" (not toISOString(), which converts
// to UTC and could shift the day).
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const utc = (iso) => new Date(`${iso}T00:00:00Z`);

export function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(utc(value).getTime());
}

export function addDays(iso, days) {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((utc(checkOut) - utc(checkIn)) / 86_400_000));
}

// "3 ต.ค. 2569" / "Oct 3, 2026"
export function formatDay(iso, locale) {
  return utc(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// A booking's booked_for/booked_until timestamps -> bare dates.
export const dayOf = (timestamp) => String(timestamp).slice(0, 10);

// Turns [{check_in, check_out}] ranges into a Set of the nights they cover
// (a "night" is the date you go to sleep; check-out day itself is free).
export function bookedNightSet(ranges) {
  const nights = new Set();
  for (const { check_in, check_out } of ranges ?? []) {
    for (let day = check_in; day < check_out; day = addDays(day, 1)) nights.add(day);
  }
  return nights;
}

// True if no night in [checkIn, checkOut) is already booked.
export function rangeIsFree(bookedNights, checkIn, checkOut) {
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) {
    if (bookedNights.has(day)) return false;
  }
  return true;
}

// Room names are stored as "English name · Thai name". Returns the current
// language's name as the title and the other as a subtitle.
export function roomNames(name, lang) {
  const [en, th] = String(name ?? '').split(' · ');
  return lang === 'th' && th ? { title: th, subtitle: en } : { title: en, subtitle: th };
}

// Most guests a room can take: the guests its price covers (capacity) plus
// the extra guests it allows. Falls back to MAX_GUESTS if no count is set.
export function roomMaxGuests(room) {
  if (!room?.capacity) return MAX_GUESTS;
  return room.capacity + (room.max_extra_guests ?? 0);
}

// Price breakdown for a stay, as shown to the guest. The backend computes
// the real total the same way (backend/src/lib/pricing.js): the room rate
// covers room.capacity guests; each guest beyond that pays `fee` per night,
// and each pet pays `petFee` per night. A promotion (see promoFor below)
// takes its percentage off the room rate only.
export function priceStay(room, nights, guests, fee, pets = 0, petFee = 0, promo = null) {
  const extraGuests = room.capacity ? Math.max(0, guests - room.capacity) : 0;
  const base = Number(room.price) * nights;
  const extraTotal = extraGuests * fee * nights;
  const petTotal = pets * petFee * nights;
  const discount = promo ? Math.round(base * Number(promo.percent)) / 100 : 0;
  return { base, extraGuests, extraTotal, petTotal, discount, total: base - discount + extraTotal + petTotal };
}

// The promotion a stay gets: the biggest discount among those covering its
// check-in day and its room, or null. Mirrors bestPromotion in
// backend/src/lib/promotions.js, which decides the real price.
export function promoFor(promotions, roomId, checkIn) {
  let best = null;
  for (const p of promotions ?? []) {
    if (p.room_id != null && p.room_id !== roomId) continue;
    if (!checkIn || checkIn < p.starts_on || checkIn > p.ends_on) continue;
    if (!best || p.percent > best.percent) best = p;
  }
  return best;
}

// Promotions a room has now or coming up (whatever dates the guest picks).
export function promosForRoom(promotions, roomId) {
  return (promotions ?? []).filter((p) => p.room_id == null || p.room_id === roomId);
}
