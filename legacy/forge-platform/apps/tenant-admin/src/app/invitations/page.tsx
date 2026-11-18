"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type Invitation,
} from "@/lib/api";
import styles from "../page.module.css";

function InvitationsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("platform.invitation.manage");
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listInvitations({ tenantId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      await createInvitation(
        { tenantId, email: email.trim(), send: true },
        { idempotencyKey: crypto.randomUUID() },
      );
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend(id: string) {
    if (!tenantId || !canManage) return;
    setError(null);
    try {
      await resendInvitation(id, { tenantId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    }
  }

  async function onRevoke(id: string) {
    if (!tenantId || !canManage) return;
    if (!revokeReason.trim()) {
      setError("Revoke requires a reason");
      return;
    }
    setError(null);
    try {
      await revokeInvitation(id, revokeReason.trim(), { tenantId });
      setRevokeReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke");
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Invitations</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Invitations</h1>
      <p className={styles.lead}>
        Invite users to this tenant · <Link href={`/members${tenantQuery(tenantId)}`}>Members</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create invitation</h2>
          <form className={styles.form} onSubmit={onCreate}>
            <div className={styles.formRow}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
          <div className={styles.formRow} style={{ marginTop: "1rem" }}>
            <label htmlFor="revokeReason">Revoke reason</label>
            <input
              id="revokeReason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Invitations</h2>
        {items.length === 0 ? (
          <p className={styles.muted}>No invitations.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.status}</td>
                  <td className={styles.mono}>{row.createdAt}</td>
                  <td>
                    {canManage && row.status === "PENDING" ? (
                      <div className={styles.actions}>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          onClick={() => void onResend(row.id)}
                        >
                          Resend
                        </button>
                        <button
                          className={styles.buttonDanger}
                          type="button"
                          onClick={() => void onRevoke(row.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function InvitationsPage() {
  return (
    <TenantPageGate title="Invitations" permission="platform.invitation.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <InvitationsInner />
      </Suspense>
    </TenantPageGate>
  );
}
