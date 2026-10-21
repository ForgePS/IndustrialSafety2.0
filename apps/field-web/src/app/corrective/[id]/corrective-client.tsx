"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import {
  fieldCorrectiveApi,
  type FieldCorrectiveRecord,
} from "@/lib/corrective-api";
import { formatDueLabel, statusLabel } from "@/lib/my-work";
import { useFieldProfile } from "@/hooks/use-field-profile";

export function CorrectiveClient() {
  const router = useRouter();
  const { profile } = useFieldProfile();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "").trim();
  const [record, setRecord] = useState<FieldCorrectiveRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id || id === "placeholder") {
      setLoading(false);
      setRecord(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await fieldCorrectiveApi.get(id);
      setRecord(row);
      setNotes(row.evidenceNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load corrective action.");
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const completed = /complete/i.test(String(record?.status ?? ""));

  const markComplete = async () => {
    if (!id || id === "placeholder") return;
    setBusy(true);
    setError(null);
    try {
      const body: { notes?: string; completedByName?: string } = {};
      if (notes.trim()) body.notes = notes.trim();
      if (profile?.displayName) body.completedByName = profile.displayName;
      await fieldCorrectiveApi.complete(id, body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete corrective action.");
    } finally {
      setBusy(false);
    }
  };

  if (!id || id === "placeholder") {
    return (
      <EmptyState
        title="Open a corrective action"
        message="Choose an assigned corrective action from My Work."
      />
    );
  }

  if (loading) return <LoadingState label="Loading corrective action…" />;
  if (error && !record) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!record) return <EmptyState title="Corrective action not found" />;

  return (
    <>
      <h1 className="ff-page-title">{record.title?.trim() || "Corrective action"}</h1>
      <p className="ff-meta">
        {[
          statusLabel(String(record.status ?? "")),
          record.priority,
          formatDueLabel(record.dueDate ?? null),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {record.parentEntityType ? (
        <p className="ff-page-body">Related: {record.parentEntityType}</p>
      ) : null}
      {record.finding ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Finding</h2>
          <p className="ff-page-body">{record.finding}</p>
        </section>
      ) : null}
      {record.requiredAction || record.description ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Required action</h2>
          <p className="ff-page-body">{record.requiredAction || record.description}</p>
        </section>
      ) : null}

      {!completed ? (
        <label className="ff-org-field">
          <span className="ff-org-label">Completion notes</span>
          <textarea
            className="ff-textarea"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what was done"
          />
        </label>
      ) : record.evidenceNotes ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Evidence notes</h2>
          <p className="ff-page-body">{record.evidenceNotes}</p>
        </section>
      ) : null}

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ff-action-grid" style={{ marginTop: 16 }}>
        {!completed ? (
          <button type="button" className="ff-btn" disabled={busy} onClick={() => void markComplete()}>
            Mark complete
          </button>
        ) : (
          <button type="button" className="ff-btn" onClick={() => router.push("/tasks/")}>
            Back to My Work
          </button>
        )}
      </div>
    </>
  );
}
