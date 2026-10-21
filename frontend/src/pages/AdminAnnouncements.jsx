import { useCallback, useEffect, useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { useLang } from '../i18n/lang';
import Pager, { usePaged } from '../components/Pager';
import DateField from '../components/DateField';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';

const AUDIENCES = ['home', 'booked', 'both'];

const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const fmtWhen = (iso, locale) =>
  new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

function stateOf(a) {
  const now = Date.now();
  if (!a.active) return ['adm.ann.state.off', 'neutral'];
  if (a.ends_at && new Date(a.ends_at) <= now) return ['adm.ann.state.ended', 'cancelled'];
  if (new Date(a.starts_at) > now) return ['adm.ann.state.scheduled', 'pending'];
  return ['adm.ann.state.showing', 'confirmed'];
}

export default function AdminAnnouncements() {
  const { t, lang, locale } = useLang();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState([]);
  const [pending, setPending] = useState([]);
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
        const id = data.announcement.id;
        setEditing(id);
        setForm(formFor(data.announcement));
        setPending([]);
        try {
          setPhotos(await uploadPending('announcements', id, pending));
          setSavedNote(pending.length ? t('adm.list.savedPhotos', { n: pending.length }) : t('adm.list.saved'));
        } catch (err) {
          setPhotos(err.photos);
          setFormError(t('adm.list.savedSomePhotos', { error: err.message }));
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
    if (!window.confirm(t('adm.ann.askDelete', { title: a.title_th || a.title }))) return;
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

  const pick = (en, th) => (lang === 'th' ? th || en : en || th);
  const previewPhoto = photos[0] ? mediaUrl(photos[0].file) : pending[0]?.url;
  const previewTitle = pick(form.title, form.title_th);
  const previewBody = pick(form.body, form.body_th);
  const previewUntil = form.ends_at && new Date(form.ends_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const paged = usePaged(list ?? [], 8, '');
  return (
    <>
      <div className="admin__toolbar admin__toolbar--end">
        <button type="button" className="admin__btn admin__btn--primary adm-btn-lg" onClick={() => startEdit(null)}>
          {t('adm.ann.add')}
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? t('adm.ann.new') : t('adm.ann.edit')}</h2>
          {savedNote && <p className="admin__notice">{savedNote}</p>}
          <div className="admin__form-grid">
            <label>
              <span>{t('adm.ann.titleTh')}</span>
              <input lang="th" maxLength={120} placeholder="ปิดปรับปรุงสระว่ายน้ำ" {...field('title_th')} />
            </label>
            <label>
              <span>{t('adm.ann.titleEn')}</span>
              <input maxLength={120} placeholder="Pool closed for cleaning" {...field('title')} />
            </label>
            <label className="admin__form-wide">
              <span>{t('adm.ann.bodyTh')}</span>
              <textarea lang="th" rows={3} maxLength={2000} {...field('body_th')} />
            </label>
            <label className="admin__form-wide">
              <span>{t('adm.ann.bodyEn')}</span>
              <textarea rows={3} maxLength={2000} {...field('body')} />
            </label>

            <div className="admin__form-wide admin-ann__who">
              <span className="admin-ann__label" id="ann-who">
                {t('adm.ann.who')}
              </span>
              <div className="admin__segmented" role="group" aria-labelledby="ann-who">
                {AUDIENCES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={form.audience === id}
                    className={form.audience === id ? 'is-active' : ''}
                    onClick={() => setForm({ ...form, audience: id })}
                  >
                    {t(`adm.ann.aud.${id}`)}
                  </button>
                ))}
              </div>
              <p className="admin__muted admin-ann__hint">{t(`adm.ann.hint.${form.audience}`)}</p>
            </div>

            <label>
              <span>{t('adm.ann.from')}</span>
              <DateField withTime required value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
            </label>
            <label>
              <span>{t('adm.ann.until')}</span>
              <DateField withTime clearable emptyLabel={t('adm.ann.noEnd')} min={form.starts_at} value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} />
            </label>
            <label className="admin__check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>{t('adm.ann.on')}</span>
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

          {previewTitle && (
            <div className="adm-ann-preview">
              <p className="adm-preview-label">{t('adm.ann.preview')}</p>
              <article className={`adm-ann-card${previewPhoto ? '' : ' is-text'}`}>
                {previewPhoto && <img src={previewPhoto} alt="" />}
                <div>
                  <b>{previewTitle}</b>
                  {previewBody && <p>{previewBody}</p>}
                  {previewUntil && <span>{t('ann.until', { date: previewUntil })}</span>}
                </div>
              </article>
            </div>
          )}

          {formError && (
            <p className="admin__error" role="alert">
              {formError}
            </p>
          )}
          <div className="admin__form-actions">
            <button type="button" className="admin__btn adm-btn-lg" onClick={() => setEditing(null)}>
              {editing === 'new' ? t('adm.list.cancel') : t('adm.list.close')}
            </button>
            <button type="submit" className="admin__btn admin__btn--primary adm-btn-lg" disabled={saving}>
              {saving ? t('adm.contact.saving') : t('adm.contact.save')}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      {!list && !error && <p className="admin__muted">{t('adm.loading')}</p>}
      {list && (
        <>
        <div className="admin__table-wrap" ref={paged.boxRef} style={paged.boxStyle}>
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adm.list.photos')}</th>
                <th>{t('adm.ann.col')}</th>
                <th>{t('adm.ann.who')}</th>
                <th>{t('adm.log.when')}</th>
                <th>{t('adm.ann.status')}</th>
                <th aria-label={t('adm.list.actions')} />
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((a) => {
                const [state, tone] = stateOf(a);
                return (
                  <tr key={a.id} className={editing === a.id ? 'is-editing' : ''}>
                    <td>
                      <button
                        type="button"
                        className="admin-thumb"
                        onClick={() => startEdit(a)}
                        aria-label={t('adm.list.photosOf', { name: a.title_th || a.title, n: a.photos.length, max: MAX_PHOTOS })}
                      >
                        {a.photos[0] ? <img src={mediaUrl(a.photos[0].file)} alt="" loading="lazy" /> : <span>{t('adm.list.noPhoto')}</span>}
                        <em>
                          {a.photos.length}/{MAX_PHOTOS}
                        </em>
                      </button>
                    </td>
                    <td>
                      <strong>{a.title_th || a.title}</strong>
                      {a.title && a.title_th && <div className="admin__muted">{a.title}</div>}
                    </td>
                    <td>{t(`adm.ann.aud.${a.audience}`)}</td>
                    <td className="admin__nowrap">
                      {fmtWhen(a.starts_at, locale)}
                      <div className="admin__sub">→ {a.ends_at ? fmtWhen(a.ends_at, locale) : t('adm.ann.noEnd')}</div>
                    </td>
                    <td>
                      <span className={`admin__status admin__status--${tone}`}>{t(state)}</span>
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="admin__btn" onClick={() => toggle(a)}>
                        {a.active ? t('adm.ann.switchOff') : t('adm.ann.switchOn')}
                      </button>
                      <button type="button" className="admin__btn" onClick={() => startEdit(a)}>
                        {t('adm.list.editBtn')}
                      </button>
                      <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(a)}>
                        {t('adm.list.deleteBtn')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="admin__empty">{t('adm.ann.empty')}</p>}
        </div>
        <Pager {...paged.pager} />
        </>
      )}
    </>
  );
}
