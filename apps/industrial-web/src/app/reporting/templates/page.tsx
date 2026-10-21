"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { BUILT_IN_REPORTS } from "@/lib/reporting-catalog";
import {
  createSavedReport,
  fetchLibraryReports,
  type LibraryReportItem,
} from "@/lib/reporting-api";

export default function ReportingTemplatesPage() {
  const [templates, setTemplates] = useState<LibraryReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [justSavedKey, setJustSavedKey] = useState<string | null>(null);

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    setError(null);
    try {
      const result = await fetchLibraryReports();
      setTemplates(result.items.filter((r) => r.origin === "template"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load templates");
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedSourceKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of templates) {
      if (row.sourceKey) keys.add(row.sourceKey);
    }
    return keys;
  }, [templates]);

  async function saveAsTemplate(sourceKey: string, name: string, description: string) {
    setBusyKey(sourceKey);
    setMessage(null);
    setJustSavedKey(null);
    try {
      const created = await createSavedReport({
        name: `${name} template`,
        description,
        sourceKey,
        origin: "template",
        payloadJson: {},
      });
      setTemplates((prev) => [
        {
          key: created.id,
          id: created.id,
          name: created.name,
          description,
          module: null,
          category: null,
          reportType: "standard",
          origin: "template",
          sourceKey,
          isFavorite: false,
        },
        ...prev,
      ]);
      setJustSavedKey(sourceKey);
      setMessage(`Saved “${created.name}”. It appears in Saved templates below.`);
      await load(true);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to save template");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Library</p>
        <h1 className="h4 mb-1">Templates</h1>
        <p className="text-muted mb-0">
          Starter packs from the built-in catalog and tenant-saved templates.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <h2 className="h6 mb-2">Built-in starters</h2>
          <p className="text-muted small mb-3">
            Save any catalog report as a reusable template for your organization.
          </p>
          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Module</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {BUILT_IN_REPORTS.slice(0, 12).map((r) => {
                  const alreadySaved = savedSourceKeys.has(r.key);
                  const justSaved = justSavedKey === r.key;
                  return (
                    <tr key={r.key}>
                      <td>
                        <div className="fw-medium">{r.name}</div>
                        <div className="small text-muted">{r.description}</div>
                      </td>
                      <td>{r.module}</td>
                      <td className="text-end">
                        {justSaved || alreadySaved ? (
                          <span className="text-success small me-2">
                            {justSaved ? "Just saved" : "Saved"}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={`btn btn-sm ${justSaved ? "btn-success" : "btn-outline-primary"}`}
                          disabled={busyKey === r.key}
                          onClick={() => void saveAsTemplate(r.key, r.name, r.description)}
                        >
                          {busyKey === r.key
                            ? "Saving…"
                            : justSaved
                              ? "Saved"
                              : alreadySaved
                                ? "Save another"
                                : "Save as template"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card border shadow-none">
        <div className="card-body border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h2 className="h6 mb-0">Saved templates</h2>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="card-body text-muted">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No saved templates yet"
              description="Save a built-in starter above, or create one from the custom builder."
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
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((row) => (
                  <tr key={row.id ?? row.key}>
                    <td>
                      <div className="fw-medium">{row.name}</div>
                      {row.description ? (
                        <div className="small text-muted">{row.description}</div>
                      ) : null}
                    </td>
                    <td>
                      <code className="small">{row.sourceKey ?? row.key}</code>
                    </td>
                    <td>{row.category ?? "—"}</td>
                    <td className="text-end">
                      <Link
                        href={`/reporting/library/?q=${encodeURIComponent(row.name)}`}
                        className="btn btn-sm btn-outline-secondary"
                      >
                        Open in library
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
