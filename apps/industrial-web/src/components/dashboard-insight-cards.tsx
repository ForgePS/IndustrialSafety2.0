"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useState, type PointerEvent } from "react";
import type { AnalyticsTrendPoint } from "@/lib/safety-intelligence";
import type { SiteCount } from "@/lib/dashboard-insights";

export type { SiteCount } from "@/lib/dashboard-insights";
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

function monthAxisLabel(month: string): string {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "short" });
}

/** Smooth cubic path through points (Catmull-Rom → cubic Bézier). */
function smoothLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function IncidentTrendChart({ points }: { points: AnalyticsTrendPoint[] }) {
  const gradId = useId().replace(/:/g, "");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 32, left: 12 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...points.map((p) => p.count));
  const coords = useMemo(
    () =>
      points.map((p, i) => {
        const x =
          points.length === 1
            ? pad.left + plotW / 2
            : pad.left + (i / (points.length - 1)) * plotW;
        const y = pad.top + plotH - (p.count / max) * plotH;
        return { x, y, ...p, label: monthAxisLabel(p.month) };
      }),
    [points, max, pad.left, pad.top, plotW, plotH],
  );

  const linePath = useMemo(() => smoothLinePath(coords), [coords]);
  const areaPath = useMemo(() => {
    if (coords.length === 0) return "";
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    const baseline = pad.top + plotH;
    return `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  }, [coords, linePath, pad.top, plotH]);

  const gridYs = [0.25, 0.5, 0.75, 1].map((t) => pad.top + plotH * (1 - t));

  const onMove = useCallback(
    (ev: PointerEvent<SVGSVGElement>) => {
      const svg = ev.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * width;
      if (coords.length === 0) return;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const dist = Math.abs(coords[i]!.x - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      setActiveIndex(best);
    },
    [coords],
  );

  const active = activeIndex != null ? coords[activeIndex] : null;
  const last = coords[coords.length - 1];

  return (
    <div className="ind-dash-area">
      <svg
        className="ind-dash-area__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Incident counts by month"
        onPointerMove={onMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={`ind-trend-fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bs-primary, #696cff)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--bs-primary, #696cff)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridYs.map((y) => (
          <line
            key={y}
            className="ind-dash-area__grid"
            x1={pad.left}
            x2={width - pad.right}
            y1={y}
            y2={y}
          />
        ))}

        <path className="ind-dash-area__fill" d={areaPath} fill={`url(#ind-trend-fill-${gradId})`} />
        <path className="ind-dash-area__line" d={linePath} />

        {last ? (
          <circle
            className="ind-dash-area__dot"
            cx={last.x}
            cy={last.y}
            r={activeIndex === coords.length - 1 ? 5 : 4}
          />
        ) : null}

        {active ? (
          <>
            <line
              className="ind-dash-area__crosshair"
              x1={active.x}
              x2={active.x}
              y1={pad.top}
              y2={pad.top + plotH}
            />
            <circle className="ind-dash-area__dot is-active" cx={active.x} cy={active.y} r={5} />
          </>
        ) : null}

        {coords.map((c) => (
          <text
            key={c.month}
            className={`ind-dash-area__axis ${active?.month === c.month ? "is-active" : ""}`}
            x={c.x}
            y={height - 8}
            textAnchor="middle"
          >
            {c.label}
          </text>
        ))}
      </svg>

      {active ? (
        <div
          className="ind-dash-area__tooltip"
          style={{
            left: `${(active.x / width) * 100}%`,
            top: `${(active.y / height) * 100}%`,
          }}
        >
          <div className="ind-dash-area__tooltip-title">{active.label}</div>
          <div className="ind-dash-area__tooltip-row">
            <span className="ind-dash-area__tooltip-swatch" aria-hidden="true" />
            <span>
              Incidents: <strong>{active.count}</strong>
            </span>
          </div>
        </div>
      ) : null}

      {active ? (
        <div
          className="ind-dash-area__axis-chip"
          style={{ left: `${(active.x / width) * 100}%` }}
        >
          {active.label}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Smooth area chart with hover crosshair — monthly incident totals.
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
  return (
    <div className="card border shadow-none h-100">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h5 className="mb-1">Incident Trend</h5>
            <p className="text-muted small mb-0">{formatRangeLabel(dateStart, dateEnd)}</p>
          </div>
          <Link className="small text-primary fw-semibold text-decoration-none" href="/modules/incidents/">
            View incidents →
          </Link>
        </div>
        {points.length === 0 ? (
          <p className="text-muted mb-0">No data recorded yet.</p>
        ) : (
          <IncidentTrendChart points={points} />
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
            className="small text-primary fw-semibold text-decoration-none"
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
                    className="progress-bar bg-primary"
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
