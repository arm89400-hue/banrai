import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { promosForRoom, roomMaxGuests, roomNames } from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { fruitPhoto, fruitsIn } from '../lib/seasons';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { useContact } from '../lib/contact';
import { PromoTag } from '../components/BookingBits';
import { useLang } from '../i18n/lang';
import StaySearch from '../components/StaySearch';
import Announcements from '../components/Announcements';
import PhotoSlides from '../components/PhotoSlides';
import { FARM_PHOTOS, heroSlidesNow, partOfDay, roomCover } from '../lib/photos';
import HeroLife from '../components/HeroLife';
import { cachedRooms, rememberRooms } from '../lib/roomCache';
import { Loading, Sk } from '../components/Skeleton';
import './Home.css';

// The page follows what a guest asks, in order: can I stay (photos, dates),
// which room (the five family rooms, as a list), what's it like this month
// (ripe fruit, a day at the farm), and the practical bits (rules, the sign,
// who to call).
export default function Home() {
  const [rooms, setRooms] = useState(() => cachedRooms()?.rooms ?? []);
  const [loaded, setLoaded] = useState(() => Boolean(cachedRooms()));
  const [fees, setFees] = useState({ extra_guest_fee: 500, pet_fee: 100 });
  const [error, setError] = useState(null);
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });
  const { t } = useLang();
  const navigate = useNavigate();
  const promotions = usePromotions();
  const [slides] = useState(heroSlidesNow);
  const [part] = useState(partOfDay);
  const intro = useIntro(slides[0]);
  const [still, setStill] = useStill();
  const heroRef = useRef(null);
  const offscreen = useOffscreen(heroRef);

  useEffect(() => {
    api('/api/rooms')
      .then(rememberRooms)
      .then((data) => {
        setRooms(data.rooms);
        setFees({ extra_guest_fee: data.extra_guest_fee, pet_fee: data.pet_fee });
        setLoaded(true);
      })
      .catch((err) => {
        setError(err.message);
        setLoaded(true);
      });
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    const query = new URLSearchParams({ guests: String(search.guests), step: '1' });
    if (search.checkIn && search.checkOut) {
      query.set('in', search.checkIn);
      query.set('out', search.checkOut);
    }
    navigate(`/book?${query}`);
  }

  return (
    <div className="home">
      <section
        ref={heroRef}
        className={['hero', intro && `is-${intro}`, still && 'is-still', offscreen && 'is-offscreen'].filter(Boolean).join(' ')}
      >
        <PhotoSlides photos={slides} paused={still} />
        <HeroLife part={part} />
        <button
          type="button"
          className="hero__still"
          aria-pressed={still}
          aria-label={t(still ? 'hero.play' : 'hero.pause')}
          title={t(still ? 'hero.play' : 'hero.pause')}
          onClick={() => setStill(!still)}
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
        <div className="hero__in">
          <SeasonChip />
          <h1>
            <span>{t('hero.title')}</span>
          </h1>
          <p>{t('hero.lead')}</p>
        </div>
      </section>

      <form className={`home-search${intro ? ` is-${intro}` : ''}`} onSubmit={handleSearch}>
        <StaySearch
          checkIn={search.checkIn}
          checkOut={search.checkOut}
          guests={search.guests}
          onDates={(dates) => setSearch((s) => ({ ...s, ...dates }))}
          onGuests={(guests) => setSearch((s) => ({ ...s, guests }))}
        >
          <button type="submit" className="home-search__go">
            {t('search.go')}
          </button>
        </StaySearch>
      </form>

      <Announcements source="/api/announcements/home" className="home-news" />

      <Rooms rooms={rooms} loaded={loaded} error={error} promotions={promotions} />

      <ThisMonth />

      <Day />

      <BeforeYouCome fees={fees} />
    </div>
  );
}

