"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { safetyWorkflowApi } from "@/lib/safety-workflow-api";
import { chemicalCriticalFields, type SafetyRecord } from "@/lib/safety-workflows";

const SDS_API = "/api/v1/industrial/chemical-safety";

function SdsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { moduleEnabled } = useFieldPermissions();
  const focusId = String(search.get("id") ?? "").trim();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SafetyRecord[]>([]);
  const [selected, setSelected] = useState<SafetyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (focusId) {
        const row = await safetyWorkflowApi.get(SDS_API, focusId);
        setSelected(row);
        setRows([row]);
      } else {
        const list = await safetyWorkflowApi.list(SDS_API);
        setRows(list);
        setSelected(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load SDS records");
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [focusId]);

  useEffect(() => {
    if (!moduleEnabled("CHEMICAL_SAFETY")) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = `${row.title ?? ""} ${JSON.stringify(row.sourcePayload ?? {})}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query]);

  if (!moduleEnabled("CHEMICAL_SAFETY")) {
    return (
      <EmptyState
        title="Chemicals not enabled"
        message="Chemical Safety / SDS is not enabled for this company."
      />
    );
  }

  if (selected) {
    const fields = chemicalCriticalFields(selected);
    return (
      <>
        <p className="ff-brand-mark">SDS</p>
        <h1 className="ff-page-title">{selected.title || "Chemical"}</h1>
        <div className="ff-work-summary">
          {fields.map((field) => (
            <div key={field.label} className="ff-work-row">
              <span>{field.label}</span>
              <span>{field.value}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ff-btn"
          onClick={() => {
            setSelected(null);
            if (focusId) router.replace("/more/sds/");
          }}
        >
          Back to search
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">SDS</h1>
      <p className="ff-page-body">Critical chemical summaries for the floor.</p>
      <div className="ff-field">
        <label htmlFor="sds-q">Search</label>
        <input
          id="sds-q"
          className="ff-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Product, CAS, location…"
        />
      </div>

      {loading ? <LoadingState label="Loading chemicals…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          title="No chemicals found"
          message="Scan a chemical QR or refine your search."
        />
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <div className="ff-task-list">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="ff-task-card"
              onClick={() => setSelected(row)}
            >
              <div className="ff-task-card-body">
                <span className="ff-task-kind">SDS</span>
                <span className="ff-task-title">{row.title || "Untitled chemical"}</span>
                <span className="ff-meta">{row.status || "ACTIVE"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function SdsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading SDS…" />}>
      <SdsInner />
    </Suspense>
  );
}
