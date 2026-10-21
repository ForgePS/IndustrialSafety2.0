"use client";

import { useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ForgePhotoMarkupEditor } from "@forge/photo-markup";
import {
  compressImageToUploadFile,
  imageCompressErrorMessage,
} from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";
import {
  guessIncidentAttachmentMime,
  MAX_INCIDENT_ATTACHMENT_BYTES,
  parseIncidentAttachments,
  putPresignedIncidentUpload,
  type IncidentAttachment,
} from "@/lib/incident-attachments";

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  mimeType?: string;
};

type Props = {
  incidentId: string;
  attachments: IncidentAttachment[];
  canManage?: boolean;
  disabled?: boolean;
  onChange: (attachments: IncidentAttachment[]) => void;
};

function unwrapUploadInit(raw: unknown): UploadInit | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.documentId === "string" && typeof row.uploadUrl === "string") {
    return {
      documentId: row.documentId,
      uploadUrl: row.uploadUrl,
      ...(typeof row.mimeType === "string" ? { mimeType: row.mimeType } : {}),
    };
  }
  if (row.data && typeof row.data === "object") {
    return unwrapUploadInit(row.data);
  }
  return null;
}

function attachmentsFromComplete(raw: unknown): IncidentAttachment[] | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (Array.isArray(row.attachments)) {
    return parseIncidentAttachments(row.attachments);
  }
  if (row.data && typeof row.data === "object") {
    return attachmentsFromComplete(row.data);
  }
  return null;
}

function isImageAttachment(file: IncidentAttachment): boolean {
  const mime = (file.contentType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.fileName);
}

