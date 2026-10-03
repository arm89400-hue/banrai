import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import './AdminCalendar.css';

const STATUS_LABELS = { pending: 'Awaiting deposit', confirmed: 'Confirmed' };
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
// Stays are stored as UTC-midnight check-in/check-out, so every date here is
// a bare "YYYY-MM-DD" string: they compare correctly as plain text and never
// shift with the browser's timezone.
const dayKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const fmtDay = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function todayKey() {
  const now = new Date();
  return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// Admin "Calendar" section: one month at a time, a row per room and a column
// per night. A booked night is a coloured bar carrying the guest's name
// (amber while awaiting the deposit, green once confirmed); an empty cell is
// a free night. The bottom row counts the rooms still free each night.
export default function AdminCalendar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    Promise.all([api('/api/rooms'), api('/api/admin/bookings')])
      .then(([rooms, bookings]) => setData({ rooms: rooms.rooms, bookings: bookings.bookings }))
      .catch((err) => setError(err.message));
  }, []);

  const { year, month } = view;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayKey();
  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => ({
        n: i + 1,
        key: dayKey(year, month, i + 1),
        weekday: new Date(Date.UTC(year, month, i + 1)).getUTCDay(),
      })),
    [year, month, daysInMonth]
  );

  // Active room stays, as { ...booking, in, out } with bare date strings.
  const stays = useMemo(
    () =>
      (data?.bookings ?? [])
        .filter((b) => b.room_id && b.status !== 'cancelled')
        .map((b) => ({ ...b, in: b.booked_for.slice(0, 10), out: b.booked_until.slice(0, 10) })),
    [data]
  );

  // Each room's row as a list of cells: a free night, or a booking spanning
  // the nights it covers within this month.
  const rows = useMemo(() => {
    const rooms = [...(data?.rooms ?? [])].sort((a, b) => b.price - a.price);
    const nextMonth = new Date(year, month + 1, 1);
    const nextMonthStart = dayKey(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
    return rooms.map((room) => {
      const roomStays = stays.filter((s) => s.room_id === room.id);
      const cells = [];
      let i = 0;
      while (i < days.length) {
        const day = days[i];
        const stay = roomStays.find((s) => s.in <= day.key && day.key < s.out);
        if (!stay) {
          cells.push({ day });
          i += 1;
          continue;
        }
        let span = 1;
        while (i + span < days.length && days[i + span].key < stay.out) span += 1;
        cells.push({
          day,
          stay,
          span,
          // The stay began before this month / runs on into the next one.
          cutStart: stay.in < days[0].key,
          cutEnd: stay.out > nextMonthStart,
        });
        i += span;
      }
      return { room, cells };
    });
  }, [data, stays, days, year, month]);

  const freeByDay = useMemo(
    () =>
      days.map((day) => {
        const taken = new Set(stays.filter((s) => s.in <= day.key && day.key < s.out).map((s) => s.room_id));
        return (data?.rooms.length ?? 0) - taken.size;
      }),
    [days, stays, data]
  );

  const totalNights = (data?.rooms.length ?? 0) * days.length;
  const bookedNights = totalNights - freeByDay.reduce((sum, n) => sum + n, 0);

  function shift(delta) {
    setSelected(null);
    setView(({ year: y, month: m }) => {
      const next = new Date(y, m + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }
  function goToday() {
    const now = new Date();
    setSelected(null);
    setView({ year: now.getFullYear(), month: now.getMonth() });
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  if (error) return <p className="admin__error" role="alert">{error}</p>;
  if (!data) return <p className="admin__muted">Loading…</p>;

  return (
    <>
      <div className="admin__toolbar">
        <div className="cal__nav">
          <button type="button" className="admin__btn" onClick={() => shift(-1)} aria-label="Previous month">
            ←
          </button>
          <h2 className="cal__month">{monthLabel}</h2>
          <button type="button" className="admin__btn" onClick={() => shift(1)} aria-label="Next month">
            →
          </button>
          <button type="button" className="admin__btn" onClick={goToday}>
            Today
          </button>
        </div>
        <ul className="cal__legend">
          <li><span className="cal__swatch cal__swatch--free" /> Free</li>
          <li><span className="cal__swatch cal__swatch--pending" /> Awaiting deposit</li>
          <li><span className="cal__swatch cal__swatch--confirmed" /> Confirmed</li>
        </ul>
      </div>

      <p className="admin__muted cal__summary">
        {bookedNights} of {totalNights} room-nights booked this month
        {totalNights > 0 && ` (${Math.round((bookedNights / totalNights) * 100)}%)`}.
      </p>

      <div className="admin__table-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="cal__room">Room</th>
              {days.map((day) => (
                <th
                  key={day.key}
                  className={`cal__day${day.key === today ? ' is-today' : ''}${day.weekday === 0 || day.weekday === 6 ? ' is-weekend' : ''}`}
                >
                  <span>{WEEKDAYS[day.weekday]}</span>
                  {day.n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ room, cells }) => (
              <tr key={room.id}>
                <th scope="row" className="cal__room">
                  {room.name}
                </th>
                {cells.map((cell) =>
                  cell.stay ? (
                    <td key={cell.day.key} colSpan={cell.span} className="cal__cell cal__cell--booked">
                      <button
                        type="button"
                        className={`cal__bar cal__bar--${cell.stay.status}${cell.cutStart ? ' is-cut-start' : ''}${cell.cutEnd ? ' is-cut-end' : ''}${selected?.id === cell.stay.id ? ' is-selected' : ''}`}
                        title={`${cell.stay.guest_name || cell.stay.user_email || 'Guest'} · ${fmtDay(cell.stay.in)} → ${fmtDay(cell.stay.out)} · ${STATUS_LABELS[cell.stay.status]}`}
                        onClick={() => setSelected(selected?.id === cell.stay.id ? null : cell.stay)}
                      >
                        {cell.stay.guest_name || cell.stay.user_email || cell.stay.code}
                      </button>
                    </td>
                  ) : (
                    <td
                      key={cell.day.key}
                      className={`cal__cell cal__cell--free${cell.day.key === today ? ' is-today' : ''}${cell.day.key < today ? ' is-past' : ''}`}
                      title={`${room.name} · ${fmtDay(cell.day.key)} · free`}
                    />
                  )
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="cal__room">Rooms free</th>
              {days.map((day, i) => (
                <td
                  key={day.key}
                  className={`cal__count${freeByDay[i] === 0 ? ' is-full' : ''}${day.key === today ? ' is-today' : ''}`}
                >
                  {freeByDay[i]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <p className="admin__empty">No rooms yet.</p>}
      </div>

      {selected && (
        <div className="cal__detail">
          <div>
            <strong>{selected.code || `#${selected.id}`}</strong>
            <span className={`admin__status admin__status--${selected.status}`}>{STATUS_LABELS[selected.status]}</span>
          </div>
          <div>
            {selected.guest_name || selected.user_email || 'Guest'}
            {selected.guest_phone && (
              <>
                {' · '}
                <a href={`tel:${selected.guest_phone}`}>{selected.guest_phone}</a>
              </>
            )}
            {selected.guests ? ` · ${selected.guests} guests` : ''}
          </div>
          <div className="admin__muted">
            {selected.room_name} · {fmtDay(selected.in)} → {fmtDay(selected.out)}
            {selected.total != null && ` · ${formatBaht(selected.total)}`}
          </div>
          <Link to="/admin/bookings" className="admin__btn">
            Open Bookings
          </Link>
        </div>
      )}
    </>
  );
}
