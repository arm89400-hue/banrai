import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { canShift, shift } from '../lib/motion';

// The blocks that move between pages, in each page's reading order: the
// cards and sections a guest sees first. The top photo is handled apart
// (it always pairs with the next page's top photo, see App.css).
// Where a tapped card's photo lands on the page it opens.
const LANDING_PHOTO = [['/rooms/', '.room-gallery__tile--main img']];

const CARDS = [
  '.day-grid > *',
  '.room-cards__big > *',
  '.room-cards__small > *',
  '.act-cards > li',
  '.ripe > li',
  '.about__lead',
  '.about__highlights > li',
  '.about__photos > *',
  '.stay-tabs',
  '.stay-dash > *',
  '.room-gallery',
  '.room-page__main > *',
  '.room-book',
  '.my-page > *',
  '.flow-top',
  '.flow__main > *',
  '.flow-stay',
].join(',');

// Page-to-page motion for the public site: clicking a link inside the site
// changes the page with lib/motion's shift(), so each card on screen grows,
// shrinks and moves into the matching card of the new page, the top photo
// morphs into the new page's, and the header stays put (rules in App.css).
// The app uses a plain <BrowserRouter>, where React Router's own
// `viewTransition` prop does nothing, so this wraps the navigation itself.
// Links with a modifier key, new tabs and downloads are left alone.
export default function PageShift() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!document.startViewTransition) return undefined;

    function onClick(e) {
      if (!canShift() || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page (only the hash or query changes): no page shift.
      if (url.pathname === location.pathname) return;

      e.preventDefault();
      const to = url.pathname + url.search + url.hash;
      const landing = LANDING_PHOTO.find(([prefix]) => url.pathname.startsWith(prefix));
      const photo = landing && a.querySelector('img');
      shift(
        () => void navigate(to),
        photo ? { from: photo, to: landing[1] } : { cards: `main :is(${CARDS})` }
      );
    }

    // Capture phase: runs before React Router's own link handler, which
    // then sees the default prevented and leaves the navigation to us.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  return null;
}
