import { useState } from 'react';
import { useLang } from '../i18n/lang';
import './HeroLife.css';

// The living layer over the home photos: the light of the hour at the farm,
// a few leaves coming down from the orchard, and at night, fireflies.
// Pure CSS animation (transform and opacity only), paused when the hero is
// off screen or the guest presses pause, and absent with reduced motion.

const LEAVES = [
  // left %, size px, fall s, delay s, sway px, spin deg, depth (0 near, 1 far), colour
  [4, 44, 12, -1, 90, 260, 0, 'a'],
  [13, 26, 16, -9, 60, -200, 1, 'b'],
  [22, 38, 13, -5, 100, 320, 0, 'c'],
  [31, 22, 17, -13, 50, -240, 1, 'a'],
  [40, 46, 12.5, -8, 96, 280, 0, 'b'],
  [49, 24, 15, -2, 64, -300, 1, 'c'],
  [58, 40, 13.5, -11, 88, 240, 0, 'a'],
  [67, 28, 16.5, -6, 56, -260, 1, 'b'],
  [76, 42, 12, -4, 92, 300, 0, 'c'],
  [85, 24, 15.5, -14, 58, -220, 1, 'a'],
  [93, 36, 14, -10, 84, 270, 0, 'b'],
  [98, 22, 17, -3, 48, -280, 1, 'c'],
];

const MOTES = Array.from({ length: 14 }, (_, i) => [
  (i * 37) % 100, // left %
  ((i * 53) % 70) + 20, // top %
  2 + (i % 3) * 1.5, // size px
  9 + (i % 5) * 2.5, // duration s
  -((i * 1.7) % 12), // delay s
]);

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5C5.5 6 3.6 12.8 6.4 21.6c7.4-2.4 11.9-9.7 5.6-20.1Z" />
      <path className="hero-life__rib" d="M7 20.6c1.5-5.6 3.2-10.4 5-15.4" />
    </svg>
  );
}

// `pausable`: draw its own pause button (pages whose photo doesn't change;
// the home page has one button for photos and life together).
export default function HeroLife({ part, pausable = false }) {
  const { t } = useLang();
  const [still, setStill] = useState(() => {
    try {
      return localStorage.getItem('baanrai-hero-still') === '1';
    } catch {
      return false;
    }
  });
  function toggle() {
    const next = !still;
    setStill(next);
    try {
      localStorage.setItem('baanrai-hero-still', next ? '1' : '0');
    } catch {
      // Not saved; it still pauses for now.
    }
  }
  const layer = (
    <div className={`hero-life hero-life--${part}${pausable && still ? ' is-still' : ''}`} aria-hidden="true">
      <div className="hero-life__sun" />
      <div className="hero-life__rays" />
      {part !== 'evening' &&
        LEAVES.map(([left, size, fall, delay, sway, spin, far, tone], i) => (
          <span
            key={i}
            className={`hero-life__leaf hero-life__leaf--${tone}${far ? ' is-far' : ''}`}
            style={{
              '--left': `${left}%`,
              '--size': `${size}px`,
              '--fall': `${fall}s`,
              '--delay': `${delay}s`,
              '--sway': `${sway}px`,
              '--spin': `${spin}deg`,
            }}
          >
            <span>
              <Leaf />
            </span>
          </span>
        ))}
      {MOTES.map(([left, top, size, dur, delay], i) => (
        <span
          key={i}
          className="hero-life__mote"
          style={{ '--left': `${left}%`, '--top': `${top}%`, '--size': `${size}px`, '--dur': `${dur}s`, '--delay': `${delay}s` }}
        />
      ))}
    </div>
  );
  if (!pausable) return layer;
  return (
    <>
      {layer}
      <button
        type="button"
        className="hero__still hero-life__btn"
        aria-pressed={still}
        aria-label={t(still ? 'hero.play' : 'hero.pause')}
        title={t(still ? 'hero.play' : 'hero.pause')}
        onClick={toggle}
      >
        {still ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        )}
      </button>
    </>
  );
}
