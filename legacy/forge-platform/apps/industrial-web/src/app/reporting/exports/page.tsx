"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  downloadBase64,
  fetchExports,
  requestExportDownload,
  type ReportExportRow,
} from "@/lib/reporting-api";

export default function ReportingExportsPage() {
  const [items, setItems] = useState<ReportExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchExports();
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDownload(row: ReportExportRow) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const inline = row.contentBase64 ?? row.artifactInline;
      if (inline) {
        downloadBase64(row.filename, row.contentType, inline);
        setMessage(`Downloaded ${row.filename}`);
        return;
      }
      const download = await requestExportDownload(row.id);
      window.open(download.downloadUrl, "_blank", "noopener,noreferrer");
      setMessage(`Opened download for ${row.filename}`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to download export");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Compliance & exports</p>
          <h1 className="h4 mb-1">Exports</h1>
          <p className="text-muted mb-0">PDF, XLSX, and CSV download center.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={() => void load()}>
          Refresh
        </button>
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

      <div className="card border shadow-none">
        {loading ? (
          <div className="card-body text-muted">Loading exports…</div>
        ) : items.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No exports yet"
              description="Export a report from the library to see files here."
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
                  <th>File</th>
                  <th>Report</th>
                  <th>Format</th>
                  <th>Size</th>
                  <th>When</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="fw-medium">{row.filename}</div>
                      <div className="small text-muted text-capitalize">{row.status}</div>
                    </td>
                    <td>{row.reportName}</td>
                    <td className="text-uppercase">{row.format}</td>
                    <td>{row.byteSize ? `${Math.round(row.byteSize / 1024)} KB` : "—"}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busyId === row.id}
                        onClick={() => void onDownload(row)}
                      >
                        {busyId === row.id ? "…" : "Download"}
                      </button>
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
