import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import {
  MAX_GUESTS,
  MAX_PETS,
  REQUEST_OPTIONS,
  formatDay,
  isISODate,
  nightsBetween,
  priceStay,
  promoFor,
  roomMaxGuests,
  roomNames,
} from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { CHECK_IN_TIME, CHECK_OUT_TIME, PHONES } from '../lib/site';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import InlineCalendar from '../components/InlineCalendar';
import { PriceRows, PromoTag, StatusBadge } from '../components/BookingBits';
import PaymentPanel from '../components/PaymentPanel';
import './BookFlow.css';

const STEPS = ['step.dates', 'step.room', 'step.details', 'step.review'];
const EMPTY_FORM = { name: '', phone: '', email: '', line: '', requests: [], pets: 0, note: '' };

const digits = (value) => value.replace(/\D/g, '');

// Checks the guest details step; returns { field: translationKey }.
function validateForm(form) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'flow.errName';
  const phone = digits(form.phone);
  if (phone.length < 9 || phone.length > 15) errors.phone = 'flow.errPhone';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'flow.errEmail';
  }
  return errors;
}

// Step-by-step room booking: dates & guests -> room -> guest details ->
// review & send. Anyone can browse dates and rooms; from the details step
// on the guest must be logged in (they're sent to /login and brought back).
// No payment is taken here: the guest sends a request, gets a booking
// code, and the property follows up about the deposit.
// The room page links here with ?room=&in=&out=&guests=&step=3 to skip
// straight to the details step.
export default function BookFlow() {
  const { t, lang, locale } = useLang();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  // Initial state comes from the URL once; after that the URL follows state.
  const [checkIn, setCheckIn] = useState(() => (isISODate(params.get('in')) ? params.get('in') : ''));
  const [checkOut, setCheckOut] = useState(() => (isISODate(params.get('out')) ? params.get('out') : ''));
  const [guests, setGuests] = useState(() => {
    const n = Number.parseInt(params.get('guests'), 10);
    return Number.isInteger(n) ? Math.min(MAX_GUESTS, Math.max(1, n)) : 2;
  });
  const [roomId, setRoomId] = useState(() => Number.parseInt(params.get('room'), 10) || null);
  const [step, setStep] = useState(() => Number.parseInt(params.get('step'), 10) || 1);

  const [rooms, setRooms] = useState(null);
  const [fee, setFee] = useState(0); // Baht per extra guest per night
  const [petRule, setPetRule] = useState({ fee: 0, maxKg: 0 }); // Baht per pet per night, weight limit
  const [availableIds, setAvailableIds] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, email: user?.email?.includes('@') ? user.email : '' }));
  const [errors, setErrors] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [roomNotice, setRoomNotice] = useState(null);
  const [done, setDone] = useState(null); // the created booking
  const [testPay, setTestPay] = useState(false); // backend offers the PassPay test button

  const nights = nightsBetween(checkIn, checkOut);
  const room = rooms?.find((r) => r.id === roomId) ?? null;
  // The promotion (if any) each room gets for the chosen check-in day.
  const promotions = usePromotions();
  const promo = room ? promoFor(promotions, room.id, checkIn) : null;

  // Loads every room once (for names/prices), generation order = price order.
  useEffect(() => {
    api('/api/rooms')
      .then((data) => {
        setRooms([...data.rooms].sort((a, b) => b.price - a.price));
        setFee(Number(data.extra_guest_fee) || 0);
        setPetRule({ fee: Number(data.pet_fee) || 0, maxKg: Number(data.pet_max_kg) || 0 });
      })
      .catch(() => setLoadError(true));
  }, []);

  // Re-checks which rooms are free whenever the dates change.
  useEffect(() => {
    if (!nights) {
      setAvailableIds(null);
      return;
    }
    let stale = false;
    setAvailableIds(null);
    api(`/api/rooms?checkIn=${checkIn}&checkOut=${checkOut}`)
      .then((data) => !stale && setAvailableIds(new Set(data.rooms.map((r) => r.id))))
      .catch(() => !stale && setLoadError(true));
    return () => {
      stale = true;
    };
  }, [checkIn, checkOut, nights]);

  const roomIsBookable = (r) =>
    Boolean(availableIds?.has(r.id)) && guests <= roomMaxGuests(r);

  // If the chosen room turns out to be taken (or too small) for these
  // dates, drop it and send the guest back to the room list.
  useEffect(() => {
    if (!roomId || !rooms || !availableIds) return;
    const chosen = rooms.find((r) => r.id === roomId);
    if (!chosen || !roomIsBookable(chosen)) {
      setRoomId(null);
      if (chosen) setRoomNotice('flow.errRoomTaken');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, rooms, availableIds, guests]);

  // The furthest step the guest may be on given what's been chosen so far.
  let allowed = 1;
  if (nights) allowed = 2;
  if (nights && roomId) allowed = 3;
  if (allowed === 3 && Object.keys(validateForm(form)).length === 0) allowed = 4;
  const current = Math.min(Math.max(step, 1), allowed);

  // From the details step on, a guest who isn't logged in is sent to /login.
  const needsLogin = !user && current >= 3;

  // Room accounts only have their room dashboard, so they're sent there.
  const isStay = Boolean(user?.is_stay);

  // Keeps the URL in sync so refresh / back / sharing keep the selection.
  // (Skipped while redirecting away, or it would undo that redirect.)
  useEffect(() => {
    if (done || needsLogin || isStay) return;
    const next = new URLSearchParams();
    if (checkIn) next.set('in', checkIn);
    if (checkOut) next.set('out', checkOut);
    next.set('guests', String(guests));
    if (roomId) next.set('room', String(roomId));
    next.set('step', String(current));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, guests, roomId, current, done, needsLogin, isStay]);

  function goTo(nextStep) {
    setStep(nextStep);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleDates({ checkIn: nextIn, checkOut: nextOut }) {
    setCheckIn(nextIn);
    setCheckOut(nextOut);
    setRoomNotice(null);
  }

  function handleDetailsNext(e) {
    e.preventDefault();
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length === 0) goTo(4);
  }

  function toggleRequest(option) {
    setForm((f) => ({
      ...f,
      requests: f.requests.includes(option)
        ? f.requests.filter((r) => r !== option)
        : [...f.requests, option],
    }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { booking, test_pay: offersTestPay } = await api('/api/bookings/request', {
        method: 'POST',
        body: JSON.stringify({
          room_id: roomId,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          line: form.line.trim(),
          requests: form.requests,
          pets: form.pets,
          note: form.note.trim(),
        }),
      });
      setDone(booking);
      setTestPay(Boolean(offersTestPay));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.reason === 'ROOM_TAKEN') {
        // Someone else got there first: back to the room list with fresh availability.
        setRoomId(null);
        setRoomNotice('flow.errRoomTaken');
        setAvailableIds((ids) => {
          const next = new Set(ids);
          next.delete(roomId);
          return next;
        });
        goTo(2);
      } else {
        setSubmitError('flow.errGeneric');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  // Booking needs an account: from the details step on, send guests who
  // aren't logged in to /login, which brings them back to this exact step.
  if (!done && needsLogin) {
    const back = new URLSearchParams({ in: checkIn, out: checkOut, guests: String(guests), room: String(roomId), step: '3' });
    return <Navigate to={`/login?next=${encodeURIComponent(`/book?${back}`)}`} replace />;
  }
  if (isStay) return <Navigate to="/stay" replace />;

  // ---------- Finished ----------
  if (done) {
    const names = roomNames(done.room_name, lang);
    const paid = done.status === 'confirmed';
    return (
      <section className="bk-page">
        <div className="flow-done">
          <div className="flow-done__icon" aria-hidden="true">
            ✓
          </div>
          <h1>{paid ? t('pay.doneTitle') : t('flow.doneTitle')}</h1>
          {!paid && <p className="flow-done__lead">{t('flow.doneText')}</p>}

          <div className="flow-done__code">
            <span>{t('flow.yourCode')}</span>
            <strong>{done.code}</strong>
            <StatusBadge status={done.status} />
          </div>
          <p className="flow-done__hint">{t('flow.keepCode')}</p>

          {done.status === 'pending' && <PaymentPanel booking={done} testPay={testPay} onPaid={setDone} />}

          {/* Paid: the room dashboard login, same as on "My bookings". */}
          {paid && done.stay_username && (
            <div className="flow-done__stay">
              <p className="flow-done__stay-title">{t('my.stayTitle')}</p>
              <dl className="flow-list">
                <div>
                  <dt>{t('my.stayUser')}</dt>
                  <dd>{done.stay_username}</dd>
                </div>
                <div>
                  <dt>{t('my.stayPass')}</dt>
                  <dd>{done.stay_password}</dd>
                </div>
              </dl>
              <p className="flow-done__hint">
                {t('my.stayHint', { date: formatDay(checkOut, locale), time: CHECK_OUT_TIME })}
              </p>
            </div>
          )}

          <dl className="flow-list flow-done__summary">
            <div>
              <dt>{t('sum.room')}</dt>
              <dd>{names.title}</dd>
            </div>
            <div>
              <dt>{t('sum.checkIn')}</dt>
              <dd>
                {formatDay(checkIn, locale)} · {CHECK_IN_TIME}
              </dd>
            </div>
            <div>
              <dt>{t('sum.checkOut')}</dt>
              <dd>
                {formatDay(checkOut, locale)} · {CHECK_OUT_TIME}
              </dd>
            </div>
          </dl>
          <PriceRows
            total={done.total}
            deposit={done.deposit}
            extraGuests={done.extra_guests}
            pets={done.pets}
            discount={done.discount}
            promoName={done.promo_name}
          />

          <div className="flow-done__actions">
            <Link className="bk-btn bk-btn--primary" to="/booking">
              {t('flow.checkStatus')}
            </Link>
            <Link className="bk-btn" to="/home">
              {t('flow.backHome')}
            </Link>
          </div>

          <p className="flow-done__hint">{t('flow.contactNow')}</p>
          <div className="flow-done__actions">
            {PHONES.map((p) => (
              <a key={p.tel} className="bk-btn bk-btn--sun" href={`tel:${p.tel}`}>
                {t('book.call', { name: p.name[lang] })} · {p.display}
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---------- Steps ----------
  return (
    <section className="bk-page">
      <ol className="flow-steps">
        {STEPS.map((key, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li key={key} className={`flow-steps__item flow-steps__item--${state}`} aria-current={n === current ? 'step' : undefined}>
              <button type="button" disabled={n > allowed || n === current} onClick={() => goTo(n)}>
                <span className="flow-steps__bar" />
                <span className="flow-steps__label">
                  {n} {t(key)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flow">
        <div className="flow__main" key={current}>
          {loadError && (
            <p className="bk-error" role="alert">
              {t('flow.errLoad')}
            </p>
          )}

          {current === 1 && (
            <>
              <h1>{t('flow.pickDates')}</h1>
              <p className="flow__hint">{t('flow.pickDatesHint')}</p>
              <div className="flow__calendar">
                <InlineCalendar checkIn={checkIn} checkOut={checkOut} onChange={handleDates} />
              </div>

              <div className="flow__guests">
                <span className="bk-label">{t('flow.guests')}</span>
                <div className="bk-counter">
                  <button type="button" onClick={() => setGuests((g) => g - 1)} disabled={guests <= 1} aria-label={t('flow.fewer')}>
                    −
                  </button>
                  <output aria-live="polite">{guests}</output>
                  <button type="button" onClick={() => setGuests((g) => g + 1)} disabled={guests >= MAX_GUESTS} aria-label={t('flow.more')}>
                    +
                  </button>
                  <span>{t('flow.guestUnit')}</span>
                </div>
              </div>

              <p className="flow__price-note">{t('price.perRoomNight')}</p>

              <div className="flow__nav">
                <span />
                <button type="button" className="bk-btn bk-btn--primary" disabled={!nights} onClick={() => goTo(2)}>
                  {t('flow.seeRooms')} →
                </button>
              </div>
            </>
          )}

          {current === 2 && (
            <>
              <h1>{t('flow.pickRoom')}</h1>
              <p className="flow__hint">
                {formatDay(checkIn, locale)} – {formatDay(checkOut, locale)} · {t('flow.nights', { n: nights })}
              </p>
              {roomNotice && (
                <p className="bk-error" role="alert">
                  {t(roomNotice)}
                </p>
              )}

              <div className="flow-rooms">
                {(rooms ?? []).map((r) => {
                  const names = roomNames(r.name, lang);
                  const free = availableIds?.has(r.id);
                  const tooSmall = guests > roomMaxGuests(r);
                  const roomPromo = promoFor(promotions, r.id, checkIn);
                  const quote = priceStay(r, nights, guests, fee, 0, 0, roomPromo);
                  const bookable = roomIsBookable(r);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`flow-room${roomId === r.id ? ' is-selected' : ''}`}
                      disabled={!bookable}
                      aria-pressed={roomId === r.id}
                      onClick={() => {
                        setRoomId(r.id);
                        setRoomNotice(null);
                      }}
                    >
                      <span className="flow-room__thumb">
                        <img
                          src={r.image_url || `/images/rooms/room-${r.id}.jpg`}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </span>
                      <span className="flow-room__text">
                        <strong>{names.title}</strong>
                        {names.subtitle && <span>{names.subtitle}</span>}
                        {availableIds && (
                          <em className={bookable ? 'is-free' : 'is-full'}>
                            {!free ? t('flow.full') : tooSmall ? t('flow.tooSmall', { n: roomMaxGuests(r) }) : t('flow.available')}
                          </em>
                        )}
                      </span>
                      <span className="flow-room__price">
                        <strong>{formatBaht(tooSmall ? r.price * nights - quote.discount : quote.total)}</strong>
                        <span>{t('sum.priceLine', { price: formatBaht(r.price), n: nights })}</span>
                        {!tooSmall && quote.extraGuests > 0 && (
                          <span>+ {t('price.extraSaved', { n: quote.extraGuests })}</span>
                        )}
                        {roomPromo && <PromoTag promo={roomPromo} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flow__nav">
                <button type="button" className="bk-btn" onClick={() => goTo(1)}>
                  ← {t('flow.back')}
                </button>
                <button type="button" className="bk-btn bk-btn--primary" disabled={!roomId} onClick={() => goTo(3)}>
                  {t('flow.next')} →
                </button>
              </div>
            </>
          )}

          {current === 3 && (
            <form onSubmit={handleDetailsNext} noValidate>
              <h1>{t('flow.details')}</h1>
              <div className="flow__fields">
                <label className={`bk-field${errors.name ? ' bk-field--error' : ''}`}>
                  <span className="bk-label">{t('flow.name')}</span>
                  <input autoComplete="name" placeholder={t('flow.namePh')} {...field('name')} />
                  {errors.name && <span className="bk-error">{t(errors.name)}</span>}
                </label>
                <label className={`bk-field${errors.phone ? ' bk-field--error' : ''}`}>
                  <span className="bk-label">{t('flow.phone')}</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder={t('flow.phonePh')} {...field('phone')} />
                  {errors.phone && <span className="bk-error">{t(errors.phone)}</span>}
                </label>
                <label className={`bk-field${errors.email ? ' bk-field--error' : ''}`}>
                  <span className="bk-label">{t('flow.email')}</span>
                  <input type="email" autoComplete="email" placeholder="name@email.com" {...field('email')} />
                  {errors.email && <span className="bk-error">{t(errors.email)}</span>}
                </label>
                <label className="bk-field">
                  <span className="bk-label">{t('flow.line')}</span>
                  <input autoComplete="off" {...field('line')} />
                </label>
              </div>

              <fieldset className="flow__requests">
                <legend className="bk-label">{t('flow.requests')}</legend>
                {REQUEST_OPTIONS.map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      checked={form.requests.includes(option)}
                      onChange={() => toggleRequest(option)}
                    />
                    <span>{t(`req.${option}`)}</span>
                    <small>{t(`req.${option}.note`)}</small>
                  </label>
                ))}
                {/* Pets are counted rather than ticked: each one is charged per night. */}
                <div className={`flow__pets${form.pets > 0 ? ' is-on' : ''}`}>
                  <span>
                    {t('req.pets')}
                    <small>{t('req.pets.rule', { fee: formatBaht(petRule.fee), kg: petRule.maxKg })}</small>
                  </span>
                  <div className="bk-counter">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, pets: f.pets - 1 }))}
                      disabled={form.pets <= 0}
                      aria-label={t('req.pets.fewer')}
                    >
                      −
                    </button>
                    <output aria-live="polite">{form.pets}</output>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, pets: f.pets + 1 }))}
                      disabled={form.pets >= MAX_PETS}
                      aria-label={t('req.pets.more')}
                    >
                      +
                    </button>
                    <span>{t('req.pets.unit')}</span>
                  </div>
                </div>
              </fieldset>

              <label className="bk-field">
                <span className="bk-label">{t('flow.note')}</span>
                <textarea rows={2} maxLength={500} placeholder={t('flow.notePh')} {...field('note')} />
              </label>

              <div className="flow__nav">
                <button type="button" className="bk-btn" onClick={() => goTo(2)}>
                  ← {t('flow.back')}
                </button>
                <button type="submit" className="bk-btn bk-btn--primary">
                  {t('flow.toReview')} →
                </button>
              </div>
            </form>
          )}

          {current === 4 && room && (
            <>
              <h1>{t('flow.review')}</h1>
              <dl className="flow-list">
                <div>
                  <dt>{t('sum.name')}</dt>
                  <dd>{form.name}</dd>
                </div>
                <div>
                  <dt>{t('sum.phone')}</dt>
                  <dd>{form.phone}</dd>
                </div>
                {form.requests.length > 0 && (
                  <div>
                    <dt>{t('sum.requests')}</dt>
                    <dd>{form.requests.map((r) => t(`req.${r}`)).join(', ')}</dd>
                  </div>
                )}
                {form.pets > 0 && (
                  <div>
                    <dt>{t('sum.pets')}</dt>
                    <dd>{t('price.petSaved', { n: form.pets })}</dd>
                  </div>
                )}
                {form.note.trim() && (
                  <div>
                    <dt>{t('sum.note')}</dt>
                    <dd>{form.note}</dd>
                  </div>
                )}
              </dl>

              <div className="flow-deposit">
                <p className="flow-deposit__title">{t('flow.depositTitle')}</p>
                <p className="flow-deposit__amount">{formatBaht(priceStay(room, nights, guests, fee, form.pets, petRule.fee, promo).total / 2)}</p>
                <p>{t('flow.depositInfo')}</p>
              </div>

              <label className="flow__accept">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>{t('flow.accept')}</span>
              </label>

              {submitError && (
                <p className="bk-error" role="alert">
                  {t(submitError)}
                </p>
              )}

              <div className="flow__nav">
                <button type="button" className="bk-btn" onClick={() => goTo(3)}>
                  ← {t('flow.back')}
                </button>
                <button type="button" className="bk-btn bk-btn--sun" disabled={!accepted || submitting} onClick={handleSubmit}>
                  {submitting ? t('flow.submitting') : t('flow.submit')}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="flow__side">
          <h2>{t('sum.title')}</h2>
          <dl className="flow-list">
            <div>
              <dt>{t('sum.checkIn')}</dt>
              <dd>{checkIn ? `${formatDay(checkIn, locale)} · ${CHECK_IN_TIME}` : '—'}</dd>
            </div>
            <div>
              <dt>{t('sum.checkOut')}</dt>
              <dd>{checkOut ? `${formatDay(checkOut, locale)} · ${CHECK_OUT_TIME}` : '—'}</dd>
            </div>
            <div>
              <dt>{t('sum.guests')}</dt>
              <dd>{t('sum.guestCount', { n: guests })}</dd>
            </div>
            <div>
              <dt>{t('sum.room')}</dt>
              <dd>{room ? roomNames(room.name, lang).title : '—'}</dd>
            </div>
          </dl>
          {room && nights > 0 ? (
            <PriceRows
              price={room.price}
              nights={nights}
              extraGuests={priceStay(room, nights, guests, fee).extraGuests}
              fee={fee}
              pets={form.pets}
              petFee={petRule.fee}
              discount={priceStay(room, nights, guests, fee, 0, 0, promo).discount}
              promoName={promo && `${promo.name} (-${promo.percent}%)`}
            />
          ) : (
            <p className="flow__side-empty">{t('sum.empty')}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
