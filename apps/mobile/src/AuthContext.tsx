import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "./api";

export type MobileUser = { id: string; email: string; name: string; role: "CONSUMER" | "MERCHANT" | "ADMIN" };

type AuthValue = {
  user: MobileUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string, expectedRole: MobileUser["role"]) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try { setUser((await api<{ user: MobileUser | null }>("/auth/me")).user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function login(email: string, password: string, expectedRole: MobileUser["role"]) {
    const result = await api<{ user: MobileUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole }) });
    setUser(result.user);
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); }
  }

  return <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
