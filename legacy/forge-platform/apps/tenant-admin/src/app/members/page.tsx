"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  activateMembership,
  getMembership,
  listMemberships,
  revokeMembership,
  suspendMembership,
  toIfMatch,
  type Membership,
} from "@/lib/api";
import styles from "../page.module.css";

const PAGE_SIZE = 25;

function MembersInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("platform.membership.manage");
  const [items, setItems] = useState<Membership[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const gen = ++generation.current;
    setItems([]);
    setPage(1);
    setLoading(true);
    setError(null);
    try {
      const rows = await listMemberships(tenantId);
      if (gen !== generation.current) return;
      setItems(rows);
    } catch (err) {
      if (gen !== generation.current) return;
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  async function runAction(membership: Membership, action: "activate" | "suspend" | "revoke") {
    if (!tenantId || !canManage) return;
    if ((action === "suspend" || action === "revoke") && !reason.trim()) {
      setError(`${action} requires a reason`);
      return;
    }
    setBusyId(membership.id);
    setError(null);
    try {
      const fresh = await getMembership(tenantId, membership.id);
      const ifMatch = fresh.etag ?? toIfMatch(fresh.data.recordVersion);
      if (action === "activate") {
        await activateMembership(tenantId, membership.id, ifMatch);
      } else if (action === "suspend") {
        await suspendMembership(tenantId, membership.id, reason.trim(), ifMatch);
      } else {
        await revokeMembership(tenantId, membership.id, reason.trim(), ifMatch);
      }
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Membership action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Members</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Members</h1>
      <p className={styles.lead}>
        Tenant memberships · <Link href={`/invitations${q}`}>Invitations</Link> ·{" "}
        <Link href={`/roles${q}`}>Roles</Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Action reason</h2>
          <div className={styles.formRow}>
            <label htmlFor="reason">Required for suspend / revoke</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Memberships</h2>
        {items.length === 0 ? (
          <p className={styles.muted}>No memberships.</p>
        ) : (
          <>
            <div className={styles.actions} style={{ marginBottom: "0.75rem" }}>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className={styles.muted}>
                Page {page} / {pageCount} · {items.length} total
              </span>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>User status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>{row.status}</td>
                    <td>{row.userStatus}</td>
                    <td>
                      {canManage ? (
                        <div className={styles.actions}>
                          <button
                            className={styles.buttonSecondary}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void runAction(row, "activate")}
                          >
                            Activate
                          </button>
                          <button
                            className={styles.buttonSecondary}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void runAction(row, "suspend")}
                          >
                            Suspend
                          </button>
                          <button
                            className={styles.buttonDanger}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void runAction(row, "revoke")}
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
          </>
        )}
      </div>
    </section>
  );
}

export default function MembersPage() {
  return (
    <TenantPageGate title="Members" permission="platform.membership.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <MembersInner />
      </Suspense>
    </TenantPageGate>
  );
}
