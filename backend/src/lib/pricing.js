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
