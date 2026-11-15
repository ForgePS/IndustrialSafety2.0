"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type JobRow = {
  id: string;
  type: string;
  status: string;
  progress: number;
  attempt: number;
  createdAt: string;
  correlationId: string;
};

function JobsInner() {
  const tenantId = useTenantId();
  const [items, setItems] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<JobRow[]>(`/api/v1/tenants/${tenantId}/jobs`);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) return <TenantRequired />;

  return (
    <div className={styles.page}>
      <h1>Platform jobs</h1>
      <p>Shared SaaS background jobs (exports). Import Center jobs remain under Import Center.</p>
      {loading ? <p>Loading…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && items.length === 0 ? <p>No jobs yet.</p> : null}
      {items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Attempt</th>
              <th>Created</th>
              <th>Correlation</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id}>
                <td>{job.type}</td>
                <td>{job.status}</td>
                <td>{job.progress}%</td>
                <td>{job.attempt}</td>
                <td>{new Date(job.createdAt).toLocaleString()}</td>
                <td>
                  <code>{job.correlationId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button type="button" onClick={() => void load()}>
        Refresh
      </button>
    </div>
  );
}

export default function JobsPage() {
  return (
    <PlatformPageGate title="Jobs" permission="platform.jobs.read">
      <Suspense fallback={<p>Loading jobs…</p>}>
        <JobsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
