"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  DISCIPLINARY_ACTION_TYPES,
  DISCIPLINARY_CATEGORIES,
  DISCIPLINE_ACTIVE_MONTHS,
  disciplineCategoryLabel,
  disciplineCountsUntil,
  disciplineStatusBadgeClass,
  disciplineStatusLabel,
  pointsForAction,
  type DisciplinaryAction,
  type DisciplinaryActionsResponse,
} from "@/lib/personnel-discipline";
import {
  guessTrainingRecordAttachmentMime,
  MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
  putPresignedTrainingRecordUpload,
} from "@/lib/training-record-attachments";
import { compressImageToUploadFile, imageCompressErrorMessage } from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";

type FormState = {
  actionType: string;
  category: string;
  actionDate: string;
  reason: string;
  details: string;
  issuedByName: string;
};

type UploadInit = { documentId: string; uploadUrl: string; mimeType?: string };

const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/*";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return {
    actionType: "VERBAL_WARNING",
    category: "SAFETY",
    actionDate: today(),
    reason: "",
    details: "",
    issuedByName: "",
  };
}

function formFromAction(action: DisciplinaryAction): FormState {
  return {
    actionType: action.actionType,
    category: action.category,
    actionDate: action.actionDate,
    reason: action.reason,
    details: action.details ?? "",
    issuedByName: action.issuedByName ?? "",
  };
}

function unwrapUploadInit(raw: unknown): UploadInit | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const src =
    typeof obj.documentId === "string"
      ? obj
      : obj.data && typeof obj.data === "object"
        ? (obj.data as Record<string, unknown>)
        : null;
  if (!src || typeof src.documentId !== "string" || typeof src.uploadUrl !== "string") return null;
  return {
    documentId: src.documentId,
    uploadUrl: src.uploadUrl,
    ...(typeof src.mimeType === "string" ? { mimeType: src.mimeType } : {}),
  };
}

/** Hidden camera + file inputs behind "Upload file" / "Take photo" buttons. */
function AttachButtons({
  idPrefix,
  disabled,
  busy,
  onFile,
}: {
  idPrefix: string;
  disabled: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pick = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (file) onFile(file);
  };
  return (
    <div className="d-flex flex-wrap gap-2">
      <input
        ref={fileRef}
        id={`${idPrefix}-file`}
        type="file"
        className="d-none"
        accept={FILE_ACCEPT}
        disabled={disabled}
        onChange={(e) => pick(e.currentTarget)}
      />
      <input
        ref={cameraRef}
        id={`${idPrefix}-camera`}
        type="file"
        className="d-none"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => pick(e.currentTarget)}
      />
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      >
        <i className="bx bx-upload me-1" aria-hidden="true" />
        {busy ? "Uploading…" : "Upload file"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
      >
        <i className="bx bx-camera me-1" aria-hidden="true" />
        Take photo
      </button>
    </div>
  );
}

type Props = {
  personnelId: string;
  canManage: boolean;
  /** Called after a change so the safety score can be reloaded. */
  onChanged?: () => void;
};

