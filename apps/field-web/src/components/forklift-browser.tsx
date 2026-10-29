"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { OperationsListShell } from "@/components/operations-list-shell";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { hasFieldPermission } from "@/lib/field-permissions";
import { operationsApi } from "@/lib/operations-api";
import { forkliftDisplayName, matchesOrgSite, type ForkliftRecord } from "@/lib/operations";

export function ForkliftBrowser() {
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { moduleEnabled, permissions, opts } = useFieldPermissions();
  const [rows, setRows] = useState<ForkliftRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locationId = org?.selection.locationId ?? "";
  const canInspect = hasFieldPermission(permissions, "field.fleet.inspect", opts);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (locationId) params.siteId = locationId;
      const list = await operationsApi.listForklifts(params);
      setRows(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load forklifts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!moduleEnabled("FORKLIFTS") || !canInspect) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, canInspect, refresh]);

  const visible = useMemo(() => {
    const scoped = rows.filter((row) => matchesOrgSite(row.siteId, locationId));
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((row) => forkliftDisplayName(row).toLowerCase().includes(q));
  }, [rows, locationId, query]);

  return (
    <OperationsListShell
      title="Forklifts"
      body="Forklift records for your Location. Prefer Scan for the fastest entry."
      loading={loading}
      error={error}
      emptyTitle="No forklifts"
      emptyMessage="No forklift records match this Location."
      onRetry={() => void refresh()}
      moduleDisabled={!moduleEnabled("FORKLIFTS") || !canInspect}
      moduleDisabledMessage={
        !canInspect
          ? "Fleet inspect permission is required."
          : "Forklifts is not enabled for this company."
      }
      footer={
        <button type="button" className="ff-scan-hero" onClick={() => router.push("/scan/")}>
          SCAN QR CODE
        </button>
      }
    >
      {visible.length > 0 || query ? (
        <>
          <label className="ff-field">
            <span className="ff-label">Search</span>
            <input
              className="ff-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Unit or name"
              aria-label="Search forklifts"
            />
          </label>
          <div className="ff-task-list" style={{ marginTop: 12 }}>
            {visible.map((row) => (
              <button
                key={row.id}
                type="button"
                className="ff-task-card"
                onClick={() =>
                  router.push(`/equipment/${encodeURIComponent(row.id)}/?kind=forklift`)
                }
              >
                <div className="ff-task-card-body">
                  <span className="ff-task-kind">Forklift</span>
                  <span className="ff-task-title">{forkliftDisplayName(row)}</span>
                  <span className="ff-meta">{row.status || "Ready"}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </OperationsListShell>
  );
}
