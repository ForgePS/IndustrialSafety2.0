"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AnalyticsTrendPoint } from "@/lib/safety-intelligence";

export type SiteCount = { label: string; count: number };
export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  deadlineDate?: string | null;
  assigneeName?: string | null;
  overdue?: boolean;
};

function formatRangeLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    if (!iso) return "";
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || "Last 6 months";
}

function monthShort(month: string): string {
  // "2026-08" → "Aug 26"
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return month;
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${String(y).slice(2)}`;
}

/**
 * Horizontal segmented monthly bars — matches the Safety Intelligence trend card look.
 */
export function IncidentTrendCard({
  points,
  dateStart,
  dateEnd,
}: {
  points: AnalyticsTrendPoint[];
  dateStart: string;
  dateEnd: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="card border shadow-none">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h5 className="mb-1">Incident Trend</h5>
            <p className="text-muted small mb-0">{formatRangeLabel(dateStart, dateEnd)}</p>
          </div>
          <Link className="small text-success fw-semibold text-decoration-none" href="/modules/incidents/">
            View incidents →
          </Link>
        </div>
        {points.length === 0 ? (
          <p className="text-muted mb-0">No data recorded yet.</p>
        ) : (
          <div className="ind-dash-trend" role="img" aria-label="Incident counts by month">
            {points.map((point) => {
              const heightPct = Math.max(8, Math.round((point.count / max) * 100));
              return (
                <div className="ind-dash-trend__col" key={point.month}>
                  <span className="ind-dash-trend__value">{point.count}</span>
                  <div className="ind-dash-trend__track">
                    <div className="ind-dash-trend__bar" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="ind-dash-trend__label">{monthShort(point.month)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskSchedulerCard({ tasks }: { tasks: DashboardTask[] }) {
  const open = useMemo(
    () =>
      tasks
        .filter((t) => {
          const s = t.status.toLowerCase();
          return s !== "complete" && s !== "completed" && s !== "closed" && s !== "done";
        })
        .slice(0, 4),
    [tasks],
  );

  return (
    <div className="card border shadow-none">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h5 className="mb-1">Task Scheduler</h5>
            <p className="text-muted small mb-0">Assigned work, acknowledgments, and deadlines.</p>
          </div>
          <Link className="small text-success fw-semibold text-decoration-none" href="/modules/tasks/">
            View all tasks →
          </Link>
        </div>
        {open.length === 0 ? (
          <div className="ind-dash-empty rounded p-4 text-center">
            <p className="text-muted mb-3">No tasks scheduled yet.</p>
            <Link className="btn btn-success" href="/modules/tasks/">
              Open Task Scheduler
            </Link>
          </div>
        ) : (
          <ul className="list-group list-group-flush">
            {open.map((task) => (
              <li
                key={task.id}
                className="list-group-item px-0 d-flex justify-content-between align-items-start gap-2"
              >
                <div className="min-w-0">
                  <span className="fw-semibold d-block text-truncate">{task.title}</span>
                  <span className="text-muted small">
                    {task.assigneeName ? `${task.assigneeName} · ` : ""}
                    {task.deadlineDate ? `Due ${task.deadlineDate.slice(0, 10)}` : task.status}
                  </span>
                </div>
                {task.overdue ? (
                  <span className="badge bg-label-danger">Overdue</span>
                ) : (
                  <span className="badge bg-label-secondary">{task.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function InspectionsBySiteCard({
  sites,
  dateStart,
  dateEnd,
}: {
  sites: SiteCount[];
  dateStart: string;
  dateEnd: string;
}) {
  const max = Math.max(1, ...sites.map((s) => s.count));
  return (
    <div className="card border shadow-none">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h5 className="mb-1">Inspections by Site</h5>
            <p className="text-muted small mb-0">{formatRangeLabel(dateStart, dateEnd)}</p>
          </div>
          <Link
            className="small text-success fw-semibold text-decoration-none"
            href="/modules/inspections/"
          >
            View inspections →
          </Link>
        </div>
        {sites.length === 0 ? (
          <p className="text-muted mb-0">No data recorded yet.</p>
        ) : (
          <ul className="list-unstyled mb-0 ind-dash-sites">
            {sites.map((site) => (
              <li key={site.label} className="ind-dash-sites__row">
                <div className="d-flex justify-content-between gap-2 mb-1">
                  <span className="text-truncate">{site.label}</span>
                  <span className="fw-semibold">{site.count}</span>
                </div>
                <div className="progress" style={{ height: "0.4rem" }}>
                  <div
                    className="progress-bar bg-success"
                    role="progressbar"
                    style={{ width: `${Math.round((site.count / max) * 100)}%` }}
                    aria-valuenow={site.count}
                    aria-valuemin={0}
                    aria-valuemax={max}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
