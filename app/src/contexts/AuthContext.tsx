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

function consumeHubHandoffToken(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? params.get("hub_token");
  if (!token) return null;
  // Strip the token from the URL so it doesn't linger in history or analytics.
  params.delete("token");
  params.delete("hub_token");
  const remaining = params.toString();
  const cleanUrl =
    window.location.pathname + (remaining ? `?${remaining}` : "");
  window.history.replaceState({}, "", cleanUrl);
  return token;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const handoff = consumeHubHandoffToken();
    if (handoff) {
      // Hand off to the backend; it verifies, sets the .cotlone.com cookie,
      // and redirects back to /. We replace the location so the user never
      // sees the token in their address bar.
      window.location.replace(
        `/auth/hub?token=${encodeURIComponent(handoff)}`,
      );
      return;
    }

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
