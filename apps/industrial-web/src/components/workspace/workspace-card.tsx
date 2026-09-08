"use client";

import Link from "next/link";
import type { WorkspaceLayoutItem, WorkspaceModuleDefinition, WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_SIZE_LABELS, WORKSPACE_VIEW_LABELS } from "@/lib/workspace/types";
import { workspaceMinHeight } from "@/lib/workspace/sizing";
import { calendarCreateHref } from "@/lib/calendar/types";
import { tasksCreateHref } from "@/lib/tasks/types";
import { remindersCreateHref } from "@/lib/reminders/types";
import { WorkspaceCardMenu, type WorkspaceMenuEntry } from "./workspace-card-menu";
import { WorkspaceErrorBoundary } from "./workspace-error-boundary";
import { isSummaryWidgetModule } from "@/lib/workspace/module-summary-loaders";
import { CalendarCompactCaption, CalendarWorkspaceWidget } from "./widgets/calendar-widget";
import { TasksCompactCaption, TasksWorkspaceWidget } from "./widgets/tasks-widget";
import { RemindersCompactCaption, RemindersWorkspaceWidget } from "./widgets/reminders-widget";
import { SummaryCompactCaption, SummaryWorkspaceWidget } from "./widgets/summary-widget";

const TILE_TONES = [
  "primary",
  "info",
  "success",
  "warning",
  "danger",
  "secondary",
] as const;

function toneForCode(code: string): (typeof TILE_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash + code.charCodeAt(i) * (i + 1)) % TILE_TONES.length;
  }
  return TILE_TONES[hash] ?? "primary";
}

type Props = {
  definition: WorkspaceModuleDefinition;
  item: WorkspaceLayoutItem;
  caption: string;
  editing: boolean;
  dragEnabled: boolean;
  canHide?: boolean;
  canResize?: boolean;
  onSizeChange: (size: WorkspaceWidgetSize) => void;
  onViewChange: (view: string) => void;
  onHide: () => void;
  onReset: () => void;
  onExpand: () => void;
  onMove: (direction: "up" | "down" | "top" | "bottom") => void;
  onDragStart: (moduleKey: string) => void;
  onDragOver: (moduleKey: string) => void;
  onDragEnd: () => void;
};

function openRouteForModule(definition: WorkspaceModuleDefinition): string {
  if (definition.key === "CORRECTIVE_ACTIONS") return "/modules/inspections";
  return definition.route;
}

function buildMenuEntries(params: {
  definition: WorkspaceModuleDefinition;
  item: WorkspaceLayoutItem;
  canHide: boolean;
  canResize: boolean;
  onSizeChange: (size: WorkspaceWidgetSize) => void;
  onViewChange: (view: string) => void;
  onHide: () => void;
  onReset: () => void;
  onMove: (direction: "up" | "down" | "top" | "bottom") => void;
}): WorkspaceMenuEntry[] {
  const { definition, item, canHide, canResize, onSizeChange, onViewChange, onHide, onReset, onMove } =
    params;
  const openRoute = openRouteForModule(definition);
  const entries: WorkspaceMenuEntry[] = [
    {
      type: "action",
      id: "open",
      label: "Open",
      onClick: () => {
        window.location.assign(openRoute);
      },
    },
    {
      type: "action",
      id: "open-tab",
      label: "Open in New Tab",
      onClick: () => {
        window.open(openRoute, "_blank", "noopener,noreferrer");
      },
    },
  ];

  if (definition.key === "CALENDAR") {
    entries.push({
      type: "action",
      id: "create-event",
      label: "+ Event",
      onClick: () => {
        window.location.assign(calendarCreateHref());
      },
    });
  }

  if (definition.key === "TASKS") {
    entries.push({
      type: "action",
      id: "create-task",
      label: "+ Task",
      onClick: () => {
        window.location.assign(tasksCreateHref());
      },
    });
  }

  if (definition.key === "REMINDERS") {
    entries.push({
      type: "action",
      id: "create-reminder",
      label: "+ Reminder",
      onClick: () => {
        window.location.assign(remindersCreateHref());
      },
    });
  }

  entries.push({ type: "divider", id: "d1" }, { type: "label", id: "size-label", label: "Widget Size" });
  if (canResize) {
    entries.push(
      ...definition.supportedSizes.map((size) => ({
        type: "action" as const,
        id: `size-${size}`,
        label: `${WORKSPACE_SIZE_LABELS[size]}${item.size === size ? " ✓" : ""}`,
        onClick: () => onSizeChange(size),
      })),
    );
  } else {
    entries.push({
      type: "action",
      id: "size-locked",
      label: `${WORKSPACE_SIZE_LABELS[item.size]} (locked)`,
      disabled: true,
      onClick: () => undefined,
    });
  }

  if (definition.supportedViews && definition.supportedViews.length > 0) {
    entries.push(
      { type: "divider", id: "d2" },
      { type: "label", id: "view-label", label: "Default View" },
      ...definition.supportedViews.map((view) => ({
        type: "action" as const,
        id: `view-${view}`,
        label: `${WORKSPACE_VIEW_LABELS[view] ?? view}${item.defaultView === view ? " ✓" : ""}`,
        onClick: () => onViewChange(view),
      })),
    );
  }

  entries.push(
    { type: "divider", id: "d3" },
    { type: "label", id: "move-label", label: "Move" },
    { type: "action", id: "move-up", label: "Move Up", onClick: () => onMove("up") },
    { type: "action", id: "move-down", label: "Move Down", onClick: () => onMove("down") },
    { type: "action", id: "move-top", label: "Move to Top", onClick: () => onMove("top") },
    { type: "action", id: "move-bottom", label: "Move to Bottom", onClick: () => onMove("bottom") },
    { type: "divider", id: "d4" },
  );
  if (canHide) {
    entries.push({
      type: "action",
      id: "hide",
      label: "Hide from Workspace",
      danger: true,
      onClick: onHide,
    });
  } else {
    entries.push({
      type: "action",
      id: "hide-locked",
      label: "Required (cannot hide)",
      disabled: true,
      onClick: () => undefined,
    });
  }
  entries.push({ type: "action", id: "reset", label: "Reset Widget", onClick: onReset });

  return entries;
}

