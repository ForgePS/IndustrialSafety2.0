import type { ReactNode } from "react";
import { EmptyState } from "../primitives.js";
import { ForgeSkeleton } from "../primitives.js";

export type ForgeDataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  width?: string;
};

export function ForgeDataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyTitle = "No records found",
  emptyDescription = "Items will appear here when available.",
  emptyAction,
  caption,
}: {
  columns: ForgeDataTableColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  caption?: string;
}) {
  if (loading) {
    return (
      <div className="forge-card" aria-busy="true">
        <ForgeSkeleton height="2.5rem" />
        <div style={{ height: "0.75rem" }} />
        <ForgeSkeleton height="2.5rem" />
        <div style={{ height: "0.75rem" }} />
        <ForgeSkeleton height="2.5rem" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="forge-table">
        {caption ? (
          <caption style={{ textAlign: "left", padding: "0.5rem 0" }}>{caption}</caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.id} scope="col" style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={col.id}>{col.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
