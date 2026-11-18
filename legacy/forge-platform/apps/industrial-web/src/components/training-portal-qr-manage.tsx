"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@forge/web-kit";
import { apiGet, apiSend } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import { decodeBase64ToBlob } from "@/lib/binary";
import { canManageTrainingPortalQr } from "@/lib/platform-admin";
import { TRAINING_PORTAL_HEADING, copyPortalUrl } from "@/lib/training-portal-share";
import { trainingApi } from "@/features/training/api";

type AccessLink = {
  id: string;
  linkType: string;
  title: string;
  status: string;
  hasToken: boolean;
};

type IssuedQr = {
  url: string;
  dataBase64?: string;
  contentType?: string;
};

type PortalConfig = {
  employeeNumberPrefix: string;
  portalEnabled: boolean;
  employeeNumberHint: string | null;
};

/** Admin-only settings surface for creating and rotating the company training portal QR. */
export function TrainingPortalQrManage() {
  const { me } = useAuth();
  const canManage = canManageTrainingPortalQr(me);
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState(TRAINING_PORTAL_HEADING);
  const [issuedLinkId, setIssuedLinkId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedQr | null>(null);
  const [qrImageHref, setQrImageHref] = useState<string | null>(null);
  const [portalConfig, setPortalConfig] = useState<PortalConfig>({
    employeeNumberPrefix: "EMP-",
    portalEnabled: true,
    employeeNumberHint: null,
  });

  const clearIssuedQr = useCallback(() => {
    setIssuedLinkId(null);
    setIssued(null);
    setQrImageHref((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const applyIssuedQr = useCallback((linkId: string, payload: IssuedQr) => {
    setIssuedLinkId(linkId);
    setIssued(payload);
    setQrImageHref((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (payload.dataBase64) {
        const blob = decodeBase64ToBlob(payload.dataBase64, payload.contentType || "image/png");
        return URL.createObjectURL(blob);
      }
      return null;
    });
  }, []);

  const activePortal = useMemo(
    () => links.find((link) => link.linkType === "COMPANY_PORTAL" && link.hasToken) ?? null,
    [links],
  );

  const load = useCallback(async () => {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const [data, config] = await Promise.all([
        apiGet<AccessLink[]>("/api/v1/industrial/training/access-links"),
        trainingApi.getPortalConfig().catch(() => null),
      ]);
      setLinks(Array.isArray(data) ? data : []);
      if (config) setPortalConfig(config);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Failed to load training portal links"));
    } finally {
      setBusy(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (qrImageHref) URL.revokeObjectURL(qrImageHref);
    };
  }, [qrImageHref]);

  async function createPortalQr() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await apiSend<IssuedQr & { id: string }>(
        "/api/v1/industrial/training/access-links",
        "POST",
        {
          linkType: "COMPANY_PORTAL",
          title: title.trim() || TRAINING_PORTAL_HEADING,
          appBaseUrl: window.location.origin,
          issueQr: true,
        },
      );
      if (created?.url && created?.id) {
        applyIssuedQr(created.id, created);
      }
      setTitle(TRAINING_PORTAL_HEADING);
      setNotice("Training portal QR created. A copy is available under Training → QR / Access.");
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not create training portal QR"));
    } finally {
      setBusy(false);
    }
  }

  async function issueQr(linkId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiSend<IssuedQr>(
        `/api/v1/industrial/training/access-links/${encodeURIComponent(linkId)}/qr`,
        "POST",
        { appBaseUrl: window.location.origin },
      );
      applyIssuedQr(linkId, res);
      setNotice("Training portal QR re-issued. Update printed copies if you rotate the code.");
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not issue training portal QR"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeQr(linkId: string, linkTitle: string) {
    if (
      !window.confirm(
        `Revoke the QR code for "${linkTitle}"? Employees will no longer be able to scan the old code.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend(
        `/api/v1/industrial/training/access-links/${encodeURIComponent(linkId)}/qr/revoke`,
        "POST",
        {},
      );
      if (issuedLinkId === linkId) clearIssuedQr();
      setNotice("Training portal QR revoked.");
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not revoke training portal QR"));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="alert alert-warning mb-0" role="alert">
        Training portal QR codes can only be created by tenant administrators.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Platform admin</p>
        <h1 className="h4 mb-1">Training portal QR</h1>
        <p className="text-muted mb-0">
          Create and rotate the company training portal QR code. Training staff can view, download,
          and print a copy from{" "}
          <Link href="/modules/training/?section=access">Training → QR / Access</Link>.
        </p>
      </div>

      <div className="card border shadow-none">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Portal QR management</h6>
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

          <div className="border rounded p-3 mb-4">
            <h6 className="mb-2">Portal login settings</h6>
            <div className="row g-2 align-items-end">
              <div className="col-md-3">
                <label className="form-label small" htmlFor="portal-prefix">
                  Employee number prefix
                </label>
                <input
                  id="portal-prefix"
                  className="form-control form-control-sm"
                  value={portalConfig.employeeNumberPrefix}
                  onChange={(e) =>
                    setPortalConfig((p) => ({ ...p, employeeNumberPrefix: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small" htmlFor="portal-hint">
                  Login hint
                </label>
                <input
                  id="portal-hint"
                  className="form-control form-control-sm"
                  value={portalConfig.employeeNumberHint ?? ""}
                  onChange={(e) =>
                    setPortalConfig((p) => ({
                      ...p,
                      employeeNumberHint: e.target.value || null,
                    }))
                  }
                  placeholder="e.g. 21055"
                />
              </div>
              <div className="col-md-3">
                <div className="form-check mb-2">
                  <input
                    id="portal-enabled"
                    type="checkbox"
                    className="form-check-input"
                    checked={portalConfig.portalEnabled}
                    onChange={(e) =>
                      setPortalConfig((p) => ({ ...p, portalEnabled: e.target.checked }))
                    }
                  />
                  <label className="form-check-label" htmlFor="portal-enabled">
                    Portal enabled
                  </label>
                </div>
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary w-100"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setError(null);
                      setNotice(null);
                      try {
                        const saved = await trainingApi.putPortalConfig(portalConfig);
                        setPortalConfig(saved);
                        setNotice("Portal login settings saved.");
                      } catch (e) {
                        setError(formatApiErrorMessage(e, "Could not save portal settings"));
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          <div className="row g-2 mb-4">
            <div className="col-md-8">
              <label className="form-label" htmlFor="training-portal-title">
                Portal label
              </label>
              <input
                id="training-portal-title"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={TRAINING_PORTAL_HEADING}
              />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-primary w-100"
                disabled={busy}
                onClick={() => void createPortalQr()}
              >
                {activePortal ? "Create new portal + QR" : "Create portal + QR"}
              </button>
            </div>
          </div>

          {issued?.url && qrImageHref ? (
            <div className="alert alert-success">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div className="flex-grow-1 min-w-0">
                  <label className="form-label small mb-1" htmlFor="training-portal-url-admin">
                    Portal URL
                  </label>
                  <div className="input-group">
                    <input
                      id="training-portal-url-admin"
                      className="form-control form-control-sm"
                      readOnly
                      value={issued.url}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={busy}
                      onClick={() =>
                        void copyPortalUrl(issued.url).then((ok) =>
                          setNotice(ok ? "Portal link copied." : "Could not copy link."),
                        )
                      }
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="fw-semibold mb-2">{TRAINING_PORTAL_HEADING}</p>
                <img
                  src={qrImageHref}
                  alt="Training portal QR code"
                  className="img-fluid"
                  style={{ maxWidth: 280 }}
                />
              </div>
            </div>
          ) : null}

          <ul className="list-group list-group-flush">
            {links.map((link) => (
              <li
                key={link.id}
                className="list-group-item d-flex justify-content-between align-items-center gap-2"
              >
                <div>
                  <strong>{link.title}</strong>
                  <div className="small text-muted">
                    {link.linkType} · {link.hasToken ? "QR active" : "No QR issued"}
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy}
                    onClick={() => void issueQr(link.id)}
                  >
                    {link.hasToken ? "Re-issue QR" : "Issue QR"}
                  </button>
                  {link.hasToken ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      disabled={busy}
                      onClick={() => void revokeQr(link.id, link.title)}
                    >
                      Revoke QR
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!links.length ? (
              <li className="list-group-item text-muted">No training portal links yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </>
  );
}
