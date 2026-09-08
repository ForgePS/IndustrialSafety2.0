"use client";

import Link from "next/link";
import {
  useModuleSummaryCaption,
  useModuleSummaryWidget,
} from "@/hooks/use-module-summary-widget";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_VIEW_LABELS } from "@/lib/workspace/types";

type Props = {
  moduleKey: string;
  size: WorkspaceWidgetSize;
  view: string | undefined;
  views: readonly string[];
  onViewChange: (view: string) => void;
  moduleRoute: string;
  moduleLabel: string;
};

function toneClass(tone?: "danger" | "warning" | "muted"): string {
  if (tone === "danger") return "text-danger";
  if (tone === "warning") return "text-warning";
  return "text-muted";
}

function maxRowsForSize(size: WorkspaceWidgetSize): number {
  if (size === "medium") return 5;
  if (size === "wide") return 8;
  return 12;
}

/**
 * Compact live caption for Phase 6 summary modules.
 */
export function SummaryCompactCaption({
  moduleKey,
  fallback,
}: {
  moduleKey: string;
  fallback: string;
}) {
  const { label, status } = useModuleSummaryCaption(moduleKey, true);
  if (status === "loading") return <>Loading…</>;
  if (status === "error") return <>{fallback}</>;
  return <>{label || fallback}</>;
}

/**
 * Expanded summary list widget shared by Inspections, Training, Documents, etc.
 */
export function SummaryWorkspaceWidget({
  moduleKey,
  size,
  view,
  views,
  onViewChange,
  moduleRoute,
  moduleLabel,
}: Props) {
  const activeView = view && views.includes(view) ? view : (views[0] ?? "");
  const { status, error, payload, refresh } = useModuleSummaryWidget(
    moduleKey,
    activeView,
    true,
  );
  const showStats = size === "medium" || size === "wide" || size === "large" || size === "full";
  const useSelect = views.length > 1 && size === "medium";
  const showTabs = views.length > 1 && !useSelect;
  const maxRows = maxRowsForSize(size);
  const rows = (payload?.rows ?? []).slice(0, maxRows);

  return (
    <div className="forge-ws-summary d-flex flex-column h-100 min-h-0">
      {showTabs ? (
        <div
          className="btn-group btn-group-sm flex-wrap mb-2"
          role="group"
          aria-label={`${moduleLabel} view`}
        >
          {views.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`btn ${activeView === tab ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onViewChange(tab)}
            >
              {WORKSPACE_VIEW_LABELS[tab] ?? tab}
            </button>
          ))}
        </div>
      ) : null}

      {useSelect ? (
        <select
          className="form-select form-select-sm mb-2"
          aria-label={`${moduleLabel} view`}
          value={activeView}
          onChange={(event) => onViewChange(event.target.value)}
        >
          {views.map((tab) => (
            <option key={tab} value={tab}>
              {WORKSPACE_VIEW_LABELS[tab] ?? tab}
            </option>
          ))}
        </select>
      ) : null}

      {showStats && status !== "loading" && status !== "error" && payload?.stats?.length ? (
        <div className="d-flex flex-wrap gap-3 small mb-2">
          {payload.stats.map((stat) => (
            <span key={stat.label} className={toneClass(stat.tone)}>
              <strong className="text-heading me-1">{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex-grow-1 overflow-auto forge-ws-summary-scroll min-h-0">
        {status === "loading" ? <p className="text-muted small mb-0">Loading…</p> : null}

        {status === "error" ? (
          <div>
            <p className="text-danger small mb-2">{error ?? "Unable to load."}</p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void refresh()}
              >
                Try Again
              </button>
              <Link href={moduleRoute} className="btn btn-sm btn-outline-primary">
                Open {moduleLabel}
              </Link>
            </div>
          </div>
        ) : null}

        {status === "empty" ? (
          <p className="text-muted small mb-0">{payload?.emptyLabel ?? "Nothing to show."}</p>
        ) : null}

        {status === "loaded"
          ? rows.map((row) => (
              <div key={row.id} className="forge-ws-summary-row py-2 border-bottom">
                <Link
                  href={row.href}
                  className="d-block small fw-semibold text-heading text-truncate text-decoration-none"
                  title={row.title}
                >
                  {row.title}
                </Link>
                {(row.meta || row.badge) && (
                  <div className={`small ${toneClass(row.tone)}`}>
                    {row.badge ? <span className="me-2 text-uppercase">{row.badge}</span> : null}
                    {row.meta}
                  </div>
                )}
              </div>
            ))
          : null}
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
        <span className="text-muted small">
          {status === "loaded" && payload
            ? `${Math.min(rows.length, payload.rows.length)} of ${payload.rows.length}`
            : "\u00a0"}
        </span>
        <Link href={moduleRoute} className="small">
          View All {moduleLabel} →
        </Link>
      </div>
    </div>
  );
}
