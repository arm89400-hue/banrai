import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n/lang';
import { FRUIT_SEASONS, fruitImage, fruitPhoto, inRange } from '../lib/seasons';
import './FruitViewer.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// One fruit at a time, large: the list of fruits on the side, then the
// photo (with its cut-out as a sticker), picking months and description.
// `index` points into FRUIT_SEASONS. Closes on Escape, the close button or a
// click outside; arrow keys and the ← → buttons step through the fruits.
// Rendered into <body>, like the photo Lightbox.
export default function FruitViewer({ index, onChange, onClose }) {
  const { t, locale } = useLang();
  const closeRef = useRef(null);
  const listRef = useRef(null);
  const count = FRUIT_SEASONS.length;
  const thisMonth = new Date().getMonth() + 1;
  const names = t('fruits');
  const monthName = (m, style) => new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: style });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onChange((index + 1) % count);
      if (e.key === 'ArrowLeft') onChange((index - 1 + count) % count);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [index, count, onChange, onClose]);

  // Keep the picked fruit visible in the list (it scrolls sideways on phones).
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [index]);

  const fruit = FRUIT_SEASONS[index];
  const name = names[fruit.id];

  return createPortal(
    <div className="fruit-viewer" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div className="fruit-viewer__box" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="fruit-viewer__close" aria-label={t('gallery.close')} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <nav ref={listRef} className="fruit-viewer__list" aria-label={t('season.listTitle')}>
          {FRUIT_SEASONS.map((f, i) => (
            <button
              key={f.id}
              type="button"
              className={i === index ? 'is-on' : ''}
              aria-current={i === index}
              onClick={() => onChange(i)}
            >
              <img src={fruitImage(f.id)} alt="" />
              {names[f.id]}
              {inRange(f, thisMonth) && <span className="fruit-viewer__dot" aria-label={t('season.ripeNow')} />}
            </button>
          ))}
        </nav>

        {/* Keyed so each fruit fades in rather than swapping abruptly. */}
        <article key={fruit.id} className="fruit-viewer__panel">
          <div className="fruit-viewer__photo">
            <img src={fruitPhoto(fruit.id)} alt={name} />
            <img className="fruit-viewer__sticker" src={fruitImage(fruit.id)} alt="" />
          </div>
          <div className="fruit-viewer__info">
            {inRange(fruit, thisMonth) && <span className="fruit-viewer__now">{t('season.ripeNow')}</span>}
            <h2>{name}</h2>
            <p className="fruit-viewer__season">
              {t('season.harvest')} <strong>{`${monthName(fruit.from, 'short')}–${monthName(fruit.to, 'short')}`}</strong>
            </p>
            <ol className="fruit-viewer__months" aria-hidden="true">
              {MONTHS.map((m) => (
                <li key={m} className={`${inRange(fruit, m) ? 'is-on' : ''}${m === thisMonth ? ' is-now' : ''}`}>
                  {monthName(m, 'short')}
                </li>
              ))}
            </ol>
            <p className="fruit-viewer__text">{t('fruitInfo')[fruit.id]}</p>
            <div className="fruit-viewer__arrows">
              <button type="button" aria-label={t('gallery.prev')} onClick={() => onChange((index - 1 + count) % count)}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span>
                {index + 1} / {count}
              </span>
              <button type="button" aria-label={t('gallery.next')} onClick={() => onChange((index + 1) % count)}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>,
    document.body
  );
}