// The first time someone opens the site in a visit, the farm comes in as one
// short scene: the photo settles into place, then the name, then the search.
// It waits (briefly) for the photo so the scene never plays on an empty box.
// Later visits, and anyone who asked for less motion, get the page at once.
const INTRO_KEY = 'baanrai-intro-seen';
function useIntro(firstPhoto) {
  const [state, setState] = useState(() => {
    try {
      if (sessionStorage.getItem(INTRO_KEY)) return null;
    } catch {
      return null;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
    return 'waiting';
  });

  useEffect(() => {
    if (state !== 'waiting') return undefined;
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      // Private mode: the intro just plays again next time.
    }
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setState('intro');
    };
    const img = new Image();
    img.onload = start;
    img.onerror = start;
    img.src = firstPhoto;
    if (img.complete) start();
    const giveUp = setTimeout(start, 900);
    return () => clearTimeout(giveUp);
  }, [state, firstPhoto]);

  return state;
}

// The moving picture can be paused (and stays paused on the next visit).
const STILL_KEY = 'baanrai-hero-still';
function useStill() {
  const [still, setStillState] = useState(() => {
    try {
      return localStorage.getItem(STILL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setStill = (next) => {
    setStillState(next);
    try {
      localStorage.setItem(STILL_KEY, next ? '1' : '0');
    } catch {
      // Not saved; it still pauses for now.
    }
  };
  return [still, setStill];
}

// No point animating what nobody can see: pause once the hero scrolls away.
function useOffscreen(ref) {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([entry]) => setOff(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return off;
}

function RoomRowSkeleton({ i }) {
  return (
    <li className="room-row room-row--sk" aria-hidden="true">
      <span className="room-card">
        <Sk className="room-row__sk-photo" h="auto" r="10px" />
        <span className="room-row__text">
          <Sk w={`${44 - (i % 3) * 8}%`} h="1.5em" />
          <Sk w="62%" h="1em" />
        </span>
        <span className="room-row__price">
          <Sk w="84px" h="1.4em" />
        </span>
      </span>
    </li>
  );
}

// The rooms are named after the family's generations and already cost less
// down the line, so they read as one list in that order, not a card grid.
function Rooms({ rooms, loaded, error, promotions }) {
  const { lang, t } = useLang();
  const sorted = [...rooms].sort((a, b) => b.price - a.price || a.id - b.id);

  return (
    <section id="rooms" className="home-sec home-rooms" aria-labelledby="home-rooms">
      <div className="home-sec__hd">
        <h2 id="home-rooms">{t('rooms.title')}</h2>
        <p>{t('rooms.family')}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!loaded && (
        <Loading label={t('loading')} className="room-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <RoomRowSkeleton key={i} i={i} />
          ))}
        </Loading>
      )}
      {loaded && !error && rooms.length === 0 && <p className="home-empty">{t('rooms.none')}</p>}
      {sorted.length > 0 && (
        <ul className="room-list">
          {sorted.map((room) => {
            const names = roomNames(room.name, lang);
            const max = roomMaxGuests(room);
            const promos = promosForRoom(promotions, room.id);
            return (
              <li key={room.id} className="room-row">
                <Link to={`/rooms/${room.id}`} className="room-card">
                  <img src={roomCover(room)} alt="" loading="lazy" onError={(e) => (e.currentTarget.src = FARM_PHOTOS.main)} />
                  <span className="room-row__text">
                    <strong>{names.title}</strong>
                    {names.subtitle && <small>{names.subtitle}</small>}
                    <span className="room-row__facts">
                      {room.capacity && max > room.capacity
                        ? t('rooms.guestsRange', { from: room.capacity, to: max })
                        : t('rooms.guests', { n: room.capacity || max })}
                      {' · '}
                      {t('rooms.breakfast')}
                    </span>
                    {promos.length > 0 && (
                      <span className="room-row__promos">
                        {promos.map((p) => (
                          <PromoTag key={p.id} promo={p} />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="room-row__price">
                    <b>{formatBaht(room.price)}</b>
                    <small>{t('room.perNight')}</small>
                    <span className="room-row__go">{t('home.seeRoom')}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// What's ripe right now, from the fruit calendar. Changes by itself each month.
function ThisMonth() {
  const { locale, t } = useLang();
  const month = new Date().getMonth() + 1;
  const ripe = fruitsIn(month).slice(0, 4);
  if (!ripe.length) return null;
  const names = t('fruits');
  const monthName = (m, style) => new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: style });

  return (
    <section className="home-sec home-month" aria-labelledby="home-month">
      <div className="home-sec__hd">
        <div>
          <h2 id="home-month">{t('season.monthTitle', { month: monthName(month, 'long') })}</h2>
          <p>{t('season.monthNote')}</p>
        </div>
        <Link to="/activities#seasons" className="home-link">
          {t('home.allYear')}
        </Link>
      </div>
      <ul className="fruit-row" style={{ '--n': ripe.length, '--n-phone': ripe.length === 4 ? 2 : ripe.length }}>
        {ripe.map((f) => (
          <li key={f.id}>
            <img src={fruitPhoto(f.id)} alt="" loading="lazy" />
            <strong>{names[f.id] ?? f.id}</strong>
            <span>
              {monthName(f.from, 'short')} – {monthName(f.to, 'short')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// A day at the farm, in the order it happens.
function Day() {
  const { t } = useLang();
  const items = t('day.items');
  const parts = t('day.parts');
  return (
    <section className="home-sec" aria-labelledby="home-day">
      <div className="home-sec__hd">
        <h2 id="home-day">{t('day.title')}</h2>
        <Link to="/activities" className="home-link">
          {t('day.more')}
        </Link>
      </div>
      <ol className="day-line">
        {parts.map((part) => (
          <li key={part.id} className={`day-line__part day-line__part--${part.id}`}>
            <h3>{part.label}</h3>
            <div className="day-line__photos">
              {items
                .filter((item) => item.part === part.id)
                .map((item) => (
                  <figure key={item.photo}>
                    <img src={`/images/farm/${item.photo}.jpg`} alt="" loading="lazy" />
                    <figcaption>
                      <b>{item.title}</b>
                      {item.note && <span>{item.note}</span>}
                    </figcaption>
                  </figure>
                ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BeforeYouCome({ fees }) {
  const { lang, t } = useLang();
  const contact = useContact();
  const sign = t('day.sign');
  return (
    <section className="home-sec home-before" aria-labelledby="home-before">
      <figure className="home-before__sign">
        <img src="/images/farm/sign.jpg" alt="" loading="lazy" />
        <figcaption>
          <span>
            <b>{sign.title}</b> · {sign.note}
          </span>
          {contact.maps && (
            <a href={contact.maps} target="_blank" rel="noopener noreferrer" className="home-link">
              {t('stay.map')}
            </a>
          )}
        </figcaption>
      </figure>

      <div className="home-before__text">
        <h2 id="home-before">{t('rules.title')}</h2>
        <dl className="rules">
          <div>
            <dt>{t('rules.in')}</dt>
            <dd>{CHECK_IN_TIME}</dd>
          </div>
          <div>
            <dt>{t('rules.out')}</dt>
            <dd>{CHECK_OUT_TIME}</dd>
          </div>
          <div>
            <dt>{t('rules.deposit')}</dt>
            <dd>{t('rules.depositValue')}</dd>
          </div>
          <div>
            <dt>{t('rules.extra')}</dt>
            <dd>{t('rules.perNight', { price: formatBaht(fees.extra_guest_fee) })}</dd>
          </div>
          <div>
            <dt>{t('rules.pets')}</dt>
            <dd>{t('rules.perNight', { price: formatBaht(fees.pet_fee) })}</dd>
          </div>
          <div>
            <dt>{t('rules.cancel')}</dt>
            <dd>{t('rules.cancelValue')}</dd>
          </div>
        </dl>

        {contact.phones.length > 0 && (
          <div className="home-call">
            <p>{t('home.ask')}</p>
            <div className="home-call__btns">
              {contact.phones.map((p) => (
                <a key={p.tel} href={`tel:${p.tel}`} className="home-call__btn">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                  </svg>
                  <span>
                    {p.name[lang] ?? p.name.th}
                    <small>{p.display}</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SeasonChip() {
  const { lang, t } = useLang();
  const ripe = fruitsIn(new Date().getMonth() + 1).slice(0, 3);
  if (!ripe.length) return null;
  const names = t('fruits');
  return (
    <span className="hero-season">
      <span className="hero-season__pics" aria-hidden="true">
        {ripe.map((f) => (
          <img key={f.id} src={fruitPhoto(f.id)} alt="" />
        ))}
      </span>
      {t('season.now', { fruits: ripe.map((f) => names[f.id] ?? f.id).join(lang === 'en' ? ', ' : ' ') })}
    </span>
  );
}
