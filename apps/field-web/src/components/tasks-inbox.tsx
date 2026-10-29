"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TaskCard } from "@/components/task-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useMyWork } from "@/hooks/use-my-work";
import { fieldInspectionApi } from "@/lib/inspection-api";
import { inspectionToWorkItem } from "@/lib/inspections";
import {
  filterTasksForDivision,
  filterTasksForKind,
  filterTasksForLocation,
  filterTasksForTab,
  groupOpenTasks,
  parseKindFilter,
  type FieldWorkItem,
  type TaskDueTab,
  type TaskKindFilter,
} from "@/lib/my-work";

const KIND_TABS: Array<{ id: TaskKindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "inspections", label: "Inspections" },
  { id: "corrective_actions", label: "Corrective" },
  { id: "training", label: "Training" },
];

const DUE_TABS: Array<{ id: TaskDueTab; label: string }> = [
  { id: "all", label: "Open" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

function parseDueTab(raw: string | null): TaskDueTab {
  if (raw === "today" || raw === "overdue" || raw === "completed") return raw;
  return "all";
}

export function TasksInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const org = useFieldOrgOptional();
  const { data, loading: workLoading, error: workError, refresh: refreshWork } = useMyWork();
  const [inspectionItems, setInspectionItems] = useState<FieldWorkItem[]>([]);
  const [inspLoading, setInspLoading] = useState(true);
  const [inspError, setInspError] = useState<string | null>(null);
  const [kind, setKind] = useState<TaskKindFilter>(() =>
    parseKindFilter(searchParams.get("filter")),
  );
  const [dueTab, setDueTab] = useState<TaskDueTab>(() => parseDueTab(searchParams.get("due")));

  const refreshInspections = useCallback(async () => {
    setInspLoading(true);
    setInspError(null);
    try {
      const rows = await fieldInspectionApi.list();
      setInspectionItems(rows.map((row) => inspectionToWorkItem(row)));
    } catch (err) {
      setInspError(err instanceof Error ? err.message : "Could not load inspections");
      setInspectionItems([]);
    } finally {
      setInspLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshInspections();
  }, [refreshInspections]);

  const refresh = useCallback(() => {
    void refreshWork();
    void refreshInspections();
  }, [refreshWork, refreshInspections]);

  const merged = useMemo(() => {
    const base = data?.items ?? [];
    return [...base, ...inspectionItems];
  }, [data?.items, inspectionItems]);

  const scoped = useMemo(() => {
    return filterTasksForDivision(
      filterTasksForLocation(merged, org?.selection.locationId),
      org?.selection.divisionName,
    );
  }, [merged, org?.selection.divisionName, org?.selection.locationId]);

  const byKind = useMemo(() => filterTasksForKind(scoped, kind), [scoped, kind]);
  const filtered = useMemo(() => filterTasksForTab(byKind, dueTab), [byKind, dueTab]);
  const grouped = useMemo(() => groupOpenTasks(filtered), [filtered]);

  const loading = workLoading || inspLoading;
  const error = workError || inspError;

  const syncQuery = (nextKind: TaskKindFilter, nextDue: TaskDueTab) => {
    const params = new URLSearchParams();
    if (nextKind !== "all") params.set("filter", nextKind);
    if (nextDue !== "all") params.set("due", nextDue);
    const qs = params.toString();
    router.replace(qs ? `/tasks/?${qs}` : "/tasks/");
  };

  const openCount = scoped.filter((item) => !/complete|passed|done/i.test(item.status)).length;
  const overdueCount = scoped.filter((item) => {
    if (/complete|passed|done/i.test(item.status) || !item.dueAt) return false;
    return new Date(item.dueAt).getTime() < Date.now();
  }).length;

  return (
    <>
      <header className="ff-header">
        <div>
          <h1 className="ff-page-title" style={{ marginBottom: 4 }}>
            My Work
          </h1>
          <p className="ff-meta">
            {`${openCount} open · ${overdueCount} overdue`}
            {org?.selection.locationName ? ` · ${org.selection.locationName}` : ""}
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

      <div className="ff-tabs" role="tablist" aria-label="Work type">
        {KIND_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={kind === item.id}
            className={kind === item.id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => {
              setKind(item.id);
              syncQuery(item.id, dueTab);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="ff-tabs ff-tabs--secondary" role="tablist" aria-label="Due filters">
        {DUE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={dueTab === item.id}
            className={dueTab === item.id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => {
              setDueTab(item.id);
              syncQuery(kind, item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState label="Loading your work…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          title={kind === "inspections" ? "No inspections in this view" : "You're caught up"}
          message={
            kind === "inspections"
              ? "Start an inspection or open the Inspections hub for the full list."
              : "No items in this view. New assignments will appear here automatically."
          }
        />
      ) : null}

      {kind === "inspections" ? (
        <div className="ff-action-grid" style={{ marginBottom: 12 }}>
          <button type="button" className="ff-btn" onClick={() => router.push("/inspection/new/")}>
            Start inspection
          </button>
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => router.push("/inspections/")}
          >
            Inspections hub
          </button>
        </div>
      ) : null}

      {!loading && !error && (dueTab === "all" || dueTab === "today") ? (
        <>
          {grouped.dueNow.length > 0 ? (
            <section className="ff-section" aria-labelledby="due-now">
              <h2 id="due-now" className="ff-section-title">
                Due Now
              </h2>
              <div className="ff-task-list">
                {grouped.dueNow.map((item) => (
                  <TaskCard key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          ) : null}
          {grouped.dueToday.length > 0 ? (
            <section className="ff-section" aria-labelledby="due-today">
              <h2 id="due-today" className="ff-section-title">
                Due Today
              </h2>
              <div className="ff-task-list">
                {grouped.dueToday.map((item) => (
                  <TaskCard key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          ) : null}
          {dueTab === "all" && grouped.upcoming.length > 0 ? (
            <section className="ff-section" aria-labelledby="upcoming">
              <h2 id="upcoming" className="ff-section-title">
                Upcoming
              </h2>
              <div className="ff-task-list">
                {grouped.upcoming.map((item) => (
                  <TaskCard key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          ) : null}
          {dueTab === "all" &&
          grouped.dueNow.length === 0 &&
          grouped.dueToday.length === 0 &&
          grouped.upcoming.length === 0 &&
          filtered.length > 0 ? (
            <div className="ff-task-list ff-section">
              {filtered.map((item) => (
                <TaskCard key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </div>
          ) : null}
        </>
      ) : !loading && !error ? (
        <div className="ff-task-list ff-section">
          {filtered.map((item) => (
            <TaskCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      ) : null}
    </>
  );
}
