"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { canManageConfiguration } from "@/lib/platform-admin";

type BrandingAssetKind = "logo" | "logo_dark" | "icon";

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
  kind: BrandingAssetKind;
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

const ASSET_META: Record<
  BrandingAssetKind,
  { label: string; hint: string; previewMaxWidth: string; previewMaxHeight: string }
> = {
  logo: {
    label: "Light theme logo",
    hint: "Used in light mode for nav, login, and documents.",
    previewMaxWidth: "12rem",
    previewMaxHeight: "4rem",
  },
  logo_dark: {
    label: "Dark theme logo",
    hint: "Used in dark mode. Falls back to the light logo when empty.",
    previewMaxWidth: "12rem",
    previewMaxHeight: "4rem",
  },
  icon: {
    label: "Icon",
    hint: "Square mark for compact UI surfaces.",
    previewMaxWidth: "4rem",
    previewMaxHeight: "4rem",
  },
};

function asText(value: string | null | undefined): string {
  return value ?? "";
}

function documentIdForKind(
  row: Pick<TenantBrandingRow, "logoDocumentId" | "logoDarkDocumentId" | "iconDocumentId"> | null,
  kind: BrandingAssetKind,
): string | null {
  if (!row) return null;
  if (kind === "logo") return row.logoDocumentId ?? null;
  if (kind === "logo_dark") return row.logoDarkDocumentId ?? null;
  return row.iconDocumentId ?? null;
}

