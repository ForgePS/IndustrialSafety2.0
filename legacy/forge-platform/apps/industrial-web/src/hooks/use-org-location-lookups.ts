"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_ASSIGNMENT_OPTIONS,
  type AssignmentOptions,
  type DepartmentOption,
  type DivisionOption,
} from "@/lib/personnel-assignment";
import {
  EMPTY_LOOKUPS,
  loadAssignmentOptions,
  loadPersonnelLookups,
  type LookupOption,
  type LookupState,
} from "@/lib/personnel-lookups";

export type OrgLocationLookups = {
  sites: LookupOption[];
  departments: DepartmentOption[];
  divisionEntries: DivisionOption[];
  positions: LookupOption[];
  assignment: AssignmentOptions;
  lookups: LookupState;
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Loads sites, departments, positions, and site-scoped division catalog for
 * the Location → Division → Department cascade.
 */
export function useOrgLocationLookups(tenantId?: string | null): OrgLocationLookups {
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [assignment, setAssignment] = useState<AssignmentOptions>(EMPTY_ASSIGNMENT_OPTIONS);
  const [loading, setLoading] = useState(Boolean(tenantId));

  const reload = useCallback(async () => {
    if (!tenantId) {
      setLookups(EMPTY_LOOKUPS);
      setAssignment(EMPTY_ASSIGNMENT_OPTIONS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [catalog, assign] = await Promise.all([
        loadPersonnelLookups(tenantId),
        loadAssignmentOptions(),
      ]);
      setLookups(catalog);
      setAssignment(assign);
    } catch {
      setLookups(EMPTY_LOOKUPS);
      setAssignment(EMPTY_ASSIGNMENT_OPTIONS);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    sites: lookups.sites,
    departments: lookups.departments as DepartmentOption[],
    divisionEntries: assignment.divisionEntries,
    positions: lookups.positions,
    assignment,
    lookups,
    loading,
    reload,
  };
}
