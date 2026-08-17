"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  emptyCorrectiveAction,
  ensureRootCauseAnalysis,
  incidentOptionLabel,
  type CorrectiveAction,
  type IncidentRecord,
  type RootCauseAnalysis,
} from "@/lib/incidents-module";

type Props = {
  incidents: IncidentRecord[];
  canManage: boolean;
  onSave: (incidentId: string, rca: RootCauseAnalysis) => Promise<void>;
};

export function IncidentsRcaPanel({ incidents, canManage, onSave }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [contributingFactors, setContributingFactors] = useState<string[]>([""]);
  const [rootCause, setRootCause] = useState("");
  const [fiveWhys, setFiveWhys] = useState<string[]>(["", "", "", "", ""]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([
    emptyCorrectiveAction(),
  ]);
  const [conductedBy, setConductedBy] = useState("");
  const [participants, setParticipants] = useState<string[]>([""]);
  const [eventDate, setEventDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = incidents.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setSummary("");
      setImmediateActions("");
      setContributingFactors([""]);
      setRootCause("");
      setFiveWhys(["", "", "", "", ""]);
      setCorrectiveActions([emptyCorrectiveAction()]);
      setConductedBy("");
      setParticipants([""]);
      setEventDate("");
      setSaved(false);
      return;
    }
    const next = ensureRootCauseAnalysis(selected);
    setSummary(next.incidentSummary);
    setImmediateActions(next.immediateActions);
    setContributingFactors(next.contributingFactors);
    setRootCause(next.rootCause);
    setFiveWhys(next.fiveWhys);
    setCorrectiveActions(next.correctiveActions);
    setConductedBy(next.conductedBy);
    setParticipants(next.participantsInvolved);
    setEventDate(next.eventDate);
    setSaved(false);
    setError(null);
  }, [selected]);

  function touch() {
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    if (!summary.trim() || !immediateActions.trim() || !rootCause.trim()) {
      setError("Incident summary, immediate actions, and root cause are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selected.id, {
        incidentSummary: summary.trim(),
        immediateActions: immediateActions.trim(),
        contributingFactors: contributingFactors.map((f) => f.trim()).filter(Boolean),
        rootCause: rootCause.trim(),
        fiveWhys,
        correctiveActions: correctiveActions.filter((a) => a.action.trim()),
        conductedBy: conductedBy.trim(),
        conductedAt: new Date().toISOString(),
        participantsInvolved: participants.map((p) => p.trim()).filter(Boolean),
        eventDate,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save root cause analysis");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="d-flex flex-column gap-4" onSubmit={(ev) => void onSubmit(ev)}>
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label" htmlFor="rca-incident">
            Link to Incident <span className="text-danger">*</span>
          </label>
          <select
            id="rca-incident"
            className="form-select"
            required
            value={selectedId}
            onChange={(ev) => setSelectedId(ev.target.value)}
          >
            <option value="">Search incident...</option>
            {incidents.map((incident) => (
              <option key={incident.id} value={incident.id}>
                {incidentOptionLabel(incident)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="rca-event-date">
            Event Date <span className="text-danger">*</span>
          </label>
          <input
            id="rca-event-date"
            type="date"
            className="form-control"
            required
            disabled={!canManage || !selected}
            value={eventDate}
            onChange={(ev) => {
              setEventDate(ev.target.value);
              touch();
            }}
          />
        </div>
      </div>

      {!selected ? (
        <div className="text-center py-5">
          <div className="avatar avatar-lg mx-auto mb-3">
            <span className="avatar-initial rounded-circle bg-label-secondary">
              <i className="bx bx-search-alt" />
            </span>
          </div>
          <p className="text-muted mb-0">Link an incident to begin the root cause analysis.</p>
        </div>
      ) : (
        <>
          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">Analysis team</h6>
            </div>
            <div className="card-body">
              <div className="form-label" id="rca-personnel-label">
                Names of personnel in the analysis
              </div>
              {participants.map((name, index) => (
                <input
                  key={`participant-${index}`}
                  className="form-control mb-2"
                  placeholder="Contributor name"
                  aria-labelledby="rca-personnel-label"
                  disabled={!canManage}
                  value={name}
                  onChange={(ev) => {
                    setParticipants((prev) =>
                      prev.map((p, i) => (i === index ? ev.target.value : p)),
                    );
                    touch();
                  }}
                />
              ))}
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary mb-3"
                  onClick={() => {
                    setParticipants((prev) => [...prev, ""]);
                    touch();
                  }}
                >
                  <i className="bx bx-plus me-1" />
                  Add contributor
                </button>
              ) : null}
              <div>
                <label className="form-label" htmlFor="rca-conducted-by">
                  Conducted by
                </label>
                <input
                  id="rca-conducted-by"
                  className="form-control"
                  disabled={!canManage}
                  value={conductedBy}
                  onChange={(ev) => {
                    setConductedBy(ev.target.value);
                    touch();
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">Incident review</h6>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label" htmlFor="rca-summary">
                  Incident Summary <span className="text-danger">*</span>
                </label>
                <textarea
                  id="rca-summary"
                  className="form-control"
                  rows={3}
                  required
                  disabled={!canManage}
                  value={summary}
                  onChange={(ev) => {
                    setSummary(ev.target.value);
                    touch();
                  }}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="rca-immediate">
                  Immediate Action Taken <span className="text-danger">*</span>
                </label>
                <textarea
                  id="rca-immediate"
                  className="form-control"
                  rows={3}
                  required
                  disabled={!canManage}
                  placeholder="What happened immediately to limit the impact…"
                  value={immediateActions}
                  onChange={(ev) => {
                    setImmediateActions(ev.target.value);
                    touch();
                  }}
                />
              </div>
              <div className="mb-0">
                <div className="form-label" id="rca-factors-label">
                  Contributing factors
                </div>
                {contributingFactors.map((factor, index) => (
                  <input
                    key={`factor-${index}`}
                    className="form-control mb-2"
                    placeholder={`Factor ${index + 1}`}
                    aria-labelledby="rca-factors-label"
                    disabled={!canManage}
                    value={factor}
                    onChange={(ev) => {
                      setContributingFactors((prev) =>
                        prev.map((f, i) => (i === index ? ev.target.value : f)),
                      );
                      touch();
                    }}
                  />
                ))}
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      setContributingFactors((prev) => [...prev, ""]);
                      touch();
                    }}
                  >
                    <i className="bx bx-plus me-1" />
                    Add factor
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">5 Why analysis</h6>
            </div>
            <div className="card-body">
              {fiveWhys.map((why, index) => (
                <div className="mb-3" key={`why-${index}`}>
                  <label className="form-label" htmlFor={`rca-why-${index}`}>
                    Why {index + 1}
                  </label>
                  <input
                    id={`rca-why-${index}`}
                    className="form-control"
                    disabled={!canManage}
                    placeholder={
                      index === 0
                        ? "Why did the incident occur?"
                        : "Why did the previous answer happen?"
                    }
                    value={why}
                    onChange={(ev) => {
                      setFiveWhys((prev) => prev.map((w, i) => (i === index ? ev.target.value : w)));
                      touch();
                    }}
                  />
                </div>
              ))}
              <div className="mb-0">
                <label className="form-label" htmlFor="rca-root">
                  Root Cause <span className="text-danger">*</span>
                </label>
                <textarea
                  id="rca-root"
                  className="form-control"
                  rows={3}
                  required
                  disabled={!canManage}
                  placeholder="The fundamental cause identified through analysis…"
                  value={rootCause}
                  onChange={(ev) => {
                    setRootCause(ev.target.value);
                    touch();
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">Corrective actions</h6>
            </div>
            <div className="card-body">
              {correctiveActions.map((action, index) => (
                <div className="row g-3 mb-4" key={action.id}>
                  <div className="col-12">
                    <label className="form-label" htmlFor={`rca-ca-action-${index}`}>
                      Corrective action plan description
                    </label>
                    <input
                      id={`rca-ca-action-${index}`}
                      className="form-control"
                      disabled={!canManage}
                      value={action.action}
                      onChange={(ev) => {
                        setCorrectiveActions((prev) =>
                          prev.map((a, i) => (i === index ? { ...a, action: ev.target.value } : a)),
                        );
                        touch();
                      }}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor={`rca-ca-assigned-${index}`}>
                      Assigned to
                    </label>
                    <input
                      id={`rca-ca-assigned-${index}`}
                      className="form-control"
                      disabled={!canManage}
                      value={action.assignedTo}
                      onChange={(ev) => {
                        setCorrectiveActions((prev) =>
                          prev.map((a, i) =>
                            i === index ? { ...a, assignedTo: ev.target.value } : a,
                          ),
                        );
                        touch();
                      }}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor={`rca-ca-due-${index}`}>
                      Due date
                    </label>
                    <input
                      id={`rca-ca-due-${index}`}
                      type="date"
                      className="form-control"
                      disabled={!canManage}
                      value={action.dueDate}
                      onChange={(ev) => {
                        setCorrectiveActions((prev) =>
                          prev.map((a, i) => (i === index ? { ...a, dueDate: ev.target.value } : a)),
                        );
                        touch();
                      }}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor={`rca-ca-status-${index}`}>
                      Status
                    </label>
                    <select
                      id={`rca-ca-status-${index}`}
                      className="form-select"
                      disabled={!canManage}
                      value={action.status}
                      onChange={(ev) => {
                        setCorrectiveActions((prev) =>
                          prev.map((a, i) => (i === index ? { ...a, status: ev.target.value } : a)),
                        );
                        touch();
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                </div>
              ))}
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => {
                    setCorrectiveActions((prev) => [...prev, emptyCorrectiveAction()]);
                    touch();
                  }}
                >
                  <i className="bx bx-plus me-1" />
                  Add corrective action
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="alert alert-danger mb-0" role="alert">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="alert alert-success mb-0" role="status">
              Root cause analysis saved.
            </div>
          ) : null}

          {canManage ? (
            <div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save root cause analysis"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
