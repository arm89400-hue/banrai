import { useCallback, useEffect, useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { useLang } from '../i18n/lang';
import Pager, { usePaged } from '../components/Pager';
import DateField from '../components/DateField';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';
import { Drawer, Empty, ErrorNote, PageHead, Pill, RowsSkeleton, useConfirm, Seg } from '../components/AdminUI';

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
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [base, setBase] = useState(emptyForm);
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
    const start = a ? formFor(a) : emptyForm();
    setForm(start);
    setBase(start);
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
        setBase(formFor(data.announcement));
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
    if (!(await confirm({ title: t('adm.ann.askDelete', { title: a.title_th || a.title }), ok: t('adm.list.deleteBtn'), danger: true }))) return;
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
      <PageHead title={t('adm.tab.announcements')} lead={t('adm.page.announcements.lead')}>
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => startEdit(null)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('adm.ann.add').replace(/^\+\s*/, '')}
        </button>
      </PageHead>
      <ErrorNote>{error}</ErrorNote>

      <div className="adm-card" ref={paged.boxRef} style={paged.boxStyle}>
        {!list ? (
          <RowsSkeleton rows={3} thumb />
        ) : list.length === 0 ? (
          <Empty title={t('adm.ann.empty')} hint={t('adm.ann.emptyHint')}>
            <button type="button" className="adm-btn" onClick={() => startEdit(null)}>
              {t('adm.ann.add')}
            </button>
          </Empty>
        ) : (
          <div className="adm-rows">
            {paged.rows.map((a) => {
              const [state, tone] = stateOf(a);
              return (
                <div key={a.id} className={`adm-row is-click${editing === a.id ? ' is-sel' : ''}`} onClick={() => startEdit(a)}>
                  <span className="adm-row__thumb">
                    {a.photos[0] && <img src={mediaUrl(a.photos[0].file)} alt="" loading="lazy" />}
                    <em>
                      {a.photos.length}/{MAX_PHOTOS}
                    </em>
                  </span>
                  <div className="adm-row__main">
                    <b>{a.title_th || a.title}</b>
                    <span className="num">
                      {t(`adm.ann.aud.${a.audience}`)} · {fmtWhen(a.starts_at, locale)} → {a.ends_at ? fmtWhen(a.ends_at, locale) : t('adm.ann.noEnd')}
                    </span>
                  </div>
                  <div className="adm-row__meta">
                    <Pill tone={tone}>{t(state)}</Pill>
                  </div>
                  <div className="adm-row__acts" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => toggle(a)}>
                      {a.active ? t('adm.ann.switchOff') : t('adm.ann.switchOn')}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost abk-del" onClick={() => remove(a)}>
                      {t('adm.list.deleteBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {list && <Pager {...paged.pager} />}

      {editing !== null && (
        <Drawer
          wide
          title={editing === 'new' ? t('adm.ann.new') : t('adm.ann.edit')}
          onClose={() => setEditing(null)}
          dirty={JSON.stringify(form) !== JSON.stringify(base) || pending.length > 0}
          onSubmit={save}
          footer={(close) => (
            <>
              <button type="button" className="adm-btn" onClick={close}>
                {editing === 'new' ? t('adm.list.cancel') : t('adm.list.close')}
              </button>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
                {saving ? t('adm.contact.saving') : t('adm.contact.save')}
              </button>
            </>
          )}
        >
          {savedNote && <p className="adm-note">{savedNote}</p>}
          <div className="adm-fields">
            <label className="adm-field">
              <span>{t('adm.ann.titleTh')}</span>
              <input lang="th" maxLength={120} placeholder="ปิดปรับปรุงสระว่ายน้ำ" {...field('title_th')} />
            </label>
            <label className="adm-field">
              <span>{t('adm.ann.titleEn')}</span>
              <input maxLength={120} placeholder="Pool closed for cleaning" {...field('title')} />
            </label>
            <label className="adm-field adm-field--wide">
              <span>{t('adm.ann.bodyTh')}</span>
              <textarea lang="th" rows={3} maxLength={2000} {...field('body_th')} />
            </label>
            <label className="adm-field adm-field--wide">
              <span>{t('adm.ann.bodyEn')}</span>
              <textarea rows={3} maxLength={2000} {...field('body')} />
            </label>

            <div className="adm-field adm-field--wide">
              <span id="ann-who">{t('adm.ann.who')}</span>
              <Seg active={form.audience} role="group" aria-labelledby="ann-who">
                {AUDIENCES.map((id) => (
                  <button key={id} type="button" aria-pressed={form.audience === id} onClick={() => setForm({ ...form, audience: id })}>
                    {t(`adm.ann.aud.${id}`)}
                  </button>
                ))}
              </Seg>
              <small className="adm-field__hint">{t(`adm.ann.hint.${form.audience}`)}</small>
            </div>

            <label className="adm-field">
              <span>{t('adm.ann.from')}</span>
              <DateField withTime required value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
            </label>
            <label className="adm-field">
              <span>{t('adm.ann.until')}</span>
              <DateField withTime clearable emptyLabel={t('adm.ann.noEnd')} min={form.starts_at} value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} />
            </label>
            <label className="adm-check adm-field--wide">
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
            <div>
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
          <ErrorNote>{formError}</ErrorNote>
        </Drawer>
      )}
    </>
  );
}
