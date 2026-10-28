import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import PasswordInput from '../components/PasswordInput';
import PhotoSlides from '../components/PhotoSlides';
import { LOGIN_SLIDES } from '../lib/photos';
import { homeFor } from './Login';

const MIN_PASSWORD = 8;
const RESEND_SECONDS = 60;

// Webmail for the common addresses, so "check your email" is one tap away.
const MAIL_APPS = [
  [/@(gmail|googlemail)\.com$/i, 'Gmail', 'https://mail.google.com/mail/u/0/#inbox'],
  [/@(outlook|hotmail|live|msn)\.[a-z.]+$/i, 'Outlook', 'https://outlook.live.com/mail/'],
  [/@yahoo\.[a-z.]+$/i, 'Yahoo Mail', 'https://mail.yahoo.com/'],
  [/@(icloud|me)\.com$/i, 'iCloud Mail', 'https://www.icloud.com/mail'],
];
const mailAppFor = (email) => MAIL_APPS.find(([re]) => re.test(email));

// Same photo background and card as the login page.
function AuthShell({ children, back = true }) {
  const { t } = useLang();
  return (
    <section className="auth-screen">
      <PhotoSlides photos={LOGIN_SLIDES} />
      <div className="page auth-page">
        <div className="auth-card">
          {children}
          {back && (
            <Link to="/login" className="link-button">
              {t('forgot.back')}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function Envelope() {
  return (
    <svg className="auth-mail" viewBox="0 0 64 48" width="64" height="48" aria-hidden="true">
      <rect x="3" y="5" width="58" height="38" rx="5" />
      <path d="M5 8l27 20L59 8" />
    </svg>
  );
}

// "Forgot password?": asks for the email and sends a one-time link.
export function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [sentTo, setSentTo] = useState(null);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { lang, t } = useLang();

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(e) {
    e?.preventDefault();
    if (busy || wait > 0) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: email.trim(), lang }) });
      setSentTo(email.trim());
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(t(err.reason === 'BAD_EMAIL' ? 'login.errBadEmail' : 'login.errGeneric'));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    const app = mailAppFor(sentTo);
    return (
      <AuthShell>
        <div className="auth-sent">
          <Envelope />
          <h1>{t('forgot.sentTitle')}</h1>
          <p className="auth-card__note">
            {t('forgot.sentTo')} <b className="auth-sent__to">{sentTo}</b>
          </p>
          <p className="auth-card__note auth-card__note--quiet">{t('forgot.sentNote')}</p>
          {app && (
            <a className="auth-card__go" href={app[2]} target="_blank" rel="noopener noreferrer">
              {t('forgot.openMail', { app: app[1] })}
            </a>
          )}
          <div className="auth-sent__more">
            <span>{t('forgot.noMail')}</span>
            <button type="button" className="link-button" onClick={() => send()} disabled={busy || wait > 0}>
              {wait > 0 ? t('forgot.againIn', { s: wait }) : t('forgot.again')}
            </button>
            <button type="button" className="link-button" onClick={() => setSentTo(null)}>
              {t('forgot.otherEmail')}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{t('forgot.title')}</h1>
      <form onSubmit={send}>
        <label className="auth-field">
          <span>{t('forgot.email')}</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <button type="submit" disabled={busy}>
          {t('forgot.send')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </AuthShell>
  );
}

// Eight short marks fill in as the password grows, so "at least 8" is
// something you can see rather than a rule you read.
function LengthMarks({ length }) {
  const { t } = useLang();
  const done = length >= MIN_PASSWORD;
  return (
    <span className={`auth-marks${done ? ' is-done' : ''}`}>
      <span className="auth-marks__bar" aria-hidden="true">
        {Array.from({ length: MIN_PASSWORD }, (_, i) => (
          <i key={i} className={i < length ? 'is-on' : undefined} />
        ))}
      </span>
      <span className="auth-marks__say" aria-live="polite">
        {done ? `✓ ${t('reset.ok')}` : t('reset.left', { n: MIN_PASSWORD - length })}
      </span>
    </span>
  );
}

// The page the emailed link opens: choose a new password, then you're in.
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState(token ? 'checking' : 'bad');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    api(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        setEmail(data.email);
        setState('ready');
      })
      .catch(() => !cancelled && setState('bad'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(t('reset.short', { n: MIN_PASSWORD }));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
      login(data.token, data.user);
      navigate(homeFor(data.user), { replace: true });
    } catch (err) {
      if (err.reason === 'BAD_TOKEN') setState('bad');
      else setError(t(err.reason === 'WEAK_PASSWORD' ? 'reset.short' : 'login.errGeneric', { n: MIN_PASSWORD }));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') {
    return (
      <AuthShell>
        <h1>{t('reset.title')}</h1>
      </AuthShell>
    );
  }

  if (state === 'bad') {
    return (
      <AuthShell>
        <h1>{t('reset.badTitle')}</h1>
        <p className="auth-card__note">{t('reset.bad')}</p>
        <Link to="/forgot-password" className="auth-card__go">
          {t('reset.newLink')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{t('reset.title')}</h1>
      <p className="auth-who">{email}</p>
      <form onSubmit={save}>
        <label className="auth-field">
          <span>{t('reset.password')}</span>
          <PasswordInput
            label={t('login.holdToShow')}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            required
            autoFocus
          />
          <LengthMarks length={password.length} />
        </label>
        <button type="submit" disabled={busy}>
          {t('reset.save')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </AuthShell>
  );
}
