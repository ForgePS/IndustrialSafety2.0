import type { WorkspaceWidgetSize } from "./types";
import { WORKSPACE_WIDGET_SIZES } from "./types";

/** Spec grid: Compact 1×1, Medium 2×2, Wide 3×2, Large 3×3, Full 6×2–3. */
const SIZE_COLUMNS: Record<WorkspaceWidgetSize, number> = {
  compact: 1,
  medium: 2,
  wide: 3,
  large: 3,
  full: 6,
};

const SIZE_ROWS: Record<WorkspaceWidgetSize, number> = {
  compact: 1,
  medium: 2,
  wide: 2,
  large: 3,
  full: 3,
};

/** Base row unit for min-height calculations. */
const ROW_UNIT_PX = 88;

export function workspaceColumnSpan(size: WorkspaceWidgetSize): number {
  return SIZE_COLUMNS[size];
}

export function workspaceRowSpan(size: WorkspaceWidgetSize): number {
  return SIZE_ROWS[size];
}

export function workspaceMinHeight(size: WorkspaceWidgetSize): string {
  return `calc(${SIZE_ROWS[size]} * ${ROW_UNIT_PX}px)`;
}

export function isWorkspaceWidgetSize(value: unknown): value is WorkspaceWidgetSize {
  return typeof value === "string" && (WORKSPACE_WIDGET_SIZES as readonly string[]).includes(value);
}

export function clampWorkspaceSize(
  size: WorkspaceWidgetSize,
  supported: readonly WorkspaceWidgetSize[],
): WorkspaceWidgetSize {
  if (supported.includes(size)) return size;
  return supported[0] ?? "compact";
}

/** Clamp a logical 6-col span down to the active breakpoint column count. */
export function clampSpanToColumns(span: number, columns: number): number {
  if (columns <= 1) return 1;
  return Math.min(Math.max(1, span), columns);
}
