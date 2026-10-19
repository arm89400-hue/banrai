import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { addDays, toISODate } from '../lib/booking';
import { dayOf, groupRows, needsYou, roomTitle } from '../lib/adminBookings';
import { useLang } from '../i18n/lang';
import { shift } from '../lib/motion';
import { formatThaiPhone } from '../lib/contact';
import './AdminBookings.css';

// The owner's bookings: "Today" (what needs you, the room board, who comes
// and goes) and the Bookings list with a details panel. Rooms booked
// together are one booking here, as the guest sees them. All text and
// dates follow the admin's language (i18n/adminStrings.js).

const day = (iso) => new Date(`${iso}T00:00:00`);
const nightsOf = (a, b) => Math.max(0, Math.round((day(b) - day(a)) / 86_400_000));
const who = (b) => b.guest_name || b.user_email || '-';

// Dates, money and slip reasons in the admin's language.
function useFmt() {
  const { t, lang, locale } = useLang();
  const short = { day: 'numeric', month: 'short' };
  const dayFmt = (iso) => day(iso).toLocaleDateString(locale, { weekday: 'short', ...short });
  return {
    t,
    lang,
    locale,
    day: dayFmt,
    // "16–22 ต.ค." / "Oct 16 – 22": the month once when both dates share it.
    range: (a, b) => new Intl.DateTimeFormat(locale, short).formatRange(day(a), day(b)),
    time: (d) => (d ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '-'),
    money: formatBaht,
    // A slip reason code -> words (the code itself if it is new).
    reason: (code) => {
      const key = `adm.slip.${code}`;
      const text = t(key);
      return text === key ? code : text;
    },
  };
}

// Loads `path` and exposes { data, error, loading, reload }.
function useLoad(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => setState({ data: null, error: err.message, loading: false }));
  }, [path]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}

// Where the money stands, in words: [text, tone].
function moneyLine(g, t) {
  if (!g.isRoom) return g.status === 'cancelled' ? [t('adm.bk.money.cancelled'), 'off'] : [t('adm.bk.money.activity'), 'ok'];
  if (g.status === 'cancelled') return [t('adm.bk.money.cancelled'), 'off'];
  if (g.depositReview) return [t('adm.bk.money.depositSlip'), 'check'];
  if (g.balanceReview) return [t('adm.bk.money.restSlip'), 'check'];
  if (g.status === 'pending') return [t('adm.bk.money.noDeposit', { money: formatBaht(g.deposit) }), 'wait'];
  if (g.restDue > 0) return [t('adm.bk.money.rest', { money: formatBaht(g.restDue) }), 'ok'];
  return [t('adm.bk.money.paid'), 'ok'];
}

