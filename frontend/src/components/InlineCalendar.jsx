import { useState } from 'react';
import { useLang } from '../i18n/lang';
import { rangeIsFree, toISODate } from '../lib/booking';
import './InlineCalendar.css';

const NO_NIGHTS = new Set();

// Always-visible month calendar for picking a stay: first click sets
// check-in, the next (later) click sets check-out. `bookedNights` (a Set of
// "YYYY-MM-DD") crosses out nights that are already taken; a range can't
// span a taken night, though it may end on one (you check out that
// morning, the next guest arrives that afternoon).
export default function InlineCalendar({ checkIn, checkOut, onChange, bookedNights = NO_NIGHTS }) {
  const { t, locale } = useLang();
  const [viewMonth, setViewMonth] = useState(() => {
    const base = checkIn ? new Date(`${checkIn}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const today = toISODate(new Date());
  const picking = Boolean(checkIn && !checkOut);
  const hasBooked = bookedNights.size > 0;

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, month, i + 1))),
  ];

  // Can this day complete the range that's being picked?
  const canBeCheckOut = (day) => picking && day > checkIn && rangeIsFree(bookedNights, checkIn, day);

  function handlePick(day) {
    if (canBeCheckOut(day)) {
      onChange({ checkIn, checkOut: day });
    } else if (!bookedNights.has(day)) {
      // Start (or restart) the range from this day.
      onChange({ checkIn: day, checkOut: '' });
    }
  }

  function shiftMonth(delta) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  return (
    <div className="inline-cal">
      <div className="inline-cal__head">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={isCurrentMonth} aria-label={t('date.prev')}>
          &#8249;
        </button>
        <span aria-live="polite">
          {viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label={t('date.next')}>
          &#8250;
        </button>
      </div>

      <div className="inline-cal__grid">
        {t('date.weekdays').map((d) => (
          <span key={d} className="inline-cal__dow">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} />;

          const isPast = day < today;
          const taken = bookedNights.has(day) && !canBeCheckOut(day);
          const isEdge = day === checkIn || day === checkOut;
          const inRange = checkIn && checkOut && day > checkIn && day < checkOut;

          const classes = ['inline-cal__day'];
          if (isEdge) classes.push('is-edge');
          if (inRange) classes.push('in-range');
          if (taken) classes.push('is-taken');

          return (
            <button
              type="button"
              key={day}
              className={classes.join(' ')}
              disabled={isPast || taken}
              aria-pressed={isEdge}
              onClick={() => handlePick(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      {hasBooked && (
        <div className="inline-cal__legend">
          <span>
            <i className="inline-cal__swatch inline-cal__swatch--taken" />
            {t('cal.full')}
          </span>
          <span>
            <i className="inline-cal__swatch inline-cal__swatch--picked" />
            {t('cal.picked')}
          </span>
        </div>
      )}
    </div>
  );
}
