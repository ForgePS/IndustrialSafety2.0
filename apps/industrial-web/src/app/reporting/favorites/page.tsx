"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  fetchFavorites,
  fetchLibraryReports,
  unfavoriteReport,
  type LibraryReportItem,
  type ReportFavoriteRow,
} from "@/lib/reporting-api";

export default function ReportingFavoritesPage() {
  const [favorites, setFavorites] = useState<ReportFavoriteRow[]>([]);
  const [library, setLibrary] = useState<LibraryReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fav, lib] = await Promise.all([
        fetchFavorites(),
        fetchLibraryReports().catch(() => ({ items: [] as LibraryReportItem[], total: 0 })),
      ]);
      setFavorites(fav.items);
      setLibrary(lib.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resolve(fav: ReportFavoriteRow): { key: string; name: string; detail: string } {
    const key = fav.reportKey ?? fav.reportDefinitionId ?? fav.id;
    const match = library.find(
      (r) => r.key === key || r.id === fav.reportDefinitionId || r.key === fav.reportKey,
    );
    return {
      key,
      name: match?.name ?? key,
      detail: match?.module ?? match?.category ?? fav.reportKey ?? "Favorite",
    };
  }

  async function onRemove(fav: ReportFavoriteRow) {
    const key = fav.reportKey ?? fav.reportDefinitionId;
    if (!key) return;
    setBusyKey(key);
    try {
      await unfavoriteReport(key);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove favorite");
    } finally {
      setBusyKey(null);
    }
  }

  const rows: ReportFavoriteRow[] =
    favorites.length > 0
      ? favorites
      : library
          .filter((r) => r.isFavorite)
          .map((r) => ({
            id: r.key,
            reportKey: r.origin === "builtin" ? r.key : null,
            reportDefinitionId: r.id ?? (r.origin !== "builtin" ? r.key : null),
            createdAt: new Date().toISOString(),
          }));

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Workspace</p>
        <h1 className="h4 mb-1">Favorites</h1>
        <p className="text-muted mb-0">Starred reports for quick access.</p>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none">
        {loading ? (
          <div className="card-body text-muted">Loading favorites…</div>
        ) : rows.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No favorites yet"
              description="Star reports from the library to pin them here."
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
                  <th>Key</th>
                  <th>Added</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((fav) => {
                  const resolved = resolve(fav);
                  return (
                    <tr key={fav.id}>
                      <td>
                        <div className="fw-medium">{resolved.name}</div>
                        <div className="small text-muted">{resolved.detail}</div>
                      </td>
                      <td>
                        <code className="small">{resolved.key}</code>
                      </td>
                      <td>{new Date(fav.createdAt).toLocaleString()}</td>
                      <td className="text-end text-nowrap">
                        <Link
                          href={`/reporting/library/?q=${encodeURIComponent(resolved.name)}`}
                          className="btn btn-sm btn-outline-primary me-1"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={busyKey === resolved.key}
                          onClick={() => void onRemove(fav)}
                        >
                          Unstar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
