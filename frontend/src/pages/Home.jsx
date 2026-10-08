import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { MAX_GUESTS, promosForRoom, roomMaxGuests, roomNames } from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { PromoTag } from '../components/BookingBits';
import { useLang } from '../i18n/lang';
import DateRangePicker from '../components/DateRangePicker';
import PhotoSlides from '../components/PhotoSlides';
import Announcements from '../components/Announcements';
import { FARM_PHOTOS, HERO_SLIDES, roomCover } from '../lib/photos';
import { Amenities, FarmLife, FarmStory } from './HomeSections';
import './Home.css';

// Public landing page: full-bleed hero with a quick-search bar (dates +
// guests) over a slideshow of the property, followed by the rooms (a list to
// compare, with a photo beside it), the farmstay's story, a tabbed gallery
// of farm life (fruit, food, grounds) and the amenities.
// Searching starts the booking flow (/book); each room opens its own page
// (/rooms/:id).
export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });
  const { t } = useLang();
  const navigate = useNavigate();
  const promotions = usePromotions();

  // Loads the room list once on mount.
  useEffect(() => {
    api('/api/rooms')
      .then((data) => setRooms(data.rooms))
      .catch((err) => setError(err.message));
  }, []);

  // Hands the picked dates and guest count to the booking flow: straight
  // to the list of available rooms if both dates are set, otherwise to its
  // first step.
  function handleSearch(e) {
    e.preventDefault();
    const query = new URLSearchParams({ guests: String(search.guests) });
    const hasRange = Boolean(search.checkIn && search.checkOut);
    if (hasRange) {
      query.set('in', search.checkIn);
      query.set('out', search.checkOut);
    }
    query.set('step', hasRange ? '2' : '1');
    navigate(`/book?${query}`);
  }

  return (
    <>
      <section className="hero">
        <PhotoSlides photos={HERO_SLIDES} />
        <div className="hero__overlay">
          <div className="hero__content">
            <h1>{t('hero.title')}</h1>
            {/* Break only between phrases, never inside a Thai word. */}
            <p>
              {t('hero.lead')
                .split(' ')
                .map((phrase, i) => (
                  <span key={i} className="hero__phrase">
                    {phrase}{' '}
                  </span>
                ))}
            </p>
          </div>

          {/* One capsule: dates | guests | search + book. */}
          <form className="search-bar" onSubmit={handleSearch}>
            <div className="search-bar__seg">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              <DateRangePicker
                checkIn={search.checkIn}
                checkOut={search.checkOut}
                onChange={(dates) => setSearch({ ...search, ...dates })}
              />
            </div>
            <div className="search-bar__seg">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M17 14c2.4 0 4 1.5 4.6 4" />
              </svg>
              <div className="search-bar__guests">
                <span className="search-bar__label">{t('search.guests')}</span>
                <div className="search-bar__stepper">
                  <button
                    type="button"
                    onClick={() => setSearch((s) => ({ ...s, guests: s.guests - 1 }))}
                    disabled={search.guests <= 1}
                    aria-label={t('flow.fewer')}
                  >
                    −
                  </button>
                  <output aria-live="polite">{search.guests}</output>
                  <button
                    type="button"
                    onClick={() => setSearch((s) => ({ ...s, guests: s.guests + 1 }))}
                    disabled={search.guests >= MAX_GUESTS}
                    aria-label={t('flow.more')}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="search-bar__actions">
              {/* One button: opens booking with the dates and guests picked here. */}
              <button type="submit" className="search-bar__book">
                {t('nav.book')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Announcements for everyone; takes no space when there are none. */}
      <Announcements source="/api/announcements/home" className="home-news" />

      <RoomsShowcase rooms={rooms} error={error} promotions={promotions} />

      <FarmStory />
      <FarmLife />
      <Amenities />
    </>
  );
}

// How long each hero photo stays before the next fades in.
// The five rooms as one list to compare at a glance (name, who it sleeps,
// price), with a large photo beside it that follows the room under the
// cursor or keyboard focus. Rooms without their own photo yet show the
// house instead, captioned so it isn't mistaken for the room.
function RoomsShowcase({ rooms, error, promotions }) {
  const { lang, t } = useLang();
  // Generation order (Father's room first), which is also price order.
  const sorted = [...rooms].sort((a, b) => b.price - a.price);
  const [activeId, setActiveId] = useState(null);
  const [missing, setMissing] = useState({}); // room id -> has no photo
  const active = sorted.find((r) => r.id === activeId) ?? sorted[0];
  const activeNames = active ? roomNames(active.name, lang) : null;
  const photoSrc = !active || missing[active.id] ? FARM_PHOTOS.main : roomCover(active);

  return (
    <section id="rooms" className="rooms-section">
      <header className="rooms__head reveal">
        <div>
          <h2 className="info-title">{t('rooms.title')}</h2>
        </div>
      </header>

      {error && <p role="alert">{error}</p>}
      {!error && rooms.length === 0 && <p className="rooms-empty">{t('rooms.none')}</p>}

      {active && (
        <div className="rooms__layout">
          <figure className="rooms__photo reveal">
            <img
              key={photoSrc}
              src={photoSrc}
              alt={missing[active.id] ? t('room.housePhoto') : activeNames.title}
              onError={() => setMissing((m) => ({ ...m, [active.id]: true }))}
            />
            <figcaption>
              <strong>{activeNames.title}</strong>
              <span>{missing[active.id] ? t('rooms.noPhoto') : activeNames.subtitle}</span>
            </figcaption>
          </figure>

          <ol className="rooms__list">
            {sorted.map((room, index) => {
              const names = roomNames(room.name, lang);
              const promos = promosForRoom(promotions, room.id);
              return (
                <li key={room.id} className="reveal" style={{ '--i': index }}>
                  <Link
                    to={`/rooms/${room.id}`}
                    className={`room-row${room.id === active.id ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveId(room.id)}
                    onFocus={() => setActiveId(room.id)}
                  >
                    <span className="room-row__names">
                      <strong>{names.title}</strong>
                      {names.subtitle && <span>{names.subtitle}</span>}
                    </span>
                    <span className="room-row__facts">
                      {room.capacity ? t('price.includes', { n: room.capacity }) : ''}
                      {room.capacity && room.max_extra_guests > 0 && (
                        <> · {t('rooms.upTo', { n: roomMaxGuests(room) })}</>
                      )}
                    </span>
                    <span className="room-row__price">
                      <strong>{formatBaht(room.price)}</strong>
                      <small>{t('room.perNight')}</small>
                    </span>
                    <span className="room-row__go" aria-hidden="true">
                      →
                    </span>
                    {promos.length > 0 && (
                      <span className="room-row__promos">
                        {promos.map((p) => (
                          <PromoTag key={p.id} promo={p} />
                        ))}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}

    </section>
  );
}
