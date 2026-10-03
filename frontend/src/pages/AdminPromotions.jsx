import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const EMPTY_FORM = { name: '', percent: '', starts_on: '', ends_on: '', room_id: '', active: true };

const fmtDay = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Where a promotion stands today.
function promoState(p) {
  if (!p.active) return { label: 'Off', tone: 'neutral' };
  const today = todayKey();
  if (p.ends_on < today) return { label: 'Finished', tone: 'cancelled' };
  if (p.starts_on > today) return { label: 'Upcoming', tone: 'pending' };
  return { label: 'Running', tone: 'confirmed' };
}

// Admin "Promotions" section: create, edit, switch off and delete
// promotions. A promotion takes a percentage off the room rate for stays
// that check in between its two dates, for one room or all of them. Guests
// see it on the site straight away and get the discount when they book.
export default function AdminPromotions() {
  const [promotions, setPromotions] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | promotion id
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api('/api/admin/promotions')
      .then((data) => {
        setPromotions(data.promotions);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    api('/api/rooms')
      .then((data) => setRooms([...data.rooms].sort((a, b) => b.price - a.price)))
      .catch(() => {});
  }, [load]);

  function startEdit(p) {
    setEditing(p ? p.id : 'new');
    setFormError(null);
    setForm(
      p
        ? {
            name: p.name,
            percent: p.percent,
            starts_on: p.starts_on,
            ends_on: p.ends_on,
            room_id: p.room_id ?? '',
            active: p.active,
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
      await api(`/api/admin/promotions${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Switches a promotion on or off without opening the form.
  async function toggle(p) {
    try {
      await api(`/api/admin/promotions/${p.id}`, { method: 'PUT', body: JSON.stringify({ ...p, active: !p.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Delete the promotion "${p.name}"? Bookings already made keep their discount.`)) return;
    try {
      await api(`/api/admin/promotions/${p.id}`, { method: 'DELETE' });
      if (editing === p.id) setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
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
          A promotion takes a percentage off the room rate for stays that check in between its dates. Guests see it on
          the site straight away. If two apply, the bigger discount is used.
        </p>
        <button type="button" className="admin__btn admin__btn--primary" onClick={() => startEdit(null)}>
          + Add promotion
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? 'New promotion' : 'Edit promotion'}</h2>
          <div className="admin__form-grid">
            <label>
              <span>Name (guests see this)</span>
              <input required maxLength={80} placeholder="e.g. Rainy season special" {...field('name')} />
            </label>
            <label>
              <span>Discount (% off the room rate)</span>
              <input required type="number" min="1" max="100" step="0.5" {...field('percent')} />
            </label>
            <label>
              <span>First check-in date</span>
              <input required type="date" {...field('starts_on')} />
            </label>
            <label>
              <span>Last check-in date</span>
              <input required type="date" min={form.starts_on || undefined} {...field('ends_on')} />
            </label>
            <label>
              <span>Room</span>
              <select {...field('room_id')}>
                <option value="">All rooms</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin__check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>Switched on</span>
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

      {error && <p className="admin__error" role="alert">{error}</p>}
      {!promotions && !error && <p className="admin__muted">Loading…</p>}
      {promotions && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Promotion</th>
                <th>Discount</th>
                <th>Check-in dates</th>
                <th>Room</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => {
                const state = promoState(p);
                return (
                  <tr key={p.id} className={editing === p.id ? 'is-editing' : ''}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.percent}% off</td>
                    <td className="admin__nowrap">
                      {fmtDay(p.starts_on)}
                      <div className="admin__sub">→ {fmtDay(p.ends_on)}</div>
                    </td>
                    <td>{p.room_name ?? 'All rooms'}</td>
                    <td>
                      <span className={`admin__status admin__status--${state.tone}`}>{state.label}</span>
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="admin__btn" onClick={() => toggle(p)}>
                        {p.active ? 'Switch off' : 'Switch on'}
                      </button>
                      <button type="button" className="admin__btn" onClick={() => startEdit(p)}>
                        Edit
                      </button>
                      <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {promotions.length === 0 && <p className="admin__empty">No promotions yet.</p>}
        </div>
      )}
    </>
  );
}
