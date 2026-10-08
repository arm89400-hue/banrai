// How a room stay is priced. The frontend shows the same breakdown, but
// this is the source of truth: totals are always computed here.

// Baht per extra guest, per night.
export const EXTRA_GUEST_FEE = 500;

// Baht per pet, per night. Any number of pets may come; each must weigh no
// more than PET_MAX_KG (stated to the guest; the property checks on arrival).
export const PET_FEE = 100;
export const PET_MAX_KG = 20;

// The numbers the frontend needs to show the same breakdown.
export const PRICING = {
  extra_guest_fee: EXTRA_GUEST_FEE,
  pet_fee: PET_FEE,
  pet_max_kg: PET_MAX_KG,
};

// Most guests one booking request may bring (spread over several rooms).
export const MAX_PARTY = 14;

// Spreads `guests` over `rooms` (in the order given): first up to each
// room's included guests, then into the extra places rooms allow - so extra
// fees are only charged once every room's included places are used. Every
// room gets at least one guest. Returns the per-room counts, or null if the
// rooms can't sleep that many (or there are more rooms than guests). The
// frontend splits the same way (splitGuests in frontend/src/lib/booking.js).
export function splitGuests(rooms, guests) {
  if (rooms.length === 0 || rooms.length > guests) return null;
  const base = (room) => room.capacity ?? MAX_PARTY;
  const counts = rooms.map(() => 1);
  let left = guests - rooms.length;
  rooms.forEach((room, i) => {
    const take = Math.min(left, base(room) - counts[i]);
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

// Most guests a room can take: the guests its price covers plus the extra
// guests it allows. null if the room has no guest count set (no limit known).
export function maxGuests(room) {
  if (!room.capacity) return null;
  return room.capacity + (room.max_extra_guests ?? 0);
}

// Price of `nights` in `room` for `guests` people and `pets` pets: the room
// rate (per room per night, breakfast included, covering room.capacity
// guests), plus the flat nightly fee for each guest beyond that and for
// each pet. A promotion (see lib/promotions.js) takes its percentage off the
// room rate only - never off the extra-guest or pet fees.
export function priceStay(room, nights, guests, pets = 0, promo = null) {
  const extraGuests = room.capacity ? Math.max(0, guests - room.capacity) : 0;
  const base = Number(room.price) * nights;
  const extraTotal = extraGuests * EXTRA_GUEST_FEE * nights;
  const petTotal = pets * PET_FEE * nights;
  const discount = promo ? Math.round(base * Number(promo.percent)) / 100 : 0;
  const total = base - discount + extraTotal + petTotal;
  return { base, extraGuests, extraTotal, petTotal, discount, total, deposit: Math.round(total * 50) / 100 };
}
