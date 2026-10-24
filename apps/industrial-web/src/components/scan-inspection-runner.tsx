"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiSend } from "@forge/web-kit";
import {
  canCompleteInspection,
  type InspectionAnswer,
  type InspectionPhoto,
  type InspectionRunItem,
} from "@/lib/inspections-module";
import { formatApiErrorMessage } from "@/lib/api-error";
import type { ScanInspectionCompleteResult, ScanInspectionStartResult } from "@/lib/scan-public";
import { compressImageToDataUrl, DEFAULT_MAX_DATA_URL_LENGTH } from "@/lib/compress-image";

type Props = {
  token: string;
  employeeNumber: string;
  label: string;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  templateId?: string;
  onComplete: (result: ScanInspectionCompleteResult) => void;
  onCancel: () => void;
};

async function compressImageFile(file: File): Promise<InspectionPhoto> {
  const dataUrl = await compressImageToDataUrl(file, DEFAULT_MAX_DATA_URL_LENGTH);
  return {
    id: crypto.randomUUID(),
    fileName: (file.name || "photo").replace(/\.\w+$/, "") + ".jpg",
    contentType: "image/jpeg",
    dataUrl,
  };
}

function normalizeItems(raw: Array<Record<string, unknown>>): InspectionRunItem[] {
  return raw.map((item, index) => {
    const base: InspectionRunItem = {
      id: String(item.id ?? `item-${index}`),
      label: String(item.label ?? "Checklist item"),
      required: item.required === true,
      answer: (item.answer as InspectionAnswer) ?? null,
      notes: typeof item.notes === "string" ? item.notes : "",
      photos: [],
    };
    if (typeof item.section === "string" && item.section.trim()) {
      base.section = item.section;
    }
    return base;
  });
}

export function ScanInspectionRunner({
  token,
  employeeNumber,
  label,
  frequency,
  templateId,
  onComplete,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(label);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [items, setItems] = useState<InspectionRunItem[]>([]);
  const [notesModalItemId, setNotesModalItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesModalItem = useMemo(
    () => items.find((item) => item.id === notesModalItemId) ?? null,
    [items, notesModalItemId],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await apiSend<ScanInspectionStartResult>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/inspections`,
        "POST",
        {
          employeeNumber,
          frequency,
          templateId,
          appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      );
      setInspectionId(started.inspectionId);
      setTitle(started.title ?? label);
      setItems(normalizeItems(started.items ?? []));
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not start inspection."));
    } finally {
      setBusy(false);
    }
  }, [token, employeeNumber, frequency, templateId, label]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (!notesModalItemId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`scan-notes-modal-${notesModalItemId}`)?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [notesModalItemId]);

  function setAnswer(itemId: string, answer: InspectionAnswer) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, answer } : item)));
    if (answer === "NO") setNotesModalItemId(itemId);
    else if (notesModalItemId === itemId) setNotesModalItemId(null);
  }

  function setNotes(itemId: string, notes: string) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, notes } : item)));
  }

  async function addPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    const photos: InspectionPhoto[] = [];
    for (const file of Array.from(files)) {
      photos.push(await compressImageFile(file));
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              answer: item.answer ?? "NO",
              photos: [...(item.photos ?? []), ...photos],
              notes:
                item.notes ||
                `Photo evidence attached (${photos.map((p) => p.fileName).join(", ")})`,
            }
          : item,
      ),
    );
    setNotesModalItemId(itemId);
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    if (!inspectionId) return;
    const check = canCompleteInspection(items);
    if (!check.ok) {
      setError(check.reason ?? "Complete every item before submitting.");
      const missing = items.find((item) => item.answer === "NO" && !(item.notes ?? "").trim());
      if (missing) setNotesModalItemId(missing.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<ScanInspectionCompleteResult>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/inspections/${encodeURIComponent(inspectionId)}/complete`,
        "POST",
        {
          employeeNumber,
          items,
          appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      );
      onComplete(result);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not complete inspection."));
    } finally {
      setBusy(false);
    }
  }

  if (!inspectionId && busy) {
    return <p className="text-muted small mb-0">Starting inspection…</p>;
  }

  return (
    <div className="card border shadow-none mt-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h6 className="mb-0">{title}</h6>
        <button type="button" className="btn btn-sm btn-link" onClick={onCancel}>
          Back
        </button>
      </div>
      <form className="card-body" onSubmit={(event) => void complete(event)}>
        {error ? (
          <div className="alert alert-danger py-2" role="alert">
            {error}
          </div>
        ) : null}
        <div className="d-grid gap-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded p-2">
              <div className="fw-semibold small">{item.label}</div>
              <div className="d-flex flex-wrap gap-2 mt-2">
                {(["YES", "NO", "NA"] as InspectionAnswer[]).map((answer) => (
                  <button
                    key={answer ?? "null"}
                    type="button"
                    className={`btn btn-sm ${
                      item.answer === answer
                        ? answer === "NO"
                          ? "btn-danger"
                          : "btn-primary"
                        : "btn-outline-secondary"
                    }`}
                    onClick={() => setAnswer(item.id, answer)}
                  >
                    {answer === "YES" ? "Yes" : answer === "NO" ? "No" : "N/A"}
                  </button>
                ))}
              </div>
              {item.answer === "NO" ? (
                <div className="mt-2">
                  {(item.notes ?? "").trim() ? (
                    <p className="small mb-1">{item.notes}</p>
                  ) : (
                    <p className="small text-danger mb-1">Notes required</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setNotesModalItemId(item.id)}
                  >
                    Open notes &amp; photos
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="btn btn-primary w-100 mt-3"
          disabled={busy || !inspectionId}
        >
          {busy ? "Submitting…" : "Complete inspection"}
        </button>
      </form>

      {notesModalItem ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-finding-notes-title"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setNotesModalItemId(null)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setNotesModalItemId(null);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <div className="min-w-0">
                  <h5 className="modal-title mb-0" id="scan-finding-notes-title">
                    Finding notes
                  </h5>
                  <p className="text-muted small mb-0 text-truncate">{notesModalItem.label}</p>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setNotesModalItemId(null)}
                />
              </div>
              <div className="modal-body">
                <label className="form-label" htmlFor={`scan-notes-modal-${notesModalItem.id}`}>
                  Notes (required)
                </label>
                <textarea
                  id={`scan-notes-modal-${notesModalItem.id}`}
                  className="form-control mb-3"
                  rows={3}
                  value={notesModalItem.notes ?? ""}
                  onChange={(e) => setNotes(notesModalItem.id, e.target.value)}
                  placeholder="Describe the finding…"
                />
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <label className="btn btn-outline-primary mb-0">
                    <i className="bx bx-camera me-1" aria-hidden="true" />
                    Take photo
                    <input
                      type="file"
                      className="d-none"
                      accept="image/*"
                      capture="environment"
                      onChange={(ev) => {
                        void addPhotos(notesModalItem.id, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </label>
                  <label className="btn btn-outline-secondary mb-0">
                    <i className="bx bx-image-add me-1" aria-hidden="true" />
                    Upload photo
                    <input
                      type="file"
                      className="d-none"
                      accept="image/*"
                      multiple
                      onChange={(ev) => {
                        void addPhotos(notesModalItem.id, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {(notesModalItem.photos ?? []).length > 0 ? (
                  <div className="d-flex flex-wrap gap-2">
                    {(notesModalItem.photos ?? []).map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.dataUrl}
                        alt={photo.fileName}
                        className="rounded border"
                        style={{ width: 96, height: 96, objectFit: "cover" }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setNotesModalItemId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
