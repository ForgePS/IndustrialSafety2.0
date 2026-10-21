"use client";

import { useRef, useState } from "react";
import { ApiError, apiSend } from "@forge/web-kit";
import {
  guessPersonnelCertMime,
  MAX_PERSONNEL_CERT_BYTES,
  putPresignedCertUpload,
  type PersonnelCertKind,
} from "@/lib/personnel-cert-upload";
import {
  compressImageToUploadFile,
  imageCompressErrorMessage,
} from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  originalFilename: string;
  mimeType: string;
};

type Props = {
  id: string;
  label: string;
  kind: PersonnelCertKind;
  documentId: string;
  filename: string;
  help?: string;
  disabled?: boolean;
  onChange: (next: { documentId: string; filename: string }) => void;
};

/**
 * Binary file picker for First Aid / CPR certification copies.
 * Uploads via presigned S3 PUT — does not embed JSON/data-URLs in the form.
 * The document id is written to the personnel row when the form is saved.
 */
export function PersonnelCertUploadField({
  id,
  label,
  kind,
  documentId,
  filename,
  help,
  disabled,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { cropIfNeeded, cropModal } = useImageCrop();

  async function onFile(file: File | null) {
    if (!file || disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropIfNeeded(file, {
        title: `Crop ${label.toLowerCase()} before upload`,
      });
      if (!cropped) return;
      const prepared = await compressImageToUploadFile(cropped, {
        maxBytes: MAX_PERSONNEL_CERT_BYTES,
      });
      if (prepared.size <= 0 || prepared.size > MAX_PERSONNEL_CERT_BYTES) {
        setError(`File must be between 1 byte and ${Math.round(MAX_PERSONNEL_CERT_BYTES / (1024 * 1024))} MB.`);
        return;
      }
      const mimeType = guessPersonnelCertMime(prepared);
      const init = await apiSend<UploadInit>(
        "/api/v1/industrial/personnel/certifications/upload-url",
        "POST",
        {
          kind,
          filename: prepared.name,
          mimeType,
          contentLength: prepared.size,
        },
      );
      await putPresignedCertUpload(init.uploadUrl, prepared, init.mimeType || mimeType);
      await apiSend("/api/v1/industrial/personnel/certifications/complete", "POST", {
        kind,
        documentId: init.documentId,
      });
      onChange({
        documentId: init.documentId,
        filename: init.originalFilename || prepared.name,
      });
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

  return (
    <div>
      {cropModal}
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {documentId ? (
        <div className="border rounded p-2 bg-white mb-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="small">
            <i className="bx bx-file me-1" aria-hidden="true" />
            <span className="fw-medium">{filename || "Certification copy on file"}</span>
          </div>
          {!disabled ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              disabled={busy}
              onClick={() => onChange({ documentId: "", filename: "" })}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted small mb-2">No copy uploaded yet.</p>
      )}
      {!disabled ? (
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : documentId ? "Replace file" : "Upload copy"}
          </button>
        </div>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="d-none"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
        disabled={disabled || busy}
        onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
      />
      {error ? <div className="text-danger small mt-1">{error}</div> : null}
      {help ? <div className="form-text">{help}</div> : null}
    </div>
  );
}
