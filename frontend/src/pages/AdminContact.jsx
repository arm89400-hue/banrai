import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../lib/api';
import { setContact, formatThaiPhone } from '../lib/contact';
import { useLang } from '../i18n/lang';
import { ErrorNote, PageHead, PanelSkeleton } from '../components/AdminUI';

const EMPTY_PHONE = { name_th: '', name_en: '', number: '' };
const MAX_PHONES = 6;

export default function AdminContact() {
  const { t, lang } = useLang();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/api/settings/contact')
      .then((data) => {
        const c = data.contact ?? { phones: [EMPTY_PHONE], line: '', facebook: '', maps: '' };
        setForm({ ...c, phones: c.phones.map((p) => ({ ...p, number: p.number ? formatThaiPhone(p.number) : '' })) });
      })
      .catch((err) => setError(err.message));
  }, []);

  const head = <PageHead title={t('adm.tab.contact')} />;
  if (!form) {
    return (
      <>
        {head}
        {error ? <ErrorNote>{error}</ErrorNote> : <PanelSkeleton lines={6} />}
      </>
    );
  }

  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };
  const changePhone = (i, patch) => change({ phones: form.phones.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const typePhone = (i, input) => {
    const digitsBefore = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const next = formatThaiPhone(input.value);
    flushSync(() => changePhone(i, { number: next }));
    let pos = 0;
    for (let seen = 0; pos < next.length && seen < digitsBefore; pos++) if (/\d/.test(next[pos])) seen++;
    input.setSelectionRange(pos, pos);
  };

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await api('/api/admin/settings/contact', { method: 'PUT', body: JSON.stringify(form) });
      setForm(data.contact);
      setContact(data.contact);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const name = (p) => (lang === 'th' ? p.name_th || p.name_en : p.name_en || p.name_th);

  return (
    <>
      {head}
      <div className="adm-contact">
        <form className="adm-card adm-card--pad adm-contact__form" onSubmit={save}>
          <fieldset className="adm-fieldset">
            <legend>{t('adm.contact.phones')}</legend>
            {form.phones.map((p, i) => (
              <div className="adm-phone" key={i}>
                <label className="adm-field">
                  <span>{t('adm.contact.nameTh')}</span>
                  <input value={p.name_th} onChange={(e) => changePhone(i, { name_th: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>{t('adm.contact.nameEn')}</span>
                  <input value={p.name_en} onChange={(e) => changePhone(i, { name_en: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>{t('adm.contact.number')}</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="08x-xxx-xxxx"
                    maxLength={12}
                    value={p.number}
                    onChange={(e) => typePhone(i, e.target)}
                  />
                </label>
                <button
                  type="button"
                  className="adm-x"
                  disabled={form.phones.length === 1}
                  aria-label={t('adm.contact.remove')}
                  title={t('adm.contact.remove')}
                  onClick={() => change({ phones: form.phones.filter((_, j) => j !== i) })}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            {form.phones.length < MAX_PHONES && (
              <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" style={{ justifySelf: 'start' }} onClick={() => change({ phones: [...form.phones, EMPTY_PHONE] })}>
                {t('adm.contact.addPhone')}
              </button>
            )}
          </fieldset>

          <hr className="adm-divider" />

          <label className="adm-field">
            <span>
              {t('adm.contact.line')} <small>{t('adm.contact.lineHint')}</small>
            </span>
            <input value={form.line} onChange={(e) => change({ line: e.target.value })} />
          </label>
          <label className="adm-field">
            <span>{t('adm.contact.facebook')}</span>
            <input type="url" value={form.facebook} onChange={(e) => change({ facebook: e.target.value })} placeholder="https://" />
          </label>
          <label className="adm-field">
            <span>{t('adm.contact.maps')}</span>
            <input type="url" value={form.maps} onChange={(e) => change({ maps: e.target.value })} placeholder="https://" />
          </label>

          <ErrorNote>{error}</ErrorNote>
          <div className="adm-form__acts">
            <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
              {saving ? t('adm.contact.saving') : t('adm.contact.save')}
            </button>
            {saved && <span className="adm-saved">✓ {t('adm.contact.saved')}</span>}
          </div>
        </form>

        <div className="adm-contact__preview">
          <p className="adm-preview-label">{t('adm.contact.preview')}</p>
          <div className="adm-foot-preview">
            <b>{t('adm.contact.previewHeading')}</b>
            {form.phones
              .filter((p) => p.number)
              .map((p, i) => (
                <span key={i}>
                  {p.number} <small>{name(p)}</small>
                </span>
              ))}
            {form.line && (
              <span>
                LINE <small>{form.line}</small>
              </span>
            )}
            <span className="adm-foot-preview__links">
              {form.facebook && <em>Facebook</em>}
              {form.maps && <em>Google Maps</em>}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
