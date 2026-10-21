"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { buildSmsSignupPosterHtml } from "@/lib/personnel-sms-authorization";

type SignupQr = {
  qrLinkId: string;
  label: string;
  displayCode: string | null;
  scanCount: number;
  lastScannedAt: string | null;
  signupCount: number;
  url: string | null;
  dataUrl: string | null;
  needsReissue: boolean;
};

const ENDPOINT = "/api/v1/industrial/emergency-alerts/sms-signup-qr";

export function EmergencySmsSignupQrCard({ canManage }: { canManage: boolean }) {
  const [qr, setQr] = useState<SignupQr | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    try {
      const data = await apiGet<SignupQr | null>(
        `${ENDPOINT}?appBaseUrl=${encodeURIComponent(appBaseUrl)}`,
      );
      setQr(data ?? null);
      setError(null);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not load the signup QR code."));
    } finally {
      setLoaded(true);
    }
  }, [appBaseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setQr(await apiSend<SignupQr>(ENDPOINT, "POST", { appBaseUrl }));
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not create the signup QR code."));
    } finally {
      setBusy(false);
    }
  }

  function printPoster() {
    if (!qr?.dataUrl || !qr.url) return;
    const message = openPrintableHtmlPopup(
      buildSmsSignupPosterHtml({ dataUrl: qr.dataUrl, url: qr.url }),
      true,
    );
    if (message) setError(message);
  }

  async function copyLink() {
    if (!qr?.url) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  return (
    <div className="card border shadow-none">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h6 className="mb-0">
          <i className="bx bx-qr me-1" aria-hidden />
          Emergency SMS Alerts signup QR
        </h6>
        {qr ? (
          <Link href="/modules/qr-links" className="small">
            Manage in QR Links
          </Link>
        ) : null}
      </div>
      <div className="card-body">
        {error ? (
          <div className="alert alert-warning py-2" role="alert">
            {error}
          </div>
        ) : null}

        {!loaded ? (
          <p className="text-muted small mb-0">Loading…</p>
        ) : !qr ? (
          <div>
            <p className="small text-muted">
              Post this code where employees gather. Scanning opens a signup form where they verify
              their employee number and last name, enter their mobile number, and sign the SMS
              consent. The number and signed form are saved to their personnel file.
            </p>
            {canManage ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void create()}>
                {busy ? "Creating…" : "Create signup QR code"}
              </button>
            ) : (
              <p className="small mb-0">Ask an Emergency Alerts admin to create the signup QR code.</p>
            )}
          </div>
        ) : qr.needsReissue || !qr.dataUrl || !qr.url ? (
          <p className="small mb-0">
            This signup code&apos;s token can&apos;t be recovered for reprinting. Open it in{" "}
            <Link href="/modules/qr-links">QR Links</Link>, revoke the token, then come back here to issue a
            new one.
          </p>
        ) : (
          <div className="row g-3 align-items-center">
            <div className="col-sm-auto text-center">
              <img
                src={qr.dataUrl}
                alt="Emergency SMS Alerts signup QR code"
                width={200}
                height={200}
                className="border rounded"
              />
              {qr.displayCode ? <div className="small text-muted mt-1">Code {qr.displayCode}</div> : null}
            </div>
            <div className="col">
              <p className="small text-muted mb-2">
                Employees scan to sign up. Each signup updates their SMS number and saves a signed
                consent form on their personnel file.
              </p>
              <div className="d-flex flex-wrap gap-3 small mb-3">
                <span>
                  <strong>{qr.signupCount}</strong> signups
                </span>
                <span>
                  <strong>{qr.scanCount}</strong> scans
                </span>
                {qr.lastScannedAt ? (
                  <span className="text-muted">
                    Last scanned {new Date(qr.lastScannedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <div className="input-group input-group-sm mb-3">
                <input className="form-control" readOnly value={qr.url} aria-label="Signup link" />
                <button type="button" className="btn btn-outline-secondary" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={printPoster}>
                  <i className="bx bx-printer me-1" aria-hidden />
                  Print poster
                </button>
                <a
                  className="btn btn-outline-secondary btn-sm"
                  href={qr.dataUrl}
                  download="emergency-sms-signup-qr.png"
                >
                  <i className="bx bx-download me-1" aria-hidden />
                  Download PNG
                </a>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load()}>
                  Refresh counts
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
