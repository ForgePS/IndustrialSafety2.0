"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { canAccessExecutiveWalkthrough, canManageConfiguration } from "@/lib/platform-admin";

type TenantBrandingRow = {
  id: string;
  displayName: string | null;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  approvedColorsJson: string[] | null;
  contactName: string | null;
  contactPhone: string | null;
  reportIdentity: string | null;
  documentFooter: string | null;
  emailSenderName: string | null;
  supportEmail: string | null;
  logoDocumentId: string | null;
  logoDarkDocumentId: string | null;
  iconDocumentId: string | null;
};

type BrandingAssetUpload = {
  documentId: string;
  kind: "logo";
  uploadUrl: string;
};

type BrandingAssetDownload = {
  downloadUrl: string;
};

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const MAX_BYTES = 5_000_000;

function brandingPayloadFromRow(
  row: TenantBrandingRow | null,
  logoDocumentId: string | null,
): Record<string, unknown> {
  return {
    displayName: row?.displayName ?? null,
    shortName: row?.shortName ?? null,
    primaryColor: row?.primaryColor ?? null,
    secondaryColor: row?.secondaryColor ?? null,
    accentColor: row?.accentColor ?? null,
    approvedColorsJson: row?.approvedColorsJson ?? [],
    contactName: row?.contactName ?? null,
    contactPhone: row?.contactPhone ?? null,
    emailSenderName: row?.emailSenderName ?? null,
    supportEmail: row?.supportEmail ?? null,
    reportIdentity: row?.reportIdentity ?? null,
    documentFooter: row?.documentFooter ?? null,
    logoDocumentId,
    logoDarkDocumentId: row?.logoDarkDocumentId ?? null,
    iconDocumentId: row?.iconDocumentId ?? null,
  };
}

export default function SettingsPresentationLogoPage() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canEdit = canAccessExecutiveWalkthrough(me) && canManageConfiguration(me);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [row, setRow] = useState<TenantBrandingRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const loadPreview = useCallback(
    async (documentId: string | null) => {
      if (!tenantId || !documentId) {
        setPreviewUrl(null);
        return;
      }
      try {
        const asset = await apiGet<BrandingAssetDownload>(
          `/api/v1/tenants/${tenantId}/branding/assets/${encodeURIComponent(documentId)}/download-url`,
        );
        setPreviewUrl(asset.downloadUrl);
        setLogoFailed(false);
      } catch {
        setPreviewUrl(null);
      }
    },
    [tenantId],
  );

  const load = useCallback(async () => {
    if (!tenantId || !canEdit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await apiGet<TenantBrandingRow | null>(`/api/v1/tenants/${tenantId}/branding`);
      setRow(next);
      await loadPreview(next?.logoDocumentId ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load presentation logo");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canEdit, loadPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(file: File | null) {
    if (!tenantId || !canEdit || !file) return;
    setError(null);
    setMessage(null);

    if (!ALLOWED_MIME.has(file.type)) {
      setError("Logo must be PNG, JPEG, WebP, GIF, or SVG.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Logo must be between 1 byte and 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const upload = await apiSend<BrandingAssetUpload>(
        `/api/v1/tenants/${tenantId}/branding/assets/upload-url`,
        "POST",
        {
          kind: "logo",
          filename: file.name,
          mimeType: file.type,
          contentLength: file.size,
        },
        { idempotencyKey: crypto.randomUUID() },
      );

      const putRes = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Content-Length": String(file.size),
          "x-amz-server-side-encryption": "aws:kms",
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload to storage failed (${putRes.status})`);
      }

      const updated = await apiSend<TenantBrandingRow>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayloadFromRow(row, upload.documentId),
        { idempotencyKey: crypto.randomUUID() },
      );
      setRow(updated);
      await loadPreview(updated.logoDocumentId);
      setMessage(
        "Forge Industrial Safety logo updated. It appears on the walkthrough opening screen.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  }

  async function onClear() {
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiSend<TenantBrandingRow>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayloadFromRow(row, null),
        { idempotencyKey: crypto.randomUUID() },
      );
      setRow(updated);
      setPreviewUrl(null);
      setMessage("Presentation logo cleared. Opening cards will show text branding only.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear logo");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <p className="text-muted mb-0">Loading presentation logo…</p>;
  }

  if (!canEdit) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        The walkthrough logo is only available on the Forge Platform demo tenant.
      </div>
    );
  }

  const showLogo = Boolean(previewUrl?.trim()) && !logoFailed;

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Organization</p>
        <h1 className="h4 mb-1">Forge Industrial Safety Logo</h1>
        <p className="text-muted mb-0">
          Customize the logo shown on the walkthrough opening and closing screens. This uses the
          same light-theme logo as <Link href="/settings/branding/">Branding</Link> (nav, login, and
          documents).
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}

      <div className="row g-3">
        <div className="col-12 col-lg-5">
          <div className="card h-100">
            <div className="card-header">
              <h6 className="mb-0">Upload logo</h6>
            </div>
            <div className="card-body">
              <p className="small text-muted">
                PNG, JPEG, WebP, GIF, or SVG · max 5 MB. Prefer a transparent PNG (no black or white
                plate). A ready transparent mark is available at{" "}
                <a href="/brand/forge-industrial-safety-logo.png" download>
                  forge-industrial-safety-logo.png
                </a>
                .
              </p>
              <input
                type="file"
                className="form-control mb-3"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                disabled={busy || uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onUpload(file);
                }}
              />
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  disabled={busy || uploading || !row?.logoDocumentId}
                  onClick={() => void onClear()}
                >
                  Clear logo
                </button>
                <Link className="btn btn-outline-secondary btn-sm" href="/settings/branding/">
                  Full branding
                </Link>
                <Link className="btn btn-outline-primary btn-sm" href="/demo/industrial/">
                  Preview walkthrough
                </Link>
              </div>
              {uploading ? <p className="small text-muted mt-3 mb-0">Uploading…</p> : null}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-7">
          <div className="card h-100">
            <div className="card-header">
              <h6 className="mb-0">Opening screen preview</h6>
            </div>
            <div className="card-body">
              <div
                className="exec-walkthrough-card rounded-3 p-4"
                data-variant="opening"
                style={{ position: "relative", minHeight: 280 }}
              >
                <div className="exec-walkthrough-card-inner">
                  {showLogo ? (
                    <div className="exec-walkthrough-card-logo-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="exec-walkthrough-card-logo"
                        src={previewUrl!}
                        alt="Forge Industrial Safety logo"
                        onError={() => setLogoFailed(true)}
                      />
                    </div>
                  ) : null}
                  <p className="exec-walkthrough-brand mb-2">Forge Industrial Safety</p>
                  <p className="exec-walkthrough-tagline fw-semibold mb-3">
                    One Platform. Total Safety Visibility.
                  </p>
                  <p className="exec-walkthrough-support">
                    Personnel, training, incidents, compliance, inspections, equipment,
                    communication, and day-to-day safety operations in one connected platform.
                  </p>
                  <span className="badge bg-warning text-dark mt-3">DEMO ENVIRONMENT</span>
                </div>
              </div>
              {!showLogo ? (
                <p className="small text-muted mt-3 mb-0">
                  No logo uploaded yet — the opening card shows the brand name as text.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
