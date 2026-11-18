"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  dotFilePreviewSrc,
  dotFileStatusLabel,
  guessDotDqfMime,
  isImageDotFile,
  isOpenableDotFile,
  MAX_DOT_DQF_DOCUMENT_BYTES,
  parseDotFileValues,
  putPresignedDotDqfUpload,
  serializeDotFileValues,
  type DotFormFileValue,
} from "@/lib/dot-dqf-files";
import type { DotDqfFieldDef } from "@/lib/dot-dqf-fields";
import { compressImageToUploadFile, imageCompressErrorMessage } from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";

function uploadPrimaryLabel(field: DotDqfFieldDef, hasFiles: boolean): string {
  if (hasFiles) return "Upload";
  if (field.id === "medicalCertCopy") return "Upload MEC";
  if (field.id === "diabeticEyeExamCopy") return "Upload Eye Exam";
  if (field.id === "driversApplicationCopy") return "Upload Application";
  if (field.id === "driversLicenseCopy") return "Upload License Photo";
  if (field.id === "mvrReleaseFormCopy") return "Upload paper consent";
  if (field.id.endsWith("Copy")) return "Upload";
  return "Upload";
}

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  originalFilename: string;
  mimeType: string;
};

type Props = {
  field: DotDqfFieldDef;
  value: string;
  recordId?: string | undefined;
  disabled?: boolean | undefined;
  onChange: (value: string) => void;
};

