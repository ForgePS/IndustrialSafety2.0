"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  companyDriverMvrConsentOnFile,
  companyDriverMvrOnFile,
  missingCompanyDriverMvrRequirements,
  type CompanyDriverMvrFile,
  type CompanyDriverMvrSnapshot,
} from "@/lib/company-driver-mvr-requirements";
import {
  findProducersMvrConsentForm,
  producersMvrConsentFormFillHref,
  producersMvrConsentFormTitle,
} from "@/lib/producers-mvr-policy";
import {
  emptyPersonnelProfileAnalytics,
  formSubmissionHref,
  type PersonnelProfileAnalytics,
  type ProfileActivityItem,
} from "@/lib/personnel-profile-analytics";
import { FORM_SUBMISSIONS_API } from "@/lib/forms-module";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { compressImageToUploadFile, imageCompressErrorMessage } from "@/lib/compress-image";
import { useImageCrop } from "@/hooks/use-image-crop";

type FormListResponse = { items?: Array<Record<string, unknown>> };

const FORMS_API = "/api/v1/industrial/forms";
const MAX_MVR_BYTES = 12 * 1024 * 1024;

type UploadInit = {
  documentId: string;
  uploadUrl: string;
  originalFilename?: string;
  mimeType?: string;
};

type Props = {
  personnelId?: string;
  snapshot?: CompanyDriverMvrSnapshot | null;
  canFillForms?: boolean;
  canUploadPaper?: boolean;
  onSnapshotChange?: (next: CompanyDriverMvrSnapshot) => void;
};

function guessMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType) return fromType;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function putPresigned(uploadUrl: string, file: File, mimeType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload to storage failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload blocked by the browser (network or CORS). Try again after a hard refresh.",
        ),
      );
    xhr.send(file);
  });
}

/**
 * Company-driver MVR report + consent panel: upload paper copies, open stored
 * files, and open digitally signed MVR Consent form submissions.
 */
