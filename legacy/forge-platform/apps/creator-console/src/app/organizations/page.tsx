"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { TenantRequired } from "@/components/tenant-required";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Organization = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  status: string;
  email: string | null;
};

const ORG_TYPES = [
  "FIRE_DEPARTMENT",
  "FIRE_ACADEMY",
  "MUNICIPALITY",
  "WATER_UTILITY",
  "VENDOR",
  "SAFETY_COMPANY",
  "ENTERPRISE_CUSTOMER",
  "OTHER",
];

function OrganizationsInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [organizationTypeCode, setOrganizationTypeCode] = useState("FIRE_DEPARTMENT");
  const [slug, setSlug] = useState("");
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<Organization[]>(`/api/v1/tenants/${tenantId}/organizations`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/organizations`, "POST", {
        organizationTypeCode,
        slug,
        legalName,
        displayName,
      });
      setSlug("");
      setLegalName("");
      setDisplayName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Organizations</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Organizations</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={tenantDetailHref(tenantId)}>Tenant detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>Create organization</h2>
        <form className={styles.form} onSubmit={onCreate}>
          <div className={styles.formRow}>
            <label htmlFor="organizationTypeCode">Type</label>
            <select
              id="organizationTypeCode"
              value={organizationTypeCode}
              onChange={(e) => setOrganizationTypeCode(e.target.value)}
            >
              {ORG_TYPES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9][a-z0-9-]*"
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
        <h2>Organizations</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && items.length === 0 ? (
          <p className={styles.muted}>No organizations yet.</p>
        ) : null}
        {items.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {items.map((org) => (
                <tr key={org.id}>
                  <td>{org.displayName}</td>
                  <td className={styles.mono}>{org.slug}</td>
                  <td>{org.status}</td>
                  <td>{org.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function OrganizationsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <OrganizationsInner />
    </Suspense>
  );
}
