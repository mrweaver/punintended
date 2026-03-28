import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, type AuthUser } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isReady: false,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    authApi
      .getUser()
      .then(({ user }) => {
        setUser(user);
        setIsReady(true);
      })
      .catch(() => {
        setIsReady(true);
      });
  }, []);

  const login = () => {
    window.location.href = '/auth/google';
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    localStorage.removeItem('pun_session_id');
  };

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
