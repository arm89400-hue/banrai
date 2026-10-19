import { useEffect, useState } from 'react';
import { useLang } from '../i18n/lang';
import './StayStage.css';

const SLIDE_MS = 6000;

// The top of the room dashboard: the guest's own stay as a slow slideshow -
// their room(s), the fruit ripe the month they come, the farm's activities -
// each photo named in the corner, the countdown and dates over it. The
// photos only crossfade: no zoom.
// `slides` = [{ src, caption }]; `children` = the text on top. It plays by
// itself unless the visitor asked for reduced motion, and can be paused.
export default function StayStage({ slides, children }) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const count = slides.length;

  useEffect(() => {
    if (!playing || count < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  const current = slides[index] ?? slides[0];

  return (
    <section className={`stay-stage${playing ? ' is-playing' : ''}`}>
      <div className="stay-stage__slides" aria-hidden="true">
        {slides.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
            alt=""
            className={i === index ? 'is-on' : ''}
            loading={i < 2 ? 'eager' : 'lazy'}
          />
        ))}
      </div>

      <div className="stay-stage__in">
        {children}

        {count > 0 && (
          <div className="stay-stage__bar">
            <p className="stay-stage__caption" aria-live="polite">
              {current.caption}
            </p>
            {count > 1 && (
              <div className="stay-stage__dots">
                {slides.map((s, i) => (
                  <button
                    key={s.src}
                    type="button"
                    className={i === index ? 'is-on' : ''}
                    aria-label={s.caption}
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                  />
                ))}
                <button
                  type="button"
                  className="stay-stage__play"
                  aria-label={playing ? t('stay.pause') : t('stay.play')}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
