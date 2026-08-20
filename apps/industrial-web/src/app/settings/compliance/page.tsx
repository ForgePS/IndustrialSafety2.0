"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiSend, useAuth, getBearerToken, getApiBaseUrl } from "@forge/web-kit";

type AckRow = {
  id: string;
  userId: string;
  emailSnapshot: string | null;
  displayNameSnapshot: string | null;
  documentKey: string;
  documentVersion: string;
  documentHash: string;
  acceptedAt: string;
  status: string;
  title: string;
};

export default function ComplianceAcknowledgmentsPage() {
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("industrial.legal.acknowledgments.read_tenant") ||
    hasPermission("industrial.admin") ||
    hasPermission("industrial.access");
  const [items, setItems] = useState<AckRow[]>([]);
  const [policies, setPolicies] = useState<
    Array<{ id: string; documentKey: string; title: string; status: string; documentType: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [policyForm, setPolicyForm] = useState({
    documentKey: "",
    title: "",
    content: "",
  });
  const [policyBusy, setPolicyBusy] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    void (async () => {
      try {
        const [data, docs] = await Promise.all([
          apiGet<{ items: AckRow[] }>("/api/v1/legal/admin/acknowledgments"),
          apiGet<{ items: Array<{ id: string; documentKey: string; title: string; status: string; documentType: string }> }>(
            "/api/v1/legal/admin/documents?scope=tenant",
          ).catch(() => ({ items: [] })),
        ]);
        if (!cancelled) {
          setItems(data.items ?? []);
          setPolicies(docs.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load acknowledgments");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  if (!canRead) {
    return (
      <div className="ind-content">
        <h1 className="h4">User Acknowledgments</h1>
        <p className="text-muted">You do not have permission to view tenant acknowledgment reports.</p>
      </div>
    );
  }

  return (
    <div className="ind-content">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">User Acknowledgments</h1>
          <p className="text-muted mb-0">Compliance evidence for platform legal acknowledgments.</p>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              void (async () => {
                try {
                  const me = await apiGet<{ tenantId: string }>("/api/v1/auth/me");
                  const bearer = getBearerToken();
                  const res = await fetch(
                    `${getApiBaseUrl()}/api/v1/legal/admin/acknowledgments/export`,
                    {
                      headers: {
                        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
                        "x-tenant-id": me.tenantId,
                      },
                    },
                  );
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "legal-acknowledgments.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Export failed");
                }
              })();
            }}
          >
            Export CSV
          </button>
          <Link href="/settings/" className="btn btn-sm btn-outline-secondary">
            Settings
          </Link>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="row g-3">
        <div className="col-md-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small">Records</div>
              <div className="h4 mb-0">{items.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="table-responsive mt-3">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>User</th>
              <th>Document</th>
              <th>Version</th>
              <th>Acknowledged</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.displayNameSnapshot || row.emailSnapshot || row.userId}</td>
                <td>{row.title || row.documentKey}</td>
                <td>{row.documentVersion}</td>
                <td>{row.acceptedAt ? new Date(row.acceptedAt).toLocaleString() : "—"}</td>
                <td>{row.status}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() =>
                      void (async () => {
                        try {
                          const detail = await apiGet<Record<string, unknown>>(
                            `/api/v1/legal/admin/acknowledgments/${encodeURIComponent(row.id)}`,
                          );
                          setSelected(detail);
                        } catch (err) {
                          setError(err instanceof ApiError ? err.message : "Could not load evidence");
                        }
                      })()
                    }
                  >
                    Evidence
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  No acknowledgment evidence yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="card mt-3">
          <div className="card-body">
            <div className="d-flex justify-content-between">
              <h2 className="h6">Evidence detail</h2>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <pre className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}

      <hr className="my-4" />

      <section aria-labelledby="tenant-policies-heading">
        <h2 id="tenant-policies-heading" className="h5">
          Tenant Policies
        </h2>
        <div className="alert alert-warning">
          This policy is provided by your organization. Forge does not author, approve, or provide
          legal advice regarding customer-created policies.
        </div>
        <div className="table-responsive mb-3">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.documentKey}</code>
                  </td>
                  <td>{p.title}</td>
                  <td>{p.documentType}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No tenant policies yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <form
          className="card border shadow-none"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setPolicyBusy(true);
              setError(null);
              try {
                await apiSend("/api/v1/legal/admin/tenant-policies", "POST", {
                  documentKey: policyForm.documentKey.trim(),
                  title: policyForm.title.trim(),
                  content: `<p>${policyForm.content.trim()}</p>`,
                  publish: true,
                });
                setPolicyForm({ documentKey: "", title: "", content: "" });
                const docs = await apiGet<{
                  items: Array<{
                    id: string;
                    documentKey: string;
                    title: string;
                    status: string;
                    documentType: string;
                  }>;
                }>("/api/v1/legal/admin/documents?scope=tenant");
                setPolicies(docs.items ?? []);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not create tenant policy");
              } finally {
                setPolicyBusy(false);
              }
            })();
          }}
        >
          <div className="card-body">
            <h3 className="h6">Create tenant policy</h3>
            <div className="row g-2">
              <div className="col-md-4">
                <label className="form-label" htmlFor="policy-key">
                  Document key
                </label>
                <input
                  id="policy-key"
                  className="form-control form-control-sm"
                  required
                  value={policyForm.documentKey}
                  onChange={(ev) => setPolicyForm((p) => ({ ...p, documentKey: ev.target.value }))}
                  placeholder="site-safety-rules"
                />
              </div>
              <div className="col-md-8">
                <label className="form-label" htmlFor="policy-title">
                  Title
                </label>
                <input
                  id="policy-title"
                  className="form-control form-control-sm"
                  required
                  value={policyForm.title}
                  onChange={(ev) => setPolicyForm((p) => ({ ...p, title: ev.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="policy-content">
                  Policy text
                </label>
                <textarea
                  id="policy-content"
                  className="form-control form-control-sm"
                  rows={4}
                  required
                  value={policyForm.content}
                  onChange={(ev) => setPolicyForm((p) => ({ ...p, content: ev.target.value }))}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-sm btn-primary mt-3" disabled={policyBusy}>
              {policyBusy ? "Saving…" : "Publish policy"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
