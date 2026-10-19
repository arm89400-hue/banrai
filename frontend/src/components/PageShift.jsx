import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { canShift, shift } from '../lib/motion';

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

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  return null;
}
