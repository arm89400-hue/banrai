import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n/lang';
import './DateRangePicker.css';


// Formats a Date as a local "YYYY-MM-DD" string (the format checkIn/checkOut
// are stored/passed around in) - deliberately not toISOString(), which
// would convert to UTC and could shift the date by a day.
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parses a "YYYY-MM-DD" string back into a local-midnight Date.
function fromISODate(iso) {
  return new Date(`${iso}T00:00:00`);
}

// Returns a copy of the given date with the time zeroed out, so two dates
// can be compared/matched by day alone.
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Builds the array of calendar cells for a given month: null placeholders
// for the leading offset (so the 1st lines up under the right weekday) and
// trailing padding, then one Date per real day in between.
function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  // Always pad to a fixed 6 rows (42 cells) so the grid height - and the
  // Confirm button's position below it - stays constant across months,
  // instead of shifting depending on how many week-rows each month needs.
  while (cells.length < 42) cells.push(null);
  return cells;
}

// Formats an ISO date string for display in the trigger field, e.g.
// "Aug 12" / "12 ส.ค.".
function formatShort(iso, locale) {
  return fromISODate(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Check-in/check-out range picker used in the Home page search bar. Renders
// a text trigger that opens a centered modal calendar (via a portal - see
// createPortal below) for picking a start and end date, with the selected
// range and in-between days highlighted.
export default function DateRangePicker({ checkIn, checkOut, onChange }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useLang();
  const [viewMonth, setViewMonth] = useState(() => {
    const base = checkIn ? fromISODate(checkIn) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Click-outside-to-close is handled by the backdrop's own onClick (the
    // popup stops propagation) - a DOM-containment check here would be
    // wrong now that the popup is portaled to document.body, outside
    // rootRef's actual DOM subtree.
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const today = startOfDay(new Date());
  const checkInDate = checkIn ? startOfDay(fromISODate(checkIn)) : null;
  const checkOutDate = checkOut ? startOfDay(fromISODate(checkOut)) : null;

  // Advances the selection state on each day click: picks a fresh check-in
  // if none is set (or the range was already complete), restarts from an
  // earlier date if clicked before the current check-in, otherwise
  // completes the range by setting check-out.
  function handleDayClick(date) {
    if (date < today) return;

    if (!checkInDate || checkOutDate) {
      onChange({ checkIn: toISODate(date), checkOut: '' });
    } else if (date.getTime() === checkInDate.getTime()) {
      // ignore re-clicking the same day
    } else if (date < checkInDate) {
      onChange({ checkIn: toISODate(date), checkOut: '' });
    } else {
      onChange({ checkIn: toISODate(checkInDate), checkOut: toISODate(date) });
    }
  }

  // Moves the visible calendar forward/back by delta months (-1 or 1).
  function shiftMonth(delta) {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const cells = buildMonthGrid(viewMonth);
  const label = checkIn
    ? `${formatShort(checkIn, locale)} – ${checkOut ? formatShort(checkOut, locale) : t('date.selectOut')}`
    : t('date.select');

  return (
    <div className="date-range-picker" ref={rootRef}>
      <label>
        <span>{t('date.label')}</span>
        <button
          type="button"
          className="date-range-picker__trigger"
          onClick={() => setOpen((o) => !o)}
        >
          {label}
        </button>
      </label>

      {open &&
        createPortal(
        <div className="date-range-picker__backdrop" onClick={() => setOpen(false)}>
          <div className="date-range-picker__popup" onClick={(e) => e.stopPropagation()}>
            <div className="date-range-picker__header">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label={t('date.prev')}>
                &#8249;
              </button>
              <span>{viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => shiftMonth(1)} aria-label={t('date.next')}>
                &#8250;
              </button>
            </div>

            <div className="date-range-picker__weekdays">
              {t('date.weekdays').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="date-range-picker__grid">
              {cells.map((date, i) => {
                if (!date) {
                  return (
                    <span
                      key={i}
                      className="date-range-picker__cell date-range-picker__cell--empty"
                    />
                  );
                }

                const isPast = date < today;
                const isCheckIn = checkInDate && date.getTime() === checkInDate.getTime();
                const isCheckOut = checkOutDate && date.getTime() === checkOutDate.getTime();
                const inRange =
                  checkInDate && checkOutDate && date > checkInDate && date < checkOutDate;

                const classes = ['date-range-picker__cell'];
                if (isPast) classes.push('date-range-picker__cell--disabled');
                if (isCheckIn || isCheckOut) classes.push('date-range-picker__cell--selected');
                if (inRange) classes.push('date-range-picker__cell--in-range');

                return (
                  <button
                    type="button"
                    key={i}
                    className={classes.join(' ')}
                    disabled={isPast}
                    onClick={() => handleDayClick(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="date-range-picker__legend">
              <span>
                <i className="date-range-picker__swatch date-range-picker__swatch--range" />
                {t('date.inRange')}
              </span>
              <span>
                <i className="date-range-picker__swatch date-range-picker__swatch--selected" />
                {t('date.selected')}
              </span>
            </div>

            <button
              type="button"
              className="date-range-picker__confirm"
              disabled={!checkIn || !checkOut}
              onClick={() => setOpen(false)}
            >
              {t('date.confirm')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
