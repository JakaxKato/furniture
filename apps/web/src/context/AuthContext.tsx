import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';

type AuthResponse = { user: User | null; csrfToken: string; mfaVerified: boolean };

type AuthContextValue = {
  user: User | null;
  mfaVerified: boolean;
  loading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const apply = (data: AuthResponse) => {
    setUser(data.user);
    setMfaVerified(Boolean(data.mfaVerified));
  };

  const refresh = useCallback(async () => {
    const data = await api.get<AuthResponse>('/auth/me');
    apply(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthResponse>('/auth/me')
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, totp?: string) => {
    const data = await api.post<AuthResponse>('/auth/login', {
      email,
      password,
      ...(totp ? { totp } : {}),
    });
    apply(data);
    return data.user!;
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const data = await api.post<AuthResponse>('/auth/register', input);
      apply(data);
      return data.user!;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setMfaVerified(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, mfaVerified, loading, login, register, logout, refresh }),
    [user, mfaVerified, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth harus dipakai di dalam AuthProvider.');
  return value;
}

export function isAdmin(user: User | null): boolean {
  return Boolean(user && user.role !== 'customer');
}
