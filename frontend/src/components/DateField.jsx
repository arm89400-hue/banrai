import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/lang';
import { toISODate } from '../lib/booking';
import './InlineCalendar.css';
import './DateField.css';

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

export default function DateField({ value, onChange, withTime = false, min, required = false, clearable = false, emptyLabel }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const date = value ? value.slice(0, 10) : '';
  const time = withTime && value ? value.slice(11, 16) : '12:00';
  const minDate = min ? min.slice(0, 10) : '';
  const [viewMonth, setViewMonth] = useState(() => {
    const base = date ? new Date(`${date}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Open toward whichever side has room: a field in the right-hand column of
  // a drawer would otherwise push the calendar past the drawer's edge.
  const popRef = useRef(null);
  const [toRight, setToRight] = useState(false);
  useLayoutEffect(() => {
    if (!open) {
      setToRight(false);
      return;
    }
    const pop = popRef.current;
    const box = boxRef.current;
    if (!pop || !box) return;
    let edge = window.innerWidth;
    for (let el = box.parentElement; el && el !== document.body; el = el.parentElement) {
      const o = getComputedStyle(el).overflowX;
      if (o !== 'visible') {
        edge = Math.min(edge, el.getBoundingClientRect().right);
        break;
      }
    }
    const field = box.getBoundingClientRect();
    if (field.left + pop.offsetWidth > edge - 8) setToRight(true);
  }, [open]);

  const set = (d, tm = time) => onChange(withTime ? `${d}T${tm}` : d);

  const label = value
    ? new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
      (withTime ? ` · ${time}${t('adm.date.oclock') ? ` ${t('adm.date.oclock')}` : ''}` : '')
    : emptyLabel ?? t('adm.date.pick');

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => toISODate(new Date(year, month, i + 1))),
  ];
  const today = toISODate(new Date());
  const [hh, mm] = time.split(':');

  return (
    <div className="date-field" ref={boxRef}>
      <button type="button" className={`date-field__btn${value ? '' : ' is-empty'}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        {label}
      </button>
      <input className="date-field__check" tabIndex={-1} aria-hidden="true" required={required} value={value} onChange={() => {}} />

      {open && (
        <div
          ref={popRef}
          className={`date-field__pop${toRight ? ' is-right' : ''}`}
          role="dialog"
          aria-label={t('adm.date.pick')}
        >
          <div className="inline-cal inline-cal--compact">
            <div className="inline-cal__head">
              <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} aria-label={t('date.prev')}>
                &#8249;
              </button>
              <span aria-live="polite">{viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} aria-label={t('date.next')}>
                &#8250;
              </button>
            </div>
            <div className="inline-cal__grid">
              {t('date.weekdays').map((d) => (
                <span key={d} className="inline-cal__dow">
                  {d}
                </span>
              ))}
              {cells.map((d, i) =>
                d ? (
                  <button
                    type="button"
                    key={d}
                    className={`inline-cal__day${d === date ? ' is-edge' : ''}${d === today ? ' is-today' : ''}`}
                    disabled={Boolean(minDate) && d < minDate}
                    aria-pressed={d === date}
                    onClick={() => {
                      set(d);
                      if (!withTime) setOpen(false);
                    }}
                  >
                    <span className="inline-cal__n">{Number(d.slice(8))}</span>
                  </button>
                ) : (
                  <span key={`pad-${i}`} />
                ),
              )}
            </div>
          </div>

          {withTime && (
            <div className="date-field__time">
              <span>{t('adm.date.time')}</span>
              <select aria-label={t('adm.date.hour')} value={hh} onChange={(e) => set(date || today, `${e.target.value}:${mm}`)}>
                {HOURS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
              <b>:</b>
              <select aria-label={t('adm.date.minute')} value={MINUTES.includes(mm) ? mm : '00'} onChange={(e) => set(date || today, `${hh}:${e.target.value}`)}>
                {MINUTES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <span>{t('adm.date.oclock')}</span>
            </div>
          )}

          <div className="date-field__foot">
            <button type="button" className="adm-link" onClick={() => set(today)}>
              {t('adm.date.today')}
            </button>
            {clearable && value && (
              <button
                type="button"
                className="adm-link"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {t('adm.date.clear')}
              </button>
            )}
            <button type="button" className="admin__btn admin__btn--primary" onClick={() => setOpen(false)}>
              {t('adm.date.done')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
