"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiSend } from "@/lib/api";

export type CreatorPrintHealth = {
  tenantId: string;
  generatedAt: string;
  printingEnabled: boolean;
  entitlement: {
    productCode: string;
    productStatus: string;
    printManagerModuleStatus: string;
  };
  flags: Record<string, { value: unknown; overridden: boolean; name?: string }>;
  usage: {
    period: string;
    from: string;
    to: string;
    jobs: number;
    completed: number;
    failed: number;
    labelsPrinted: number;
    failureRate: number;
    retryRate: number;
    reprints: number;
  };
  bridges: {
    total: number;
    online: number;
    offline: number;
    versions: string[];
    items: Array<{
      id: string;
      name: string;
      computerName: string | null;
      version: string | null;
      status: string;
      enabled: boolean;
      lastSeenAt: string | null;
      printerCount: number;
      pendingJobs: number;
    }>;
  };
  printers: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    error: number;
  };
  diagnostics: {
    recentErrors: Array<{
      id: string;
      createdAt: string | null;
      printerName?: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    }>;
    supplies: { warning: number; critical: number; empty: number; total: number } | null;
    jobsToday: {
      queued: number;
      printing: number;
      completedToday: number;
      failedToday: number;
      labelsPrintedToday: number;
    };
  };
};

const TOGGLE_FLAGS: Array<{ key: string; label: string }> = [
  { key: "forge.printing.enabled", label: "Printing master" },
  { key: "forge.printing.print_manager.enabled", label: "Print Manager hub" },
  { key: "forge.printing.bridge.enabled", label: "Print Bridge" },
  { key: "forge.printing.batch.enabled", label: "Batch printing" },
  { key: "forge.printing.failover.enabled", label: "Failover" },
  { key: "forge.printing.analytics.enabled", label: "Analytics" },
  { key: "forge.printing.supplies.enabled", label: "Supplies" },
];

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="col-6 col-md-4 col-xl-3">
      <div className="card border shadow-none h-100">
        <div className="card-body py-3">
          <div className="text-muted small text-uppercase mb-1">{label}</div>
          <div className="fs-5 fw-semibold mb-0">
            {tone ? <StatusBadge tone={tone}>{value}</StatusBadge> : value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TenantPrintHealthPanel({ tenantId }: { tenantId: string }) {
  const { hasPermission, me } = useAuth();
  const canRead =
    Boolean(me?.isPlatformAdmin) ||
    hasPermission("platform.tenant.read") ||
    hasPermission("platform.entitlement.manage");
  const canEntitle = Boolean(me?.isPlatformAdmin) || hasPermission("platform.entitlement.manage");
  const canFlags = Boolean(me?.isPlatformAdmin) || hasPermission("platform.feature.manage");

  const [health, setHealth] = useState<CreatorPrintHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const industrialUrl =
    process.env.NEXT_PUBLIC_INDUSTRIAL_APP_URL?.replace(/\/$/, "") ||
    "https://d1n0e5wvjwbpdf.cloudfront.net";

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<CreatorPrintHealth>(
        `/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/industrial/print-health`,
      );
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load print health.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setPrintManager(active: boolean) {
    if (!canEntitle) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiSend(
        `/api/v1/tenants/${encodeURIComponent(tenantId)}/modules/PRINT_MANAGER/entitlement`,
        "PUT",
        { status: active ? "ACTIVE" : "INACTIVE", productCode: "FORGE_INDUSTRIAL" },
      );
      setNotice(active ? "Print Manager module enabled." : "Print Manager module disabled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Print Manager entitlement.");
    } finally {
      setBusy(false);
    }
  }

  async function setFlag(key: string, next: boolean) {
    if (!canFlags) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${encodeURIComponent(tenantId)}/features/${key}`, "PUT", {
        value: next,
        reason: next ? "creator_print_feature_enable" : "creator_print_feature_disable",
      });
      setNotice(`Updated ${key}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update feature flag.");
    } finally {
      setBusy(false);
    }
  }

  async function copyDiagnostics() {
    if (!health) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(health, null, 2));
      setNotice("Diagnostics JSON copied.");
    } catch {
      setError("Could not copy diagnostics to clipboard.");
    }
  }

  if (!canRead) {
    return <p className="text-muted mb-0">You do not have permission to view print health.</p>;
  }

  const moduleOn = health?.entitlement.printManagerModuleStatus === "ACTIVE";

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="alert">
          {notice}
        </div>
      ) : null}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
        {canEntitle ? (
          <button
            type="button"
            className={`btn btn-sm ${moduleOn ? "btn-outline-warning" : "btn-primary"}`}
            disabled={busy || loading}
            onClick={() => void setPrintManager(!moduleOn)}
          >
            {moduleOn ? "Disable Print Manager" : "Enable Print Manager"}
          </button>
        ) : null}
        <a
          className="btn btn-sm btn-outline-primary"
          href={`${industrialUrl}/modules/print-manager/?tenantId=${encodeURIComponent(tenantId)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open Industrial Print Manager
        </a>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={!health}
          onClick={() => void copyDiagnostics()}
        >
          Copy diagnostics
        </button>
        <Link
          className="btn btn-sm btn-link"
          href={`/industrial-modules/?tenantId=${encodeURIComponent(tenantId)}`}
        >
          Industrial modules
        </Link>
        <Link
          className="btn btn-sm btn-link"
          href={`/features/?tenantId=${encodeURIComponent(tenantId)}`}
        >
          All feature flags
        </Link>
      </div>

      {loading && !health ? (
        <p className="text-muted">Loading print health…</p>
      ) : health ? (
        <>
          <div className="row g-3 mb-4">
            <Stat
              label="Printing enabled"
              value={health.printingEnabled ? "Yes" : "No"}
              tone={health.printingEnabled ? "success" : "warning"}
            />
            <Stat label="Printers" value={health.printers.total} />
            <Stat label="Printers online" value={health.printers.online} tone="success" />
            <Stat
              label="Printers offline"
              value={health.printers.offline}
              tone={health.printers.offline > 0 ? "danger" : "neutral"}
            />
            <Stat label="Bridges" value={health.bridges.total} />
            <Stat label="Bridges online" value={health.bridges.online} tone="success" />
            <Stat
              label="Bridges offline"
              value={health.bridges.offline}
              tone={health.bridges.offline > 0 ? "danger" : "neutral"}
            />
            <Stat label="Jobs MTD" value={health.usage.jobs} />
            <Stat label="Labels MTD" value={health.usage.labelsPrinted} />
            <Stat
              label="Failure rate MTD"
              value={`${health.usage.failureRate}%`}
              tone={health.usage.failureRate > 5 ? "danger" : "neutral"}
            />
            <Stat
              label="Failed today"
              value={health.diagnostics.jobsToday.failedToday}
              tone={health.diagnostics.jobsToday.failedToday > 0 ? "danger" : "neutral"}
            />
            <Stat
              label="Bridge versions"
              value={health.bridges.versions.length ? health.bridges.versions.join(", ") : "—"}
            />
          </div>

          <div className="card border shadow-none mb-4">
            <div className="card-header">
              <h6 className="mb-0">Enablement</h6>
            </div>
            <div className="card-body">
              <dl className="row mb-0">
                <dt className="col-sm-4">Industrial product</dt>
                <dd className="col-sm-8">{health.entitlement.productStatus}</dd>
                <dt className="col-sm-4">PRINT_MANAGER module</dt>
                <dd className="col-sm-8">{health.entitlement.printManagerModuleStatus}</dd>
              </dl>
              {canFlags ? (
                <div className="mt-3">
                  <div className="text-muted small mb-2">Printing feature flags</div>
                  <div className="d-flex flex-wrap gap-2">
                    {TOGGLE_FLAGS.map((f) => {
                      const row = health.flags[f.key];
                      const on = row ? row.value !== false : true;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          className={`btn btn-sm ${on ? "btn-outline-success" : "btn-outline-secondary"}`}
                          disabled={busy}
                          title={f.key}
                          onClick={() => void setFlag(f.key, !on)}
                        >
                          {f.label}: {on ? "On" : "Off"}
                          {row?.overridden ? " *" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <p className="small text-muted mt-2 mb-0">* Override set for this tenant.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card border shadow-none mb-4">
            <div className="card-header">
              <h6 className="mb-0">Bridges</h6>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Printers</th>
                    <th>Pending jobs</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {health.bridges.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        No bridges registered.
                      </td>
                    </tr>
                  ) : (
                    health.bridges.items.map((b) => (
                      <tr key={b.id}>
                        <td>
                          {b.name}
                          {b.computerName ? (
                            <div className="small text-muted">{b.computerName}</div>
                          ) : null}
                        </td>
                        <td className="font-monospace small">{b.version || "—"}</td>
                        <td>
                          <StatusBadge
                            tone={
                              b.status === "ONLINE"
                                ? "success"
                                : b.status === "OFFLINE"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {b.status}
                          </StatusBadge>
                        </td>
                        <td>{b.printerCount}</td>
                        <td>{b.pendingJobs}</td>
                        <td className="small text-muted">
                          {b.lastSeenAt ? new Date(b.lastSeenAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card border shadow-none mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="mb-0">Support diagnostics</h6>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setShowDiag((v) => !v)}
              >
                {showDiag ? "Hide technical details" : "View technical details"}
              </button>
            </div>
            <div className="card-body">
              <p className="small text-muted mb-2">
                Generated {new Date(health.generatedAt).toLocaleString()}. Recent errors:{" "}
                {health.diagnostics.recentErrors.length}. Supplies low/critical/empty:{" "}
                {health.diagnostics.supplies
                  ? `${health.diagnostics.supplies.warning}/${health.diagnostics.supplies.critical}/${health.diagnostics.supplies.empty}`
                  : "—"}
                .
              </p>
              {(health.diagnostics.recentErrors.length ?? 0) > 0 ? (
                <ul className="small mb-3">
                  {health.diagnostics.recentErrors.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      {e.printerName || "Printer"} · {e.errorCode || "ERROR"} ·{" "}
                      {e.errorMessage || "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small text-muted">No recent print failures today.</p>
              )}
              {showDiag ? (
                <pre
                  className="small bg-light border rounded p-3 mb-0"
                  style={{ maxHeight: 360, overflow: "auto" }}
                >
                  {JSON.stringify(health, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
