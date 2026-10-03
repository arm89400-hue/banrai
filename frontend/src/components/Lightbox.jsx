import { useEffect, useRef } from 'react';
import { useLang } from '../i18n/lang';
import './Lightbox.css';

// Full-screen photo viewer. `photos` is a list of { id, src }; captions come
// from the `photos` table in i18n/strings.js. Closes on Escape, on the close
// button or on a click outside the photo; arrow keys step through the list.
export default function Lightbox({ photos, index, onChange, onClose }) {
  const { t } = useLang();
  const closeRef = useRef(null);
  const count = photos.length;

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

  const photo = photos[index];
  const caption = t('photos')[photo.id];

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={caption} onClick={onClose}>
      <button ref={closeRef} type="button" className="lightbox__close" aria-label={t('gallery.close')} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {count > 1 && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--prev"
          aria-label={t('gallery.prev')}
          onClick={(e) => {
            e.stopPropagation();
            onChange((index - 1 + count) % count);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <figure className="lightbox__figure" onClick={(e) => e.stopPropagation()}>
        {/* Keyed so each photo fades in rather than swapping abruptly. */}
        <img key={photo.id} src={photo.src} alt={caption} />
        <figcaption>
          <span>{caption}</span>
          <span className="lightbox__count">
            {index + 1} / {count}
          </span>
        </figcaption>
      </figure>

      {count > 1 && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--next"
          aria-label={t('gallery.next')}
          onClick={(e) => {
            e.stopPropagation();
            onChange((index + 1) % count);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
