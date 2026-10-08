import { useCallback, useEffect, useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';

const AUDIENCES = [
  ['home', 'Home page'],
  ['booked', 'Booked guests only'],
  ['both', 'Both'],
];
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES);

// <input type="datetime-local"> works in the admin's own (Thai) time; the API
// stores real moments in time.
const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const fmtWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const emptyForm = () => ({
  title: '',
  title_th: '',
  body: '',
  body_th: '',
  audience: 'home',
  starts_at: toLocalInput(new Date().toISOString()),
  ends_at: '',
  active: true,
});

const formFor = (a) => ({
  title: a.title ?? '',
  title_th: a.title_th ?? '',
  body: a.body ?? '',
  body_th: a.body_th ?? '',
  audience: a.audience,
  starts_at: toLocalInput(a.starts_at),
  ends_at: toLocalInput(a.ends_at),
  active: a.active,
});

// Where an announcement stands right now.
function stateOf(a) {
  const now = Date.now();
  if (!a.active) return { label: 'Off', tone: 'neutral' };
  if (a.ends_at && new Date(a.ends_at) <= now) return { label: 'Ended', tone: 'cancelled' };
  if (new Date(a.starts_at) > now) return { label: 'Scheduled', tone: 'pending' };
  return { label: 'Showing', tone: 'confirmed' };
}

// Admin "Announcements": write announcements in Thai and/or English with an
// up to 6 photos, choose who sees them (Home page, booked guests, or
// both) and from when until when. Outside that time they disappear by
// themselves; with none showing, the Home page has no announcement space.
export default function AdminAnnouncements() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | announcement id
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState([]); // the edited announcement's photos
  const [pending, setPending] = useState([]); // photos picked for a new one, uploaded on Save
  const [formError, setFormError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api('/api/admin/announcements')
      .then((data) => {
        setList(data.announcements);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  function startEdit(a) {
    setEditing(a ? a.id : 'new');
    setForm(a ? formFor(a) : emptyForm());
    setPhotos(a?.photos ?? []);
    setPending([]);
    setFormError(null);
    setSavedNote(null);
  }

  const payload = (f) => ({ ...f, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) });

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const isNew = editing === 'new';
      const data = await api(`/api/admin/announcements${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(payload(form)),
      });
      if (isNew) {
        // Upload the photos picked on the new form, then stay open.
        const id = data.announcement.id;
        setEditing(id);
        setForm(formFor(data.announcement));
        setPending([]);
        try {
          setPhotos(await uploadPending('announcements', id, pending));
          setSavedNote(`Saved${pending.length ? ` with ${pending.length} photo${pending.length > 1 ? 's' : ''}` : ''}.`);
        } catch (err) {
          setPhotos(err.photos);
          setFormError(`Saved, but not every photo uploaded: ${err.message} Add the rest below.`);
        }
      } else {
        setEditing(null);
      }
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function photosChanged(next) {
    setPhotos(next);
    load();
  }

  async function toggle(a) {
    try {
      await api(`/api/admin/announcements/${a.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...a, photos: undefined, active: !a.active }),
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(a) {
    if (!window.confirm(`Delete the announcement "${a.title || a.title_th}"? This can't be undone.`)) return;
    try {
      await api(`/api/admin/announcements/${a.id}`, { method: 'DELETE' });
      if (editing === a.id) setEditing(null);
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
      <div className="admin__toolbar admin__toolbar--end">
        <button type="button" className="admin__btn admin__btn--primary" onClick={() => startEdit(null)}>
          + Add announcement
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? 'New announcement' : 'Edit announcement'}</h2>
          {savedNote && <p className="admin__notice">{savedNote}</p>}
          <div className="admin__form-grid">
            <label>
              <span>Title (Thai)</span>
              <input lang="th" maxLength={120} placeholder="ปิดปรับปรุงสระว่ายน้ำ" {...field('title_th')} />
            </label>
            <label>
              <span>Title (English)</span>
              <input maxLength={120} placeholder="Pool closed for cleaning" {...field('title')} />
            </label>
            <label className="admin__form-wide">
              <span>Message (Thai, optional)</span>
              <textarea lang="th" rows={3} maxLength={2000} {...field('body_th')} />
            </label>
            <label className="admin__form-wide">
              <span>Message (English, optional)</span>
              <textarea rows={3} maxLength={2000} {...field('body')} />
            </label>

            <div className="admin__form-wide admin-ann__who">
              <span className="admin-ann__label" id="ann-who">
                Who sees it
              </span>
              <div className="admin__segmented" role="group" aria-labelledby="ann-who">
                {AUDIENCES.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={form.audience === id}
                    className={form.audience === id ? 'is-active' : ''}
                    onClick={() => setForm({ ...form, audience: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="admin__muted admin-ann__hint">
                {form.audience === 'home' && 'Everyone, on the Home page.'}
                {form.audience === 'booked' &&
                  'Only guests with a booking that hasn’t ended, on “My bookings” and their room dashboard.'}
                {form.audience === 'both' && 'On the Home page, and to guests with a booking on their pages.'}
              </p>
            </div>

            <label>
              <span>Show from</span>
              <input required type="datetime-local" {...field('starts_at')} />
            </label>
            <label>
              <span>Show until (empty = no end)</span>
              <input type="datetime-local" min={form.starts_at || undefined} {...field('ends_at')} />
            </label>
            <label className="admin__check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>Switched on</span>
            </label>
          </div>

          <AdminPhotos
            kind="announcements"
            itemId={editing === 'new' ? null : editing}
            photos={photos}
            onChange={photosChanged}
            pending={pending}
            onPendingChange={setPending}
          />

          {formError && (
            <p className="admin__error" role="alert">
              {formError}
            </p>
          )}
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

      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      {!list && !error && <p className="admin__muted">Loading…</p>}
      {list && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Photos</th>
                <th>Announcement</th>
                <th>Who sees it</th>
                <th>When</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const state = stateOf(a);
                return (
                  <tr key={a.id} className={editing === a.id ? 'is-editing' : ''}>
                    <td>
                      <button
                        type="button"
                        className="admin-thumb"
                        onClick={() => startEdit(a)}
                        aria-label={`Photos: ${a.photos.length} of ${MAX_PHOTOS}`}
                      >
                        {a.photos[0] ? <img src={mediaUrl(a.photos[0].file)} alt="" loading="lazy" /> : <span>No photo</span>}
                        <em>
                          {a.photos.length}/{MAX_PHOTOS}
                        </em>
                      </button>
                    </td>
                    <td>
                      <strong>{a.title_th || a.title}</strong>
                      {a.title && a.title_th && <div className="admin__muted">{a.title}</div>}
                    </td>
                    <td>{AUDIENCE_LABEL[a.audience]}</td>
                    <td className="admin__nowrap">
                      {fmtWhen(a.starts_at)}
                      <div className="admin__sub">→ {a.ends_at ? fmtWhen(a.ends_at) : 'no end'}</div>
                    </td>
                    <td>
                      <span className={`admin__status admin__status--${state.tone}`}>{state.label}</span>
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="admin__btn" onClick={() => toggle(a)}>
                        {a.active ? 'Switch off' : 'Switch on'}
                      </button>
                      <button type="button" className="admin__btn" onClick={() => startEdit(a)}>
                        Edit
                      </button>
                      <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(a)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="admin__empty">No announcements yet. The Home page shows none.</p>}
        </div>
      )}
    </>
  );
}
