"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { BUILT_IN_REPORTS, filterBuiltInReports } from "@/lib/reporting-catalog";
import { fetchLibraryReports, type LibraryReportItem } from "@/lib/reporting-api";

export default function ReportingCompliancePage() {
  const [items, setItems] = useState<LibraryReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLibraryReports({ reportType: "compliance" });
      setItems(result.items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message} — showing built-in compliance catalog.`
          : "API unavailable — showing built-in compliance catalog.",
      );
      setItems(
        filterBuiltInReports(BUILT_IN_REPORTS, { reportType: "compliance" }).map((r) => ({
          key: r.key,
          id: null,
          name: r.name,
          description: r.description,
          module: r.module,
          category: r.category,
          reportType: r.reportType,
          origin: "builtin",
          isFavorite: false,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Compliance & exports</p>
        <h1 className="h4 mb-1">Compliance reports</h1>
        <p className="text-muted mb-0">OSHA packages and compliance suite reports.</p>
      </div>

      {error ? (
        <div className="alert alert-warning" role="status">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none">
        {loading ? (
          <div className="card-body text-muted">Loading compliance reports…</div>
        ) : items.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No compliance reports"
              description="Compliance-type reports will appear here when available."
              action={
                <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
                  Browse library
                </Link>
              }
            />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Module</th>
                  <th>Category</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="fw-medium">{row.name}</div>
                      <div className="small text-muted">{row.description}</div>
                    </td>
                    <td>{row.module ?? "—"}</td>
                    <td>{row.category ?? "—"}</td>
                    <td className="text-end">
                      <Link
                        href={`/reporting/library/?q=${encodeURIComponent(row.name)}`}
                        className="btn btn-sm btn-outline-primary"
                      >
                        Run
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
