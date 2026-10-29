"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { safetyWorkflowApi } from "@/lib/safety-workflow-api";
import {
  enabledPermitTypes,
  listFromPayload,
  parsePermitType,
  recordText,
  type PermitTypeId,
  type SafetyRecord,
} from "@/lib/safety-workflows";
import { hasInspectorSignature } from "@/lib/inspections";

function PermitsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { moduleEnabled, can } = useFieldPermissions();
  const { profile } = useFieldProfile();
  const types = useMemo(() => enabledPermitTypes(moduleEnabled), [moduleEnabled]);
  const requested = parsePermitType(search.get("type"));
  const [activeType, setActiveType] = useState<PermitTypeId | null>(
    requested && types.some((t) => t.id === requested) ? requested : (types[0]?.id ?? null),
  );
  const [rows, setRows] = useState<SafetyRecord[]>([]);
  const [selected, setSelected] = useState<SafetyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState("");
  const [o2, setO2] = useState("");
  const [lel, setLel] = useState("");
  const [h2s, setH2s] = useState("");
  const [co, setCo] = useState("");

  const active = types.find((t) => t.id === activeType) ?? types[0] ?? null;

  useEffect(() => {
    if (requested && types.some((t) => t.id === requested)) {
      setActiveType(requested);
    } else if (!activeType && types[0]) {
      setActiveType(types[0].id);
    }
  }, [requested, types, activeType]);

  const refresh = useCallback(async () => {
    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const list = await safetyWorkflowApi.list(active.apiPath);
      setRows(list.filter((row) => !/archiv/i.test(String(row.status ?? ""))));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load permits");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(action: "acknowledge" | "start" | "close") {
    if (!active || !selected) return;
    if ((action === "acknowledge" || action === "start") && !hasInspectorSignature(signature)) {
      setError("Add a signature before continuing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        acknowledgment: {
          personnelId: profile?.personnelId ?? null,
          name: profile?.displayName || "Field user",
          signature,
        },
      };
      if (active.id === "confined-space" && (o2 || lel || h2s || co)) {
        body.atmosphericReading = {
          o2,
          lel,
          h2s,
          co,
          recordedBy: profile?.displayName || "Field user",
        };
      }
      const updated = await safetyWorkflowApi.action(active.apiPath, selected.id, action, body);
      setSelected(updated);
      setSignature("");
      await refresh();
      setSelected(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update permit");
    } finally {
      setBusy(false);
    }
  }

  if (types.length === 0) {
    return (
      <EmptyState
        title="No permit modules enabled"
        message="Enable Hot Work, Confined Space, Working at Heights, or Electrical in Forge Industrial Safety."
      />
    );
  }

  if (selected) {
    const hazards = listFromPayload(selected, "hazards");
    const readings = Array.isArray(selected.sourcePayload?.atmosphericReadings)
      ? (selected.sourcePayload?.atmosphericReadings as Array<Record<string, unknown>>)
      : [];
    return (
      <>
        <p className="ff-brand-mark">{active?.label || "Permit"}</p>
        <h1 className="ff-page-title">{selected.title || "Permit"}</h1>
        <p className="ff-meta">{selected.status || "OPEN"}</p>
        <p className="ff-page-body">
          {[
            recordText(selected, "divisionName", "division"),
            recordText(selected, "location", "locationName"),
            recordText(selected, "departmentName", "department"),
          ]
            .filter(Boolean)
            .join(" · ") || recordText(selected, "description")}
        </p>
        {hazards.length > 0 ? (
          <section className="ff-section">
            <h2 className="ff-section-title">Hazards</h2>
            <ul className="ff-page-body" style={{ paddingLeft: 18 }}>
              {hazards.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {active?.id === "confined-space" ? (
          <section className="ff-section">
            <h2 className="ff-section-title">Atmospheric reading</h2>
            <div className="ff-field">
              <label htmlFor="permit-o2">O₂ %</label>
              <input
                id="permit-o2"
                className="ff-input"
                value={o2}
                onChange={(e) => setO2(e.target.value)}
              />
            </div>
            <div className="ff-field">
              <label htmlFor="permit-lel">LEL %</label>
              <input
                id="permit-lel"
                className="ff-input"
                value={lel}
                onChange={(e) => setLel(e.target.value)}
              />
            </div>
            <div className="ff-field">
              <label htmlFor="permit-h2s">H₂S ppm</label>
              <input
                id="permit-h2s"
                className="ff-input"
                value={h2s}
                onChange={(e) => setH2s(e.target.value)}
              />
            </div>
            <div className="ff-field">
              <label htmlFor="permit-co">CO ppm</label>
              <input
                id="permit-co"
                className="ff-input"
                value={co}
                onChange={(e) => setCo(e.target.value)}
              />
            </div>
            {readings.length > 0 ? (
              <p className="ff-meta">{readings.length} prior reading(s) on file</p>
            ) : null}
          </section>
        ) : null}
        <div className="ff-field">
          <span className="ff-label">Signature</span>
          <FormSignaturePad value={signature} onChange={setSignature} disabled={busy} />
        </div>
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="ff-action-grid">
          <button
            type="button"
            className="ff-btn"
            disabled={busy}
            onClick={() => void runAction("acknowledge")}
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            disabled={busy}
            onClick={() => void runAction("start")}
          >
            Start / activate
          </button>
          {(can("field.permits.approve") || can("field.access")) && (
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={busy}
              onClick={() => void runAction("close")}
            >
              Close permit
            </button>
          )}
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => {
              setSelected(null);
              setError(null);
            }}
          >
            Back to list
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Permits</h1>
      <p className="ff-page-body">Enabled permit types for your company.</p>
      <div className="ff-tabs" role="tablist" aria-label="Permit type">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={active?.id === type.id}
            className={active?.id === type.id ? "ff-tab ff-tab-active" : "ff-tab"}
            onClick={() => {
              setActiveType(type.id);
              router.replace(`/more/permits/?type=${encodeURIComponent(type.id)}`);
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState label="Loading permits…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title={`No ${active?.label ?? "permit"} records`}
          message="Permits created in Forge Industrial Safety will appear here."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="ff-task-list">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="ff-task-card"
              onClick={() => setSelected(row)}
            >
              <div className="ff-task-card-body">
                <span className="ff-task-kind">{active?.label}</span>
                <span className="ff-task-title">{row.title || "Untitled permit"}</span>
                <span className="ff-meta">{row.status || "OPEN"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function PermitsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading permits…" />}>
      <PermitsInner />
    </Suspense>
  );
}