/**
 * Workspace module card — compact launcher or live widget shell.
 */
export function WorkspaceCard(props: Props) {
  const {
    definition,
    item,
    caption,
    editing,
    dragEnabled,
    canHide = true,
    canResize = true,
    onSizeChange,
    onViewChange,
    onHide,
    onReset,
    onExpand,
    onMove,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = props;

  const tone = toneForCode(definition.key);
  const isCompact = item.size === "compact";
  const isCalendar = definition.key === "CALENDAR";
  const isTasks = definition.key === "TASKS";
  const isReminders = definition.key === "REMINDERS";
  const isSummary = isSummaryWidgetModule(definition.key);
  /** Corrective Actions has no dedicated module page yet — open Inspections. */
  const openRoute =
    definition.key === "CORRECTIVE_ACTIONS" ? "/modules/inspections" : definition.route;
  const canExpand =
    canResize &&
    definition.widgetEnabled &&
    Boolean(definition.expandSize) &&
    item.size === "compact" &&
    definition.supportedSizes.includes(definition.expandSize!);

  const menuEntries = buildMenuEntries({
    definition,
    item,
    canHide,
    canResize,
    onSizeChange,
    onViewChange,
    onHide,
    onReset,
    onMove,
  });

  const actions = !editing ? (
    <div className="forge-ws-card-actions d-flex align-items-center gap-1 flex-shrink-0">
      {canExpand ? (
        <button
          type="button"
          className="btn btn-sm btn-icon rounded-pill text-muted"
          aria-label={`Expand ${definition.label}`}
          title="Expand widget"
          onClick={onExpand}
        >
          <i className="bx bx-expand-alt" aria-hidden="true" />
        </button>
      ) : null}
      <WorkspaceCardMenu ariaLabel={`${definition.label} options`} entries={menuEntries} />
    </div>
  ) : null;

  const compactCaption = isCalendar ? (
    <CalendarCompactCaption fallback={caption} />
  ) : isTasks ? (
    <TasksCompactCaption fallback={caption} />
  ) : isReminders ? (
    <RemindersCompactCaption fallback={caption} />
  ) : isSummary ? (
    <SummaryCompactCaption moduleKey={definition.key} fallback={caption} />
  ) : (
    caption
  );

  return (
    <WorkspaceErrorBoundary title={definition.label}>
      <div
        className={`card h-100 position-relative forge-ws-card forge-ws-card--${item.size}`}
        style={{ minHeight: workspaceMinHeight(item.size) }}
        draggable={dragEnabled}
        onDragStart={(event) => {
          if (!dragEnabled) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", definition.key);
          onDragStart(definition.key);
        }}
        onDragOver={(event) => {
          if (!dragEnabled) return;
          event.preventDefault();
          onDragOver(definition.key);
        }}
        onDragEnd={() => onDragEnd()}
        data-module-key={definition.key}
        data-size={item.size}
      >
        {editing ? (
          <div className="card-body p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="forge-ws-drag text-muted" aria-hidden="true" title="Drag to reorder">
                <i className="bx bx-menu" />
              </span>
              <span className="fw-semibold text-truncate flex-grow-1">{definition.label}</span>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto", maxWidth: "8rem" }}
                aria-label={`${definition.label} size`}
                value={item.size}
                disabled={!canResize}
                onChange={(event) => onSizeChange(event.target.value as WorkspaceWidgetSize)}
              >
                {definition.supportedSizes.map((size) => (
                  <option key={size} value={size}>
                    {WORKSPACE_SIZE_LABELS[size]}
                  </option>
                ))}
              </select>
              {canHide ? (
                <button
                  type="button"
                  className="btn btn-sm btn-icon rounded-pill text-danger"
                  aria-label={`Hide ${definition.label}`}
                  onClick={onHide}
                >
                  <i className="bx bx-x bx-sm" aria-hidden="true" />
                </button>
              ) : (
                <span className="badge bg-label-secondary" title="Required by company policy">
                  Required
                </span>
              )}
            </div>
            <span className="text-muted small text-truncate" title={caption}>
              {caption}
            </span>
          </div>
        ) : isCompact ? (
          <div className="card-body p-3 h-100 position-relative">
            <div className="position-absolute top-0 end-0 m-1" style={{ zIndex: 2 }}>
              {actions}
            </div>
            <Link
              href={openRoute}
              className="text-decoration-none d-block pe-5"
              title={`${definition.label}`}
            >
              <div className="avatar avatar-sm mb-2">
                <span className={`avatar-initial rounded bg-label-${tone}`}>
                  <i className={`bx ${definition.icon}`} aria-hidden="true" />
                </span>
              </div>
              <span className="d-block fw-semibold text-heading text-truncate" title={definition.label}>
                {definition.label}
              </span>
              <span className="d-block text-muted small text-truncate">{compactCaption}</span>
            </Link>
          </div>
        ) : (
          <div className="card-body p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
              <div className="d-flex align-items-center gap-2 min-w-0">
                <div className="avatar avatar-sm flex-shrink-0">
                  <span className={`avatar-initial rounded bg-label-${tone}`}>
                    <i className={`bx ${definition.icon}`} aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0">
                  <Link
                    href={openRoute}
                    className="d-block fw-semibold text-heading text-truncate text-decoration-none"
                    title={definition.label}
                  >
                    {definition.label}
                  </Link>
                </div>
              </div>
              {actions}
            </div>
            <div className="forge-ws-widget-body flex-grow-1 d-flex flex-column min-h-0">
              {isCalendar ? (
                <CalendarWorkspaceWidget
                  size={item.size}
                  view={item.defaultView}
                  onViewChange={onViewChange}
                  moduleRoute={definition.route}
                />
              ) : isTasks ? (
                <TasksWorkspaceWidget
                  size={item.size}
                  view={item.defaultView}
                  onViewChange={onViewChange}
                  moduleRoute={definition.route}
                />
              ) : isReminders ? (
                <RemindersWorkspaceWidget
                  size={item.size}
                  view={item.defaultView}
                  onViewChange={onViewChange}
                  moduleRoute={definition.route}
                />
              ) : isSummary ? (
                <SummaryWorkspaceWidget
                  moduleKey={definition.key}
                  size={item.size}
                  view={item.defaultView}
                  views={definition.supportedViews ?? []}
                  onViewChange={onViewChange}
                  moduleRoute={openRoute}
                  moduleLabel={definition.label}
                />
              ) : definition.widgetEnabled ? (
                <>
                  <p className="text-muted small mb-2">{caption}</p>
                  <p className="text-muted small mb-auto">
                    Live widget content will appear here. Size and layout are ready.
                  </p>
                  <Link href={definition.route} className="small mt-2 align-self-start">
                    Open {definition.label} →
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-muted small mb-auto">Open this module to work with its records.</p>
                  <Link href={definition.route} className="small mt-2 align-self-start">
                    Open {definition.label} →
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </WorkspaceErrorBoundary>
  );
}
