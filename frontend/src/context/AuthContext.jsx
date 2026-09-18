import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// Wraps the app (see main.jsx) and holds the signed-in user in memory,
// rehydrated from localStorage on load so a page refresh doesn't log you
// out. Exposes { user, login, logout } to every descendant via useAuth().
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  // Persists the JWT + user returned by a successful login/register/Google
  // sign-in and updates state so the rest of the app re-renders as logged in.
  function login(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  }

  // Clears the stored session so the app reverts to the logged-out state.
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

// Hook for reading/updating auth state from any component; throws if used
// outside <AuthProvider> so misuse fails loudly instead of silently.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
