import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roomNames } from '../lib/booking';
import { useLang } from '../i18n/lang';
import Pager, { usePaged } from '../components/Pager';
import DateField from '../components/DateField';
import { Drawer, Empty, ErrorNote, PageHead, Pill, RowsSkeleton, useConfirm } from '../components/AdminUI';

const EMPTY_FORM = { name: '', percent: '', starts_on: '', ends_on: '', room_id: '', active: true };

const fmtDay = (key, locale) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function promoState(p) {
  if (!p.active) return ['adm.promo.state.off', 'neutral'];
  const today = todayKey();
  if (p.ends_on < today) return ['adm.promo.state.finished', 'cancelled'];
  if (p.starts_on > today) return ['adm.promo.state.upcoming', 'pending'];
  return ['adm.promo.state.running', 'confirmed'];
}

export default function AdminPromotions() {
  const { t, lang, locale } = useLang();
  const confirm = useConfirm();
  const [promotions, setPromotions] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [base, setBase] = useState(EMPTY_FORM);
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
    const start = (
      p
        ? {
            name: p.name,
            percent: String(Number(p.percent)),
            starts_on: p.starts_on,
            ends_on: p.ends_on,
            room_id: p.room_id ?? '',
            active: p.active,
          }
        : EMPTY_FORM
    );
    setForm(start);
    setBase(start);
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

  async function toggle(p) {
    try {
      await api(`/api/admin/promotions/${p.id}`, { method: 'PUT', body: JSON.stringify({ ...p, active: !p.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(p) {
    if (!(await confirm({ title: t('adm.promo.askDelete', { name: p.name }), ok: t('adm.list.deleteBtn'), danger: true }))) return;
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

  const paged = usePaged(promotions ?? [], 8, '');
  return (
    <>
      <PageHead title={t('adm.tab.promotions')} lead={t('adm.promo.lead')}>
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => startEdit(null)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('adm.promo.add').replace(/^\+\s*/, '')}
        </button>
      </PageHead>
      <ErrorNote>{error}</ErrorNote>

      <div className="adm-card" ref={paged.boxRef} style={paged.boxStyle}>
        {!promotions ? (
          <RowsSkeleton rows={3} />
        ) : promotions.length === 0 ? (
          <Empty title={t('adm.promo.empty')} hint={t('adm.promo.emptyHint')}>
            <button type="button" className="adm-btn" onClick={() => startEdit(null)}>
              {t('adm.promo.add')}
            </button>
          </Empty>
        ) : (
          <div className="adm-rows">
            {paged.rows.map((p) => {
              const [state, tone] = promoState(p);
              return (
                <div key={p.id} className={`adm-row is-click${editing === p.id ? ' is-sel' : ''}`} onClick={() => startEdit(p)}>
                  <span className="adm-promo-off num">−{Number(p.percent)}%</span>
                  <div className="adm-row__main">
                    <b>{p.name}</b>
                    <span className="num">
                      {fmtDay(p.starts_on, locale)} → {fmtDay(p.ends_on, locale)} ·{' '}
                      {p.room_name ? roomNames(p.room_name, lang).title : t('adm.promo.allRooms')}
                    </span>
                  </div>
                  <div className="adm-row__meta">
                    <Pill tone={tone}>{t(state)}</Pill>
                  </div>
                  <div className="adm-row__acts" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => toggle(p)}>
                      {p.active ? t('adm.ann.switchOff') : t('adm.ann.switchOn')}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost abk-del" onClick={() => remove(p)}>
                      {t('adm.list.deleteBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {promotions && <Pager {...paged.pager} />}

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? t('adm.promo.new') : t('adm.promo.edit')}
          onClose={() => setEditing(null)}
          dirty={JSON.stringify(form) !== JSON.stringify(base)}
          onSubmit={save}
          footer={(close) => (
            <>
              <button type="button" className="adm-btn" onClick={close}>
                {t('adm.list.cancel')}
              </button>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
                {saving ? t('adm.contact.saving') : t('adm.contact.save')}
              </button>
            </>
          )}
        >
          <div className="adm-fields">
            <label className="adm-field adm-field--wide">
              <span>{t('adm.promo.name')}</span>
              <input required maxLength={80} placeholder={t('adm.promo.namePh')} {...field('name')} />
            </label>
            <label className="adm-field">
              <span>{t('adm.promo.percent')}</span>
              <input required type="number" inputMode="decimal" min="1" max="100" step="0.5" {...field('percent')} />
            </label>
            <label className="adm-field">
              <span>{t('adm.panel.room')}</span>
              <select {...field('room_id')}>
                <option value="">{t('adm.promo.allRooms')}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roomNames(r.name, lang).title}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span>{t('adm.promo.first')}</span>
              <DateField required value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v })} />
            </label>
            <label className="adm-field">
              <span>{t('adm.promo.last')}</span>
              <DateField required min={form.starts_on} value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} />
            </label>
            <label className="adm-check adm-field--wide">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>{t('adm.ann.on')}</span>
            </label>
          </div>
          <ErrorNote>{formError}</ErrorNote>
        </Drawer>
      )}
    </>
  );
}
