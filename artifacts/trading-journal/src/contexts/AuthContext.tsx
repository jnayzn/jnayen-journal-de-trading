import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useLocation } from "wouter";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import type { UserWithToken } from "@workspace/api-client-react/src/generated/api.schemas";

interface AuthContextType {
  user: UserWithToken | null;
  isLoading: boolean;
  login: (token: string, user: UserWithToken) => void;
  logout: () => void;
  updateUser: (user: UserWithToken) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserWithToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Register token getter once for all API calls
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("tradej_token"));
  }, []);

  // On app start, verify stored token against /api/auth/me
  useEffect(() => {
    const storedToken = localStorage.getItem("tradej_token");
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data: UserWithToken = await res.json();
          setUser(data);
        } else {
          localStorage.removeItem("tradej_token");
        }
      })
      .catch(() => {
        localStorage.removeItem("tradej_token");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback((token: string, userData: UserWithToken) => {
    localStorage.setItem("tradej_token", token);
    setUser({ ...userData, token });
    setLocation("/dashboard");
  }, [setLocation]);

  const logout = useCallback(() => {
    localStorage.removeItem("tradej_token");
    setUser(null);
    setLocation("/login");
  }, [setLocation]);

  const updateUser = useCallback((userData: UserWithToken) => {
    setUser(userData);
    localStorage.setItem("tradej_token", userData.token);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
