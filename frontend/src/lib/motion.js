import { flushSync } from 'react-dom';

// Shared motion for the public site, built on the browser's View
// Transitions API (the CSS is in App.css): when something on screen changes
// - a new page, a booking step, a tab, a photo opened large - the boxes that
// were there grow, shrink and move into the boxes that replace them, instead
// of the screen jumping. Nothing fades: each box shows its new content at
// once and only its size and place glide. Browsers without the API and
// visitors who asked for reduced motion get the change at once.

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const canShift = () => Boolean(document.startViewTransition) && !reduceMotion();

// The longest the motion waits for the new boxes' photos, so they arrive
// with their pictures instead of as empty white boxes.
const PHOTO_WAIT_MS = 350;

// Gives the first visible elements matching `selector` the view-transition
// names card-0, card-1... in reading order. Naming the same way before and
// after a change pairs them up: card-0 becomes card-0, and so on. Returns
// the elements named, so their names can be cleared again.
export function nameCards(selector, max = 10) {
  const found = [];
  if (!selector) return found;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight * 1.2) continue;
    el.style.viewTransitionName = `card-${found.length}`;
    found.push(el);
    if (found.length === max) break;
  }
  return found;
}

function nameOne(el, name, list) {
  if (!el) return;
  el.style.viewTransitionName = name;
  list.push(el);
}

const clearNames = (els) => els.forEach((el) => (el.style.viewTransitionName = ''));

// Resolves once the photos inside `els` are ready to draw, or after
// PHOTO_WAIT_MS, whichever comes first.
function photosReady(els) {
  const imgs = els.flatMap((el) => (el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')]));
  const ready = imgs.map((img) => {
    img.loading = 'eager';
    return img.decode().catch(() => {});
  });
  return Promise.race([Promise.all(ready), new Promise((r) => setTimeout(r, PHOTO_WAIT_MS))]);
}

// Runs `update` (a React state change) as one smooth change.
// - cards: a selector; matching boxes before and after are paired by order.
// - from / to: one element that turns into another, e.g. the photo tapped
//   (`from`, an element) and the large photo it opens (`to`, a selector or
//   an element).
export function shift(update, { cards, from, to } = {}) {
  if (!canShift()) {
    update();
    return;
  }
  const root = document.documentElement;
  // While set, the pop-ups' own fade-in is switched off (App.css), so the
  // only motion is the boxes moving.
  root.classList.add('is-shifting');
  let named = nameCards(cards);
  nameOne(from, 'shared', named);
  const transition = document.startViewTransition(async () => {
    clearNames(named);
    flushSync(update);
    named = nameCards(cards);
    if (to) nameOne(typeof to === 'string' ? document.querySelector(to) : to, 'shared', named);
    await photosReady(named);
  });
  transition.finished
    .catch(() => {})
    .finally(() => {
      clearNames(named);
      root.classList.remove('is-shifting');
    });
}
