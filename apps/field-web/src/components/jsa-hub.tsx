"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { safetyWorkflowApi } from "@/lib/safety-workflow-api";
import type { SafetyRecord } from "@/lib/safety-workflows";

const JSAS_API = "/api/v1/industrial/jsas";

export function JsaHub() {
  const router = useRouter();
  const { moduleEnabled } = useFieldPermissions();
  const [rows, setRows] = useState<SafetyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await safetyWorkflowApi.list(JSAS_API);
      setRows(list.filter((row) => !/archiv/i.test(String(row.status ?? ""))));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load JSAs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!moduleEnabled("JSAS")) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, refresh]);

  if (!moduleEnabled("JSAS")) {
    return (
      <EmptyState
        title="JSA not enabled"
        message="Job Safety Analysis is not enabled for this company."
      />
    );
  }

  return (
    <>
      <header className="ff-header">
        <div>
          <h1 className="ff-page-title" style={{ marginBottom: 4 }}>
            JSA / JHA
          </h1>
          <p className="ff-meta">Acknowledge assigned analyses before work</p>
        </div>
        <button
          type="button"
          className="ff-icon-btn"
          aria-label="Refresh"
          onClick={() => void refresh()}
        >
          ↻
        </button>
      </header>

      {loading ? <LoadingState label="Loading JSAs…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No JSAs yet"
          message="Assigned JSAs from Forge Industrial Safety will appear here."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="ff-task-list">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="ff-task-card"
              onClick={() => router.push(`/jsa/${encodeURIComponent(row.id)}/`)}
            >
              <div className="ff-task-card-body">
                <span className="ff-task-kind">JSA</span>
                <span className="ff-task-title">{row.title || "Untitled JSA"}</span>
                <span className="ff-meta">{row.status || "ACTIVE"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        style={{ marginTop: 16 }}
        onClick={() => router.push("/workflows/")}
      >
        All safety workflows
      </button>
    </>
  );
}
