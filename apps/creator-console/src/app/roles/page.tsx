"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import { TenantRequired } from "@/components/tenant-required";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Role = {
  id: string;
  code: string;
  name: string;
  status: string;
  description: string | null;
};

type User = {
  id: string;
  primaryEmail: string;
  status: string;
};

function RolesInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [roleRows, userRows] = await Promise.all([
        apiGet<Role[]>(`/api/v1/tenants/${tenantId}/roles`),
        apiGet<User[]>(`/api/v1/tenants/${tenantId}/users`),
      ]);
      setRoles(roleRows);
      setUsers(userRows);
      setRoleId((current) => current || roleRows[0]?.id || "");
      setUserId((current) => current || userRows[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAssign(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !userId || !roleId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/users/${userId}/role-assignments`, "POST", {
        roleId,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setMessage("Role assigned.");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Roles</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Roles</h1>
      <p className={styles.lead}>
        Security · Roles · Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={tenantDetailHref(tenantId)}>Customer detail</Link> ·{" "}
        <Link href={`/users?tenantId=${encodeURIComponent(tenantId)}`}>Users</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <div className={styles.panel}>
        <h2>Assign role</h2>
        <form className={styles.form} onSubmit={onAssign}>
          <div className={styles.formRow}>
            <label htmlFor="userId">User</label>
            <select id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.primaryEmail} ({u.status})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="roleId">Role</label>
            <select id="roleId" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="reason">Reason (optional)</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting || !users.length}>
              {submitting ? "Assigning…" : "Assign"}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.panel}>
        <h2>Roles</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && roles.length === 0 ? (
          <p className={styles.muted}>No roles for this tenant.</p>
        ) : null}
        {roles.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className={styles.mono}>{role.code}</td>
                  <td>{role.name}</td>
                  <td>{role.status}</td>
                  <td>{role.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <RolesInner />
    </Suspense>
  );
}
