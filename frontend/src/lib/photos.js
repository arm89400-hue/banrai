// The property's own photos, resized into public/images/farm. Each `id` is
// both the file name and the key of its caption in i18n/strings.js
// (`photos`), so adding a photo means: drop the file in, list it here,
// caption it there.
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
