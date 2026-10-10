import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { toISODate } from '../lib/booking';
import { groupRows, needsYou } from '../lib/adminBookings';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SECTIONS, adminPath } from '../lib/adminSections';
import AdminIcon from '../components/AdminIcons';
import { Bookings, Today } from './AdminBookings';
import AdminChat from './AdminChat';
import AdminPromotions from './AdminPromotions';
import AdminAnnouncements from './AdminAnnouncements';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';
import './Admin.css';

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

// The numbers on the menu: Today = bookings that need you (the same list
// as on the Today page); Chat = unread messages. Re-checked every 8 seconds and whenever the
// section changes (opening a conversation in Chat marks it read).
function useAdminBadges(enabled, tab) {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () =>
      Promise.all([api('/api/admin/stats'), api('/api/admin/bookings')])
        .then(([stats, list]) => {
          if (cancelled) return;
          const today = toISODate(new Date());
          const todo = groupRows(list.bookings).filter((g) => needsYou(g, today)).length;
          setBadges({ overview: todo, chat: stats.stats.unread_chats ?? 0 });
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

// Admin dashboard: a page of its own, outside the public site's navbar and
// footer (see App.jsx). Only reachable for accounts listed in the backend's
// ADMIN_EMAILS. There is no separate admin login: signed-out visitors go to
// the site's normal /login (which sends admins back here), and signed-in
// non-admins go to the Home page. The server enforces this on every
// /api/admin call - the check here just picks where to send people.
// The current section comes from the URL (/admin/:section). Computers get a
// side menu with names; phones a bar on top with a Menu button.
export default function Admin() {
  const { user, logout } = useAuth();
  const { section } = useParams();
  const tab = section ?? 'overview';
  const current = ADMIN_SECTIONS.find((s) => s.id === tab);
  const isAdmin = Boolean(user?.is_admin);
  const badges = useAdminBadges(isAdmin, tab);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login?next=/admin" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  // The calendar is now the room board on Today; keep old links working.
  if (tab === 'calendar') {
    return <Navigate to="/admin" replace />;
  }

  // Unknown section in the URL - go back to Today.
  if (!current) {
    return <Navigate to="/admin" replace />;
  }

  const title =
    tab === 'overview' ? `Today · ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : current.label;

  const menu = (
    <>
      <nav className="admin-side__nav" aria-label="Admin sections">
        {ADMIN_SECTIONS.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 && ADMIN_SECTIONS[i - 1].group !== s.group && <span className="admin-side__sep" aria-hidden="true" />}
            <NavLink to={adminPath(s.id)} end className="admin-side__item" onClick={() => setMenuOpen(false)}>
              <AdminIcon name={s.icon} />
              <span>{s.label}</span>
              {badges[s.id] > 0 && <em>{badges[s.id]}</em>}
            </NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="admin-side__foot">
        <Link to="/home" className="admin-side__item">
          <AdminIcon name="site" />
          <span>View the website</span>
        </Link>
        <button type="button" className="admin-side__item" onClick={logout} title={user.email}>
          <AdminIcon name="logout" />
          <span>Log out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link to="/admin" className="admin-side__brand">
          <img src="/images/logo-mark.png" alt="" />
          Baanrai admin
        </Link>
        {menu}
      </aside>

      {/* Phones: the logo and a Menu button; the menu slides in from the right. */}
      <header className="admin-bar">
        <Link to="/admin" className="admin-side__brand">
          <img src="/images/logo-mark.png" alt="" />
          Baanrai admin
        </Link>
        <button type="button" className="admin-bar__menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          Menu
          {badges.overview > 0 && <em>{badges.overview}</em>}
        </button>
      </header>
      {menuOpen && (
        <div className="admin-sheet" onClick={() => setMenuOpen(false)}>
          <div className="admin-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-sheet__close" onClick={() => setMenuOpen(false)}>
              Close
            </button>
            {menu}
          </div>
        </div>
      )}

      <section className="admin">
        <header className="admin__header">
          <h1>{title}</h1>
        </header>

        {/* key={tab} remounts the panel so it refetches fresh data and replays
            its entrance animation each time you switch sections. */}
        <div className="admin__panel" key={tab}>
          {tab === 'overview' && <Today />}
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
  'booking.slip_sent': { label: 'Slip sent', group: 'bookings', tone: 'pending' },
  'booking.balance_paid': { label: 'Rest of the price paid', group: 'bookings', tone: 'confirmed' },
  'booking.balance_unpaid': { label: '"Paid at farm" undone', group: 'bookings', tone: 'pending' },
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
