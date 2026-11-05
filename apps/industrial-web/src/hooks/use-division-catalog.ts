"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { loadOrgCatalog } from "@/lib/industrial-dropdown-catalogs";

/** Division names from the tenant's division catalog (OSHA establishments). */
export function useDivisionCatalog(enabled = true): string[] {
  const { me } = useAuth();
  const [names, setNames] = useState<string[]>([]);
  const tenantId = me?.tenantId ?? "";

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadOrgCatalog(tenantId, "divisions")
      .then((rows) => {
        if (!cancelled) setNames(rows.map((r) => r.label));
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId]);

  return names;
}
