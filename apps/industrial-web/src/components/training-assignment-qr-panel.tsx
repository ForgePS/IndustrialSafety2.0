"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiSend } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import { decodeBase64ToBlob } from "@/lib/binary";

export function TrainingAssignmentQrPanel({
  assignmentId,
  assignmentTitle,
  hasPublicQr,
  canManage,
}: {
  assignmentId: string;
  assignmentTitle: string;
  hasPublicQr?: boolean;
  canManage: boolean;
}) {
  const [qrActive, setQrActive] = useState(Boolean(hasPublicQr));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrImageHref, setQrImageHref] = useState<string | null>(null);

  useEffect(() => {
    setQrActive(Boolean(hasPublicQr));
  }, [hasPublicQr]);

  async function onIssueQr(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setQrImageHref(null);
    try {
      const appBaseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const issued = await apiSend<{ token: string; url: string }>(
        `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}/qr`,
        "POST",
        { appBaseUrl },
      );
      if (!issued?.url || !issued?.token) {
        throw new Error("QR issue response was incomplete.");
      }
      setQrUrl(issued.url);
      setQrActive(true);
      const image = await apiSend<{ dataBase64: string; contentType: string }>(
        `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}/qr/image`,
        "POST",
        { token: issued.token, appBaseUrl },
      );
      if (image?.dataBase64) {
        const blob = decodeBase64ToBlob(image.dataBase64, image.contentType || "image/png");
        setQrImageHref(URL.createObjectURL(blob));
      }
      setNotice(
        "Assignment QR issued. Post or share the link so assignees can enter their EMPLOYEE number.",
      );
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to issue assignment QR"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeQr() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend(
        `/api/v1/industrial/training/assignments/${encodeURIComponent(assignmentId)}/qr/revoke`,
        "POST",
        {},
      );
      setQrUrl(null);
      setQrImageHref(null);
      setQrActive(false);
      setNotice("Assignment QR revoked.");
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to revoke assignment QR"));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <div className="border rounded p-3 mt-2 bg-light">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div>
          <div className="fw-semibold small">Assignment QR access</div>
          <div className="text-muted small">
            Scan to open this assignment. Assignees enter their EMPLOYEE number to take the quiz.
          </div>
        </div>
        <span className={`badge ${qrActive ? "bg-success" : "bg-secondary"}`}>
          {qrActive ? "QR active" : "No QR"}
        </span>
      </div>

      {error ? (
        <div className="alert alert-danger py-2 small mb-2" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success py-2 small mb-2" role="status">
          {notice}
        </div>
      ) : null}

      <form className="d-flex flex-wrap gap-2 mb-2" onSubmit={(e) => void onIssueQr(e)}>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          {qrActive ? "Regenerate QR" : "Generate QR"}
        </button>
        {qrActive ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={busy}
            onClick={() => void onRevokeQr()}
          >
            Revoke QR
          </button>
        ) : null}
      </form>

      {qrUrl ? (
        <div className="mb-2">
          <label className="form-label small" htmlFor={`assignment-qr-url-${assignmentId}`}>
            QR link for {assignmentTitle}
          </label>
          <input
            id={`assignment-qr-url-${assignmentId}`}
            className="form-control form-control-sm"
            readOnly
            value={qrUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      ) : null}

      {qrImageHref ? (
        <div className="text-center">
          <img
            src={qrImageHref}
            alt={`QR code for ${assignmentTitle}`}
            className="img-fluid border rounded bg-white p-2"
            style={{ maxWidth: "12rem" }}
          />
          <div className="mt-2">
            <a
              className="btn btn-sm btn-outline-secondary"
              href={qrImageHref}
              download={`training-qr-${assignmentId}.png`}
            >
              Download QR image
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
