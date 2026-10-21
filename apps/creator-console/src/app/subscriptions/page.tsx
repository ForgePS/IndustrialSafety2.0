"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  filterBySearch,
  ListControls,
  paginate,
  sortByField,
} from "@/components/list-controls";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  createSubscription,
  getCurrentSubscription,
  listPlans,
  listSubscriptions,
  patchSubscription,
  reactivateSubscription,
  suspendSubscription,
  toIfMatch,
  type SubscriptionPlan,
  type TenantSubscription,
} from "@/lib/api";
import styles from "../page.module.css";

const PAGE_SIZE = 10;
const STATUSES = ["TRIAL", "ACTIVE", "GRACE", "SUSPENDED", "CANCELED"] as const;

function SubscriptionsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("platform.entitlement.manage");

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [items, setItems] = useState<TenantSubscription[]>([]);
  const [current, setCurrent] = useState<TenantSubscription | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created-desc");
  const [page, setPage] = useState(1);

  const [planCode, setPlanCode] = useState("");
  const [createStatus, setCreateStatus] = useState<(typeof STATUSES)[number]>("TRIAL");
  const [periodDays, setPeriodDays] = useState("30");

  const [editRow, setEditRow] = useState<TenantSubscription | null>(null);
  const [editStatus, setEditStatus] = useState<(typeof STATUSES)[number]>("ACTIVE");
  const [editCancelAtEnd, setEditCancelAtEnd] = useState(false);
  const [editExternalId, setEditExternalId] = useState("");

  const [actionTarget, setActionTarget] = useState<{
    row: TenantSubscription;
    action: "suspend" | "reactivate" | "cancel";
  } | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canManage) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, planRows, currentResult] = await Promise.all([
        listSubscriptions(tenantId),
        listPlans(),
        getCurrentSubscription(tenantId).catch(() => null),
      ]);
      setItems(rows);
      setPlans(planRows);
      setCurrent(currentResult?.data ?? null);
      setPlanCode((prev) => prev || planRows[0]?.code || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const filtered = useMemo(() => {
    const searched = filterBySearch(items, search, [
      (row) => row.status,
      (row) => row.planCode ?? "",
      (row) => row.planName ?? "",
      (row) => row.id,
    ]);
    return sortByField(searched, sort, {
      "created-desc": (row) => -Date.parse(row.createdAt),
      status: (row) => row.status,
      plan: (row) => row.planCode ?? "",
    });
  }, [items, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createSubscription(
        tenantId,
        {
          planCode,
          status: createStatus,
          periodDays: Number(periodDays) || 30,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      setMessage("Subscription created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create subscription");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: TenantSubscription) {
    setEditRow(row);
    setEditStatus(row.status as (typeof STATUSES)[number]);
    setEditCancelAtEnd(row.cancelAtPeriodEnd);
    setEditExternalId(row.externalSubscriptionId ?? "");
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !editRow) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchSubscription(
        tenantId,
        editRow.id,
        {
          status: editStatus,
          cancelAtPeriodEnd: editCancelAtEnd,
          externalSubscriptionId: editExternalId.trim() || null,
        },
        toIfMatch(editRow.recordVersion),
      );
      setEditRow(null);
      setMessage("Subscription updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmAction() {
    if (!tenantId || !actionTarget) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const ifMatch = toIfMatch(actionTarget.row.recordVersion);
      if (actionTarget.action === "suspend") {
        await suspendSubscription(tenantId, actionTarget.row.id, ifMatch);
        setMessage("Subscription suspended.");
      } else if (actionTarget.action === "reactivate") {
        await reactivateSubscription(tenantId, actionTarget.row.id, ifMatch);
        setMessage("Subscription reactivated.");
      } else {
        await patchSubscription(tenantId, actionTarget.row.id, { status: "CANCELED" }, ifMatch);
        setMessage("Subscription canceled.");
      }
      setActionTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription action failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Subscriptions</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Subscriptions</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/plans/`}>Plans & pricing</Link> ·{" "}
        <Link href={`/billing${q}`}>Billing</Link> ·{" "}
        <Link href={`/customer-modules${q}`}>Company modules</Link>
      </p>

      {!canManage ? (
        <p className={styles.error}>Missing permission: platform.entitlement.manage</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create subscription</h2>
          <form className={styles.form} onSubmit={onCreate}>
            <div className={styles.formRow}>
              <label htmlFor="sub-plan">Plan</label>
              <select
                id="sub-plan"
                required
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.name} ({plan.code})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="sub-status">Initial status</label>
              <select
                id="sub-status"
                value={createStatus}
                onChange={(e) => setCreateStatus(e.target.value as (typeof STATUSES)[number])}
              >
                <option value="TRIAL">TRIAL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="GRACE">GRACE</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="sub-period">Period length (days)</label>
              <input
                id="sub-period"
                type="number"
                min="1"
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting || plans.length === 0}>
                {submitting ? "Creating…" : "Create subscription"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Current subscription</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && !current ? <p className={styles.muted}>No current subscription.</p> : null}
        {current ? (
          <dl className={styles.dl}>
            <dt>ID</dt>
            <dd className={styles.mono}>{current.id}</dd>
            <dt>Status</dt>
            <dd>{current.status}</dd>
            <dt>Plan</dt>
            <dd>
              {current.planName ?? current.planCode ?? "—"}
              {current.planCode ? ` (${current.planCode})` : ""}
            </dd>
            <dt>Billing</dt>
            <dd>{current.billingType ?? current.billingCycle ?? "—"}</dd>
            <dt>Renews</dt>
            <dd className={styles.mono}>{current.renewsAt ?? current.endsAt ?? "—"}</dd>
            <dt>Cancel at period end</dt>
            <dd>{current.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
          </dl>
        ) : null}
      </div>

      <div className={styles.panel}>
        <h2>All subscriptions</h2>
        {canManage ? (
          <ListControls
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            sortOptions={[
              { value: "created-desc", label: "Newest first" },
              { value: "status", label: "Status" },
              { value: "plan", label: "Plan" },
            ]}
            onSortChange={setSort}
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        ) : null}
        {!loading && canManage && filtered.length === 0 ? (
          <p className={styles.muted}>No subscriptions found.</p>
        ) : null}
        {canManage && pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Plan</th>
                <th>Billing</th>
                <th>Started</th>
                <th>Renews</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.status}</td>
                  <td>{row.planName ?? row.planCode ?? "—"}</td>
                  <td>{row.billingType ?? row.billingCycle ?? "—"}</td>
                  <td className={styles.mono}>{row.startedAt ?? "—"}</td>
                  <td className={styles.mono}>{row.renewsAt ?? row.endsAt ?? "—"}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      {row.status !== "SUSPENDED" && row.status !== "CANCELED" ? (
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => setActionTarget({ row, action: "suspend" })}
                        >
                          Suspend
                        </button>
                      ) : null}
                      {row.status === "SUSPENDED" ? (
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => setActionTarget({ row, action: "reactivate" })}
                        >
                          Reactivate
                        </button>
                      ) : null}
                      {row.status !== "CANCELED" ? (
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => setActionTarget({ row, action: "cancel" })}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {editRow ? (
        <div className={styles.panel}>
          <h2>Edit subscription</h2>
          <form className={styles.form} onSubmit={onSaveEdit}>
            <div className={styles.formRow}>
              <label htmlFor="edit-sub-status">Status</label>
              <select
                id="edit-sub-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as (typeof STATUSES)[number])}
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-sub-external">External subscription ID</label>
              <input
                id="edit-sub-external"
                value={editExternalId}
                onChange={(e) => setEditExternalId(e.target.value)}
                placeholder="Stripe sub_…"
              />
            </div>
            <div className={styles.formRow}>
              <label>
                <input
                  type="checkbox"
                  checked={editCancelAtEnd}
                  onChange={(e) => setEditCancelAtEnd(e.target.checked)}
                />{" "}
                Cancel at period end
              </label>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Save changes
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditRow(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={actionTarget !== null}
        title={
          actionTarget?.action === "suspend"
            ? "Suspend subscription?"
            : actionTarget?.action === "reactivate"
              ? "Reactivate subscription?"
              : "Cancel subscription?"
        }
        description={
          actionTarget?.action === "cancel"
            ? "This marks the subscription as CANCELED. Entitlements may be affected depending on your commercial rules."
            : "This change is audited and takes effect immediately for the selected tenant."
        }
        confirmLabel={
          actionTarget?.action === "suspend"
            ? "Suspend"
            : actionTarget?.action === "reactivate"
              ? "Reactivate"
              : "Cancel subscription"
        }
        danger={actionTarget?.action === "cancel"}
        busy={submitting}
        onCancel={() => setActionTarget(null)}
        onConfirm={() => void onConfirmAction()}
      />
    </section>
  );
}

export default function SubscriptionsPage() {
  return (
    <PlatformPageGate title="Subscriptions" permission="platform.entitlement.manage">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SubscriptionsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
