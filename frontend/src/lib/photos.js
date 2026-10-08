// The property's own photos, resized into public/images/farm. Each `id` is
// both the file name and the key of its caption in i18n/strings.js
// (`photos`), so adding a photo means: drop the file in, list it here,
// caption it there.
import { mediaUrl } from './api';

const src = (id) => `/images/farm/${id}.jpg`;
const photos = (ids) => ids.map((id) => ({ id, src: src(id) }));

// Home hero: cross-fades through these in order, then starts over.
export const HERO_SLIDES = [
  'home-background1',
  'home-background2',
  'home-bbq5',
  'home-coffe',
  'home-mainwall',
  'home-outside6',
  'home-outside7',
  'home-swimmingpool2',
].map(src);

// Login page background: the rooms and the grounds, looping.
export const LOGIN_SLIDES = [
  '/images/rooms/room-1-1.jpg',
  src('home-swimmingpool2'),
  '/images/rooms/room-2-1.jpg',
  src('home-outside6'),
  '/images/rooms/room-4-1.jpg',
  src('home-coffe'),
];

// Booking page, step 1: the farm, its food and activities, looping beside
// the calendar.
export const BOOKING_SLIDES = [
  'booking-outside5',
  'booking-outside-3',
  'booking-garden',
  'booking-mainwall',
  'booking-inside1',
  'booking-breakfastoutside',
  'booking-breakfast2',
  'booking-breakfast4',
  'booking-cook1',
  'booking-cook4',
  'booking-bbq5',
  'booking-fruit1',
  'booking-avocado4',
  'booking-banana1',
  'booking-vege6',
  'booking-activity1-2',
  'booking-activity1-3',
  'booking-bird1',
  'booking-sunrise',
].map(src);

export const FARM_PHOTOS = { main: src('entrance'), inset: src('harvest') };

export const SIGN_PHOTO = src('sign');

// What grows in the orchard.
export const FRUIT_PHOTOS = photos([
  'fruit-avocado',
  'fruit-durian',
  'fruit-lychee',
  'fruit-rambutan',
  'fruit-mango',
  'fruit-dragonfruit',
  'fruit-custard-apple',
  'fruit-sataw',
  'fruit-blackberry',
  'fruit-rose-apple',
  'fruit-coconut',
  'fruit-passionfruit',
]);

// Meals. Order matters: the mosaic in HomeSections.css gives the first and
// last tiles double width.
export const TABLE_PHOTOS = photos([
  'table-breakfast',
  'table-egg-pan',
  'table-garden-breakfast',
  'table-rice-soup',
  'table-grill',
  'table-moo-kata',
]);

// Around the property.
export const AROUND_PHOTOS = photos([
  'around-pool',
  'around-firepit',
  'around-orchard',
  'around-kale',
  'around-pavilion',
  'around-balcony',
  'around-eggs',
  'around-pool-wide',
  'around-lettuce',
  'around-bamboo-wall',
  'around-planting',
  'around-coffee',
  'around-sky',
]);

// A room's or activity's photos as the API sends them ({ id, file }, set in
// admin, at most 6, cover first) turned into { id, src } for <img>.
export const listingPhotos = (item) =>
  (item?.photos ?? []).map((p) => ({ id: `photo-${p.id}`, src: mediaUrl(p.file) }));

// Fallback when a room comes without its photo list: the files in
// public/images/rooms as room-<id>-<n>.jpg (the starting set admin's photo
// list was filled from), plus the old single image_url.
const ROOM_PHOTO_COUNTS = { 1: 3, 2: 3, 3: 2, 4: 4, 5: 3 };

// Each room's photos; the first is the cover shown on cards and lists.
export function roomPhotos(room) {
  if (Array.isArray(room.photos)) return listingPhotos(room);
  const count = ROOM_PHOTO_COUNTS[room.id] ?? 0;
  const list = Array.from({ length: count }, (_, i) => ({
    id: `room-${room.id}-${i + 1}`,
    src: `/images/rooms/room-${room.id}-${i + 1}.jpg`,
  }));
  if (room.image_url) list.unshift({ id: `room-${room.id}-custom`, src: room.image_url });
  return list;
}

export function roomCover(room) {
  return roomPhotos(room)[0]?.src ?? `/images/rooms/room-${room.id}.jpg`;
}
