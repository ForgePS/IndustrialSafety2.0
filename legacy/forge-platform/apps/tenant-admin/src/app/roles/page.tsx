"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Role = { id: string; code: string; name: string; status: string; description: string | null };
type User = { id: string; primaryEmail: string; status: string };

function RolesInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("platform.role.assign");
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");

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
      setRoleId((c) => c || roleRows[0]?.id || "");
      setUserId((c) => c || userRows[0]?.id || "");
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
    if (!tenantId || !canAssign || !userId || !roleId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/users/${userId}/role-assignments`, "POST", {
        roleId,
      });
      setMessage("Role assigned (audited).");
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

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Roles</h1>
      <p className={styles.lead}>
        RBAC roles for this tenant · <Link href={`/permissions${q}`}>Permissions</Link> ·{" "}
        <Link href={`/studio/roles${q}`}>Studio Role Builder</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canAssign ? (
        <div className={styles.panel}>
          <h2>Assign role</h2>
          <form className={styles.form} onSubmit={onAssign}>
            <div className={styles.formRow}>
              <label htmlFor="userId">User</label>
              <select
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.primaryEmail} ({u.status})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="roleId">Role</label>
              <select
                id="roleId"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.button}
                type="submit"
                disabled={submitting || !users.length}
              >
                {submitting ? "Assigning…" : "Assign"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Roles</h2>
        {roles.length === 0 ? (
          <p className={styles.muted}>No roles.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className={styles.mono}>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function RolesPage() {
  return (
    <TenantPageGate title="Roles" permission="platform.role.assign">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <RolesInner />
      </Suspense>
    </TenantPageGate>
  );
}
