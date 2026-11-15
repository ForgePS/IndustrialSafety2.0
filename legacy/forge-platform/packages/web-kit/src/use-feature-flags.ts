"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listEffectiveFeatures, type EffectiveFeature } from "./auth-api.js";
import { useAuth } from "./auth-provider.js";

export function useFeatureFlags(flagKeys: string[]): {
  flags: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { me } = useAuth();
  const [features, setFeatures] = useState<EffectiveFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stabilize identity so callers can pass inline arrays without retriggering fetch.
  const flagKeysKey = flagKeys.join("\0");
  const stableFlagKeys = useMemo(() => flagKeysKey.split("\0").filter(Boolean), [flagKeysKey]);

  const refresh = useCallback(async () => {
    if (!me?.tenantId) {
      setFeatures([]);
      setLoading(false);
      return;
    }
    if (me.isPlatformAdmin) {
      setFeatures(
        stableFlagKeys.map((key) => ({ key, name: key, value: true, valueType: "boolean" })),
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setFeatures(await listEffectiveFeatures(me.tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feature flags");
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId, me?.isPlatformAdmin, stableFlagKeys]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flags = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const key of stableFlagKeys) {
      if (me?.isPlatformAdmin) {
        map[key] = true;
        continue;
      }
      const match = features.find((feature) => feature.key === key);
      map[key] = match ? Boolean(match.value) : false;
    }
    return map;
  }, [stableFlagKeys, features, me?.isPlatformAdmin]);

  return { flags, loading, error, refresh };
}

export function useFeatureFlag(flagKey: string): {
  enabled: boolean;
  loading: boolean;
  error: string | null;
} {
  const { flags, loading, error } = useFeatureFlags([flagKey]);
  return { enabled: flags[flagKey] ?? false, loading, error };
}
