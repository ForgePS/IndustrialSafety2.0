"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { TaskCard } from "@/components/task-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { fieldInspectionApi } from "@/lib/inspection-api";
import {
  filterInspectionsForHub,
  filterInspectionsForOrg,
  inspectionToWorkItem,
  type InspectionHubTab,
  type InspectionListRecord,
} from "@/lib/inspections";
import type { FieldWorkItem } from "@/lib/my-work";

const TABS: Array<{ id: InspectionHubTab; label: string }> = [
  { id: "assigned", label: "Assigned" },
  { id: "dueToday", label: "Due Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

export function InspectionsHub() {
  const router = useRouter();
  const org = useFieldOrgOptional();
  const [tab, setTab] = useState<InspectionHubTab>("assigned");
  const [rows, setRows] = useState<InspectionListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fieldInspectionApi.list();
      setRows(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load inspections");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scoped = useMemo(
    () =>
      filterInspectionsForOrg(rows, {
        locationId: org?.selection.locationId ?? null,
        divisionName: org?.selection.divisionName ?? null,
      }),
    [rows, org?.selection.divisionName, org?.selection.locationId],
  );

  const filtered = useMemo(() => filterInspectionsForHub(scoped, tab), [scoped, tab]);
  const cards: FieldWorkItem[] = useMemo(
    () => filtered.map((row) => inspectionToWorkItem(row)),
    [filtered],
  );

  return (
    <>
      <header className="ff-header">
        <div>
          <h1 className="ff-page-title" style={{ marginBottom: 4 }}>
            Inspections
          </h1>
          <p className="ff-meta">
            {scoped.length} total
            {org?.selection.locationName ? ` · ${org.selection.locationName}` : ""}
            {org?.selection.divisionName ? ` · ${org.selection.divisionName}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="ff-icon-btn"
          aria-label="Refresh"
          onClick={() => void refresh()}
        >
          ↻
        </button>
      </header>

      <div className="ff-tabs" role="tablist" aria-label="Inspection status">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState label="Loading inspections…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && cards.length === 0 ? (
        <EmptyState
          title={tab === "completed" ? "No completed inspections" : "No inspections here"}
          message="Start an inspection from Scan, Home, or the button below."
        />
      ) : null}

      {!loading && !error && cards.length > 0 ? (
        <div className="ff-task-list ff-section">
          {cards.map((item) => (
            <TaskCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      <button type="button" className="ff-btn" onClick={() => router.push("/inspection/new/")}>
        Start inspection
      </button>
    </>
  );
}
