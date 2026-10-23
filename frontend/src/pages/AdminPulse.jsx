import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { addDays, toISODate } from '../lib/booking';
import { formatBaht } from '../lib/money';
import { useTween } from '../lib/glide';
import { useLang } from '../i18n/lang';
import AdminIcon from '../components/AdminIcons';
import { LOG_TYPES, logLabel } from './AdminPeople';
import './AdminPulse.css';

const GREEN = '#2d805a'; // chart green (brand family, chroma-checked)
const GOLD = '#c49a4c'; // chart straw, near the site's gold (needs labels: low contrast on light)

const day = (iso) => new Date(`${iso}T00:00:00`);

function Count({ value, money = false }) {
  const n = useTween(Number(value) || 0, 900);
  return <span className="num">{money ? formatBaht(n) : n}</span>;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Rooms taken on a night (a booking covers check-in up to, not including, check-out).
function roomsOn(groups, iso) {
  return groups.reduce((n, g) => n + (g.checkIn <= iso && iso < g.checkOut ? g.live.length : 0), 0);
}

// ---------------------------------------------------------------------------
// The band at the top: greeting, live clock, tonight's rooms as a ring,
// and the numbers that matter today. Each tile is a door to the work.
// ---------------------------------------------------------------------------
export function Pulse({ groups, rooms, jobs, waiting, onChat }) {
  const { t, locale } = useLang();
  const now = useClock();
  const today = toISODate(now);
  const live = groups.filter((g) => g.status !== 'cancelled');
  const tonight = roomsOn(live, today);
  const total = rooms.length || 1;
  const inToday = live.filter((g) => g.checkIn === today).length;
  const outToday = live.filter((g) => g.checkOut === today).length;
  const month = today.slice(0, 7);
  const monthMoney = live.filter((g) => g.checkIn.slice(0, 7) === month).reduce((n, g) => n + g.total, 0);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(now));
  const greet = hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
  const pct = Math.round((tonight / total) * 100);
  const ring = useTween(pct, 1200);
  const R = 46;
  const C = 2 * Math.PI * R;

  const tiles = [
    { key: 'in', icon: 'bookings', label: t('adm.pulse.in'), value: inToday, to: '/admin/bookings' },
    { key: 'out', icon: 'bookings', label: t('adm.pulse.out'), value: outToday, to: '/admin/bookings' },
    { key: 'jobs', icon: 'overview', label: t('adm.pulse.jobs'), value: jobs, hot: jobs > 0, href: '#tdy-jobs' },
    { key: 'chat', icon: 'chat', label: t('adm.pulse.chat'), value: waiting, hot: waiting > 0, onClick: () => onChat?.() },
  ];

  return (
    <section className="pulse" aria-label={t('adm.pulse.title')}>
      <div className="pulse__top">
        <div className="pulse__hello">
          <p className="pulse__greet">{t(`adm.pulse.greet.${greet}`)}</p>
          <h1>{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
          <p className="pulse__clock">
            <span className="pulse__live" aria-hidden="true" />
            {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} · {t('adm.pulse.live')}
          </p>
        </div>
        <div className="pulse__ring" role="img" aria-label={t('adm.pulse.tonight', { n: tonight, total: rooms.length })}>
          <svg viewBox="0 0 110 110" width="128" height="128" aria-hidden="true">
            <circle cx="55" cy="55" r={R} className="pulse__ring-bg" />
            <circle
              cx="55"
              cy="55"
              r={R}
              className="pulse__ring-fg"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ring / 100)}
            />
          </svg>
          <span>
            <b className="num">
              {tonight}/{rooms.length}
            </b>
            <small>{t('adm.pulse.roomsTonight')}</small>
          </span>
        </div>
      </div>
      <div className="pulse__tiles">
        {tiles.map((tile, i) => {
          const body = (
            <>
              <span className="pulse__tile-icon">
                <AdminIcon name={tile.icon} size={18} />
              </span>
              <b>
                <Count value={tile.value} />
              </b>
              <span>{tile.label}</span>
            </>
          );
          const cls = `pulse__tile${tile.hot ? ' is-hot' : ''}`;
          const style = { '--i': i };
          if (tile.onClick) {
            return (
              <button key={tile.key} type="button" className={cls} style={style} onClick={tile.onClick}>
                {body}
              </button>
            );
          }
          if (tile.href) {
            return (
              <a key={tile.key} className={cls} style={style} href={tile.href}>
                {body}
              </a>
            );
          }
          return (
            <Link key={tile.key} className={cls} style={style} to={tile.to}>
              {body}
            </Link>
          );
        })}
        <Link className="pulse__tile pulse__tile--money" style={{ '--i': 4 }} to="/admin/bookings">
          <span className="pulse__tile-icon">฿</span>
          <b>
            <Count value={monthMoney} money />
          </b>
          <span>{t('adm.pulse.month', { month: now.toLocaleDateString(locale, { month: 'long' }) })}</span>
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rooms taken each night for the next 30 nights, one bar per night.
// ---------------------------------------------------------------------------
export function OccupancyChart({ groups, rooms }) {
  const { t, locale } = useLang();
  const [hover, setHover] = useState(null);
  const today = toISODate(new Date());
  const total = rooms.length || 1;
  const live = groups.filter((g) => g.status !== 'cancelled');
  const nights = useMemo(
    () => Array.from({ length: 30 }, (_, i) => { const iso = addDays(today, i); return { iso, n: roomsOn(live, iso) }; }),
    [groups, today]
  );
  const avg = Math.round((nights.reduce((s, x) => s + x.n, 0) / (nights.length * total)) * 100);
  const full = nights.filter((x) => x.n >= total).length;
  const W = 600;
  const H = 150;
  const gap = 4;
  const bw = (W - gap * (nights.length - 1)) / nights.length;
  const y = (n) => (n / total) * (H - 6);
  const fmt = (iso, o) => day(iso).toLocaleDateString(locale, o);
  const shown = hover != null ? nights[hover] : null;

  return (
    <section className="achart adm-card">
      <header className="achart__head">
        <div>
          <h2>{t('adm.chart.occTitle')}</h2>
          <p>{t('adm.chart.occLead', { avg, full })}</p>
        </div>
        <p className="achart__readout" aria-live="polite">
          {shown ? (
            <>
              <b>{fmt(shown.iso, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ·{' '}
              {t('adm.chart.roomsOf', { n: shown.n, total: rooms.length })}
            </>
          ) : (
            <span className="adm-muted">{t('adm.chart.hover')}</span>
          )}
        </p>
      </header>
      <div className="achart__plot">
        <svg viewBox={`0 0 ${W} ${H + 22}`} preserveAspectRatio="none" role="img" aria-label={t('adm.chart.occTitle')}>
          {[0.5, 1].map((f) => (
            <line key={f} x1="0" x2={W} y1={H - (H - 6) * f} y2={H - (H - 6) * f} className="achart__grid" />
          ))}
          {nights.map((x, i) => {
            const h = Math.max(x.n ? y(x.n) : 0, 0);
            const isToday = i === 0;
            const wkend = [0, 6].includes(day(x.iso).getDay());
            return (
              <g key={x.iso} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} tabIndex={-1}>
                <rect x={i * (bw + gap) - gap / 2} y="0" width={bw + gap} height={H + 22} fill="transparent" />
                {x.n === 0 && <rect x={i * (bw + gap)} y={H - 2} width={bw} height="2" rx="1" className="achart__zero" />}
                {x.n > 0 && (
                  <rect
                    className={`achart__bar${hover === i ? ' is-hover' : ''}`}
                    style={{ '--i': i, fill: GREEN }}
                    x={i * (bw + gap)}
                    y={H - h}
                    width={bw}
                    height={h}
                    rx="4"
                  />
                )}
                {(isToday || i % 7 === 0) && (
                  <text x={i * (bw + gap) + bw / 2} y={H + 16} className={`achart__tick${isToday ? ' is-today' : ''}`}>
                    {isToday ? t('adm.dash.today') : fmt(x.iso, { day: 'numeric', month: 'short' })}
                  </text>
                )}
                {wkend && <rect x={i * (bw + gap)} y={H + 3} width={bw} height="2" className="achart__wkend" />}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="achart__foot">
        <span className="achart__key" style={{ background: GREEN }} /> {t('adm.chart.occKey')}
        <span className="achart__key achart__key--wk" /> {t('adm.chart.weekend')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Money per month (by check-in month): booked vs already received.
// ---------------------------------------------------------------------------
export function MoneyChart({ groups }) {
  const { t, locale } = useLang();
  const [hover, setHover] = useState(null);
  const now = new Date();
  const months = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return toISODate(d).slice(0, 7);
  });
  const live = groups.filter((g) => g.status !== 'cancelled');
  const data = months.map((m) => {
    const inMonth = live.filter((g) => g.checkIn.slice(0, 7) === m);
    const booked = inMonth.reduce((n, g) => n + g.total, 0);
    const received = inMonth.reduce((n, g) => {
      if (g.status !== 'confirmed') return n;
      return n + g.live.reduce((s, r) => s + Number(r.deposit || 0) + (r.balance_paid_at ? Math.max(0, Number(r.total) - Number(r.deposit)) : 0), 0);
    }, 0);
    return { m, booked, received };
  });
  const max = Math.max(1, ...data.map((d) => d.booked));
  const W = 600;
  const H = 150;
  const slot = W / data.length;
  const bw = Math.min(28, slot / 3);
  const y = (v) => (v / max) * (H - 18);
  const label = (m, style = 'short') => new Date(`${m}-01T00:00:00`).toLocaleDateString(locale, { month: style });
  const thisMonth = toISODate(now).slice(0, 7);
  const shown = hover != null ? data[hover] : data.find((d) => d.m === thisMonth);

  return (
    <section className="achart adm-card">
      <header className="achart__head">
        <div>
          <h2>{t('adm.chart.moneyTitle')}</h2>
          <p>{t('adm.chart.moneyLead')}</p>
        </div>
        {shown && (
          <p className="achart__readout" aria-live="polite">
            <b>{label(shown.m, 'long')}</b> · {t('adm.chart.booked')} {formatBaht(shown.booked)} · {t('adm.chart.received')}{' '}
            {formatBaht(shown.received)}
          </p>
        )}
      </header>
      <div className="achart__plot">
        <svg viewBox={`0 0 ${W} ${H + 22}`} preserveAspectRatio="none" role="img" aria-label={t('adm.chart.moneyTitle')}>
          <line x1="0" x2={W} y1={H} y2={H} className="achart__grid" />
          {data.map((d, i) => {
            const cx = slot * i + slot / 2;
            return (
              <g key={d.m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={slot * i} y="0" width={slot} height={H + 22} fill="transparent" />
                {d.booked > 0 && (
                  <rect className="achart__bar" style={{ '--i': i * 2, fill: GREEN }} x={cx - bw - 1} y={H - y(d.booked)} width={bw} height={y(d.booked)} rx="4" />
                )}
                {d.received > 0 && (
                  <rect className="achart__bar" style={{ '--i': i * 2 + 1, fill: GOLD }} x={cx + 1} y={H - y(d.received)} width={bw} height={y(d.received)} rx="4" />
                )}
                <text x={cx} y={H + 16} className={`achart__tick${d.m === thisMonth ? ' is-today' : ''}`}>
                  {label(d.m)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="achart__foot">
        <span className="achart__key" style={{ background: GREEN }} /> {t('adm.chart.booked')}
        <span className="achart__key" style={{ background: GOLD }} /> {t('adm.chart.received')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What just happened, newest first; refreshes itself.
// ---------------------------------------------------------------------------
export function LiveFeed() {
  const { t, locale } = useLang();
  const [log, setLog] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api('/api/admin/log').then((d) => live && setLog(d.log.slice(0, 8))).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const ago = (ts) => {
    const min = Math.round((Date.now() - new Date(ts)) / 60000);
    if (min < 1) return t('adm.feed.now');
    if (min < 60) return t('adm.chat.min', { n: min });
    if (min < 1440) return t('adm.chat.hr', { n: Math.round(min / 60) });
    return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  return (
    <section className="afeed adm-card">
      <header className="achart__head">
        <div>
          <h2>
            <span className="pulse__live" aria-hidden="true" /> {t('adm.feed.title')}
          </h2>
        </div>
        <Link to="/admin/people/log" className="adm-link">
          {t('adm.feed.all')}
        </Link>
      </header>
      {!log ? (
        <p className="adm-muted">{t('adm.loading')}</p>
      ) : log.length === 0 ? (
        <p className="adm-muted">{t('adm.feed.none')}</p>
      ) : (
        <ol className="afeed__list">
          {log.map((e) => {
            const tone = LOG_TYPES[e.type]?.tone ?? 'neutral';
            const d = e.details ?? {};
            return (
              <li key={e.id} className={`afeed__item afeed__item--${tone}`}>
                <span className="afeed__dot" aria-hidden="true" />
                <span className="afeed__text">
                  <b>{logLabel(t, e.type)}</b>
                  <span>{[d.code, d.guest || d.name, e.actor].filter(Boolean).join(' · ')}</span>
                </span>
                <time dateTime={e.created_at}>{ago(e.created_at)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
