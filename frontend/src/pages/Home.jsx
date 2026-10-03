import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { MAX_GUESTS, promosForRoom, roomMaxGuests, roomNames } from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { PromoTag } from '../components/BookingBits';
import { useLang } from '../i18n/lang';
import DateRangePicker from '../components/DateRangePicker';
import { FARM_PHOTOS, HERO_SLIDES } from '../lib/photos';
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
        <HeroSlides />
        <div className="hero__overlay">
          <div className="hero__content">
            <h1>{t('hero.eyebrow')}</h1>
            <h1>{t('hero.title')}</h1>
            <p>{t('hero.lead')}</p>
          </div>

          <form className="search-bar" onSubmit={handleSearch}>
            <DateRangePicker
              checkIn={search.checkIn}
              checkOut={search.checkOut}
              onChange={(dates) => setSearch({ ...search, ...dates })}
            />
            <label>
              <span>{t('search.guests')}</span>
              <input
                type="number"
                min="1"
                max={MAX_GUESTS}
                value={search.guests}
                onChange={(e) => {
                  const value = Math.min(MAX_GUESTS, Math.max(1, Number(e.target.value) || 1));
                  setSearch({ ...search, guests: value });
                }}
              />
            </label>
            <button type="submit">{t('search.submit')}</button>
          </form>
        </div>
      </section>

      <RoomsShowcase rooms={rooms} error={error} promotions={promotions} />

      <FarmStory />
      <FarmLife />
      <Amenities />
    </>
  );
}

// How long each hero photo stays before the next fades in.
const HERO_SLIDE_MS = 6000;

// Decorative slideshow behind the hero: loops through HERO_SLIDES, one
// cross-fade every HERO_SLIDE_MS. A photo is only requested just before it
// is shown, so the page doesn't download all of them up front. With reduced
// motion it stays on the first photo.
function HeroSlides() {
  const [step, setStep] = useState(0); // counts up forever; slide = step % length
  const active = step % HERO_SLIDES.length;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep((s) => s + 1), HERO_SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hero__slides" aria-hidden="true">
      {HERO_SLIDES.map((src, i) => (
        <div
          key={src}
          className={`hero__slide${i === active ? ' is-active' : ''}`}
          style={i <= step + 1 ? { backgroundImage: `url(${src})` } : undefined}
        />
      ))}
    </div>
  );
}

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
  const photoSrc = !active || missing[active.id] ? FARM_PHOTOS.main : active.image_url || `/images/rooms/room-${active.id}.jpg`;

  return (
    <section id="rooms" className="rooms-section">
      <header className="rooms__head reveal">
        <div>
          <p className="info-eyebrow">{t('rooms.eyebrow')}</p>
          <h2 className="info-title">{t('rooms.title')}</h2>
        </div>
        <p className="rooms__lead">{t('rooms.lead')}</p>
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
