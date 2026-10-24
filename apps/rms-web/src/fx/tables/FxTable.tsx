"use client";

import type { ReactNode } from "react";
import { TableSectionBoundary } from "./TableSectionBoundary";
import "./tables.css";

export type FxColumnDef<T> = {
  id: string;
  header: string;
  accessor: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  defaultVisible?: boolean;
  minWidth?: number;
};

export type FxSortState = { id: string; direction: "asc" | "desc" } | null;

export function FxTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  rowActions,
  empty,
  loading,
  density = "default",
}: {
  caption: string;
  columns: FxColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: FxSortState;
  onSortChange?: (next: FxSortState) => void;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  density?: "default" | "compact";
}) {
  const allSelected =
    rows.length > 0 && selectedIds && rows.every((r) => selectedIds.has(rowKey(r)));

  return (
    <TableSectionBoundary title={caption}>
      <div className={`rms-fx-table-wrap rms-fx-table-wrap--${density}`} data-testid="rms-fx-table">
        {loading ? (
          <p className="rms-fx-table__status" role="status" aria-live="polite">
            Loading…
          </p>
        ) : null}
        {!loading && rows.length === 0
          ? (empty ?? <p className="rms-fx-table__status">No rows.</p>)
          : null}
        {rows.length > 0 ? (
          <table className="rms-fx-table">
            <caption className="rms-fx-table__caption">{caption}</caption>
            <thead>
              <tr>
                {selectedIds && onToggleAll ? (
                  <th scope="col">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={Boolean(allSelected)}
                      onChange={(e) => onToggleAll(e.target.checked)}
                    />
                  </th>
                ) : null}
                {columns.map((col) => {
                  const active = sort?.id === col.id;
                  const ariaSort = active
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
                  return (
                    <th key={col.id} scope="col" aria-sort={col.sortable ? ariaSort : undefined}>
                      {col.sortable && onSortChange ? (
                        <button
                          type="button"
                          className="rms-fx-table__sort"
                          onClick={() => {
                            if (!active) onSortChange({ id: col.id, direction: "asc" });
                            else if (sort.direction === "asc")
                              onSortChange({ id: col.id, direction: "desc" });
                            else onSortChange(null);
                          }}
                        >
                          {col.header}
                          {active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {rowActions ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = rowKey(row);
                return (
                  <tr key={id}>
                    {selectedIds && onToggleRow ? (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={selectedIds.has(id)}
                          onChange={() => onToggleRow(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td key={col.id}>{col.accessor(row)}</td>
                    ))}
                    {rowActions ? <td>{rowActions(row)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </TableSectionBoundary>
  );
}
