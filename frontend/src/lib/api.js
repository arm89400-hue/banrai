const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Thin fetch wrapper shared by every page: prefixes the backend base URL,
// attaches the stored JWT (if any) as a Bearer token, parses the JSON
// response, and throws an Error with the server's message on non-2xx
// responses so callers can just try/catch instead of checking res.ok.
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
    // Machine-readable cause (e.g. 'ROOM_TAKEN') when the server sends one,
    // so pages can show their own translated message.
    error.reason = data?.reason;
    error.status = res.status;
    // A signed-in account that has expired (a room account after its
    // check-out): end the session and explain on the login page.
    if (token && data?.reason === 'ACCOUNT_EXPIRED') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.assign('/login?expired=1');
    }
    throw error;
  }
  return data;
}
