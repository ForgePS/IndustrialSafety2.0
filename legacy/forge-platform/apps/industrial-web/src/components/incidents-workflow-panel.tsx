"use client";

import { useEffect, useState } from "react";
import {
  ensureLifecycle,
  INCIDENT_LIFECYCLE_STAGES,
  incidentOptionLabel,
  lifecycleProgress,
  lifecycleStepBadgeClass,
  lifecycleStepLabel,
  setLifecycleStepStatus,
  type IncidentLifecycleData,
  type IncidentLifecycleStageId,
  type IncidentRecord,
  type LifecycleStepStatus,
} from "@/lib/incidents-module";

type Props = {
  incidents: IncidentRecord[];
  canManage: boolean;
  onSave: (incidentId: string, lifecycle: IncidentLifecycleData) => Promise<void>;
};

export function IncidentsWorkflowPanel({ incidents, canManage, onSave }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [lifecycle, setLifecycle] = useState<IncidentLifecycleData | null>(null);
  const [expanded, setExpanded] = useState<IncidentLifecycleStageId | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = incidents.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setLifecycle(null);
      setExpanded(null);
      setSaved(false);
      return;
    }
    const next = ensureLifecycle(selected);
    setLifecycle(next);
    setExpanded(next.currentStage);
    setSaved(false);
    setError(null);
  }, [selected]);

  function patchLifecycle(patch: Partial<IncidentLifecycleData>) {
    if (!lifecycle) return;
    setLifecycle({ ...lifecycle, ...patch });
    setSaved(false);
  }

  function patchStepNotes(stageId: IncidentLifecycleStageId, notes: string) {
    if (!lifecycle) return;
    setLifecycle({
      ...lifecycle,
      steps: lifecycle.steps.map((step) => (step.stageId === stageId ? { ...step, notes } : step)),
    });
    setSaved(false);
  }

  async function persist(next: IncidentLifecycleData) {
    if (!selected || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selected.id, next);
      setLifecycle(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workflow");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  async function markStatus(stageId: IncidentLifecycleStageId, status: LifecycleStepStatus) {
    if (!lifecycle || !selected) return;
    const next = setLifecycleStepStatus(
      lifecycle,
      stageId,
      status,
      selected.reportedBy || "Responder",
    );
    setLifecycle(next);
    setExpanded(stageId);
    await persist(next);
  }

  const progress = lifecycle ? lifecycleProgress(lifecycle) : 0;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="workflow-incident">
            Select Incident <span className="text-danger">*</span>
          </label>
          <select
            id="workflow-incident"
            className="form-select"
            value={selectedId}
            onChange={(ev) => setSelectedId(ev.target.value)}
          >
            <option value="">Choose an Incident...</option>
            {incidents.map((incident) => (
              <option key={incident.id} value={incident.id}>
                {incidentOptionLabel(incident)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selected || !lifecycle ? (
        <div className="text-center py-5">
          <div className="avatar avatar-lg mx-auto mb-3">
            <span className="avatar-initial rounded-circle bg-label-secondary">
              <i className="bx bx-transfer" />
            </span>
          </div>
          <p className="text-muted mb-0">Choose an incident to view and update its workflow.</p>
        </div>
      ) : (
        <>
          <div className="card border shadow-none">
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                <div className="min-w-0">
                  <h6 className="mb-1">{selected.title}</h6>
                  <p className="text-muted small mb-0">
                    Ticket {lifecycle.ticketId || "—"} · Priority {lifecycle.priority || "—"}
                  </p>
                </div>
                <div className="text-end">
                  <span className="d-block text-muted small text-uppercase">Progress</span>
                  <h5 className="mb-0">{progress}%</h5>
                </div>
              </div>
              <div className="progress">
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-label="Workflow progress"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {progress}%
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="workflow-priority">
                Priority
              </label>
              <select
                id="workflow-priority"
                className="form-select"
                value={lifecycle.priority}
                disabled={!canManage}
                onChange={(ev) => patchLifecycle({ priority: ev.target.value })}
              >
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Medium</option>
                <option value="P4">P4 — Low</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="workflow-subcategory">
                Sub-category
              </label>
              <input
                id="workflow-subcategory"
                className="form-control"
                value={lifecycle.subCategory}
                disabled={!canManage}
                onChange={(ev) => patchLifecycle({ subCategory: ev.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="workflow-ticket">
                Ticket ID
              </label>
              <input
                id="workflow-ticket"
                className="form-control"
                value={lifecycle.ticketId}
                disabled={!canManage}
                onChange={(ev) => patchLifecycle({ ticketId: ev.target.value })}
              />
            </div>
          </div>

          <div className="accordion">
            {INCIDENT_LIFECYCLE_STAGES.map((stage) => {
              const step = lifecycle.steps.find((s) => s.stageId === stage.id);
              if (!step) return null;
              const isOpen = expanded === stage.id;
              return (
                <div className="accordion-item" key={stage.id}>
                  <h2 className="accordion-header">
                    <button
                      type="button"
                      className={`accordion-button${isOpen ? "" : " collapsed"}`}
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : stage.id)}
                    >
                      <span className="avatar avatar-xs me-3">
                        <span
                          className={`avatar-initial rounded-circle ${lifecycleStepBadgeClass(step.status)}`}
                        >
                          {stage.step}
                        </span>
                      </span>
                      <span className="flex-grow-1">{stage.title}</span>
                      <span className={`badge ${lifecycleStepBadgeClass(step.status)} me-3`}>
                        {lifecycleStepLabel(step.status)}
                      </span>
                    </button>
                  </h2>
                  <div className={`accordion-collapse collapse${isOpen ? " show" : ""}`}>
                    <div className="accordion-body">
                      <p className="text-muted small">{stage.description}</p>
                      <label className="form-label" htmlFor={`workflow-notes-${stage.id}`}>
                        Notes
                      </label>
                      <textarea
                        id={`workflow-notes-${stage.id}`}
                        className="form-control mb-3"
                        rows={2}
                        value={step.notes}
                        disabled={!canManage}
                        onChange={(ev) => patchStepNotes(stage.id, ev.target.value)}
                      />
                      {step.completedBy ? (
                        <p className="text-muted small">
                          Completed by {step.completedBy}
                          {step.completedAt ? ` on ${step.completedAt.slice(0, 10)}` : ""}
                        </p>
                      ) : null}
                      {canManage ? (
                        <div className="d-flex flex-wrap gap-2">
                          {step.status !== "in-progress" && step.status !== "complete" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              disabled={saving}
                              onClick={() => void markStatus(stage.id, "in-progress")}
                            >
                              <i className="bx bx-time-five me-1" />
                              Mark in progress
                            </button>
                          ) : null}
                          {step.status !== "complete" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={saving}
                              onClick={() => void markStatus(stage.id, "complete")}
                            >
                              <i className="bx bx-check-circle me-1" />
                              Mark complete
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error ? (
            <div className="alert alert-danger mb-0" role="alert">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="alert alert-success mb-0" role="status">
              Workflow saved.
            </div>
          ) : null}

          {canManage ? (
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void persist(lifecycle)}
              >
                {saving ? "Saving…" : "Save workflow"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
