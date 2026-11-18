"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { trainingApi } from "@/features/training/api";
import {
  guessTrainingRecordAttachmentMime,
  MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
  putPresignedTrainingRecordUpload,
  type TrainingRecordAttachment,
} from "@/lib/training-record-attachments";
import { compressImageToUploadFile, imageCompressErrorMessage } from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";

type TrainingHistoryResponse = {
  openAssignments: Array<{
    assignee: { status: string; bestPercent?: number | null };
    assignment: { title: string; dueAt?: string | null; passingPercent: number };
    sourceTitle: string;
  }>;
  trainingRecords: Array<{
    id: string;
    kind?: "completion" | "record";
    title: string;
    courseName?: string | null;
    result?: string | null;
    scorePercent?: number | null;
    attemptNumber?: number | null;
    completedAt?: string | Date | null;
    expiresAt?: string | Date | null;
    instructorName?: string | null;
    notes?: string | null;
    printCompletionId?: string | null;
    attachments?: TrainingRecordAttachment[];
    canUploadAttachment?: boolean;
  }>;
};

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  originalFilename: string;
  mimeType: string;
};

type ManualRecordForm = {
  title: string;
  completedAt: string;
  instructorName: string;
  notes: string;
  expiresAt: string;
  result: string;
  scorePercent: string;
  attemptNumber: string;
};

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "PASSED") return "bg-label-success";
  if (normalized === "IN_PROGRESS") return "bg-label-primary";
  if (normalized === "OVERDUE") return "bg-label-danger";
  return "bg-label-secondary";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const raw = typeof value === "string" ? value : value.toISOString();
  return raw.slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const emptyManualForm = (): ManualRecordForm => ({
  title: "",
  completedAt: todayInputValue(),
  instructorName: "",
  notes: "",
  expiresAt: "",
  result: "COMPLETED",
  scorePercent: "",
  attemptNumber: "",
});

