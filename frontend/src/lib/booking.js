export const REQUEST_OPTIONS = ['bbq', 'extra_bed'];
export const MAX_PETS = 99;
export const MAX_GUESTS = 14;

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

export function formatDay(iso, locale) {
  return utc(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const dayOf = (timestamp) => String(timestamp).slice(0, 10);

export function bookedNightSet(ranges) {
  const nights = new Set();
  for (const { check_in, check_out } of ranges ?? []) {
    for (let day = check_in; day < check_out; day = addDays(day, 1)) nights.add(day);
  }
  return nights;
}

export function rangeIsFree(bookedNights, checkIn, checkOut) {
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) {
    if (bookedNights.has(day)) return false;
  }
  return true;
}

export function nearbyFreeStays(rooms, booked, checkIn, nights, guests, today) {
  const span = 14;
  const limit = 3;
  const found = [];
  for (let step = 1; step <= span && found.length < limit; step++) {
    for (const shift of [-step, step]) {
      const start = addDays(checkIn, shift);
      if (start < today || found.length >= limit) continue;
      const end = addDays(start, nights);
      const free = rooms.filter((r) => rangeIsFree(booked.get(r.id) ?? new Set(), start, end));
      if (free.length && free.reduce((sum, r) => sum + roomMaxGuests(r), 0) >= guests) {
        found.push({ checkIn: start, checkOut: end, rooms: free });
      }
    }
  }
  return found;
}

export function nextFreeStart(bookedNights, checkIn, nights, span = 60) {
  for (let shift = 1; shift <= span; shift++) {
    const start = addDays(checkIn, shift);
    if (rangeIsFree(bookedNights, start, addDays(start, nights))) return start;
  }
  return null;
}

export function roomNames(name, lang) {
  const [en, th] = String(name ?? '').split(' · ');
  return lang === 'th' && th ? { title: th, subtitle: en } : { title: en, subtitle: th };
}

export function roomMaxGuests(room) {
  if (!room?.capacity) return MAX_GUESTS;
  return room.capacity + (room.max_extra_guests ?? 0);
}

export function splitGuests(rooms, guests) {
  if (rooms.length === 0 || rooms.length > guests) return null;
  const counts = rooms.map(() => 1);
  let left = guests - rooms.length;
  rooms.forEach((room, i) => {
    const take = Math.min(left, (room.capacity ?? MAX_GUESTS) - counts[i]);
    counts[i] += take;
    left -= take;
  });
  rooms.forEach((room, i) => {
    const take = Math.min(left, room.capacity ? room.max_extra_guests ?? 0 : 0);
    counts[i] += take;
    left -= take;
  });
  return left === 0 ? counts : null;
}

export function priceStay(room, nights, guests, fee, pets = 0, petFee = 0, promo = null) {
  const extraGuests = room.capacity ? Math.max(0, guests - room.capacity) : 0;
  const base = Number(room.price) * nights;
  const extraTotal = extraGuests * fee * nights;
  const petTotal = pets * petFee * nights;
  const discount = promo ? Math.round(base * Number(promo.percent)) / 100 : 0;
  return { base, extraGuests, extraTotal, petTotal, discount, total: base - discount + extraTotal + petTotal };
}

export function promoFor(promotions, roomId, checkIn) {
  let best = null;
  for (const p of promotions ?? []) {
    if (p.room_id != null && p.room_id !== roomId) continue;
    if (!checkIn || checkIn < p.starts_on || checkIn > p.ends_on) continue;
    if (!best || p.percent > best.percent) best = p;
  }
  return best;
}

export function promosForRoom(promotions, roomId) {
  return (promotions ?? []).filter((p) => p.room_id == null || p.room_id === roomId);
}

export function formatDayShort(iso, locale, wd) {
  const d = new Date(`${iso}T00:00:00`);
  return `${wd[d.getDay()]} ${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
}

export function formatStay(checkIn, checkOut, locale, wd) {
  if (!checkOut) return `${formatDayShort(checkIn, locale, wd)} – ?`;
  if (checkIn.slice(0, 7) !== checkOut.slice(0, 7)) {
    const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${day(checkIn)} – ${day(checkOut)}`;
  }
  const d = (iso) => new Date(`${iso}T00:00:00`);
  return `${wd[d(checkIn).getDay()]} ${d(checkIn).getDate()} – ${formatDayShort(checkOut, locale, wd)}`;
}
