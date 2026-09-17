import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from './api';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  locale: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  /** 'loading' until the existing session (if any) has been checked once. */
  status: 'loading' | 'ready';
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; locale: 'EN' | 'AR' }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Single source of truth for "who is signed in". The session itself lives in
 *  an HttpOnly cookie; the context only mirrors what GET /api/auth/me returns.
 *  A failed session check simply renders the app as signed out — a stale or
 *  wiped session must never block the UI. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let active = true;
    apiFetch<{ user: PublicUser }>('/api/auth/me')
      .then((data) => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setStatus('ready'); });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    login: async (email, password) => {
      const data = await apiFetch<{ user: PublicUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
    },
    register: async (input) => {
      const data = await apiFetch<{ user: PublicUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setUser(data.user);
    },
    logout: async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
