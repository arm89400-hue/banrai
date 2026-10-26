import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { shift } from '../lib/motion';
import { useLang } from '../i18n/lang';
import { formatDayShort, formatStay, nightsBetween } from '../lib/booking';
import { CHECK_IN_TIME, CHECK_OUT_TIME } from '../lib/site';
import InlineCalendar from './InlineCalendar';
import './DateRangePicker.css';

export default function DateRangePicker({ checkIn, checkOut, onChange, bookedNights, className = '' }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('in');
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, [open]);

  function show(e) {
    const field = e?.currentTarget;
    shift(
      () => {
        setMode(checkIn && !checkOut ? 'out' : 'in');
        setOpen(true);
      },
      { from: field, to: '.date-sheet__panel' }
    );
  }

  function pick(dates) {
    onChange(dates);
    setMode(dates.checkIn && !dates.checkOut ? 'out' : 'in');
  }

  const tab = (which, label, value) => (
    <button
      type="button"
      className={`date-sheet__tab${mode === which ? ' is-on' : ''}`}
      aria-pressed={mode === which}
      onClick={() => setMode(which === 'out' && !checkIn ? 'in' : which)}
    >
      <small>{label}</small>
      <b className={value ? '' : 'is-empty'}>
        {value ? formatDayShort(value, locale, t('date.wd')) : t('date.pick')}
      </b>
    </button>
  );

  return (
    <>
      <button type="button" className={`dates-field ${className}`} onClick={show} aria-haspopup="dialog">
        <svg className="dates-field__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
          <path d="M8 14h2M14 14h2M8 17h2" strokeWidth="2.4" />
        </svg>
        <span className="dates-field__txt">
          <small>{nights ? `${t('date.label')} · ${t('flow.nights', { n: nights })}` : t('date.label')}</small>
          <b className={checkIn ? '' : 'is-empty'}>{checkIn ? formatStay(checkIn, checkOut, locale, t('date.wd')) : t('date.select')}</b>
        </span>
      </button>

      {open &&
        createPortal(
          <div /* NOSONAR - Escape closes it (keydown listener above) */ className="date-sheet" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="date-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="date-sheet-title">
              <span className="date-sheet__grip" aria-hidden="true" />
              <div className="date-sheet__top">
                <h2 id="date-sheet-title">{t('date.sheetTitle')}</h2>
                <button type="button" className="date-sheet__close" onClick={() => setOpen(false)} aria-label={t('date.close')}>
                  ×
                </button>
              </div>
              <div className="date-sheet__tabs">
                {tab('in', `${t('date.inTab')} ${CHECK_IN_TIME}`, checkIn)}
                {tab('out', `${t('date.outTab')} ${CHECK_OUT_TIME}`, checkOut)}
              </div>
              <InlineCalendar checkIn={checkIn} checkOut={checkOut} onChange={pick} bookedNights={bookedNights} mode={mode} />
              <div className="date-sheet__foot">
                {checkIn && (
                  <button type="button" className="date-sheet__clear" onClick={() => pick({ checkIn: '', checkOut: '' })}>
                    {t('date.clear')}
                  </button>
                )}
                <button type="button" className="date-sheet__done" disabled={!nights} onClick={() => setOpen(false)}>
                  {nights ? t('date.use', { n: nights }) : checkIn ? t('date.selectOut') : t('date.pickIn')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