export default function SettingsBrandingPage() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canEdit = canManageConfiguration(me);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<BrandingAssetKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [approvedColors, setApprovedColors] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [emailSenderName, setEmailSenderName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [reportIdentity, setReportIdentity] = useState("");
  const [documentFooter, setDocumentFooter] = useState("");
  const [logoDocumentId, setLogoDocumentId] = useState<string | null>(null);
  const [logoDarkDocumentId, setLogoDarkDocumentId] = useState<string | null>(null);
  const [iconDocumentId, setIconDocumentId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoDarkPreviewUrl, setLogoDarkPreviewUrl] = useState<string | null>(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);

  const applyRow = useCallback((row: TenantBrandingRow | null) => {
    setDisplayName(asText(row?.displayName));
    setShortName(asText(row?.shortName));
    setPrimaryColor(asText(row?.primaryColor));
    setSecondaryColor(asText(row?.secondaryColor));
    setAccentColor(asText(row?.accentColor));
    setApprovedColors((row?.approvedColorsJson ?? []).join(", "));
    setContactName(asText(row?.contactName));
    setContactPhone(asText(row?.contactPhone));
    setEmailSenderName(asText(row?.emailSenderName));
    setSupportEmail(asText(row?.supportEmail));
    setReportIdentity(asText(row?.reportIdentity));
    setDocumentFooter(asText(row?.documentFooter));
    setLogoDocumentId(row?.logoDocumentId ?? null);
    setLogoDarkDocumentId(row?.logoDarkDocumentId ?? null);
    setIconDocumentId(row?.iconDocumentId ?? null);
  }, []);

  const setPreview = useCallback((kind: BrandingAssetKind, url: string | null) => {
    if (kind === "logo") setLogoPreviewUrl(url);
    else if (kind === "logo_dark") setLogoDarkPreviewUrl(url);
    else setIconPreviewUrl(url);
  }, []);

  const loadPreview = useCallback(
    async (documentId: string | null, kind: BrandingAssetKind) => {
      if (!tenantId || !documentId) {
        setPreview(kind, null);
        return;
      }
      try {
        const row = await apiGet<BrandingAssetDownload>(
          `/api/v1/tenants/${tenantId}/branding/assets/${documentId}/download-url`,
        );
        setPreview(kind, row.downloadUrl);
      } catch {
        setPreview(kind, null);
      }
    },
    [tenantId, setPreview],
  );

  const load = useCallback(async () => {
    if (!tenantId || !canEdit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await apiGet<TenantBrandingRow | null>(`/api/v1/tenants/${tenantId}/branding`);
      applyRow(row);
      await Promise.all([
        loadPreview(row?.logoDocumentId ?? null, "logo"),
        loadPreview(row?.logoDarkDocumentId ?? null, "logo_dark"),
        loadPreview(row?.iconDocumentId ?? null, "icon"),
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load branding");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canEdit, applyRow, loadPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  function brandingPayload(overrides?: {
    logoDocumentId?: string | null;
    logoDarkDocumentId?: string | null;
    iconDocumentId?: string | null;
  }) {
    return {
      displayName: displayName.trim() || null,
      shortName: shortName.trim() || null,
      primaryColor: primaryColor.trim() || null,
      secondaryColor: secondaryColor.trim() || null,
      accentColor: accentColor.trim() || null,
      approvedColorsJson: approvedColors
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      emailSenderName: emailSenderName.trim() || null,
      supportEmail: supportEmail.trim() || null,
      reportIdentity: reportIdentity.trim() || null,
      documentFooter: documentFooter.trim() || null,
      logoDocumentId:
        overrides && "logoDocumentId" in overrides ? overrides.logoDocumentId : logoDocumentId,
      logoDarkDocumentId:
        overrides && "logoDarkDocumentId" in overrides
          ? overrides.logoDarkDocumentId
          : logoDarkDocumentId,
      iconDocumentId:
        overrides && "iconDocumentId" in overrides ? overrides.iconDocumentId : iconDocumentId,
    };
  }

  function overrideForKind(kind: BrandingAssetKind, documentId: string | null) {
    if (kind === "logo") return { logoDocumentId: documentId };
    if (kind === "logo_dark") return { logoDarkDocumentId: documentId };
    return { iconDocumentId: documentId };
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiSend<TenantBrandingRow>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayload(),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyRow(updated);
      setMessage("Company branding saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save branding");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadAsset(kind: BrandingAssetKind, file: File | null) {
    if (!tenantId || !canEdit || !file) return;
    setError(null);
    setMessage(null);

    if (!ALLOWED_MIME.has(file.type)) {
      setError("Logo/icon must be PNG, JPEG, WebP, GIF, or SVG.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Logo/icon must be between 1 byte and 5 MB.");
      return;
    }

    setUploadingKind(kind);
    try {
      const upload = await apiSend<BrandingAssetUpload>(
        `/api/v1/tenants/${tenantId}/branding/assets/upload-url`,
        "POST",
        {
          kind,
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
        brandingPayload(overrideForKind(kind, upload.documentId)),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyRow(updated);
      await loadPreview(documentIdForKind(updated, kind), kind);
      setMessage(`${ASSET_META[kind].label} uploaded.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to upload ${ASSET_META[kind].label}`);
    } finally {
      setUploadingKind(null);
    }
  }

  async function onClearAsset(kind: BrandingAssetKind) {
    if (!tenantId || !canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiSend<TenantBrandingRow>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayload(overrideForKind(kind, null)),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyRow(updated);
      setPreview(kind, null);
      setMessage(`${ASSET_META[kind].label} cleared.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to clear ${ASSET_META[kind].label}`);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <p className="text-muted mb-0">Loading branding…</p>;
  }

  if (!canEdit) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        You need configuration update permission to edit company branding.
      </div>
    );
  }

  const assetState: Record<
    BrandingAssetKind,
    { documentId: string | null; previewUrl: string | null }
  > = {
    logo: { documentId: logoDocumentId, previewUrl: logoPreviewUrl },
    logo_dark: { documentId: logoDarkDocumentId, previewUrl: logoDarkPreviewUrl },
    icon: { documentId: iconDocumentId, previewUrl: iconPreviewUrl },
  };

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Organization</p>
        <h1 className="h4 mb-1">Branding</h1>
        <p className="text-muted mb-0">
          Company logos, icon, colors, and identity for this tenant — emails, reports, and
          documents.
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

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <h2 className="h6 mb-3">Logos and icon</h2>
          <p className="text-muted small mb-3">
            Upload PNG, JPEG, WebP, GIF, or SVG up to 5 MB. Light and dark logos swap with the
            theme; the icon stays available for compact surfaces. Files stay private to this
            company.
          </p>
          <div className="row g-4">
            {(["logo", "logo_dark", "icon"] as const).map((kind) => {
              const meta = ASSET_META[kind];
              const state = assetState[kind];
              const inputId = `brand-${kind}-file`;
              return (
                <div className="col-md-4" key={kind}>
                  <label className="form-label d-block">{meta.label}</label>
                  <p className="text-muted small mb-2">{meta.hint}</p>
                  <div className="mb-3">
                    {state.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={state.previewUrl}
                        alt={`${meta.label} preview`}
                        style={{
                          maxWidth: meta.previewMaxWidth,
                          maxHeight: meta.previewMaxHeight,
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <p className="text-muted small mb-0">No file uploaded.</p>
                    )}
                  </div>
                  <input
                    id={inputId}
                    className="d-none"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    disabled={busy || uploadingKind !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onUploadAsset(kind, file);
                    }}
                  />
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={busy || uploadingKind !== null}
                      onClick={() => document.getElementById(inputId)?.click()}
                    >
                      {uploadingKind === kind ? "Uploading…" : "Upload"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={busy || !state.documentId || uploadingKind !== null}
                      onClick={() => void onClearAsset(kind)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <form className="card border shadow-none" onSubmit={onSave}>
        <div className="card-body">
          <h2 className="h6 mb-3">Company identity</h2>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-display-name">
                Display name
              </label>
              <input
                id="brand-display-name"
                className="form-control"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Acme Safety Co."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-short-name">
                Short name
              </label>
              <input
                id="brand-short-name"
                className="form-control"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Acme"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="brand-primary">
                Primary color
              </label>
              <input
                id="brand-primary"
                className="form-control"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#14532d"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="brand-secondary">
                Secondary color
              </label>
              <input
                id="brand-secondary"
                className="form-control"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="brand-accent">
                Accent color
              </label>
              <input
                id="brand-accent"
                className="form-control"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="brand-approved-colors">
                Approved colors
              </label>
              <input
                id="brand-approved-colors"
                className="form-control"
                value={approvedColors}
                onChange={(e) => setApprovedColors(e.target.value)}
                placeholder="#14532d, #166534"
              />
              <div className="form-text">Comma-separated hex values.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-contact-name">
                Contact name
              </label>
              <input
                id="brand-contact-name"
                className="form-control"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-contact-phone">
                Contact phone
              </label>
              <input
                id="brand-contact-phone"
                className="form-control"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-email-sender">
                Email sender name
              </label>
              <input
                id="brand-email-sender"
                className="form-control"
                value={emailSenderName}
                onChange={(e) => setEmailSenderName(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-support-email">
                Support email
              </label>
              <input
                id="brand-support-email"
                className="form-control"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="brand-report-identity">
                Report identity
              </label>
              <input
                id="brand-report-identity"
                className="form-control"
                value={reportIdentity}
                onChange={(e) => setReportIdentity(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="brand-document-footer">
                Document footer
              </label>
              <textarea
                id="brand-document-footer"
                className="form-control"
                rows={3}
                value={documentFooter}
                onChange={(e) => setDocumentFooter(e.target.value)}
              />
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mt-4">
            <button type="submit" className="btn btn-primary" disabled={busy || uploadingKind !== null}>
              {busy ? "Saving…" : "Save branding"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
