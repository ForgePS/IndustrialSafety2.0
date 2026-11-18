"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useState, type PointerEvent } from "react";
import type { AnalyticsTrendPoint, SafetyIntelligenceReport } from "@/lib/safety-intelligence";
import { gradeBadgeClass } from "@/lib/safety-intelligence";
import {
  formatInsightDateRange,
  safetyIndexStrokeClass,
  safetyIndexView,
  type SafetyIndexPeriod,
  type SiteCount,
} from "@/lib/dashboard-insights";
import {
  fillHistoryYears,
  injuryHistoryChange,
  type InjuryHistoryChange,
  type InjuryHistorySeries,
  type InjuryHistoryYear,
} from "@/lib/injury-history";

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
  return formatInsightDateRange(start, end);
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
          points.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (points.length - 1)) * plotW;
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

        <path
          className="ind-dash-area__fill"
          d={areaPath}
          fill={`url(#ind-trend-fill-${gradId})`}
        />
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
        <div className="ind-dash-area__axis-chip" style={{ left: `${(active.x / width) * 100}%` }}>
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
          <Link
            className="small text-primary fw-semibold text-decoration-none"
            href="/modules/incidents/"
          >
            View incidents →
          </Link>
        </div>
        {points.length === 0 ? (
          <p className="text-muted mb-0">No incidents recorded in this date range.</p>
        ) : (
          <IncidentTrendChart points={points} />
        )}
      </div>
    </div>
  );
}

function SafetyIndexRing({ score, grade }: { score: number; grade: string }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div
      className="ind-safety-index__ring"
      role="img"
      aria-label={`Safety Index ${clamped}, grade ${grade}`}
    >
      <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden>
        <circle className="ind-safety-index__track" cx="84" cy="84" r={radius} />
        <circle
          className={`ind-safety-index__arc ${safetyIndexStrokeClass(grade)}`}
          cx="84"
          cy="84"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 84 84)"
        />
      </svg>
      <div className="ind-safety-index__value">
        <span className="ind-safety-index__score">{clamped}</span>
        <span className="ind-safety-index__grade">Grade {grade}</span>
      </div>
    </div>
  );
}

/**
 * Company Safety Index for the dashboard — 6 / 12 month toggle and score ring.
 */
