"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { apiGet } from "@forge/web-kit";
import { INCIDENT_SECTIONS } from "@/lib/constants";

type EffectiveResponse = {
  payload: unknown;
  source: string;
};

type TerminologyPayload = {
  terms?: Record<string, string>;
};

type DropdownsPayload = {
  catalogs?: Array<{
    key: string;
    options: Array<{ value: string; label: string }>;
  }>;
};

type NavigationPayload = {
  groups?: Array<{
    label: string;
    items: Array<{ href: string; label: string; featureFlag?: string }>;
  }>;
};

async function loadEffective<T>(tenantId: string, namespace: string): Promise<T | null> {
  try {
    const result = await apiGet<EffectiveResponse>(
      `/api/v1/tenants/${tenantId}/config/${namespace}/default/effective`,
    );
    return (result.payload as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads published Configuration Studio payloads for runtime consumers.
 * Falls back to built-in defaults when no published config exists.
 */
export function useTenantConfigStudio() {
  const { me } = useAuth();
  const [terminology, setTerminology] = useState<Record<string, string>>({});
  const [personnelRoles, setPersonnelRoles] = useState<Array<{ value: string; label: string }>>([]);
  const [navGroups, setNavGroups] = useState<NavigationPayload["groups"] | null>(null);
  const [loading, setLoading] = useState(Boolean(me?.tenantId));

  useEffect(() => {
    const tenantId = me?.tenantId;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [terms, dropdowns, navigation] = await Promise.all([
        loadEffective<TerminologyPayload>(tenantId, "terminology"),
        loadEffective<DropdownsPayload>(tenantId, "dropdowns"),
        loadEffective<NavigationPayload>(tenantId, "navigation"),
      ]);
      if (cancelled) return;
      setTerminology(terms?.terms ?? {});
      const roles = dropdowns?.catalogs?.find((c) => c.key === "personnel_roles")?.options ?? [];
      setPersonnelRoles(roles);
      setNavGroups(navigation?.groups ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId]);

  const incidentSections = INCIDENT_SECTIONS.map((section) => ({
    ...section,
    label: terminology[section.key.toLowerCase()] ?? terminology[section.key] ?? section.label,
  }));

  return {
    loading,
    terminology,
    personnelRoles,
    navGroups,
    incidentSections,
  };
}
