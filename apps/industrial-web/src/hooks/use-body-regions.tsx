"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import {
  BODY_REGIONS,
  clampBodyRegion,
  type BodyRegion,
} from "@/lib/incident-body-map";

export type BodyMapConfigResponse = {
  regions: BodyRegion[];
  isCustom: boolean;
  updatedAt: string | null;
};

type BodyRegionsContextValue = {
  regions: readonly BodyRegion[];
  loading: boolean;
  saving: boolean;
  isCustom: boolean;
  updatedAt: string | null;
  error: string | null;
  notice: string | null;
  refresh: () => Promise<void>;
  saveRegions: (regions: readonly BodyRegion[]) => Promise<void>;
  clearNotice: () => void;
};

const BodyRegionsContext = createContext<BodyRegionsContextValue | null>(null);

function normalizeRegions(raw: readonly BodyRegion[]): BodyRegion[] {
  return raw.map((region) => clampBodyRegion({ ...region }));
}

export function BodyRegionsProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const [regions, setRegions] = useState<BodyRegion[]>(() => [...BODY_REGIONS]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [saving, setSaving] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setRegions([...BODY_REGIONS]);
      setIsCustom(false);
      setUpdatedAt(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<BodyMapConfigResponse>(
        `/api/v1/tenants/${tenantId}/industrial/incidents/body-map-config`,
      );
      setRegions(normalizeRegions(result.regions));
      setIsCustom(result.isCustom);
      setUpdatedAt(result.updatedAt);
    } catch (err) {
      setRegions([...BODY_REGIONS]);
      setIsCustom(false);
      setUpdatedAt(null);
      setError(err instanceof ApiError ? err.message : "Could not load body map settings.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveRegions = useCallback(async (next: readonly BodyRegion[]) => {
    if (!tenantId) {
      throw new Error("Sign in to save body map settings.");
    }
    const normalized = normalizeRegions(next);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiSend<BodyMapConfigResponse>(
        `/api/v1/tenants/${tenantId}/industrial/incidents/body-map-config`,
        "PUT",
        { regions: normalized },
      );
      setRegions(normalizeRegions(result.regions));
      setIsCustom(result.isCustom);
      setUpdatedAt(result.updatedAt);
      setNotice("Body map saved for your company.");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not save body map settings.";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [tenantId]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<BodyRegionsContextValue>(
    () => ({
      regions,
      loading,
      saving,
      isCustom,
      updatedAt,
      error,
      notice,
      refresh,
      saveRegions,
      clearNotice,
    }),
    [regions, loading, saving, isCustom, updatedAt, error, notice, refresh, saveRegions, clearNotice],
  );

  return <BodyRegionsContext.Provider value={value}>{children}</BodyRegionsContext.Provider>;
}

export function useBodyRegions(): BodyRegionsContextValue {
  const value = useContext(BodyRegionsContext);
  if (!value) {
    throw new Error("useBodyRegions must be used within BodyRegionsProvider");
  }
  return value;
}

/** Optional access for components that can fall back to platform defaults. */
export function useBodyRegionsOptional(): BodyRegionsContextValue | null {
  return useContext(BodyRegionsContext);
}
