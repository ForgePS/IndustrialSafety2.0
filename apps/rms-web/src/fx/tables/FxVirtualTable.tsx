"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FxTable, type FxColumnDef } from "./FxTable";

/**
 * Simple windowed table for large lists — presentation only.
 * Does not change data fetching; slices the already-loaded row array.
 */
export function FxVirtualTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowHeight = 44,
  viewportRows = 12,
  empty,
  loading,
}: {
  caption: string;
  columns: FxColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHeight?: number;
  viewportRows?: number;
  empty?: ReactNode;
  loading?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const windowSize = Math.max(1, viewportRows);
  const slice = useMemo(() => rows.slice(offset, offset + windowSize), [rows, offset, windowSize]);
  const maxOffset = Math.max(0, rows.length - windowSize);

  return (
    <div className="rms-fx-virtual-table">
      <FxTable
        caption={caption}
        columns={columns}
        rows={slice}
        rowKey={rowKey}
        {...(empty !== undefined ? { empty } : {})}
        {...(loading !== undefined ? { loading } : {})}
      />
      {rows.length > windowSize ? (
        <div className="rms-fx-virtual-table__controls">
          <button
            type="button"
            disabled={offset <= 0}
            onClick={() => setOffset((o) => Math.max(0, o - windowSize))}
          >
            Earlier
          </button>
          <span aria-live="polite">
            Showing {offset + 1}–{Math.min(offset + windowSize, rows.length)} of {rows.length}
          </span>
          <button
            type="button"
            disabled={offset >= maxOffset}
            onClick={() => setOffset((o) => Math.min(maxOffset, o + windowSize))}
          >
            Later
          </button>
          <span className="rms-fx-sr-only">Row height hint {rowHeight}px</span>
        </div>
      ) : null}
    </div>
  );
}
