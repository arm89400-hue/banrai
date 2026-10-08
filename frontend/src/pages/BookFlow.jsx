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
  splitGuests,
} from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { BOOKING_SLIDES, roomCover } from '../lib/photos';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import InlineCalendar from '../components/InlineCalendar';
import PhotoSlides from '../components/PhotoSlides';
import { PriceRows, PromoTag, StayLogin } from '../components/BookingBits';
import PaymentPanel from '../components/PaymentPanel';
import './BookFlow.css';

// The server's payment options -> PaymentPanel props.
const payOptions = (data) => ({
  testPay: Boolean(data?.test_pay),
  slipPay: Boolean(data?.slip_pay),
  slipCheck: data?.slip_check ?? 'manual',
  promptpay: data?.promptpay ?? null,
});

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
// A party too big for one room picks several rooms on step 2; they are
// booked together (one booking per room, sharing a group code).
// The room page links here with ?room=&in=&out=&guests=&step=3 to skip
// straight to the details step; ?rooms=1,2 selects several.
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
  // The chosen rooms, in the order picked.
  const [roomIds, setRoomIds] = useState(() =>
    (params.get('rooms') ?? params.get('room') ?? '')
      .split(',')
      .map((id) => Number.parseInt(id, 10))
      .filter(Boolean)
  );
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
  const [done, setDone] = useState(null); // the created bookings (one per room)
  const [pay, setPay] = useState(payOptions(null)); // how the deposit can be paid

  const nights = nightsBetween(checkIn, checkOut);
  const chosen = roomIds.map((id) => rooms?.find((r) => r.id === id)).filter(Boolean);
  // The promotion (if any) each room gets for the chosen check-in day.
  const promotions = usePromotions();
  // How many guests sleep in each chosen room (null: not enough places yet).
  const split = splitGuests(chosen, guests);
  const capacity = chosen.reduce((sum, r) => sum + roomMaxGuests(r), 0);
  // Each chosen room priced on its own; pets go with the first room.
  const plans = split
    ? chosen.map((r, i) => {
        const promo = promoFor(promotions, r.id, checkIn);
        const pets = i === 0 ? form.pets : 0;
        return {
          room: r,
          guests: split[i],
          promo,
          ...priceStay(r, nights, split[i], fee, pets, petRule.fee, promo),
        };
      })
    : [];
  const grandTotal = plans.reduce((sum, p) => sum + p.total, 0);

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

  // Only rooms free for the whole stay are offered.
  const freeRooms = (rooms ?? []).filter((r) => availableIds?.has(r.id));

  // If a chosen room turns out to be taken for these dates, drop it and
  // tell the guest.
  useEffect(() => {
    if (!rooms || !availableIds || roomIds.length === 0) return;
    const stillFree = roomIds.filter((id) => availableIds.has(id) && rooms.some((r) => r.id === id));
    if (stillFree.length !== roomIds.length) {
      setRoomIds(stillFree);
      setRoomNotice('flow.errRoomTaken');
    }
  }, [roomIds, rooms, availableIds]);

  function toggleRoom(id) {
    setRoomNotice(null);
    setRoomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // The furthest step the guest may be on given what's been chosen so far.
  let allowed = 1;
  if (nights) allowed = 2;
  if (nights && split) allowed = 3;
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
    if (roomIds.length) next.set('rooms', roomIds.join(','));
    next.set('step', String(current));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, guests, roomIds, current, done, needsLogin, isStay]);

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
      const data = await api('/api/bookings/request', {
        method: 'POST',
        body: JSON.stringify({
          rooms: roomIds,
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
      setDone(data.bookings ?? [data.booking]);
      setPay(payOptions(data));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.reason === 'ROOM_TAKEN') {
        // Someone else got there first: back to the room list with fresh availability.
        setRoomNotice('flow.errRoomTaken');
        setAvailableIds(null);
        api(`/api/rooms?checkIn=${checkIn}&checkOut=${checkOut}`)
          .then((data) => setAvailableIds(new Set(data.rooms.map((r) => r.id))))
          .catch(() => setLoadError(true));
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
    const back = new URLSearchParams({ in: checkIn, out: checkOut, guests: String(guests), rooms: roomIds.join(','), step: '3' });
    return <Navigate to={`/login?next=${encodeURIComponent(`/book?${back}`)}`} replace />;
  }
  if (isStay) return <Navigate to="/stay" replace />;

  // ---------- Finished ----------
  if (done) {
    const allPaid = done.every((b) => b.status === 'confirmed');
    const updateBooking = (paid) => setDone((list) => list.map((b) => (b.id === paid.id ? paid : b)));
    const depositTotal = done.reduce((sum, b) => sum + Number(b.deposit), 0);
    // What happens after the request: sent -> deposit -> room login.
    const steps = [
      { key: 'sent', state: 'done', title: t('done.stepSent'), text: t('done.stepSentText') },
      {
        key: 'pay',
        state: allPaid ? 'done' : 'now',
        title: t('done.stepPay', { amount: formatBaht(depositTotal) }),
        text: allPaid
          ? t('done.stepPaidText')
          : done.some((b) => b.slip_status === 'review')
            ? t('done.stepReviewText')
            : t('done.stepPayText'),
      },
      { key: 'login', state: allPaid ? 'done' : 'todo', title: t('done.stepLogin'), text: t('done.stepLoginText') },
    ];
    return (
      <section className="bk-page">
        <div className="flow-done">
          <header className="flow-done__head">
            <p className="flow-done__badge">✓ {t('done.badge')}</p>
            <h1>{allPaid ? t('pay.doneTitle') : t('flow.doneTitle')}</h1>
            {done.length > 1 && <p className="flow-done__rooms">{t('flow.doneRooms', { n: done.length })}</p>}
            <div className="flow-done__codes">
              {done.map((b) => (
                <div key={b.id} className="flow-done__code">
                  <span>
                    {t('flow.yourCode')}
                    <br />
                    {roomNames(b.room_name, lang).title} · {t('sum.guestCount', { n: b.guests })}
                  </span>
                  <strong>{b.code}</strong>
                </div>
              ))}
            </div>
          </header>

          <div className="flow-done__body">
            <ol className="flow-done__steps">
              {steps.map((s, i) => (
                <li key={s.key} className={`is-${s.state}`} aria-current={s.state === 'now' ? 'step' : undefined}>
                  <span className="flow-done__dot" aria-hidden="true">
                    {s.state === 'done' ? '✓' : i + 1}
                  </span>
                  <div>
                    <b>{s.title}</b>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            {done.map((b) =>
              b.status === 'pending' ? (
                <PaymentPanel key={b.id} booking={b} {...pay} onPaid={updateBooking} />
              ) : (
                /* Paid: the room dashboard login, same as on "My bookings". */
                b.stay_username && (
                  <StayLogin
                    key={b.id}
                    booking={b}
                    room={done.length > 1 ? roomNames(b.room_name, lang).title : null}
                    hint={t('my.stayHint', { date: formatDay(checkOut, locale), time: CHECK_OUT_TIME })}
                  />
                )
              ),
            )}

            <dl className="flow-list flow-done__summary">
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
              total={done.reduce((sum, b) => sum + Number(b.total), 0)}
              deposit={depositTotal}
              extraGuests={done.reduce((sum, b) => sum + (b.extra_guests ?? 0), 0)}
              pets={done.reduce((sum, b) => sum + (b.pets ?? 0), 0)}
              discount={done.reduce((sum, b) => sum + Number(b.discount ?? 0), 0)}
            />

            <p className="flow-done__hint">{t('flow.keepCode')}</p>
            <div className="flow-done__actions">
              <Link className="bk-btn bk-btn--primary" to="/booking">
                {t('flow.checkStatus')}
              </Link>
              <Link className="bk-btn" to="/home">
                {t('flow.backHome')}
              </Link>
            </div>
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

      {/* Step 1 is the full width: the farm photo takes the summary's place. */}
      <div className={`flow${current === 1 ? ' flow--intro' : ''}`}>
        <div className="flow__main" key={current}>
          {loadError && (
            <p className="bk-error" role="alert">
              {t('flow.errLoad')}
            </p>
          )}

          {/* Step 1: a slideshow of the farm beside the calendar and guests. */}
          {current === 1 && (
            <div className="flow-intro">
              <div className="flow-intro__photo">
                <PhotoSlides photos={BOOKING_SLIDES} />
                <div className="flow-intro__caption">
                  <p className="flow-intro__title">{t('hero.title')}</p>
                  <p>{t('flow.introNote', { in: CHECK_IN_TIME, out: CHECK_OUT_TIME })}</p>
                </div>
              </div>

              <div className="flow-intro__side">
                <h1>{t('flow.pickDates')}</h1>
                <p className="flow__hint">{t('flow.pickDatesHint')}</p>
                <InlineCalendar checkIn={checkIn} checkOut={checkOut} onChange={handleDates} />

                <div className="flow-intro__row">
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

                <div className="flow-intro__row">
                  <span className="flow-intro__stay">
                    {nights ? (
                      <>
                        <strong>
                          {formatDay(checkIn, locale)} → {formatDay(checkOut, locale)}
                        </strong>
                        {' · '}
                        {t('flow.nights', { n: nights })}
                      </>
                    ) : (
                      t('date.select')
                    )}
                  </span>
                  <button type="button" className="bk-btn bk-btn--primary" disabled={!nights} onClick={() => goTo(2)}>
                    {t('flow.seeRooms')} →
                  </button>
                </div>
              </div>
            </div>
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

              {/* How much of the party the chosen rooms can sleep. */}
              {availableIds && freeRooms.length > 0 && (
                <div className={`flow-capacity${capacity >= guests ? ' is-enough' : ''}`} aria-live="polite">
                  <div className="flow-capacity__bar">
                    <span style={{ width: `${Math.min(100, (capacity / guests) * 100)}%` }} />
                  </div>
                  <p>
                    {capacity >= guests
                      ? t('flow.capacityOk', { have: Math.min(capacity, guests), need: guests })
                      : t('flow.capacityNeed', { have: capacity, need: guests, more: guests - capacity })}
                  </p>
                  {capacity >= guests && !split && chosen.length > guests && (
                    <p className="bk-error">{t('flow.tooManyRooms')}</p>
                  )}
                </div>
              )}

              {!availableIds && nights > 0 && !loadError && <p className="flow__hint">{t('flow.checking')}</p>}
              {availableIds && freeRooms.length === 0 && <p className="flow-rooms__none">{t('flow.noneFree')}</p>}

              <div className="flow-rooms">
                {freeRooms.map((r) => {
                  const names = roomNames(r.name, lang);
                  const roomPromo = promoFor(promotions, r.id, checkIn);
                  const plan = plans.find((p) => p.room.id === r.id);
                  const picked = roomIds.includes(r.id);
                  const quote = plan ?? priceStay(r, nights, Math.min(roomMaxGuests(r), r.capacity ?? 1), fee, 0, 0, roomPromo);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`flow-room${picked ? ' is-selected' : ''}`}
                      aria-pressed={picked}
                      onClick={() => toggleRoom(r.id)}
                    >
                      <span className="flow-room__check" aria-hidden="true">
                        {picked && (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        )}
                      </span>
                      <span className="flow-room__thumb">
                        <img
                          src={roomCover(r)}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </span>
                      <span className="flow-room__text">
                        <strong>{names.title}</strong>
                        {names.subtitle && <span>{names.subtitle}</span>}
                        <em className="is-free">
                          {plan ? t('flow.roomFor', { n: plan.guests }) : t('flow.sleeps', { n: roomMaxGuests(r) })}
                        </em>
                      </span>
                      <span className="flow-room__price">
                        <strong>{formatBaht(quote.total)}</strong>
                        <span>{t('sum.priceLine', { price: formatBaht(r.price), n: nights })}</span>
                        {plan?.extraGuests > 0 && <span>+ {t('price.extraSaved', { n: plan.extraGuests })}</span>}
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
                <button type="button" className="bk-btn bk-btn--primary" disabled={!split} onClick={() => goTo(3)}>
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

          {current === 4 && plans.length > 0 && (
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
                <p className="flow-deposit__amount">{formatBaht(grandTotal / 2)}</p>
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

        {current > 1 && (
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
              <dd>{chosen.length ? chosen.map((r) => roomNames(r.name, lang).title).join(', ') : '—'}</dd>
            </div>
          </dl>
          {plans.length === 1 && nights > 0 && (
            <PriceRows
              price={plans[0].room.price}
              nights={nights}
              extraGuests={plans[0].extraGuests}
              fee={fee}
              pets={form.pets}
              petFee={petRule.fee}
              discount={plans[0].discount}
              promoName={plans[0].promo && `${plans[0].promo.name} (-${plans[0].promo.percent}%)`}
            />
          )}
          {/* Several rooms: one line per room, then the combined total. */}
          {plans.length > 1 && nights > 0 && (
            <>
              <ul className="flow-side-rooms">
                {plans.map((p) => (
                  <li key={p.room.id}>
                    <span>
                      {roomNames(p.room.name, lang).title}
                      <small>
                        {t('sum.guestCount', { n: p.guests })} · {t('flow.nights', { n: nights })}
                        {p.discount > 0 && ` · ${t('promo.off', { percent: p.promo.percent })}`}
                      </small>
                    </span>
                    <span>{formatBaht(p.total)}</span>
                  </li>
                ))}
              </ul>
              <PriceRows total={grandTotal} deposit={grandTotal / 2} />
            </>
          )}
          {!(plans.length > 0 && nights > 0) && <p className="flow__side-empty">{t('sum.empty')}</p>}
        </aside>
        )}
      </div>
    </section>
  );
}