export function SafetyIndexCard({
  report,
  showDotScore = true,
}: {
  report: SafetyIntelligenceReport | null;
  /** Hide DOT score when the user cannot open DOT Compliance. */
  showDotScore?: boolean;
}) {
  const [period, setPeriod] = useState<SafetyIndexPeriod>("6m");
  const view = safetyIndexView(report, period);
  const departmentScores = report && period === report.preset ? report.departmentScores : [];
  const topDepartments = departmentScores.slice(0, 5);

  return (
    <div className="card border shadow-none h-100 ind-safety-index">
      <div className="card-body p-4 d-flex flex-column h-100">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div className="btn-group btn-group-sm" role="group" aria-label="Safety Index period">
            <button
              type="button"
              className={`btn ${period === "6m" ? "btn-success" : "btn-outline-secondary"}`}
              aria-pressed={period === "6m"}
              onClick={() => setPeriod("6m")}
            >
              6 mo
            </button>
            <button
              type="button"
              className={`btn ${period === "1y" ? "btn-success" : "btn-outline-secondary"}`}
              aria-pressed={period === "1y"}
              onClick={() => setPeriod("1y")}
            >
              12 mo
            </button>
          </div>
          <Link
            className="small text-primary fw-semibold text-decoration-none"
            href="/modules/analytics/?tab=overview"
          >
            Analytics →
          </Link>
        </div>

        <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center py-2 gap-3">
          {view ? (
            <>
              <SafetyIndexRing score={view.score} grade={view.grade} />
              {showDotScore ? (
                <Link
                  href="/modules/dot-compliance/"
                  className="ind-safety-index__dot text-decoration-none"
                  title={
                    view.dotOpenItems === 1
                      ? "1 open DOT item"
                      : `${view.dotOpenItems} open DOT items`
                  }
                >
                  <span className="ind-safety-index__dot-label">DOT Score</span>
                  <span className="ind-safety-index__dot-value">{view.dotScore}%</span>
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-muted mb-0">No score available yet.</p>
          )}
        </div>

        {topDepartments.length > 0 ? (
          <div className="mt-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0 small text-uppercase text-muted">By department</h6>
              <Link href="/modules/analytics/?tab=overview" className="small text-decoration-none">
                View all
              </Link>
            </div>
            <ul className="list-unstyled mb-0">
              {topDepartments.map((dept) => (
                <li
                  key={dept.departmentId ?? `unassigned-${dept.departmentName}`}
                  className="d-flex justify-content-between align-items-center gap-2 py-1 border-top"
                >
                  <span className="small text-truncate">{dept.departmentName}</span>
                  <span className={`badge ${gradeBadgeClass(dept.safetyGrade)}`}>
                    {dept.safetyScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3">
          <h5 className="mb-1">Safety Index</h5>
          <p className="text-muted small mb-0">
            {view
              ? formatInsightDateRange(view.dateStart, view.dateEnd, view.periodLabel)
              : "Company safety score"}
          </p>
        </div>
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
          <Link
            className="small text-success fw-semibold text-decoration-none"
            href="/modules/tasks/"
          >
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
            <h5 className="mb-1">Inspections by Location</h5>
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
          <p className="text-muted mb-0">No inspections recorded for this period.</p>
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

const HISTORY_SERIES: Array<{ key: InjuryHistorySeries; label: string }> = [
  { key: "injuries", label: "Injuries" },
  { key: "lostTimeCases", label: "Lost-time cases" },
];

const HISTORY_RANGES = [3, 5, 10] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Current year stands out, last year is second, older years are muted context. */
function historyYearClass(year: number, currentYear: number): string {
  if (year === currentYear) return "is-current";
  if (year === currentYear - 1) return "is-previous";
  return "is-older";
}

/**
 * Smooth path that never overshoots the data (monotone cubic, Fritsch–Carlson),
 * so months with 0 stay on the baseline instead of dipping below it.
 */
function monotoneLinePath(points: Array<{ x: number; y: number }>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n < 3) return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1]!.x - points[i]!.x);
    slope.push((points[i + 1]!.y - points[i]!.y) / dx[i]!);
  }
  const m: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m.push(
      a * b <= 0
        ? 0
        : (3 * (dx[i - 1]! + dx[i]!)) /
            ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b),
    );
  }
  m.push(slope[n - 2]!);
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C ${p.x + h} ${p.y + m[i]! * h} ${q.x - h} ${q.y - m[i + 1]! * h} ${q.x} ${q.y}`;
  }
  return d;
}

/** Round axis ticks from 0 to a little above max (about 4 steps). */
function niceTicks(max: number): number[] {
  const raw = Math.max(1, max) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
  const top = Math.max(step, Math.ceil(Math.max(1, max) / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** Jan–Dec on the x axis, one line per year. */
function InjuryHistoryChart({
  years,
  series,
  currentYear,
  currentMonth,
}: {
  /** Oldest first. */
  years: InjuryHistoryYear[];
  series: InjuryHistorySeries;
  currentYear: number;
  /** 0-based month the current year has reached; later months are not drawn. */
  currentMonth: number;
}) {
  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  const width = 640;
  const height = 240;
  const pad = { top: 14, right: 16, bottom: 28, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const baseline = pad.top + plotH;

  const monthsFor = useCallback(
    (y: InjuryHistoryYear) =>
      y.year === currentYear ? y.months.slice(0, currentMonth + 1) : y.months,
    [currentYear, currentMonth],
  );

  const ticks = useMemo(
    () => niceTicks(Math.max(0, ...years.flatMap((y) => monthsFor(y).map((m) => m[series])))),
    [years, series, monthsFor],
  );
  const maxTick = ticks[ticks.length - 1]!;
  const xAt = (month: number) => pad.left + (month / 11) * plotW;
  const yAt = (v: number) => baseline - (v / maxTick) * plotH;

  // Older years first so the current year draws on top.
  const lines = years.map((y) => {
    const pts = monthsFor(y).map((m, i) => ({ x: xAt(i), y: yAt(m[series]) }));
    return {
      year: y.year,
      className: historyYearClass(y.year, currentYear),
      pts,
      d: monotoneLinePath(pts),
    };
  });

  const onMove = (ev: PointerEvent<SVGSVGElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * width;
    const month = Math.round(((x - pad.left) / plotW) * 11);
    setActiveMonth(Math.min(11, Math.max(0, month)));
  };

  const activeX = activeMonth != null ? xAt(activeMonth) : 0;
  const tooltipOnRight = activeX < width / 2;
  const newestFirst = [...years].reverse();
  const seriesLabel = HISTORY_SERIES.find((s) => s.key === series)!.label;

  return (
    <div className="ind-dash-area">
      <svg
        className="ind-dash-area__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${seriesLabel} by month for each year`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActiveMonth(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              className={t === 0 ? "ind-dash-history__baseline" : "ind-dash-area__grid"}
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(t)}
              y2={yAt(t)}
            />
            <text
              className="ind-dash-area__axis"
              x={pad.left - 10}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {t}
            </text>
          </g>
        ))}

        {activeMonth != null ? (
          <line
            className="ind-dash-area__crosshair"
            x1={activeX}
            x2={activeX}
            y1={pad.top}
            y2={baseline}
          />
        ) : null}

        {lines.map((line) => (
          <g key={line.year} className={`ind-dash-history ${line.className}`}>
            <path className="ind-dash-history__line" d={line.d} />
            {line.pts.map((p, i) =>
              i === activeMonth ||
              (activeMonth == null && line.year === currentYear && i === line.pts.length - 1) ? (
                <circle
                  key={i}
                  className="ind-dash-history__dot is-active"
                  cx={p.x}
                  cy={p.y}
                  r={4.5}
                />
              ) : null,
            )}
          </g>
        ))}

        {MONTH_LABELS.map((label, i) => (
          <text
            key={label}
            className={`ind-dash-area__axis ${activeMonth === i ? "is-strong" : ""}`}
            x={xAt(i)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : i === 11 ? "end" : "middle"}
          >
            {label}
          </text>
        ))}
      </svg>

      {activeMonth != null ? (
        <div
          className="ind-dash-area__tooltip"
          style={{
            left: `${((activeX + (tooltipOnRight ? 12 : -12)) / width) * 100}%`,
            top: 0,
            transform: tooltipOnRight ? "none" : "translateX(-100%)",
          }}
        >
          <div className="ind-dash-area__tooltip-title">
            {MONTH_NAMES[activeMonth]} · {seriesLabel}
          </div>
          {newestFirst.map((y) => {
            const notYet = y.year === currentYear && activeMonth > currentMonth;
            const m = y.months[activeMonth]!;
            return (
              <div key={y.year} className="ind-dash-area__tooltip-row">
                <span
                  className={`ind-dash-area__tooltip-swatch ind-dash-history__swatch ${historyYearClass(y.year, currentYear)}`}
                  aria-hidden="true"
                />
                <span>
                  {y.year}: <strong>{notYet ? "—" : m[series]}</strong>
                  {!notYet && series === "lostTimeCases" && m.daysAway > 0 ? (
                    <span className="text-muted"> ({m.daysAway} days away)</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <table className="visually-hidden">
        <caption>{seriesLabel} by month for each year</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {years.map((y) => (
              <th key={y.year} scope="col">
                {y.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONTH_NAMES.map((name, i) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              {years.map((y) => (
                <td key={y.year}>
                  {y.year === currentYear && i > currentMonth ? "" : y.months[i]![series]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryChangeBadge({
  label,
  change,
}: {
  label: string;
  change: InjuryHistoryChange | null;
}) {
  if (!change) return null;
  // Fewer injuries is progress, so "down" is shown as good.
  const tone =
    change.direction === "down"
      ? "bg-label-success"
      : change.direction === "up"
        ? "bg-label-danger"
        : "bg-label-secondary";
  const arrow = change.direction === "down" ? "↓" : change.direction === "up" ? "↑" : "→";
  const amount =
    change.percent != null ? `${Math.abs(change.percent)}%` : `${change.from} → ${change.to}`;
  return (
    <span
      className={`badge ${tone}`}
      title={`${label}: ${change.from} in ${change.fromYear}, ${change.to} in ${change.toYear}`}
    >
      {label} {arrow} {amount} vs {change.fromYear}
    </span>
  );
}

/**
 * Month-by-month injuries (or lost-time cases) with one line per year,
 * to show progress in preventing accidents.
 */
export function InjuryHistoryCard({
  years,
  currentYear = new Date().getFullYear(),
  currentMonth = new Date().getMonth(),
}: {
  years: InjuryHistoryYear[];
  currentYear?: number;
  currentMonth?: number;
}) {
  const [range, setRange] = useState<HistoryRange>(3);
  const [series, setSeries] = useState<InjuryHistorySeries>("injuries");
  const shown = useMemo(
    () => fillHistoryYears(years, currentYear, range),
    [years, currentYear, range],
  );
  // Badges compare real years only, not the zero years added to fill the range.
  const change = injuryHistoryChange(years, series, currentYear);
  const seriesLabel = HISTORY_SERIES.find((s) => s.key === series)!.label;

  return (
    <div className="card border shadow-none h-100">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h5 className="mb-1">Injury History</h5>
            <p className="text-muted small mb-0">{seriesLabel} by month, one line per year</p>
          </div>
          <Link
            className="small text-primary fw-semibold text-decoration-none"
            href="/modules/osha/"
          >
            View OSHA log →
          </Link>
        </div>
        {years.length === 0 ? (
          <p className="text-muted mb-0">No injuries or OSHA cases recorded yet.</p>
        ) : (
          <>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <div className="btn-group btn-group-sm" role="group" aria-label="What to show">
                {HISTORY_SERIES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`btn ${series === s.key ? "btn-primary" : "btn-outline-secondary"}`}
                    aria-pressed={series === s.key}
                    onClick={() => setSeries(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Years shown">
                {HISTORY_RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`btn ${range === r ? "btn-primary" : "btn-outline-secondary"}`}
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                  >
                    {r} yrs
                  </button>
                ))}
              </div>
              <HistoryChangeBadge label={seriesLabel} change={change} />
            </div>
            <div className="d-flex flex-wrap align-items-center gap-3 mb-1 small">
              {[...shown].reverse().map((y) => (
                <span key={y.year} className="d-inline-flex align-items-center gap-1">
                  <span
                    className={`ind-dash-area__tooltip-swatch ind-dash-history__swatch ${historyYearClass(y.year, currentYear)}`}
                    aria-hidden="true"
                  />
                  {y.year === currentYear ? `${y.year} YTD` : y.year}
                  <span className="text-muted">({y[series]})</span>
                </span>
              ))}
            </div>
            <InjuryHistoryChart
              years={shown}
              series={series}
              currentYear={currentYear}
              currentMonth={currentMonth}
            />
          </>
        )}
      </div>
    </div>
  );
}
