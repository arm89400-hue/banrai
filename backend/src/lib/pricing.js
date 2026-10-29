export const EXTRA_GUEST_FEE = 500;

export const PET_FEE = 100;
export const PET_MAX_KG = 20;

export const PRICING = {
  extra_guest_fee: EXTRA_GUEST_FEE,
  pet_fee: PET_FEE,
  pet_max_kg: PET_MAX_KG,
};

export const MAX_PARTY = 14;

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

export function maxGuests(room) {
  if (!room.capacity) return null;
  return room.capacity + (room.max_extra_guests ?? 0);
}

export function priceStay(room, nights, guests, pets = 0, promo = null) {
  const extraGuests = room.capacity ? Math.max(0, guests - room.capacity) : 0;
  const base = Number(room.price) * nights;
  const extraTotal = extraGuests * EXTRA_GUEST_FEE * nights;
  const petTotal = pets * PET_FEE * nights;
  const discount = promo ? Math.round(base * Number(promo.percent)) / 100 : 0;
  const total = base - discount + extraTotal + petTotal;
  return { base, extraGuests, extraTotal, petTotal, discount, total, deposit: Math.round(total * 50) / 100 };
}
