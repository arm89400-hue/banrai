import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FRUIT_SEASONS, WEATHER_SEASONS, fruitImage, fruitPhoto, inRange, seasonMiddle } from '../lib/seasons';
import { api } from '../lib/api';
import { listingPhotos } from '../lib/photos';
import { formatBaht } from '../lib/money';
import { useLang } from '../i18n/lang';
import FruitViewer from '../components/FruitViewer';
import Lightbox from '../components/Lightbox';
import './Activity.css';

// Used only if the activity list can't be loaded: the farm's activities as
// they were before they moved into admin (ids match `activities.items`).
const FALLBACK_PHOTOS = {
  fruit: '/images/farm/harvest.jpg',
  cook: '/images/farm/booking-cook1.jpg',
  eggs: '/images/farm/around-eggs.jpg',
  bbq: '/images/farm/home-bbq5.jpg',
  planting: '/images/farm/around-planting.jpg',
};

// An activity from the API in the visitor's language (falling back to the
// other one), with its photos (cover first, at most 6 - set in admin).
function localize(a, lang) {
  const pick = (en, th) => (lang === 'th' ? th || en : en || th);
  return {
    id: a.id,
    title: pick(a.name, a.name_th),
    text: pick(a.description, a.description_th),
    tag: pick(a.tag, a.tag_th),
    price: Number(a.price) || 0,
    // Fruit picking's zone links on to the fruit seasons further down.
    fruit: a.name === 'Fruit picking',
    photos: listingPhotos(a),
  };
}

// Columns for the board of cards: up to 5 per row, and never a short last
// row with a lone card (6 cards -> 3 + 3, 7 -> 4 + 3).
const boardColumns = (n) => Math.ceil(n / Math.ceil(n / 5)) || 1;

// Glides to a part of this page (an activity's zone, the fruit seasons),
// leaving the address pointing at it so it can be shared.
function goTo(e, id) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Where on the year line (0-100 %, January to December) a month or a
// fractional month sits.
const linePos = (m) => ((m - 0.5) / 12) * 100;

// Each fruit points at the middle of its season. Going left to right, it
// takes the first free spot: above-near, below-near, above-far, below-far,
// where "free" means at least MIN_GAP % from the last fruit in that spot -
// so no two pictures overlap, even when two fruits share a month.
const MIN_GAP = 8.5;
// How far (in % of the line) a far fruit's stem keeps from a near fruit's centre.
const NEAR_CLEAR = 6;
const FRUIT_SPOTS = (() => {
  const slots = [
    { side: 'up', far: false, last: -99 },
    { side: 'down', far: false, last: -99 },
    { side: 'up', far: true, last: -99 },
    { side: 'down', far: true, last: -99 },
  ];
  const spots = {};
  for (const f of [...FRUIT_SEASONS].sort((a, b) => seasonMiddle(a) - seasonMiddle(b))) {
    const x = linePos(seasonMiddle(f));
    const slot = slots.find((s) => x - s.last >= MIN_GAP) ?? slots.reduce((p, q) => (q.last < p.last ? q : p));
    slot.last = x;
    spots[f.id] = { x, side: slot.side, far: slot.far, at: x };
  }

  // A far fruit's long stem would cut through a near fruit on its side when
  // they sit at (almost) the same month. Such a far fruit moves sideways to
  // the closest clear spot (`at`); its stem then runs down beside the near
  // fruits and bends to its months on the line (drawn in BentStems).
  const all = Object.values(spots);
  const clearOfNear = (s, at) => all.every((n) => n.far || n.side !== s.side || Math.abs(n.x - at) >= NEAR_CLEAR);
  const clearOfFar = (s, at) => all.every((o) => o === s || !o.far || o.side !== s.side || Math.abs(o.at - at) >= MIN_GAP);
  for (const s of all.filter((spot) => spot.far)) {
    if (clearOfNear(s, s.x)) continue;
    for (let step = 0.5; step <= 30; step += 0.5) {
      const at = [s.x + step, s.x - step].find((c) => c > 3 && c < 97 && clearOfNear(s, c) && clearOfFar(s, c));
      if (at !== undefined) {
        s.at = at;
        break;
      }
    }
  }
  return spots;
})();

// Bent stems of far fruits that were moved sideways (see FRUIT_SPOTS): a
// line straight down from the picture past the near fruits, then a short
// slant to the fruit's months on the line, ending in a dot. Coordinates
// match the straight stems in Activity.css (half height 250px).
const STEM_Y = {
  // picture end of the stem, where it bends, the dot on the line
  up: { from: 106, bend: 220, dot: 231 },
  down: { from: 126, bend: 12, dot: 1 },
};

