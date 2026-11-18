"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authMe, logoutAll, selectTenant, type AuthMe } from "@/lib/api";
import { clearAuthStorage } from "@/lib/auth-storage";
import { syncTenantIdInUrl } from "@/hooks/use-tenant-id";

type AuthContextValue = {
  me: AuthMe | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  chooseTenant: (tenantId: string) => Promise<void>;
  signOutAll: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMe(await authMe());
    } catch (err) {
      setMe(null);
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chooseTenant = useCallback(async (tenantId: string) => {
    setError(null);
    const updated = await selectTenant(tenantId);
    // Replace full AuthMe so prior tenant capabilities cannot linger.
    setMe(updated);
    syncTenantIdInUrl(tenantId);
  }, []);

  const signOutAll = useCallback(async () => {
    try {
      await logoutAll();
    } catch {
      // Clear local session even when API logout fails.
    } finally {
      clearAuthStorage();
      setMe(null);
    }
  }, []);

  const hasPermission = useCallback(
    (code: string) => {
      if (!me) return false;
      if (me.isPlatformAdmin) return true;
      return me.permissions.includes(code);
    },
    [me],
  );

  const value = useMemo(
    () => ({
      me,
      loading,
      error,
      refresh,
      chooseTenant,
      signOutAll,
      hasPermission,
    }),
    [me, loading, error, refresh, chooseTenant, signOutAll, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function usePermission(code: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(code);
}
