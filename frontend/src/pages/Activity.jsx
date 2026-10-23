import HeroLife from '../components/HeroLife';
import { useEffect, useRef, useState } from 'react';
import { FRUIT_SEASONS, fruitPhoto, inRange } from '../lib/seasons';
import { api } from '../lib/api';
import { listingPhotos, partOfDay } from '../lib/photos';
import { formatBaht } from '../lib/money';
import { shift } from '../lib/motion';
import { useLang } from '../i18n/lang';
import FruitViewer from '../components/FruitViewer';
import { Loading, Sk, SkText } from '../components/Skeleton';
import Lightbox from '../components/Lightbox';
import './Activity.css';

const FALLBACK_PHOTOS = {
  fruit: '/images/farm/harvest.jpg',
  cook: '/images/farm/booking-cook1.jpg',
  eggs: '/images/farm/around-eggs.jpg',
  bbq: '/images/farm/home-bbq5.jpg',
  planting: '/images/farm/around-planting.jpg',
};

function localize(a, lang) {
  const pick = (en, th) => (lang === 'th' ? th || en : en || th);
  return {
    id: a.id,
    title: pick(a.name, a.name_th),
    text: pick(a.description, a.description_th),
    tag: pick(a.tag, a.tag_th),
    price: Number(a.price) || 0,
    photos: listingPhotos(a),
  };
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const prevMonth = (m) => (m === 1 ? 12 : m - 1);
const nextMonth = (m) => (m === 12 ? 1 : m + 1);

function ActivityCard({ item, onOpen }) {
  const { t } = useLang();
  const cover = item.photos[0];
  return (
    <li id={`activity-${item.id}`} className="act-card">
      {cover ? (
        <button
          type="button"
          className="act-card__photo"
          onClick={(e) => onOpen(item, 0, e.currentTarget.querySelector('img'))}
          aria-label={t('activities.photoOf', { name: item.title, n: 1, total: item.photos.length })}
        >
          <img src={cover.src} alt="" loading="lazy" />
          {item.photos.length > 1 && (
            <span className="act-card__count">{t('activities.photos', { n: item.photos.length })}</span>
          )}
        </button>
      ) : (
        <span className="act-card__photo act-card__photo--empty" aria-hidden="true" />
      )}
      <div className="act-card__head">
        <h3>{item.title}</h3>
        {item.price > 0 && <span className="act-pill">{formatBaht(item.price)}</span>}
      </div>
      {(item.tag || item.text) && <p>{[item.tag, item.text].filter(Boolean).join(' · ')}</p>}
    </li>
  );
}

// Same shape as the real cards, so the page doesn't jump when they arrive.
function ActivitiesSkeleton() {
  const { t } = useLang();
  const card = (i) => (
    <li key={i} className="act-card">
      <Sk className="act-card__photo" h="auto" r="12px" />
      <Sk w={`${44 - (i % 3) * 8}%`} h="1.3em" />
      <SkText lines={2} last="70%" size="0.9em" />
    </li>
  );
  return (
    <Loading label={t('loading')}>
      <ul className="act-cards act-cards--big">{[0, 1].map(card)}</ul>
      <ul className="act-cards act-cards--small">{[2, 3, 4].map(card)}</ul>
    </Loading>
  );
}

export default function Activity() {
  const { t, lang, locale } = useLang();
  const thisMonth = new Date().getMonth() + 1;
  const [activities, setActivities] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [open, setOpen] = useState(null);
  const calRef = useRef(null);

  useEffect(() => {
    api('/api/activities')
      .then((data) => setActivities(data.activities))
      .catch(() => setLoadFailed(true));
  }, []);

  const items = loadFailed
    ? t('activities.items').map((item) => ({ ...item, photos: [{ id: item.id, src: FALLBACK_PHOTOS[item.id] }] }))
    : (activities ?? []).map((a) => localize(a, lang));

  const ready = Boolean(activities) || loadFailed;
  useEffect(() => {
    if (!ready || !window.location.hash.startsWith('#activity-')) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [ready]);

  useEffect(() => {
    const cal = calRef.current;
    const now = cal?.querySelector('thead th.is-now');
    if (!now || cal.scrollWidth <= cal.clientWidth) return;
    const name = cal.querySelector('thead th').offsetWidth;
    cal.scrollLeft = now.offsetLeft - name - now.offsetWidth;
  }, []);

  const names = t('fruits');
  const monthName = (m, style) => new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: style });
  const range = (f) => `${monthName(f.from, 'short')} – ${monthName(f.to, 'short')}`;
  const showFruit = (id, e) =>
    shift(() => setOpen(FRUIT_SEASONS.findIndex((f) => f.id === id)), {
      from: e?.currentTarget.querySelector('img'),
      to: '.fruit-viewer__photo img',
    });
  const openGallery = (item, index, from) =>
    shift(() => setGallery({ photos: item.photos.map((p) => ({ ...p, caption: item.title })), index }), {
      from,
      to: '.lightbox__figure img',
    });

  const ripe = FRUIT_SEASONS.filter((f) => inRange(f, thisMonth));
  const big = items.slice(0, 2);
  const small = items.slice(2);

  return (
    <div className="acts">
      <header className="acts-top">
        <img src="/images/farm/around-planting.jpg" alt="" />
        <HeroLife part={partOfDay()} pausable />
        <div className="acts-top__in">
          <h1>{t('activities.title')}</h1>
          <p>{t('activities.lead')}</p>
        </div>
      </header>

      <section className="acts-sec" aria-labelledby="acts-list">
        <h2 id="acts-list">{t('activities.listTitle')}</h2>
        {!ready && <ActivitiesSkeleton />}
        {big.length > 0 && (
          <ul className="act-cards act-cards--big">
            {big.map((item) => (
              <ActivityCard key={item.id} item={item} onOpen={openGallery} />
            ))}
          </ul>
        )}
        {small.length > 0 && (
          <ul className="act-cards act-cards--small">
            {small.map((item) => (
              <ActivityCard key={item.id} item={item} onOpen={openGallery} />
            ))}
          </ul>
        )}
      </section>

      <section className="acts-sec" aria-labelledby="acts-ripe">
        <div className="acts-sec__hd">
          <h2 id="acts-ripe">{t('season.monthTitle', { month: monthName(thisMonth, 'long') })}</h2>
          {ripe.length > 0 && <p>{t('season.monthNote')}</p>}
        </div>
        {ripe.length === 0 ? (
          <p className="acts-empty">{t('season.none')}</p>
        ) : (
          <ul className="ripe" style={{ '--cols': Math.min(ripe.length, 4) }}>
            {ripe.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={(e) => showFruit(f.id, e)}>
                  <img src={fruitPhoto(f.id)} alt="" loading="lazy" />
                  <strong>{names[f.id]}</strong>
                  <span>{range(f)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acts-sec" id="seasons" aria-labelledby="acts-year">
        <div className="acts-sec__hd">
          <h2 id="acts-year">{t('season.title')}</h2>
          <p>{t('season.countNow', { month: monthName(thisMonth, 'short'), n: ripe.length })}</p>
        </div>
        <div className="fruit-cal" ref={calRef}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('season.fruitCol')}</th>
                {MONTHS.map((m) => (
                  <th key={m} scope="col" className={m === thisMonth ? 'is-now' : undefined}>
                    <abbr title={monthName(m, 'long')}>{monthName(m, 'short')}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FRUIT_SEASONS.map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    <button type="button" onClick={(e) => showFruit(f.id, e)}>
                      <img src={fruitPhoto(f.id)} alt="" loading="lazy" />
                      {names[f.id]}
                    </button>
                  </th>
                  {MONTHS.map((m) => {
                    const on = inRange(f, m);
                    const cls = [
                      m === thisMonth && 'is-now',
                      on && 'is-on',
                      on && !inRange(f, prevMonth(m)) && 'is-start',
                      on && !inRange(f, nextMonth(m)) && 'is-end',
                    ].filter(Boolean);
                    return (
                      <td key={m} className={cls.join(' ') || undefined}>
                        {on && (
                          <span>
                            <b className="fruit-cal__sr">{t('season.harvest')}</b>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {gallery && (
        <Lightbox
          photos={gallery.photos}
          index={gallery.index}
          onChange={(index) => setGallery((g) => ({ ...g, index }))}
          onClose={() => setGallery(null)}
        />
      )}
      {open !== null && <FruitViewer index={open} onChange={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}
