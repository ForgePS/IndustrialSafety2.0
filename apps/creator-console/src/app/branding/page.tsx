"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Branding = {
  id: string;
  displayName: string | null;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  approvedColorsJson: string[] | null;
  contactName: string | null;
  reportIdentity: string | null;
  documentFooter: string | null;
  emailSenderName: string | null;
  supportEmail: string | null;
  customCssEnabled: boolean;
  logoDocumentId: string | null;
  iconDocumentId: string | null;
  recordVersion?: number;
};

type BrandingAssetUpload = {
  documentId: string;
  kind: "logo" | "icon";
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

function BrandingInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead =
    hasPermission("platform.configuration.update") || hasPermission("tenant.configuration.update");
  const canManage = canRead;

  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"logo" | "icon" | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [approvedColors, setApprovedColors] = useState("");
  const [contactName, setContactName] = useState("");
  const [emailSenderName, setEmailSenderName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [reportIdentity, setReportIdentity] = useState("");
  const [documentFooter, setDocumentFooter] = useState("");
  const [logoDocumentId, setLogoDocumentId] = useState<string | null>(null);
  const [iconDocumentId, setIconDocumentId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);

  const applyBranding = useCallback((row: Branding | null) => {
    setDisplayName(row?.displayName ?? "");
    setShortName(row?.shortName ?? "");
    setPrimaryColor(row?.primaryColor ?? "");
    setSecondaryColor(row?.secondaryColor ?? "");
    setAccentColor(row?.accentColor ?? "");
    setApprovedColors((row?.approvedColorsJson ?? []).join(", "));
    setContactName(row?.contactName ?? "");
    setEmailSenderName(row?.emailSenderName ?? "");
    setSupportEmail(row?.supportEmail ?? "");
    setReportIdentity(row?.reportIdentity ?? "");
    setDocumentFooter(row?.documentFooter ?? "");
    setLogoDocumentId(row?.logoDocumentId ?? null);
    setIconDocumentId(row?.iconDocumentId ?? null);
  }, []);

  const loadPreview = useCallback(
    async (documentId: string | null, kind: "logo" | "icon") => {
      if (!tenantId || !documentId) {
        if (kind === "logo") setLogoPreviewUrl(null);
        else setIconPreviewUrl(null);
        return;
      }
      try {
        const row = await apiGet<BrandingAssetDownload>(
          `/api/v1/tenants/${tenantId}/branding/assets/${documentId}/download-url`,
        );
        if (kind === "logo") setLogoPreviewUrl(row.downloadUrl);
        else setIconPreviewUrl(row.downloadUrl);
      } catch {
        if (kind === "logo") setLogoPreviewUrl(null);
        else setIconPreviewUrl(null);
      }
    },
    [tenantId],
  );

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const row = await apiGet<Branding | null>(`/api/v1/tenants/${tenantId}/branding`);
      applyBranding(row);
      await Promise.all([
        loadPreview(row?.logoDocumentId ?? null, "logo"),
        loadPreview(row?.iconDocumentId ?? null, "icon"),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branding");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead, applyBranding, loadPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  function brandingPayload(overrides?: {
    logoDocumentId?: string | null;
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
      emailSenderName: emailSenderName.trim() || null,
      supportEmail: supportEmail.trim() || null,
      reportIdentity: reportIdentity.trim() || null,
      documentFooter: documentFooter.trim() || null,
      logoDocumentId:
        overrides && "logoDocumentId" in overrides ? overrides.logoDocumentId : logoDocumentId,
      iconDocumentId:
        overrides && "iconDocumentId" in overrides ? overrides.iconDocumentId : iconDocumentId,
    };
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await apiSend<Branding>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayload(),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyBranding(updated);
      setStatus("Branding saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUploadAsset(kind: "logo" | "icon", file: File | null) {
    if (!tenantId || !canManage || !file) return;
    setError(null);
    setStatus(null);

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

      const updated = await apiSend<Branding>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayload(
          kind === "logo"
            ? { logoDocumentId: upload.documentId }
            : { iconDocumentId: upload.documentId },
        ),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyBranding(updated);
      await loadPreview(kind === "logo" ? updated.logoDocumentId : updated.iconDocumentId, kind);
      setStatus(`${kind === "logo" ? "Logo" : "Icon"} uploaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to upload ${kind}`);
    } finally {
      setUploadingKind(null);
    }
  }

  async function onClearAsset(kind: "logo" | "icon") {
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await apiSend<Branding>(
        `/api/v1/tenants/${tenantId}/branding`,
        "PUT",
        brandingPayload(kind === "logo" ? { logoDocumentId: null } : { iconDocumentId: null }),
        { idempotencyKey: crypto.randomUUID() },
      );
      applyBranding(updated);
      if (kind === "logo") setLogoPreviewUrl(null);
      else setIconPreviewUrl(null);
      setStatus(`${kind === "logo" ? "Logo" : "Icon"} cleared.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to clear ${kind}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Branding</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Branding</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/configuration${tenantQuery(tenantId)}`}>Configuration</Link> ·{" "}
        <Link href={`/audit${tenantQuery(tenantId)}`}>Audit history</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.success}>{status}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canRead ? (
        <div className={styles.panel}>
          <h2>Logo and icon</h2>
          <p className={styles.muted}>
            Upload PNG, JPEG, WebP, GIF, or SVG up to 5 MB. Files are stored privately and linked to
            this tenant.
          </p>

          <div className={styles.form}>
            <div className={styles.formRow}>
              <label htmlFor="logoFile">Logo</label>
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt="Tenant logo preview"
                  style={{ maxWidth: "12rem", maxHeight: "4rem", objectFit: "contain" }}
                />
              ) : (
                <p className={styles.muted}>No logo uploaded.</p>
              )}
              <input
                id="logoFile"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                disabled={!canManage || uploadingKind !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onUploadAsset("logo", file);
                }}
              />
              <div className={styles.actions}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={!canManage || !logoDocumentId || submitting || uploadingKind !== null}
                  onClick={() => void onClearAsset("logo")}
                >
                  Remove logo
                </button>
                {uploadingKind === "logo" ? <span className={styles.muted}>Uploading…</span> : null}
              </div>
            </div>

            <div className={styles.formRow}>
              <label htmlFor="iconFile">Icon</label>
              {iconPreviewUrl ? (
                <img
                  src={iconPreviewUrl}
                  alt="Tenant icon preview"
                  style={{ maxWidth: "4rem", maxHeight: "4rem", objectFit: "contain" }}
                />
              ) : (
                <p className={styles.muted}>No icon uploaded.</p>
              )}
              <input
                id="iconFile"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                disabled={!canManage || uploadingKind !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onUploadAsset("icon", file);
                }}
              />
              <div className={styles.actions}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={!canManage || !iconDocumentId || submitting || uploadingKind !== null}
                  onClick={() => void onClearAsset("icon")}
                >
                  Remove icon
                </button>
                {uploadingKind === "icon" ? <span className={styles.muted}>Uploading…</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {canRead ? (
        <div className={styles.panel}>
          <h2>Branding settings</h2>
          <form className={styles.form} onSubmit={onSave}>
            <div className={styles.formRow}>
              <label htmlFor="displayName">Name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="shortName">Short name</label>
              <input
                id="shortName"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="primaryColor">Primary color</label>
              <input
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#14532d"
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="secondaryColor">Secondary color</label>
              <input
                id="secondaryColor"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="accentColor">Accent color</label>
              <input
                id="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="approvedColors">Approved colors</label>
              <input
                id="approvedColors"
                value={approvedColors}
                onChange={(e) => setApprovedColors(e.target.value)}
                placeholder="#14532d, #166534"
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contactName">Contact</label>
              <input
                id="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="emailSenderName">Email sender name</label>
              <input
                id="emailSenderName"
                value={emailSenderName}
                onChange={(e) => setEmailSenderName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="supportEmail">Support email</label>
              <input
                id="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="reportIdentity">Report identity</label>
              <input
                id="reportIdentity"
                value={reportIdentity}
                onChange={(e) => setReportIdentity(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="documentFooter">Document footer</label>
              <textarea
                id="documentFooter"
                value={documentFooter}
                onChange={(e) => setDocumentFooter(e.target.value)}
                rows={3}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting || !canManage}>
                {submitting ? "Saving…" : canManage ? "Save branding" : "Read only"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default function BrandingPage() {
  return (
    <PlatformPageGate
      title="Branding"
      anyOf={["platform.configuration.update", "tenant.configuration.update"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <BrandingInner />
      </Suspense>
    </PlatformPageGate>
  );
}