function BentStems({ side, month }) {
  const bent = FRUIT_SEASONS.filter((f) => {
    const s = FRUIT_SPOTS[f.id];
    return s.side === side && s.at !== s.x;
  });
  if (!bent.length) return null;
  const y = STEM_Y[side];
  return (
    <svg className="season-line__bent" aria-hidden="true">
      {bent.map((f) => {
        const s = FRUIT_SPOTS[f.id];
        return (
          <g key={f.id} className={inRange(f, month) ? 'is-ripe' : ''}>
            <line x1={`${s.at}%`} y1={y.from} x2={`${s.at}%`} y2={y.bend} />
            <line x1={`${s.at}%`} y1={y.bend} x2={`${s.x}%`} y2={y.dot} />
            <circle cx={`${s.x}%`} cy={y.dot} r="6" />
          </g>
        );
      })}
    </svg>
  );
}

const seasonOf = (m) => WEATHER_SEASONS.find((s) => inRange(s, m)).id;

// Public page of the farm's activities: a scrapbook of the four hands-on
// activities, then the fruit seasons as a year line (pick a month to see what
// can be picked), then a polaroid per fruit. Tapping a fruit anywhere (line
// or polaroid) opens it large in FruitViewer.
export default function Activity() {
  const { t, lang, locale } = useLang();
  const thisMonth = new Date().getMonth() + 1;
  const [month, setMonth] = useState(thisMonth);
  const [activities, setActivities] = useState(null); // from the API; null while loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [gallery, setGallery] = useState(null); // { photos, index } of the open activity

  // The activities and their photos are managed in admin.
  useEffect(() => {
    api('/api/activities')
      .then((data) => setActivities(data.activities))
      .catch(() => setLoadFailed(true));
  }, []);

  const items = loadFailed
    ? t('activities.items').map((item) => ({
        ...item,
        fruit: item.id === 'fruit',
        photos: [{ id: item.id, src: FALLBACK_PHOTOS[item.id] }],
      }))
    : (activities ?? []).map((a) => localize(a, lang));

  // Opened with a link to one activity (/activities#activity-7): go there
  // once the activities have loaded and their zones exist.
  const ready = Boolean(activities) || loadFailed;
  useEffect(() => {
    if (!ready || !window.location.hash.startsWith('#activity-')) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [ready]);

  const names = t('fruits');
  const monthName = (m, style) => new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: style });
  const range = (s) => `${monthName(s.from, 'short')}–${monthName(s.to, 'short')}`;
  const [open, setOpen] = useState(null); // index in FRUIT_SEASONS, or null

  const showFruit = (id) => setOpen(FRUIT_SEASONS.findIndex((f) => f.id === id));

  return (
    <>
      <header className="page-banner" style={{ backgroundImage: 'url(/images/farm/booking-activity1-2.jpg)' }}>
        <div className="page-banner__inner">
          <p className="page-banner__eyebrow">{t('activities.eyebrow')}</p>
          <h1>{t('activities.title')}</h1>
          <p className="acts-banner__lead">{t('activities.lead')}</p>
        </div>
      </header>

      {/* The activities as taped-on photos; each one leads to its zone below. */}
      <section className="acts-board" id="acts-board">
        <h2 className="acts-board__title reveal">
          {t('activities.boardTitle')} <em>{t('activities.boardTitleEm')}</em>
        </h2>
        <ul className="acts-board__list" style={{ '--cols': boardColumns(items.length) }}>
          {items.map((item, i) => (
            <li key={item.id} className="polaroid reveal" style={{ '--i': i }}>
              <a className="polaroid__link" href={`#activity-${item.id}`} onClick={(e) => goTo(e, `activity-${item.id}`)}>
                {item.photos.length > 0 ? (
                  <img src={item.photos[0].src} alt="" loading="lazy" />
                ) : (
                  <span className="polaroid__empty" aria-hidden="true" />
                )}
                <h3>{item.title}</h3>
                {item.text && <p>{item.text}</p>}
                {item.tag && <span className="polaroid__tag">{item.tag}</span>}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* One zone per activity: what it is and all its photos (up to 6). */}
      <section className="act-zones" aria-label={t('activities.zonesLabel')}>
        {items.map((item, i) => (
          <article key={item.id} id={`activity-${item.id}`} className={`act-zone${i % 2 ? ' act-zone--flip' : ''}`}>
            <div className="act-zone__text">
              {item.tag && <p className="info-eyebrow">{item.tag}</p>}
              <h2>{item.title}</h2>
              {item.text && <p className="act-zone__lead">{item.text}</p>}
              {item.price > 0 && <p className="act-zone__price">{t('activities.price', { price: formatBaht(item.price) })}</p>}
              <div className="act-zone__links">
                {item.fruit && (
                  <a className="bk-btn bk-btn--primary" href="#seasons" onClick={(e) => goTo(e, 'seasons')}>
                    {t('activities.seeSeasons')} ↓
                  </a>
                )}
                <a className="act-zone__back" href="#acts-board" onClick={(e) => goTo(e, 'acts-board')}>
                  ↑ {t('activities.backToAll')}
                </a>
              </div>
            </div>
            {item.photos.length > 0 && (
              <div className="act-zone__photos" data-count={Math.min(item.photos.length, 6)}>
                {item.photos.slice(0, 6).map((photo, n) => (
                  <button
                    key={photo.id}
                    type="button"
                    className="act-zone__photo"
                    onClick={() => setGallery({ photos: item.photos.map((p) => ({ ...p, caption: item.title })), index: n })}
                    aria-label={t('activities.photoOf', { name: item.title, n: n + 1, total: item.photos.length })}
                  >
                    <img src={photo.src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>

      {gallery && (
        <Lightbox
          photos={gallery.photos}
          index={gallery.index}
          onChange={(index) => setGallery((g) => ({ ...g, index }))}
          onClose={() => setGallery(null)}
        />
      )}

      {/* Fruit seasons: a line through the year, coloured by season, with each
          fruit pointing at its months (above or below the line). Phones get
          the same year as a vertical line, a month per row. The fruits in
          season for the picked month stand out; the rest fade. */}
      <section className="season" id="seasons">
        <header className="season__head">
          <div>
            <p className="info-eyebrow">{t('season.eyebrow')}</p>
            <h2 className="season__title">{t('season.title')}</h2>
            <p className="season__lead">{t('season.lead')}</p>
          </div>
          <ul className="season__legend">
            {WEATHER_SEASONS.map((s) => (
              <li key={s.id} className={`is-${s.id}`}>
                {t(`season.${s.id}`)} <span>{range(s)}</span>
              </li>
            ))}
          </ul>
        </header>

        <div className="season-line" role="group" aria-label={t('season.wheel')}>
          {['up', 'down'].map((side) => (
            <div key={side} className={`season-line__half season-line__half--${side}`}>
              <BentStems side={side} month={month} />
              {FRUIT_SEASONS.filter((f) => FRUIT_SPOTS[f.id].side === side).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`season-line__fruit${FRUIT_SPOTS[f.id].far ? ' is-far' : ''}${
                    FRUIT_SPOTS[f.id].at === FRUIT_SPOTS[f.id].x ? '' : ' is-bent'
                  }${inRange(f, month) ? ' is-ripe' : ''}`}
                  style={{ left: `${FRUIT_SPOTS[f.id].at}%` }}
                  onClick={() => showFruit(f.id)}
                >
                  <img src={fruitImage(f.id)} alt="" loading="lazy" />
                  <strong>{names[f.id]}</strong>
                  <small>{range(f)}</small>
                  <span className="season-line__stem" aria-hidden="true" />
                </button>
              ))}
              {side === 'up' && (
                <div className="season-line__track" aria-hidden="true">
                  {MONTHS.map((m) => (
                    <span key={m} className={`is-${seasonOf(m)}${m === month ? ' is-picked' : ''}`} />
                  ))}
                </div>
              )}
              {side === 'up' && (
                <div className="season-line__months">
                  {MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`${m === month ? 'is-picked' : ''}${m === thisMonth ? ' is-now' : ''}`}
                      aria-pressed={m === month}
                      aria-label={monthName(m, 'long')}
                      onClick={() => setMonth(m)}
                    >
                      {monthName(m, 'short')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Phones: the year top to bottom, a month per row with its fruit. */}
        <ol className="season-list">
          {MONTHS.map((m) => {
            const list = FRUIT_SEASONS.filter((f) => inRange(f, m));
            return (
              <li key={m} className={`is-${seasonOf(m)}${m === month ? ' is-picked' : ''}`}>
                <button type="button" className="season-list__month" aria-pressed={m === month} onClick={() => setMonth(m)}>
                  {monthName(m, 'short')}
                </button>
                <div className="season-list__fruits">
                  {list.length === 0 && <span className="season-list__none">{t('season.none')}</span>}
                  {list.map((f) => (
                    <button key={f.id} type="button" onClick={() => showFruit(f.id)}>
                      <img src={fruitImage(f.id)} alt="" loading="lazy" />
                      {names[f.id]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

      </section>

      {/* One taped polaroid per fruit, with its cut-out stuck on the corner. */}
      <section className="fruit-list">
        <header className="fruit-list__head">
          <p className="info-eyebrow">{t('season.listEyebrow')}</p>
          <h2>{t('season.listTitle')}</h2>
          <p>{t('season.listLead')}</p>
        </header>
        <ul className="fruit-list__grid">
          {FRUIT_SEASONS.map((f) => (
            <li key={f.id} className="fruit-snap">
              <button type="button" onClick={() => showFruit(f.id)}>
                <span className="fruit-snap__photo">
                  <img src={fruitPhoto(f.id)} alt="" loading="lazy" />
                  <img className="fruit-snap__sticker" src={fruitImage(f.id)} alt="" loading="lazy" />
                </span>
                <h3>{names[f.id]}</h3>
                <span className="fruit-snap__season">
                  ✿ {t('season.harvest')} {range(f)}
                  {inRange(f, thisMonth) && <span className="fruit-snap__now">{t('season.ripeNow')}</span>}
                </span>
                <span className="fruit-snap__text">{t('fruitInfo')[f.id]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Where to go next: activities are arranged as part of a stay. */}
      <section className="act-cta">
        <h2>{t('act.ctaTitle')}</h2>
        <p>{t('act.ctaText')}</p>
        <Link to="/book" className="page-cta">
          {t('nav.book')}
        </Link>
      </section>

      {open !== null && <FruitViewer index={open} onChange={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
