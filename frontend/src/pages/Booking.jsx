import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { formatDay, formatStay, roomNames, toISODate } from '../lib/booking';
import { groupStays, mergeBookings, owes, payOptions, stayNeedsAction } from '../lib/payments';
import { roomCover } from '../lib/photos';
import { shift } from '../lib/motion';
import { Loading, Sk, SkText } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { StatusBadge } from '../components/BookingBits';
import StayView from '../components/StayView';
import Announcements from '../components/Announcements';
import './Booking.css';

function DeletedNotice({ notice, onDismiss }) {
  const { t, lang, locale } = useLang();
  const what = [
    notice.code,
    notice.booked && roomNames(notice.booked, lang).title,
    notice.check_in &&
      (notice.check_out
        ? `${formatDay(notice.check_in, locale)} → ${formatDay(notice.check_out, locale)}`
        : formatDay(notice.check_in, locale)),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="my-notice" role="alert">
      <div>
        <p className="my-notice__title">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5v.01" />
          </svg>
          {t('my.deletedTitle')}
        </p>
        <p className="my-notice__what">{what}</p>
        <p>
          <strong>{t('my.deletedReason')}</strong> {notice.reason}
        </p>
        <p className="my-notice__meta">{t('my.deletedHelp')}</p>
      </div>
      <button type="button" className="bk-btn" onClick={onDismiss}>
        {t('my.dismiss')}
      </button>
    </div>
  );
}

function pickFocus(stays) {
  const today = toISODate(new Date());
  const upcoming = stays
    .filter((s) => s.status !== 'cancelled' && s.checkOut >= today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return (upcoming.find(stayNeedsAction) ?? upcoming[0])?.key ?? null;
}

export default function Booking() {
  const { user } = useAuth();
  const { t, lang, locale } = useLang();
  const [bookings, setBookings] = useState(null);
  const [notices, setNotices] = useState([]);
  const [pay, setPay] = useState(payOptions(null));
  const [error, setError] = useState(null);
  const [focusKey, setFocusKey] = useState(null);

  const isMember = Boolean(user && !user.is_stay);

  useEffect(() => {
    if (!isMember) return;
    api('/api/bookings')
      .then((data) => {
        setBookings(data.bookings);
        setNotices(data.notices ?? []);
        setPay(payOptions(data));
      })
      .catch((err) => setError(err.message));
  }, [isMember]);

  async function dismissNotice(id) {
    try {
      await api(`/api/bookings/notices/${id}`, { method: 'DELETE' });
      setNotices((list) => list.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return <Navigate to="/login?next=/booking" replace />;
  if (user.is_stay) return <Navigate to="/stay" replace />;

  const stays = groupStays(bookings ?? []);
  const focus = stays.find((s) => s.key === (focusKey ?? pickFocus(stays)));
  const today = toISODate(new Date());
  const others = stays
    .filter((s) => s !== focus)
    .sort((a, b) => {
      const aLive = a.status !== 'cancelled' && a.checkOut >= today;
      const bLive = b.status !== 'cancelled' && b.checkOut >= today;
      if (aLive !== bLive) return aLive ? -1 : 1;
      return aLive ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn);
    });
  const activities = (bookings ?? []).filter((b) => !b.room_id);

  function show(key) {
    shift(() => setFocusKey(key), { cards: '.my-page > *' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section className="my-page">
      <header className="my-page__head">
        <h1>{t('booking.title')}</h1>
        <p>
          {t('member.code')} <strong>{user.member_code}</strong> · {user.email}
        </p>
      </header>

      {error && (
        <p className="bk-error" role="alert">
          {error}
        </p>
      )}

      {notices.map((n) => (
        <DeletedNotice key={n.id} notice={n} onDismiss={() => dismissNotice(n.id)} />
      ))}

      <Announcements source="/api/announcements/mine" className="page-news" />

      {bookings === null && !error && (
        <Loading label={t('loading')} className="my-sk">
          <div className="my-sk__card">
            <Sk className="my-sk__photo" h="auto" r="12px" />
            <div className="my-sk__text">
              <Sk w="55%" h="1.5em" />
              <SkText lines={3} last="40%" />
              <Sk w="160px" h="44px" r="999px" />
            </div>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="my-sk__row">
              <Sk w="88px" h="60px" r="10px" />
              <div className="my-sk__text">
                <Sk w={`${50 - i * 10}%`} h="1.05em" />
                <Sk w="70%" h="0.9em" />
              </div>
            </div>
          ))}
        </Loading>
      )}

      {stays.some((s) => s.status === 'confirmed' && s.checkOut >= today) && (
        <Link className="my-room-link" to="/stay">
          <span>✓ {t('stay.openHint')}</span>
          <b>{t('stay.open')} →</b>
        </Link>
      )}

      {focus && (
        <StayView stay={focus} pay={pay} onPaid={(updated) => setBookings((list) => mergeBookings(list, updated))} />
      )}

      {others.length > 0 && (
        <section className="my-others">
          <h2>{focus ? t('my.others') : t('my.all')}</h2>
          <ul>
            {others.map((stay) => {
              const restDue = stay.bookings.find((b) => owes(b, 'balance'));
              const paidFull = stay.status === 'confirmed' && !restDue;
              const names = stay.bookings
                .filter((b) => b.status !== 'cancelled' || stay.status === 'cancelled')
                .map((b) => roomNames(b.room_name, lang).title)
                .join(' + ');
              return (
                <li key={stay.key} className={stay.status === 'cancelled' ? 'is-cancelled' : ''}>
                  <img src={roomCover({ id: stay.lead.room_id })} alt="" loading="lazy" />
                  <div className="my-others__txt">
                    <b>
                      {names} · {stay.key}
                    </b>
                    <p>
                      {formatStay(stay.checkIn, stay.checkOut, locale, t('date.wd'))} ·{' '}
                      {t('sum.guestCount', { n: stay.guests })}
                      {restDue && ` · ${t('my.restDue', { amount: formatBaht(Number(restDue.balance_due)) })}`}
                    </p>
                  </div>
                  {paidFull ? (
                    <span className="my-pill">{t('my.paidFull')}</span>
                  ) : (
                    <StatusBadge status={stay.status} />
                  )}
                  <button
                    type="button"
                    className={`bk-btn${stayNeedsAction(stay) && stay.status !== 'cancelled' ? ' bk-btn--primary' : ''}`}
                    onClick={() => show(stay.key)}
                  >
                    {stay.status === 'pending' ? t('my.payDeposit') : restDue ? t('my.payRest') : t('my.view')}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {activities.length > 0 && (
        <section className="my-others">
          <h2>{t('my.activities')}</h2>
          <ul>
            {activities.map((b) => (
              <li key={b.id}>
                <div className="my-others__txt">
                  <b>{b.activity_name}</b>
                  <p>{new Date(b.booked_for).toLocaleString(locale)}</p>
                </div>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {bookings?.length === 0 && (
        <div className="my-empty">
          <p>{t('booking.empty')}</p>
          <Link className="bk-btn bk-btn--sun" to="/book">
            {t('my.newBooking')}
          </Link>
        </div>
      )}
    </section>
  );
}
