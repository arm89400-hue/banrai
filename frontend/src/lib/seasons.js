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

export const fruitImage = (id) => `/images/fruit-cut/${id}.webp`;
export const fruitPhoto = (id) => `/images/farm/fruit-${id}.jpg`;

export function inRange({ from, to }, month) {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

export function fruitsIn(month) {
  return FRUIT_SEASONS.filter((f) => inRange(f, month));
}
