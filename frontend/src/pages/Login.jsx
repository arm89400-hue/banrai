import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import PasswordInput from '../components/PasswordInput';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Where to land after signing in: admins go to their dashboard, room
// accounts to their room dashboard, and everyone else back to where they
// were heading (`next`, e.g. the booking they were in the middle of) or to
// their bookings.
function homeFor(user, next) {
  if (user?.is_admin) return '/admin';
  if (user?.is_stay) return '/stay';
  return next || '/booking';
}

// Server `reason` codes -> translated messages.
const ERROR_KEYS = {
  BAD_CREDENTIALS: 'login.errBad',
  ACCOUNT_EXPIRED: 'login.errExpired',
  EMAIL_TAKEN: 'login.errEmailTaken',
  BAD_EMAIL: 'login.errBadEmail',
};

// Combined login/register page, plus "Login with Google". Members sign in
// with their email; a room account signs in with the username generated
// for its booking. Redirects away if already signed in.
export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const googleButtonRef = useRef(null);

  // Only same-site paths are accepted as a return target.
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
  const expired = params.get('expired') === '1';

  // Renders Google's real "Sign in with Google" button once the GIS script
  // and a Client ID are both available, and wires its callback to our
  // backend. No-ops entirely (and the placeholder button renders instead -
  // see below) when VITE_GOOGLE_CLIENT_ID isn't configured.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || user) return;

    // Exchanges the Google ID token for our own JWT via the backend, then
    // logs the user in the same way the email/password form does.
    async function handleCredential(response) {
      setError(null);
      try {
        const data = await api('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential: response.credential }),
        });
        login(data.token, data.user);
        navigate(homeFor(data.user, next));
      } catch (err) {
        setError(t(ERROR_KEYS[err.reason] ?? 'login.errGeneric'));
      }
    }

    // The Google script loads with async/defer, so it may not be on
    // window yet when this effect first runs - poll briefly until it is.
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
      clearInterval(interval);

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        locale: lang,
      });
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (user) {
    return <Navigate to={homeFor(user, next)} replace />;
  }

  // Stand-in for the real Google button when no Client ID is configured -
  // looks the same but just explains it isn't wired up yet.
  function handleGoogleClickPlaceholder() {
    setError(t('login.googleSoon'));
  }

  // Handles both modes: in "register" mode it creates the account first,
  // then either way logs in and redirects (see homeFor above).
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
      }
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      login(data.token, data.user);
      navigate(homeFor(data.user, next));
    } catch (err) {
      setError(t(ERROR_KEYS[err.reason] ?? 'login.errGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page auth-page">
      <h1>{mode === 'login' ? t('login.title') : t('login.createTitle')}</h1>
      {next?.startsWith('/book') && <p className="auth-page__lead">{t('login.toBook')}</p>}
      {expired && !error && <p role="alert">{t('login.errExpired')}</p>}

      {GOOGLE_CLIENT_ID ? (
        <div ref={googleButtonRef} className="google-button" />
      ) : (
        <button
          type="button"
          className="google-button google-button--placeholder"
          onClick={handleGoogleClickPlaceholder}
        >
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
          </svg>
          {t('login.google')}
        </button>
      )}

      <div className="auth-divider">
        <span>{t('login.or')}</span>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          // Text, not email: a room account's username isn't an email address.
          type={mode === 'register' ? 'email' : 'text'}
          autoComplete="username"
          placeholder={mode === 'register' ? t('login.email') : t('login.idPlaceholder')}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <PasswordInput
          label={t('login.holdToShow')}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          placeholder={t('login.password')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <button type="submit" disabled={submitting}>
          {mode === 'login' ? t('login.submit') : t('login.signup')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? t('login.needAccount') : t('login.haveAccount')}
      </button>
    </section>
  );
}