function DotDqfFilePreview({
  file,
  onOpenError,
}: {
  file: DotFormFileValue;
  onOpenError: (message: string) => void;
}) {
  const inlineSrc = dotFilePreviewSrc(file);
  const [remoteSrc, setRemoteSrc] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [wantThumb, setWantThumb] = useState(false);
  const isImage = isImageDotFile(file);
  const openable = isOpenableDotFile(file);

  // Thumbnails are opt-in — auto-fetching every image on open made driver pages
  // wait on N× (API + S3 HeadObject + image download).
  useEffect(() => {
    let cancelled = false;
    const documentId = file.documentId?.trim();
    if (!wantThumb || inlineSrc || !isImage || !documentId) {
      if (!wantThumb) setRemoteSrc(null);
      return;
    }
    setLoadingPreview(true);
    void (async () => {
      try {
        const data = await apiGet<{ downloadUrl: string }>(
          `/api/v1/industrial/dot/documents/${encodeURIComponent(documentId)}/download-url`,
        );
        if (!cancelled) setRemoteSrc(data.downloadUrl?.trim() || null);
      } catch {
        if (!cancelled) setRemoteSrc(null);
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.documentId, file.name, inlineSrc, isImage, wantThumb]);

  if (!openable) {
    return (
      <div className="text-warning small mt-2 mb-0">
        This copy is missing from storage. Upload a new PDF or photo.
      </div>
    );
  }

  const src = inlineSrc || remoteSrc;
  if (src && isImage) {
    return (
      <img
        src={src}
        alt={file.name}
        className="img-fluid border rounded mt-2"
        style={{ maxHeight: 180 }}
      />
    );
  }

  async function resolveDownloadUrl(): Promise<string | null> {
    const preview = dotFilePreviewSrc(file);
    if (preview) return preview;
    if (remoteSrc) return remoteSrc;
    const documentId = file.documentId?.trim();
    if (!documentId) return null;
    const data = await apiGet<{ downloadUrl: string }>(
      `/api/v1/industrial/dot/documents/${encodeURIComponent(documentId)}/download-url`,
    );
    return data.downloadUrl?.trim() || null;
  }

  return (
    <div className="d-flex flex-wrap gap-3 mt-2">
      <button
        type="button"
        className="btn btn-link btn-sm px-0"
        disabled={loadingPreview}
        onClick={() => {
          void (async () => {
            onOpenError("");
            try {
              const url = await resolveDownloadUrl();
              if (!url) {
                onOpenError("This file is no longer available for preview. Re-upload a copy.");
                return;
              }
              window.open(url, "_blank", "noopener,noreferrer");
            } catch (e) {
              onOpenError(
                e instanceof ApiError
                  ? e.message
                  : e instanceof Error
                    ? e.message
                    : "Unable to open that file.",
              );
            }
          })();
        }}
      >
        Open file
      </button>
      {isImage && !inlineSrc ? (
        <button
          type="button"
          className="btn btn-link btn-sm px-0"
          disabled={loadingPreview}
          onClick={() => setWantThumb(true)}
        >
          {loadingPreview ? "Loading preview…" : "Show thumbnail"}
        </button>
      ) : null}
    </div>
  );
}

export function DotDqfUploadField({ field, value, recordId, disabled, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { cropIfNeeded, cropModal } = useImageCrop();
  const files = parseDotFileValues(value);
  const openableCount = files.filter(isOpenableDotFile).length;
  const uploadLabel = uploadPrimaryLabel(field, openableCount > 0);

  async function uploadOne(file: File): Promise<DotFormFileValue | null> {
    const licenseLike =
      field.id === "driversLicenseCopy" ||
      /license/i.test(field.id) ||
      /license/i.test(field.label ?? "");
    const cropped = await cropIfNeeded(file, {
      initialAspect: licenseLike ? "license" : "free",
      title: `Crop ${field.label || "document"} before upload`,
    });
    if (!cropped) return null;
    const prepared = await compressImageToUploadFile(cropped, {
      maxBytes: MAX_DOT_DQF_DOCUMENT_BYTES,
    });
    if (prepared.size <= 0 || prepared.size > MAX_DOT_DQF_DOCUMENT_BYTES) {
      throw new Error(
        `${file.name} must be between 1 byte and ${Math.round(MAX_DOT_DQF_DOCUMENT_BYTES / (1024 * 1024))} MB.`,
      );
    }
    const mimeType = guessDotDqfMime(prepared);
    const init = await apiSend<UploadInit>("/api/v1/industrial/dot/documents/upload-url", "POST", {
      fieldId: field.id,
      ...(recordId ? { recordId } : {}),
      filename: prepared.name,
      mimeType,
      contentLength: prepared.size,
    });
    await putPresignedDotDqfUpload(init.uploadUrl, prepared, init.mimeType || mimeType);
    await apiSend("/api/v1/industrial/dot/documents/complete", "POST", {
      documentId: init.documentId,
      fieldId: field.id,
      ...(recordId ? { recordId } : {}),
    });
    return {
      name: init.originalFilename || prepared.name,
      documentId: init.documentId,
      contentType: init.mimeType || mimeType,
      fileSizeBytes: prepared.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async function addFiles(selected: FileList | null) {
    if (!selected?.length || disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Replace dead stubs when uploading a real copy.
      const next: DotFormFileValue[] = files.filter(isOpenableDotFile);
      for (const file of Array.from(selected)) {
        const uploaded = await uploadOne(file);
        if (uploaded) next.push(uploaded);
      }
      onChange(serializeDotFileValues(next));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : imageCompressErrorMessage(e, "Unable to upload that file."),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      if (moreRef.current) moreRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(serializeDotFileValues(next));
  }

  return (
    <div>
      {cropModal}
      {files.length === 0 ? (
        <p className="text-muted small mb-2">{dotFileStatusLabel(value)}</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-2">
          {files.map((file, index) => {
            const openable = isOpenableDotFile(file);
            return (
              <div
                className={`border rounded p-2 bg-label-secondary${openable ? "" : " border-warning"}`}
                key={`${file.documentId || file.name}-${index}`}
              >
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div className="small fw-medium text-body text-break">{file.name}</div>
                  {!disabled ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeAt(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <DotDqfFilePreview
                  file={file}
                  onOpenError={(message) => setError(message || null)}
                />
              </div>
            );
          })}
        </div>
      )}
      {!disabled ? (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : uploadLabel}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            Take photo
          </button>
          <div className="dropdown">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary dropdown-toggle"
              disabled={busy}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              More upload options
            </button>
            {menuOpen ? (
              <div className="dropdown-menu show">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    inputRef.current?.click();
                  }}
                >
                  Choose file (PDF or image)
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    cameraRef.current?.click();
                  }}
                >
                  Take photo
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    moreRef.current?.click();
                  }}
                >
                  Choose from device
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button type="button" className="btn btn-sm btn-primary" disabled>
            {uploadLabel}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled>
            Take photo
          </button>
          <span className="text-muted small">Uploads are unavailable in this view.</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className="d-none"
        accept={field.accept ?? "image/*,application/pdf"}
        multiple
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        className="d-none"
        accept="image/*"
        capture="environment"
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        ref={moreRef}
        type="file"
        className="d-none"
        accept={field.accept ?? "image/*,application/pdf"}
        multiple
        onChange={(event) => void addFiles(event.target.files)}
      />
      {error ? <div className="text-danger small mt-1">{error}</div> : null}
      {field.description ? <div className="form-text">{field.description}</div> : null}
    </div>
  );
}
