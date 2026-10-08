import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import './AdminCalendar.css';

const STATUS_LABELS = { pending: 'Awaiting deposit', confirmed: 'Confirmed' };
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
// Stays are stored as UTC-midnight check-in/check-out, so every date here is
// a bare "YYYY-MM-DD" string: they compare correctly as plain text and never
// shift with the browser's timezone.
const keyOf = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const fmtDay = (key, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The 6 weeks (Sunday first) shown for a month, padded with the end of the
// previous month and the start of the next - like a desk calendar.
function monthWeeks(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      return { key: keyOf(date), n: date.getUTCDate(), inMonth: date.getUTCMonth() === month };
    })
  );
}

// Month calendar at the top of the admin Bookings section. Each day shows
// how many rooms are taken that night (a dot per booked room: amber =
// awaiting deposit, green = confirmed) and how many are free; a day with
// nothing free is tinted red. Clicking a day lists every room for that night
// - who is in it, or that it is free. `bookings` comes from the Bookings
// list, so the calendar updates whenever a booking is confirmed or cancelled.
export default function AdminCalendar({ bookings }) {
  const today = todayKey();
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    api('/api/rooms')
      .then((data) => setRooms([...data.rooms].sort((a, b) => b.price - a.price)))
      .catch((err) => setError(err.message));
  }, []);

  // Active room stays, as { ...booking, in, out } with bare date strings.
  const stays = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => b.room_id && b.status !== 'cancelled')
        .map((b) => ({ ...b, in: b.booked_for.slice(0, 10), out: b.booked_until.slice(0, 10) })),
    [bookings]
  );
  // The stays covering the night of `key` (check-out day itself is free).
  const staysOn = (key) => stays.filter((s) => s.in <= key && key < s.out);

  const weeks = useMemo(() => monthWeeks(view.year, view.month), [view]);
  const roomCount = rooms?.length ?? 0;

  function shift(delta) {
    setView(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  // Clicking a greyed day from a neighbouring month also turns to that month.
  function pick(day) {
    setSelected(day.key);
    if (!day.inMonth) {
      const [y, m] = day.key.split('-').map(Number);
      setView({ year: y, month: m - 1 });
    }
  }

  function goToday() {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(today);
  }

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  if (error) return <p className="admin__error" role="alert">{error}</p>;
  if (!rooms) return <p className="admin__muted cal-month__loading">Loading calendar…</p>;

  const night = staysOn(selected);

  return (
    <div className="cal-month">
      <section className="cal-month__card" aria-label="Booking calendar">
        <header className="cal-month__head">
          <h2>{monthLabel}</h2>
          <button type="button" className="cal-month__today" onClick={goToday}>
            Today
          </button>
          <button type="button" className="cal-month__arrow" onClick={() => shift(-1)} aria-label="Previous month">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="cal-month__arrow" onClick={() => shift(1)} aria-label="Next month">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="cal-month__grid">
          <div className="cal-month__row">
            {WEEKDAYS.map((w) => (
              <span key={w} className="cal-month__weekday">
                {w}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} className="cal-month__row">
              {week.map((day) => {
                const taken = staysOn(day.key);
                const free = roomCount - taken.length;
                const classes = [
                  'cal-month__day',
                  !day.inMonth && 'is-other',
                  day.key < today && 'is-past',
                  day.key === today && 'is-today',
                  day.key === selected && 'is-selected',
                  roomCount > 0 && free === 0 && 'is-full',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={classes}
                    aria-pressed={day.key === selected}
                    aria-label={`${fmtDay(day.key)}: ${taken.length} booked, ${free} free`}
                    onClick={() => pick(day)}
                  >
                    <span className="cal-month__num">{day.n}</span>
                    <span className="cal-month__dots" aria-hidden="true">
                      {taken.map((s) => (
                        <i key={s.id} className={`cal-month__dot cal-month__dot--${s.status}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <ul className="cal-month__legend">
          <li><i className="cal-month__dot cal-month__dot--pending" /> Awaiting deposit</li>
          <li><i className="cal-month__dot cal-month__dot--confirmed" /> Confirmed</li>
          <li><span className="cal-month__swatch" /> Fully booked</li>
        </ul>
      </section>

      <section className="cal-month__night" aria-live="polite">
        <h3>
          Night of {fmtDay(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h3>
        <p className="admin__muted">
          {night.length} of {roomCount} rooms booked · {roomCount - night.length} free
        </p>
        {roomCount === 0 && <p className="admin__empty">No rooms yet. Add them under Rooms.</p>}
        <ul>
          {rooms.map((room) => {
            const stay = night.find((s) => s.room_id === room.id);
            return (
              <li key={room.id} className={stay ? `is-${stay.status}` : 'is-free'}>
                <strong>{room.name}</strong>
                {stay ? (
                  <span>
                    {stay.guest_name || stay.user_email || 'Guest'} · {stay.code || `#${stay.id}`}
                    <small>
                      {fmtDay(stay.in)} → {fmtDay(stay.out)} · {STATUS_LABELS[stay.status]}
                      {stay.total != null && ` · ${formatBaht(stay.total)}`}
                    </small>
                  </span>
                ) : (
                  <span className="cal-month__free">Free</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
