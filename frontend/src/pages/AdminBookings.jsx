import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { toISODate } from '../lib/booking';
import { dayOf, groupRows, needsYou, roomTitle } from '../lib/adminBookings';
import { useAdminData } from '../lib/adminData';
import { useLang } from '../i18n/lang';
import { formatThaiPhone } from '../lib/contact';
import { Drawer, Empty, ErrorNote, PageHead, Pill, RowsSkeleton, useConfirm, Seg } from '../components/AdminUI';
import Pager, { usePaged } from '../components/Pager';
import Baht from '../components/Baht';
import './AdminBookings.css';

const day = (iso) => new Date(`${iso}T00:00:00`);
const nightsOf = (a, b) => Math.max(0, Math.round((day(b) - day(a)) / 86_400_000));
export const who = (b) => b.guest_name || b.user_email || '-';

function useFmt() {
  const { t, lang, locale } = useLang();
  const short = { day: 'numeric', month: 'short' };
  const dayFmt = (iso) => day(iso).toLocaleDateString(locale, { weekday: 'short', ...short });
  return {
    t,
    lang,
    locale,
    day: dayFmt,
    range: (a, b) => new Intl.DateTimeFormat(locale, short).formatRange(day(a), day(b)),
    time: (d) => (d ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '-'),
    money: formatBaht,
    reason: (code) => {
      const key = `adm.slip.${code}`;
      const text = t(key);
      return text === key ? code : text;
    },
  };
}

// The money state of a booking in a few words, with a tone for its colour.
function moneyLine(g, t) {
  if (!g.isRoom) return g.status === 'cancelled' ? [t('adm.bk.money.cancelled'), 'cancelled'] : [t('adm.bk.money.activity'), 'confirmed'];
  if (g.status === 'cancelled') return [t('adm.bk.money.cancelled'), 'cancelled'];
  if (g.depositReview) return [t('adm.bk.money.depositSlip'), 'check'];
  if (g.balanceReview) return [t('adm.bk.money.restSlip'), 'check'];
  if (g.status === 'pending') return [t('adm.bk.money.noDeposit', { money: formatBaht(g.deposit) }), 'pending'];
  if (g.restDue > 0) return [t('adm.bk.money.rest', { money: formatBaht(g.restDue) }), 'confirmed'];
  return [t('adm.bk.money.paid'), 'confirmed'];
}

