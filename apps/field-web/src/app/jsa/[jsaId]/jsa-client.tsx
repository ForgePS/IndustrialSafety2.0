"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { safetyWorkflowApi } from "@/lib/safety-workflow-api";
import {
  acknowledgmentsOf,
  hasPersonAcknowledged,
  listFromPayload,
  recordText,
  type SafetyRecord,
} from "@/lib/safety-workflows";
import { hasInspectorSignature } from "@/lib/inspections";

const JSAS_API = "/api/v1/industrial/jsas";

export function JsaClient() {
  const params = useParams<{ jsaId: string }>();
  const router = useRouter();
  const { moduleEnabled, can } = useFieldPermissions();
  const { profile } = useFieldProfile();
  const id = String(params?.jsaId ?? "").trim();
  const [record, setRecord] = useState<SafetyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id || id === "placeholder") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await safetyWorkflowApi.get(JSAS_API, id);
      setRecord(row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load JSA");
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const alreadyAcked = useMemo(
    () =>
      record
        ? hasPersonAcknowledged(record, profile?.personnelId, profile?.displayName)
        : false,
    [record, profile?.personnelId, profile?.displayName],
  );

  const steps = record ? listFromPayload(record, "steps") : [];
  const hazards = record ? listFromPayload(record, "hazards") : [];
  const controls = record ? listFromPayload(record, "controls") : [];
  const ppe = record ? listFromPayload(record, "ppe") : [];
  const acks = record ? acknowledgmentsOf(record) : [];

  async function acknowledge() {
    if (!record || !hasInspectorSignature(signature)) {
      setError("Add your signature to acknowledge this JSA.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await safetyWorkflowApi.action(JSAS_API, record.id, "acknowledge", {
        acknowledgment: {
          personnelId: profile?.personnelId ?? null,
          name: profile?.displayName || "Field user",
          signature,
        },
      });
      setRecord(updated);
      setSignature("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save acknowledgment");
    } finally {
      setBusy(false);
    }
  }

  if (!moduleEnabled("JSAS")) {
    return (
      <EmptyState title="JSA not enabled" message="This module is not enabled for your company." />
    );
  }

  if (!id || id === "placeholder") {
    return (
      <>
        <EmptyState title="Choose a JSA" message="Open an assigned JSA from the list." />
        <button type="button" className="ff-btn" onClick={() => router.push("/jsa/")}>
          Browse JSAs
        </button>
      </>
    );
  }

  if (loading) return <LoadingState label="Loading JSA…" />;
  if (error && !record) {
    return <ErrorState title="JSA unavailable" message={error} onRetry={() => void refresh()} />;
  }
  if (!record) {
    return <EmptyState title="JSA not found" message="This analysis may have been archived." />;
  }

  return (
    <>
      <p className="ff-brand-mark">JSA</p>
      <h1 className="ff-page-title">{record.title || "Job Safety Analysis"}</h1>
      <p className="ff-meta">
        {[recordText(record, "divisionName", "division"), recordText(record, "location", "locationName"), recordText(record, "departmentName", "department")]
          .filter(Boolean)
          .join(" · ") || record.status || "ACTIVE"}
      </p>

      {recordText(record, "task", "description") ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Task</h2>
          <p className="ff-page-body">{recordText(record, "task", "description")}</p>
        </section>
      ) : null}

      {steps.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Work steps</h2>
          <ol className="ff-page-body" style={{ paddingLeft: 18 }}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

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

      {controls.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Controls</h2>
          <ul className="ff-page-body" style={{ paddingLeft: 18 }}>
            {controls.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {ppe.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Required PPE</h2>
          <ul className="ff-page-body" style={{ paddingLeft: 18 }}>
            {ppe.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ff-section">
        <h2 className="ff-section-title">Acknowledgments ({acks.length})</h2>
        {acks.length === 0 ? <p className="ff-meta">No crew acknowledgments yet.</p> : null}
        {acks.map((ack, index) => (
          <p key={index} className="ff-meta">
            {String(ack.name ?? "Crew member")}
            {ack.acknowledgedAt
              ? ` · ${new Date(String(ack.acknowledgedAt)).toLocaleString()}`
              : ""}
          </p>
        ))}
      </section>

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {alreadyAcked ? (
        <EmptyState title="You acknowledged this JSA" message="You are cleared to proceed with the briefed controls." />
      ) : can("field.jsa.execute") || can("field.access") ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Crew acknowledgment</h2>
          <div className="ff-field">
            <span className="ff-label">Signature</span>
            <FormSignaturePad value={signature} onChange={setSignature} disabled={busy} />
          </div>
          <button
            type="button"
            className="ff-btn"
            disabled={busy || !hasInspectorSignature(signature)}
            onClick={() => void acknowledge()}
          >
            {busy ? "Saving…" : "Acknowledge JSA"}
          </button>
        </section>
      ) : null}

      <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/jsa/")}>
        Back to JSAs
      </button>
    </>
  );
}
