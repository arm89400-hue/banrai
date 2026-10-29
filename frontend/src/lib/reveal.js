// Cards and sections rise into place the first time they scroll into view.
// Only things that start below the screen are hidden first, so nothing on the
// first screen ever blinks. Each item waits a little after the one before it
// in the same row (a short stagger). Nothing moves with reduced motion.

const TARGETS = [
  '.home-sec__hd',
  '.room-row',
  '.fruit-row > li',
  '.day-line__part',
  '.home-before__sign',
  '.home-before__text',
  '.announce__card',
  '.acts-sec__hd',
  '.act-cards > li',
  '.ripe > li',
  '.fruit-cal',
  '.about__lead',
  '.about__highlights > li',
  '.about__photos > *',
  '.room-page__block',
  '.room-others > li',
  '.stay-tile',
  '.footer__brand',
  '.footer__col',
].join(',');

const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function startReveal() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window) || reduce()) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('rv-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  const seen = new WeakSet();
  function scan(root) {
    const list = root.matches?.(TARGETS) ? [root] : [];
    root.querySelectorAll?.(TARGETS).forEach((el) => list.push(el));
    for (const el of list) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[data-no-reveal], .adm-shell')) continue;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) continue; // already on screen: leave it be
      // Stagger by position among siblings that are also revealed.
      let i = 0;
      for (let s = el.previousElementSibling; s && i < 6; s = s.previousElementSibling) {
        if (s.matches(TARGETS)) i += 1;
      }
      el.style.setProperty('--rv-i', String(i));
      el.classList.add('rv');
      io.observe(el);
    }
  }

  let pending = [];
  const mo = new MutationObserver((records) => {
    const first = pending.length === 0;
    for (const rec of records) rec.addedNodes.forEach((n) => n.nodeType === 1 && pending.push(n));
    if (!first || pending.length === 0) return;
    requestAnimationFrame(() => {
      const nodes = pending;
      pending = [];
      nodes.forEach((n) => n.isConnected && scan(n));
    });
  });
  // Wait a frame so the first screen is laid out before measuring.
  requestAnimationFrame(() => {
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  });
}
