import type { WidgetSize } from "./types";

const SIZE_COLUMNS: Record<WidgetSize, number> = {
  "1x1": 3,
  "2x1": 6,
  "2x2": 6,
  "3x2": 9,
  "4x2": 12,
};

const SIZE_ROWS: Record<WidgetSize, number> = {
  "1x1": 1,
  "2x1": 1,
  "2x2": 2,
  "3x2": 2,
  "4x2": 2,
};

export function widgetColumnSpan(size: WidgetSize): number {
  return SIZE_COLUMNS[size];
}

export function widgetMinHeight(size: WidgetSize): string {
  const rows = SIZE_ROWS[size];
  return `calc(${rows} * 140px)`;
}

export function clampWidgetSize(size: WidgetSize, min: WidgetSize, max: WidgetSize): WidgetSize {
  const order: WidgetSize[] = ["1x1", "2x1", "2x2", "3x2", "4x2"];
  const index = order.indexOf(size);
  const minIndex = order.indexOf(min);
  const maxIndex = order.indexOf(max);
  if (index < minIndex) return min;
  if (index > maxIndex) return max;
  return size;
}
