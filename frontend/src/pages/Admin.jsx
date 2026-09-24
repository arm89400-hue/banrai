import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SECTIONS, adminPath } from '../lib/adminSections';
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

// Admin dashboard: only reachable for accounts listed in the backend's
// ADMIN_EMAILS. The server enforces this on every /api/admin call - the
// checks here just show a friendly message instead of empty tables.
// The current section comes from the URL (/admin/:section); the section
// links themselves live in the site navbar (see Navbar.jsx).
export default function Admin() {
  const { user } = useAuth();
  const { section } = useParams();
  const navigate = useNavigate();
  const tab = section ?? 'overview';
  const current = ADMIN_SECTIONS.find((s) => s.id === tab);

  if (!user || !user.is_admin) {
    return (
      <section className="page auth-page">
        <h1>Admin</h1>
        <p>
          {user ? (
            'This page is for administrators only. If you were just made an admin, log out and log in again.'
          ) : (
            <>
              <Link to="/login">Log in</Link> with an admin account to continue.
            </>
          )}
        </p>
      </section>
    );
  }

  // Unknown section in the URL - go back to the Overview.
  if (!current) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <section className="admin">
      <header className="admin__header">
        <div>
          <p className="admin__eyebrow">Admin dashboard</p>
          <h1>{current.label}</h1>
        </div>
        <span className="admin__who">Signed in as {user.email}</span>
      </header>

      {/* key={tab} remounts the panel so it refetches fresh data and replays
          its entrance animation each time you switch sections. */}
      <div className="admin__panel" key={tab}>
        {tab === 'overview' && <Overview onJump={(id) => navigate(adminPath(id))} />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'rooms' && <Listings kind="rooms" />}
        {tab === 'activities' && <Listings kind="activities" />}
        {tab === 'users' && <Users />}
        {tab === 'messages' && <Messages />}
      </div>
    </section>
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
    { label: 'Upcoming bookings', value: s.upcoming_bookings, tab: 'bookings' },
    { label: 'Rooms occupied today', value: `${s.rooms_occupied_now} / ${s.rooms}`, tab: 'bookings' },
    { label: 'Room revenue this month', value: formatBaht(s.room_revenue_this_month), tab: 'bookings' },
    { label: 'Total bookings', value: s.bookings, tab: 'bookings' },
    { label: 'Users', value: s.users, tab: 'users' },
    { label: 'Rooms', value: s.rooms, tab: 'rooms' },
    { label: 'Activities', value: s.activities, tab: 'activities' },
    { label: 'Contact messages', value: s.messages, tab: 'messages' },
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

function Bookings() {
  const { data, error, loading, reload } = useAdminData('/api/admin/bookings');
  const [filter, setFilter] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState(null);

  const rows = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return (data?.bookings ?? []).filter((b) => {
      const end = new Date(b.booked_until || b.booked_for).getTime();
      if (filter === 'upcoming' && end < now) return false;
      if (filter === 'past' && end >= now) return false;
      if (!q) return true;
      return [b.user_email, b.room_name, b.activity_name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [data, filter, query]);

  async function cancel(b) {
    const what = b.room_name || b.activity_name;
    if (!window.confirm(`Cancel booking #${b.id} (${what}) for ${b.user_email}?`)) return;
    setActionError(null);
    try {
      await api(`/api/admin/bookings/${b.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <>
      <div className="admin__toolbar">
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
        <input
          type="search"
          className="admin__search"
          placeholder="Search guest, room or activity"
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
                <th>#</th>
                <th>Guest</th>
                <th>Booked</th>
                <th>Dates</th>
                <th>Made on</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="admin__muted">{b.id}</td>
                  <td>{b.user_email}</td>
                  <td>
                    <span className={`admin__tag admin__tag--${b.room_id ? 'room' : 'activity'}`}>
                      {b.room_id ? 'Room' : 'Activity'}
                    </span>{' '}
                    {b.room_name || b.activity_name}
                  </td>
                  <td>
                    {b.room_id
                      ? `${fmtDate(b.booked_for)} → ${fmtDate(b.booked_until)}`
                      : fmtDateTime(b.booked_for)}
                  </td>
                  <td className="admin__muted">{fmtDate(b.created_at)}</td>
                  <td className="admin__actions">
                    <button type="button" className="admin__btn admin__btn--danger" onClick={() => cancel(b)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="admin__empty">No bookings match.</p>}
        </div>
      )}
    </>
  );
}

const LISTING_CONFIG = {
  rooms: { singular: 'room', listPath: '/api/rooms', listKey: 'rooms', roomFields: true },
  activities: { singular: 'activity', listPath: '/api/activities', listKey: 'activities', roomFields: false },
};

const EMPTY_FORM = { name: '', description: '', price: '', capacity: '', image_url: '' };

// Shared create/edit/delete manager for rooms and activities.
function Listings({ kind }) {
  const cfg = LISTING_CONFIG[kind];
  const { data, error, loading, reload } = useAdminData(cfg.listPath);
  const [editing, setEditing] = useState(null); // null | 'new' | item id
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function startEdit(item) {
    setEditing(item ? item.id : 'new');
    setFormError(null);
    setForm(
      item
        ? {
            name: item.name ?? '',
            description: item.description ?? '',
            price: item.price ?? '',
            capacity: item.capacity ?? '',
            image_url: item.image_url ?? '',
          }
        : EMPTY_FORM
    );
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const isNew = editing === 'new';
      await api(`/api/admin/${kind}${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      });
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
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
      <div className="admin__toolbar">
        <p className="admin__muted">
          Changes appear on the public site straight away.
        </p>
        <button type="button" className="admin__btn admin__btn--primary" onClick={() => startEdit(null)}>
          + Add {cfg.singular}
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? `New ${cfg.singular}` : `Edit ${cfg.singular}`}</h2>
          <div className="admin__form-grid">
            <label>
              <span>Name</span>
              <input required {...field('name')} />
            </label>
            <label>
              <span>Price (฿){cfg.roomFields && ' per night'}</span>
              <input required type="number" min="0" step="0.01" {...field('price')} />
            </label>
            {cfg.roomFields && (
              <>
                <label>
                  <span>Max guests</span>
                  <input type="number" min="1" {...field('capacity')} />
                </label>
                <label>
                  <span>Image URL (optional)</span>
                  <input placeholder="/images/rooms/room-1.jpg" {...field('image_url')} />
                </label>
              </>
            )}
            <label className="admin__form-wide">
              <span>Description</span>
              <textarea rows={3} {...field('description')} />
            </label>
          </div>
          {formError && <p className="admin__error" role="alert">{formError}</p>}
          <div className="admin__form-actions">
            <button type="button" className="admin__btn" onClick={() => setEditing(null)}>
              Cancel
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
                <th>Name</th>
                <th>Price</th>
                {cfg.roomFields && <th>Guests</th>}
                <th>Description</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data[cfg.listKey].map((item) => (
                <tr key={item.id} className={editing === item.id ? 'is-editing' : ''}>
                  <td><strong>{item.name}</strong></td>
                  <td>{formatBaht(item.price)}</td>
                  {cfg.roomFields && <td>{item.capacity ?? '-'}</td>}
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
                <th>#</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Bookings</th>
                <th>Access expires</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="admin__muted">{u.id}</td>
                  <td>{u.email}</td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>{u.booking_count}</td>
                  <td className="admin__muted">{fmtDate(u.account_expires_at)}</td>
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

function Messages() {
  const { data, error, loading, reload } = useAdminData('/api/admin/messages');
  const [actionError, setActionError] = useState(null);

  async function remove(m) {
    if (!window.confirm(`Delete the message from ${m.name}?`)) return;
    setActionError(null);
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <>
      <Status loading={loading && !data} error={error || actionError} />
      {data && (
        <div className="admin__messages">
          {data.messages.map((m, i) => (
            <article key={m.id} className="admin__message" style={{ '--i': Math.min(i, 8) }}>
              <header>
                <strong>{m.name}</strong>
                <span className="admin__muted">{fmtDateTime(m.created_at)}</span>
              </header>
              <p>{m.message}</p>
              <footer>
                <a className="admin__btn admin__btn--primary" href={`mailto:${m.email}`}>
                  Reply to {m.email}
                </a>
                <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(m)}>
                  Delete
                </button>
              </footer>
            </article>
          ))}
          {data.messages.length === 0 && <p className="admin__empty">No messages yet.</p>}
        </div>
      )}
    </>
  );
}
