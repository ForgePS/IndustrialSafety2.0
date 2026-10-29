"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { OperationsListShell } from "@/components/operations-list-shell";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { hasFieldPermission } from "@/lib/field-permissions";
import { operationsApi } from "@/lib/operations-api";
import { filterFleetByLocation, fleetDisplayName, type FleetVehicleItem } from "@/lib/operations";

type FleetBrowserProps = {
  mode: "fleet" | "dot";
};

export function FleetBrowser({ mode }: FleetBrowserProps) {
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { moduleEnabled, permissions, opts } = useFieldPermissions();
  const [rows, setRows] = useState<FleetVehicleItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locationId = org?.selection.locationId ?? "";
  const moduleCode = mode === "dot" ? "DOT_COMPLIANCE" : "FLEET";
  const title = mode === "dot" ? "DOT / DVIR" : "Fleet";
  const canInspect = hasFieldPermission(permissions, "field.fleet.inspect", opts);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (locationId) params.siteId = locationId;
      if (mode === "dot") params.dotRegulated = "true";
      const list = await operationsApi.listFleetVehicles(params);
      setRows(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not load ${title.toLowerCase()}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [locationId, mode, title]);

  useEffect(() => {
    if (!moduleEnabled(moduleCode) || !canInspect) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, moduleCode, canInspect, refresh]);

  const visible = useMemo(() => {
    const scoped = filterFleetByLocation(rows, locationId);
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((row) =>
      `${fleetDisplayName(row)} ${row.licensePlate ?? ""} ${row.assetType ?? ""} ${row.locationName ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, locationId, query]);

  return (
    <OperationsListShell
      title={title}
      body={
        mode === "dot"
          ? "DOT-regulated assets for your Location. Open a unit to start a DVIR."
          : "Fleet assets for your Location. Prefer Scan for the fastest entry."
      }
      loading={loading}
      error={error}
      emptyTitle={mode === "dot" ? "No DOT assets" : "No fleet assets"}
      emptyMessage={
        mode === "dot"
          ? "No DOT-regulated vehicles match this Location."
          : "No fleet assets match this Location."
      }
      onRetry={() => void refresh()}
      moduleDisabled={!moduleEnabled(moduleCode) || !canInspect}
      moduleDisabledMessage={
        !canInspect
          ? "Fleet inspect permission is required."
          : `${title} is not enabled for this company.`
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
              placeholder="Unit, plate, make"
              aria-label={`Search ${title}`}
            />
          </label>
          <div className="ff-task-list" style={{ marginTop: 12 }}>
            {visible.map((row) => (
              <button
                key={row.id}
                type="button"
                className="ff-task-card"
                onClick={() =>
                  router.push(
                    mode === "dot"
                      ? `/dvir/${encodeURIComponent(row.id)}/`
                      : `/equipment/${encodeURIComponent(row.id)}/?kind=vehicle`,
                  )
                }
              >
                <div className="ff-task-card-body">
                  <span className="ff-task-kind">
                    {mode === "dot" ? "DOT" : row.assetType || "Vehicle"}
                  </span>
                  <span className="ff-task-title">{fleetDisplayName(row)}</span>
                  <span className="ff-meta">
                    {[
                      row.locationName,
                      row.status,
                      row.outOfService ? "Out of service" : null,
                      row.dotRegulated ? "DVIR required" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Ready"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </OperationsListShell>
  );
}
