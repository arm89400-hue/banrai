import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { dayOf, formatDay, nightsBetween, roomNames } from '../lib/booking';
import { CHECK_IN_TIME, CHECK_OUT_TIME, FACEBOOK_URL, MAPS_URL, PHONES } from '../lib/site';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { StatusBadge } from '../components/BookingBits';
import './StayDashboard.css';

// The room dashboard: what a room account sees after logging in with the
// username/password generated when its booking was confirmed. It shows that
// one stay - room, dates, what's in the room, house rules, activities and
// how to reach the farmstay. The account stops working at check-out; the
// API then answers ACCOUNT_EXPIRED and lib/api.js signs the session out.
export default function StayDashboard() {
  const { user } = useAuth();
  const { t, lang, locale } = useLang();
  const [stay, setStay] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(false);

  const isStay = Boolean(user?.is_stay);

  useEffect(() => {
    if (!isStay) return;
    api('/api/stay')
      .then((data) => setStay(data.stay))
      .catch(() => setError(true));
    api('/api/activities')
      .then((data) => setActivities(data.activities))
      .catch(() => {});
  }, [isStay]);

  if (!user) return <Navigate to="/login?next=/stay" replace />;
  if (!isStay) return <Navigate to={user.is_admin ? '/admin' : '/booking'} replace />;

  if (error) {
    return (
      <section className="bk-page">
        <p className="bk-error" role="alert">
          {t('stay.error')}
        </p>
      </section>
    );
  }
  if (!stay) return <section className="bk-page" aria-busy="true" />;

  const checkIn = dayOf(stay.booked_for);
  const checkOut = dayOf(stay.booked_until);
  const names = roomNames(stay.room_name, lang);
  const inRoom = t('amenities.groups')[0];

  return (
    <section className="bk-page stay">
      <header className="stay__head">
        <p className="stay__eyebrow">{t('stay.title')}</p>
        <h1>{t('stay.welcome', { name: stay.guest_name || user.email })}</h1>
        <p className="stay__expiry">
          {t('stay.expires', { date: formatDay(checkOut, locale), time: CHECK_OUT_TIME })}
        </p>
      </header>

      <div className="stay__grid">
        <article className="stay-card stay-room">
          <div className="stay-room__photo">
            <img
              src={stay.room_image_url || `/images/rooms/room-${stay.room_id}.jpg`}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="stay-room__body">
            <div className="stay-room__title">
              <div>
                <h2>{names.title}</h2>
                {names.subtitle && <p>{names.subtitle}</p>}
              </div>
              <StatusBadge status={stay.status} />
            </div>

            <div className="stay-times">
              <div>
                <span>{t('sum.checkIn')}</span>
                <strong>{formatDay(checkIn, locale)}</strong>
                <span>{t('know.inLabel')} {CHECK_IN_TIME}</span>
              </div>
              <div>
                <span>{t('sum.checkOut')}</span>
                <strong>{formatDay(checkOut, locale)}</strong>
                <span>{t('know.outLabel')} {CHECK_OUT_TIME}</span>
              </div>
            </div>

            <dl className="stay-list">
              <div>
                <dt>{t('flow.yourCode')}</dt>
                <dd>{stay.code}</dd>
              </div>
              <div>
                <dt>{t('sum.guests')}</dt>
                <dd>
                  {stay.guests ? t('sum.guestCount', { n: stay.guests }) : '—'}
                  {stay.extra_guests > 0 && ` (${t('price.extraSaved', { n: stay.extra_guests })})`} ·{' '}
                  {t('flow.nights', { n: nightsBetween(checkIn, checkOut) })}
                </dd>
              </div>
              {stay.pets > 0 && (
                <div>
                  <dt>{t('sum.pets')}</dt>
                  <dd>{t('price.petSaved', { n: stay.pets })}</dd>
                </div>
              )}
              {stay.requests?.length > 0 && (
                <div>
                  <dt>{t('sum.requests')}</dt>
                  <dd>{stay.requests.map((r) => t(`req.${r}`)).join(', ')}</dd>
                </div>
              )}
              {stay.total != null && (
                <div>
                  <dt>{t('sum.balance')}</dt>
                  <dd>{formatBaht(Number(stay.total) - Number(stay.deposit))}</dd>
                </div>
              )}
            </dl>
          </div>
        </article>

        <article className="stay-card">
          <h2>{t('room.inRoom')}</h2>
          <ul className="stay-chips">
            {inRoom.items.map((item) => (
              <li key={item.label}>{item.label}</li>
            ))}
          </ul>
        </article>

        <article className="stay-card">
          <h2>{t('know.title')}</h2>
          <ul className="stay-rules">
            {t('know.policies').map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </article>

        {activities.length > 0 && (
          <article className="stay-card">
            <h2>{t('stay.activities')}</h2>
            <ul className="stay-activities">
              {activities.map((a) => (
                <li key={a.id}>
                  <span>
                    <strong>{a.name}</strong>
                    {a.description && <small>{a.description}</small>}
                  </span>
                  <b>{formatBaht(a.price)}</b>
                </li>
              ))}
            </ul>
          </article>
        )}

        <article className="stay-card stay-contact">
          <h2>{t('stay.contact')}</h2>
          <div>
            {PHONES.map((p) => (
              <a key={p.tel} className="bk-btn bk-btn--sun" href={`tel:${p.tel}`}>
                {t('book.call', { name: p.name[lang] })} · {p.display}
              </a>
            ))}
            <a className="bk-btn" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
              {t('book.fb')}
            </a>
            <a className="bk-btn" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              {t('book.map')}
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
