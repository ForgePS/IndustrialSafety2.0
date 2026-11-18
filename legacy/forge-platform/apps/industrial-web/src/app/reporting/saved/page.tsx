"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  createShare,
  deleteSavedReport,
  fetchLibraryReports,
  fetchShares,
  type LibraryReportItem,
  type ReportShareRow,
} from "@/lib/reporting-api";

export default function ReportingSavedPage() {
  const [items, setItems] = useState<LibraryReportItem[]>([]);
  const [shares, setShares] = useState<ReportShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shareReportId, setShareReportId] = useState("");
  const [shareUserId, setShareUserId] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lib, shareList] = await Promise.all([
        fetchLibraryReports(),
        fetchShares().catch(() => ({ items: [] as ReportShareRow[], total: 0 })),
      ]);
      setItems(lib.items.filter((r) => r.origin === "saved" || r.origin === "template"));
      setShares(shareList.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load saved reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete(id: string) {
    if (!window.confirm("Delete this saved report?")) return;
    setBusyId(id);
    setMessage(null);
    try {
      await deleteSavedReport(id);
      setMessage("Saved report deleted.");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  async function onShare(e: FormEvent) {
    e.preventDefault();
    if (!shareReportId.trim() || !shareUserId.trim()) {
      setMessage("Select a saved report and enter a user ID to share.");
      return;
    }
    setShareBusy(true);
    setMessage(null);
    try {
      await createShare({
        reportDefinitionId: shareReportId.trim(),
        sharedWithUserId: shareUserId.trim(),
        permission: "view",
      });
      setMessage("Share created.");
      setShareUserId("");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to create share");
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Workspace</p>
          <h1 className="h4 mb-1">Saved reports</h1>
          <p className="text-muted mb-0">Tenant-saved report definitions and shares.</p>
        </div>
        <Link href="/reporting/builder/" className="btn btn-primary">
          + Create report
        </Link>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3">
        {loading ? (
          <div className="card-body text-muted">Loading saved reports…</div>
        ) : items.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No saved reports"
              description="Use the custom builder to save a report definition."
              action={
                <Link href="/reporting/builder/" className="btn btn-sm btn-outline-primary">
                  Open builder
                </Link>
              }
            />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Origin</th>
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
                    <td>
                      <code className="small">{row.sourceKey ?? row.key}</code>
                    </td>
                    <td>{row.category ?? "—"}</td>
                    <td className="text-capitalize">{row.origin}</td>
                    <td className="text-end text-nowrap">
                      <Link
                        href={`/reporting/library/?q=${encodeURIComponent(row.name)}`}
                        className="btn btn-sm btn-outline-primary me-1"
                      >
                        Open
                      </Link>
                      {row.id ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busyId === row.id}
                          onClick={() => void onDelete(row.id!)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <h2 className="h6 mb-3">Share a saved report</h2>
          <form className="row g-3 align-items-end" onSubmit={(e) => void onShare(e)}>
            <div className="col-md-5">
              <label className="form-label" htmlFor="share-report">
                Saved report
              </label>
              <select
                id="share-report"
                className="form-select"
                value={shareReportId}
                onChange={(e) => setShareReportId(e.target.value)}
              >
                <option value="">Select…</option>
                {items
                  .filter((r) => r.id)
                  .map((r) => (
                    <option key={r.id!} value={r.id!}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-md-5">
              <label className="form-label" htmlFor="share-user">
                User to share with
              </label>
              <input
                id="share-user"
                className="form-control"
                value={shareUserId}
                onChange={(e) => setShareUserId(e.target.value)}
                placeholder="Paste the recipient’s user ID"
              />
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn btn-primary w-100" disabled={shareBusy}>
                {shareBusy ? "Sharing…" : "Share"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {shares.length > 0 ? (
        <div className="card border shadow-none">
          <div className="card-body">
            <h2 className="h6 mb-3">Existing shares</h2>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Report definition</th>
                    <th>User</th>
                    <th>Permission</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {shares.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code className="small">{s.reportDefinitionId}</code>
                      </td>
                      <td>
                        <code className="small">{s.sharedWithUserId ?? "—"}</code>
                      </td>
                      <td className="text-capitalize">{s.permission}</td>
                      <td>{new Date(s.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
