import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { dayOf, formatDay, nightsBetween, roomNames } from '../lib/booking';
import { CHECK_IN_TIME, CHECK_OUT_TIME, PHONES } from '../lib/site';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { PriceRows, StatusBadge } from '../components/BookingBits';
import PaymentPanel from '../components/PaymentPanel';
import './Booking.css';

// One booking, as the guest sees it. A pending room booking shows its
// deposit payment; `onPaid` receives the booking once it's paid.
function BookingCard({ booking, testPay, onPaid }) {
  const { t, lang, locale } = useLang();

  // Activity bookings (single point in time, no stay range).
  if (!booking.room_id) {
    return (
      <article className="my-card">
        <header>
          <h3>
            {t('booking.activity')} {booking.activity_name}
          </h3>
          <StatusBadge status={booking.status} />
        </header>
        <p className="my-card__meta">{new Date(booking.booked_for).toLocaleString(locale)}</p>
      </article>
    );
  }

  const checkIn = dayOf(booking.booked_for);
  const checkOut = dayOf(booking.booked_until);
  const names = roomNames(booking.room_name, lang);
  const nights = nightsBetween(checkIn, checkOut);

  return (
    <article className="my-card">
      <header>
        <div>
          <h3>{names.title}</h3>
          {booking.code && <p className="my-card__code">{booking.code}</p>}
        </div>
        <StatusBadge status={booking.status} />
      </header>

      <dl className="my-card__list">
        <div>
          <dt>{t('sum.checkIn')}</dt>
          <dd>
            {formatDay(checkIn, locale)} · {CHECK_IN_TIME}
          </dd>
        </div>
        <div>
          <dt>{t('sum.checkOut')}</dt>
          <dd>
            {formatDay(checkOut, locale)} · {CHECK_OUT_TIME} ({t('flow.nights', { n: nights })})
          </dd>
        </div>
        {booking.guests && (
          <div>
            <dt>{t('sum.guests')}</dt>
            <dd>{t('sum.guestCount', { n: booking.guests })}</dd>
          </div>
        )}
        {booking.requests?.length > 0 && (
          <div>
            <dt>{t('sum.requests')}</dt>
            <dd>{booking.requests.map((r) => t(`req.${r}`)).join(', ')}</dd>
          </div>
        )}
        {booking.note && (
          <div>
            <dt>{t('sum.note')}</dt>
            <dd>{booking.note}</dd>
          </div>
        )}
      </dl>

      {booking.total != null && (
        <PriceRows
          total={booking.total}
          deposit={booking.deposit}
          extraGuests={booking.extra_guests}
          pets={booking.pets}
          discount={booking.discount}
          promoName={booking.promo_name}
        />
      )}

      {/* Confirmed: the generated login for this room's dashboard. */}
      {booking.status === 'confirmed' && booking.stay_username && (
        <div className="my-card__stay">
          <p className="my-card__stay-title">{t('my.stayTitle')}</p>
          <dl>
            <div>
              <dt>{t('my.stayUser')}</dt>
              <dd>{booking.stay_username}</dd>
            </div>
            <div>
              <dt>{t('my.stayPass')}</dt>
              <dd>{booking.stay_password}</dd>
            </div>
          </dl>
          <p>{t('my.stayHint', { date: formatDay(checkOut, locale), time: CHECK_OUT_TIME })}</p>
        </div>
      )}

      {booking.status === 'pending' && <PaymentPanel booking={booking} testPay={testPay} onPaid={onPaid} />}

      {booking.status === 'pending' && (
        <div className="my-card__help">
          <p>{t('my.pendingHelp')}</p>
          <p>{t('my.stayPending')}</p>
          <div>
            {PHONES.map((p) => (
              <a key={p.tel} className="bk-btn" href={`tel:${p.tel}`}>
                {t('book.call', { name: p.name[lang] })} · {p.display}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// Tells the member that the property deleted one of their bookings, and why.
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
        <p className="my-notice__title">{t('my.deletedTitle')}</p>
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

// "My bookings": the signed-in member's bookings with their status and,
// once a booking is confirmed, the login for that room's dashboard.
export default function Booking() {
  const { user } = useAuth();
  const { t } = useLang();
  const [bookings, setBookings] = useState(null);
  const [notices, setNotices] = useState([]);
  const [testPay, setTestPay] = useState(false);
  const [error, setError] = useState(null);

  const isMember = Boolean(user && !user.is_stay);

  useEffect(() => {
    if (!isMember) return;
    api('/api/bookings')
      .then((data) => {
        setBookings(data.bookings);
        setNotices(data.notices ?? []);
        setTestPay(Boolean(data.test_pay));
      })
      .catch((err) => setError(err.message));
  }, [isMember]);

  // Removes a "your booking was deleted" notice once the member has read it.
  async function dismissNotice(id) {
    try {
      await api(`/api/bookings/notices/${id}`, { method: 'DELETE' });
      setNotices((list) => list.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return <Navigate to="/login?next=/booking" replace />;
  // Room accounts only have their room dashboard.
  if (user.is_stay) return <Navigate to="/stay" replace />;

  return (
    <section className="bk-page my-bookings">
      <header className="my-bookings__head">
        <div>
          <h1>{t('booking.title')}</h1>
          <p className="my-bookings__member">
            {t('member.code')} <strong>{user.member_code}</strong> · {user.email}
          </p>
        </div>
        <Link className="bk-btn bk-btn--sun" to="/book">
          {t('my.newBooking')}
        </Link>
      </header>

      {error && (
        <p className="bk-error" role="alert">
          {error}
        </p>
      )}

      {/* Bookings the property deleted, with the reason it gave. */}
      {notices.map((n) => (
        <DeletedNotice key={n.id} notice={n} onDismiss={() => dismissNotice(n.id)} />
      ))}

      <div className="my-bookings__results">
        {/* Newest stay first. */}
        {[...(bookings ?? [])]
          .sort((a, b) => new Date(b.booked_for) - new Date(a.booked_for))
          .map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              testPay={testPay}
              onPaid={(paid) => setBookings((list) => list.map((x) => (x.id === paid.id ? paid : x)))}
            />
          ))}
        {bookings?.length === 0 && <p className="my-bookings__empty">{t('booking.empty')}</p>}
      </div>
    </section>
  );
}
