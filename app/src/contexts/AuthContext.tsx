import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, profileApi, type AuthUser } from "../api/client";

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  login: () => void;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthUser>;
  updatePrivacy: (anonymous: boolean) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isReady: false,
  login: () => {},
  logout: async () => {},
  updateDisplayName: async () => {
    throw new Error("AuthContext not initialized");
  },
  updatePrivacy: async () => {
    throw new Error("AuthContext not initialized");
  },
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
    window.location.href = "/auth/google";
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    localStorage.removeItem("pun_session_id");
  };

  const updateDisplayName = async (displayName: string) => {
    const { user: updatedUser } =
      await profileApi.updateDisplayName(displayName);
    setUser(updatedUser);
    return updatedUser;
  };

  const updatePrivacy = async (anonymous: boolean) => {
    const { user: updatedUser } = await profileApi.updatePrivacy(anonymous);
    setUser(updatedUser);
    return updatedUser;
  };

  return (
    <AuthContext.Provider
      value={{ user, isReady, login, logout, updateDisplayName, updatePrivacy }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
