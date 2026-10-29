"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { STUDIO_NAMESPACES } from "@/components/config-studio";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

const LABELS: Record<string, string> = {
  tenant_profile: "Tenant Profile",
  organization_profile: "Organization Profile",
  branding: "Branding",
  navigation: "Navigation Editor",
  terminology: "Terminology Manager",
  modules: "Module Manager",
  features: "Feature Manager",
  dropdowns: "Dropdown Manager",
  custom_fields: "Custom Field Builder",
  forms: "Form Builder",
  workflows: "Workflow Builder",
  roles: "Role Builder",
  permissions: "Permission Manager",
  notification_templates: "Notification Templates",
  email_templates: "Email Templates",
  document_templates: "Document Templates",
  certificate_templates: "Certificate Templates",
  dashboards: "Dashboard Builder",
  reporting: "Reporting Configuration",
  import_config: "Import Configuration",
  export_config: "Export Configuration",
  security: "Security Configuration",
  retention: "Retention Policies",
  business_hours: "Business Hours",
  holiday_calendar: "Holiday Calendar",
  facilities: "Facilities",
  locations: "Locations",
};

function Inner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canUpdate =
    hasPermission("platform.configuration.update") || hasPermission("tenant.configuration.update");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seed = useCallback(async () => {
    if (!tenantId || !canUpdate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ created: string[] }>(
        `/api/v1/tenants/${tenantId}/config/ensure-defaults`,
        "POST",
      );
      setMessage(
        result.created.length
          ? `Seeded drafts for: ${result.created.join(", ")}`
          : "All namespaces already have objects",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }, [tenantId, canUpdate]);

  useEffect(() => {
    void seed();
  }, [seed]);

  async function exportBundle() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const bundle = await apiGet<unknown>(`/api/v1/tenants/${tenantId}/config-export`);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forge-config-${tenantId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function importBundle(file: File) {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const body = JSON.parse(text) as unknown;
      const result = await apiSend<{ imported: string[] }>(
        `/api/v1/tenants/${tenantId}/config-import`,
        "POST",
        body,
      );
      setMessage(`Imported: ${result.imported.join(", ") || "(none)"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Configuration Studio</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Configuration Studio</h1>
      <p className={styles.lead}>
        Versioned tenant configuration for <span className={styles.mono}>{tenantId}</span>. Every
        module supports Draft, Published, Scheduled, Archived, compare, rollback, and audit.
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <div className={styles.panel}>
        <h2>Bundle import / export</h2>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void exportBundle()}
          >
            Export JSON
          </button>
          <label className={styles.buttonSecondary} style={{ cursor: "pointer" }}>
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBundle(file);
              }}
            />
          </label>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={busy}
            onClick={() => void seed()}
          >
            Ensure defaults
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Modules</h2>
        <ul>
          {STUDIO_NAMESPACES.map((namespace) => (
            <li key={namespace}>
              <Link href={`/studio/${namespace.replace(/_/g, "-")}${tenantQuery(tenantId)}`}>
                {LABELS[namespace] ?? namespace}
              </Link>
              <span className={styles.muted}> · {namespace}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.muted}>Loading…</p>
        </main>
      }
    >
      <Inner />
    </Suspense>
  );
}
