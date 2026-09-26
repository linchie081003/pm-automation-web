import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type Me = {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  roles: { id: number; code: string; name: string }[];
  permissions: string[];
};

type AuthCtx = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<Me>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    const tokens = await api<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(tokens.access_token);
    await refresh();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const can = (perm: string) => {
    if (!user) return false;
    if (user.permissions.includes("*")) return true;
    return user.permissions.includes(perm);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, can, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Memuat…</p>;
  if (!user) {
    window.location.href = "/login";
    return null;
  }
  return <>{children}</>;
}

export function RequirePerm({
  perm,
  children,
}: {
  perm: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(perm)) return <p className="error">Akses ditolak.</p>;
  return <>{children}</>;
}
