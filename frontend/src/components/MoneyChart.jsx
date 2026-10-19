import { useState } from 'react';
import { useLang } from '../i18n/lang';
import { formatBaht } from '../lib/money';
import './MoneyChart.css';

// Money by check-in month for the admin's Today page: one bar per month
// (five months back to two ahead), split into what has come in and what is
// still to collect. Colours were checked with the dataviz palette validator
// (green #2e8a5f / amber #d58f34: colour-blind safe); the amber is light on
// white, so every number is also given in words above the chart, in the
// tooltip and in the table view.
//
// `rows` are the admin's booking rows (/api/admin/bookings). Only room
// bookings count; cancelled ones don't.

const BEFORE = 5;
const AFTER = 2;
const W = 720;
const H = 220;
const PAD = { top: 24, right: 8, bottom: 30, left: 64 };

// A bar part as a path: square at the bottom, rounded (4px) at the top
// only when it is the top of the bar.
function barPath(x, top, w, h, round) {
  if (h <= 0) return '';
  const r = round ? Math.min(4, h, w / 2) : 0;
  return `M${x},${top + h}V${top + r}q0,-${r} ${r},-${r}H${x + w - r}q${r},0 ${r},${r}V${top + h}Z`;
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// What has been paid on one room booking: the deposit once confirmed, the
// rest once marked paid (online or at the farm).
function received(r) {
  if (r.status !== 'confirmed') return 0;
  const deposit = Number(r.deposit) || 0;
  return deposit + (r.balance_paid_at ? Math.max(0, Number(r.total) - deposit) : 0);
}

// A round-ish top for the axis (฿10,000 steps, then ฿50,000).
function niceMax(v) {
  if (v <= 0) return 10000;
  const step = v > 100000 ? 50000 : 10000;
  return Math.ceil(v / step) * step;
}

export default function MoneyChart({ rows }) {
  const { t, locale } = useLang();
  const [hover, setHover] = useState(null);
  // 'none' (just this month's figures), 'chart' or 'table'.
  const [view, setView] = useState('none');
  const asTable = view === 'table';

  const now = new Date();
  const months = Array.from({ length: BEFORE + AFTER + 1 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - BEFORE + i, 1);
    return { key: monthKey(d), date: d, total: 0, got: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const r of rows) {
    if (!r.room_id || r.status === 'cancelled') continue;
    const m = byKey.get(String(r.booked_for).slice(0, 7));
    if (!m) continue;
    m.total += Number(r.total) || 0;
    m.got += received(r);
  }
  const thisMonth = byKey.get(monthKey(now));
  const max = niceMax(Math.max(...months.map((m) => m.total)));

  const short = (d) => d.toLocaleDateString(locale, { month: 'short' });
  const long = (d) => d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / months.length;
  const barW = Math.min(44, slot * 0.56);
  const y = (v) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];

  return (
    <section className="adt-sec money">
      <header className="adt-sec__hd">
        <h2>
          {t('adm.money.title')}
          <small>{t('adm.money.note')}</small>
        </h2>
        <span className="money__views">
          {view !== 'none' && (
            <button type="button" className="adm-link" onClick={() => setView(asTable ? 'chart' : 'table')}>
              {asTable ? t('adm.money.showChart') : t('adm.money.showTable')}
            </button>
          )}
          <button type="button" className="adm-link" onClick={() => setView(view === 'none' ? 'chart' : 'none')}>
            {view === 'none' ? t('adm.money.open') : t('adm.money.close')}
          </button>
        </span>
      </header>

      {/* This month as three figures, so nothing depends on reading the colours. */}
      <dl className="money__figs">
        <div>
          <dt>{long(now)}</dt>
          <dd>{formatBaht(thisMonth.total)}</dd>
        </div>
        <div>
          <dt>
            <i className="money__key money__key--got" /> {t('adm.money.received')}
          </dt>
          <dd>{formatBaht(thisMonth.got)}</dd>
        </div>
        <div>
          <dt>
            <i className="money__key money__key--due" /> {t('adm.money.due')}
          </dt>
          <dd>{formatBaht(thisMonth.total - thisMonth.got)}</dd>
        </div>
      </dl>

      {view === 'none' ? null : asTable ? (
        <table className="money__table">
          <thead>
            <tr>
              <th>{t('adm.money.month')}</th>
              <th>{t('adm.money.received')}</th>
              <th>{t('adm.money.due')}</th>
              <th>{t('adm.money.total')}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className={m === thisMonth ? 'is-now' : ''}>
                <td>{long(m.date)}</td>
                <td>{formatBaht(m.got)}</td>
                <td>{formatBaht(m.total - m.got)}</td>
                <td>{formatBaht(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="money__chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('adm.money.title')}>
            {ticks.map((v) => (
              <g key={v}>
                <line className="money__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
                <text className="money__axis" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
                  {formatBaht(v)}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const x = PAD.left + slot * i + (slot - barW) / 2;
              const due = m.total - m.got;
              const gotTop = y(m.got);
              // 2px surface gap between the two parts.
              const dueTop = y(m.total);
              const dueH = Math.max(0, gotTop - dueTop - 2);
              const isNow = m === thisMonth;
              return (
                <g key={m.key}>
                  {m.got > 0 && <path className="money__got" d={barPath(x, gotTop, barW, y(0) - gotTop, due <= 0)} />}
                  {due > 0 && <path className="money__due" d={barPath(x, dueTop, barW, m.got > 0 ? dueH : y(0) - dueTop, true)} />}
                  {isNow && m.total > 0 && (
                    <text className="money__label" x={x + barW / 2} y={dueTop - 6} textAnchor="middle">
                      {formatBaht(m.total)}
                    </text>
                  )}
                  <text className={`money__axis${isNow ? ' is-now' : ''}`} x={x + barW / 2} y={H - 8} textAnchor="middle">
                    {short(m.date)}
                  </text>
                  {/* Hit area bigger than the bar: the whole month column. */}
                  <rect
                    className="money__hit"
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={innerH}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="money__tip" style={{ left: `${((PAD.left + slot * (hover + 0.5)) / W) * 100}%` }}>
              <b>{long(months[hover].date)}</b>
              <span>
                <i className="money__key money__key--got" /> {t('adm.money.received')} {formatBaht(months[hover].got)}
              </span>
              <span>
                <i className="money__key money__key--due" /> {t('adm.money.due')} {formatBaht(months[hover].total - months[hover].got)}
              </span>
              <span>
                {t('adm.money.total')} {formatBaht(months[hover].total)}
              </span>
            </div>
          )}
          <p className="money__legend">
            <span>
              <i className="money__key money__key--got" /> {t('adm.money.received')}
            </span>
            <span>
              <i className="money__key money__key--due" /> {t('adm.money.due')}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