/** Upload / download / delete documents on an incident report. */
export function IncidentAttachmentsPanel({
  incidentId,
  attachments,
  canManage = false,
  disabled = false,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markupTarget, setMarkupTarget] = useState<{
    documentId: string;
    fileName: string;
    imageSrc: string;
  } | null>(null);
  const { cropIfNeeded, cropModal } = useImageCrop();

  async function openAttachment(documentId: string) {
    setError(null);
    try {
      const res = await apiGet<{ downloadUrl: string }>(
        `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}/attachments/${encodeURIComponent(documentId)}/download-url`,
      );
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open attachment");
    }
  }

  async function startMarkup(file: IncidentAttachment) {
    if (!canManage || !isImageAttachment(file)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiGet<{ downloadUrl: string }>(
        `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}/attachments/${encodeURIComponent(file.documentId)}/download-url`,
      );
      setMarkupTarget({
        documentId: file.documentId,
        fileName: file.fileName,
        imageSrc: res.downloadUrl,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open photo for markup");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBlobAsAttachment(blob: Blob, fileName: string) {
    const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
    const prepared = await compressImageToUploadFile(file, {
      maxBytes: MAX_INCIDENT_ATTACHMENT_BYTES,
    });
    const mimeType = guessIncidentAttachmentMime(prepared);
    const initRaw = await apiSend<unknown>(
      `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}/attachments/upload-url`,
      "POST",
      {
        filename: prepared.name,
        mimeType,
        contentLength: prepared.size,
      },
    );
    const init = unwrapUploadInit(initRaw);
    const documentId = String(init?.documentId ?? "").trim();
    const uploadUrl = String(init?.uploadUrl ?? "").trim();
    if (!documentId || !uploadUrl) {
      throw new Error("Upload started but the server did not return a document id.");
    }
    await putPresignedIncidentUpload(uploadUrl, prepared, init?.mimeType || mimeType);
    const completeRaw = await apiSend<unknown>(
      `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}/attachments/complete`,
      "POST",
      { documentId },
    );
    const next = attachmentsFromComplete(completeRaw);
    onChange(
      next ?? [
        ...attachments.filter((row) => row.documentId !== documentId),
        {
          documentId,
          fileName: prepared.name,
          contentType: init?.mimeType || mimeType,
          uploadedAt: new Date().toISOString(),
        },
      ],
    );
  }

  async function deleteAttachment(documentId: string, fileName: string) {
    if (!canManage) return;
    if (!window.confirm(`Delete “${fileName}”? This removes the file from this incident.`)) {
      return;
    }
    setDeletingId(documentId);
    setError(null);
    try {
      const res = await apiSend<unknown>(
        `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}/attachments/${encodeURIComponent(documentId)}`,
        "DELETE",
      );
      const next = attachmentsFromComplete(res);
      onChange(next ?? attachments.filter((row) => row.documentId !== documentId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete attachment");
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadAttachment(file: File | null) {
    if (!file || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropIfNeeded(file, {
        title: "Crop attachment photo before upload",
      });
      if (!cropped) return;
      const prepared = await compressImageToUploadFile(cropped, {
        maxBytes: MAX_INCIDENT_ATTACHMENT_BYTES,
      });
      if (prepared.size <= 0 || prepared.size > MAX_INCIDENT_ATTACHMENT_BYTES) {
        setError(
          `File must be between 1 byte and ${Math.round(MAX_INCIDENT_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
        );
        return;
      }
      await uploadBlobAsAttachment(prepared, prepared.name);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : imageCompressErrorMessage(e, "Unable to upload that file."),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const locked = disabled || busy || deletingId != null;

  return (
    <>
      {cropModal}
      {markupTarget ? (
        <ForgePhotoMarkupEditor
          imageSrc={markupTarget.imageSrc}
          title={`Markup — ${markupTarget.fileName}`}
          mode="full"
          module="incidents"
          recordId={incidentId}
          onCancel={() => setMarkupTarget(null)}
          onSave={async ({ renderedBlob }) => {
            if (!renderedBlob) {
              setError("Markup saved locally but rendered image was unavailable.");
              setMarkupTarget(null);
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const markedName = markupTarget.fileName.replace(
                /(\.[^.]+)?$/,
                "-marked.jpg",
              );
              await uploadBlobAsAttachment(renderedBlob, markedName);
              setMarkupTarget(null);
            } catch (e) {
              setError(
                e instanceof ApiError
                  ? e.message
                  : imageCompressErrorMessage(e, "Could not save marked-up photo."),
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      <div className="incidents-report__attachments mt-3 pt-3 border-top">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h6 className="text-muted text-uppercase small mb-0">Documents</h6>
          {canManage ? (
            <label className={`btn btn-sm btn-outline-primary mb-0 ${locked ? "disabled" : ""}`}>
              {busy ? "Uploading…" : "Attach file"}
              <input
                ref={inputRef}
                type="file"
                className="d-none"
                disabled={locked}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt,image/*,application/pdf"
                onChange={(ev) => {
                  const file = ev.target.files?.[0] ?? null;
                  void uploadAttachment(file);
                }}
              />
            </label>
          ) : null}
        </div>

        {error ? <div className="alert alert-warning py-2 small mb-2">{error}</div> : null}

        {attachments.length === 0 ? (
          <p className="text-muted small mb-0">
            {canManage
              ? "No documents attached yet. Upload photos, PDFs, or forms related to this incident."
              : "No documents attached."}
          </p>
        ) : (
          <ul className="list-unstyled mb-0">
            {attachments.map((file) => {
              const deleting = deletingId === file.documentId;
              return (
                <li
                  key={file.documentId}
                  className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 border-bottom border-light"
                >
                  <div className="min-w-0">
                    <div className="text-break fw-medium">{file.fileName}</div>
                    {file.uploadedAt ? (
                      <small className="text-muted">
                        Uploaded {new Date(file.uploadedAt).toLocaleString()}
                      </small>
                    ) : null}
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={locked}
                      onClick={() => void openAttachment(file.documentId)}
                    >
                      Open
                    </button>
                    {canManage && isImageAttachment(file) ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={locked}
                        onClick={() => void startMarkup(file)}
                      >
                        Markup
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={locked}
                        onClick={() => void deleteAttachment(file.documentId, file.fileName)}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
