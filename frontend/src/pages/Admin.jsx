import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SECTIONS, adminPath } from '../lib/adminSections';
import AdminIcon from '../components/AdminIcons';
import AdminCalendar from './AdminCalendar';
import AdminChat from './AdminChat';
import AdminPromotions from './AdminPromotions';
import AdminAnnouncements from './AdminAnnouncements';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';
import './Admin.css';

// Why a deposit slip was turned down (reason codes from POST /api/bookings/:id/slip).
const SLIP_REASONS = {
  SLIP_UNREADABLE: 'no QR',
  SLIP_NOT_FOUND: 'not found at bank',
  SLIP_PENDING: 'bank not ready',
  SLIP_DUPLICATE: 'used before',
  SLIP_AMOUNT: 'wrong amount',
  SLIP_RECEIVER: 'wrong account',
  SLIP_OLD: 'older than booking',
  SLIP_SERVICE: 'check failed',
  NOT_PENDING: 'booking not pending',
  MANUAL_REJECT: 'rejected by you',
  BOOKING_CANCELLED: 'booking cancelled',
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-';

// Loads `path` on mount and exposes { data, error, loading, reload }.
function useAdminData(path) {
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

// The red numbers on the menu: bookings awaiting their deposit and unread
// chat messages. Re-checked every 8 seconds and whenever the section
// changes (opening a conversation in Chat marks it read).
function useAdminBadges(enabled, tab) {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () =>
      api('/api/admin/stats')
        .then((data) => {
          if (cancelled) return;
          setBadges({ bookings: data.stats.pending_bookings ?? 0, chat: data.stats.unread_chats ?? 0 });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, tab]);

  return badges;
}

// What a menu badge's number means, shown in the icon's hover label.
const badgeText = (id, n) => (id === 'chat' ? `${n} unread` : `${n} waiting`);

// Admin dashboard: a page of its own, outside the public site's navbar and
// footer (see App.jsx). Only reachable for accounts listed in the backend's
// ADMIN_EMAILS. There is no separate admin login: signed-out visitors go to
// the site's normal /login (which sends admins back here), and signed-in
// non-admins go to the Home page. The server enforces this on every
// /api/admin call - the check here just picks where to send people.
// The current section comes from the URL (/admin/:section).
export default function Admin() {
  const { user, logout } = useAuth();
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = section ?? 'overview';
  const current = ADMIN_SECTIONS.find((s) => s.id === tab);
  const isAdmin = Boolean(user?.is_admin);
  const badges = useAdminBadges(isAdmin, tab);
  // Phone only: the "More" sheet of sections that are not on the tab bar.
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login?next=/admin" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  // The calendar is now part of Bookings; keep old links working.
  if (tab === 'calendar') {
    return <Navigate to="/admin/bookings" replace />;
  }

  // Unknown section in the URL - go back to the Overview.
  if (!current) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="admin-shell">
      {/* Laptop: a slim icon rail; each icon's name slides out on hover or
          keyboard focus. Red numbers show what is waiting. */}
      <aside className="admin-rail">
        <Link to="/admin" className="admin-rail__logo" aria-label="Baanrai admin - Overview">
          <img src="/images/logo-mark.png" alt="" />
        </Link>

        <nav className="admin-rail__nav" aria-label="Admin sections">
          {ADMIN_SECTIONS.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && ADMIN_SECTIONS[i - 1].group !== s.group && <span className="admin-rail__sep" aria-hidden="true" />}
              <NavLink to={adminPath(s.id)} end className="admin-rail__item" aria-label={s.label}>
                <AdminIcon name={s.icon} />
                {badges[s.id] > 0 && <span className="admin-rail__badge">{badges[s.id]}</span>}
                <span className="admin-rail__tip" aria-hidden="true">
                  {s.label}
                  {badges[s.id] > 0 && <small>{badgeText(s.id, badges[s.id])}</small>}
                </span>
              </NavLink>
            </Fragment>
          ))}
        </nav>

        <div className="admin-rail__foot">
          <Link to="/home" className="admin-rail__item" aria-label="View site">
            <AdminIcon name="site" />
            <span className="admin-rail__tip" aria-hidden="true">View site</span>
          </Link>
          {/* Logging out leaves you on /admin, which then shows the admin login. */}
          <button type="button" className="admin-rail__item" onClick={logout} aria-label="Log out">
            <AdminIcon name="logout" />
            <span className="admin-rail__tip" aria-hidden="true">
              Log out<small>{user.email}</small>
            </span>
          </button>
        </div>
      </aside>

      {/* Phone: the main sections as a bottom tab bar; the rest under "More". */}
      <nav className="admin-tabs" aria-label="Admin sections">
        {ADMIN_SECTIONS.filter((s) => s.tab).map((s) => (
          <NavLink key={s.id} to={adminPath(s.id)} end className="admin-tabs__item" onClick={() => setMoreOpen(false)}>
            <AdminIcon name={s.icon} size={23} />
            {badges[s.id] > 0 && <span className="admin-rail__badge">{badges[s.id]}</span>}
            {s.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`admin-tabs__item${moreOpen || !current.tab ? ' active' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <AdminIcon name="more" size={23} />
          More
        </button>
      </nav>
      {moreOpen && (
        <div className="admin-more" onClick={() => setMoreOpen(false)}>
          <div className="admin-more__sheet" onClick={(e) => e.stopPropagation()}>
            {ADMIN_SECTIONS.filter((s) => !s.tab).map((s) => (
              <NavLink key={s.id} to={adminPath(s.id)} end onClick={() => setMoreOpen(false)}>
                <AdminIcon name={s.icon} />
                {s.label}
              </NavLink>
            ))}
            <Link to="/home">
              <AdminIcon name="site" />
              View site
            </Link>
            <button type="button" onClick={logout}>
              <AdminIcon name="logout" />
              Log out
            </button>
          </div>
        </div>
      )}

      <section className="admin">
        <header className="admin__header">
          <div>
            <p className="admin__eyebrow">Admin dashboard</p>
            <h1>{current.label}</h1>
          </div>
        </header>

        {/* key={tab} remounts the panel so it refetches fresh data and replays
            its entrance animation each time you switch sections. */}
        <div className="admin__panel" key={tab}>
          {tab === 'overview' && <Overview onJump={(id) => navigate(adminPath(id))} />}
          {tab === 'bookings' && <Bookings />}
          {tab === 'rooms' && <Listings kind="rooms" />}
          {tab === 'activities' && <Listings kind="activities" />}
          {tab === 'users' && <Users />}
          {tab === 'promotions' && <AdminPromotions />}
          {tab === 'announcements' && <AdminAnnouncements />}
          {tab === 'chat' && <AdminChat />}
          {tab === 'log' && <ActivityLog />}
        </div>
      </section>
    </div>
  );
}

function Status({ loading, error }) {
  if (error) return <p className="admin__error" role="alert">{error}</p>;
  if (loading) return <p className="admin__muted">Loading…</p>;
  return null;
}

function Overview({ onJump }) {
  const { data, error, loading } = useAdminData('/api/admin/stats');
  const s = data?.stats;

  const cards = s && [
    { label: 'Slips to check', value: s.slips_to_review, tab: 'bookings' },
    { label: 'Awaiting deposit', value: s.pending_bookings, tab: 'bookings' },
    { label: 'Upcoming bookings', value: s.upcoming_bookings, tab: 'bookings' },
    { label: 'Rooms occupied today', value: `${s.rooms_occupied_now} / ${s.rooms}`, tab: 'bookings' },
    { label: 'Room revenue this month', value: formatBaht(s.room_revenue_this_month), tab: 'bookings' },
    { label: 'Total bookings', value: s.bookings, tab: 'bookings' },
    { label: 'Users', value: s.users, tab: 'users' },
    { label: 'Rooms', value: s.rooms, tab: 'rooms' },
    { label: 'Activities', value: s.activities, tab: 'activities' },
    { label: 'Unread chat messages', value: s.unread_chats, tab: 'chat' },
  ];

  return (
    <>
      <Status loading={loading && !s} error={error} />
      {cards && (
        <div className="admin__stats">
          {cards.map((c, i) => (
            <button
              key={c.label}
              type="button"
              className="admin__stat"
              style={{ '--i': i }}
              onClick={() => onJump(c.tab)}
            >
              <span className="admin__stat-value">{c.value}</span>
              <span className="admin__stat-label">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const STATUS_LABELS = { pending: 'Awaiting deposit', confirmed: 'Confirmed', cancelled: 'Cancelled' };
const REQUEST_LABELS = { bbq: 'BBQ / moo kata', extra_bed: 'Extra bed', pets: 'Pets' };

function Bookings() {
  const { data, error, loading, reload } = useAdminData('/api/admin/bookings');
  const [filter, setFilter] = useState('upcoming');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [repricing, setRepricing] = useState(null);

  const rows = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return (data?.bookings ?? []).filter((b) => {
      const end = new Date(b.booked_until || b.booked_for).getTime();
      if (filter === 'upcoming' && end < now) return false;
      if (filter === 'past' && end >= now) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q) return true;
      return [b.code, b.guest_name, b.guest_phone, b.guest_email, b.user_email, b.member_code, b.room_name, b.activity_name].some(
        (v) => v?.toLowerCase().includes(q)
      );
    });
  }, [data, filter, statusFilter, query]);

  // Moves a booking to a new status (confirm once the deposit is in, cancel
  // to free the room, or re-open a cancelled one).
  async function setStatus(b, status, question) {
    if (question && !window.confirm(question)) return;
    setActionError(null);
    try {
      await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  // Turns down a slip waiting for a manual check; the guest can send another.
  async function rejectSlip(b) {
    if (!window.confirm(`Reject the slip for ${b.code || `#${b.id}`}? The booking stays pending and the guest is asked for a new slip.`)) return;
    setActionError(null);
    try {
      await api(`/api/admin/slips/${b.slip_id}/reject`, { method: 'PATCH' });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const who = (b) => b.guest_name || b.user_email || 'guest';

  return (
    <>
      {/* Which rooms are booked or free, night by night. */}
      {data && <AdminCalendar bookings={data.bookings} />}

      <div className="admin__toolbar">
        <div className="admin__toolbar-group">
          <div className="admin__segmented">
            {['upcoming', 'past', 'all'].map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className={filter === f ? 'is-active' : ''}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="admin__segmented">
            {['all', 'pending', 'confirmed', 'cancelled'].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                className={statusFilter === s ? 'is-active' : ''}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Any status' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <input
          type="search"
          className="admin__search"
          placeholder="Search code, guest, phone or room"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Status loading={loading && !data} error={error || actionError} />
      {data && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Guest</th>
                <th>Booked</th>
                <th>Dates</th>
                <th>Total / deposit</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className={b.status === 'cancelled' ? 'is-cancelled' : ''}>
                  <td>
                    <strong>{b.code || `#${b.id}`}</strong>
                    <div className="admin__sub">{fmtDate(b.created_at)}</div>
                    {/* Rooms booked together share the first room's code. */}
                    {b.group_code && (
                      <div className="admin__sub admin__sub--flag">
                        Group {b.group_code} · {data.bookings.filter((x) => x.group_code === b.group_code).length} rooms
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{who(b)}</strong>
                    {b.member_code && (
                      <div className="admin__sub">
                        {b.member_code} · {b.user_email}
                      </div>
                    )}
                    {b.guest_phone && (
                      <div className="admin__sub">
                        <a href={`tel:${b.guest_phone}`}>{b.guest_phone}</a>
                        {b.guests ? ` · ${b.guests} guests` : ''}
                        {b.extra_guests > 0 ? ` (${b.extra_guests} extra)` : ''}
                        {b.pets > 0 ? ` · ${b.pets} ${b.pets === 1 ? 'pet' : 'pets'}` : ''}
                      </div>
                    )}
                    {(b.guest_email || b.guest_line) && (
                      <div className="admin__sub">
                        {[b.guest_email, b.guest_line && `LINE: ${b.guest_line}`].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {b.requests?.length > 0 && (
                      <div className="admin__sub admin__sub--flag">
                        {b.requests.map((r) => REQUEST_LABELS[r] ?? r).join(', ')}
                      </div>
                    )}
                    {b.note && <div className="admin__sub">“{b.note}”</div>}
                  </td>
                  <td>
                    <span className={`admin__tag admin__tag--${b.room_id ? 'room' : 'activity'}`}>
                      {b.room_id ? 'Room' : 'Activity'}
                    </span>{' '}
                    {b.room_name || b.activity_name}
                  </td>
                  <td className="admin__nowrap">
                    {b.room_id ? (
                      <>
                        {fmtDate(b.booked_for)}
                        <div className="admin__sub">→ {fmtDate(b.booked_until)}</div>
                      </>
                    ) : (
                      fmtDateTime(b.booked_for)
                    )}
                  </td>
                  <td>
                    {b.total != null ? (
                      <>
                        {formatBaht(b.total)}
                        <div className="admin__sub">Deposit {formatBaht(b.deposit)}</div>
                        {/* The transfer slip checked with SlipOK, if the guest sent one. */}
                        {b.slip_status && (
                          <div className={`admin__sub admin__slip admin__slip--${b.slip_status}`}>
                            {b.slip_status === 'verified'
                              ? `Slip ✓ ${b.slip_amount != null ? formatBaht(b.slip_amount) : 'checked by hand'}`
                              : b.slip_status === 'review'
                                ? 'Slip sent · check it'
                                : `Slip ✗ ${SLIP_REASONS[b.slip_reason] ?? b.slip_reason}${b.slip_amount != null ? ` (${formatBaht(b.slip_amount)})` : ''}`}
                            {b.slip_count > 1 && ` · ${b.slip_count} tries`}
                            {b.slip_file && (
                              <>
                                {' · '}
                                <a href={mediaUrl(b.slip_file)} target="_blank" rel="noreferrer">
                                  view
                                </a>
                              </>
                            )}
                            {/* Manual check: approve = confirm the booking. */}
                            {b.slip_status === 'review' && b.status === 'pending' && (
                              <span className="admin__slip-actions">
                                <button type="button" className="admin__btn admin__btn--primary" onClick={() => setStatus(b, 'confirmed', `Approve the slip and confirm ${b.code || `#${b.id}`}? Check the amount is ${formatBaht(b.deposit)} and it reached your account.`)}>
                                  Approve
                                </button>
                                <button type="button" className="admin__btn" onClick={() => rejectSlip(b)}>
                                  Reject
                                </button>
                              </span>
                            )}
                          </div>
                        )}
                        {Number(b.discount) > 0 && (
                          <div className="admin__sub admin__sub--flag">
                            {b.promo_name || 'Promotion'}: −{formatBaht(b.discount)}
                          </div>
                        )}
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className={`admin__status admin__status--${b.status}`}>{STATUS_LABELS[b.status]}</span>
                    {/* The room dashboard login created when the booking was confirmed. */}
                    {b.stay_username && (
                      <div className="admin__login">
                        <span>Room login</span>
                        <code>{b.stay_username}</code>
                        <code>{b.stay_password}</code>
                        <span>until {fmtDateTime(b.stay_expires_at)}</span>
                      </div>
                    )}
                  </td>
                  <td className="admin__actions admin__actions--stacked">
                    {b.status === 'pending' && (
                      <button
                        type="button"
                        className="admin__btn admin__btn--primary"
                        onClick={() => setStatus(b, 'confirmed')}
                        title="Deposit received - confirm and create the room login"
                      >
                        Confirm
                      </button>
                    )}
                    {b.status !== 'cancelled' ? (
                      <button
                        type="button"
                        className="admin__btn admin__btn--danger"
                        onClick={() =>
                          setStatus(b, 'cancelled', `Cancel booking ${b.code || `#${b.id}`} for ${who(b)}? The room's dates become available again.`)
                        }
                      >
                        Cancel
                      </button>
                    ) : (
                      <button type="button" className="admin__btn" onClick={() => setStatus(b, 'pending')}>
                        Re-open
                      </button>
                    )}
                    <button type="button" className="admin__btn" onClick={() => setRepricing(b)}>
                      Edit price
                    </button>
                    <button type="button" className="admin__btn admin__btn--danger" onClick={() => setDeleting(b)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="admin__empty">No bookings match.</p>}
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
    </>
  );
}

// Lets the admin correct what a booking costs: the total and the deposit
// are typed in directly (the deposit follows the total at 50% until it is
// edited itself). The member who booked is told the new amounts in their chat.
function EditPriceDialog({ booking: b, who, onClose, onSaved }) {
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
          <strong>{b.code || `#${b.id}`}</strong> · {who}
          <br />
          {b.room_name || b.activity_name}
          {b.total != null && ` · now ${formatBaht(b.total)} (deposit ${formatBaht(b.deposit)})`}
        </p>
        <div className="admin__dialog-fields">
          <label>
            <span>Total (฿)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              autoFocus
              value={total}
              onChange={(e) => changeTotal(e.target.value)}
            />
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
          <textarea
            rows={2}
            maxLength={500}
            placeholder="e.g. Discount for the broken air conditioner"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="admin__muted">
          {b.user_email
            ? `${b.user_email} is told the new amounts in their chat.`
            : 'This booking has no account, so nobody is told automatically.'}
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
function DeleteBookingDialog({ booking: b, who, onClose, onDeleted }) {
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
          <strong>{b.code || `#${b.id}`}</strong> · {who}
          <br />
          {b.room_name || b.activity_name} ·{' '}
          {b.room_id ? `${fmtDate(b.booked_for)} → ${fmtDate(b.booked_until)}` : fmtDateTime(b.booked_for)}
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

const LISTING_CONFIG = {
  rooms: { singular: 'room', listPath: '/api/rooms', listKey: 'rooms', roomFields: true },
  activities: { singular: 'activity', listPath: '/api/activities', listKey: 'activities', roomFields: false },
};

const EMPTY_FORM = {
  name: '',
  name_th: '',
  description: '',
  description_th: '',
  tag: '',
  tag_th: '',
  price: '',
  position: '',
  capacity: '',
  max_extra_guests: '0',
  image_url: '',
};

// The form's values for an existing room or activity.
const formFor = (item) =>
  Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, item[key] ?? EMPTY_FORM[key]]));

// Shared create/edit/delete manager for rooms and activities, with each
// one's photos (up to 6, see AdminPhotos).
function Listings({ kind }) {
  const cfg = LISTING_CONFIG[kind];
  const { data, error, loading, reload } = useAdminData(cfg.listPath);
  const [editing, setEditing] = useState(null); // null | 'new' | item id
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState([]); // the edited item's photos
  const [pending, setPending] = useState([]); // photos picked for a new item, uploaded on Save
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);

  function startEdit(item) {
    setEditing(item ? item.id : 'new');
    setFormError(null);
    setSavedNote(null);
    setForm(item ? formFor(item) : EMPTY_FORM);
    setPhotos(item?.photos ?? []);
    setPending([]);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const isNew = editing === 'new';
      const data = await api(`/api/admin/${kind}${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      });
      if (isNew) {
        // Upload the photos picked on the new form, then stay on the item.
        const created = data.room ?? data.activity;
        setEditing(created.id);
        setForm(formFor(created));
        setPending([]);
        try {
          setPhotos(await uploadPending(kind, created.id, pending));
          setSavedNote(`Saved${pending.length ? ` with ${pending.length} photo${pending.length > 1 ? 's' : ''}` : ''}.`);
        } catch (err) {
          setPhotos(err.photos);
          setFormError(`Saved, but not every photo uploaded: ${err.message} Add the rest below.`);
        }
      } else {
        setEditing(null);
      }
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function photosChanged(next) {
    setPhotos(next);
    reload();
  }

  async function remove(item) {
    if (
      !window.confirm(
        `Delete ${cfg.singular} "${item.name}"? All of its bookings will be deleted too. This can't be undone.`
      )
    )
      return;
    try {
      await api(`/api/admin/${kind}/${item.id}`, { method: 'DELETE' });
      if (editing === item.id) setEditing(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <>
      <div className="admin__toolbar admin__toolbar--end">
        <button type="button" className="admin__btn admin__btn--primary" onClick={() => startEdit(null)}>
          + Add {cfg.singular}
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? `New ${cfg.singular}` : `Edit ${cfg.singular}`}</h2>
          {savedNote && <p className="admin__notice">{savedNote}</p>}
          {cfg.roomFields ? (
            <div className="admin__form-grid">
              <label>
                <span>Name (English · Thai)</span>
                <input required placeholder="Father's Room · ห้องพ่อ" {...field('name')} />
              </label>
              <label>
                <span>Price (฿) per night</span>
                <input required type="number" min="0" step="0.01" {...field('price')} />
              </label>
              <label>
                <span>Guests included in the price</span>
                <input type="number" min="1" {...field('capacity')} />
              </label>
              <label>
                <span>Extra guests allowed (fee per night)</span>
                <input type="number" min="0" max="10" {...field('max_extra_guests')} />
              </label>
              <label className="admin__form-wide">
                <span>Description</span>
                <textarea rows={3} {...field('description')} />
              </label>
            </div>
          ) : (
            <div className="admin__form-grid">
              <label>
                <span>Name (English)</span>
                <input placeholder="Fruit picking" {...field('name')} />
              </label>
              <label>
                <span>Name (Thai)</span>
                <input lang="th" placeholder="เก็บผลไม้" {...field('name_th')} />
              </label>
              <label>
                <span>Tag (English, optional)</span>
                <input placeholder="Every morning" maxLength={60} {...field('tag')} />
              </label>
              <label>
                <span>Tag (Thai, optional)</span>
                <input lang="th" placeholder="ทุกเช้า" maxLength={60} {...field('tag_th')} />
              </label>
              <label>
                <span>Price (฿), 0 if free</span>
                <input type="number" min="0" step="0.01" {...field('price')} />
              </label>
              <label>
                <span>Order on the page (1 = first)</span>
                <input type="number" min="0" placeholder="Last" {...field('position')} />
              </label>
              <label className="admin__form-wide">
                <span>Description (English)</span>
                <textarea rows={2} {...field('description')} />
              </label>
              <label className="admin__form-wide">
                <span>Description (Thai)</span>
                <textarea lang="th" rows={2} {...field('description_th')} />
              </label>
            </div>
          )}
          <AdminPhotos
            kind={kind}
            itemId={editing === 'new' ? null : editing}
            photos={photos}
            onChange={photosChanged}
            pending={pending}
            onPendingChange={setPending}
          />
          {formError && <p className="admin__error" role="alert">{formError}</p>}
          <div className="admin__form-actions">
            <button type="button" className="admin__btn" onClick={() => setEditing(null)}>
              {editing === 'new' ? 'Cancel' : 'Close'}
            </button>
            <button type="submit" className="admin__btn admin__btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

        </form>
      )}

      <Status loading={loading && !data} error={error} />
      {data && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Photos</th>
                <th>Name</th>
                {!cfg.roomFields && <th>Tag</th>}
                <th>Price</th>
                {cfg.roomFields && <th>Guests</th>}
                <th>Description</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data[cfg.listKey].map((item) => (
                <tr key={item.id} className={editing === item.id ? 'is-editing' : ''}>
                  <td>
                    <button
                      type="button"
                      className="admin-thumb"
                      onClick={() => startEdit(item)}
                      aria-label={`Photos of ${item.name}: ${item.photos?.length ?? 0} of ${MAX_PHOTOS}`}
                    >
                      {item.photos?.[0] ? <img src={mediaUrl(item.photos[0].file)} alt="" loading="lazy" /> : <span>No photo</span>}
                      <em>
                        {item.photos?.length ?? 0}/{MAX_PHOTOS}
                      </em>
                    </button>
                  </td>
                  <td>
                    <strong>{item.name}</strong>
                    {item.name_th && item.name_th !== item.name && <div className="admin__muted">{item.name_th}</div>}
                  </td>
                  {!cfg.roomFields && <td className="admin__muted">{item.tag || item.tag_th || '-'}</td>}
                  <td>{Number(item.price) > 0 || cfg.roomFields ? formatBaht(item.price) : 'Free'}</td>
                  {cfg.roomFields && (
                    <td>
                      {item.capacity ?? '-'}
                      {item.max_extra_guests > 0 && ` + ${item.max_extra_guests} extra`}
                    </td>
                  )}
                  <td className="admin__muted admin__clip">{item.description || '-'}</td>
                  <td className="admin__actions">
                    <button type="button" className="admin__btn" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(item)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data[cfg.listKey].length === 0 && <p className="admin__empty">Nothing here yet.</p>}
        </div>
      )}
    </>
  );
}

function Users() {
  const { data, error, loading } = useAdminData('/api/admin/users');
  return (
    <>
      <Status loading={loading && !data} error={error} />
      {data && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Account</th>
                <th>Type</th>
                <th>Joined</th>
                <th>Bookings</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="admin__muted">{u.stay_booking_id ? '-' : u.member_code}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`admin__tag admin__tag--${u.stay_booking_id ? 'activity' : 'room'}`}>
                      {u.stay_booking_id ? 'Room login' : 'Member'}
                    </span>
                  </td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>{u.stay_booking_id ? '-' : u.booking_count}</td>
                  <td className="admin__muted">{fmtDateTime(u.account_expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.users.length === 0 && <p className="admin__empty">No users yet.</p>}
        </div>
      )}
    </>
  );
}

// What each activity_log `type` is called, and which filter group and tag
// colour it belongs to.
const LOG_TYPES = {
  'booking.requested': { label: 'Booking requested', group: 'bookings', tone: 'pending' },
  'booking.confirmed': { label: 'Confirmed · room login created', group: 'bookings', tone: 'confirmed' },
  'booking.cancelled': { label: 'Booking cancelled', group: 'bookings', tone: 'cancelled' },
  'booking.reopened': { label: 'Booking re-opened', group: 'bookings', tone: 'pending' },
  'booking.deleted': { label: 'Booking deleted', group: 'bookings', tone: 'cancelled' },
  'booking.repriced': { label: 'Price edited', group: 'bookings', tone: 'pending' },
  'booking.slip_sent': { label: 'Deposit slip sent', group: 'bookings', tone: 'pending' },
  'booking.slip_rejected': { label: 'Slip rejected', group: 'bookings', tone: 'cancelled' },
  'promotion.created': { label: 'Promotion created', group: 'bookings', tone: 'confirmed' },
  'promotion.deleted': { label: 'Promotion deleted', group: 'bookings', tone: 'cancelled' },
  'member.registered': { label: 'New member', group: 'accounts', tone: 'confirmed' },
  'login.member': { label: 'Member login', group: 'logins', tone: 'neutral' },
  'login.room': { label: 'Room account login', group: 'logins', tone: 'neutral' },
  'login.admin': { label: 'Admin login', group: 'logins', tone: 'neutral' },
  'login.expired': { label: 'Expired account refused', group: 'logins', tone: 'cancelled' },
};
const LOG_FILTERS = [
  ['all', 'Everything'],
  ['bookings', 'Bookings'],
  ['accounts', 'New members'],
  ['logins', 'Logins'],
];

// The human-readable part of a log row, built from its `details`.
function LogDetails({ entry }) {
  const d = entry.details ?? {};
  const stay = [d.room, d.check_in && `${d.check_in} → ${d.check_out}`].filter(Boolean).join(' · ');

  return (
    <>
      {(d.code || d.guest) && (
        <div>
          {d.code && <strong>{d.code}</strong>}
          {d.guest && ` ${d.guest}`}
          {d.phone && ` · ${d.phone}`}
        </div>
      )}
      {stay && <div className="admin__sub">{stay}</div>}
      {d.extra_guests > 0 && <div className="admin__sub">{d.extra_guests} extra guests</div>}
      {d.pets > 0 && <div className="admin__sub">{d.pets} {d.pets === 1 ? 'pet' : 'pets'}</div>}
      {d.name && (
        <div>
          <strong>{d.name}</strong>
          {d.percent != null && ` · ${d.percent}% off`}
        </div>
      )}
      {d.promotion && <div className="admin__sub">Promotion {d.promotion}</div>}
      {d.total != null && (
        <div className="admin__sub">
          Total {formatBaht(d.total)}
          {d.old_total != null && ` (was ${formatBaht(d.old_total)})`}
          {d.deposit != null && ` · deposit ${formatBaht(d.deposit)}`}
        </div>
      )}
      {d.member_code && <div className="admin__sub">Member {d.member_code}</div>}
      {d.via && <div className="admin__sub">via {d.via}</div>}
      {d.was && <div className="admin__sub">was {d.was}</div>}
      {d.reason && <div className="admin__sub">Reason: {d.reason}</div>}
      {d.notified != null && (
        <div className="admin__sub">{d.notified ? 'Member notified' : 'No account to notify'}</div>
      )}
      {d.room_login_removed && <div className="admin__sub">Room login {d.room_login_removed} removed</div>}
      {d.expired_at && <div className="admin__sub">expired {fmtDateTime(d.expired_at)}</div>}
      {/* The room dashboard login generated when the booking was confirmed. */}
      {d.room_username && (
        <div className="admin__login">
          <span>Room login</span>
          <code>{d.room_username}</code>
          <code>{d.room_password}</code>
          <span>until {fmtDateTime(d.expires_at)}</span>
        </div>
      )}
    </>
  );
}

// Everything that has happened, newest first: booking requests, confirmations
// (with the room login that was created), cancellations, sign-ups and logins.
function ActivityLog() {
  const { data, error, loading, reload } = useAdminData('/api/admin/log');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.log ?? []).filter((entry) => {
      const meta = LOG_TYPES[entry.type];
      if (group !== 'all' && meta?.group !== group) return false;
      if (!q) return true;
      return [entry.actor, meta?.label, ...Object.values(entry.details ?? {})].some((v) =>
        String(v ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, group, query]);

  return (
    <>
      <div className="admin__toolbar">
        <div className="admin__toolbar-group">
          <div className="admin__segmented">
            {LOG_FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={group === id}
                className={group === id ? 'is-active' : ''}
                onClick={() => setGroup(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="admin__btn" onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <input
          type="search"
          className="admin__search"
          placeholder="Search code, name, email or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>By</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const meta = LOG_TYPES[entry.type] ?? { label: entry.type, tone: 'neutral' };
                return (
                  <tr key={entry.id}>
                    <td className="admin__muted admin__nowrap">{fmtDateTime(entry.created_at)}</td>
                    <td>
                      <span className={`admin__status admin__status--${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td>{entry.actor ?? 'system'}</td>
                    <td>
                      <LogDetails entry={entry} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="admin__empty">Nothing logged yet.</p>}
        </div>
      )}
    </>
  );
}
