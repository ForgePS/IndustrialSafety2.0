"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Tenant = {
  id: string;
  tenantKey: string;
  slug: string;
  displayName: string;
  legalName: string;
  status: string;
  tenantType: string;
};

/** Tenant keys: lowercase start, then a-z 0-9 _ - */
function normalizeTenantKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .slice(0, 64);
}

/** Slugs: lowercase start, then a-z 0-9 - (no underscores). */
function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

export default function TenantsPage() {
  return (
    <PlatformPageGate title="Tenants" permission="platform.tenant.read">
      <TenantsInner />
    </PlatformPageGate>
  );
}

function TenantsInner() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [tenantKey, setTenantKey] = useState("");
  const [slug, setSlug] = useState("");
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenants(await apiGet<Tenant[]>("/api/v1/platform/tenants"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const key = normalizeTenantKey(tenantKey);
      const normalizedSlug = normalizeSlug(slugTouched ? slug : tenantKey);
      if (key.length < 2) {
        throw new Error(
          "Tenant key must be at least 2 characters (lowercase letters, numbers, - or _)",
        );
      }
      if (normalizedSlug.length < 2) {
        throw new Error(
          "Slug must be at least 2 characters (lowercase letters, numbers, or - only)",
        );
      }
      await apiSend<Tenant>(
        "/api/v1/platform/tenants",
        "POST",
        {
          tenantKey: key,
          slug: normalizedSlug,
          legalName: legalName.trim(),
          displayName: displayName.trim(),
          tenantType: "CUSTOMER",
          timezone: "America/Chicago",
          defaultLocale: "en-US",
          dataRegion: "us-east-1",
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      setTenantKey("");
      setSlug("");
      setLegalName("");
      setDisplayName("");
      setSlugTouched(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1>Tenants</h1>
      <p className={styles.lead}>
        Legacy path for platform tenants. Prefer <Link href="/customers/">Customers</Link> for the
        mission UX.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>Create tenant</h2>
        <p className={styles.muted}>
          Keys/slugs must be lowercase. Slug may use hyphens only (no underscores). Example key{" "}
          <code>acme-fire</code>, slug <code>acme-fire</code>.
        </p>
        <form className={styles.form} onSubmit={onCreate}>
          <div className={styles.formRow}>
            <label htmlFor="tenantKey">Tenant key</label>
            <input
              id="tenantKey"
              required
              value={tenantKey}
              onChange={(e) => {
                const next = e.target.value;
                setTenantKey(next);
                if (!slugTouched) {
                  setSlug(normalizeSlug(next));
                }
              }}
              onBlur={() => setTenantKey((v) => normalizeTenantKey(v))}
              placeholder="acme-fire"
              pattern="[a-z0-9][a-z0-9_-]*"
              title="Lowercase letters, numbers, hyphen, underscore; start with letter or number"
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => setSlug((v) => normalizeSlug(v))}
              placeholder="acme-fire"
              pattern="[a-z0-9][a-z0-9-]*"
              title="Lowercase letters, numbers, hyphen only; start with letter or number"
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="legalName">Legal name</label>
            <input
              id="legalName"
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.panel}>
        <h2>All tenants</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && tenants.length === 0 ? <p className={styles.muted}>No tenants yet.</p> : null}
        {tenants.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Key</th>
                <th>Status</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <Link href={tenantDetailHref(tenant.id)}>{tenant.displayName}</Link>
                  </td>
                  <td className={styles.mono}>{tenant.tenantKey}</td>
                  <td>{tenant.status}</td>
                  <td>{tenant.tenantType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
