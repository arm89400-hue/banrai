import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatStay, isISODate, roomNames } from '../lib/booking';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import PasswordInput from '../components/PasswordInput';
import PhotoSlides from '../components/PhotoSlides';
import { LOGIN_SLIDES, roomCover } from '../lib/photos';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function homeFor(user, next) {
  if (user?.is_admin) return '/admin';
  if (user?.is_stay) return '/stay';
  return next || '/stay';
}

const ERROR_KEYS = {
  BAD_CREDENTIALS: 'login.errBad',
  ACCOUNT_EXPIRED: 'login.errExpired',
  EMAIL_TAKEN: 'login.errEmailTaken',
  BAD_EMAIL: 'login.errBadEmail',
};

export default function Login() {
  const [params] = useSearchParams();
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
  const booking = Boolean(next?.startsWith('/book'));
  const [mode, setMode] = useState(booking ? 'register' : 'login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  // The Google button only counts once Google has drawn it; until then the
  // "or" line would sit above nothing.
  const [googleShown, setGoogleShown] = useState(!GOOGLE_CLIENT_ID);

  const expired = params.get('expired') === '1';
  const sessionEnded = params.get('session') === '1';

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || user) return;

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
        width: Math.min(320, googleButtonRef.current.offsetWidth || 320),
        locale: lang,
      });
      setGoogleShown(true);
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  if (user) {
    return <Navigate to={homeFor(user, next)} replace />;
  }

  function handleGoogleClickPlaceholder() {
    setError(t('login.googleSoon'));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'register') {
        try {
          await api('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
        } catch (err) {
          // Returning guests often pick "new customer". If the email is
          // already theirs, just try signing in with what they typed.
          if (err.reason !== 'EMAIL_TAKEN') throw err;
          try {
            const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
            login(data.token, data.user);
            navigate(homeFor(data.user, next));
            return;
          } catch {
            setMode('login');
            setForm((f) => ({ ...f, password: '' }));
            setError(t('login.errEmailTakenTryOld'));
            return;
          }
        }
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
    <section className="auth-screen">
      <PhotoSlides photos={LOGIN_SLIDES} />
      <div className="page auth-page">
        {booking && <BookingInProgress next={next} />}
        <div className="auth-card">
          <img className="auth-logo" src="/images/logo.png" alt="Baanrai 344" />
          {booking ? (
            <>
              <h1>{t('login.bookTitle')}</h1>
              <div className="auth-tabs">
                <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>
                  {t('login.tabNew')}
                </button>
                <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
                  {t('login.tabHave')}
                </button>
              </div>
            </>
          ) : (
            <h1>{mode === 'login' ? t('login.title') : t('login.createTitle')}</h1>
          )}
          {expired && !error && <p role="alert">{t('login.errExpired')}</p>}
          {sessionEnded && !error && <p role="alert">{t('login.sessionEnded')}</p>}

          {GOOGLE_CLIENT_ID ? (
            <div ref={googleButtonRef} className="google-button" hidden={!googleShown} />
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

          {googleShown && (
            <div className="auth-divider">
              <span>{t('login.or')}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>{mode === 'register' ? t('login.email') : t('login.idPlaceholder')}</span>
              <input
                type={mode === 'register' ? 'email' : 'text'}
                autoComplete="username"
                placeholder={mode === 'register' ? 'name@email.com' : undefined}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label className="auth-field">
              <span>{mode === 'register' ? t('login.newPassword') : t('login.password')}</span>
              <PasswordInput
                label={t('login.holdToShow')}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            {mode === 'login' && (
              <Link
                to={`/forgot-password${form.email.includes('@') ? `?email=${encodeURIComponent(form.email.trim())}` : ''}`}
                className="auth-forgot"
              >
                {t('login.forgot')}
              </Link>
            )}
            <button type="submit" disabled={submitting}>
              {booking
                ? t(mode === 'login' ? 'login.loginAndBook' : 'login.signupAndBook')
                : t(mode === 'login' ? 'login.submit' : 'login.signup')}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
          {!booking && (
            <button
              type="button"
              className="link-button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? t('login.needAccount') : t('login.haveAccount')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function BookingInProgress({ next }) {
  const { lang, locale, t } = useLang();
  const [rooms, setRooms] = useState([]);
  useEffect(() => {
    api('/api/rooms')
      .then((data) => setRooms(data.rooms))
      .catch(() => {});
  }, []);

  const query = new URLSearchParams(next.split('?')[1] ?? '');
  const checkIn = query.get('in');
  const checkOut = query.get('out');
  const chosen = (query.get('rooms') ?? '')
    .split(',')
    .map((id) => rooms.find((r) => r.id === Number(id)))
    .filter(Boolean);
  const back = new URLSearchParams(query);
  back.set('step', '1');

  return (
    <div className="auth-booking">
      <Link to={`/book?${back}`} className="auth-booking__back">
        ‹ {t('login.backToBooking')}
      </Link>
      {chosen.length > 0 && isISODate(checkIn) && isISODate(checkOut) && (
        <div className="auth-booking__stay">
          <img src={roomCover(chosen[0])} alt="" />
          <span>
            <strong>{chosen.map((r) => roomNames(r.name, lang).title).join(' + ')}</strong>
            <small>
              {formatStay(checkIn, checkOut, locale, t('date.wd'))} · {t('sum.guestCount', { n: query.get('guests') ?? 2 })}
            </small>
          </span>
        </div>
      )}
    </div>
  );
}
