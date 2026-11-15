"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import styles from "../page.module.css";

export default function SelectTenantPage() {
  const router = useRouter();
  const { me, loading, error, chooseTenant } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onSelect(tenantId: string) {
    setBusyId(tenantId);
    setActionError(null);
    try {
      await chooseTenant(tenantId);
      router.push("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to select tenant");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.page}>
      <h1>Select tenant</h1>
      <p className={styles.lead}>
        Calls <code>POST /api/v1/auth/select-tenant</code> and refreshes{" "}
        <code>GET /api/v1/auth/me</code>.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      {loading ? <p className={styles.muted}>Loading tenants…</p> : null}

      {!loading && !me ? (
        <div className={styles.panel}>
          <p className={styles.muted}>
            Not authenticated. <Link href="/login">Sign in</Link> first.
          </p>
        </div>
      ) : null}

      {me ? (
        <div className={styles.panel}>
          <h2>Available tenants</h2>
          {me.tenants.length === 0 ? (
            <p className={styles.muted}>No tenants available for this user.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Slug</th>
                  <th>Tenant status</th>
                  <th>Membership</th>
                  <th>Current</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {me.tenants.map((tenant) => (
                  <tr key={tenant.tenantId}>
                    <td>{tenant.displayName}</td>
                    <td className={styles.mono}>{tenant.slug}</td>
                    <td>{tenant.tenantStatus}</td>
                    <td>{tenant.membershipStatus}</td>
                    <td>{tenant.tenantId === me.tenantId ? "Yes" : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        disabled={!tenant.selectable || busyId === tenant.tenantId}
                        onClick={() => void onSelect(tenant.tenantId)}
                      >
                        {busyId === tenant.tenantId ? "Selecting…" : "Select"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}
