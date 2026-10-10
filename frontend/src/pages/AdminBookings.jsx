import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { addDays, toISODate } from '../lib/booking';
import { dayOf, groupRows, needsYou, roomTitle } from '../lib/adminBookings';
import './AdminBookings.css';

// The owner's bookings: "Today" (what needs you, the room board, who comes
// and goes) and the Bookings list with a details panel. Rooms booked
// together are one booking here, as the guest sees them.

// Why a slip was turned down, or why SlipOK sent it to you to check
// (reason codes from POST /api/bookings/:id/slip and admin actions).
const SLIP_REASONS = {
  SLIP_UNREADABLE: 'no QR',
  SLIP_NOT_FOUND: 'not found at bank',
  SLIP_PENDING: 'bank asks to wait a few minutes',
  SLIP_DUPLICATE: 'used before',
  SLIP_AMOUNT: 'wrong amount',
  SLIP_RECEIVER: 'wrong account',
  SLIP_OLD: 'older than booking',
  SLIP_SERVICE: 'SlipOK or the bank was down',
  SLIPOK_SETUP: 'SlipOK setup problem - check the API key and branch ID',
  SLIPOK_PACKAGE: 'SlipOK package expired or quota used up - renew it',
  NOT_PENDING: 'booking not pending',
  BALANCE_NOT_DUE: 'nothing left to pay',
  MANUAL_REJECT: 'rejected by you',
  BOOKING_CANCELLED: 'booking cancelled',
  SUPERSEDED: 'another slip was approved',
  PAID_AT_FARM: 'paid at the farm instead',
};
const REQUEST_LABELS = { bbq: 'BBQ / moo kata', extra_bed: 'Extra bed', pets: 'Pets' };

