import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roomNames } from '../lib/booking';
import { useLang } from '../i18n/lang';
import DateField from '../components/DateField';

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
  const [promotions, setPromotions] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
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

  async function toggle(p) {
    try {
      await api(`/api/admin/promotions/${p.id}`, { method: 'PUT', body: JSON.stringify({ ...p, active: !p.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(p) {
    if (!window.confirm(t('adm.promo.askDelete', { name: p.name }))) return;
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
        <p className="admin__muted">{t('adm.promo.lead')}</p>
        <button type="button" className="admin__btn admin__btn--primary adm-btn-lg" onClick={() => startEdit(null)}>
          {t('adm.promo.add')}
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? t('adm.promo.new') : t('adm.promo.edit')}</h2>
          <div className="admin__form-grid">
            <label>
              <span>{t('adm.promo.name')}</span>
              <input required maxLength={80} placeholder={t('adm.promo.namePh')} {...field('name')} />
            </label>
            <label>
              <span>{t('adm.promo.percent')}</span>
              <input required type="number" min="1" max="100" step="0.5" {...field('percent')} />
            </label>
            <label>
              <span>{t('adm.promo.first')}</span>
              <DateField required value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v })} />
            </label>
            <label>
              <span>{t('adm.promo.last')}</span>
              <DateField required min={form.starts_on} value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} />
            </label>
            <label>
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
            <label className="admin__check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>{t('adm.ann.on')}</span>
            </label>
          </div>
          {formError && <p className="admin__error" role="alert">{formError}</p>}
          <div className="admin__form-actions">
            <button type="button" className="admin__btn adm-btn-lg" onClick={() => setEditing(null)}>
              {t('adm.list.cancel')}
            </button>
            <button type="submit" className="admin__btn admin__btn--primary adm-btn-lg" disabled={saving}>
              {saving ? t('adm.contact.saving') : t('adm.contact.save')}
            </button>
          </div>
        </form>
      )}

      {error && <p className="admin__error" role="alert">{error}</p>}
      {!promotions && !error && <p className="admin__muted">{t('adm.loading')}</p>}
      {promotions && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adm.promo.col')}</th>
                <th>{t('adm.promo.discount')}</th>
                <th>{t('adm.promo.dates')}</th>
                <th>{t('adm.panel.room')}</th>
                <th>{t('adm.ann.status')}</th>
                <th aria-label={t('adm.list.actions')} />
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => {
                const [state, tone] = promoState(p);
                return (
                  <tr key={p.id} className={editing === p.id ? 'is-editing' : ''}>
                    <td><strong>{p.name}</strong></td>
                    <td>{t('adm.logd.percentOff', { n: p.percent })}</td>
                    <td className="admin__nowrap">
                      {fmtDay(p.starts_on, locale)}
                      <div className="admin__sub">→ {fmtDay(p.ends_on, locale)}</div>
                    </td>
                    <td>{p.room_name ? roomNames(p.room_name, lang).title : t('adm.promo.allRooms')}</td>
                    <td>
                      <span className={`admin__status admin__status--${tone}`}>{t(state)}</span>
                    </td>
                    <td className="admin__actions">
                      <button type="button" className="admin__btn" onClick={() => toggle(p)}>
                        {p.active ? t('adm.ann.switchOff') : t('adm.ann.switchOn')}
                      </button>
                      <button type="button" className="admin__btn" onClick={() => startEdit(p)}>
                        {t('adm.list.editBtn')}
                      </button>
                      <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(p)}>
                        {t('adm.list.deleteBtn')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {promotions.length === 0 && <p className="admin__empty">{t('adm.promo.empty')}</p>}
        </div>
      )}
    </>
  );
}
