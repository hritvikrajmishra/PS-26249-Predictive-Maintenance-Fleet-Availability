import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi } from '../api/auth';
import { getStoredToken, setStoredToken } from '../api/client';
import type { UserOut, UserRole } from '../types/api';

interface AuthContextType {
  user: UserOut | null;
  role: UserRole | null;
  token: string | null;
  isLoading: boolean;
  asOfDate: string | null;
  setAsOfDate: (date: string | null) => void;
  login: (username: string, password: string) => Promise<void>;
  switchDemoRole: (role: UserRole) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_CREDENTIALS: Record<UserRole, { user: string; pass: string }> = {
  commander: { user: 'commander', pass: 'commander123' },
  planner: { user: 'planner', pass: 'planner123' },
  technician: { user: 'technician', pass: 'technician123' },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<UserOut | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);

  const fetchCurrentUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch {
      // If token expired or invalid, reset
      setStoredToken(null);
      setTokenState(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await authApi.login(username, password);
      setStoredToken(res.access_token);
      setTokenState(res.access_token);
      await fetchCurrentUser();
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const switchDemoRole = useCallback(async (role: UserRole) => {
    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      await login(creds.user, creds.pass);
    }
  }, [login]);

  const logout = useCallback(() => {
    setStoredToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role: user?.role || null,
      token,
      isLoading,
      asOfDate,
      setAsOfDate,
      login,
      switchDemoRole,
      logout,
    }),
    [user, token, isLoading, asOfDate, login, switchDemoRole, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