// Every change the owner makes to a booking; each reloads the data after.
function useBookingActions(reload, setError, t) {
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      reload();
    } catch (err) {
      setError(err.message);
    }
  };
  return {
    // Approves a slip waiting for a manual check: a deposit confirms every
    // room it pays for; a balance marks the rest of the price paid.
    approve(g, kind) {
      const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review')) ?? g.lead;
      const amount = kind === 'deposit' ? row.slip_expected : row.balance_slip_expected;
      const ask = kind === 'deposit' ? 'adm.ask.approveDeposit' : 'adm.ask.approveRest';
      if (!window.confirm(t(ask, { code: g.code, money: formatBaht(amount) }))) return;
      run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/approve`, { method: 'POST' }));
    },
    // Turns down a slip; the guest is asked for a new one.
    reject(g, kind) {
      const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review')) ?? g.lead;
      if (!window.confirm(t('adm.ask.reject', { code: g.code }))) return;
      run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/reject`, { method: 'PATCH' }));
    },
    // The rest of the price paid at the farm (or undo that mark).
    paidAtFarm(g, paid = true) {
      const q = paid ? t('adm.ask.paidAtFarm', { code: g.code, money: formatBaht(g.restDue) }) : t('adm.ask.undoFarm', { code: g.code });
      if (!window.confirm(q)) return;
      run(() => api(`/api/admin/bookings/${g.lead.id}/balance`, { method: 'PATCH', body: JSON.stringify({ paid }) }));
    },
    // Confirms, cancels or re-opens every room of the booking.
    setStatus(g, status, question) {
      if (question && !window.confirm(question)) return;
      run(async () => {
        for (const r of g.rows) {
          if (r.status !== status) await api(`/api/admin/bookings/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        }
      });
    },
  };
}

// A guest's phone number. On a phone (touch screen) it is a button that
// starts the call; on a computer, which can't call, it is just the number
// to read and dial - no button that does nothing.
const CAN_CALL = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

function Phone({ phone, label, className = 'admin__btn' }) {
  const shown = formatThaiPhone(phone);
  if (CAN_CALL) {
    return (
      <a className={`${className} num`} href={`tel:${phone}`} onClick={(e) => e.stopPropagation()}>
        {label ? `${label} ${shown}` : shown}
      </a>
    );
  }
  return (
    <span className="adm-phone-text num" title={shown}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
      </svg>
      {shown}
    </span>
  );
}

// The one next step for a booking (or null): look at a slip, call about
// the deposit, or take the rest of the price at the farm.
function nextStep(g, actions, today, t, open) {
  if (g.depositReview || g.balanceReview) return { label: t('adm.bk.step.checkSlip'), primary: true, run: open };
  if (g.isRoom && g.status === 'pending' && g.lead.guest_phone) return { phone: g.lead.guest_phone, label: t('adm.bk.step.call') };
  if (g.restDue > 0 && g.checkOut >= today) return { label: t('adm.act.paidAtFarm'), primary: true, run: () => actions.paidAtFarm(g) };
  return null;
}

function StepButton({ step }) {
  if (!step) return null;
  const cls = `admin__btn${step.primary ? ' admin__btn--primary' : ''}`;
  if (step.phone) return <Phone phone={step.phone} label={step.label} className={cls} />;
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        step.run();
      }}
    >
      {step.label}
    </button>
  );
}

/* ======================================================================
   Today
   ====================================================================== */

// Overview: the month's four figures, the stay calendar (or the month as a
// list) and what needs doing, on one screen. Months move with ‹ › and the
// figures follow the month shown (counted by check-in month).
export function Today() {
  const navigate = useNavigate();
  const fmt = useFmt();
  const { t, lang, locale } = fmt;
  const bookings = useLoad('/api/admin/bookings');
  const stats = useLoad('/api/admin/stats');
  const roomsLoad = useLoad('/api/rooms');
  const [error, setError] = useState(null);
  const [month, setMonth] = useState(() => toISODate(new Date()).slice(0, 7));
  const [view, setView] = useState('calendar');
  const reload = () => {
    bookings.reload();
    stats.reload();
  };
  const actions = useBookingActions(reload, setError, t);
  const today = toISODate(new Date());
  const groups = useMemo(() => groupRows(bookings.data?.bookings ?? [], lang).filter((g) => g.isRoom), [bookings.data, lang]);
  const live = groups.filter((g) => g.status !== 'cancelled');
  const rooms = [...(roomsLoad.data?.rooms ?? [])].sort((a, b) => b.price - a.price);
  const open = (g) => navigate(`/admin/bookings?open=${encodeURIComponent(g.key)}`);
  const short = (iso) => day(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  // ---- The month shown ----
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const iso = (d) => `${month}-${String(d).padStart(2, '0')}`;
  const moveMonth = (n) => setMonth(toISODate(new Date(y, m - 1 + n, 1)).slice(0, 7));
  const monthName = day(`${month}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // Figures: bookings that check in this month; nights taken in it.
  const inMonth = live.filter((g) => g.checkIn.slice(0, 7) === month);
  const rows = inMonth.flatMap((g) => g.live);
  const revenue = rows.reduce((n, r) => n + (Number(r.total) || 0), 0);
  const received = rows.reduce((n, r) => {
    if (r.status !== 'confirmed') return n;
    const dep = Number(r.deposit) || 0;
    return n + dep + (r.balance_paid_at ? Math.max(0, Number(r.total) - dep) : 0);
  }, 0);
  const first = iso(1);
  const after = addDays(iso(daysIn), 1);
  const nightsTaken = live
    .flatMap((g) => g.live)
    .reduce((n, r) => {
      const from = dayOf(r.booked_for) > first ? dayOf(r.booked_for) : first;
      const to = dayOf(r.booked_until) < after ? dayOf(r.booked_until) : after;
      return n + Math.max(0, Math.round((day(to) - day(from)) / 86_400_000));
    }, 0);
  const occupancy = rooms.length ? Math.round((nightsTaken / (rooms.length * daysIn)) * 100) : 0;

  // Who stays on a night (a room booking covers check-in up to check-out).
  const staying = (d) =>
    live.flatMap((g) => g.live.filter((r) => dayOf(r.booked_for) <= d && d < dayOf(r.booked_until)).map((r) => ({ g, r })));

  // ---- To do: slips, unpaid deposits, money to collect, new messages ----
  const rank = (g) => (g.depositReview || g.balanceReview ? 0 : g.status === 'pending' ? 1 : 2);
  const todo = groups.filter((g) => needsYou(g, today)).sort((a, b) => rank(a) - rank(b) || a.checkIn.localeCompare(b.checkIn));
  const unread = stats.data?.stats?.unread_chats ?? 0;
  const next = live
    .flatMap((g) => [
      { d: g.checkIn, kind: 'in', g },
      { d: g.checkOut, kind: 'out', g },
    ])
    .filter((x) => x.d > today)
    .sort((a, b) => a.d.localeCompare(b.d))[0];

  // Monday-first weeks for the calendar.
  const lead = (day(first).getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, k) => k + 1)];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, k) => day(addDays('2024-01-01', k)).toLocaleDateString(locale, { weekday: 'long' }).replace(/^วัน/, ''));

  return (
    <div className="ov">
      <header className="ov-head">
        <h1>{monthName}</h1>
        <div className="ov-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label={t('adm.dash.prev')}>
            ‹
          </button>
          <button type="button" onClick={() => moveMonth(1)} aria-label={t('adm.dash.nextMonth')}>
            ›
          </button>
          <button type="button" className="ov-today" onClick={() => setMonth(today.slice(0, 7))}>
            {t('adm.dash.today')}
          </button>
        </div>
      </header>
      {(bookings.error || error) && <p className="admin__error" role="alert">{bookings.error || error}</p>}

      <dl className="ov-figs">
        <div>
          <dt>{t('adm.dash.bookings')}</dt>
          <dd className="num">{inMonth.length}</dd>
        </div>
        <div>
          <dt>{t('adm.dash.occupancy')}</dt>
          <dd className="num">{occupancy}%</dd>
        </div>
        <div>
          <dt>{t('adm.dash.revenue')}</dt>
          <dd className="num">{formatBaht(revenue)}</dd>
        </div>
        <div className="is-due">
          <dt>{t('adm.dash.outstanding')}</dt>
          <dd className="num">{formatBaht(Math.max(0, revenue - received))}</dd>
        </div>
      </dl>

      <div className="ov-two">
        <section className="ov-cal" aria-label={t('adm.dash.calendar')}>
          <div className="ov-cal__hd">
            <h2>{t('adm.dash.calendar')}</h2>
            <div className="ov-seg" role="tablist">
              {['calendar', 'list'].map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                  {t(`adm.dash.view.${v}`)}
                </button>
              ))}
            </div>
          </div>

          {view === 'calendar' ? (
            <div className="ov-grid">
              {weekdays.map((w) => (
                <div key={w} className="ov-grid__wd">
                  {w}
                </div>
              ))}
              {cells.map((d, k) => {
                if (!d) return <div key={`x${k}`} className="ov-day is-out" />;
                const date = iso(d);
                const here = staying(date);
                return (
                  <div key={date} className={`ov-day${date === today ? ' is-today' : ''}${date < today ? ' is-past' : ''}`}>
                    <b className="num">{d}</b>
                    {here.map(({ g, r }) => (
                      <button
                        key={r.id}
                        type="button"
                        className={g.status === 'pending' ? 'is-wait' : ''}
                        title={`${who(r)} · ${g.code}`}
                        onClick={() => open(g)}
                      >
                        {roomTitle(r.room_name, lang)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="ov-list">
              {inMonth.length === 0 && <li className="ov-empty">{t('adm.dash.noneMonth')}</li>}
              {[...inMonth]
                .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
                .map((g) => (
                  <li key={g.key}>
                    <button type="button" onClick={() => open(g)}>
                      <b className="num">
                        {short(g.checkIn)} – {short(g.checkOut)}
                      </b>
                      <span>
                        {who(g.lead)} · {g.rooms}
                      </span>
                      <em className={g.status === 'pending' ? 'is-wait' : ''}>
                        {g.status === 'pending' ? t('adm.dash.legend.wait') : t('adm.dash.legend.ok')}
                      </em>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <p className="ov-key">
            <span>
              <i /> {t('adm.dash.legend.ok')}
            </span>
            <span>
              <i className="is-wait" /> {t('adm.dash.legend.wait')}
            </span>
            <span>{t('adm.dash.legend.hint')}</span>
          </p>
        </section>

        <aside className="ov-todo" aria-labelledby="ov-todo-title">
          <h2 id="ov-todo-title">{t('adm.dash.todo')}</h2>
          <p className="ov-todo__n">{t('adm.dash.todoCount', { n: todo.length + (unread > 0 ? 1 : 0) })}</p>
          {todo.length === 0 && unread === 0 && <p className="ov-empty">{t('adm.dash.nothing')}</p>}

          {todo.map((g) => {
            const slip = g.depositReview ? 'deposit' : g.balanceReview ? 'balance' : null;
            const slipRow = slip && g.rows.find((r) => (slip === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
            const expected = slipRow && (slip === 'deposit' ? slipRow.slip_expected : slipRow.balance_slip_expected);
            const name = who(g.lead);
            let what;
            if (slip) what = t(slip === 'deposit' ? 'adm.dash.slipDeposit' : 'adm.dash.slipRest', { money: formatBaht(expected) });
            else if (g.status === 'pending') what = t('adm.dash.waitDeposit', { money: formatBaht(g.deposit) });
            else what = t('adm.dash.collect', { money: formatBaht(g.restDue) });
            return (
              <div key={g.key} className="ov-item">
                <button type="button" className="ov-item__what" onClick={() => open(g)}>
                  <b>
                    {what} · {name}
                  </b>
                  <small className="num">
                    {g.rooms} · {short(g.checkIn)} – {short(g.checkOut)}
                  </small>
                </button>
                {slip && (
                  <button type="button" className="admin__btn admin__btn--primary" onClick={() => actions.approve(g, slip)}>
                    {t('adm.dash.verify')}
                  </button>
                )}
                {!slip && g.status === 'pending' && g.lead.guest_phone && (
                  <Phone phone={g.lead.guest_phone} label={t('adm.bk.step.call')} />
                )}
                {!slip && g.status === 'confirmed' && (
                  <button type="button" className="admin__btn admin__btn--primary" onClick={() => actions.paidAtFarm(g)}>
                    {t('adm.dash.received')}
                  </button>
                )}
              </div>
            );
          })}

          {unread > 0 && (
            <div className="ov-item">
              <div className="ov-item__what">
                <b>{t('adm.dash.newMessages', { n: unread })}</b>
              </div>
              <button type="button" className="admin__btn admin__btn--primary" onClick={() => navigate('/admin/chat')}>
                {t('adm.dash.reply')}
              </button>
            </div>
          )}

          {next && (
            <p className="ov-next num">
              {t('adm.dash.next')}: <b>{short(next.d)}</b>{' '}
              {t(next.kind === 'in' ? 'adm.dash.checkIn' : 'adm.dash.checkOut')} {who(next.g.lead)} · {next.g.rooms}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ======================================================================
   Bookings list + details panel
   ====================================================================== */

const TABS = ['todo', 'upcoming', 'past', 'cancelled', 'all'];

export function Bookings() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad('/api/admin/bookings');
  const [actionError, setActionError] = useState(null);
  const [tab, setTab] = useState('todo');
  const [query, setQuery] = useState('');
  const [repricing, setRepricing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const f = useFmt();
  const { t, lang, locale } = f;
  const actions = useBookingActions(reload, setActionError, t);
  const today = toISODate(new Date());
  const groups = useMemo(() => groupRows(data?.bookings ?? [], lang), [data, lang]);
  const openKey = params.get('open');
  const selected = groups.find((g) => g.key === openKey) ?? null;

  const inTab = {
    todo: (g) => needsYou(g, today),
    upcoming: (g) => g.status !== 'cancelled' && g.checkOut >= today,
    past: (g) => g.status !== 'cancelled' && g.checkOut < today,
    cancelled: (g) => g.status === 'cancelled',
    all: () => true,
  };
  const q = query.trim().toLowerCase();
  const rows = groups
    .filter(inTab[tab])
    .filter(
      (g) =>
        !q ||
        g.rows.some((b) =>
          [b.code, b.group_code, b.guest_name, b.guest_phone, b.guest_email, b.user_email, b.member_code, b.room_name, b.activity_name].some((v) =>
            String(v ?? '').toLowerCase().includes(q),
          ),
        ),
    )
    .sort((a, b) => (tab === 'todo' || tab === 'upcoming' ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn)));

  // Grouped under a month heading, in the order above.
  const months = [];
  for (const g of rows) {
    const key = g.checkIn.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, list: [] });
    months.at(-1).list.push(g);
  }
  const monthName = (key) => day(`${key}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // Below 1280px the details replace the list, so start them at the top.
  // The list narrows and the details panel grows in beside it (lib/motion).
  const open = (g) => {
    shift(() => setParams(g ? { open: g.key } : {}), { cards: '.abk-list, .abk-panel' });
    if (window.innerWidth < 1280) window.scrollTo({ top: 0 });
  };

  return (
    <div className="ab-bookings">
      <div className="abk-tools">
        <nav className="abk-tabs" role="tablist">
          {TABS.map((id) => {
            const n = id === 'todo' ? groups.filter(inTab.todo).length : 0;
            return (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
                {t(`adm.bk.tab.${id}`)}
                {n > 0 && <em>{n}</em>}
              </button>
            );
          })}
        </nav>
        <input type="search" className="abk-search" placeholder={t('adm.bk.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {(error || actionError) && <p className="admin__error" role="alert">{error || actionError}</p>}
      {loading && !data && <p className="admin__muted">{t('adm.loading')}</p>}

      {data && (
        <div className={`ab-listing${selected ? ' has-panel' : ''}`}>
          <div className="abk-list">
            {months.map(({ key, list }) => (
              <section key={key}>
                <h3 className="abk-month">{monthName(key)}</h3>
                {list.map((g) => {
                  const [money, tone] = moneyLine(g, t);
                  const step = nextStep(g, actions, today, t, () => open(g));
                  return (
                    <div
                      key={g.key}
                      role="button"
                      tabIndex={0}
                      className={`abk-row${selected === g ? ' is-sel' : ''}${g.status === 'cancelled' ? ' is-off' : ''}`}
                      onClick={() => open(g)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(g))}
                    >
                      <div className="abk-when">
                        <b>{g.isRoom ? f.range(g.checkIn, g.checkOut) : f.day(g.checkIn)}</b>
                        <span>{g.isRoom ? t('adm.bk.nights', { n: nightsOf(g.checkIn, g.checkOut) }) : f.time(g.lead.booked_for)}</span>
                      </div>
                      <div className="abk-who">
                        <b>{who(g.lead)}</b>
                        <span>
                          {g.rooms}
                          {g.isRoom && ` · ${t('adm.panel.guests', { n: g.guests })}`} · {g.code}
                        </span>
                      </div>
                      <div className="abk-end">
                        <p className={`abk-money abk-money--${tone}`}>{money}</p>
                        <StepButton step={step} />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
            {rows.length === 0 && <p className="adt-empty">{tab === 'todo' ? t('adm.bk.noneTodo') : t('adm.bk.none')}</p>}
          </div>

          {selected && (
            <BookingPanel g={selected} actions={actions} today={today} onClose={() => open(null)} onEditPrice={setRepricing} onDelete={setDeleting} />
          )}
        </div>
      )}

      {repricing && (
        <EditPriceDialog
          booking={repricing}
          who={who(repricing)}
          onClose={() => setRepricing(null)}
          onSaved={() => {
            setRepricing(null);
            reload();
          }}
        />
      )}
      {deleting && (
        <DeleteBookingDialog
          booking={deleting}
          who={who(deleting)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// A slip waiting for a manual check: the picture, what it should be, and
// Approve / Reject.
function SlipCheck({ g, kind, actions }) {
  const f = useFmt();
  const { t } = f;
  const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
  if (!row) return null;
  const file = kind === 'deposit' ? row.slip_file : row.balance_slip_file;
  const expected = kind === 'deposit' ? row.slip_expected : row.balance_slip_expected;
  const reason = kind === 'deposit' ? row.slip_reason : row.balance_slip_reason;
  return (
    <div className="ab-slipcheck">
      {file && (
        <a className="ab-thumb ab-thumb--big" href={mediaUrl(file)} target="_blank" rel="noreferrer" title={t('adm.act.viewSlip')}>
          <img src={mediaUrl(file)} alt={t('adm.act.viewSlip')} />
        </a>
      )}
      <div>
        <b>{t('adm.slip.waiting', { what: t(kind === 'deposit' ? 'adm.slip.deposit' : 'adm.slip.rest'), money: formatBaht(expected) })}</b>
        <p>
          {reason && `${t('adm.slip.okFail', { reason: f.reason(reason) })} · `}
          {t('adm.slip.check')}
        </p>
        <div className="abk-acts">
          <button type="button" className="admin__btn admin__btn--primary adm-btn-lg" onClick={() => actions.approve(g, kind)}>
            {t(kind === 'deposit' ? 'adm.act.approveDeposit' : 'adm.act.approveRest')}
          </button>
          <button type="button" className="admin__btn adm-btn-lg" onClick={() => actions.reject(g, kind)}>
            {t('adm.act.reject')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Last result of a slip that is no longer waiting (verified / rejected).
function SlipResult({ status, reason, amount, kind }) {
  const f = useFmt();
  const { t } = f;
  if (!status || status === 'review') return null;
  const what = t(kind === 'deposit' ? 'adm.slip.deposit' : 'adm.slip.rest');
  let text;
  if (status !== 'verified') text = t('adm.slip.rejected', { what, reason: f.reason(reason) });
  else text = amount != null ? t('adm.slip.verified', { what, money: formatBaht(amount) }) : t('adm.slip.verifiedByHand', { what });
  return <p className={`ab-slip ab-slip--${status}`}>{text}</p>;
}

function BookingPanel({ g, actions, today, onClose, onEditPrice, onDelete }) {
  const f = useFmt();
  const { t } = f;
  const b = g.lead;
  const requests = [...new Set(g.rows.flatMap((r) => r.requests ?? []))].filter((r) => r !== 'pets');
  const pets = g.rows.reduce((n, r) => n + (r.pets ?? 0), 0);
  const extras = [...requests.map((r) => t(`adm.req.${r}`)), pets > 0 && t('adm.panel.pets', { n: pets })].filter(Boolean);
  let rest = f.money(g.restDue || g.total - g.deposit);
  if (g.status === 'confirmed' && g.restDue === 0) rest = `✓ ${f.money(g.total - g.deposit)} ${t(g.paidAtFarm ? 'adm.panel.restPaidFarm' : 'adm.panel.restPaidOnline')}`;
  else if (g.status !== 'cancelled') rest += ` ${t('adm.panel.restOnArrival')}`;

  return (
    <aside className="ab-panel abk-panel" aria-label={g.code}>
      <header className="abk-panel__top">
        <div>
          <h3>{who(b)}</h3>
          <p>
            {g.code} · {t(`adm.bk.status.${g.status}`)} · {t('adm.panel.booked', { when: f.time(b.created_at) })}
            {b.member_code && ` · ${b.member_code}`}
          </p>
        </div>
        <button type="button" className="adm-link" onClick={onClose}>
          {t('adm.panel.close')}
        </button>
      </header>

      {(b.guest_phone || b.guest_line || b.guest_email || b.user_email) && (
        <div className="abk-contact">
          {b.guest_phone && (
            <Phone phone={b.guest_phone} label={t('adm.bk.step.call')} className="admin__btn adm-btn-lg" />
          )}
          {b.guest_line && <span className="abk-chip">LINE {b.guest_line}</span>}
          {(b.guest_email || b.user_email) && <span className="abk-chip">{b.guest_email || b.user_email}</span>}
        </div>
      )}

      <dl className="abk-facts">
        {g.isRoom ? (
          <>
            <div>
              <dt>{t('adm.panel.room')}</dt>
              <dd>
                {g.rooms} · {t('adm.panel.guests', { n: g.guests })}
              </dd>
            </div>
            <div>
              <dt>{t('adm.panel.in')}</dt>
              <dd>{f.day(g.checkIn)} · 14:00</dd>
            </div>
            <div>
              <dt>{t('adm.panel.out')}</dt>
              <dd>
                {f.day(g.checkOut)} · 12:00 · {t('adm.bk.nights', { n: nightsOf(g.checkIn, g.checkOut) })}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>{t('adm.panel.when')}</dt>
            <dd>{f.time(b.booked_for)}</dd>
          </div>
        )}
        {extras.length > 0 && (
          <div>
            <dt>{t('adm.panel.extras')}</dt>
            <dd className="abk-flag">{extras.join(', ')}</dd>
          </div>
        )}
        {b.note && (
          <div>
            <dt>{t('adm.panel.note')}</dt>
            <dd>“{b.note}”</dd>
          </div>
        )}
      </dl>

      {g.isRoom && g.total > 0 && (
        <section className="abk-money-box">
          <h4>{t('adm.panel.money')}</h4>
          <dl className="abk-facts">
            <div>
              <dt>{t('adm.panel.total')}</dt>
              <dd>
                <b>{f.money(g.total)}</b>
              </dd>
            </div>
            <div>
              <dt>{t('adm.panel.deposit')}</dt>
              <dd>{g.status === 'confirmed' ? `✓ ${f.money(g.deposit)}` : f.money(g.deposit)}</dd>
            </div>
            <div>
              <dt>{t('adm.panel.rest')}</dt>
              <dd>{rest}</dd>
            </div>
          </dl>
          {g.depositReview && <SlipCheck g={g} kind="deposit" actions={actions} />}
          {g.balanceReview && <SlipCheck g={g} kind="balance" actions={actions} />}
          {!g.depositReview && <SlipResult kind="deposit" status={b.slip_status} reason={b.slip_reason} amount={b.slip_amount} />}
          {!g.balanceReview && <SlipResult kind="balance" status={b.balance_slip_status} reason={b.balance_slip_reason} amount={b.balance_slip_amount} />}
          {g.restDue > 0 && g.checkOut >= today && !g.balanceReview && (
            <button type="button" className="admin__btn admin__btn--primary adm-btn-lg abk-wide" onClick={() => actions.paidAtFarm(g)}>
              {t('adm.panel.paidAtFarm', { money: f.money(g.restDue) })}
            </button>
          )}
          {g.paidAtFarm && (
            <button type="button" className="adm-link" onClick={() => actions.paidAtFarm(g, false)}>
              {t('adm.panel.undoFarm')}
            </button>
          )}
        </section>
      )}

      <section>
        <h4>{t('adm.panel.rooms')}</h4>
        <ul className="ab-rooms">
          {g.rows.map((r) => (
            <li key={r.id} className={r.status === 'cancelled' && g.status !== 'cancelled' ? 'is-off' : ''}>
              <div>
                <b>{r.room_id ? roomTitle(r.room_name, f.lang) : r.activity_name}</b>
                <span>
                  {r.code}
                  {r.guests ? ` · ${t('adm.panel.guests', { n: r.guests })}` : ''}
                  {r.total != null ? ` · ${f.money(r.total)}` : ''}
                  {r.status === 'cancelled' && g.status !== 'cancelled' ? ` · ${t('adm.panel.roomCancelled')}` : ''}
                </span>
                {r.stay_username && (
                  <span className="ab-login">
                    {t('adm.panel.login')} <code>{r.stay_username}</code> <code>{r.stay_password}</code>
                  </span>
                )}
              </div>
              <div className="abk-acts abk-acts--quiet">
                <button type="button" className="adm-link" onClick={() => onEditPrice(r)}>
                  {t('adm.panel.editPrice')}
                </button>
                <button type="button" className="adm-link adm-link--danger" onClick={() => onDelete(r)}>
                  {t('adm.panel.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* The rarer jobs, small and at the bottom so they aren't pressed by mistake. */}
      <footer className="abk-acts abk-acts--quiet abk-panel__more">
        {g.status === 'pending' && (
          <button type="button" className="adm-link" onClick={() => actions.setStatus(g, 'confirmed', t('adm.ask.confirmNoSlip', { code: g.code }))}>
            {t('adm.panel.confirmNoSlip')}
          </button>
        )}
        {g.status !== 'cancelled' ? (
          <button type="button" className="adm-link adm-link--danger" onClick={() => actions.setStatus(g, 'cancelled', t('adm.ask.cancel', { code: g.code, name: who(b) }))}>
            {t('adm.act.cancel')}
          </button>
        ) : (
          <button type="button" className="adm-link" onClick={() => actions.setStatus(g, 'pending')}>
            {t('adm.panel.reopen')}
          </button>
        )}
      </footer>
    </aside>
  );
}

// Lets the admin correct what a booking costs: the total and the deposit
// are typed in directly (the deposit follows the total at 50% until it is
// edited itself). The member who booked is told the new amounts in their chat.
function EditPriceDialog({ booking: b, who: name, onClose, onSaved }) {
  const { t, lang } = useLang();
  const dialogRef = useRef(null);
  const [total, setTotal] = useState(b.total ?? '');
  const [deposit, setDeposit] = useState(b.deposit ?? '');
  const [depositTouched, setDepositTouched] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function changeTotal(value) {
    setTotal(value);
    if (!depositTouched && value !== '') setDeposit(Math.round(Number(value) * 50) / 100);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/bookings/${b.id}/amount`, {
        method: 'PATCH',
        body: JSON.stringify({ total, deposit, reason }),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="admin__dialog admin__dialog--edit" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2>{t('adm.edit.title')}</h2>
        <p>
          <strong>{b.code || `#${b.id}`}</strong> · {name}
          <br />
          {b.room_id ? roomTitle(b.room_name, lang) : b.activity_name}
          {b.total != null && ` · ${t('adm.edit.now', { total: formatBaht(b.total), deposit: formatBaht(b.deposit) })}`}
        </p>
        <div className="admin__dialog-fields">
          <label>
            <span>{t('adm.edit.total')}</span>
            <input type="number" min="0" step="0.01" required autoFocus value={total} onChange={(e) => changeTotal(e.target.value)} />
          </label>
          <label>
            <span>{t('adm.edit.deposit')}</span>
            <input
              type="number"
              min="0"
              max={total === '' ? undefined : total}
              step="0.01"
              required
              value={deposit}
              onChange={(e) => {
                setDepositTouched(true);
                setDeposit(e.target.value);
              }}
            />
          </label>
        </div>
        <label>
          <span>{t('adm.edit.reason')}</span>
          <textarea rows={2} maxLength={500} placeholder={t('adm.edit.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <p className="admin__muted">{b.user_email ? t('adm.edit.told', { email: b.user_email }) : t('adm.edit.noAccount')}</p>
        {error && <p className="admin__error" role="alert">{error}</p>}
        <div className="admin__form-actions">
          <button type="button" className="admin__btn" onClick={onClose} disabled={busy}>
            {t('adm.edit.cancel')}
          </button>
          <button type="submit" className="admin__btn admin__btn--primary" disabled={busy}>
            {busy ? t('adm.edit.saving') : t('adm.edit.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Confirmation for deleting a booking for good. The admin has to write the
// reason, which is what the member who booked is shown (a notice on their
// "My bookings" page and a chat message).
function DeleteBookingDialog({ booking: b, who: name, onClose, onDeleted }) {
  const f = useFmt();
  const { t } = f;
  const dialogRef = useRef(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // showModal() gives the backdrop, focus trap and Escape-to-close.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/bookings/${b.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const noAccount = `${t('adm.del.noAccount')}${b.guest_phone ? ` ${t('adm.del.call', { phone: b.guest_phone })}` : ''}`;

  return (
    <dialog ref={dialogRef} className="admin__dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2>{t('adm.del.title')}</h2>
        <p>
          <strong>{b.code || `#${b.id}`}</strong> · {name}
          <br />
          {b.room_id ? roomTitle(b.room_name, f.lang) : b.activity_name} ·{' '}
          {b.room_id ? f.range(dayOf(b.booked_for), dayOf(b.booked_until)) : f.time(b.booked_for)}
        </p>
        <ul>
          <li>{t('adm.del.forGood')}</li>
          {b.status !== 'cancelled' && b.room_id && <li>{t('adm.del.freeAgain')}</li>}
          {b.stay_username && <li>{t('adm.del.login', { user: b.stay_username })}</li>}
          <li>{b.user_email ? t('adm.del.told', { email: b.user_email }) : noAccount}</li>
        </ul>
        <label>
          <span>{t('adm.del.reason')}</span>
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={500}
            autoFocus
            placeholder={t('adm.del.reasonPh')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p className="admin__error" role="alert">{error}</p>}
        <div className="admin__form-actions">
          <button type="button" className="admin__btn" onClick={onClose} disabled={busy}>
            {t('adm.del.keep')}
          </button>
          <button type="submit" className="admin__btn admin__btn--delete" disabled={busy || reason.trim().length < 3}>
            {busy ? t('adm.del.deleting') : t('adm.del.confirm')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
