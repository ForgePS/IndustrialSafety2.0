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
import { apiGet, useAuth } from "@forge/web-kit";
import {
  EMPTY_ORG_SELECTION,
  readOrgSelection,
  writeOrgSelection,
  type FieldOrgSelection,
} from "@/lib/org-storage";

export type OrgLocationOption = { id: string; name: string };
export type OrgDepartmentOption = {
  id: string;
  name: string;
  locationId: string | null;
  divisionName: string | null;
};

type FieldOrgContextValue = {
  tenantId: string;
  tenantName: string;
  selection: FieldOrgSelection;
  locations: OrgLocationOption[];
  departments: OrgDepartmentOption[];
  divisions: string[];
  loading: boolean;
  error: string | null;
  setLocation: (locationId: string) => void;
  setDivision: (divisionName: string) => void;
  setDepartment: (departmentId: string) => void;
  applyScanOrgContext: (input: {
    locationId?: string | null;
    locationName?: string | null;
    divisionName?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    kind?: "location" | "division" | "department" | null;
  }) => void;
  clearSelection: () => void;
  refresh: () => void;
};

const FieldOrgContext = createContext<FieldOrgContextValue | null>(null);

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return (payload as { items: T[] }).items;
  }
  return [];
}

export function FieldOrgProvider({
  children,
  tenantName,
}: {
  children: ReactNode;
  tenantName: string;
}) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const [selection, setSelection] = useState<FieldOrgSelection>(EMPTY_ORG_SELECTION);
  const [locations, setLocations] = useState<OrgLocationOption[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId) {
      setSelection(EMPTY_ORG_SELECTION);
      return;
    }
    setSelection(readOrgSelection(tenantId));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [sitesRaw, deptsRaw] = await Promise.all([
          apiGet<unknown>("/api/v1/industrial/sites"),
          apiGet<unknown>("/api/v1/industrial/departments"),
        ]);
        if (cancelled) return;
        const siteRows = asItems<{ id?: string; name?: string }>(sitesRaw);
        const deptRows = asItems<{
          id?: string;
          name?: string;
          siteId?: string | null;
          divisionName?: string | null;
        }>(deptsRaw);
        setLocations(
          siteRows
            .filter((s) => typeof s.id === "string" && typeof s.name === "string")
            .map((s) => ({ id: s.id!, name: s.name! })),
        );
        setDepartments(
          deptRows
            .filter((d) => typeof d.id === "string" && typeof d.name === "string")
            .map((d) => ({
              id: d.id!,
              name: d.name!,
              locationId: typeof d.siteId === "string" ? d.siteId : null,
              divisionName: typeof d.divisionName === "string" ? d.divisionName : null,
            })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load organization");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, tick]);

  const persist = useCallback(
    (next: FieldOrgSelection) => {
      setSelection(next);
      if (tenantId) writeOrgSelection(tenantId, next);
    },
    [tenantId],
  );

  const setLocation = useCallback(
    (locationId: string) => {
      const loc = locations.find((l) => l.id === locationId);
      persist({
        locationId,
        locationName: loc?.name ?? "",
        divisionName: "",
        departmentId: "",
        departmentName: "",
      });
    },
    [locations, persist],
  );

  const applyScanOrgContext = useCallback(
    (input: {
      locationId?: string | null;
      locationName?: string | null;
      divisionName?: string | null;
      departmentId?: string | null;
      departmentName?: string | null;
      kind?: "location" | "division" | "department" | null;
    }) => {
      const kind = input.kind ?? "location";
      if (kind === "division") {
        persist({
          ...selection,
          divisionName: input.divisionName || input.locationName || selection.divisionName,
          departmentId: "",
          departmentName: "",
        });
        return;
      }
      if (kind === "department") {
        persist({
          ...selection,
          departmentId: input.departmentId || input.locationId || selection.departmentId,
          departmentName: input.departmentName || input.locationName || selection.departmentName,
          divisionName: input.divisionName || selection.divisionName,
          locationId: input.locationId || selection.locationId,
          locationName: input.locationName || selection.locationName,
        });
        return;
      }
      const locationId = input.locationId?.trim() || "";
      const known = locations.find((l) => l.id === locationId);
      persist({
        locationId,
        locationName: known?.name || input.locationName?.trim() || "",
        divisionName: input.divisionName?.trim() || "",
        departmentId: "",
        departmentName: "",
      });
    },
    [locations, persist, selection],
  );

  const setDivision = useCallback(
    (divisionName: string) => {
      persist({
        ...selection,
        divisionName,
        departmentId: "",
        departmentName: "",
      });
    },
    [persist, selection],
  );

  const setDepartment = useCallback(
    (departmentId: string) => {
      const dept = departments.find((d) => d.id === departmentId);
      persist({
        ...selection,
        departmentId,
        departmentName: dept?.name ?? "",
        divisionName: dept?.divisionName || selection.divisionName,
        locationId: dept?.locationId || selection.locationId,
        locationName:
          (dept?.locationId
            ? locations.find((l) => l.id === dept.locationId)?.name
            : selection.locationName) || selection.locationName,
      });
    },
    [departments, locations, persist, selection],
  );

  const clearSelection = useCallback(() => {
    persist(EMPTY_ORG_SELECTION);
  }, [persist]);

  const divisions = useMemo(() => {
    const names = new Set<string>();
    for (const d of departments) {
      if (!d.divisionName) continue;
      if (selection.locationId && d.locationId && d.locationId !== selection.locationId) continue;
      names.add(d.divisionName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [departments, selection.locationId]);

  const value = useMemo<FieldOrgContextValue>(
    () => ({
      tenantId,
      tenantName,
      selection,
      locations,
      departments,
      divisions,
      loading,
      error,
      setLocation,
      setDivision,
      setDepartment,
      applyScanOrgContext,
      clearSelection,
      refresh: () => setTick((n) => n + 1),
    }),
    [
      tenantId,
      tenantName,
      selection,
      locations,
      departments,
      divisions,
      loading,
      error,
      setLocation,
      setDivision,
      setDepartment,
      applyScanOrgContext,
      clearSelection,
    ],
  );

  return <FieldOrgContext.Provider value={value}>{children}</FieldOrgContext.Provider>;
}

export function useFieldOrg(): FieldOrgContextValue {
  const ctx = useContext(FieldOrgContext);
  if (!ctx) {
    throw new Error("useFieldOrg must be used within FieldOrgProvider");
  }
  return ctx;
}

export function useFieldOrgOptional(): FieldOrgContextValue | null {
  return useContext(FieldOrgContext);
}
