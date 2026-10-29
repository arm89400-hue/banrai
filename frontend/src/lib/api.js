const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const mediaUrl = (file) => (file?.startsWith('/uploads/') ? `${API_BASE}${file}` : file);

export async function api(path, options = {}) {
  const token = localStorage.getItem('token');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error ?? `Request failed with ${res.status}`);
    error.reason = data?.reason;
    error.status = res.status;
    if (token && data?.reason === 'ACCOUNT_EXPIRED') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.assign('/login?expired=1');
    }
    if (token && data?.reason === 'SESSION_ENDED') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const here = window.location.pathname + window.location.search;
      window.location.assign(`/login?session=1&next=${encodeURIComponent(here)}`);
    }
    throw error;
  }
  return data;
}
