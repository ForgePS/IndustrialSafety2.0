"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  activateMembership,
  createMembership,
  getMembership,
  listMemberships,
  revokeMembership,
  suspendMembership,
  toIfMatch,
  type Membership,
} from "@/lib/api";
import styles from "../page.module.css";

const PAGE_SIZE = 10;

function MembershipsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("platform.membership.read");
  const canManage = hasPermission("platform.membership.manage");

  const [items, setItems] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("email");
  const [page, setPage] = useState(1);

  const [userId, setUserId] = useState("");
  const [createStatus, setCreateStatus] = useState<"PENDING" | "ACTIVE">("PENDING");

  const [actionTarget, setActionTarget] = useState<{
    membership: Membership;
    action: "suspend" | "revoke" | "activate";
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const query = filter ? { status: filter } : undefined;
      setItems(await listMemberships(tenantId, query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memberships");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sort]);

  const filtered = useMemo(() => {
    const searched = filterBySearch(items, search, [
      (row) => row.email,
      (row) => row.status,
      (row) => row.userId,
      (row) => row.id,
    ]);
    return sortByField(searched, sort, {
      email: (row) => row.email,
      status: (row) => row.status,
      "created-desc": (row) => -Date.parse(row.createdAt),
    });
  }, [items, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      await createMembership(
        tenantId,
        { userId: userId.trim(), status: createStatus },
        { idempotencyKey: crypto.randomUUID() },
      );
      setUserId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create membership");
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmAction() {
    if (!tenantId || !actionTarget) return;
    setActionBusy(true);
    setError(null);
    try {
      const fresh = await getMembership(tenantId, actionTarget.membership.id);
      const ifMatch = fresh.etag ?? toIfMatch(fresh.data.recordVersion);
      if (actionTarget.action === "suspend") {
        if (!actionReason.trim()) {
          setError("Suspend requires a reason");
          return;
        }
        await suspendMembership(tenantId, actionTarget.membership.id, actionReason.trim(), ifMatch);
      } else if (actionTarget.action === "revoke") {
        if (!actionReason.trim()) {
          setError("Revoke requires a reason");
          return;
        }
        await revokeMembership(tenantId, actionTarget.membership.id, actionReason.trim(), ifMatch);
      } else {
        await activateMembership(tenantId, actionTarget.membership.id, ifMatch);
      }
      setActionTarget(null);
      setActionReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Membership action failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Memberships</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Memberships</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/audit${q}`}>Audit history</Link>
      </p>

      {!canRead ? (
        <p className={styles.error}>Missing permission: platform.membership.read</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create membership</h2>
          <form className={styles.form} onSubmit={onCreate}>
            <div className={styles.formRow}>
              <label htmlFor="userId">User ID</label>
              <input
                id="userId"
                required
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="UUID"
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="createStatus">Initial status</label>
              <select
                id="createStatus"
                value={createStatus}
                onChange={(event) => setCreateStatus(event.target.value as "PENDING" | "ACTIVE")}
              >
                <option value="PENDING">PENDING</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create membership"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Memberships</h2>
        {canRead ? (
          <ListControls
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            filterOptions={[
              { value: "", label: "All statuses" },
              { value: "PENDING", label: "PENDING" },
              { value: "ACTIVE", label: "ACTIVE" },
              { value: "SUSPENDED", label: "SUSPENDED" },
              { value: "REVOKED", label: "REVOKED" },
              { value: "EXPIRED", label: "EXPIRED" },
            ]}
            onFilterChange={setFilter}
            sort={sort}
            sortOptions={[
              { value: "email", label: "Email" },
              { value: "status", label: "Status" },
              { value: "created-desc", label: "Newest first" },
            ]}
            onSortChange={setSort}
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        ) : null}

        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && canRead && filtered.length === 0 ? (
          <p className={styles.muted}>No memberships match your filters.</p>
        ) : null}

        {canRead && pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>User status</th>
                <th>Default tenant</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.status}</td>
                  <td>{row.userStatus}</td>
                  <td>{row.isDefaultTenant ? "Yes" : "No"}</td>
                  <td>
                    <div className={styles.actions}>
                      {canManage && row.status === "ACTIVE" ? (
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => setActionTarget({ membership: row, action: "suspend" })}
                        >
                          Suspend
                        </button>
                      ) : null}
                      {canManage && row.status === "SUSPENDED" ? (
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => setActionTarget({ membership: row, action: "activate" })}
                        >
                          Activate
                        </button>
                      ) : null}
                      {canManage && ["PENDING", "ACTIVE", "SUSPENDED"].includes(row.status) ? (
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => setActionTarget({ membership: row, action: "revoke" })}
                        >
                          Revoke
                        </button>
                      ) : null}
                      {!canManage ? "—" : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(actionTarget)}
        title={
          actionTarget?.action === "suspend"
            ? "Suspend membership"
            : actionTarget?.action === "revoke"
              ? "Revoke membership"
              : "Activate membership"
        }
        description={
          <>
            <p>
              {actionTarget?.action === "activate"
                ? `Activate membership for ${actionTarget.membership.email}?`
                : `${actionTarget?.action === "suspend" ? "Suspend" : "Revoke"} membership for ${actionTarget?.membership.email}?`}
            </p>
            {actionTarget?.action !== "activate" ? (
              <div className={styles.formRow}>
                <label htmlFor="actionReason">Reason</label>
                <input
                  id="actionReason"
                  required
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                />
              </div>
            ) : null}
          </>
        }
        confirmLabel={
          actionTarget?.action === "suspend"
            ? "Suspend"
            : actionTarget?.action === "revoke"
              ? "Revoke"
              : "Activate"
        }
        danger={actionTarget?.action !== "activate"}
        busy={actionBusy}
        onConfirm={() => void onConfirmAction()}
        onCancel={() => {
          setActionTarget(null);
          setActionReason("");
        }}
      />
    </section>
  );
}

export default function MembershipsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <MembershipsInner />
    </Suspense>
  );
}
