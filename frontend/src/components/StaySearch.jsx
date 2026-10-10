import { useLang } from '../i18n/lang';
import { MAX_GUESTS } from '../lib/booking';
import DateRangePicker from './DateRangePicker';
import './StaySearch.css';

// The search row used on Home, the room page and the booking steps: the
// dates field (opens the calendar) and the number of guests with − / +.
// `children` adds an action at the end (Home's "see free rooms" button).
export default function StaySearch({ checkIn, checkOut, guests, onDates, onGuests, maxGuests = MAX_GUESTS, bookedNights, children, className = '' }) {
  const { t } = useLang();
  return (
    <div className={`stay-search ${className}`}>
      <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={onDates} bookedNights={bookedNights} />
      <div className="stay-search__guests">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
          <circle cx="9" cy="8" r="3.6" />
          <path d="M2 20c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6z" />
          <circle cx="17" cy="9" r="2.8" opacity=".55" />
          <path d="M15.6 13.6c3.5-.4 6.4 2 6.4 5.4h-4.2" opacity=".55" />
        </svg>
        <button type="button" onClick={() => onGuests(guests - 1)} disabled={guests <= 1} aria-label={t('flow.fewer')}>
          −
        </button>
        <output aria-live="polite">
          {guests}
          <small>{t('search.people')}</small>
        </output>
        <button type="button" onClick={() => onGuests(guests + 1)} disabled={guests >= maxGuests} aria-label={t('flow.more')}>
          +
        </button>
      </div>
      {children}
    </div>
  );
}
