"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
import { PlatformPageGate } from "@/components/platform-page-gate";
import {
  archivePlanPrice,
  createPlan,
  createPlanPrice,
  deletePlan,
  getPlan,
  listPlans,
  patchPlan,
  patchPlanPrice,
  type PlanPrice,
  type SubscriptionPlan,
} from "@/lib/api";
import styles from "../page.module.css";

const PAGE_SIZE = 20;
const INTERVALS = ["MONTHLY", "ANNUAL", "ONE_TIME", "USAGE"] as const;
const BILLING_TYPES = [
  "MONTHLY",
  "ANNUAL",
  "PER_SEAT",
  "PER_MODULE",
  "BUNDLE",
  "USAGE_READY",
  "MANUAL_ENTERPRISE_CONTRACT",
  "COMPLIMENTARY",
] as const;

function formatMoney(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function PlansInner() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [prices, setPrices] = useState<PlanPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("code");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);

  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createInterval, setCreateInterval] = useState<(typeof INTERVALS)[number]>("MONTHLY");
  const [createPrice, setCreatePrice] = useState("");
  const [createCurrency, setCreateCurrency] = useState("USD");

  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null);
  const [editName, setEditName] = useState("");
  const [editInterval, setEditInterval] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editStatus, setEditStatus] = useState("ACTIVE");

  const [priceCode, setPriceCode] = useState("");
  const [priceNickname, setPriceNickname] = useState("");
  const [priceInterval, setPriceInterval] = useState<(typeof INTERVALS)[number]>("MONTHLY");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceBillingType, setPriceBillingType] =
    useState<(typeof BILLING_TYPES)[number]>("MONTHLY");
  const [editPriceRow, setEditPriceRow] = useState<PlanPrice | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<
    { type: "plan"; code: string } | { type: "price"; planCode: string; priceCode: string } | null
  >(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await listPlans({ includeArchived: showArchived }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  const loadPrices = useCallback(async (planCode: string) => {
    setPricesLoading(true);
    try {
      const detail = await getPlan(planCode);
      setPrices(detail.prices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan prices");
      setPrices([]);
    } finally {
      setPricesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (selectedCode) {
      void loadPrices(selectedCode);
    } else {
      setPrices([]);
    }
  }, [selectedCode, loadPrices]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, showArchived]);

  const filtered = useMemo(() => {
    const searched = filterBySearch(plans, search, [
      (row) => row.code,
      (row) => row.name,
      (row) => row.billingInterval,
      (row) => row.status,
    ]);
    return sortByField(searched, sort, {
      code: (row) => row.code,
      name: (row) => row.name,
      price: (row) => row.basePriceCents ?? 0,
      status: (row) => row.status,
    });
  }, [plans, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  async function onCreatePlan(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createPlan({
        code: createCode.trim().toUpperCase(),
        name: createName.trim(),
        billingInterval: createInterval,
        basePriceCents: createPrice ? Math.round(Number(createPrice) * 100) : null,
        currency: createCurrency.trim().toUpperCase() || "USD",
      });
      setCreateCode("");
      setCreateName("");
      setCreatePrice("");
      setMessage(`Plan ${created.code} created.`);
      setSelectedCode(created.code);
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditPlan(plan: SubscriptionPlan) {
    setEditPlan(plan);
    setEditName(plan.name);
    setEditInterval(plan.billingInterval);
    setEditPrice(plan.basePriceCents != null ? String(plan.basePriceCents / 100) : "");
    setEditCurrency(plan.currency);
    setEditStatus(plan.status);
    setSelectedCode(plan.code);
  }

  async function onSavePlan(event: FormEvent) {
    event.preventDefault();
    if (!editPlan) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchPlan(editPlan.code, {
        name: editName.trim(),
        billingInterval: editInterval,
        basePriceCents: editPrice ? Math.round(Number(editPrice) * 100) : null,
        currency: editCurrency.trim().toUpperCase() || "USD",
        status: editStatus,
      });
      setMessage(`Plan ${editPlan.code} updated.`);
      setEditPlan(null);
      await loadPlans();
      if (selectedCode === editPlan.code) {
        await loadPrices(editPlan.code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreatePrice(event: FormEvent) {
    event.preventDefault();
    if (!selectedCode) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createPlanPrice(selectedCode, {
        code: priceCode.trim().toUpperCase(),
        nickname: priceNickname.trim(),
        interval: priceInterval,
        amountCents: priceAmount ? Math.round(Number(priceAmount) * 100) : null,
        billingType: priceBillingType,
      });
      setPriceCode("");
      setPriceNickname("");
      setPriceAmount("");
      setMessage("Price tier created.");
      await loadPrices(selectedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create price");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditPrice(row: PlanPrice) {
    setEditPriceRow(row);
  }

  async function onSavePrice(event: FormEvent) {
    event.preventDefault();
    if (!selectedCode || !editPriceRow) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchPlanPrice(selectedCode, editPriceRow.code, {
        nickname: editPriceRow.nickname,
        interval: editPriceRow.interval,
        amountCents: editPriceRow.amountCents,
        billingType: editPriceRow.billingType,
        status: editPriceRow.status,
      });
      setEditPriceRow(null);
      setMessage("Price tier updated.");
      await loadPrices(selectedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update price");
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      if (deleteTarget.type === "plan") {
        const result = await deletePlan(deleteTarget.code);
        if (selectedCode === deleteTarget.code && result.mode === "deleted") {
          setSelectedCode(null);
          setPrices([]);
        }
        setMessage(result.message);
        await loadPlans();
        if (selectedCode === deleteTarget.code && result.mode === "archived") {
          await loadPrices(deleteTarget.code);
        }
      } else {
        await archivePlanPrice(deleteTarget.planCode, deleteTarget.priceCode);
        setMessage(`Price ${deleteTarget.priceCode} archived.`);
        await loadPrices(deleteTarget.planCode);
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1>Plans & Pricing</h1>
      <p className={styles.lead}>
        Manage Forge subscription plans and price tiers. Delete removes unused plans permanently;
        plans still used by subscriptions are archived instead.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <div className={styles.panel}>
        <h2>Create plan</h2>
        <form className={styles.form} onSubmit={onCreatePlan}>
          <div className={styles.formRow}>
            <label htmlFor="plan-code">Code</label>
            <input
              id="plan-code"
              required
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value)}
              placeholder="ENTERPRISE_ANNUAL"
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="plan-name">Name</label>
            <input
              id="plan-name"
              required
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Enterprise Annual"
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="plan-interval">Billing interval</label>
            <select
              id="plan-interval"
              value={createInterval}
              onChange={(e) => setCreateInterval(e.target.value as (typeof INTERVALS)[number])}
            >
              {INTERVALS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label htmlFor="plan-price">Base price (USD)</label>
            <input
              id="plan-price"
              type="number"
              min="0"
              step="0.01"
              value={createPrice}
              onChange={(e) => setCreatePrice(e.target.value)}
              placeholder="99.00"
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="plan-currency">Currency</label>
            <input
              id="plan-currency"
              maxLength={3}
              value={createCurrency}
              onChange={(e) => setCreateCurrency(e.target.value)}
            />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Create plan"}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.panel}>
        <div className={styles.linkRow}>
          <h2>Plans catalog</h2>
          <label className={styles.muted}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{" "}
            Show archived
          </label>
        </div>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        <ListControls
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          sortOptions={[
            { value: "code", label: "Code" },
            { value: "name", label: "Name" },
            { value: "price", label: "Price" },
            { value: "status", label: "Status" },
          ]}
          onSortChange={setSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
        {pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Interval</th>
                <th>Base price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id} className={selectedCode === row.code ? styles.rowSelected : ""}>
                  <td className={styles.mono}>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.billingInterval}</td>
                  <td>{formatMoney(row.basePriceCents, row.currency)}</td>
                  <td>{row.status}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => setSelectedCode(row.code)}
                      >
                        Prices
                      </button>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => startEditPlan(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        onClick={() => setDeleteTarget({ type: "plan", code: row.code })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading && <p className={styles.muted}>No plans found.</p>
        )}
      </div>

      {editPlan ? (
        <div className={styles.panel}>
          <h2>Edit plan · {editPlan.code}</h2>
          <form className={styles.form} onSubmit={onSavePlan}>
            <div className={styles.formRow}>
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-interval">Billing interval</label>
              <select
                id="edit-interval"
                value={editInterval}
                onChange={(e) => setEditInterval(e.target.value)}
              >
                {INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-price">Base price</label>
              <input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-currency">Currency</label>
              <input
                id="edit-currency"
                maxLength={3}
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Save plan
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditPlan(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedCode ? (
        <div className={styles.panel}>
          <h2>Price tiers · {selectedCode}</h2>
          {pricesLoading ? <p className={styles.muted}>Loading prices…</p> : null}
          <form className={styles.form} onSubmit={onCreatePrice}>
            <div className={styles.formRow}>
              <label htmlFor="price-code">Price code</label>
              <input
                id="price-code"
                required
                value={priceCode}
                onChange={(e) => setPriceCode(e.target.value)}
                placeholder="MONTHLY_STANDARD"
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="price-nickname">Nickname</label>
              <input
                id="price-nickname"
                required
                value={priceNickname}
                onChange={(e) => setPriceNickname(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="price-interval">Interval</label>
              <select
                id="price-interval"
                value={priceInterval}
                onChange={(e) => setPriceInterval(e.target.value as (typeof INTERVALS)[number])}
              >
                {INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="price-amount">Amount</label>
              <input
                id="price-amount"
                type="number"
                min="0"
                step="0.01"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="price-billing-type">Billing type</label>
              <select
                id="price-billing-type"
                value={priceBillingType}
                onChange={(e) =>
                  setPriceBillingType(e.target.value as (typeof BILLING_TYPES)[number])
                }
              >
                {BILLING_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Add price tier
              </button>
            </div>
          </form>

          {prices.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nickname</th>
                  <th>Interval</th>
                  <th>Amount</th>
                  <th>Billing type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.mono}>{row.code}</td>
                    <td>{row.nickname}</td>
                    <td>{row.interval}</td>
                    <td>{formatMoney(row.amountCents, row.currency)}</td>
                    <td className={styles.mono}>{row.billingType}</td>
                    <td>{row.status}</td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => startEditPrice(row)}
                        >
                          Edit
                        </button>
                        {row.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className={styles.buttonDanger}
                            onClick={() =>
                              setDeleteTarget({
                                type: "price",
                                planCode: selectedCode,
                                priceCode: row.code,
                              })
                            }
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            !pricesLoading && <p className={styles.muted}>No price tiers for this plan.</p>
          )}
        </div>
      ) : null}

      {editPriceRow && selectedCode ? (
        <div className={styles.panel}>
          <h2>Edit price · {editPriceRow.code}</h2>
          <form className={styles.form} onSubmit={onSavePrice}>
            <div className={styles.formRow}>
              <label htmlFor="edit-price-nickname">Nickname</label>
              <input
                id="edit-price-nickname"
                required
                value={editPriceRow.nickname}
                onChange={(e) => setEditPriceRow({ ...editPriceRow, nickname: e.target.value })}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-price-interval">Interval</label>
              <select
                id="edit-price-interval"
                value={editPriceRow.interval}
                onChange={(e) => setEditPriceRow({ ...editPriceRow, interval: e.target.value })}
              >
                {INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-price-amount">Amount (cents)</label>
              <input
                id="edit-price-amount"
                type="number"
                min="0"
                value={editPriceRow.amountCents ?? ""}
                onChange={(e) =>
                  setEditPriceRow({
                    ...editPriceRow,
                    amountCents: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-price-billing">Billing type</label>
              <select
                id="edit-price-billing"
                value={editPriceRow.billingType}
                onChange={(e) => setEditPriceRow({ ...editPriceRow, billingType: e.target.value })}
              >
                {BILLING_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-price-status">Status</label>
              <select
                id="edit-price-status"
                value={editPriceRow.status}
                onChange={(e) => setEditPriceRow({ ...editPriceRow, status: e.target.value })}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Save price
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditPriceRow(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.type === "plan" ? "Delete plan?" : "Archive price?"}
        description={
          deleteTarget?.type === "plan"
            ? "Unused plans are permanently removed. Plans still assigned to subscriptions are archived instead so existing customers are not affected."
            : "Archived prices cannot be assigned to new subscriptions. Existing subscriptions are not changed."
        }
        confirmLabel={deleteTarget?.type === "plan" ? "Delete" : "Archive"}
        danger
        busy={submitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void onConfirmDelete()}
      />
    </section>
  );
}

export default function PlansPage() {
  return (
    <PlatformPageGate title="Plans" permission="platform.entitlement.manage">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <PlansInner />
      </Suspense>
    </PlatformPageGate>
  );
}
