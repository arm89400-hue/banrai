import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import {
  bookedNightSet,
  formatDay,
  nightsBetween,
  priceStay,
  promoFor,
  promosForRoom,
  roomMaxGuests,
  roomNames,
} from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { useLang } from '../i18n/lang';
import InlineCalendar from '../components/InlineCalendar';
import { PriceRows, PromoTag } from '../components/BookingBits';
import './RoomPage.css';

// One room's own page: photos, what's in the room, and a booking card
// whose calendar crosses out the nights this room is already taken.
// "Reserve" hands the chosen dates to the booking flow's details step.
export default function RoomPage() {
  const { id } = useParams();
  const { t, lang, locale } = useLang();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [fee, setFee] = useState(0); // Baht per extra guest per night
  const [petRule, setPetRule] = useState({ fee: 0, maxKg: 0 });
  const [others, setOthers] = useState([]);
  const [booked, setBooked] = useState([]);
  const [missing, setMissing] = useState(false);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [guests, setGuests] = useState(2);

  // Loads this room, its taken dates and the other rooms. Resets the
  // selection when moving from one room's page to another.
  useEffect(() => {
    let stale = false;
    setRoom(null);
    setMissing(false);
    setDates({ checkIn: '', checkOut: '' });

    api(`/api/rooms/${id}`)
      .then((data) => {
        if (stale) return;
        setRoom(data.room);
        setFee(Number(data.extra_guest_fee) || 0);
        setPetRule({ fee: Number(data.pet_fee) || 0, maxKg: Number(data.pet_max_kg) || 0 });
      })
      .catch(() => !stale && setMissing(true));
    api(`/api/rooms/${id}/booked`)
      .then((data) => !stale && setBooked(data.booked))
      .catch(() => !stale && setBooked([]));
    api('/api/rooms')
      .then((data) => {
        if (stale) return;
        setOthers(data.rooms.filter((r) => String(r.id) !== String(id)).sort((a, b) => b.price - a.price));
      })
      .catch(() => {});

    window.scrollTo(0, 0);
    return () => {
      stale = true;
    };
  }, [id]);

  const promotions = usePromotions();
  const bookedNights = useMemo(() => bookedNightSet(booked), [booked]);
  const nights = nightsBetween(dates.checkIn, dates.checkOut);

  if (missing) {
    return (
      <section className="bk-page room-page room-page--empty">
        <h1>{t('room.notFound')}</h1>
        <Link className="bk-btn bk-btn--primary" to="/home#rooms">
          {t('room.backToRooms')}
        </Link>
      </section>
    );
  }
  if (!room) return <section className="bk-page room-page" aria-busy="true" />;

  const names = roomNames(room.name, lang);
  const maxGuests = roomMaxGuests(room);
  // The promotion for the chosen check-in day, and every one this room has.
  const promo = promoFor(promotions, room.id, dates.checkIn);
  const roomPromos = promosForRoom(promotions, room.id);
  const quote = priceStay(room, nights, Math.min(guests, maxGuests), fee, 0, 0, promo);
  const inRoom = t('amenities.groups')[0];

  function reserve() {
    const query = new URLSearchParams({
      room: String(room.id),
      in: dates.checkIn,
      out: dates.checkOut,
      guests: String(Math.min(guests, maxGuests)),
      step: '3',
    });
    navigate(`/book?${query}`);
  }

  return (
    <section className="bk-page room-page">
      <div className="room-page__main">
        <div className="room-gallery">
          <div className="room-gallery__main">
            <img
              src={room.image_url || `/images/rooms/room-${room.id}.jpg`}
              alt={names.title}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="room-gallery__side">
            <img src="/images/hero.jpg" alt={t('room.housePhoto')} />
          </div>
        </div>

        <h1>{names.title}</h1>
        {names.subtitle && <p className="room-page__subtitle">{names.subtitle}</p>}
        <p className="room-page__meta">
          {t('room.times', { in: CHECK_IN_TIME, out: CHECK_OUT_TIME })}
        </p>
        <ul className="room-page__price-facts">
          <li>{t('price.perRoomNight')}</li>
          {room.capacity && <li>{t('price.includes', { n: room.capacity })}</li>}
          {room.capacity && room.max_extra_guests > 0 && (
            <li>{t('price.extraAllowed', { n: room.max_extra_guests, fee: formatBaht(fee) })}</li>
          )}
          {petRule.fee > 0 && (
            <li>{t('price.petRule', { fee: formatBaht(petRule.fee), kg: petRule.maxKg })}</li>
          )}
        </ul>
        {room.description && <p className="room-page__description">{room.description}</p>}

        <h2>{t('room.inRoom')}</h2>
        <ul className="room-chips">
          {inRoom.items.map((item) => (
            <li key={item.label}>{item.label}</li>
          ))}
        </ul>

      </div>

      <aside className="room-card-book">
        <p className="room-card-book__price">
          {formatBaht(room.price)} <small>{t('room.perNight')}</small>
          <span className="room-card-book__breakfast">{t('price.breakfast')}</span>
        </p>
        {roomPromos.map((p) => (
          <PromoTag key={p.id} promo={p} />
        ))}

        <div className="room-card-book__dates">
          <div>
            <small>{t('sum.checkIn')}</small>
            <span>{dates.checkIn ? formatDay(dates.checkIn, locale) : '—'}</span>
          </div>
          <div>
            <small>{t('sum.checkOut')}</small>
            <span>{dates.checkOut ? formatDay(dates.checkOut, locale) : '—'}</span>
          </div>
        </div>

        <InlineCalendar
          checkIn={dates.checkIn}
          checkOut={dates.checkOut}
          bookedNights={bookedNights}
          onChange={setDates}
        />

        <div className="room-card-book__guests">
          <span className="bk-label">{t('flow.guests')}</span>
          <div className="bk-counter">
            <button type="button" onClick={() => setGuests((g) => g - 1)} disabled={guests <= 1} aria-label={t('flow.fewer')}>
              −
            </button>
            <output aria-live="polite">{Math.min(guests, maxGuests)}</output>
            <button type="button" onClick={() => setGuests((g) => g + 1)} disabled={guests >= maxGuests} aria-label={t('flow.more')}>
              +
            </button>
            <span>{t('flow.guestUnit')}</span>
          </div>
        </div>

        {nights > 0 ? (
          <PriceRows
            price={room.price}
            nights={nights}
            extraGuests={quote.extraGuests}
            fee={fee}
            discount={quote.discount}
            promoName={promo && `${promo.name} (-${promo.percent}%)`}
          />
        ) : (
          <p className="room-card-book__hint">{t('room.selectDates')}</p>
        )}

        <button type="button" className="bk-btn bk-btn--sun bk-btn--block" disabled={!nights} onClick={reserve}>
          {t('room.reserve')}
        </button>
        <p className="room-card-book__note">{t('room.noCharge')}</p>
      </aside>

      {others.length > 0 && (
        <div className="room-page__others">
          <h2>{t('room.others')}</h2>
          <div className="room-others">
            {others.map((r) => (
              <Link key={r.id} to={`/rooms/${r.id}`}>
                <strong>{roomNames(r.name, lang).title}</strong>
                <span>
                  <b>{formatBaht(r.price)}</b> {t('room.perNight')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
