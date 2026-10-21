"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  compressImageToUploadFile,
  imageCompressErrorMessage,
} from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";
import {
  guessPersonnelLicenseMime,
  isLicenseDocumentId,
  isLicensePdfCopy,
  MAX_PERSONNEL_LICENSE_BYTES,
  putPresignedLicenseUpload,
  type PersonnelLicenseSide,
} from "@/lib/personnel-license-upload";

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  originalFilename?: string;
  mimeType?: string;
};

type Props = {
  id: string;
  label: string;
  side: PersonnelLicenseSide;
  /** Legacy https/data URL, or a forge document UUID after S3 upload. */
  value: string;
  personnelId?: string;
  help?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
};

/**
 * Front/back driver's license capture for the personnel form.
 * Uploads via presigned S3 (12 MB) like DQF — does not embed data URLs.
 */
export function LicenseImageField({
  id,
  label,
  side,
  value,
  personnelId,
  help,
  disabled,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const { cropIfNeeded, cropModal } = useImageCrop();

  useEffect(() => {
    let cancelled = false;
    const trimmed = value.trim();
    if (!trimmed) {
      setPreviewUrl(null);
      setPreviewMime(null);
      setPreviewName(null);
      return;
    }
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("data:application/pdf")) {
      setPreviewUrl(trimmed);
      setPreviewMime(trimmed.startsWith("data:application/pdf") ? "application/pdf" : "image/*");
      setPreviewName(null);
      return;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      setPreviewUrl(trimmed);
      setPreviewMime(isLicensePdfCopy({ src: trimmed }) ? "application/pdf" : null);
      setPreviewName(null);
      return;
    }
    if (!isLicenseDocumentId(trimmed)) {
      setPreviewUrl(null);
      setPreviewMime(null);
      setPreviewName(null);
      return;
    }
    void (async () => {
      try {
        const data = await apiGet<{
          downloadUrl?: string;
          mimeType?: string;
          originalFilename?: string;
        }>(
          `/api/v1/industrial/personnel/license/${encodeURIComponent(trimmed)}/download-url`,
        );
        if (!cancelled && data.downloadUrl) {
          setPreviewUrl(data.downloadUrl);
          setPreviewMime(data.mimeType?.trim() || null);
          setPreviewName(data.originalFilename?.trim() || null);
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null);
          setPreviewMime(null);
          setPreviewName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  async function onFile(file: File | null) {
    if (!file || disabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropIfNeeded(file, {
        initialAspect: "license",
        title: `Crop ${label.toLowerCase()} before upload`,
      });
      if (!cropped) return;
      const prepared = await compressImageToUploadFile(cropped, {
        maxBytes: MAX_PERSONNEL_LICENSE_BYTES,
      });
      if (prepared.size <= 0 || prepared.size > MAX_PERSONNEL_LICENSE_BYTES) {
        setError(
          `File must be between 1 byte and ${Math.round(MAX_PERSONNEL_LICENSE_BYTES / (1024 * 1024))} MB.`,
        );
        return;
      }
      const mimeType = guessPersonnelLicenseMime(prepared);
      const init = await apiSend<UploadInit>(
        "/api/v1/industrial/personnel/license/upload-url",
        "POST",
        {
          side,
          ...(personnelId ? { personnelId } : {}),
          filename: prepared.name,
          mimeType,
          contentLength: prepared.size,
        },
      );
      await putPresignedLicenseUpload(init.uploadUrl, prepared, init.mimeType || mimeType);
      await apiSend("/api/v1/industrial/personnel/license/complete", "POST", {
        side,
        documentId: init.documentId,
        ...(personnelId ? { personnelId } : {}),
      });
      // Local preview while the download URL resolves.
      const localPreview = URL.createObjectURL(prepared);
      setPreviewUrl(localPreview);
      setPreviewMime(init.mimeType || mimeType);
      setPreviewName(prepared.name);
      onChange(init.documentId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : imageCompressErrorMessage(err, "Unable to upload that license photo."),
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
      {previewUrl ? (
        <div className="mb-2">
          {isLicensePdfCopy({
            mimeType: previewMime,
            fileName: previewName,
            src: previewUrl,
          }) ? (
            <div className="border rounded p-3 bg-label-secondary">
              <div className="d-flex align-items-start gap-2">
                <i className="bx bxs-file-pdf fs-2 text-danger flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="mb-1 fw-medium text-break">
                    {previewName || `${label} (PDF)`}
                  </p>
                  <p className="text-muted small mb-2">
                    PDF copies open in a new tab (embedded preview is blocked by the browser).
                  </p>
                  <a
                    className="btn btn-sm btn-primary"
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View PDF
                  </a>
                </div>
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={label}
              className="img-fluid border rounded bg-white"
              style={{ maxHeight: 220 }}
            />
          )}
        </div>
      ) : (
        <p className="text-muted small mb-2">No copy on file yet.</p>
      )}
      <div className="d-flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/*,application/pdf,.heic,.heif"
          className="form-control"
          style={{ maxWidth: 320 }}
          disabled={disabled || busy}
          onChange={(ev) => void onFile(ev.target.files?.[0] ?? null)}
        />
        {value ? (
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={disabled || busy}
            onClick={() => {
              setPreviewUrl(null);
              onChange("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {busy ? (
        <div className="form-text" role="status">
          Uploading…
        </div>
      ) : null}
      {error ? <div className="text-danger small mt-1">{error}</div> : null}
      {help ? (
        <div className="form-text">{help}</div>
      ) : (
        <div className="form-text">Photos open a crop tool before upload so only the license is saved.</div>
      )}
    </div>
  );
}
