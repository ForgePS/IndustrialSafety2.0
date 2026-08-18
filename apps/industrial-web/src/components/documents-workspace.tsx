"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type DocumentItem = { id: string; name: string; category?: string | null; status: string };

export function DocumentsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await apiGet<DocumentItem[]>("/api/v1/documents"));
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (permissions.has("documents.view")) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await apiSend("/api/v1/documents", "POST", { name, category: "INDUSTRIAL" });
      setName("");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to create document");
    }
  }

  return (
    <section aria-labelledby="documents-title">
      <ModuleWorkspaceHeader
        id="documents-title"
        eyebrow="Coordination"
        title={moduleName}
        description="Tenant-scoped shared documents with immutable versions, malware status, and short-lived delivery."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {permissions.has("documents.upload") ? (
        <div className="card border shadow-none mb-4">
          <div className="card-header">
            <h6 className="card-title mb-0">Create document</h6>
          </div>
          <div className="card-body">
            <form className="row g-3 align-items-end" onSubmit={(event) => void create(event)}>
              <div className="col-md-8">
                <label className="form-label" htmlFor="doc-name">
                  Document name
                </label>
                <input
                  id="doc-name"
                  className="form-control form-control-sm"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="col-md-4">
                <button type="submit" className="btn btn-primary btn-sm w-100">
                  Create document
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="text-muted">{item.category ?? "—"}</td>
                  <td>
                    <span className="badge bg-label-secondary">{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