// Every booking action asks first in our own dialog, then reloads the list.
export function useBookingActions(reload, setError) {
  const { t } = useLang();
  const confirm = useConfirm();
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      reload();
    } catch (err) {
      setError(err.message);
    }
  };
  const slipRow = (g, kind) =>
    g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review')) ?? g.lead;
  return {
    async approve(g, kind) {
      const row = slipRow(g, kind);
      const amount = kind === 'deposit' ? row.slip_expected : row.balance_slip_expected;
      const ask = kind === 'deposit' ? 'adm.ask.approveDeposit' : 'adm.ask.approveRest';
      const ok = await confirm({ title: t(ask, { code: g.code, money: formatBaht(amount) }), ok: t('adm.today.approve') });
      if (ok) run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/approve`, { method: 'POST' }));
    },
    async reject(g, kind) {
      const row = slipRow(g, kind);
      const ok = await confirm({ title: t('adm.ask.reject', { code: g.code }), ok: t('adm.act.reject'), danger: true });
      if (ok) run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/reject`, { method: 'PATCH' }));
    },
    async paidAtFarm(g, paid = true) {
      const title = paid ? t('adm.ask.paidAtFarm', { code: g.code, money: formatBaht(g.restDue) }) : t('adm.ask.undoFarm', { code: g.code });
      const ok = await confirm({ title, ok: paid ? t('adm.act.paidAtFarm') : t('adm.panel.undoFarm') });
      if (ok) run(() => api(`/api/admin/bookings/${g.lead.id}/balance`, { method: 'PATCH', body: JSON.stringify({ paid }) }));
    },
    async setStatus(g, status, question, { danger = false, ok: okLabel } = {}) {
      if (question && !(await confirm({ title: question, danger, ok: okLabel }))) return;
      run(async () => {
        for (const r of g.rows) {
          if (r.status !== status) await api(`/api/admin/bookings/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        }
      });
    },
  };
}

const CAN_CALL = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// On a phone the number is a call button; on a computer it's plain text to read.
export function Phone({ phone, label, className = 'adm-btn' }) {
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

function nextStep(g, actions, today, t, open) {
  if (g.depositReview || g.balanceReview) return { label: t('adm.bk.step.checkSlip'), primary: true, run: open };
  if (g.isRoom && g.status === 'pending' && g.lead.guest_phone) return { phone: g.lead.guest_phone, label: t('adm.bk.step.call') };
  if (g.restDue > 0 && g.checkOut >= today) return { label: t('adm.act.paidAtFarm'), primary: true, run: () => actions.paidAtFarm(g) };
  return null;
}

function StepButton({ step }) {
  if (!step) return null;
  const cls = `adm-btn adm-btn--sm${step.primary ? ' adm-btn--primary' : ''}`;
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

// Money for one month of check-ins: what was booked, what came in, what's owed.
function MonthMoney({ groups }) {
  const { t, locale } = useLang();
  const [month, setMonth] = useState(() => toISODate(new Date()).slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const move = (n) => setMonth(toISODate(new Date(y, m - 1 + n, 1)).slice(0, 7));
  const inMonth = groups.filter((g) => g.isRoom && g.status !== 'cancelled' && g.checkIn.slice(0, 7) === month);
  const rows = inMonth.flatMap((g) => g.live);
  const booked = rows.reduce((n, r) => n + (Number(r.total) || 0), 0);
  const received = rows.reduce((n, r) => {
    if (r.status !== 'confirmed') return n;
    const dep = Number(r.deposit) || 0;
    return n + dep + (r.balance_paid_at ? Math.max(0, Number(r.total) - dep) : 0);
  }, 0);
  const name = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <section className="abk-month-money adm-card" aria-label={t('adm.bk.moneyTitle', { month: name })}>
      <div className="abk-mm__nav">
        <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" onClick={() => move(-1)} aria-label={t('adm.dash.prev')}>
          ‹
        </button>
        <b>{name}</b>
        <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" onClick={() => move(1)} aria-label={t('adm.dash.nextMonth')}>
          ›
        </button>
      </div>
      <dl className="abk-mm__figs num">
        <div>
          <dt>{t('adm.dash.bookings')}</dt>
          <dd>{inMonth.length}</dd>
        </div>
        <div>
          <dt>{t('adm.dash.revenue')}</dt>
          <dd><Baht value={booked} /></dd>
        </div>
        <div>
          <dt>{t('adm.bk.received')}</dt>
          <dd><Baht value={received} /></dd>
        </div>
        <div className={booked - received > 0 ? 'is-due' : ''}>
          <dt>{t('adm.dash.outstanding')}</dt>
          <dd><Baht value={Math.max(0, booked - received)} /></dd>
        </div>
      </dl>
    </section>
  );
}

const TABS = ['todo', 'upcoming', 'past', 'cancelled', 'all'];

export function Bookings() {
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useAdminData('/api/admin/bookings');
  const [actionError, setActionError] = useState(null);
  const [tab, setTab] = useState('todo');
  const [query, setQuery] = useState('');
  const [repricing, setRepricing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const f = useFmt();
  const { t, lang, locale } = f;
  const actions = useBookingActions(reload, setActionError);
  const today = toISODate(new Date());
  const groups = useMemo(() => groupRows(data?.bookings ?? [], lang), [data, lang]);
  const openKey = params.get('open');
  const selected = groups.find((g) => g.key === openKey) ?? null;
  const searchRef = useRef(null);

  // Opening a booking from Today shows it on top of the list it belongs to.
  useEffect(() => {
    if (openKey && selected && tab === 'todo' && !needsYou(selected, today)) setTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, Boolean(selected)]);

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

  const paged = usePaged(rows, 10, `${tab}|${q}`);
  const months = [];
  for (const g of paged.rows) {
    const key = g.checkIn.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, list: [] });
    months.at(-1).list.push(g);
  }
  const monthName = (key) => day(`${key}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const open = (g) => setParams(g ? { open: g.key } : {}, { replace: !g });
  const counts = Object.fromEntries(TABS.map((id) => [id, groups.filter(inTab[id]).length]));

  return (
    <div className="abk">
      <PageHead title={t('adm.nav.bookings')} />
      <ErrorNote>{error || actionError}</ErrorNote>

      {data && <MonthMoney groups={groups} />}

      <div className="adm-tools">
        <Seg active={tab} role="tablist" aria-label={t('adm.nav.bookings')}>
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {t(`adm.bk.tab.${id}`)}
              {id === 'todo' ? counts.todo > 0 && <em>{counts.todo}</em> : data && <i>{counts[id]}</i>}
            </button>
          ))}
        </Seg>
        <label className="adm-search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
          <input ref={searchRef} type="search" placeholder={t('adm.bk.search')} aria-label={t('adm.bk.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {!data ? (
        <div className="adm-card">
          <RowsSkeleton rows={6} />
        </div>
      ) : (
        <>
          <div className="adm-card adm-rows abk-list" ref={paged.boxRef} style={paged.boxStyle}>
            {months.map(({ key, list }) => (
              <div key={key} role="rowgroup">
                <h3 className="adm-month">{monthName(key)}</h3>
                {list.map((g) => {
                  const [money, tone] = moneyLine(g, t);
                  const step = nextStep(g, actions, today, t, () => open(g));
                  return (
                    <div
                      key={g.key}
                      role="button"
                      tabIndex={0}
                      className={`adm-row is-click abk-row${selected === g ? ' is-sel' : ''}${g.status === 'cancelled' ? ' is-off' : ''}`}
                      onClick={() => open(g)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(g))}
                    >
                      <div className="abk-when">
                        <b className="num">{g.isRoom ? f.range(g.checkIn, g.checkOut) : f.day(g.checkIn)}</b>
                        <span>{g.isRoom ? t('adm.bk.nights', { n: nightsOf(g.checkIn, g.checkOut) }) : f.time(g.lead.booked_for)}</span>
                      </div>
                      <div className="adm-row__main">
                        <b>{who(g.lead)}</b>
                        <span>
                          {g.rooms}
                          {g.isRoom && ` · ${t('adm.panel.guests', { n: g.guests })}`} · {g.code}
                        </span>
                      </div>
                      <div className="adm-row__meta">
                        <Pill tone={tone}>{money}</Pill>
                      </div>
                      <div className="adm-row__acts">
                        <StepButton step={step} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {rows.length === 0 && (
              <Empty
                title={q ? t('adm.bk.noMatch') : tab === 'todo' ? t('adm.bk.noneTodo') : t('adm.bk.none')}
                hint={tab === 'todo' && !q ? t('adm.bk.noneTodoHint') : undefined}
              />
            )}
          </div>
          <Pager {...paged.pager} />
        </>
      )}

      {selected && (
        <BookingPanel
          g={selected}
          actions={actions}
          today={today}
          onClose={() => open(null)}
          onEditPrice={setRepricing}
          onDelete={setDeleting}
        />
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

function SlipCheck({ g, kind, actions }) {
  const f = useFmt();
  const { t } = f;
  const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
  if (!row) return null;
  const file = kind === 'deposit' ? row.slip_file : row.balance_slip_file;
  const expected = kind === 'deposit' ? row.slip_expected : row.balance_slip_expected;
  const reason = kind === 'deposit' ? row.slip_reason : row.balance_slip_reason;
  return (
    <div className="abk-slip">
      {file && (
        <a className="abk-slip__img" href={mediaUrl(file)} target="_blank" rel="noreferrer" title={t('adm.act.viewSlip')}>
          <img src={mediaUrl(file)} alt={t('adm.act.viewSlip')} />
        </a>
      )}
      <div className="abk-slip__text">
        <b>{t('adm.slip.waiting', { what: t(kind === 'deposit' ? 'adm.slip.deposit' : 'adm.slip.rest'), money: formatBaht(expected) })}</b>
        <p>
          {reason && `${t('adm.slip.okFail', { reason: f.reason(reason) })} · `}
          {t('adm.slip.check')}
        </p>
        <div className="abk-slip__acts">
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => actions.approve(g, kind)}>
            {t(kind === 'deposit' ? 'adm.act.approveDeposit' : 'adm.act.approveRest')}
          </button>
          <button type="button" className="adm-btn" onClick={() => actions.reject(g, kind)}>
            {t('adm.act.reject')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlipResult({ status, reason, amount, kind }) {
  const f = useFmt();
  const { t } = f;
  if (!status || status === 'review') return null;
  const what = t(kind === 'deposit' ? 'adm.slip.deposit' : 'adm.slip.rest');
  let text;
  if (status !== 'verified') text = t('adm.slip.rejected', { what, reason: f.reason(reason) });
  else text = amount != null ? t('adm.slip.verified', { what, money: formatBaht(amount) }) : t('adm.slip.verifiedByHand', { what });
  return <p className={`abk-slip-result is-${status}`}>{text}</p>;
}

const STATUS_TONE = { pending: 'pending', confirmed: 'confirmed', cancelled: 'cancelled' };

// Everything about one booking, opened beside the list. Money first (that's
// what usually needs doing), then the stay, then rooms, then rarer actions.
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

  const footer = (
    <>
      {g.status === 'pending' && (
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-grow"
          onClick={() => actions.setStatus(g, 'confirmed', t('adm.ask.confirmNoSlip', { code: g.code }), { ok: t('adm.panel.confirmNoSlip') })}
        >
          {t('adm.panel.confirmNoSlip')}
        </button>
      )}
      {g.status !== 'cancelled' ? (
        <button
          type="button"
          className="adm-btn adm-btn--ghost abk-cancel"
          onClick={() => actions.setStatus(g, 'cancelled', t('adm.ask.cancel', { code: g.code, name: who(b) }), { danger: true, ok: t('adm.act.cancel') })}
        >
          {t('adm.act.cancel')}
        </button>
      ) : (
        <button type="button" className="adm-btn" onClick={() => actions.setStatus(g, 'pending')}>
          {t('adm.panel.reopen')}
        </button>
      )}
    </>
  );

  return (
    <Drawer
      title={who(b)}
      sub={
        <>
          <Pill tone={STATUS_TONE[g.status]}>{t(`adm.bk.status.${g.status}`)}</Pill> {g.code} ·{' '}
          {t('adm.panel.booked', { when: f.time(b.created_at) })}
          {b.member_code && ` · ${b.member_code}`}
        </>
      }
      onClose={onClose}
      footer={footer}
    >
      {(b.guest_phone || b.guest_line || b.guest_email || b.user_email) && (
        <div className="abk-contact">
          {b.guest_phone && <Phone phone={b.guest_phone} label={t('adm.bk.step.call')} />}
          {b.guest_line && <span className="abk-chip">LINE {b.guest_line}</span>}
          {(b.guest_email || b.user_email) && <span className="abk-chip">{b.guest_email || b.user_email}</span>}
        </div>
      )}

      {g.isRoom && g.total > 0 && (
        <section className="abk-box">
          <h3>{t('adm.panel.money')}</h3>
          <dl className="abk-facts num">
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
            <button type="button" className="adm-btn adm-btn--primary abk-wide" onClick={() => actions.paidAtFarm(g)}>
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
        <h3>{t('adm.panel.stay')}</h3>
        <dl className="abk-facts">
          {g.isRoom ? (
            <>
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
              <div>
                <dt>{t('adm.panel.guestsLabel')}</dt>
                <dd>{t('adm.panel.guests', { n: g.guests })}</dd>
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
      </section>

      <section>
        <h3>{t('adm.panel.rooms')}</h3>
        <ul className="abk-rooms">
          {g.rows.map((r) => (
            <li key={r.id} className={r.status === 'cancelled' && g.status !== 'cancelled' ? 'is-off' : ''}>
              <div className="abk-rooms__main">
                <b>{r.room_id ? roomTitle(r.room_name, f.lang) : r.activity_name}</b>
                <span className="num">
                  {r.code}
                  {r.guests ? ` · ${t('adm.panel.guests', { n: r.guests })}` : ''}
                  {r.total != null ? ` · ${f.money(r.total)}` : ''}
                  {r.status === 'cancelled' && g.status !== 'cancelled' ? ` · ${t('adm.panel.roomCancelled')}` : ''}
                </span>
                {r.stay_username && (
                  <span className="adm-login">
                    {t('adm.panel.login')} <code>{r.stay_username}</code> <code>{r.stay_password}</code>
                  </span>
                )}
              </div>
              <div className="abk-rooms__acts">
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => onEditPrice(r)}>
                  {t('adm.panel.editPrice')}
                </button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost abk-del" onClick={() => onDelete(r)}>
                  {t('adm.panel.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}

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
          <button type="button" className="adm-btn" onClick={onClose} disabled={busy}>
            {t('adm.edit.cancel')}
          </button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
            {busy ? t('adm.edit.saving') : t('adm.edit.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteBookingDialog({ booking: b, who: name, onClose, onDeleted }) {
  const f = useFmt();
  const { t } = f;
  const dialogRef = useRef(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
          <button type="button" className="adm-btn" onClick={onClose} disabled={busy}>
            {t('adm.del.keep')}
          </button>
          <button type="submit" className="adm-btn adm-btn--danger" disabled={busy || reason.trim().length < 3}>
            {busy ? t('adm.del.deleting') : t('adm.del.confirm')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
