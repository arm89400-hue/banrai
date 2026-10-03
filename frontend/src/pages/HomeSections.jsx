import { useState } from 'react';
import { THAI_NAME } from '../lib/site';
import { AROUND_PHOTOS, FARM_PHOTOS, FRUIT_PHOTOS, TABLE_PHOTOS } from '../lib/photos';
import { useLang } from '../i18n/lang';
import Lightbox from '../components/Lightbox';
import './HomeSections.css';

// Informational sections of the Home page (below the room list). The text
// lives in i18n/strings.js (Thai + English), taken from the property's
// pinned Facebook post; the photos are the property's own (lib/photos.js).

// Small leaf ornament under a section title.
export function Sprig() {
  return (
    <svg className="sprig" viewBox="0 0 120 20" width="120" height="20" aria-hidden="true">
      <path d="M2 10h38M80 10h38" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <path d="M60 17c-7-2-10-7-10-13 6 1 10 5 10 13zM60 17c7-2 10-7 10-13-6 1-10 5-10 13z" fill="currentColor" />
    </svg>
  );
}

function Icon({ children, size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  leaf: (
    <Icon>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
      <path d="M5 19c3-4 6-6.5 9.5-8" />
    </Icon>
  ),
  egg: (
    <Icon>
      <path d="M12 3c3.5 0 6.5 5.5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.5 8.5 3 12 3z" />
    </Icon>
  ),
  bowl: (
    <Icon>
      <path d="M3 11h18a9 9 0 0 1-18 0z" />
      <path d="M8 7c0-1 1-1.5 1-2.5M12 7c0-1 1-1.5 1-2.5M16 7c0-1 1-1.5 1-2.5" />
    </Icon>
  ),
  bed: (
    <Icon>
      <path d="M3 18V7M21 18v-5a3 3 0 0 0-3-3H10v8M3 14h18" />
      <circle cx="6.5" cy="11" r="1.5" />
    </Icon>
  ),
  pan: (
    <Icon>
      <path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5" />
      <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
    </Icon>
  ),
  tree: (
    <Icon>
      <path d="M12 21v-6" />
      <path d="M12 3a5 5 0 0 1 5 5 4 4 0 0 1-1 7.5H8A4 4 0 0 1 7 8a5 5 0 0 1 5-5z" />
    </Icon>
  ),
  shield: (
    <Icon>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
    </Icon>
  ),
  check: (
    <Icon size={16}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  ),
};

export function FarmStory() {
  const { t } = useLang();
  return (
    <section id="farm" className="info-section farm">
      <div className="farm__collage reveal">
        <div className="farm__photo">
          <img src={FARM_PHOTOS.main} alt={t('farm.photoAlt')} loading="lazy" />
        </div>
        <div className="farm__inset">
          <img src={FARM_PHOTOS.inset} alt={t('farm.insetAlt')} loading="lazy" />
        </div>
        <span className="farm__badge">{t('farm.badge')}</span>
      </div>

      <div className="farm__text reveal">
        <p className="info-eyebrow">{t('farm.eyebrow')}</p>
        <h2 className="info-title">{t('farm.title')}</h2>
        <p className="farm__thai" lang="th">
          {THAI_NAME}
        </p>
        <p className="farm__lead">{t('farm.lead')}</p>

        <ul className="farm__highlights">
          {t('farm.highlights').map((h) => (
            <li key={h.title}>
              <span className="farm__icon">{ICONS[h.icon]}</span>
              <span>
                <strong>{h.title}</strong>
                <span>{h.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Farm life in one place: fruit, food and the grounds as tabs instead of
// three long photo sections. Each tab shows a short grid (a large first
// photo plus a few more); the last tile opens the full set in the viewer.
const LIFE_TABS = [
  { id: 'fruit', label: 'life.tab.fruit', lead: 'orchard.lead', photos: FRUIT_PHOTOS },
  { id: 'food', label: 'life.tab.food', lead: 'table.lead', photos: TABLE_PHOTOS },
  { id: 'around', label: 'life.tab.around', lead: 'around.lead', photos: AROUND_PHOTOS },
];
// The grid is 4 columns x 2 rows: a double-size first photo (4 cells) and
// four small cells. With more photos than fit, the last cell opens the rest.
const LIFE_CELLS = 5;

export function FarmLife() {
  const { t } = useLang();
  const [tabId, setTabId] = useState(LIFE_TABS[0].id);
  const [open, setOpen] = useState(null); // index in the tab's photos, or null
  const tab = LIFE_TABS.find((x) => x.id === tabId);
  const captions = t('photos');
  const overflow = tab.photos.length > LIFE_CELLS;
  const shown = tab.photos.slice(0, overflow ? LIFE_CELLS - 1 : LIFE_CELLS);
  const rest = tab.photos.length - shown.length;

  // Arrow keys move between tabs, as in any tab list.
  function handleTabKey(e) {
    const i = LIFE_TABS.findIndex((x) => x.id === tabId);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = LIFE_TABS[(i + step + LIFE_TABS.length) % LIFE_TABS.length];
    setTabId(next.id);
    document.getElementById(`life-tab-${next.id}`)?.focus();
  }

  return (
    <section id="gallery" className="info-section life">
      <header className="info-header reveal">
        <p className="info-eyebrow">{t('life.eyebrow')}</p>
        <h2 className="info-title">{t('life.title')}</h2>
        <Sprig />
      </header>

      <div className="life__tabs reveal" role="tablist" aria-label={t('life.title')} onKeyDown={handleTabKey}>
        {LIFE_TABS.map((x) => (
          <button
            key={x.id}
            id={`life-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={x.id === tabId}
            aria-controls="life-panel"
            tabIndex={x.id === tabId ? 0 : -1}
            className={`life__tab${x.id === tabId ? ' is-active' : ''}`}
            onClick={() => setTabId(x.id)}
          >
            {t(x.label)}
            <span>{x.photos.length}</span>
          </button>
        ))}
      </div>

      {/* key: replays the entrance when the tab changes. */}
      <div id="life-panel" key={tabId} className="life__panel" role="tabpanel" aria-labelledby={`life-tab-${tabId}`}>
        <p className="life__lead">{t(tab.lead)}</p>
        <ul className="life__grid">
          {shown.map((photo, i) => (
            <li key={photo.id}>
              <button type="button" className="photo-tile photo-tile--label" onClick={() => setOpen(i)}>
                <img src={photo.src} alt={captions[photo.id]} loading="lazy" />
                <span className="photo-tile__caption">{captions[photo.id]}</span>
              </button>
            </li>
          ))}
          {rest > 0 && (
            <li>
              <button type="button" className="life__more" onClick={() => setOpen(shown.length)}>
                <img src={tab.photos[shown.length].src} alt="" loading="lazy" />
                <span>
                  <strong>+{rest}</strong>
                  {t('life.seeAll', { n: tab.photos.length })}
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>

      {open !== null && (
        <Lightbox photos={tab.photos} index={open} onChange={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

// What the place has, one row per group (in the room, kitchen, grounds,
// services): a labelled icon on the left, the items as chips on the right.
export function Amenities() {
  const { t } = useLang();
  return (
    <section id="amenities" className="info-section amenities">
      <header className="amenities__head reveal">
        <p className="info-eyebrow">{t('amenities.eyebrow')}</p>
        <h2 className="info-title">{t('amenities.title')}</h2>
      </header>
      {t('amenities.groups').map((group, i) => (
        <article key={group.icon} className="amenity-row reveal" style={{ '--i': i }}>
          <h3>
            <span className="amenity-row__icon">{ICONS[group.icon]}</span>
            {group.title}
          </h3>
          <ul>
            {group.items.map((item) => (
              <li key={item.label}>
                {item.label}
                {item.note && <span className="amenity-tag">{t(`amenities.${item.note}`)}</span>}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
