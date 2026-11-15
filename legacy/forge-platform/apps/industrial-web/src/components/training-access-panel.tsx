"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, apiGet } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import { decodeBase64ToBlob } from "@/lib/binary";
import { canManageTrainingPortalQr } from "@/lib/platform-admin";
import {
  TRAINING_PORTAL_HEADING,
  copyPortalUrl,
  downloadTrainingPortalQrPng,
  printTrainingPortalQr,
} from "@/lib/training-portal-share";
import { ForgePrintButton } from "@/components/forge-print-button";
import { trainingPortalPrintFieldValues } from "@/lib/module-print-fields";

type PortalQrDisplay =
  | { configured: false; needsReissue?: boolean; linkId?: string; title?: string }
  | {
      configured: true;
      linkId: string;
      title: string;
      url: string;
      contentType: string;
      dataBase64: string;
    };

/** Read-only training portal QR for the QR / Access tab (download + print). */
export function TrainingAccessPanel() {
  const { me } = useAuth();
  const canManagePortal = canManageTrainingPortalQr(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [portal, setPortal] = useState<PortalQrDisplay | null>(null);
  const [qrImageHref, setQrImageHref] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const appBaseUrl = window.location.origin;
      const data = await apiGet<PortalQrDisplay>(
        `/api/v1/industrial/training/access-links/portal/qr?appBaseUrl=${encodeURIComponent(appBaseUrl)}`,
      );
      setPortal(data);
      setQrImageHref((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        if (data?.configured && data.dataBase64) {
          const blob = decodeBase64ToBlob(data.dataBase64, data.contentType || "image/png");
          return URL.createObjectURL(blob);
        }
        return null;
      });
    } catch (e) {
      setError(formatApiErrorMessage(e, "Failed to load training portal QR"));
      setPortal(null);
      setQrImageHref((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (qrImageHref) URL.revokeObjectURL(qrImageHref);
    };
  }, [qrImageHref]);

  async function onDownloadPng() {
    if (!portal?.configured || !qrImageHref) return;
    setBusy(true);
    setError(null);
    try {
      await downloadTrainingPortalQrPng({
        qrImageSrc: qrImageHref,
        fileName: "company-training-portal-qr.png",
      });
      setNotice("Downloaded Company Training Portal QR as PNG.");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not download QR image"));
    } finally {
      setBusy(false);
    }
  }

  async function onPrint() {
    if (!portal?.configured || !qrImageHref) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await printTrainingPortalQr({ qrImageSrc: qrImageHref });
      if (result) setError(result);
      else setNotice("Print dialog opened.");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not print QR"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h6 className="mb-0">Training portal QR</h6>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      <div className="card-body">
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {notice ? <div className="alert alert-success">{notice}</div> : null}

        <p className="small text-muted mb-3">
          Employees sign in with the <strong>employee number</strong> on their personnel record.
          Assign training before they use the portal.
        </p>

        {busy && !portal ? (
          <p className="text-muted mb-0" role="status">
            Loading portal QR…
          </p>
        ) : portal?.configured && qrImageHref ? (
          <div className="text-center border rounded p-4 bg-body">
            <h5 className="mb-3">{TRAINING_PORTAL_HEADING}</h5>
            <img
              src={qrImageHref}
              alt="Training portal QR code"
              className="img-fluid mb-3"
              style={{ maxWidth: 280 }}
            />
            <div className="mb-3">
              <label className="form-label small mb-1" htmlFor="training-portal-url">
                Portal URL
              </label>
              <div className="input-group input-group-sm mx-auto" style={{ maxWidth: "32rem" }}>
                <input
                  id="training-portal-url"
                  className="form-control"
                  readOnly
                  value={portal.url}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={() =>
                    void copyPortalUrl(portal.url).then((ok) =>
                      setNotice(ok ? "Portal link copied." : "Could not copy link."),
                    )
                  }
                >
                  Copy link
                </button>
              </div>
            </div>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void onDownloadPng()}
              >
                Download PNG
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => void onPrint()}
              >
                Print
              </button>
              {portal.configured ? (
                <ForgePrintButton
                  module="TRAINING"
                  recordType="training_portal"
                  recordId={portal.linkId}
                  fieldValues={trainingPortalPrintFieldValues({
                    url: portal.url,
                    title: portal.title || TRAINING_PORTAL_HEADING,
                  })}
                  label="Print Label"
                />
              ) : null}
            </div>
          </div>
        ) : portal && !portal.configured && "needsReissue" in portal && portal.needsReissue ? (
          <div className="alert alert-secondary mb-0">
            A portal link exists but the QR image is unavailable.
            {canManagePortal ? (
              <>
                {" "}
                Re-issue the QR in{" "}
                <Link href="/settings/training-portal/">Settings → Training portal QR</Link>.
              </>
            ) : (
              " Ask your administrator to re-issue the portal QR in system settings."
            )}
          </div>
        ) : (
          <div className="alert alert-secondary mb-0">
            {canManagePortal ? (
              <>
                No training portal QR has been configured yet. Create one in{" "}
                <Link href="/settings/training-portal/">Settings → Training portal QR</Link>.
              </>
            ) : (
              "No training portal QR has been configured yet. Ask your administrator to create one in system settings."
            )}
          </div>
        )}

        {canManagePortal ? (
          <p className="small text-muted mt-3 mb-0">
            To create, re-issue, or revoke the portal QR, use{" "}
            <Link href="/settings/training-portal/">Settings → Training portal QR</Link> (admin
            only).
          </p>
        ) : null}
      </div>
    </div>
  );
}
