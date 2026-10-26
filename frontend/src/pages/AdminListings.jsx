import { useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { roomNames } from '../lib/booking';
import { useAdminData } from '../lib/adminData';
import { uploadPending } from '../lib/uploadPending';
import { useLang } from '../i18n/lang';
import { Drawer, Empty, ErrorNote, PageHead, RowsSkeleton, useConfirm } from '../components/AdminUI';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';

const CONFIG = {
  rooms: { listPath: '/api/rooms', listKey: 'rooms', roomFields: true },
  activities: { listPath: '/api/activities', listKey: 'activities', roomFields: false },
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

// Prices come back as "1800.00"; show them the way the owner types them.
const plainNumber = (v) => (v === '' || v == null ? '' : String(Number(v)));

const formFor = (item) => {
  const form = Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, item[key] ?? EMPTY_FORM[key]]));
  return { ...form, price: plainNumber(form.price) };
};

export default function AdminListings({ kind }) {
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const cfg = CONFIG[kind];
  const k = (key, vars) => t(`adm.list.${kind}.${key}`, vars);
  const { data, error, reload } = useAdminData(cfg.listPath);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // What the form held when it opened, to know whether anything changed.
  const [base, setBase] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState([]);
  const [pending, setPending] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [listError, setListError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);

  function startEdit(item) {
    setEditing(item ? item.id : 'new');
    setFormError(null);
    setSavedNote(null);
    const start = item ? formFor(item) : EMPTY_FORM;
    setForm(start);
    setBase(start);
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
        const created = data.room ?? data.activity;
        setEditing(created.id);
        setForm(formFor(created));
        setBase(formFor(created));
        setPending([]);
        try {
          setPhotos(await uploadPending(kind, created.id, pending));
          setSavedNote(pending.length ? t('adm.list.savedPhotos', { n: pending.length }) : t('adm.list.saved'));
        } catch (err) {
          setPhotos(err.photos);
          setFormError(t('adm.list.savedSomePhotos', { error: err.message }));
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

  async function remove(item) {
    const ok = await confirm({ title: k('askDelete', { name: item.name }), ok: t('adm.list.deleteBtn'), danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/${kind}/${item.id}`, { method: 'DELETE' });
      if (editing === item.id) setEditing(null);
      reload();
    } catch (err) {
      setListError(err.message);
    }
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  const items = cfg.roomFields ? [...(data?.rooms ?? [])].sort((a, b) => b.price - a.price) : (data?.[cfg.listKey] ?? []);
  const nameParts = (item) => {
    if (item.name_th && item.name_th !== item.name) return lang === 'th' ? [item.name_th, item.name] : [item.name, item.name_th];
    const n = roomNames(item.name, lang);
    return [n.title, n.subtitle];
  };
  const editingItem = items.find((i) => i.id === editing);

  return (
    <>
      <PageHead title={t(`adm.tab.${kind}`)}>
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => startEdit(null)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {k('add').replace(/^\+\s*/, '')}
        </button>
      </PageHead>
      <ErrorNote>{error || listError}</ErrorNote>

      <div className="adm-card">
        {!data ? (
          <RowsSkeleton rows={5} thumb />
        ) : items.length === 0 ? (
          <Empty title={t('adm.list.empty')} />
        ) : (
          <div className="adm-rows">
            {items.map((item) => {
              const [title] = nameParts(item);
              const extra = cfg.roomFields && item.max_extra_guests > 0 ? ` ${t('adm.list.plusExtra', { n: item.max_extra_guests })}` : '';
              return (
                <div key={item.id} className={`adm-row is-click${editing === item.id ? ' is-sel' : ''}`} onClick={() => startEdit(item)}>
                  <span className="adm-row__thumb">
                    {item.photos?.[0] && <img src={mediaUrl(item.photos[0].file)} alt="" loading="lazy" />}
                    <em>
                      {item.photos?.length ?? 0}/{MAX_PHOTOS}
                    </em>
                  </span>
                  <div className="adm-row__main">
                    <b>{title}</b>
                  </div>
                  <div className="adm-row__meta">
                    <b className="num">
                      {Number(item.price) > 0 || cfg.roomFields ? formatBaht(item.price) : t('adm.list.free')}
                      {cfg.roomFields && <small className="adm-muted"> {t('adm.list.perNight')}</small>}
                    </b>
                    {cfg.roomFields && <span>{t('adm.list.sleeps', { n: item.capacity ?? '-' })}{extra}</span>}
                  </div>
                  <div className="adm-row__acts" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => startEdit(item)}>
                      {t('adm.list.editBtn')}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost abk-del" onClick={() => remove(item)}>
                      {t('adm.list.deleteBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing !== null && (
        <Drawer
          wide
          title={editing === 'new' ? k('new') : k('edit')}
          sub={editingItem ? nameParts(editingItem).filter(Boolean).join(' · ') : undefined}
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
          {cfg.roomFields ? (
            <div className="adm-fields">
              <label className="adm-field adm-field--wide">
                <span>{t('adm.list.rooms.name')}</span>
                <input required placeholder="Father's Room · ห้องพ่อ" {...field('name')} />
                <small className="adm-field__hint">{t('adm.list.rooms.nameHint')}</small>
              </label>
              <label className="adm-field">
                <span>{t('adm.list.rooms.price')}</span>
                <input required type="number" inputMode="decimal" min="0" step="1" {...field('price')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.rooms.capacity')}</span>
                <input type="number" min="1" {...field('capacity')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.rooms.extra')}</span>
                <input type="number" min="0" max="10" {...field('max_extra_guests')} />
              </label>
              <label className="adm-field adm-field--wide">
                <span>{t('adm.list.rooms.description')}</span>
                <textarea rows={3} {...field('description')} />
              </label>
            </div>
          ) : (
            <div className="adm-fields">
              <label className="adm-field">
                <span>{t('adm.list.activities.nameTh')}</span>
                <input lang="th" placeholder="เก็บผลไม้" {...field('name_th')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.activities.nameEn')}</span>
                <input placeholder="Fruit picking" {...field('name')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.activities.tagTh')}</span>
                <input lang="th" placeholder="ทุกเช้า" maxLength={60} {...field('tag_th')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.activities.tagEn')}</span>
                <input placeholder="Every morning" maxLength={60} {...field('tag')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.activities.price')}</span>
                <input type="number" inputMode="decimal" min="0" step="1" {...field('price')} />
              </label>
              <label className="adm-field">
                <span>{t('adm.list.activities.position')}</span>
                <input type="number" min="0" placeholder={t('adm.list.activities.last')} {...field('position')} />
              </label>
              <label className="adm-field adm-field--wide">
                <span>{t('adm.list.activities.descTh')}</span>
                <textarea lang="th" rows={2} {...field('description_th')} />
              </label>
              <label className="adm-field adm-field--wide">
                <span>{t('adm.list.activities.descEn')}</span>
                <textarea rows={2} {...field('description')} />
              </label>
            </div>
          )}
          <AdminPhotos
            kind={kind}
            itemId={editing === 'new' ? null : editing}
            photos={photos}
            onChange={(next) => {
              setPhotos(next);
              reload();
            }}
            pending={pending}
            onPendingChange={setPending}
          />
          <ErrorNote>{formError}</ErrorNote>
        </Drawer>
      )}
    </>
  );
}
