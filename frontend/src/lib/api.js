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
    throw new Error(data?.error ?? `Request failed with ${res.status}`);
  }
  return data;
}
