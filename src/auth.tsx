import React, { createContext, useContext, useEffect, useState } from "react";
import { api, clearLegacyTokenStorage, setToken } from "./api";

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
  loggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
  canAny: (perms: readonly string[]) => boolean;
  refresh: () => Promise<Me | null>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const refresh = async (): Promise<Me | null> => {
    try {
      const me = await api<Me>("/auth/me");
      setUser(me);
      return me;
    } catch {
      try {
        await api<{ ok: boolean }>("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refresh_token: null }),
        });
        const me = await api<Me>("/auth/me");
        setUser(me);
        return me;
      } catch {
        setUser(null);
        return null;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    clearLegacyTokenStorage();
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    await api<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await refresh();
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api<{ ok: boolean }>("/auth/logout", { method: "POST" });
    } catch {
      /* cookie may already be gone */
    } finally {
      setToken(null);
      setUser(null);
      setLoggingOut(false);
      window.location.href = "/login";
    }
  };

  const can = (perm: string) => {
    if (!user) return false;
    if (user.permissions.includes("*")) return true;
    return user.permissions.includes(perm);
  };

  const canAny = (perms: readonly string[]) => {
    if (!user) return false;
    if (user.permissions.includes("*")) return true;
    return perms.some((p) => user.permissions.includes(p));
  };

  return (
    <Ctx.Provider value={{ user, loading, loggingOut, login, logout, can, canAny, refresh }}>
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
