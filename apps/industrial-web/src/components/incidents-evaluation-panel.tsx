"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ensureEvaluationChecklist,
  incidentOptionLabel,
  type EvaluationChecklist,
  type EvaluationChecklistItem,
  type IncidentRecord,
} from "@/lib/incidents-module";

type Props = {
  incidents: IncidentRecord[];
  canManage: boolean;
  onSave: (incidentId: string, checklist: EvaluationChecklist) => Promise<void>;
};

export function IncidentsEvaluationPanel({ incidents, canManage, onSave }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<EvaluationChecklistItem[]>([]);
  const [completedBy, setCompletedBy] = useState("");
  const [overallNotes, setOverallNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const completedCount = items.filter((item) => item.checked).length;

  useEffect(() => {
    if (!selected) {
      setItems([]);
      setCompletedBy("");
      setOverallNotes("");
      setSaved(false);
      return;
    }
    const next = ensureEvaluationChecklist(selected);
    setItems(next.items);
    setCompletedBy(next.completedBy);
    setOverallNotes(next.overallNotes);
    setSaved(false);
    setError(null);
  }, [selected]);

  function toggleItem(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
    setSaved(false);
  }

  function updateNotes(id: string, notes: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)));
    setSaved(false);
  }

  function addPhotoNames(id: string, files: FileList | null) {
    if (!files?.length) return;
    const names = Array.from(files).map((f) => f.name);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              checked: true,
              photos: [...(item.photos ?? []), ...names],
              notes: item.notes || `Photos noted: ${names.join(", ")}`,
            }
          : item,
      ),
    );
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    if (!completedBy.trim()) {
      setError("Completed By is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selected.id, {
        completedBy: completedBy.trim(),
        completedAt: new Date().toISOString(),
        overallNotes: overallNotes.trim(),
        items,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save evaluation checklist");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="d-flex flex-column gap-4" onSubmit={(ev) => void onSubmit(ev)}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="eval-incident">
            Select Incident <span className="text-danger">*</span>
          </label>
          <select
            id="eval-incident"
            className="form-select"
            required
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
        <div className="col-md-6">
          <label className="form-label" htmlFor="eval-completed-by">
            Completed By <span className="text-danger">*</span>
          </label>
          <input
            id="eval-completed-by"
            className="form-control"
            required
            disabled={!canManage || !selected}
            value={completedBy}
            onChange={(ev) => {
              setCompletedBy(ev.target.value);
              setSaved(false);
            }}
          />
        </div>
      </div>

      {!selected ? (
        <div className="text-center py-5">
          <div className="avatar avatar-lg mx-auto mb-3">
            <span className="avatar-initial rounded-circle bg-label-secondary">
              <i className="bx bx-list-check" />
            </span>
          </div>
          <p className="text-muted mb-0">Choose an incident to complete the evaluation checklist.</p>
        </div>
      ) : (
        <>
          <div className="card border shadow-none">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h6 className="card-title mb-0">Post-Incident Evaluation Checklist</h6>
              <span className="badge bg-label-primary">
                {completedCount} of {items.length} complete
              </span>
            </div>
            <div className="list-group list-group-flush">
              {items.map((item) => (
                <div className="list-group-item py-3" key={item.id}>
                  <div className="form-check mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`eval-item-${item.id}`}
                      checked={item.checked}
                      disabled={!canManage}
                      onChange={() => toggleItem(item.id)}
                    />
                    <label className="form-check-label fw-semibold" htmlFor={`eval-item-${item.id}`}>
                      {item.label}
                    </label>
                  </div>
                  {item.id === "photos" ? (
                    <div className="mb-3">
                      <label className="form-label small" htmlFor="eval-photo-upload">
                        Photos
                      </label>
                      <input
                        id="eval-photo-upload"
                        type="file"
                        accept="image/*"
                        multiple
                        className="form-control"
                        disabled={!canManage}
                        onChange={(ev) => {
                          addPhotoNames(item.id, ev.target.files);
                          ev.target.value = "";
                        }}
                      />
                      {item.photos?.length ? (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {item.photos.map((photo) => (
                            <span className="badge bg-label-secondary" key={photo}>
                              {photo}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="form-label small" htmlFor={`eval-notes-${item.id}`}>
                    Notes (optional)
                  </label>
                  <input
                    id={`eval-notes-${item.id}`}
                    className="form-control form-control-sm"
                    disabled={!canManage}
                    value={item.notes}
                    onChange={(ev) => updateNotes(item.id, ev.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="eval-findings">
              Final Findings
            </label>
            <textarea
              id="eval-findings"
              className="form-control"
              rows={4}
              disabled={!canManage}
              value={overallNotes}
              onChange={(ev) => {
                setOverallNotes(ev.target.value);
                setSaved(false);
              }}
            />
          </div>

          {error ? (
            <div className="alert alert-danger mb-0" role="alert">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="alert alert-success mb-0" role="status">
              Evaluation checklist saved.
            </div>
          ) : null}

          {canManage ? (
            <div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save evaluation checklist"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
