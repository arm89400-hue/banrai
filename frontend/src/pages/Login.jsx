import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Combined login/register page, plus "Login with Google". Redirects away
// if already signed in.
export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

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
        navigate('/booking');
      } catch (err) {
        setError(err.message);
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
      });
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (user) {
    return <Navigate to="/booking" replace />;
  }

  // Stand-in for the real Google button when no Client ID is configured -
  // looks the same but just explains it isn't wired up yet.
  function handleGoogleClickPlaceholder() {
    setError('Google sign-in is coming soon.');
  }

  // Handles both modes: in "register" mode it creates the account first,
  // then either way logs in and redirects to the bookings page.
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
      navigate('/booking');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page auth-page">
      <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>

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
          Login with Google
        </button>
      )}

      <div className="auth-divider">
        <span>OR</span>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <button type="submit" disabled={submitting}>
          {mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
      </button>
    </section>
  );
}
