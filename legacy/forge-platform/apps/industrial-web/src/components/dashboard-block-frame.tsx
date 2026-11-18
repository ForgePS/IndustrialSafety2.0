"use client";

import { useRef, type ReactNode } from "react";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { WORKSPACE_SIZE_LABELS } from "@/lib/workspace/types";
import {
  dashboardBlockSpan,
  getDashboardBlock,
  type DashboardBlockId,
  type DashboardLayoutItem,
} from "@/lib/dashboard-layout";

type Props = {
  item: DashboardLayoutItem;
  editing: boolean;
  children: ReactNode;
  /** When false, block is unavailable (no data / no permission) — skip render. */
  available?: boolean;
  onSizeChange: (size: WorkspaceWidgetSize) => void;
  onHide: () => void;
  onMove: (direction: "up" | "down" | "top" | "bottom") => void;
  onDragStart: (id: DashboardBlockId) => void;
  onDragOver: (id: DashboardBlockId) => void;
  onDragEnd: () => void;
};

/**
 * Chrome around a dashboard block: drag handle, size, hide — used in customize mode.
 * Drag starts only from the ≡ handle so nested widgets stay interactive.
 */
export function DashboardBlockFrame({
  item,
  editing,
  children,
  available = true,
  onSizeChange,
  onHide,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: Props) {
  const allowDragRef = useRef(false);
  if (!available) return null;
  const def = getDashboardBlock(item.id);
  if (!def) return null;
  const span = dashboardBlockSpan(item.size);

  return (
    <div
      className={`forge-ws-cell forge-ws-span-${span} forge-dash-block`}
      data-block-id={item.id}
      draggable={editing}
      onDragStart={(event) => {
        if (!editing || !allowDragRef.current) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart(item.id);
      }}
      onDragOver={(event) => {
        if (!editing) return;
        event.preventDefault();
        onDragOver(item.id);
      }}
      onDragEnd={() => {
        allowDragRef.current = false;
        onDragEnd();
      }}
    >
      {editing ? (
        <div className="card h-100 forge-dash-block-chrome">
          <div className="card-body p-3 d-flex flex-column gap-2 forge-ws-card-edit">
            <div className="forge-ws-card-edit__header">
              <button
                type="button"
                className="btn btn-sm btn-icon forge-ws-drag text-muted flex-shrink-0"
                title="Drag to reorder"
                aria-label={`Drag ${def.label}`}
                onMouseDown={() => {
                  allowDragRef.current = true;
                }}
                onTouchStart={() => {
                  allowDragRef.current = true;
                }}
                onMouseUp={() => {
                  allowDragRef.current = false;
                }}
              >
                <i className="bx bx-menu" aria-hidden="true" />
              </button>
              <span className="fw-semibold forge-ws-card-edit__title" title={def.label}>
                {def.label}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-icon rounded-pill text-danger flex-shrink-0"
                aria-label={`Hide ${def.label}`}
                onClick={onHide}
              >
                <i className="bx bx-x bx-sm" aria-hidden="true" />
              </button>
            </div>
            <div className="forge-ws-card-edit__controls">
              <select
                className="form-select form-select-sm"
                aria-label={`${def.label} size`}
                value={item.size}
                onChange={(event) => onSizeChange(event.target.value as WorkspaceWidgetSize)}
              >
                {def.supportedSizes.map((size) => (
                  <option key={size} value={size}>
                    {WORKSPACE_SIZE_LABELS[size]}
                  </option>
                ))}
              </select>
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  aria-label={`Move ${def.label} up`}
                  onClick={() => onMove("up")}
                >
                  <i className="bx bx-up-arrow-alt" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  aria-label={`Move ${def.label} down`}
                  onClick={() => onMove("down")}
                >
                  <i className="bx bx-down-arrow-alt" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="forge-dash-block-preview min-h-0 flex-grow-1">{children}</div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
