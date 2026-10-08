import { useState } from 'react';
import { THAI_NAME } from '../lib/site';
import { AROUND_PHOTOS, FARM_PHOTOS, FRUIT_PHOTOS, TABLE_PHOTOS } from '../lib/photos';
import { useLang } from '../i18n/lang';
import Lightbox from '../components/Lightbox';
import './HomeSections.css';

// Informational sections of the Home page (below the room list). The text
// lives in i18n/strings.js (Thai + English), taken from the property's
// pinned Facebook post; the photos are the property's own (lib/photos.js).

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
        <h2 className="info-title">{t('farm.title')}</h2>
        <p className="farm__thai" lang="th">
          {THAI_NAME}
        </p>
        <p className="farm__lead">{t('farm.lead')}</p>

        <ul className="farm__highlights">
          {t('farm.highlights').map((h) => (
            <li key={h.title}>
              <strong>{h.title}</strong>
              <span>{h.text}</span>
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
        <h2 className="info-title">{t('life.title')}</h2>
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
        <h2 className="info-title">{t('amenities.title')}</h2>
      </header>
      {t('amenities.groups').map((group, i) => (
        <article key={group.icon} className="amenity-row reveal" style={{ '--i': i }}>
          <h3>
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
