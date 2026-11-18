"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Branding = {
  displayName: string | null;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  approvedColorsJson: string[] | null;
  contactName: string | null;
  contactPhone: string | null;
  supportEmail: string | null;
  emailSenderName: string | null;
  reportIdentity: string | null;
  documentFooter: string | null;
  logoDocumentId: string | null;
  iconDocumentId: string | null;
};

function BrandingInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canApi =
    hasPermission("platform.configuration.update") || hasPermission("tenant.configuration.update");
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [approvedColors, setApprovedColors] = useState("");
  const [contactName, setContactName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [reportIdentity, setReportIdentity] = useState("");
  const [documentFooter, setDocumentFooter] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !canApi) return;
    setLoading(true);
    setError(null);
    try {
      const row = await apiGet<Branding | null>(`/api/v1/tenants/${tenantId}/branding`);
      setBranding(row);
      setDisplayName(row?.displayName ?? "");
      setShortName(row?.shortName ?? "");
      setPrimaryColor(row?.primaryColor ?? "");
      setApprovedColors((row?.approvedColorsJson ?? []).join(", "));
      setContactName(row?.contactName ?? "");
      setSupportEmail(row?.supportEmail ?? "");
      setReportIdentity(row?.reportIdentity ?? "");
      setDocumentFooter(row?.documentFooter ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branding API");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canApi]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canApi) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/branding`, "PUT", {
        displayName: displayName || null,
        shortName: shortName || null,
        primaryColor: primaryColor || null,
        approvedColorsJson: approvedColors
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        contactName: contactName || null,
        supportEmail: supportEmail || null,
        reportIdentity: reportIdentity || null,
        documentFooter: documentFooter || null,
      });
      setMessage("Branding saved (audited). Logo/icon IDs must be tenant-owned documents.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
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

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Branding</h1>
      <p className={styles.lead}>
        Tenant brand identity and owned logo/icon references. Assets stay under{" "}
        <span className={styles.mono}>tenants/{"{tenantId}"}/branding/</span>.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canApi ? (
        <div className={styles.panel}>
          <h2>Branding API</h2>
          {branding ? (
            <dl className={styles.dl}>
              <dt>Logo document</dt>
              <dd className={styles.mono}>{branding.logoDocumentId ?? "—"}</dd>
              <dt>Icon document</dt>
              <dd className={styles.mono}>{branding.iconDocumentId ?? "—"}</dd>
            </dl>
          ) : (
            <p className={styles.muted}>No branding row yet.</p>
          )}
          <form className={styles.form} onSubmit={onSave} style={{ marginTop: "1rem" }}>
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
              <label htmlFor="approvedColors">Approved colors (comma-separated)</label>
              <input
                id="approvedColors"
                value={approvedColors}
                onChange={(e) => setApprovedColors(e.target.value)}
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
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className={styles.panel}>
          <p className={styles.muted}>
            Requires platform.configuration.update or tenant.configuration.update.
          </p>
        </div>
      )}

      <nav className={styles.linkRow}>
        <Link href={`/studio/branding${q}`}>Studio · Branding</Link>
      </nav>
    </section>
  );
}

export default function BrandingPage() {
  return (
    <TenantPageGate
      title="Branding"
      anyOf={["tenant.configuration.update", "platform.configuration.update"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <BrandingInner />
      </Suspense>
    </TenantPageGate>
  );
}
