import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import { hasStoredLocale, useLocale } from './locale';

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

/** Adopt the account's registered language once, after authentication: on a
 *  fresh login/registration, and on a restored session. A language the user
 *  explicitly picked in this browser (localStorage) always wins — the account
 *  preference only fills the gap when no explicit choice exists. */
function useAccountLocalePreference(user: PublicUser | null, status: 'loading' | 'ready') {
  const { applyLocale } = useLocale();
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    const preference = user?.locale === 'AR' || user?.locale === 'EN' ? user.locale.toLowerCase() : null;
    if (!preference) return;
    // Re-apply only when the account (or its preference) actually changes, so
    // an in-session manual switch is never fought over on re-renders.
    const key = `${user?.id ?? ''}:${preference}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    if (hasStoredLocale()) return;
    applyLocale(preference === 'ar' ? 'ar' : 'en');
  }, [user, status, applyLocale]);
}

/** Single source of truth for "who is signed in". The session itself lives in
 *  an HttpOnly cookie; the context only mirrors what GET /api/auth/me returns.
 *  A failed session check simply renders the app as signed out — a stale or
 *  wiped session must never block the UI. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  useAccountLocalePreference(user, status);

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
