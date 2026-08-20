"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ALL_FACILITIES_ID,
  facilityListQuery,
  facilityStorageKey,
  loadIndustrialSiteCatalog,
  pickActiveFacilityId,
  type IndustrialFacilityOption,
} from "@/lib/industrial-facility";

type FacilityContextValue = {
  facilities: IndustrialFacilityOption[];
  facilityId: string;
  setFacilityId: (next: string) => void;
  loading: boolean;
  query: Record<string, string | undefined>;
};

const EMPTY: FacilityContextValue = {
  facilities: [],
  facilityId: ALL_FACILITIES_ID,
  setFacilityId: () => undefined,
  loading: false,
  query: {},
};

const IndustrialFacilityContext = createContext<FacilityContextValue>(EMPTY);

export function useIndustrialFacilityState(
  tenantId: string | null | undefined,
  enabled: boolean,
): FacilityContextValue {
  const [facilities, setFacilities] = useState<IndustrialFacilityOption[]>([]);
  const [facilityId, setFacilityIdState] = useState<string>(ALL_FACILITIES_ID);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tenantId) {
      setFacilities([]);
      setFacilityIdState(ALL_FACILITIES_ID);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const options = await loadIndustrialSiteCatalog(tenantId);
        if (cancelled) return;
        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(facilityStorageKey(tenantId)) : null;
        const next = pickActiveFacilityId(options, stored);
        setFacilities(options);
        setFacilityIdState(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(facilityStorageKey(tenantId), next);
        }
      } catch {
        if (!cancelled) {
          setFacilities([]);
          setFacilityIdState(ALL_FACILITIES_ID);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId]);

  const setFacilityId = useCallback(
    (next: string) => {
      setFacilityIdState(next);
      if (tenantId && typeof window !== "undefined") {
        window.localStorage.setItem(facilityStorageKey(tenantId), next);
      }
    },
    [tenantId],
  );

  return useMemo(
    () => ({
      facilities,
      facilityId,
      setFacilityId,
      loading,
      query: facilityListQuery(facilityId),
    }),
    [facilities, facilityId, loading, setFacilityId],
  );
}

export function IndustrialFacilityProvider({
  value,
  children,
}: {
  value: FacilityContextValue;
  children: ReactNode;
}) {
  return (
    <IndustrialFacilityContext.Provider value={value}>{children}</IndustrialFacilityContext.Provider>
  );
}

export function useIndustrialFacility(): FacilityContextValue {
  return useContext(IndustrialFacilityContext);
}
