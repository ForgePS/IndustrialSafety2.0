"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type JobRow = {
  id: string;
  type: string;
  status: string;
  progress: number;
  downloadAvailable?: boolean;
  failure?: string | null;
};

type DownloadPayload = {
  jobId: string;
  downloadUrl: string;
  expiresAt: string;
  mode: string;
  filename: string;
};

function ExportsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<JobRow[]>(`/api/v1/tenants/${tenantId}/jobs`, {
        query: { limit: "25" },
      });
      setItems(rows.filter((r) => r.type.startsWith("export.")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createExport(kind: "memberships.csv" | "audit.json") {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    setDownloadHint(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/exports`, "POST", { kind });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function download(jobId: string) {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await apiSend<DownloadPayload>(
        `/api/v1/tenants/${tenantId}/exports/${jobId}/download`,
        "POST",
        {},
      );
      const url =
        payload.mode === "API_STREAM" ? `${API_URL}${payload.downloadUrl}` : payload.downloadUrl;
      setDownloadHint(
        `Ready until ${new Date(payload.expiresAt).toLocaleString()} (${payload.filename})`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) return <TenantRequired />;

  return (
    <div className={styles.page}>
      <h1>Data export</h1>
      <p>Authorized, tenant-scoped exports with expiring download access.</p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {hasPermission("platform.membership.read") ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createExport("memberships.csv")}
          >
            Export memberships (CSV)
          </button>
        ) : null}
        {hasPermission("platform.audit.export") ? (
          <button type="button" disabled={busy} onClick={() => void createExport("audit.json")}>
            Export audit (JSON)
          </button>
        ) : null}
      </div>
      {loading ? <p>Loading…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {downloadHint ? <p>{downloadHint}</p> : null}
      {!loading && items.length === 0 ? <p>No export jobs yet.</p> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((job) => (
            <li key={job.id} style={{ marginBottom: "0.75rem" }}>
              <strong>{job.type}</strong> — {job.status} ({job.progress}%)
              {job.failure ? <div role="alert">{job.failure}</div> : null}
              {job.downloadAvailable && hasPermission("tenant.export.read") ? (
                <div>
                  <button type="button" disabled={busy} onClick={() => void download(job.id)}>
                    Download
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ExportsPage() {
  return (
    <TenantPageGate title="Data Export" anyOf={["tenant.export.create", "tenant.export.read"]}>
      <Suspense fallback={<p>Loading exports…</p>}>
        <ExportsInner />
      </Suspense>
    </TenantPageGate>
  );
}
