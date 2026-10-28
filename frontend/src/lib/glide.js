import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ACTIVE = ':scope > [aria-current="page"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"], :scope > * > .is-on';

// One highlight that slides from the old choice to the new one, so the eye
// follows the change (tabs, filters, the admin menu). Render
// <span className="glide" aria-hidden="true" /> as the first child of `ref`.
export function useGlide(ref, key) {
  useLayoutEffect(() => {
    const box = ref.current;
    const pill = box?.querySelector(':scope > .glide');
    if (!pill) return undefined;

    function place(animate) {
      const on = box.querySelector(ACTIVE);
      if (!on) {
        pill.style.opacity = '0';
        return;
      }
      const target = [on.offsetLeft, on.offsetTop, on.offsetWidth, on.offsetHeight].join();
      if (pill.dataset.placed === target) return;
      // Start from wherever the highlight is drawn right now, even mid-slide.
      const before = pill.dataset.placed ? pill.getBoundingClientRect() : null;
      pill.style.transition = 'none';
      pill.style.transform = '';
      pill.style.opacity = '1';
      pill.style.left = `${on.offsetLeft}px`;
      pill.style.top = `${on.offsetTop}px`;
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.height = `${on.offsetHeight}px`;
      pill.dataset.placed = target;
      box.classList.add('has-glide');
      if (!animate || !before || reduceMotion()) return;
      const now = pill.getBoundingClientRect();
      if (!now.width || !now.height || !before.width) return;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      const sx = before.width / now.width;
      const sy = before.height / now.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
      pill.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      pill.getBoundingClientRect(); // apply the start position before animating
      pill.style.transition = 'transform var(--dur-3) var(--ease-standard)';
      pill.style.transform = '';
      moving = true;
    }

    let moving = false;
    const done = (e) => e.target === pill && (moving = false);
    pill.addEventListener('transitionend', done);
    pill.addEventListener('transitioncancel', done);
    place(true);
    // Sizes settle after the pick (bold text is wider, fonts arrive): follow
    // smoothly while sliding, jump otherwise.
    const ro = new ResizeObserver(() => place(moving));
    ro.observe(box);
    for (const el of box.querySelectorAll(':scope > *, :scope > * > *')) ro.observe(el);
    return () => {
      ro.disconnect();
      pill.removeEventListener('transitionend', done);
      pill.removeEventListener('transitioncancel', done);
    };
  }, [ref, key]);
}

const easeStandard = (t) => 1 - Math.pow(1 - t, 3);

// A number that runs to its new value in place (a total after picking a
// room, this month's takings). The first value shows at once.
export function useTween(value, ms = 240) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const shownRef = useRef(value);

  useEffect(() => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      shownRef.current = value;
      setShown(value);
      return undefined;
    }
    const start = typeof shownRef.current === 'number' ? shownRef.current : value;
    if (start === value || reduceMotion()) {
      shownRef.current = value;
      setShown(value);
      return undefined;
    }
    from.current = start;
    let frame;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = p === 1 ? value : Math.round(from.current + (value - from.current) * easeStandard(p));
      shownRef.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);

  return shown;
}