export function PersonnelDisciplinaryActions({ personnelId, canManage, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<DisciplinaryActionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [rescindingId, setRescindingId] = useState<string | null>(null);
  const [rescindReason, setRescindReason] = useState("");
  const { cropIfNeeded, cropModal } = useImageCrop();

  const base = `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/disciplinary-actions`;
  const actionBase = (action: Pick<DisciplinaryAction, "id" | "personnelId">) =>
    `/api/v1/industrial/personnel/${encodeURIComponent(action.personnelId)}/disciplinary-actions/${encodeURIComponent(action.id)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<DisciplinaryActionsResponse>(base));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load disciplinary actions");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setPendingFiles([]);
    setFormOpen(true);
    setExpanded(true);
  }

  function openEdit(action: DisciplinaryAction) {
    setEditingId(action.id);
    setForm(formFromAction(action));
    setPendingFiles([]);
    setFormOpen(true);
  }

  async function afterChange() {
    await load();
    onChanged?.();
  }

  /** Crop/compress, then presigned PUT + complete. Throws on failure. */
  async function uploadFile(action: Pick<DisciplinaryAction, "id" | "personnelId">, file: File) {
    const prepared = await compressImageToUploadFile(file, {
      maxBytes: MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
    });
    if (prepared.size <= 0 || prepared.size > MAX_TRAINING_RECORD_ATTACHMENT_BYTES) {
      throw new Error(
        `File must be between 1 byte and ${Math.round(MAX_TRAINING_RECORD_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
      );
    }
    const mimeType = guessTrainingRecordAttachmentMime(prepared);
    const init = unwrapUploadInit(
      await apiSend<unknown>(`${actionBase(action)}/attachments/upload-url`, "POST", {
        filename: prepared.name,
        mimeType,
        contentLength: prepared.size,
      }),
    );
    if (!init) throw new Error("Upload could not be started. Please try again.");
    await putPresignedTrainingRecordUpload(init.uploadUrl, prepared, init.mimeType || mimeType);
    await apiSend(`${actionBase(action)}/attachments/complete`, "POST", {
      documentId: init.documentId,
    });
  }

  async function prepareFile(file: File): Promise<File | null> {
    return cropIfNeeded(file, { title: "Crop disciplinary document before upload" });
  }

  async function attachToAction(action: DisciplinaryAction, file: File) {
    setError(null);
    const cropped = await prepareFile(file);
    if (!cropped) return;
    setUploadingId(action.id);
    try {
      await uploadFile(action, cropped);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : imageCompressErrorMessage(e, "Unable to upload that file."),
      );
    } finally {
      setUploadingId(null);
    }
  }

  async function stageFile(file: File) {
    const cropped = await prepareFile(file);
    if (cropped) setPendingFiles((prev) => [...prev, cropped]);
  }

  async function openAttachment(action: DisciplinaryAction, documentId: string) {
    setError(null);
    try {
      const res = await apiGet<{ downloadUrl: string }>(
        `${actionBase(action)}/attachments/${encodeURIComponent(documentId)}/download-url`,
      );
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open attachment");
    }
  }

  async function deleteAttachment(
    action: DisciplinaryAction,
    documentId: string,
    fileName: string,
  ) {
    if (!window.confirm(`Remove “${fileName}” from this disciplinary action?`)) return;
    setDeletingDocId(documentId);
    setError(null);
    try {
      await apiSend(
        `${actionBase(action)}/attachments/${encodeURIComponent(documentId)}`,
        "DELETE",
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove attachment");
    } finally {
      setDeletingDocId(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await apiSend(`${base}/${encodeURIComponent(editingId)}`, "PATCH", form);
      } else {
        const created = await apiSend<DisciplinaryAction>(base, "POST", form);
        if (pendingFiles.length > 0 && !Array.isArray(created.attachments)) {
          setError("Action recorded. File uploads are not available on the server yet.");
        }
        const failed: string[] = [];
        for (const file of Array.isArray(created.attachments) ? pendingFiles : []) {
          try {
            await uploadFile(created, file);
          } catch {
            failed.push(file.name);
          }
        }
        if (failed.length > 0) {
          setError(
            `Action recorded, but ${failed.length === 1 ? "this file" : "these files"} did not upload: ${failed.join(", ")}. Use Upload file on the action to try again.`,
          );
        }
      }
      setFormOpen(false);
      setEditingId(null);
      setPendingFiles([]);
      await afterChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save disciplinary action");
    } finally {
      setSaving(false);
    }
  }

  async function rescind(action: DisciplinaryAction) {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`${actionBase(action)}/rescind`, "POST", { reason: rescindReason });
      setRescindingId(null);
      setRescindReason("");
      await afterChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to rescind disciplinary action");
    } finally {
      setSaving(false);
    }
  }

  const impact = data?.impact;
  const items = data?.items ?? [];
  const summary = loading
    ? "Loading…"
    : impact && impact.activeCount > 0
      ? `${impact.activeCount} active · −${impact.deduction} safety score`
      : `${items.length} on file · no active deduction`;
  // Older API builds omit `attachments`; hide upload controls until the server supports them.
  const uploadsSupported = items.length === 0 || items.some((a) => Array.isArray(a.attachments));
  const formPoints = pointsForAction(form.actionType);
  const formCountsUntil = disciplineCountsUntil(form.actionDate);

  return (
    <section className="card mb-4">
      {cropModal}
      <button
        type="button"
        className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls="personnel-discipline-content"
      >
        <span>
          <h5 className="card-title mb-0">Disciplinary actions</h5>
          <small className={impact && impact.activeCount > 0 ? "text-danger" : "text-muted"}>
            {summary}
          </small>
        </span>
        <i className={`bx bx-chevron-${expanded ? "up" : "down"}`} aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="card-body pt-0" id="personnel-discipline-content">
          <p className="text-muted small">
            Each action deducts a set number of points from this person&apos;s safety score for{" "}
            {DISCIPLINE_ACTIVE_MONTHS} months from the action date. Rescinded or expired actions
            stay on file but no longer count.
          </p>
          {error ? (
            <div className="alert alert-warning py-2" role="alert">
              {error}
            </div>
          ) : null}

          {canManage && !formOpen ? (
            <button type="button" className="btn btn-sm btn-primary mb-3" onClick={openNew}>
              <i className="bx bx-plus me-1" aria-hidden="true" />
              Record disciplinary action
            </button>
          ) : null}

          {canManage && formOpen ? (
            <form className="border rounded p-3 mb-3" onSubmit={(e) => void submit(e)}>
              <h6 className="mb-3">
                {editingId ? "Edit disciplinary action" : "New disciplinary action"}
              </h6>
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="discipline-type">
                    Action
                  </label>
                  <select
                    id="discipline-type"
                    className="form-select"
                    value={form.actionType}
                    onChange={(e) => update("actionType", e.target.value)}
                  >
                    {DISCIPLINARY_ACTION_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label} (−{t.defaultPoints} pts)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="discipline-category">
                    Category
                  </label>
                  <select
                    id="discipline-category"
                    className="form-select"
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    {DISCIPLINARY_CATEGORIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="discipline-date">
                    Date of action
                  </label>
                  <input
                    id="discipline-date"
                    type="date"
                    className="form-control"
                    required
                    value={form.actionDate}
                    onChange={(e) => update("actionDate", e.target.value)}
                  />
                </div>
                <div className="col-12">
                  <div className="alert alert-secondary py-2 mb-0 small">
                    Deducts <strong>{formPoints} points</strong> from the safety score
                    {formCountsUntil ? (
                      <>
                        {" "}
                        until <strong>{formCountsUntil}</strong>
                      </>
                    ) : null}{" "}
                    ({DISCIPLINE_ACTIVE_MONTHS} months from the date of action).
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="discipline-reason">
                    Reason
                  </label>
                  <input
                    id="discipline-reason"
                    className="form-control"
                    required
                    maxLength={4000}
                    placeholder="e.g. Operated forklift without seatbelt"
                    value={form.reason}
                    onChange={(e) => update("reason", e.target.value)}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="discipline-details">
                    Details / corrective expectations
                  </label>
                  <textarea
                    id="discipline-details"
                    className="form-control"
                    rows={3}
                    value={form.details}
                    onChange={(e) => update("details", e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="discipline-issued-by">
                    Issued by
                  </label>
                  <input
                    id="discipline-issued-by"
                    className="form-control"
                    maxLength={200}
                    value={form.issuedByName}
                    onChange={(e) => update("issuedByName", e.target.value)}
                  />
                </div>
                {!editingId && uploadsSupported ? (
                  <div className="col-md-6">
                    <span className="form-label d-block">Signed write-up / documents</span>
                    <AttachButtons
                      idPrefix="discipline-new"
                      disabled={saving}
                      busy={false}
                      onFile={(file) => void stageFile(file)}
                    />
                    {pendingFiles.length > 0 ? (
                      <ul className="list-unstyled small mt-2 mb-0">
                        {pendingFiles.map((file, index) => (
                          <li
                            key={`${file.name}-${index}`}
                            className="d-flex align-items-center gap-2"
                          >
                            <i className="bx bx-file" aria-hidden="true" />
                            <span className="text-truncate">{file.name}</span>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger px-0 py-0"
                              disabled={saving}
                              onClick={() =>
                                setPendingFiles((prev) => prev.filter((_, i) => i !== index))
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <small className="text-muted d-block mt-1">
                        Optional. Files upload when you record the action.
                      </small>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="d-flex gap-2 mt-3">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Record action"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={saving}
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                    setPendingFiles([]);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {!loading && items.length === 0 ? (
            <p className="text-muted mb-0">No disciplinary actions on file.</p>
          ) : null}

          <div className="list-group list-group-flush">
            {items.map((action) => {
              const attachments = action.attachments ?? [];
              return (
                <div key={action.id} className="list-group-item px-0">
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div className="min-w-0">
                      <div className="fw-medium">
                        {action.actionTypeLabel}
                        <span className="text-muted fw-normal">
                          {" "}
                          · {disciplineCategoryLabel(action.category)}
                        </span>
                      </div>
                      <div
                        className={
                          action.status === "RESCINDED"
                            ? "text-decoration-line-through text-muted"
                            : ""
                        }
                      >
                        {action.reason}
                      </div>
                      {action.details ? (
                        <small className="text-muted d-block text-break">{action.details}</small>
                      ) : null}
                      <small className="text-muted d-block">
                        {action.actionDate}
                        {action.issuedByName ? ` · issued by ${action.issuedByName}` : ""}
                        {action.status === "ACTIVE" ? ` · counts until ${action.countsUntil}` : ""}
                      </small>
                      {action.status === "RESCINDED" ? (
                        <small className="text-muted d-block">
                          Rescinded {action.rescindedAt?.slice(0, 10) ?? ""}
                          {action.rescindedReason ? `: ${action.rescindedReason}` : ""}
                        </small>
                      ) : null}
                      {attachments.length > 0 ? (
                        <ul className="list-unstyled small mt-2 mb-0">
                          {attachments.map((file) => (
                            <li key={file.documentId} className="d-flex align-items-center gap-2">
                              <i className="bx bx-paperclip" aria-hidden="true" />
                              <button
                                type="button"
                                className="btn btn-link btn-sm px-0 py-0 text-truncate"
                                onClick={() => void openAttachment(action, file.documentId)}
                              >
                                {file.fileName}
                              </button>
                              {canManage ? (
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm text-danger px-0 py-0"
                                  disabled={deletingDocId === file.documentId}
                                  onClick={() =>
                                    void deleteAttachment(action, file.documentId, file.fileName)
                                  }
                                >
                                  Remove
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {canManage && Array.isArray(action.attachments) ? (
                        <div className="mt-2">
                          <AttachButtons
                            idPrefix={`discipline-${action.id}`}
                            disabled={uploadingId !== null || saving}
                            busy={uploadingId === action.id}
                            onFile={(file) => void attachToAction(action, file)}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="d-flex flex-column align-items-end gap-1 flex-shrink-0">
                      <span className={`badge ${disciplineStatusBadgeClass(action)}`}>
                        {disciplineStatusLabel(action)}
                      </span>
                      {canManage && action.status === "ACTIVE" ? (
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-link btn-sm px-0 py-0"
                            onClick={() => openEdit(action)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-link btn-sm px-0 py-0 text-danger"
                            onClick={() => {
                              setRescindingId(action.id);
                              setRescindReason("");
                            }}
                          >
                            Rescind
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {rescindingId === action.id ? (
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      <input
                        className="form-control form-control-sm flex-grow-1"
                        style={{ minWidth: 220 }}
                        placeholder="Reason for rescinding (required)"
                        value={rescindReason}
                        onChange={(e) => setRescindReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={saving || rescindReason.trim() === ""}
                        onClick={() => void rescind(action)}
                      >
                        Rescind
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={saving}
                        onClick={() => setRescindingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