const day = (iso) => new Date(`${iso}T00:00:00`);
const fmtDay = (iso) => day(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtRange = (a, b) =>
  a.slice(0, 7) === b.slice(0, 7)
    ? `${day(a).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} – ${fmtDay(b)}`
    : `${fmtDay(a)} – ${fmtDay(b)}`;
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const nightsOf = (a, b) => Math.max(0, Math.round((day(b) - day(a)) / 86_400_000));
const who = (b) => b.guest_name || b.user_email || 'guest';
const daysAgo = (ts) => {
  const n = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};

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

// What the money looks like, as one pill: [label, tone].
function moneyPill(g) {
  if (!g.isRoom) return [g.status === 'cancelled' ? 'Cancelled' : 'Activity', g.status === 'cancelled' ? 'off' : 'ok'];
  if (g.status === 'cancelled') return ['Cancelled', 'off'];
  if (g.depositReview) return ['Deposit slip to check', 'check'];
  if (g.balanceReview) return ['Rest: slip to check', 'check'];
  if (g.status === 'pending') return ['No deposit yet', 'wait'];
  if (g.restDue > 0) return [`Deposit ✓ · rest ${formatBaht(g.restDue)}`, 'ok'];
  return ['Paid in full', 'ok'];
}

// Every change the owner makes to a booking; each reloads the data after.
function useBookingActions(reload, setError) {
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
      const what = kind === 'deposit' ? `confirm ${g.code}${g.live.length > 1 ? ` (${g.live.length} rooms)` : ''}` : `mark the rest of ${g.code} paid`;
      if (!window.confirm(`Approve the slip and ${what}? Check that ${formatBaht(amount)} reached your account.`)) return;
      run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/approve`, { method: 'POST' }));
    },
    // Turns down a slip; the guest is asked for a new one.
    reject(g, kind) {
      const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review')) ?? g.lead;
      if (!window.confirm(`Reject the slip for ${g.code}? The guest is asked for a new slip.`)) return;
      run(() => api(`/api/admin/slips/${kind === 'deposit' ? row.slip_id : row.balance_slip_id}/reject`, { method: 'PATCH' }));
    },
    // The rest of the price paid at the farm (or undo that mark).
    paidAtFarm(g, paid = true) {
      const q = paid ? `Mark the rest of ${g.code} (${formatBaht(g.restDue)}) as paid at the farm?` : `Undo "paid at the farm" for ${g.code}?`;
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

// The one next step for a booking (or null): approve a slip, call about
// the deposit, or take the rest of the price at the farm.
function nextStep(g, actions, today) {
  if (g.depositReview) return { label: 'Approve slip', primary: true, run: () => actions.approve(g, 'deposit') };
  if (g.balanceReview) return { label: 'Approve slip', primary: true, run: () => actions.approve(g, 'balance') };
  if (g.isRoom && g.status === 'pending' && g.lead.guest_phone) return { label: 'Call', href: `tel:${g.lead.guest_phone}` };
  if (g.restDue > 0 && g.checkOut >= today) return { label: 'Paid at farm', primary: true, run: () => actions.paidAtFarm(g) };
  return null;
}

function StepButton({ step, small }) {
  if (!step) return <span className="ab-muted">-</span>;
  const cls = `admin__btn${step.primary ? ' admin__btn--primary' : ''}${small ? '' : ' ab-btn-lg'}`;
  return step.href ? (
    <a className={cls} href={step.href} onClick={(e) => e.stopPropagation()}>
      {step.label}
    </a>
  ) : (
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

// Go-live checklist for payments: what is set up in backend/.env.
function PaymentSetup({ setup }) {
  if (!setup) return null;
  const items = [
    setup.promptpay
      ? `PromptPay QR: on${setup.promptpay_name ? ` (${setup.promptpay_name})` : ''}`
      : 'PromptPay QR: not set - guests see a sample QR (add PROMPTPAY_ID)',
    setup.slipok ? 'SlipOK: on - slips are checked automatically' : 'SlipOK: off - you check slips',
    setup.test_pay ? 'Test button (PassPay): on - turn off before going live' : 'Test button (PassPay): off',
  ];
  return (
    <p className="ab-setup">
      <strong>Payments</strong> · {items.join(' · ')}
    </p>
  );
}

/* ======================================================================
   Today
   ====================================================================== */

export function Today() {
  const navigate = useNavigate();
  const bookings = useLoad('/api/admin/bookings');
  const stats = useLoad('/api/admin/stats');
  const roomsLoad = useLoad('/api/rooms');
  const [error, setError] = useState(null);
  const reload = () => {
    bookings.reload();
    stats.reload();
  };
  const actions = useBookingActions(reload, setError);
  const today = toISODate(new Date());
  const groups = useMemo(() => groupRows(bookings.data?.bookings ?? []).filter((g) => g.isRoom), [bookings.data]);
  const open = (g) => navigate(`/admin/bookings?open=${encodeURIComponent(g.key)}`);

  // Slips first, then deposits not paid, then arrivals; soonest first.
  const rank = (g) => (g.depositReview || g.balanceReview ? 0 : g.status === 'pending' ? 1 : 2);
  const todo = groups.filter((g) => needsYou(g, today)).sort((a, b) => rank(a) - rank(b) || a.checkIn.localeCompare(b.checkIn));
  const week = addDays(today, 7);
  const live = groups.filter((g) => g.status !== 'cancelled');
  const arriving = live.filter((g) => g.checkIn >= today && g.checkIn < week).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const leaving = live.filter((g) => g.checkOut >= today && g.checkOut < week).sort((a, b) => a.checkOut.localeCompare(b.checkOut));
  const s = stats.data?.stats;

  return (
    <div className="ab-today">
      {s && (
        <p className="ab-summary">
          This month {formatBaht(s.room_revenue_this_month)} · tonight {s.rooms_occupied_now} of {s.rooms} rooms taken
        </p>
      )}
      {(bookings.error || error) && <p className="admin__error" role="alert">{bookings.error || error}</p>}

      <section className="ab-card">
        <header className="ab-card__hd">
          <h2>Needs you{todo.length > 0 && ` (${todo.length})`}</h2>
          <button type="button" className="ab-link" onClick={() => navigate('/admin/bookings')}>
            All bookings
          </button>
        </header>
        {bookings.loading && !bookings.data && <p className="ab-empty">Loading…</p>}
        {bookings.data && todo.length === 0 && <p className="ab-empty">Nothing waiting. Slips to check and deposits to follow up appear here.</p>}
        <ul className="ab-todo">
          {todo.map((g) => {
            const slip = g.depositReview ? 'deposit' : g.balanceReview ? 'balance' : null;
            const slipRow = slip && g.rows.find((r) => (slip === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
            const reason = slipRow && (slip === 'deposit' ? slipRow.slip_reason : slipRow.balance_slip_reason);
            const file = slipRow && (slip === 'deposit' ? slipRow.slip_file : slipRow.balance_slip_file);
            const expected = slipRow && (slip === 'deposit' ? slipRow.slip_expected : slipRow.balance_slip_expected);
            let pill;
            let line;
            if (slip) {
              pill = ['Slip to check', 'check'];
              line = `${slip === 'deposit' ? `Deposit${g.live.length > 1 ? ` for ${g.live.length} rooms` : ''}` : 'Rest of the price'}, should be ${formatBaht(expected)}${reason ? ` · SlipOK couldn't check it (${SLIP_REASONS[reason] ?? reason})` : ''}`;
            } else if (g.status === 'pending') {
              pill = ['No deposit yet', 'wait'];
              line = `Booked ${daysAgo(g.lead.created_at)} · deposit ${formatBaht(g.deposit)} · arrives ${fmtDay(g.checkIn)}`;
            } else {
              pill = [g.checkIn < today ? 'Staying now' : g.checkIn === today ? 'Arrives today' : 'Arrives tomorrow', 'ok'];
              line = `Rest to collect at the farm: ${formatBaht(g.restDue)}`;
            }
            return (
              <li key={g.key}>
                <span className={`ab-pill ab-pill--${pill[1]}`}>{pill[0]}</span>
                <button type="button" className="ab-todo__what" onClick={() => open(g)}>
                  <b>
                    {who(g.lead)} · {g.code} · {g.rooms}
                  </b>
                  <span>{line}</span>
                </button>
                <div className="ab-todo__act">
                  {slip && (
                    <>
                      {file && (
                        <a className="ab-thumb" href={mediaUrl(file)} target="_blank" rel="noreferrer" aria-label="View slip">
                          <img src={mediaUrl(file)} alt="" />
                        </a>
                      )}
                      <button type="button" className="admin__btn admin__btn--primary" onClick={() => actions.approve(g, slip)}>
                        Approve
                      </button>
                      <button type="button" className="admin__btn" onClick={() => actions.reject(g, slip)}>
                        Reject
                      </button>
                    </>
                  )}
                  {!slip && g.status === 'pending' && (
                    <>
                      {g.lead.guest_phone && (
                        <a className="admin__btn" href={`tel:${g.lead.guest_phone}`}>
                          Call {g.lead.guest_phone}
                        </a>
                      )}
                      <button
                        type="button"
                        className="admin__btn"
                        onClick={() => actions.setStatus(g, 'cancelled', `Cancel ${g.code} for ${who(g.lead)}? The rooms become free again.`)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {!slip && g.status === 'confirmed' && (
                    <button type="button" className="admin__btn admin__btn--primary" onClick={() => actions.paidAtFarm(g)}>
                      Paid at farm
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <RoomBoard rooms={roomsLoad.data?.rooms ?? []} groups={live} today={today} onOpen={open} />

      <div className="ab-two">
        <ComingGoing title="Arriving" list={arriving} when={(g) => g.checkIn} today={today} extra={(g) => `${g.rooms} · ${g.guests} guests`} onOpen={open} />
        <ComingGoing title="Leaving" list={leaving} when={(g) => g.checkOut} today={today} extra={(g) => `${g.rooms} · check-out 12:00`} onOpen={open} />
      </div>

      <PaymentSetup setup={stats.data?.payment_setup} />
    </div>
  );
}

function ComingGoing({ title, list, when, today, extra, onOpen }) {
  return (
    <section className="ab-card">
      <header className="ab-card__hd">
        <h2>{title}</h2>
        <span className="ab-muted">next 7 days</span>
      </header>
      {list.length === 0 && <p className="ab-empty">No one.</p>}
      <ul className="ab-list">
        {list.map((g) => (
          <li key={g.key}>
            <button type="button" onClick={() => onOpen(g)}>
              <b>
                {when(g) === today ? 'Today' : fmtDay(when(g))} · {who(g.lead)}
              </b>
              <span>{extra(g)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 5 rooms × the next 14 nights, a bar per booking (green confirmed, gold
// waiting for the deposit). A bar opens the booking.
function RoomBoard({ rooms, groups, today, onOpen }) {
  const DAYS = 14;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const end = days[DAYS - 1];
  const sorted = [...rooms].sort((a, b) => b.price - a.price);
  const stays = (roomId) =>
    groups.flatMap((g) =>
      g.live
        .filter((r) => r.room_id === roomId && dayOf(r.booked_until) > today && dayOf(r.booked_for) <= end)
        .map((r) => ({ g, r, from: dayOf(r.booked_for), to: dayOf(r.booked_until) })),
    );
  const col = (iso) => Math.max(0, Math.round((day(iso) - day(today)) / 86_400_000));

  return (
    <section className="ab-card">
      <header className="ab-card__hd">
        <h2>Rooms, next 2 weeks</h2>
        <span className="ab-muted">Click a bar to open the booking</span>
      </header>
      <div className="ab-board-wrap">
        <div className="ab-board" style={{ '--days': DAYS }}>
          <span />
          {days.map((d) => (
            <span key={d} className={`ab-board__day${d === today ? ' is-today' : ''}`}>
              {day(d).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
              <b>{day(d).getDate()}</b>
            </span>
          ))}
          {sorted.map((room, i) => (
            <Fragment key={room.id}>
              <span className="ab-board__room" style={{ gridRow: i + 2 }}>
                {roomTitle(room.name)}
              </span>
              {days.map((d, j) => (
                <span key={d} className="ab-board__cell" style={{ gridRow: i + 2, gridColumn: j + 2 }} />
              ))}
              {stays(room.id).map(({ g, r, from, to }) => {
                const start = col(from < today ? today : from);
                const span = Math.max(1, Math.min(DAYS, col(to)) - start);
                return (
                  <button
                    type="button"
                    key={r.id}
                    className={`ab-bar ab-bar--${g.status === 'pending' ? 'wait' : 'ok'}${from < today ? ' is-cont' : ''}`}
                    style={{ gridRow: i + 2, gridColumn: `${start + 2} / span ${span}` }}
                    title={`${who(r)} · ${g.code} · ${fmtRange(from, to)}`}
                    onClick={() => onOpen(g)}
                  >
                    {who(r).split(' ')[0]}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="ab-legend">
        <span>
          <i className="ab-bar--ok" /> Confirmed
        </span>
        <span>
          <i className="ab-bar--wait" /> Waiting for deposit
        </span>
      </p>
    </section>
  );
}

/* ======================================================================
   Bookings list + details panel
   ====================================================================== */

const TABS = [
  ['todo', 'To do'],
  ['upcoming', 'Upcoming'],
  ['past', 'Past'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];

export function Bookings() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad('/api/admin/bookings');
  const [actionError, setActionError] = useState(null);
  const [tab, setTab] = useState('todo');
  const [query, setQuery] = useState('');
  const [repricing, setRepricing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const actions = useBookingActions(reload, setActionError);
  const today = toISODate(new Date());
  const groups = useMemo(() => groupRows(data?.bookings ?? []), [data]);
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

  // Below 1280px the details replace the list, so start them at the top.
  const open = (g) => {
    setParams(g ? { open: g.key } : {});
    if (window.innerWidth < 1280) window.scrollTo({ top: 0 });
  };

  return (
    <div className="ab-bookings">
      <div className="ab-tools">
        <div className="ab-tabs" role="tablist">
          {TABS.map(([id, label]) => {
            const n = id === 'todo' ? groups.filter(inTab.todo).length : 0;
            return (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
                {label}
                {n > 0 && <em>{n}</em>}
              </button>
            );
          })}
        </div>
        <input type="search" className="admin__search ab-search" placeholder="Search name, phone or code" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {(error || actionError) && <p className="admin__error" role="alert">{error || actionError}</p>}
      {loading && !data && <p className="admin__muted">Loading…</p>}

      {data && (
        <div className={`ab-listing${selected ? ' has-panel' : ''}`}>
          <div className="ab-card ab-table-card">
            <table className="ab-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Stay</th>
                  <th>Money</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const [pill, tone] = moneyPill(g);
                  return (
                    <tr key={g.key} className={`${selected === g ? 'is-sel' : ''}${g.status === 'cancelled' ? ' is-off' : ''}`} onClick={() => open(g)}>
                      <td>
                        <b>{who(g.lead)}</b>
                        <small>
                          {g.code}
                          {g.lead.guest_phone && ` · ${g.lead.guest_phone}`}
                        </small>
                      </td>
                      <td>
                        {g.isRoom ? fmtRange(g.checkIn, g.checkOut) : fmtDateTime(g.lead.booked_for)}
                        <small>
                          {g.rooms}
                          {g.isRoom && ` · ${g.guests} guests`}
                        </small>
                      </td>
                      <td>
                        <div className="ab-money">
                          {g.total ? formatBaht(g.total) : '-'}
                          <span className={`ab-pill ab-pill--${tone}`}>{pill}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ab-next">
                          <StepButton step={nextStep(g, actions, today)} small />
                          <button
                            type="button"
                            className="ab-dots"
                            aria-label={`More for ${g.code}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              open(g);
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="ab-empty">{tab === 'todo' ? 'Nothing to do right now.' : 'No bookings match.'}</p>}
          </div>

          {selected ? (
            <BookingPanel g={selected} actions={actions} today={today} onClose={() => open(null)} onEditPrice={setRepricing} onDelete={setDeleting} />
          ) : (
            <aside className="ab-card ab-panel ab-panel--hint">
              <p className="ab-empty">Click a booking to see the guest, the money and the slip here.</p>
            </aside>
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
  const row = g.rows.find((r) => (kind === 'deposit' ? r.slip_status === 'review' : r.balance_slip_status === 'review'));
  if (!row) return null;
  const file = kind === 'deposit' ? row.slip_file : row.balance_slip_file;
  const expected = kind === 'deposit' ? row.slip_expected : row.balance_slip_expected;
  const reason = kind === 'deposit' ? row.slip_reason : row.balance_slip_reason;
  return (
    <div className="ab-slipcheck">
      {file && (
        <a className="ab-thumb ab-thumb--big" href={mediaUrl(file)} target="_blank" rel="noreferrer" aria-label="View slip">
          <img src={mediaUrl(file)} alt="" />
        </a>
      )}
      <div>
        <b>
          {kind === 'deposit' ? 'Deposit' : 'Rest'} slip sent, {formatBaht(expected)} expected
        </b>
        <p>{reason ? `SlipOK couldn't check it: ${SLIP_REASONS[reason] ?? reason}. ` : ''}Check your bank app, then approve.</p>
        <div className="ab-row">
          <button type="button" className="admin__btn admin__btn--primary" onClick={() => actions.approve(g, kind)}>
            Approve
          </button>
          <button type="button" className="admin__btn" onClick={() => actions.reject(g, kind)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// Last result of a slip that is no longer waiting (verified / rejected).
function SlipResult({ status, reason, amount, label }) {
  if (!status || status === 'review') return null;
  return (
    <p className={`ab-slip ab-slip--${status}`}>
      {label} slip {status === 'verified' ? `✓ ${amount != null ? formatBaht(amount) : 'checked by hand'}` : `✗ ${SLIP_REASONS[reason] ?? reason}`}
    </p>
  );
}

const STATUS_PILL = { pending: ['Waiting for deposit', 'wait'], confirmed: ['Confirmed', 'ok'], cancelled: ['Cancelled', 'off'] };

function BookingPanel({ g, actions, today, onClose, onEditPrice, onDelete }) {
  const b = g.lead;
  const [label, tone] = STATUS_PILL[g.status];
  const contact = [b.guest_email || b.user_email, b.member_code, b.guest_line && `LINE ${b.guest_line}`].filter(Boolean);
  const requests = [...new Set(g.rows.flatMap((r) => r.requests ?? []))];
  const pets = g.rows.reduce((n, r) => n + (r.pets ?? 0), 0);

  return (
    <aside className="ab-card ab-panel" aria-label={`Booking ${g.code}`}>
      <section className="ab-panel__top">
        <div>
          <b>{g.code}</b>
          <span className={`ab-pill ab-pill--${tone}`}>{label}</span>
        </div>
        <button type="button" className="ab-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="ab-muted">Booked {fmtDateTime(b.created_at)}</p>
      </section>

      <section>
        <h3>Guest</h3>
        <p>
          <b>{who(b)}</b>
          {b.guest_phone && (
            <>
              {' · '}
              <a href={`tel:${b.guest_phone}`}>{b.guest_phone}</a>
            </>
          )}
        </p>
        {contact.length > 0 && <p className="ab-muted">{contact.join(' · ')}</p>}
        {(requests.length > 0 || pets > 0) && (
          <p className="ab-flag">{[...requests.filter((r) => r !== 'pets').map((r) => REQUEST_LABELS[r] ?? r), pets > 0 && `${pets} ${pets === 1 ? 'pet' : 'pets'}`].filter(Boolean).join(', ')}</p>
        )}
        {b.note && <p className="ab-muted">“{b.note}”</p>}
      </section>

      <section>
        <h3>Stay</h3>
        {g.isRoom ? (
          <p>
            {fmtDay(g.checkIn)} 14:00 → {fmtDay(g.checkOut)} 12:00 · {nightsOf(g.checkIn, g.checkOut)} nights
          </p>
        ) : (
          <p>{fmtDateTime(b.booked_for)}</p>
        )}
        <ul className="ab-rooms">
          {g.rows.map((r) => (
            <li key={r.id} className={r.status === 'cancelled' && g.status !== 'cancelled' ? 'is-off' : ''}>
              <div>
                <b>{r.room_id ? roomTitle(r.room_name) : r.activity_name}</b>
                <span>
                  {r.code}
                  {r.guests ? ` · ${r.guests} guests` : ''}
                  {r.total != null ? ` · ${formatBaht(r.total)}` : ''}
                  {r.status === 'cancelled' && g.status !== 'cancelled' ? ' · cancelled' : ''}
                </span>
                {r.stay_username && (
                  <span className="ab-login">
                    Room login <code>{r.stay_username}</code> <code>{r.stay_password}</code>
                  </span>
                )}
              </div>
              <div className="ab-row ab-row--quiet">
                <button type="button" className="ab-link" onClick={() => onEditPrice(r)}>
                  Edit price
                </button>
                <button type="button" className="ab-link ab-link--del" onClick={() => onDelete(r)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {g.isRoom && g.total > 0 && (
        <section>
          <h3>Money</h3>
          <dl className="ab-money-list">
            <div>
              <dt>Total</dt>
              <dd>{formatBaht(g.total)}</dd>
            </div>
            <div>
              <dt>Deposit (half)</dt>
              <dd>{g.status === 'confirmed' ? `✓ ${formatBaht(g.deposit)}` : formatBaht(g.deposit)}</dd>
            </div>
            <div>
              <dt>Rest</dt>
              <dd>
                {g.status === 'confirmed' && g.restDue === 0
                  ? `✓ ${formatBaht(g.total - g.deposit)}${g.paidAtFarm ? ' at the farm' : ' online'}`
                  : formatBaht(g.restDue || g.total - g.deposit)}
              </dd>
            </div>
          </dl>
          {g.depositReview && <SlipCheck g={g} kind="deposit" actions={actions} />}
          {g.balanceReview && <SlipCheck g={g} kind="balance" actions={actions} />}
          {!g.depositReview && <SlipResult label="Deposit" status={b.slip_status} reason={b.slip_reason} amount={b.slip_amount} />}
          {!g.balanceReview && <SlipResult label="Rest" status={b.balance_slip_status} reason={b.balance_slip_reason} amount={b.balance_slip_amount} />}
          {g.restDue > 0 && g.checkOut >= today && !g.balanceReview && (
            <button type="button" className="admin__btn admin__btn--primary ab-btn-lg" onClick={() => actions.paidAtFarm(g)}>
              Rest paid at the farm ({formatBaht(g.restDue)})
            </button>
          )}
          {g.paidAtFarm && (
            <button type="button" className="ab-link" onClick={() => actions.paidAtFarm(g, false)}>
              Undo "paid at the farm"
            </button>
          )}
        </section>
      )}

      <section className="ab-row ab-row--quiet">
        {g.status === 'pending' && (
          <button
            type="button"
            className="ab-link"
            onClick={() => actions.setStatus(g, 'confirmed', `Confirm ${g.code} without a slip (deposit received another way)? Room logins are created.`)}
          >
            Confirm without slip
          </button>
        )}
        {g.status !== 'cancelled' ? (
          <button type="button" className="ab-link ab-link--del" onClick={() => actions.setStatus(g, 'cancelled', `Cancel ${g.code} for ${who(b)}? The rooms become free again.`)}>
            Cancel booking
          </button>
        ) : (
          <button type="button" className="ab-link" onClick={() => actions.setStatus(g, 'pending')}>
            Re-open
          </button>
        )}
      </section>
    </aside>
  );
}

// Lets the admin correct what a booking costs: the total and the deposit
// are typed in directly (the deposit follows the total at 50% until it is
// edited itself). The member who booked is told the new amounts in their chat.
function EditPriceDialog({ booking: b, who: name, onClose, onSaved }) {
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
        <h2>Edit price</h2>
        <p>
          <strong>{b.code || `#${b.id}`}</strong> · {name}
          <br />
          {b.room_name || b.activity_name}
          {b.total != null && ` · now ${formatBaht(b.total)} (deposit ${formatBaht(b.deposit)})`}
        </p>
        <div className="admin__dialog-fields">
          <label>
            <span>Total (฿)</span>
            <input type="number" min="0" step="0.01" required autoFocus value={total} onChange={(e) => changeTotal(e.target.value)} />
          </label>
          <label>
            <span>Deposit (฿)</span>
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
          <span>Note for the guest (optional)</span>
          <textarea rows={2} maxLength={500} placeholder="e.g. Discount for the broken air conditioner" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <p className="admin__muted">
          {b.user_email ? `${b.user_email} is told the new amounts in their chat.` : 'This booking has no account, so nobody is told automatically.'}
        </p>
        {error && <p className="admin__error" role="alert">{error}</p>}
        <div className="admin__form-actions">
          <button type="button" className="admin__btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="admin__btn admin__btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save price'}
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

  return (
    <dialog ref={dialogRef} className="admin__dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2>Delete this booking?</h2>
        <p>
          <strong>{b.code || `#${b.id}`}</strong> · {name}
          <br />
          {b.room_name || b.activity_name} ·{' '}
          {b.room_id ? `${fmtDay(dayOf(b.booked_for))} → ${fmtDay(dayOf(b.booked_until))}` : fmtDateTime(b.booked_for)}
        </p>
        <ul>
          <li>This removes the booking for good. It can&apos;t be undone.</li>
          {b.status !== 'cancelled' && b.room_id && <li>The room&apos;s dates become available again.</li>}
          {b.stay_username && (
            <li>
              The room login <code>{b.stay_username}</code> is deleted too.
            </li>
          )}
          <li>
            {b.user_email
              ? `${b.user_email} is told it was deleted, with your reason: on their My bookings page and in their chat.`
              : `This booking has no account, so nobody is told automatically.${b.guest_phone ? ` Call ${b.guest_phone}.` : ''}`}
          </li>
        </ul>
        <label>
          <span>Reason for deleting (the guest sees this)</span>
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={500}
            autoFocus
            placeholder="e.g. Deposit not received by the due date"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p className="admin__error" role="alert">{error}</p>}
        <div className="admin__form-actions">
          <button type="button" className="admin__btn" onClick={onClose} disabled={busy}>
            Keep booking
          </button>
          <button type="submit" className="admin__btn admin__btn--delete" disabled={busy || reason.trim().length < 3}>
            {busy ? 'Deleting…' : 'Delete booking'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
