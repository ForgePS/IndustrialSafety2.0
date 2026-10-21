"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@forge/web-kit";
import type { LicenseCopies } from "@/lib/license-copies";
import {
  isLicenseDocumentId,
  isLicensePdfCopy,
  licenseDocumentIdFromUpload,
  licenseFileNameFromUpload,
  licenseMimeFromUpload,
} from "@/lib/personnel-license-upload";

type Props = {
  copies: LicenseCopies;
  record?: Record<string, unknown> | null;
  personName: string;
  /** When true, show a missing-copy notice (company / DQF drivers). */
  required?: boolean;
};

type PreviewState = {
  url: string | null;
  mimeType: string | null;
  fileName: string | null;
  error: string | null;
  loading: boolean;
};

function useLicensePreview(
  directSrc: string | null,
  documentId: string | null,
  hintMime: string | null,
  hintName: string | null,
): PreviewState {
  const [url, setUrl] = useState<string | null>(directSrc);
  const [mimeType, setMimeType] = useState<string | null>(hintMime);
  const [fileName, setFileName] = useState<string | null>(hintName);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMimeType(hintMime);
    setFileName(hintName);
    if (directSrc) {
      setUrl(directSrc);
      setError(null);
      setLoading(false);
      return;
    }
    if (!documentId || !isLicenseDocumentId(documentId)) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await apiGet<{
          downloadUrl?: string;
          mimeType?: string;
          originalFilename?: string;
        }>(
          `/api/v1/industrial/personnel/license/${encodeURIComponent(documentId)}/download-url`,
        );
        if (cancelled) return;
        if (data.downloadUrl) {
          setUrl(data.downloadUrl);
          setMimeType(data.mimeType?.trim() || hintMime);
          setFileName(data.originalFilename?.trim() || hintName);
          setError(null);
        } else {
          setUrl(null);
          setError("Could not load this license copy.");
        }
      } catch {
        if (!cancelled) {
          setUrl(null);
          setError("Could not load this license copy.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directSrc, documentId, hintMime, hintName]);

  return { url, mimeType, fileName, error, loading };
}

function LicenseSidePreview({
  label,
  personName,
  preview,
}: {
  label: string;
  personName: string;
  preview: PreviewState;
}) {
  const isPdf = isLicensePdfCopy({
    mimeType: preview.mimeType,
    fileName: preview.fileName,
    src: preview.url,
  });

  return (
    <div className="col-md-6">
      <p className="text-muted small text-uppercase mb-2">{label}</p>
      {preview.url ? (
        isPdf ? (
          <div className="border rounded p-3 bg-label-secondary">
            <div className="d-flex align-items-start gap-2">
              <i className="bx bxs-file-pdf fs-2 text-danger flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="mb-1 fw-medium text-break">
                  {preview.fileName || `DRIVER'S license ${label.toLowerCase()} (PDF)`}
                </p>
                <p className="text-muted small mb-2">
                  PDF copies open in a new tab (embedded preview is blocked by the browser).
                </p>
                <a
                  className="btn btn-sm btn-primary"
                  href={preview.url}
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
            src={preview.url}
            alt={`DRIVER'S license ${label.toLowerCase()} for ${personName}`}
            className="img-fluid border rounded bg-white"
          />
        )
      ) : preview.loading ? (
        <p className="text-muted mb-0">Loading {label.toLowerCase()} copy…</p>
      ) : preview.error ? (
        <p className="text-danger small mb-0">{preview.error}</p>
      ) : (
        <p className="text-warning mb-0">{label} copy missing</p>
      )}
    </div>
  );
}

/**
 * Front and back driver's license copies for the personnel / DOT file.
 * Supports both image and PDF uploads (PDF cannot render in an <img>).
 */
export function LicenseCopiesCard({ copies, record, personName, required }: Props) {
  const frontDoc =
    licenseDocumentIdFromUpload(record?.licenseFrontUpload) ??
    licenseDocumentIdFromUpload(record?.driversLicenseCopy) ??
    (copies.front && isLicenseDocumentId(copies.front) ? copies.front : null);
  const backDoc =
    licenseDocumentIdFromUpload(record?.licenseBackUpload) ??
    licenseDocumentIdFromUpload(record?.driversLicenseBack) ??
    (copies.back && isLicenseDocumentId(copies.back) ? copies.back : null);

  const frontDirect =
    copies.front && !isLicenseDocumentId(copies.front) ? copies.front : null;
  const backDirect =
    copies.back && !isLicenseDocumentId(copies.back) ? copies.back : null;

  const frontPreview = useLicensePreview(
    frontDirect,
    frontDoc,
    licenseMimeFromUpload(record?.licenseFrontUpload) ??
      licenseMimeFromUpload(record?.driversLicenseCopy),
    licenseFileNameFromUpload(record?.licenseFrontUpload) ??
      licenseFileNameFromUpload(record?.driversLicenseCopy),
  );
  const backPreview = useLicensePreview(
    backDirect,
    backDoc,
    licenseMimeFromUpload(record?.licenseBackUpload) ??
      licenseMimeFromUpload(record?.driversLicenseBack),
    licenseFileNameFromUpload(record?.licenseBackUpload) ??
      licenseFileNameFromUpload(record?.driversLicenseBack),
  );

  const hasAny =
    frontPreview.url ||
    backPreview.url ||
    frontPreview.loading ||
    backPreview.loading ||
    frontDoc ||
    backDoc ||
    required;

  if (!hasAny) return null;

  return (
    <div className="card mb-4">
      <div className="card-header d-flex align-items-center gap-3">
        <div className="avatar avatar-sm flex-shrink-0">
          <span className="avatar-initial rounded bg-label-primary">
            <i className="bx bx-id-card" aria-hidden="true" />
          </span>
        </div>
        <div>
          <h6 className="card-title mb-0">DRIVER&apos;S license copies</h6>
          <p className="text-muted small mb-0">
            Front and back of the license — shared with DQF when linked
          </p>
        </div>
      </div>
      <div className="card-body">
        {!frontPreview.url &&
        !backPreview.url &&
        !frontPreview.loading &&
        !backPreview.loading &&
        !frontDoc &&
        !backDoc ? (
          <p className="text-warning mb-0" role="status">
            Missing front and back license copies. Add them under Edit person → DRIVER.
          </p>
        ) : (
          <div className="row g-3">
            <LicenseSidePreview label="Front" personName={personName} preview={frontPreview} />
            <LicenseSidePreview label="Back" personName={personName} preview={backPreview} />
          </div>
        )}
      </div>
    </div>
  );
}