export function PersonnelTrainingHistory({ personnelId }: { personnelId: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canManageRecords =
    permissions.has("industrial.training.manage") || permissions.has("industrial.admin");
  const canEditOrDeleteRecords = Boolean(me?.isPlatformAdmin) || canManageRecords;
  const canDeleteAttachments = canManageRecords || permissions.has("industrial.personnel.manage");

  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<TrainingHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [uploadBusyId, setUploadBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualRecordForm>(emptyManualForm);
  const [pendingCertificate, setPendingCertificate] = useState<File | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const { cropIfNeeded, cropModal } = useImageCrop();

  const formMode = editingRecordId ? "edit" : "create";
  const formOpen = showAddForm || Boolean(editingRecordId);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiGet<TrainingHistoryResponse>(
        `/api/v1/industrial/training/personnel/${encodeURIComponent(personnelId)}/history`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load training history");
    } finally {
      setBusy(false);
    }
  }, [personnelId]);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !data && !busy) {
      await load();
    }
  }

  async function openFullReport() {
    setPrintError(null);
    try {
      await trainingApi.openPersonnelTrainingReport(personnelId);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Could not open training report");
    }
  }

  async function openCompletionPrint(completionId: string) {
    setPrintError(null);
    try {
      await trainingApi.openPersonnelCompletionPrintable(personnelId, completionId);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Could not open quiz results");
    }
  }

  async function openRecordPrint(recordId: string) {
    setPrintError(null);
    try {
      await trainingApi.openPersonnelTrainingRecordPrintable(personnelId, recordId);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Could not open training record");
    }
  }

  async function printAttachment(recordId: string, documentId: string) {
    setUploadError(null);
    try {
      const res = await apiGet<{ downloadUrl: string }>(
        `/api/v1/industrial/training/records/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(documentId)}/download-url`,
      );
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Could not open attachment");
    }
  }

  async function deleteAttachment(recordId: string, documentId: string, fileName: string) {
    if (!canDeleteAttachments) return;
    if (!window.confirm(`Delete “${fileName}”? This removes the file from this training record.`)) {
      return;
    }
    setDeleteBusyId(documentId);
    setUploadError(null);
    try {
      await apiSend(
        `/api/v1/industrial/training/records/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(documentId)}`,
        "DELETE",
      );
      await load();
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Could not delete attachment");
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function uploadAttachment(recordId: string, file: File | null) {
    if (!file) return;
    setUploadBusyId(recordId);
    setUploadError(null);
    try {
      const cropped = await cropIfNeeded(file, {
        title: "Crop training attachment before upload",
      });
      if (!cropped) return;
      const prepared = await compressImageToUploadFile(cropped, {
        maxBytes: MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
      });
      if (prepared.size <= 0 || prepared.size > MAX_TRAINING_RECORD_ATTACHMENT_BYTES) {
        setUploadError(
          `File must be between 1 byte and ${Math.round(MAX_TRAINING_RECORD_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
        );
        return;
      }
      const mimeType = guessTrainingRecordAttachmentMime(prepared);
      const initRaw = await apiSend<UploadInit | { data?: UploadInit }>(
        `/api/v1/industrial/training/records/${encodeURIComponent(recordId)}/attachments/upload-url`,
        "POST",
        {
          filename: prepared.name,
          mimeType,
          contentLength: prepared.size,
        },
      );
      const init =
        initRaw &&
        typeof initRaw === "object" &&
        "documentId" in initRaw &&
        typeof (initRaw as UploadInit).documentId === "string"
          ? (initRaw as UploadInit)
          : initRaw &&
              typeof initRaw === "object" &&
              "data" in initRaw &&
              initRaw.data &&
              typeof initRaw.data === "object"
            ? (initRaw.data as UploadInit)
            : null;
      const documentId = String(init?.documentId ?? "").trim();
      const uploadUrl = String(init?.uploadUrl ?? "").trim();
      if (!documentId || !uploadUrl) {
        setUploadError(
          "Upload started but the server did not return a document id. Restart the API and try again.",
        );
        return;
      }
      await putPresignedTrainingRecordUpload(uploadUrl, prepared, init?.mimeType || mimeType);
      await apiSend(
        `/api/v1/industrial/training/records/${encodeURIComponent(recordId)}/attachments/complete`,
        "POST",
        { documentId },
      );
      await load();
    } catch (e) {
      setUploadError(
        e instanceof ApiError
          ? e.message
          : imageCompressErrorMessage(e, "Unable to upload that file."),
      );
    } finally {
      setUploadBusyId(null);
    }
  }

  async function cancelRecordForm() {
    setShowAddForm(false);
    setEditingRecordId(null);
    setManualForm(emptyManualForm());
    setPendingCertificate(null);
    setCreateError(null);
  }

  function startEditRecord(row: TrainingHistoryResponse["trainingRecords"][number]) {
    if (!canEditOrDeleteRecords || row.kind === "completion") return;
    setShowAddForm(false);
    setEditingRecordId(row.id);
    setCreateError(null);
    setPendingCertificate(null);
    setManualForm({
      title: row.title || row.courseName || "",
      completedAt:
        formatDate(row.completedAt) === "—" ? todayInputValue() : formatDate(row.completedAt),
      instructorName: row.instructorName ?? "",
      notes: row.notes ?? "",
      expiresAt: formatDate(row.expiresAt) === "—" ? "" : formatDate(row.expiresAt),
      result: String(row.result ?? "COMPLETED").toUpperCase() || "COMPLETED",
      scorePercent: row.scorePercent != null ? String(row.scorePercent) : "",
      attemptNumber: row.attemptNumber != null ? String(row.attemptNumber) : "",
    });
  }

  async function archiveTrainingRecord(row: TrainingHistoryResponse["trainingRecords"][number]) {
    if (!canEditOrDeleteRecords || row.kind === "completion") return;
    const label = row.title || row.courseName || "this training record";
    if (
      !window.confirm(`Delete “${label}”? This removes it from training history (soft delete).`)
    ) {
      return;
    }
    setArchiveBusyId(row.id);
    setUploadError(null);
    try {
      await trainingApi.archiveRecord(row.id);
      if (editingRecordId === row.id) await cancelRecordForm();
      await load();
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Could not delete training record");
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function saveManualRecord(event: FormEvent) {
    event.preventDefault();
    const isEdit = Boolean(editingRecordId);
    if (isEdit && !canEditOrDeleteRecords) return;
    if (!isEdit && !canManageRecords) return;
    const title = manualForm.title.trim();
    if (!title) {
      setCreateError("Course name is required.");
      return;
    }
    const result = manualForm.result.trim().toUpperCase() || "COMPLETED";
    const scoreText = manualForm.scorePercent.trim();
    const attemptText = manualForm.attemptNumber.trim();
    let scorePercent: number | null | undefined;
    let attemptNumber: number | null | undefined;
    if (scoreText) {
      const parsed = Number(scoreText);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setCreateError("Score must be a number between 0 and 100.");
        return;
      }
      scorePercent = Math.round(parsed);
    } else if (isEdit) {
      scorePercent = null;
    }
    if (attemptText) {
      const parsed = Number(attemptText);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
        setCreateError("Attempts must be a whole number of 1 or more.");
        return;
      }
      attemptNumber = parsed;
    } else if (isEdit) {
      attemptNumber = null;
    }
    setCreateBusy(true);
    setCreateError(null);
    setUploadError(null);
    try {
      const payload = {
        title,
        result,
        ...(scorePercent !== undefined ? { scorePercent } : {}),
        ...(attemptNumber !== undefined ? { attemptNumber } : {}),
        completedAt: manualForm.completedAt
          ? new Date(`${manualForm.completedAt}T12:00:00`).toISOString()
          : null,
        expiresAt: manualForm.expiresAt
          ? new Date(`${manualForm.expiresAt}T12:00:00`).toISOString()
          : null,
        instructorName: manualForm.instructorName.trim() || null,
        notes: manualForm.notes.trim() || null,
      };
      if (isEdit && editingRecordId) {
        const recordId = editingRecordId;
        await trainingApi.updateRecord(recordId, payload);
        const certificate = pendingCertificate;
        await cancelRecordForm();
        await load();
        if (certificate) {
          await uploadAttachment(recordId, certificate);
        }
      } else {
        const created = await trainingApi.createRecord({
          title,
          personnelId,
          result,
          ...(typeof scorePercent === "number" ? { scorePercent } : {}),
          ...(typeof attemptNumber === "number" ? { attemptNumber } : {}),
          ...(manualForm.completedAt
            ? { completedAt: new Date(`${manualForm.completedAt}T12:00:00`).toISOString() }
            : {}),
          ...(manualForm.expiresAt
            ? { expiresAt: new Date(`${manualForm.expiresAt}T12:00:00`).toISOString() }
            : {}),
          ...(manualForm.instructorName.trim()
            ? { instructorName: manualForm.instructorName.trim() }
            : {}),
          ...(manualForm.notes.trim() ? { notes: manualForm.notes.trim() } : {}),
        });
        const recordId = String(created?.id ?? "").trim();
        const certificate = pendingCertificate;
        await cancelRecordForm();
        await load();
        if (certificate && recordId) {
          await uploadAttachment(recordId, certificate);
        }
      }
    } catch (e) {
      setCreateError(
        e instanceof ApiError
          ? e.message
          : isEdit
            ? "Could not update training record"
            : "Could not add training record",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  const openCount = data?.openAssignments.length ?? 0;
  const recordCount = data?.trainingRecords?.length ?? 0;
  const recordNeedle = recordSearch.trim().toLowerCase();
  const filteredRecords = (data?.trainingRecords ?? []).filter((row) => {
    if (!recordNeedle) return true;
    return `${row.title} ${row.courseName ?? ""} ${row.result ?? ""}`
      .toLowerCase()
      .includes(recordNeedle);
  });
  const summary =
    data != null
      ? `${openCount} open · ${recordCount} record${recordCount === 1 ? "" : "s"}`
      : "Assignments and completed training";

  return (
    <>
      {cropModal}
      <section className="card mb-4">
        <button
          type="button"
          className="card-header d-flex justify-content-between align-items-center w-100 border-0 bg-transparent text-start"
          onClick={() => void toggleExpanded()}
          aria-expanded={expanded}
          aria-controls="personnel-training-history-content"
        >
          <span>
            <h5 className="card-title mb-0">Training history</h5>
            <small className="text-muted">{summary}</small>
          </span>
          <i className={`bx bx-chevron-${expanded ? "up" : "down"}`} aria-hidden="true" />
        </button>
        {expanded ? (
          <div className="card-body pt-0" id="personnel-training-history-content">
            <div className="d-flex gap-2 mb-3 flex-wrap">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={busy}
                onClick={() => void openFullReport()}
              >
                Full report
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh
              </button>
              {canManageRecords ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy || createBusy}
                  onClick={() => {
                    if (formOpen && formMode === "create") {
                      void cancelRecordForm();
                      return;
                    }
                    setEditingRecordId(null);
                    setManualForm(emptyManualForm());
                    setPendingCertificate(null);
                    setShowAddForm(true);
                    setCreateError(null);
                  }}
                >
                  {formOpen && formMode === "create" ? "Cancel" : "Add training record"}
                </button>
              ) : null}
            </div>
            {formOpen &&
            ((formMode === "create" && canManageRecords) ||
              (formMode === "edit" && canEditOrDeleteRecords)) ? (
              <form
                className="border rounded p-3 mb-3 bg-light"
                onSubmit={(e) => void saveManualRecord(e)}
              >
                <h6 className="mb-3">
                  {formMode === "edit" ? "Edit training record" : "Add training record"}
                </h6>
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="manual-training-title">
                      Course name
                    </label>
                    <input
                      id="manual-training-title"
                      className="form-control form-control-sm"
                      value={manualForm.title}
                      onChange={(e) => setManualForm((f) => ({ ...f, title: e.target.value }))}
                      required
                      disabled={createBusy}
                      placeholder="Same format as imported training records"
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="manual-training-completed">
                      Completed
                    </label>
                    <input
                      id="manual-training-completed"
                      type="date"
                      className="form-control form-control-sm"
                      value={manualForm.completedAt}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, completedAt: e.target.value }))
                      }
                      required
                      disabled={createBusy}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="manual-training-expires">
                      Expires (optional)
                    </label>
                    <input
                      id="manual-training-expires"
                      type="date"
                      className="form-control form-control-sm"
                      value={manualForm.expiresAt}
                      onChange={(e) => setManualForm((f) => ({ ...f, expiresAt: e.target.value }))}
                      disabled={createBusy}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="manual-training-result">
                      Result
                    </label>
                    <select
                      id="manual-training-result"
                      className="form-select form-select-sm"
                      value={manualForm.result}
                      onChange={(e) => setManualForm((f) => ({ ...f, result: e.target.value }))}
                      disabled={createBusy}
                    >
                      <option value="COMPLETED">Completed</option>
                      <option value="PASSED">Passed</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="manual-training-score">
                      Score (%)
                    </label>
                    <input
                      id="manual-training-score"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="form-control form-control-sm"
                      value={manualForm.scorePercent}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, scorePercent: e.target.value }))
                      }
                      disabled={createBusy}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="manual-training-attempts">
                      Attempts
                    </label>
                    <input
                      id="manual-training-attempts"
                      type="number"
                      min={1}
                      step={1}
                      className="form-control form-control-sm"
                      value={manualForm.attemptNumber}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, attemptNumber: e.target.value }))
                      }
                      disabled={createBusy}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="manual-training-instructor">
                      Instructor (optional)
                    </label>
                    <input
                      id="manual-training-instructor"
                      className="form-control form-control-sm"
                      value={manualForm.instructorName}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, instructorName: e.target.value }))
                      }
                      disabled={createBusy}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="manual-training-certificate">
                      Certificate / attachment (optional)
                    </label>
                    <input
                      id="manual-training-certificate"
                      type="file"
                      className="form-control form-control-sm"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/*"
                      disabled={createBusy}
                      onChange={(e) => {
                        setPendingCertificate(e.target.files?.[0] ?? null);
                      }}
                    />
                    {pendingCertificate ? (
                      <div className="small text-muted mt-1">{pendingCertificate.name}</div>
                    ) : null}
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="manual-training-notes">
                      Notes (optional)
                    </label>
                    <textarea
                      id="manual-training-notes"
                      className="form-control form-control-sm"
                      rows={2}
                      value={manualForm.notes}
                      onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                      disabled={createBusy}
                    />
                  </div>
                </div>
                {createError ? (
                  <div className="alert alert-warning mt-3 mb-0">{createError}</div>
                ) : null}
                <div className="mt-3 d-flex gap-2 flex-wrap">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={createBusy}>
                    {createBusy
                      ? "Saving…"
                      : formMode === "edit"
                        ? "Save changes"
                        : "Save training record"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={createBusy}
                    onClick={() => void cancelRecordForm()}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
            {error ? <div className="alert alert-warning mb-3">{error}</div> : null}
            {printError ? <div className="alert alert-warning mb-3">{printError}</div> : null}
            {uploadError ? <div className="alert alert-warning mb-3">{uploadError}</div> : null}
            {busy && !data ? <p className="text-muted mb-0">Loading training history…</p> : null}
            {data ? (
              <>
                <h6 className="mb-2">Open assignments</h6>
                <ul className="list-group list-group-flush mb-4">
                  {data.openAssignments.map((row, index) => (
                    <li
                      key={`${row.assignment.title}-${index}`}
                      className="list-group-item d-flex justify-content-between align-items-start gap-2 px-0"
                    >
                      <div>
                        <strong>{row.assignment.title}</strong>
                        <div className="small text-muted">{row.sourceTitle}</div>
                      </div>
                      <span className={`badge ${statusClass(row.assignee.status)}`}>
                        {row.assignee.status.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                  {!data.openAssignments.length ? (
                    <li className="list-group-item text-muted px-0">No open assignments.</li>
                  ) : null}
                </ul>
                <h6 className="mb-2">Training records</h6>
                <div className="mb-2">
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Filter this person’s records by course or result"
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                  />
                </div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Result</th>
                        <th>Score</th>
                        <th>Attempts</th>
                        <th>Date</th>
                        <th>Attachment</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((row) => {
                        const attachments = row.attachments ?? [];
                        const canUpload =
                          Boolean(row.canUploadAttachment) && attachments.length === 0;
                        const uploading = uploadBusyId === row.id;
                        const primaryAttachment = attachments[attachments.length - 1] ?? null;
                        const isLegacyRecord = row.kind === "record" || !row.printCompletionId;
                        return (
                          <tr key={row.id}>
                            <td>
                              {row.title}
                              {row.courseName && row.courseName !== row.title ? (
                                <div className="small text-muted">{row.courseName}</div>
                              ) : null}
                            </td>
                            <td>{row.result ?? "—"}</td>
                            <td>{row.scorePercent != null ? `${row.scorePercent}%` : "—"}</td>
                            <td>{row.attemptNumber != null ? `#${row.attemptNumber}` : "—"}</td>
                            <td>{formatDate(row.completedAt)}</td>
                            <td>
                              {attachments.length ? (
                                <ul className="list-unstyled mb-0 small">
                                  {attachments.map((file) => {
                                    const deleting = deleteBusyId === file.documentId;
                                    return (
                                      <li
                                        key={file.documentId}
                                        className="d-flex align-items-center gap-2 flex-wrap"
                                      >
                                        <span>{file.fileName}</span>
                                        {canDeleteAttachments ? (
                                          <button
                                            type="button"
                                            className="btn btn-link btn-sm text-danger p-0 align-baseline"
                                            disabled={deleting || busy || uploading}
                                            onClick={() =>
                                              void deleteAttachment(
                                                row.id,
                                                file.documentId,
                                                file.fileName,
                                              )
                                            }
                                          >
                                            {deleting ? "Deleting…" : "Delete"}
                                          </button>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <span className="text-muted small">None</span>
                              )}
                            </td>
                            <td className="text-end">
                              <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                                {row.printCompletionId ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => void openCompletionPrint(row.printCompletionId!)}
                                  >
                                    Print
                                  </button>
                                ) : null}
                                {!row.printCompletionId && primaryAttachment ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() =>
                                      void printAttachment(row.id, primaryAttachment.documentId)
                                    }
                                  >
                                    Print
                                  </button>
                                ) : null}
                                {!row.printCompletionId && !primaryAttachment && isLegacyRecord ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => void openRecordPrint(row.id)}
                                  >
                                    Print
                                  </button>
                                ) : null}
                                {canUpload ? (
                                  <label
                                    className={`btn btn-sm btn-outline-primary mb-0 ${uploading ? "disabled" : ""}`}
                                  >
                                    {uploading ? "Uploading…" : "Upload"}
                                    <input
                                      type="file"
                                      className="d-none"
                                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/*"
                                      disabled={uploading || busy}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        e.target.value = "";
                                        void uploadAttachment(row.id, file);
                                      }}
                                    />
                                  </label>
                                ) : null}
                                {canEditOrDeleteRecords && row.kind !== "completion" ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      disabled={busy || createBusy || archiveBusyId === row.id}
                                      onClick={() => startEditRecord(row)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={busy || createBusy || archiveBusyId === row.id}
                                      onClick={() => void archiveTrainingRecord(row)}
                                    >
                                      {archiveBusyId === row.id ? "Deleting…" : "Delete"}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!filteredRecords.length ? (
                        <tr>
                          <td colSpan={7} className="text-muted">
                            {recordNeedle
                              ? "No training records match that filter."
                              : "No training records yet."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
