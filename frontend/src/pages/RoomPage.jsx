import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { bookedNightSet, nightsBetween, priceStay, promoFor, promosForRoom, roomMaxGuests, roomNames } from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { useLang } from '../i18n/lang';
import DateRangePicker from '../components/DateRangePicker';
import { PriceRows, PromoTag } from '../components/BookingBits';
import Lightbox from '../components/Lightbox';
import { roomCover, roomPhotos } from '../lib/photos';
import './RoomPage.css';

// One room's own page: photos, what it costs and what's in it, and a
// booking card (dates, guests, the price worked out). The calendar crosses
// out the nights this room is already taken, so a chosen stay is always
// free. "Book this room" hands the dates to the booking flow's details step.
// On phones a bar at the bottom keeps the price and the button in reach.
export default function RoomPage() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [fee, setFee] = useState(0); // Baht per extra guest per night
  const [petRule, setPetRule] = useState({ fee: 0, maxKg: 0 });
  const [others, setOthers] = useState([]);
  const [booked, setBooked] = useState([]);
  const [missing, setMissing] = useState(false);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [guests, setGuests] = useState(2);
  const [viewing, setViewing] = useState(null); // index of the photo open in the viewer

  // Loads this room, its taken dates and the other rooms. Resets the
  // selection when moving from one room's page to another.
  useEffect(() => {
    let stale = false;
    setRoom(null);
    setMissing(false);
    setDates({ checkIn: '', checkOut: '' });
    setViewing(null);

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

  // The phone's bottom bar is in the chat button's corner: lift the chat
  // button above it while this page is open.
  useEffect(() => {
    document.body.classList.add('has-bottom-bar');
    return () => document.body.classList.remove('has-bottom-bar');
  }, []);

  if (missing) {
    return (
      <section className="room-page room-page--empty">
        <h1>{t('room.notFound')}</h1>
        <Link className="bk-btn bk-btn--primary" to="/home#rooms">
          {t('room.backToRooms')}
        </Link>
      </section>
    );
  }
  if (!room) return <section className="room-page" aria-busy="true" />;

  const names = roomNames(room.name, lang);
  const gallery = roomPhotos(room).map((p) => ({ ...p, caption: names.title }));
  const maxGuests = roomMaxGuests(room);
  const shownGuests = Math.min(guests, maxGuests);
  // The promotion for the chosen check-in day, and every one this room has.
  const promo = promoFor(promotions, room.id, dates.checkIn);
  const roomPromos = promosForRoom(promotions, room.id);
  const quote = priceStay(room, nights, shownGuests, fee, 0, 0, promo);
  const [inRoom, ...aroundHouse] = t('amenities.groups');
  const perNight = t('room.perNight');

  function reserve() {
    const query = new URLSearchParams({
      room: String(room.id),
      in: dates.checkIn,
      out: dates.checkOut,
      guests: String(shownGuests),
      step: '2',
    });
    navigate(`/book?${query}`);
  }

  return (
    <section className="room-page">
      <Link className="room-page__back" to="/home#rooms">
        ‹ {t('room.allRooms')}
      </Link>

      {/* Cover big on the left, the next two stacked on the right; the
          last tile says how many more there are. Any tile opens the viewer. */}
      <div className={`room-gallery${gallery.length > 2 ? ' room-gallery--stack' : ''}`}>
        {gallery.slice(0, 3).map((photo, i) => {
          const more = i === 2 ? gallery.length - 3 : 0;
          return (
            <button
              key={photo.id}
              type="button"
              className={`room-gallery__tile${i === 0 ? ' room-gallery__tile--main' : ''}`}
              onClick={() => setViewing(i)}
              aria-label={t('room.photoOf', { n: i + 1, total: gallery.length })}
            >
              <img
                src={photo.src}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {more > 0 && <span className="room-gallery__more">+{more}</span>}
            </button>
          );
        })}
        {gallery.length <= 1 && (
          // No photos yet (all removed in admin) or just one: the house fills in.
          <div className={`room-gallery__tile${gallery.length === 0 ? ' room-gallery__tile--main' : ''}`}>
            <img src="/images/hero.jpg" alt={t('room.housePhoto')} />
          </div>
        )}
      </div>
      {viewing !== null && (
        <Lightbox photos={gallery} index={viewing} onChange={setViewing} onClose={() => setViewing(null)} />
      )}

      <div className="room-page__cols">
        <div className="room-page__main">
          <h1>
            {names.title}
            {(names.subtitle || room.description) && (
              <small>{[names.subtitle, room.description].filter(Boolean).join(' · ')}</small>
            )}
          </h1>
          {roomPromos.length > 0 && (
            <div className="room-page__promos">
              {roomPromos.map((p) => (
                <PromoTag key={p.id} promo={p} />
              ))}
            </div>
          )}

          {/* What it costs, one fact per line, amounts on the right. */}
          <ul className="room-facts">
            <li>
              <span>{t('room.factBase', { n: room.capacity || maxGuests })}</span>
              <b>
                {formatBaht(room.price)} {perNight}
              </b>
            </li>
            {room.capacity && maxGuests > room.capacity && (
              <li>
                <span>{t('room.factExtra', { from: room.capacity + 1, to: maxGuests })}</span>
                <b>
                  +{formatBaht(fee)} {perNight}
                </b>
              </li>
            )}
            {petRule.fee > 0 && (
              <li>
                <span>{t('room.factPets', { kg: petRule.maxKg })}</span>
                <b>
                  +{formatBaht(petRule.fee)} {perNight}
                </b>
              </li>
            )}
            <li>
              <span>{t('room.factTimes')}</span>
              <b>
                {CHECK_IN_TIME} · {CHECK_OUT_TIME}
              </b>
            </li>
          </ul>

          <div className="room-page__block">
            <h2>{t('room.inRoom')}</h2>
            <p className="room-page__line">{inRoom.items.map((item) => item.label).join(' · ')}</p>
          </div>

          <div className="room-page__block">
            <h2>{t('amenities.title')}</h2>
            <dl className="room-amen">
              {aroundHouse.map((group) => (
                <div key={group.icon}>
                  <dt>{group.title}</dt>
                  <dd>{group.items.map((item) => item.label).join(' · ')}</dd>
                </div>
              ))}
            </dl>
          </div>

          {others.length > 0 && (
            <div className="room-page__block">
              <h2>{t('room.others')}</h2>
              <ul className="room-others">
                {others.map((r) => {
                  const max = roomMaxGuests(r);
                  return (
                    <li key={r.id}>
                      <Link to={`/rooms/${r.id}`}>
                        <img src={roomCover(r)} alt="" loading="lazy" />
                        <strong>{roomNames(r.name, lang).title}</strong>
                        <span>
                          {r.capacity && max > r.capacity ? t('rooms.guestsRange', { from: r.capacity, to: max }) : t('rooms.guests', { n: r.capacity || max })}
                          {' · '}
                          {formatBaht(r.price)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <aside className="room-book" id="room-book">
          <p className="room-book__price">
            {formatBaht(room.price)} <small>{`${perNight} · ${t('price.breakfast')}`}</small>
          </p>

          <DateRangePicker
            checkIn={dates.checkIn}
            checkOut={dates.checkOut}
            bookedNights={bookedNights}
            onChange={setDates}
          />

          <div className="room-book__guests">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
              <circle cx="9" cy="8" r="3.6" />
              <path d="M2 20c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6z" />
              <circle cx="17" cy="9" r="2.8" opacity=".55" />
              <path d="M15.6 13.6c3.5-.4 6.4 2 6.4 5.4h-4.2" opacity=".55" />
            </svg>
            <span>
              <small>{t('flow.guests')}</small>
              <b>
                {shownGuests} {t('flow.guestUnit')}
              </b>
            </span>
            <div className="room-book__step">
              <button type="button" onClick={() => setGuests(shownGuests - 1)} disabled={shownGuests <= 1} aria-label={t('flow.fewer')}>
                −
              </button>
              <button type="button" onClick={() => setGuests(shownGuests + 1)} disabled={shownGuests >= maxGuests} aria-label={t('flow.more')}>
                +
              </button>
            </div>
          </div>

          {nights > 0 ? (
            <>
              <p className="room-book__free">✓ {t('room.freeNow', { room: names.title })}</p>
              <PriceRows
                price={room.price}
                nights={nights}
                extraGuests={quote.extraGuests}
                fee={fee}
                discount={quote.discount}
                promoName={promo && `${promo.name} (-${promo.percent}%)`}
              />
            </>
          ) : (
            <p className="room-book__hint">{t('room.selectDates')}</p>
          )}

          <button type="button" className="bk-btn bk-btn--sun bk-btn--block" disabled={!nights} onClick={reserve}>
            {t('room.reserve')}
          </button>
          <p className="room-book__note">{t('room.noCharge')}</p>
        </aside>
      </div>

      {/* Phones: price and the one button, always in reach. */}
      <div className="room-bar">
        <span className="room-bar__info">
          <small>{nights > 0 ? `${names.title} · ${t('flow.nights', { n: nights })}` : names.title}</small>
          <b>{nights > 0 ? formatBaht(quote.total) : `${formatBaht(room.price)} ${perNight}`}</b>
        </span>
        {nights > 0 ? (
          <button type="button" className="room-bar__go" onClick={reserve}>
            {t('room.reserve')}
          </button>
        ) : (
          <button
            type="button"
            className="room-bar__go room-bar__go--todo"
            onClick={() => document.getElementById('room-book')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {t('room.pickDates')}
          </button>
        )}
      </div>
    </section>
  );
}
