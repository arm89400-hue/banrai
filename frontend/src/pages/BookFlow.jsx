import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import {
  MAX_GUESTS,
  MAX_PETS,
  REQUEST_OPTIONS,
  addDays,
  bookedNightSet,
  formatDay,
  formatDayShort,
  formatStay,
  isISODate,
  nearbyFreeStays,
  nextFreeStart,
  nightsBetween,
  priceStay,
  promoFor,
  roomMaxGuests,
  roomNames,
  splitGuests,
  toISODate,
} from '../lib/booking';
import { usePromotions } from '../lib/promotions';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import { roomCover } from '../lib/photos';
import { shift } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import StaySearch from '../components/StaySearch';
import { Hen } from '../components/Pixel';
import { PromoTag } from '../components/BookingBits';
import PayDialog from '../components/PayDialog';
import Baht from '../components/Baht';
import { mergeBookings, payOptions } from '../lib/payments';
import { Loading, Sk } from '../components/Skeleton';
import './BookFlow.css';

const STEPS = ['step.room', 'step.details', 'step.review'];
const EMPTY_FORM = { name: '', phone: '', email: '', line: '', requests: [], pets: 0, note: '' };

const digits = (value) => value.replace(/\D/g, '');

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

export default function BookFlow() {
  const { t, lang, locale } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [checkIn, setCheckIn] = useState(() => (isISODate(params.get('in')) ? params.get('in') : ''));
  const [checkOut, setCheckOut] = useState(() => (isISODate(params.get('out')) ? params.get('out') : ''));
  const [guests, setGuests] = useState(() => {
    const n = Number.parseInt(params.get('guests'), 10);
    return Number.isInteger(n) ? Math.min(MAX_GUESTS, Math.max(1, n)) : 2;
  });
  const [roomIds, setRoomIds] = useState(() =>
    (params.get('rooms') ?? params.get('room') ?? '')
      .split(',')
      .map((id) => Number.parseInt(id, 10))
      .filter(Boolean),
  );
  const [step, setStep] = useState(() => Number.parseInt(params.get('step'), 10) || 1);

  const [rooms, setRooms] = useState(null);
  const [fee, setFee] = useState(0);
  const [petRule, setPetRule] = useState({ fee: 0, maxKg: 0 });
  const [availableIds, setAvailableIds] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, email: user?.email?.includes('@') ? user.email : '' }));
  const [errors, setErrors] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [roomNotice, setRoomNotice] = useState(null);
  const [done, setDone] = useState(null);
  const [pay, setPay] = useState(payOptions(null));

  const nights = nightsBetween(checkIn, checkOut);
  const chosen = roomIds.map((id) => rooms?.find((r) => r.id === id)).filter(Boolean);
  const promotions = usePromotions();
  const split = splitGuests(chosen, guests);
  const capacity = chosen.reduce((sum, r) => sum + roomMaxGuests(r), 0);
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

  // A returning member shouldn't type their name and phone again: fill them
  // from their last booking (they can still change them).
  const memberId = user && !user.is_stay && !user.is_admin ? user.id : null;
  useEffect(() => {
    if (!memberId) return undefined;
    let live = true;
    api('/api/bookings')
      .then((data) => {
        const last = [...(data?.bookings ?? [])]
          .filter((b) => b.guest_name || b.guest_phone)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        if (!live || !last) return;
        setForm((f) => ({
          ...f,
          name: f.name || last.guest_name || '',
          phone: f.phone || last.guest_phone || '',
        }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [memberId]);

  useEffect(() => {
    api('/api/rooms')
      .then((data) => {
        setRooms([...data.rooms].sort((a, b) => b.price - a.price));
        setFee(Number(data.extra_guest_fee) || 0);
        setPetRule({ fee: Number(data.pet_fee) || 0, maxKg: Number(data.pet_max_kg) || 0 });
      })
      .catch(() => setLoadError(true));
  }, []);

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

  const freeRooms = (rooms ?? []).filter((r) => availableIds?.has(r.id));
  const taken = availableIds ? (rooms ?? []).filter((r) => !availableIds.has(r.id)) : [];

  const [booked, setBooked] = useState(null);
  const needBooked = taken.length > 0 && !booked;
  useEffect(() => {
    if (!needBooked || !rooms) return;
    Promise.all(rooms.map((r) => api(`/api/rooms/${r.id}/booked`).then((data) => [r.id, bookedNightSet(data.booked)])))
      .then((pairs) => setBooked(new Map(pairs)))
      .catch(() => {});
  }, [needBooked, rooms]);
  const freeAgain =
    booked && nights
      ? taken
          .map((r) => nextFreeStart(booked.get(r.id) ?? new Set(), checkIn, nights))
          .filter(Boolean)
          .sort()[0]
      : null;
  const nearby =
    booked && nights && freeRooms.length === 0
      ? nearbyFreeStays(rooms, booked, checkIn, nights, guests, toISODate(new Date()))
      : [];

  useEffect(() => {
    if (!rooms || !availableIds || roomIds.length === 0) return;
    const stillFree = roomIds.filter((id) => availableIds.has(id) && rooms.some((r) => r.id === id));
    if (stillFree.length !== roomIds.length) {
      setRoomIds(stillFree);
      setRoomNotice('flow.errRoomTaken');
    }
  }, [roomIds, rooms, availableIds]);

  function toggleRoom(id) {
    shift(
      () => {
        setRoomNotice(null);
        setRoomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
      },
      { cards: '.flow-stay, .flow-bar' }
    );
  }

  let allowed = 1;
  if (nights && split) allowed = 2;
  if (allowed === 2 && Object.keys(validateForm(form)).length === 0) allowed = 3;
  const current = Math.min(Math.max(step, 1), allowed);

  const needsLogin = !user && current >= 2;

  const isStay = Boolean(user?.is_stay);

  useEffect(() => {
    if (done || needsLogin || isStay) return;
    const next = new URLSearchParams();
    if (checkIn) next.set('in', checkIn);
    if (checkOut) next.set('out', checkOut);
    next.set('guests', String(guests));
    if (roomIds.length) next.set('rooms', roomIds.join(','));
    next.set('step', String(current));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [checkIn, checkOut, guests, roomIds, current, done, needsLogin, isStay]);

  useEffect(() => {
    document.body.classList.add('has-bottom-bar');
    return () => document.body.classList.remove('has-bottom-bar');
  }, []);

  function goTo(nextStep) {
    shift(
      () => {
        setStep(nextStep);
        setSubmitError(null);
      },
      { cards: '.flow-top, .flow-stay' },
    );
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
    if (Object.keys(found).length === 0) goTo(3);
  }

  function toggleRequest(option) {
    setForm((f) => ({
      ...f,
      requests: f.requests.includes(option) ? f.requests.filter((r) => r !== option) : [...f.requests, option],
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
      const sender = document.activeElement?.closest('button');
      shift(
        () => {
          setDone(data.bookings ?? [data.booking]);
          setPay(payOptions(data));
        },
        { from: sender, to: '.pay-dialog__box' }
      );
    } catch (err) {
      if (err.reason === 'ROOM_TAKEN') {
        setRoomNotice('flow.errRoomTaken');
        setAvailableIds(null);
        api(`/api/rooms?checkIn=${checkIn}&checkOut=${checkOut}`)
          .then((data) => setAvailableIds(new Set(data.rooms.map((r) => r.id))))
          .catch(() => setLoadError(true));
        goTo(1);
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

  if (!done && needsLogin) {
    const back = new URLSearchParams({
      in: checkIn,
      out: checkOut,
      guests: String(guests),
      rooms: roomIds.join(','),
      step: '2',
    });
    return <Navigate to={`/login?next=${encodeURIComponent(`/book?${back}`)}`} replace />;
  }
  if (isStay) return <Navigate to="/stay" replace />;

  const extraGuests = plans.reduce((sum, p) => sum + p.extraGuests, 0);
  const extraTotal = plans.reduce((sum, p) => sum + p.extraTotal, 0);
  const petTotal = plans.reduce((sum, p) => sum + p.petTotal, 0);

  let next;
  if (current === 1) {
    if (!nights) next = { label: t('flow.needDates'), disabled: true };
    else if (!chosen.length) next = { label: t('flow.needRoom'), disabled: true };
    else if (!split)
      next = {
        label: capacity < guests ? t('flow.needMore', { n: guests - capacity }) : t('flow.tooManyShort'),
        disabled: true,
      };
    else next = { label: t('flow.toDetails'), onClick: () => goTo(2) };
  } else if (current === 2) {
    next = { label: t('flow.toReview'), form: 'flow-details' };
  } else {
    next = {
      label: submitting ? t('flow.submitting') : t('flow.submit'),
      disabled: submitting,
      // Not ticked yet: point at the box instead of a button that does nothing.
      onClick: accepted
        ? handleSubmit
        : () => {
            setNudge((n) => n + 1);
            document.querySelector('.flow__accept')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
    };
  }
  // Until there is something to do, say what is missing as plain text, not as
  // a grey button that looks pressable.
  const nextButton = (className) =>
    next.disabled && !submitting ? (
      <p key={`hint-${current}`} className={`${className} is-hint`}>
        {next.label}
      </p>
    ) : (
    <button
      key={current}
      type={next.form ? 'submit' : 'button'}
      form={next.form}
      className={className}
      disabled={next.disabled}
      onClick={next.onClick}
    >
      {next.label}
    </button>
    );

  return (
    <section className="flow-page">
      <div className="flow-top">
        <button
          type="button"
          className="flow-top__back"
          onClick={() => (current > 1 ? goTo(current - 1) : navigate('/home'))}
        >
          ‹ {t('flow.back')}
        </button>
        <ol className="flow-steps">
          {STEPS.map((key, i) => {
            const n = i + 1;
            const state = n < current ? 'done' : n === current ? 'now' : 'todo';
            return (
              <li key={key} className={`is-${state}`} aria-current={n === current ? 'step' : undefined}>
                <button type="button" disabled={n > allowed || n === current} onClick={() => goTo(n)}>
                  <i>{state === 'done' ? '✓' : n}</i>
                  {t(key)}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flow">
        <div className="flow__main" key={current}>
          {loadError && (
            <p className="bk-error" role="alert">
              {t('flow.errLoad')}
            </p>
          )}

          {current === 1 && (
            <>
              <StaySearch
                className="stay-search--flat"
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guests}
                onDates={handleDates}
                onGuests={(n) => setGuests(Math.min(MAX_GUESTS, Math.max(1, n)))}
              />

              {!nights && <p className="flow__hint">{t('flow.startHint')}</p>}
              {nights > 0 && !availableIds && !loadError && (
                <Loading label={t('flow.checking')}>
                  <div className="flow__label">
                    <Sk w="130px" h="1.3em" />
                  </div>
                  <div className="flow-tiles">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="flow-tile flow-tile--sk" aria-hidden="true">
                        <Sk className="flow-tile__sk-photo" h="auto" r="10px" />
                        <span className="flow-tile__row">
                          <Sk w={`${42 - (i % 2) * 10}%`} h="1.2em" />
                          <Sk w="24%" h="1.2em" />
                        </span>
                        <Sk w="60%" h="0.9em" />
                      </span>
                    ))}
                  </div>
                </Loading>
              )}
              {roomNotice && (
                <p className="bk-error" role="alert">
                  {t(roomNotice)}
                </p>
              )}
              {availableIds && freeRooms.length === 0 && (
                <div className="flow-none">
                  <Hen scale={4} className="flow-none__hen" />
                  <p>
                    <b>{t('flow.noneFreeTitle')}</b>
                    <br />
                    {nearby.length > 0 ? t('flow.nearbyLead', { n: nights }) : t('flow.noneFree')}
                  </p>
                  {nearby.length > 0 && (
                    <div className="flow-nearby">
                      {nearby.map((stay) => (
                        <button type="button" key={stay.checkIn} onClick={() => handleDates(stay)}>
                          {formatStay(stay.checkIn, stay.checkOut, locale, t('date.wd'))}
                          <span>{t('flow.nearbyRooms', { n: stay.rooms.length })}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {availableIds && freeRooms.length > 0 && (
                <>
                  <div className="flow__label">
                    <h2>{t('flow.freeRooms')}</h2>
                    <span>{t('flow.priceFor', { n: nights })}</span>
                  </div>
                  {chosen.length > 0 && !split && (
                    <p className="flow-short" aria-live="polite">
                      {capacity < guests
                        ? t('flow.capacityNeed', { have: capacity, need: guests, more: guests - capacity })
                        : t('flow.tooManyRooms')}
                    </p>
                  )}
                  <div className="flow-tiles">
                    {freeRooms.map((r) => {
                      const names = roomNames(r.name, lang);
                      const roomPromo = promoFor(promotions, r.id, checkIn);
                      const picked = roomIds.includes(r.id);
                      const max = roomMaxGuests(r);
                      const base = priceStay(r, nights, Math.min(max, r.capacity ?? 1), fee, 0, 0, roomPromo).total;
                      return (
                        <button
                          type="button"
                          key={r.id}
                          className={`flow-tile${picked ? ' is-on' : ''}`}
                          aria-pressed={picked}
                          onClick={() => toggleRoom(r.id)}
                        >
                          <img
                            src={roomCover(r)}
                            alt=""
                            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                          />
                          <span className="flow-tile__row">
                            <strong>{names.title}</strong>
                            <b>{formatBaht(base)}</b>
                          </span>
                          <span className="flow-tile__facts">
                            <span>
                              {r.capacity && max > r.capacity
                                ? t('rooms.guestsRange', { from: r.capacity, to: max })
                                : t('rooms.guests', { n: r.capacity || max })}
                            </span>
                            <em className="flow-tile__pick">
                              {picked && (
                                <svg
                                  viewBox="0 0 24 24"
                                  width="16"
                                  height="16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              )}
                              {picked ? t('flow.picked') : t('flow.pickThis')}
                            </em>
                          </span>
                          {roomPromo && <PromoTag promo={roomPromo} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {taken.length > 0 && (
                <p className="flow-taken">
                  {t('flow.takenLine', { rooms: taken.map((r) => roomNames(r.name, lang).title).join(', ') })}
                  {freeAgain && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => handleDates({ checkIn: freeAgain, checkOut: addDays(freeAgain, nights) })}
                      >
                        {t('flow.freeAgain', { date: formatDayShort(freeAgain, locale, t('date.wd')) })} ›
                      </button>
                    </>
                  )}
                </p>
              )}
            </>
          )}

          {current === 2 && (
            <form id="flow-details" onSubmit={handleDetailsNext} noValidate>
              <h1 className="flow__title">{t('flow.details')}</h1>
              <div className="flow__fields">
                <label className={`bk-field${errors.name ? ' bk-field--error' : ''}`}>
                  <span className="bk-label">{t('flow.name')}</span>
                  <input autoComplete="name" placeholder={t('flow.namePh')} {...field('name')} />
                  {errors.name && <span className="bk-error">{t(errors.name)}</span>}
                </label>
                <label className={`bk-field${errors.phone ? ' bk-field--error' : ''}`}>
                  <span className="bk-label">{t('flow.phone')}</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={t('flow.phonePh')}
                    {...field('phone')}
                  />
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
            </form>
          )}

          {current === 3 && plans.length > 0 && (
            <>
              <h1 className="flow__title">{t('flow.review')}</h1>
              <section className="flow-review">
                <h2>
                  {t('review.stay')}
                  <button type="button" onClick={() => goTo(1)}>
                    {t('review.edit')}
                  </button>
                </h2>
                <dl className="flow-list">
                  <div>
                    <dt>{t('review.room')}</dt>
                    <dd>
                      {plans.map((p) => roomNames(p.room.name, lang).title).join(', ')} ·{' '}
                      {t('sum.guestCount', { n: guests })}
                    </dd>
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
              </section>

              <section className="flow-review">
                <h2>
                  {t('review.guest')}
                  <button type="button" onClick={() => goTo(2)}>
                    {t('review.edit')}
                  </button>
                </h2>
                <dl className="flow-list">
                  <div>
                    <dt>{t('review.name')}</dt>
                    <dd>{form.name}</dd>
                  </div>
                  <div>
                    <dt>{t('sum.phone')}</dt>
                    <dd>{form.phone}</dd>
                  </div>
                  {form.email.trim() && (
                    <div>
                      <dt>{t('flow.emailShort')}</dt>
                      <dd>{form.email}</dd>
                    </div>
                  )}
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
              </section>

              <dl className="flow-review flow-review__money">
                <div>
                  <dt>{t('sum.total')}</dt>
                  <dd><Baht value={grandTotal} /></dd>
                </div>
                <div className="flow-review__dep">
                  <dt>{t('review.depositAfter')}</dt>
                  <dd><Baht value={grandTotal / 2} /></dd>
                </div>
              </dl>

              <label key={nudge} className={`flow__accept${nudge ? ' is-nudged' : ''}`}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>{t('flow.accept')}</span>
              </label>
              {nudge > 0 && !accepted && (
                <p className="flow__accept-say" role="alert">
                  {t('flow.acceptFirst')}
                </p>
              )}

              {submitError && (
                <p className="bk-error" role="alert">
                  {t(submitError)}
                </p>
              )}
            </>
          )}
        </div>

        <aside className="flow-stay">
          <h2>{t('stayBox.title')}</h2>
          <dl className="flow-stay__rows">
            <div>
              <dt>{t('stayBox.dates')}</dt>
              <dd>{nights ? formatStay(checkIn, checkOut, locale, t('date.wd')) : '—'}</dd>
            </div>
            <div>
              <dt>{t('stayBox.party')}</dt>
              <dd>{nights ? t('stayBox.partyValue', { guests, nights }) : t('sum.guestCount', { n: guests })}</dd>
            </div>
            {plans.map((p) => (
              <div key={p.room.id}>
                <dt>{roomNames(p.room.name, lang).title}</dt>
                <dd>{formatBaht(p.base - p.discount)}</dd>
              </div>
            ))}
            {extraGuests > 0 && (
              <div>
                <dt>{t('price.extraSaved', { n: extraGuests })}</dt>
                <dd>{formatBaht(extraTotal)}</dd>
              </div>
            )}
            {petTotal > 0 && (
              <div>
                <dt>{t('price.petSaved', { n: form.pets })}</dt>
                <dd>{formatBaht(petTotal)}</dd>
              </div>
            )}
            {plans.length > 0 && nights > 0 && (
              <>
                <div className="flow-stay__total">
                  <dt>{t('sum.total')}</dt>
                  <dd><Baht value={grandTotal} /></dd>
                </div>
                <div className="flow-stay__dep">
                  <dt>{t('sum.deposit')}</dt>
                  <dd><Baht value={grandTotal / 2} /></dd>
                </div>
              </>
            )}
          </dl>
          {nextButton('flow-stay__go')}
        </aside>
      </div>

      <div className="flow-bar">
        <span className="flow-bar__info">
          <small>
            {nights ? t('stayBox.partyValue', { guests, nights }) : t('sum.guestCount', { n: guests })}
            {chosen.length > 0 && ` · ${t('flow.nRooms', { n: chosen.length })}`}
          </small>
          <b>
            {plans.length > 0 && nights > 0
              ? <Baht value={grandTotal} />
              : t(current === 1 ? 'flow.noRoomYet' : STEPS[current - 1])}
          </b>
        </span>
        {nextButton('flow-bar__go')}
      </div>

      {done && (
        <PayDialog bookings={done} pay={pay} onPaid={(updated) => setDone((list) => mergeBookings(list, updated))} />
      )}
    </section>
  );
}
