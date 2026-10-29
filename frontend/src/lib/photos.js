import { mediaUrl } from './api';

const src = (id) => `/images/farm/${id}.jpg`;

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

// The home photos open on the time of day it is at the farm (Bangkok time):
// sunrise and breakfast in the morning, the pool by day, the grill at night.
const HERO_BY_TIME = {
  morning: ['booking-sunrise', 'home-background1', 'home-coffe'],
  day: ['home-outside7', 'home-swimmingpool2', 'home-background2'],
  evening: ['home-bbq5', 'home-mainwall', 'home-outside6'],
};

export function partOfDay(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(date)
  );
  return hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : 'evening';
}

export function heroSlidesNow(date = new Date()) {
  const part = partOfDay(date);
  const first = HERO_BY_TIME[part].map(src);
  return [...first, ...HERO_SLIDES.filter((s) => !first.includes(s))];
}

export const LOGIN_SLIDES = [
  '/images/rooms/room-1-1.jpg',
  src('home-swimmingpool2'),
  '/images/rooms/room-2-1.jpg',
  src('home-outside6'),
  '/images/rooms/room-4-1.jpg',
  src('home-coffe'),
];

export const FARM_PHOTOS = { main: src('entrance'), inset: src('harvest') };

export const listingPhotos = (item) =>
  (item?.photos ?? []).map((p) => ({ id: `photo-${p.id}`, src: mediaUrl(p.file) }));

const ROOM_PHOTO_COUNTS = { 1: 3, 2: 3, 3: 2, 4: 4, 5: 3 };

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
