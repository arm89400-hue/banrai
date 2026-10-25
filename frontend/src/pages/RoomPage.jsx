import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import {
  bookedNightSet,
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
import DateRangePicker from '../components/DateRangePicker';
import { PriceRows, PromoTag } from '../components/BookingBits';
import Lightbox from '../components/Lightbox';
import Baht from '../components/Baht';
import RoomAmenities from '../components/RoomAmenities';
import { roomCover, roomPhotos } from '../lib/photos';
import { shift } from '../lib/motion';
import { Loading, Sk, SkText } from '../components/Skeleton';
import { cachedRoom, cachedRooms, rememberRooms } from '../lib/roomCache';
import './RoomPage.css';

const petRuleFrom = (data) => ({ fee: Number(data?.pet_fee) || 0, maxKg: Number(data?.pet_max_kg) || 0 });
const otherRooms = (data, id) =>
  (data?.rooms ?? []).filter((r) => String(r.id) !== String(id)).sort((a, b) => b.price - a.price);

export default function RoomPage() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();

  const [room, setRoom] = useState(() => cachedRoom(id)?.room ?? null);
  const [fee, setFee] = useState(() => Number(cachedRoom(id)?.extra_guest_fee) || 0);
  const [petRule, setPetRule] = useState(() => petRuleFrom(cachedRoom(id)));
  const [others, setOthers] = useState(() => otherRooms(cachedRooms(), id));
  const [booked, setBooked] = useState([]);
  const [missing, setMissing] = useState(false);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [guests, setGuests] = useState(2);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let stale = false;
    const cached = cachedRoom(id);
    setRoom(cached?.room ?? null);
    if (cached) {
      setFee(Number(cached.extra_guest_fee) || 0);
      setPetRule(petRuleFrom(cached));
    }
    setOthers(otherRooms(cachedRooms(), id));
    setMissing(false);
    setDates({ checkIn: '', checkOut: '' });
    setViewing(null);

    api(`/api/rooms/${id}`)
      .then((data) => {
        if (stale) return;
        setRoom(data.room);
        setFee(Number(data.extra_guest_fee) || 0);
        setPetRule(petRuleFrom(data));
      })
      .catch(() => !stale && setMissing(true));
    api(`/api/rooms/${id}/booked`)
      .then((data) => !stale && setBooked(data.booked))
      .catch(() => !stale && setBooked([]));
    api('/api/rooms')
      .then(rememberRooms)
      .then((data) => {
        if (stale) return;
        setOthers(otherRooms(data, id));
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
  if (!room) {
    return (
      <Loading as="section" className="room-page" label={t('loading')}>
        <Sk w="120px" h="1em" style={{ marginBottom: 14 }} />
        <div className="room-gallery room-gallery--stack" aria-hidden="true">
          <Sk className="room-gallery__tile room-gallery__tile--main" h="auto" r="0" />
          <Sk className="room-gallery__tile" h="auto" r="0" />
          <Sk className="room-gallery__tile" h="auto" r="0" />
        </div>
        <div className="room-page__cols">
          <div className="room-page__main">
            <div>
              <Sk w="34%" h="2.1em" />
              <Sk w="22%" h="1em" style={{ marginTop: 10 }} />
            </div>
            <SkText lines={4} last="55%" gap="1.1em" />
          </div>
          <div className="room-book" aria-hidden="true">
            <Sk w="45%" h="1.8em" />
            <Sk h="56px" r="10px" />
            <Sk h="56px" r="10px" />
            <Sk h="48px" r="999px" />
          </div>
        </div>
      </Loading>
    );
  }

  const names = roomNames(room.name, lang);
  const gallery = roomPhotos(room).map((p) => ({ ...p, caption: names.title }));
  const maxGuests = roomMaxGuests(room);
  const shownGuests = Math.min(guests, maxGuests);
  const promo = promoFor(promotions, room.id, dates.checkIn);
  const roomPromos = promosForRoom(promotions, room.id);
  const quote = priceStay(room, nights, shownGuests, fee, 0, 0, promo);
  const [, ...aroundHouse] = t('amenities.groups');
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

      <div className={`room-gallery${gallery.length > 2 ? ' room-gallery--stack' : ''}`}>
        {gallery.slice(0, 3).map((photo, i) => {
          return (
            <button
              key={photo.id}
              type="button"
              className={`room-gallery__tile${i === 0 ? ' room-gallery__tile--main' : ''}`}
              onClick={(e) =>
                shift(() => setViewing(i), { from: e.currentTarget.querySelector('img'), to: '.lightbox__figure img' })
              }
              aria-label={t('room.photoOf', { n: i + 1, total: gallery.length })}
            >
              <img
                src={photo.src}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </button>
          );
        })}
        {gallery.length <= 1 && (
          <div className={`room-gallery__tile${gallery.length === 0 ? ' room-gallery__tile--main' : ''}`}>
            <img src="/images/hero.jpg" alt={t('room.housePhoto')} />
          </div>
        )}
        {gallery.length > 1 && (
          <button
            type="button"
            className="room-gallery__all"
            onClick={() =>
              shift(() => setViewing(0), {
                from: document.querySelector('.room-gallery__tile--main img'),
                to: '.lightbox__figure img',
              })
            }
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            {t('room.allPhotos', { n: gallery.length })}
          </button>
        )}
      </div>
      {viewing !== null && (
        <Lightbox photos={gallery} index={viewing} onChange={setViewing} onClose={() => setViewing(null)} />
      )}

      <div className="room-page__cols">
        <div className="room-page__main">
          <h1>
            {names.title}
            {/* In Thai the English name adds nothing; in English the Thai name is the room's real name. */}
            {((lang === 'en' && names.subtitle) || room.description) && (
              <small>{[lang === 'en' && names.subtitle, room.description].filter(Boolean).join(' · ')}</small>
            )}
          </h1>
          {roomPromos.length > 0 && (
            <div className="room-page__promos">
              {roomPromos.map((p) => (
                <PromoTag key={p.id} promo={p} />
              ))}
            </div>
          )}

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
            <RoomAmenities />
          </div>

          <div className="room-page__block">
            <h2>{t('amenities.title')}</h2>
            <div className="room-amen">
              {aroundHouse.map((group, i) => (
                <section key={group.icon}>
                  <h3>{group.title}</h3>
                  <RoomAmenities group={i + 1} />
                </section>
              ))}
            </div>
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
                          {r.capacity && max > r.capacity
                            ? t('rooms.guestsRange', { from: r.capacity, to: max })
                            : t('rooms.guests', { n: r.capacity || max })}
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
              <button
                type="button"
                onClick={() => setGuests(shownGuests - 1)}
                disabled={shownGuests <= 1}
                aria-label={t('flow.fewer')}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setGuests(shownGuests + 1)}
                disabled={shownGuests >= maxGuests}
                aria-label={t('flow.more')}
              >
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

      <div className="room-bar">
        <span className="room-bar__info">
          <small>{nights > 0 ? `${names.title} · ${t('flow.nights', { n: nights })}` : names.title}</small>
          <b>{nights > 0 ? <Baht value={quote.total} /> : `${formatBaht(room.price)} ${perNight}`}</b>
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
