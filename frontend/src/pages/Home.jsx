import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { promosForRoom, roomMaxGuests, roomNames } from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { fruitPhoto, fruitsIn } from '../lib/seasons';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { PromoTag } from '../components/BookingBits';
import { useLang } from '../i18n/lang';
import StaySearch from '../components/StaySearch';
import PhotoSlides from '../components/PhotoSlides';
import Announcements from '../components/Announcements';
import { FARM_PHOTOS, HERO_SLIDES, roomCover } from '../lib/photos';
import './Home.css';

export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [fees, setFees] = useState({ extra_guest_fee: 500, pet_fee: 100 });
  const [error, setError] = useState(null);
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });
  const { t } = useLang();
  const navigate = useNavigate();
  const promotions = usePromotions();

  useEffect(() => {
    api('/api/rooms')
      .then((data) => {
        setRooms(data.rooms);
        setFees({ extra_guest_fee: data.extra_guest_fee, pet_fee: data.pet_fee });
      })
      .catch((err) => setError(err.message));
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
      <section className="hero">
        <PhotoSlides photos={HERO_SLIDES} />
        <div className="hero__in">
          <SeasonChip />
          <h1>{t('hero.title')}</h1>
          <p>{t('hero.lead')}</p>
        </div>
      </section>

      <form className="home-search" onSubmit={handleSearch}>
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

      <Rooms rooms={rooms} error={error} promotions={promotions} />

      <section className="home-sec">
        <div className="home-sec__hd">
          <h2>{t('day.title')}</h2>
          <Link to="/activities" className="home-link">
            {t('day.more')}
          </Link>
        </div>
        <div className="day-grid">
          {t('day.items').map((item) => (
            <figure key={item.photo}>
              <img src={`/images/farm/${item.photo}.jpg`} alt="" loading="lazy" />
              <figcaption>
                <b>{item.title}</b>
                {item.note && <> · {item.note}</>}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="home-sec">
        <h2>{t('rules.title')}</h2>
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
      </section>
    </div>
  );
}

function SeasonChip() {
  const { t } = useLang();
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
      {t('season.now', { fruits: ripe.map((f) => names[f.id] ?? f.id).join(' ') })}
    </span>
  );
}

function Rooms({ rooms, error, promotions }) {
  const { lang, t } = useLang();
  const sorted = [...rooms].sort((a, b) => b.price - a.price);

  const card = (room) => {
    const names = roomNames(room.name, lang);
    const max = roomMaxGuests(room);
    const promos = promosForRoom(promotions, room.id);
    return (
      <Link key={room.id} to={`/rooms/${room.id}`} className="room-card">
        <img src={roomCover(room)} alt="" loading="lazy" onError={(e) => (e.currentTarget.src = FARM_PHOTOS.main)} />
        <span className="room-card__row">
          <strong>{names.title}</strong>
          <b>
            {formatBaht(room.price)} <small>{t('room.perNight')}</small>
          </b>
        </span>
        <span className="room-card__facts">
          {room.capacity && max > room.capacity ? t('rooms.guestsRange', { from: room.capacity, to: max }) : t('rooms.guests', { n: room.capacity || max })}
          {' · '}
          {t('rooms.breakfast')}
        </span>
        {promos.length > 0 && (
          <span className="room-card__promos">
            {promos.map((p) => (
              <PromoTag key={p.id} promo={p} />
            ))}
          </span>
        )}
      </Link>
    );
  };

  return (
    <section id="rooms" className="home-sec">
      <div className="home-sec__hd">
        <h2>{t('rooms.title')}</h2>
        <p>{t('rooms.family')}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!error && rooms.length === 0 && <p className="home-empty">{t('rooms.none')}</p>}
      {sorted.length > 0 && (
        <div className="room-cards">
          <div className="room-cards__big">{sorted.slice(0, 2).map(card)}</div>
          <div className="room-cards__small">{sorted.slice(2).map(card)}</div>
        </div>
      )}
    </section>
  );
}
