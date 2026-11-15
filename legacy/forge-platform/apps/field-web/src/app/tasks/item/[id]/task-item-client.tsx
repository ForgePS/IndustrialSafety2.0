"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { fieldTaskApi, type FieldTaskDetailExtras, type FieldTaskRecord } from "@/lib/task-api";
import { formatDueLabel, statusLabel } from "@/lib/my-work";

export function TaskItemClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "").trim();
  const [task, setTask] = useState<FieldTaskRecord | null>(null);
  const [extras, setExtras] = useState<FieldTaskDetailExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id || id === "placeholder") {
      setLoading(false);
      setTask(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [record, detail] = await Promise.all([
        fieldTaskApi.get(id),
        fieldTaskApi.detail(id).catch(() => null),
      ]);
      setTask(record);
      setExtras(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load task.");
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const completed = /complete|done/i.test(String(task?.status ?? ""));

  const runAction = async (action: "start" | "complete") => {
    if (!id || id === "placeholder") return;
    setBusy(true);
    setError(null);
    try {
      if (action === "start") await fieldTaskApi.start(id);
      else await fieldTaskApi.complete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    } finally {
      setBusy(false);
    }
  };

  if (!id || id === "placeholder") {
    return <EmptyState title="Open a task" message="Choose an assigned task from My Work." />;
  }

  if (loading) return <LoadingState label="Loading task…" />;
  if (error && !task) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!task) return <EmptyState title="Task not found" />;

  const payload =
    task.sourcePayload && typeof task.sourcePayload === "object" ? task.sourcePayload : {};
  const description =
    typeof payload.description === "string"
      ? payload.description
      : typeof payload.notes === "string"
        ? payload.notes
        : null;
  const locationName = typeof payload.locationName === "string" ? payload.locationName : null;
  const divisionName = typeof payload.divisionName === "string" ? payload.divisionName : null;

  return (
    <>
      <h1 className="ff-page-title">{task.title?.trim() || "Task"}</h1>
      <p className="ff-meta">
        {[statusLabel(String(task.status ?? "")), formatDueLabel(task.dueDate ?? null)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {[divisionName, locationName].filter(Boolean).length > 0 ? (
        <p className="ff-page-body">{[divisionName, locationName].filter(Boolean).join(" · ")}</p>
      ) : null}
      {description ? <p className="ff-page-body">{description}</p> : null}
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {(extras?.checklist?.length ?? 0) > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Checklist</h2>
          <ul className="ff-plain-list">
            {extras!.checklist!.map((item) => (
              <li key={item.id}>{item.label || "Checklist item"}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="ff-action-grid">
        {!completed ? (
          <>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={busy}
              onClick={() => void runAction("start")}
            >
              Start
            </button>
            <button
              type="button"
              className="ff-btn"
              disabled={busy}
              onClick={() => void runAction("complete")}
            >
              Mark complete
            </button>
          </>
        ) : (
          <button type="button" className="ff-btn" onClick={() => router.push("/tasks/")}>
            Back to My Work
          </button>
        )}
      </div>
    </>
  );
}
