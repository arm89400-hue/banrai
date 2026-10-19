import { flushSync } from 'react-dom';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const canShift = () => Boolean(document.startViewTransition) && !reduceMotion();

const PHOTO_WAIT_MS = 350;

let running = null;

function passClick(e) {
  if (!running || e.target !== document.documentElement || !e.isTrusted) return;
  e.stopPropagation();
  const { clientX: x, clientY: y } = e;
  running.skipTransition();
  running.finished.finally(() => {
    const el = document.elementFromPoint(x, y);
    if (!el || el === document.documentElement) return;
    el.focus?.();
    el.click();
  });
}
if (typeof window !== 'undefined') window.addEventListener('click', passClick, true);

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

function photosReady(els) {
  const imgs = els.flatMap((el) => (el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')]));
  const ready = imgs.map((img) => {
    img.loading = 'eager';
    return img.decode().catch(() => {});
  });
  return Promise.race([Promise.all(ready), new Promise((r) => setTimeout(r, PHOTO_WAIT_MS))]);
}

export function shift(update, { cards, from, to } = {}) {
  if (!canShift()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.classList.add('is-shifting');
  let named = nameCards(cards);
  nameOne(from, 'shared', named);
  const transition = (running = document.startViewTransition(async () => {
    clearNames(named);
    flushSync(update);
    named = nameCards(cards);
    if (to) nameOne(typeof to === 'string' ? document.querySelector(to) : to, 'shared', named);
    await photosReady(named);
  }));
  transition.finished
    .catch(() => {})
    .finally(() => {
      clearNames(named);
      if (running === transition) running = null;
      root.classList.remove('is-shifting');
    });
}
