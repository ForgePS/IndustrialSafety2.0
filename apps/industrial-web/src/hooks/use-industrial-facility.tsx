"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet } from "@forge/web-kit";
import { filterDepartmentsForSite } from "@/lib/personnel-assignment";
import {
  ALL_DEPARTMENTS_ID,
  ALL_FACILITIES_ID,
  departmentStorageKey,
  facilityStorageKey,
  loadIndustrialSiteCatalog,
  normalizeDepartmentOptions,
  pickActiveDepartmentId,
  pickActiveFacilityId,
  scopeListQuery,
  type IndustrialDepartmentOption,
  type IndustrialFacilityOption,
} from "@/lib/industrial-facility";

type FacilityContextValue = {
  facilities: IndustrialFacilityOption[];
  facilityId: string;
  setFacilityId: (next: string) => void;
  departments: IndustrialDepartmentOption[];
  departmentsForFacility: IndustrialDepartmentOption[];
  departmentId: string;
  departmentName: string | null;
  setDepartmentId: (next: string) => void;
  loading: boolean;
  query: Record<string, string | undefined>;
};

const EMPTY: FacilityContextValue = {
  facilities: [],
  facilityId: ALL_FACILITIES_ID,
  setFacilityId: () => undefined,
  departments: [],
  departmentsForFacility: [],
  departmentId: ALL_DEPARTMENTS_ID,
  departmentName: null,
  setDepartmentId: () => undefined,
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
  const [departments, setDepartments] = useState<IndustrialDepartmentOption[]>([]);
  const [departmentId, setDepartmentIdState] = useState<string>(ALL_DEPARTMENTS_ID);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tenantId) {
      setFacilities([]);
      setFacilityIdState(ALL_FACILITIES_ID);
      setDepartments([]);
      setDepartmentIdState(ALL_DEPARTMENTS_ID);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [options, deptRows] = await Promise.all([
          loadIndustrialSiteCatalog(tenantId),
          apiGet<unknown>("/api/v1/industrial/departments").catch(() => []),
        ]);
        if (cancelled) return;
        const storedFacility =
          typeof window !== "undefined" ? window.localStorage.getItem(facilityStorageKey(tenantId)) : null;
        const nextFacility = pickActiveFacilityId(options, storedFacility);
        const nextDepartments = normalizeDepartmentOptions(deptRows);
        const storedDepartment =
          typeof window !== "undefined"
            ? window.localStorage.getItem(departmentStorageKey(tenantId, nextFacility))
            : null;
        const scopedDepartments =
          nextFacility === ALL_FACILITIES_ID
            ? nextDepartments
            : filterDepartmentsForSite(
                nextDepartments.map((row) => ({
                  id: row.id,
                  label: row.name,
                  siteId: row.siteId ?? null,
                })),
                nextFacility,
              ).map((row) => ({
                id: row.id,
                name: row.label,
                siteId: row.siteId ?? null,
              }));
        const nextDepartment = pickActiveDepartmentId(scopedDepartments, storedDepartment);
        setFacilities(options);
        setFacilityIdState(nextFacility);
        setDepartments(nextDepartments);
        setDepartmentIdState(nextDepartment);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(facilityStorageKey(tenantId), nextFacility);
          window.localStorage.setItem(departmentStorageKey(tenantId, nextFacility), nextDepartment);
        }
      } catch {
        if (!cancelled) {
          setFacilities([]);
          setFacilityIdState(ALL_FACILITIES_ID);
          setDepartments([]);
          setDepartmentIdState(ALL_DEPARTMENTS_ID);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId]);

  const departmentsForFacility = useMemo(() => {
    if (facilityId === ALL_FACILITIES_ID) return departments;
    return filterDepartmentsForSite(
      departments.map((row) => ({
        id: row.id,
        label: row.name,
        siteId: row.siteId ?? null,
      })),
      facilityId,
    ).map((row) => ({
      id: row.id,
      name: row.label,
      siteId: row.siteId ?? null,
    }));
  }, [departments, facilityId]);

  useEffect(() => {
    if (!tenantId || !enabled) return;
    if (!departmentsForFacility.some((row) => row.id === departmentId) && departmentId !== ALL_DEPARTMENTS_ID) {
      setDepartmentIdState(ALL_DEPARTMENTS_ID);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(departmentStorageKey(tenantId, facilityId), ALL_DEPARTMENTS_ID);
      }
    }
  }, [departmentId, departmentsForFacility, enabled, facilityId, tenantId]);

  const setFacilityId = useCallback(
    (next: string) => {
      setFacilityIdState(next);
      const scopedDepartments =
        next === ALL_FACILITIES_ID
          ? departments
          : filterDepartmentsForSite(
              departments.map((row) => ({
                id: row.id,
                label: row.name,
                siteId: row.siteId ?? null,
              })),
              next,
            ).map((row) => ({
              id: row.id,
              name: row.label,
              siteId: row.siteId ?? null,
            }));
      const storedDepartment =
        tenantId && typeof window !== "undefined"
          ? window.localStorage.getItem(departmentStorageKey(tenantId, next))
          : null;
      const nextDepartment = pickActiveDepartmentId(scopedDepartments, storedDepartment);
      setDepartmentIdState(nextDepartment);
      if (tenantId && typeof window !== "undefined") {
        window.localStorage.setItem(facilityStorageKey(tenantId), next);
        window.localStorage.setItem(departmentStorageKey(tenantId, next), nextDepartment);
      }
    },
    [departments, tenantId],
  );

  const setDepartmentId = useCallback(
    (next: string) => {
      setDepartmentIdState(next);
      if (tenantId && typeof window !== "undefined") {
        window.localStorage.setItem(departmentStorageKey(tenantId, facilityId), next);
      }
    },
    [facilityId, tenantId],
  );

  const facilityName = facilities.find((row) => row.id === facilityId)?.name ?? null;
  const departmentName =
    departmentId === ALL_DEPARTMENTS_ID
      ? null
      : (departmentsForFacility.find((row) => row.id === departmentId)?.name ?? null);

  return useMemo(
    () => ({
      facilities,
      facilityId,
      setFacilityId,
      departments,
      departmentsForFacility,
      departmentId,
      departmentName,
      setDepartmentId,
      loading,
      query: scopeListQuery(facilityId, facilityName, departmentId, departmentName),
    }),
    [
      departments,
      departmentId,
      departmentName,
      departmentsForFacility,
      facilities,
      facilityId,
      facilityName,
      loading,
      setDepartmentId,
      setFacilityId,
    ],
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
