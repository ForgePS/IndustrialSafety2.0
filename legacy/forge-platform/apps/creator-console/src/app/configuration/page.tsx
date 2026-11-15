"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { TenantRequired } from "@/components/tenant-required";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Setting = {
  id: string;
  namespace: string;
  settingKey: string;
  valueJson: unknown;
  isSensitive: boolean;
  schemaVersion: number;
};

type Branding = {
  id: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  emailSenderName: string | null;
  supportEmail: string | null;
  customCssEnabled: boolean;
  logoDocumentId: string | null;
  iconDocumentId: string | null;
} | null;

function ConfigurationInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [settings, setSettings] = useState<Setting[]>([]);
  const [branding, setBranding] = useState<Branding>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [config, brand] = await Promise.all([
        apiGet<Setting[]>(`/api/v1/tenants/${tenantId}/configuration`),
        apiGet<Branding>(`/api/v1/tenants/${tenantId}/branding`),
      ]);
      setSettings(config);
      setBranding(brand);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Configuration</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Configuration</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={tenantDetailHref(tenantId)}>Tenant detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      <div className={styles.panel}>
        <h2>Branding</h2>
        {!loading && !branding ? <p className={styles.muted}>No branding configured.</p> : null}
        {branding ? (
          <dl className={styles.dl}>
            <dt>Primary</dt>
            <dd>{branding.primaryColor ?? "—"}</dd>
            <dt>Secondary</dt>
            <dd>{branding.secondaryColor ?? "—"}</dd>
            <dt>Accent</dt>
            <dd>{branding.accentColor ?? "—"}</dd>
            <dt>Email sender</dt>
            <dd>{branding.emailSenderName ?? "—"}</dd>
            <dt>Support email</dt>
            <dd>{branding.supportEmail ?? "—"}</dd>
            <dt>Custom CSS</dt>
            <dd>{branding.customCssEnabled ? "enabled" : "disabled"}</dd>
          </dl>
        ) : null}
      </div>

      <div className={styles.panel}>
        <h2>Settings</h2>
        {!loading && settings.length === 0 ? (
          <p className={styles.muted}>No configuration settings.</p>
        ) : null}
        {settings.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Namespace</th>
                <th>Key</th>
                <th>Value</th>
                <th>Sensitive</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((row) => (
                <tr key={row.id}>
                  <td className={styles.mono}>{row.namespace}</td>
                  <td className={styles.mono}>{row.settingKey}</td>
                  <td className={styles.mono}>
                    {row.isSensitive ? "••••" : JSON.stringify(row.valueJson)}
                  </td>
                  <td>{row.isSensitive ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <ConfigurationInner />
    </Suspense>
  );
}
