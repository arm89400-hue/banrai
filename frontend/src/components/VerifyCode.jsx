import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mailAppFor } from '../lib/email';
import { useLang } from '../i18n/lang';

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
const ERROR_KEYS = { BAD_CODE: 'verify.errBad', CODE_EXPIRED: 'verify.errExpired' };

// After an email sign-up: type back the 6-digit code that was emailed. A
// made-up address never gets the code, so it never gets in.
export default function VerifyCode({ email, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { lang, t } = useLang();
  const app = mailAppFor(email);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function confirm(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
      onVerified(data);
    } catch (err) {
      setError(t(ERROR_KEYS[err.reason] ?? 'login.errGeneric'));
      setBusy(false);
    }
  }

  function sendAgain() {
    setError(null);
    setCode('');
    setWait(RESEND_SECONDS);
    api('/api/auth/verify/resend', { method: 'POST', body: JSON.stringify({ email, lang }) }).catch(() => {});
  }

  return (
    <>
      <h1>{t('verify.title')}</h1>
      <p className="auth-card__note">{t('verify.sent')}</p>
      <p className="auth-who">{email}</p>
      <form onSubmit={confirm}>
        <label className="auth-field">
          <span>{t('verify.code')}</span>
          <input
            className="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replaceAll(/\D/g, '').slice(0, CODE_LENGTH));
              setError(null);
            }}
            required
          />
        </label>
        <button type="submit" disabled={busy || code.length !== CODE_LENGTH}>
          {t('verify.submit')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <div className="auth-sent__more">
        <button type="button" className="link-button" onClick={sendAgain} disabled={wait > 0}>
          {wait > 0 ? t('forgot.againIn', { s: wait }) : t('forgot.again')}
        </button>
        {app && (
          <a className="link-button" href={app[2]} target="_blank" rel="noopener noreferrer">
            {t('forgot.openMail', { app: app[1] })}
          </a>
        )}
        <button type="button" className="link-button" onClick={onBack}>
          {t('verify.otherEmail')}
        </button>
      </div>
      <p className="auth-card__note auth-card__note--quiet">{t('verify.spam')}</p>
    </>
  );
}
