import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n/lang';
import InlineCalendar from './InlineCalendar';
import './DateRangePicker.css';

// Formats a "YYYY-MM-DD" date for the trigger field, e.g. "Aug 12" / "12 ส.ค.".
function formatShort(iso, locale) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Check-in/check-out range picker used in the Home page search bar. Renders
// a text trigger that opens a small modal (via a portal - see createPortal
// below) holding the booking page's calendar in its compact size, so both
// pick dates the same way.
export default function DateRangePicker({ checkIn, checkOut, onChange }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useLang();
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
            {/* The booking page's calendar, in its compact size. */}
            <InlineCalendar compact checkIn={checkIn} checkOut={checkOut} onChange={onChange} />

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
