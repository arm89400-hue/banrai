// When each fruit in the orchard is ready to pick, for the Activities page
// (season wheel and fruit stickers). Months are 1-12; a season can wrap
// over the new year (e.g. rose apple Dec-Mar). The ranges are approximate
// for Pak Chong - adjust them here when the farm confirms.
// Each `id` is also the cut-out photo in public/images/fruit-cut/<id>.webp,
// the full photo public/images/farm/fruit-<id>.jpg, and the keys
// `fruits.<id>` (name) and `fruitInfo.<id>` (description) in i18n/strings.js.
export const FRUIT_SEASONS = [
  { id: 'mango', from: 3, to: 5 },
  { id: 'jackfruit', from: 3, to: 7 },
  { id: 'lychee', from: 4, to: 5 },
  { id: 'blackberry', from: 2, to: 4 },
  { id: 'durian', from: 5, to: 7 },
  { id: 'rambutan', from: 5, to: 8 },
  { id: 'dragonfruit', from: 5, to: 10 },
  { id: 'sataw', from: 6, to: 9 },
  { id: 'avocado', from: 7, to: 10 },
  { id: 'custard-apple', from: 7, to: 9 },
  { id: 'passionfruit', from: 8, to: 12 },
  { id: 'rose-apple', from: 12, to: 3 },
];

// The three Thai seasons, for the wheel's colours and legend.
export const WEATHER_SEASONS = [
  { id: 'hot', from: 3, to: 5 },
  { id: 'rain', from: 6, to: 10 },
  { id: 'cool', from: 11, to: 2 },
];

export const fruitImage = (id) => `/images/fruit-cut/${id}.webp`;
// The fruit's full photo (with its surroundings), for the fruit cards.
export const fruitPhoto = (id) => `/images/farm/fruit-${id}.jpg`;

// True if `month` (1-12) falls in the from..to range, wrapping over December.
export function inRange({ from, to }, month) {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

export function fruitsIn(month) {
  return FRUIT_SEASONS.filter((f) => inRange(f, month));
}

// The middle month of a season (as a fraction, e.g. 6.5), wrapping over
// December - used to place each fruit around the wheel.
export function seasonMiddle({ from, to }) {
  const end = to < from ? to + 12 : to;
  return (((from + end) / 2 - 1) % 12) + 1;
}