export function CompanyDriverMvrPanel({
  personnelId,
  snapshot,
  canFillForms = false,
  canUploadPaper = false,
  onSnapshotChange,
}: Props) {
  const reportInputRef = useRef<HTMLInputElement>(null);
  const consentInputRef = useRef<HTMLInputElement>(null);
  const [mvrFormId, setMvrFormId] = useState<string | null>(null);
  const [mvrFormTitle, setMvrFormTitle] = useState("MVR Consent form");
  const [busyKind, setBusyKind] = useState<"report" | "consent" | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState(snapshot ?? null);
  const [consentForms, setConsentForms] = useState<ProfileActivityItem[]>([]);
  const { cropIfNeeded, cropModal } = useImageCrop();
  const missing = missingCompanyDriverMvrRequirements(localSnapshot);
  const mvrOnFile = companyDriverMvrOnFile(localSnapshot);
  const consentOnFile = companyDriverMvrConsentOnFile(localSnapshot);

  useEffect(() => {
    setLocalSnapshot(snapshot ?? null);
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiGet<FormListResponse>(FORMS_API, {
          query: { page: "1", pageSize: "100" },
        });
        if (cancelled) return;
        const definition = findProducersMvrConsentForm(result.items ?? []);
        const id = definition ? String(definition.id ?? "").trim() : "";
        setMvrFormId(id || null);
        setMvrFormTitle(producersMvrConsentFormTitle(definition));
      } catch {
        if (!cancelled) {
          setMvrFormId(null);
          setMvrFormTitle("MVR Consent form");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!personnelId) {
      setConsentForms([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const analytics = await apiGet<PersonnelProfileAnalytics>(
          `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/analytics`,
        );
        if (cancelled) return;
        const submissions =
          analytics.forms?.submissions ?? emptyPersonnelProfileAnalytics("").forms.submissions;
        const preferred = submissions.filter((item) =>
          /mvr|motor vehicle|consent/i.test(item.label),
        );
        setConsentForms(preferred);
      } catch {
        if (!cancelled) setConsentForms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personnelId]);

  async function openDocument(documentId: string) {
    setOpeningId(documentId);
    setError(null);
    try {
      const data = await apiGet<{ downloadUrl?: string }>(
        `/api/v1/industrial/personnel/mvr-documents/${encodeURIComponent(documentId)}/download-url`,
      );
      if (!data.downloadUrl) throw new Error("Missing download URL");
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Unable to open that file.",
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function viewFormSubmission(item: ProfileActivityItem) {
    setError(null);
    try {
      const data = await apiGet<{ html?: string }>(
        `${FORM_SUBMISSIONS_API}/${encodeURIComponent(item.id)}/printable`,
      );
      if (data.html) {
        openPrintableHtmlPopup(data.html);
        return;
      }
      window.open(formSubmissionHref(item), "_blank", "noopener,noreferrer");
    } catch {
      window.open(formSubmissionHref(item), "_blank", "noopener,noreferrer");
    }
  }

  async function uploadFile(kind: "report" | "consent", file: File | null) {
    if (!file || !personnelId || !canUploadPaper || busyKind) return;
    setBusyKind(kind);
    setError(null);
    try {
      const cropped = await cropIfNeeded(file, {
        title:
          kind === "report"
            ? "Crop MVR report photo before upload"
            : "Crop MVR consent photo before upload",
      });
      if (!cropped) return;
      const prepared = await compressImageToUploadFile(cropped, { maxBytes: MAX_MVR_BYTES });
      if (prepared.size <= 0 || prepared.size > MAX_MVR_BYTES) {
        throw new Error(
          `File must be between 1 byte and ${Math.round(MAX_MVR_BYTES / (1024 * 1024))} MB.`,
        );
      }
      const mimeType = guessMime(prepared);
      const base =
        kind === "report"
          ? "/api/v1/industrial/personnel/mvr-report"
          : "/api/v1/industrial/personnel/mvr-consent";
      const init = await apiSend<UploadInit>(`${base}/upload-url`, "POST", {
        personnelId,
        filename: prepared.name,
        mimeType,
        contentLength: prepared.size,
      });
      await putPresigned(init.uploadUrl, prepared, init.mimeType || mimeType);
      const completed = await apiSend<{
        mvrReleaseDate?: string;
        lastMvrDate?: string;
        mvrReleaseUploadCount?: number;
        mvrUploadCount?: number;
        file?: CompanyDriverMvrFile;
      }>(`${base}/complete`, "POST", {
        personnelId,
        documentId: init.documentId,
      });
      const nextFile: CompanyDriverMvrFile = completed.file ?? {
        name: init.originalFilename || prepared.name,
        documentId: init.documentId,
        uploadedAt: new Date().toISOString(),
        contentType: init.mimeType || mimeType,
      };
      const next: CompanyDriverMvrSnapshot =
        kind === "consent"
          ? {
              ...(localSnapshot ?? {}),
              mvrReleaseDate: completed.mvrReleaseDate || new Date().toISOString().slice(0, 10),
              mvrReleaseUploadCount:
                completed.mvrReleaseUploadCount ??
                Math.max(1, (localSnapshot?.mvrConsentFiles?.length ?? 0) + 1),
              mvrConsentFiles: [...(localSnapshot?.mvrConsentFiles ?? []), nextFile],
            }
          : {
              ...(localSnapshot ?? {}),
              lastMvrDate: completed.lastMvrDate || new Date().toISOString().slice(0, 10),
              initialMvrDate:
                localSnapshot?.initialMvrDate ||
                completed.lastMvrDate ||
                new Date().toISOString().slice(0, 10),
              mvrUploadCount:
                completed.mvrUploadCount ?? Math.max(1, (localSnapshot?.mvrFiles?.length ?? 0) + 1),
              mvrFiles: [...(localSnapshot?.mvrFiles ?? []), nextFile],
            };
      setLocalSnapshot(next);
      onSnapshotChange?.(next);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : imageCompressErrorMessage(e, "Unable to upload that file."),
      );
    } finally {
      setBusyKind(null);
      if (reportInputRef.current) reportInputRef.current.value = "";
      if (consentInputRef.current) consentInputRef.current.value = "";
    }
  }

  return (
    <>
      {cropModal}
      <div
        className={`alert ${missing.length > 0 ? "alert-warning" : "alert-info"} mb-0`}
        role="status"
      >
        <div className="d-flex align-items-start gap-2">
          <i
            className={`bx ${missing.length > 0 ? "bx-error-circle" : "bx-info-circle"} fs-5 flex-shrink-0 mt-1`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-grow-1">
            <h6 className="alert-heading mb-2">Company driver MVR documents</h6>
            <p className="mb-2 small">
              Upload the MVR report and signed MVR Consent (digital or paper). Open any stored
              document or completed consent form from this panel.
            </p>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="border rounded p-2 bg-body">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="fw-semibold small">MVR report</div>
                    <StatusBadge ok={mvrOnFile} />
                  </div>
                  {localSnapshot?.lastMvrDate ? (
                    <p className="text-muted small mb-2">
                      Last MVR: {localSnapshot.lastMvrDate.slice(0, 10)}
                    </p>
                  ) : (
                    <p className="text-muted small mb-2">No MVR report on file yet.</p>
                  )}
                  <FileList
                    files={localSnapshot?.mvrFiles ?? []}
                    openingId={openingId}
                    onOpen={(id) => void openDocument(id)}
                    empty="No uploaded MVR report files."
                  />
                  {canUploadPaper && personnelId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary mt-2"
                      disabled={busyKind !== null}
                      onClick={() => reportInputRef.current?.click()}
                    >
                      {busyKind === "report" ? "Uploading…" : "Upload MVR report"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-2 bg-body">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="fw-semibold small">
                      MVR Consent <span className="text-danger">*</span>
                    </div>
                    <StatusBadge ok={consentOnFile} />
                  </div>
                  {localSnapshot?.mvrReleaseDate ? (
                    <p className="text-muted small mb-2">
                      Consent date: {localSnapshot.mvrReleaseDate.slice(0, 10)}
                    </p>
                  ) : (
                    <p className="text-muted small mb-2">No MVR Consent on file yet.</p>
                  )}
                  <FileList
                    files={localSnapshot?.mvrConsentFiles ?? []}
                    openingId={openingId}
                    onOpen={(id) => void openDocument(id)}
                    empty="No uploaded paper consent files."
                  />
                  {consentForms.length > 0 ? (
                    <ul className="list-unstyled mb-2 mt-2 small">
                      {consentForms.map((item) => (
                        <li
                          key={item.id}
                          className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1 border-top"
                        >
                          <span className="text-truncate">{item.label}</span>
                          <span className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-link btn-sm px-0"
                              onClick={() => void viewFormSubmission(item)}
                            >
                              View
                            </button>
                            <Link
                              className="btn btn-link btn-sm px-0"
                              href={formSubmissionHref(item)}
                            >
                              Open in Forms
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted small mb-2 mt-2">
                      No digital MVR Consent submissions yet.
                    </p>
                  )}
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {canFillForms && mvrFormId && personnelId ? (
                      <Link
                        className="btn btn-sm btn-primary"
                        href={producersMvrConsentFormFillHref(mvrFormId, personnelId)}
                      >
                        Complete {mvrFormTitle}
                      </Link>
                    ) : null}
                    {canUploadPaper && personnelId ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busyKind !== null}
                        onClick={() => consentInputRef.current?.click()}
                      >
                        {busyKind === "consent" ? "Uploading…" : "Upload paper consent"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {missing.length > 0 ? (
              <p className="mb-2 small text-warning-emphasis">
                Still needed: {missing.join(" and ")}.
                {!personnelId ? " Save this person first, then complete the requirements." : null}
              </p>
            ) : null}
            {personnelId ? (
              <Link
                className="btn btn-sm btn-outline-secondary"
                href="/modules/personnel/?view=company-drivers"
              >
                Company drivers roster
              </Link>
            ) : null}
            <input
              ref={reportInputRef}
              type="file"
              className="d-none"
              accept="image/*,application/pdf"
              onChange={(event) => void uploadFile("report", event.target.files?.[0] ?? null)}
            />
            <input
              ref={consentInputRef}
              type="file"
              className="d-none"
              accept="image/*,application/pdf"
              onChange={(event) => void uploadFile("consent", event.target.files?.[0] ?? null)}
            />
            {error ? <div className="text-danger small mt-2 mb-0">{error}</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`badge ${ok ? "bg-label-success" : "bg-label-warning"}`}>
      {ok ? "On file" : "Missing"}
    </span>
  );
}

function FileList({
  files,
  openingId,
  onOpen,
  empty,
}: {
  files: CompanyDriverMvrFile[];
  openingId: string | null;
  onOpen: (documentId: string) => void;
  empty: string;
}) {
  if (files.length === 0) {
    return <p className="text-muted small mb-0">{empty}</p>;
  }
  return (
    <ul className="list-unstyled mb-0 small">
      {files.map((file, index) => {
        const key = file.documentId || `${file.name}-${index}`;
        return (
          <li
            key={key}
            className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1 border-top"
          >
            <span className="text-truncate">
              <i className="bx bx-file me-1" aria-hidden="true" />
              {file.name}
              {file.uploadedAt ? (
                <span className="text-muted"> · {file.uploadedAt.slice(0, 10)}</span>
              ) : null}
            </span>
            {file.documentId ? (
              <button
                type="button"
                className="btn btn-link btn-sm px-0"
                disabled={openingId === file.documentId}
                onClick={() => onOpen(file.documentId!)}
              >
                {openingId === file.documentId ? "Opening…" : "View"}
              </button>
            ) : (
              <span className="text-muted">Imported (no preview)</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
