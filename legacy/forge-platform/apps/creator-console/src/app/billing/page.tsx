"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  apiSend,
  createBillingContract,
  createBillingFee,
  createBillingInvoice,
  getBillingOverview,
  patchBillingInvoice,
  toIfMatch,
  type BillingInvoice,
  type BillingOverview,
} from "@/lib/api";
import styles from "../page.module.css";

const INVOICE_STATUSES = ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"] as const;
const FEE_TYPES = ["IMPLEMENTATION", "MIGRATION", "SETUP", "OTHER"] as const;

function BillingInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("platform.entitlement.manage");
  const canRead = canManage || hasPermission("tenant.billing.read");

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [contactEmail, setContactEmail] = useState("");
  const [contractName, setContractName] = useState("Enterprise agreement");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [renewalOn, setRenewalOn] = useState("");
  const [setupFeeCents, setSetupFeeCents] = useState("0");
  const [notes, setNotes] = useState("");
  const [overrideCents, setOverrideCents] = useState("");
  const [modulePricing, setModulePricing] = useState("");

  const [invoiceStatus, setInvoiceStatus] = useState<(typeof INVOICE_STATUSES)[number]>("OPEN");
  const [invoiceDue, setInvoiceDue] = useState("");
  const [invoicePaid, setInvoicePaid] = useState("0");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [editInvoice, setEditInvoice] = useState<BillingInvoice | null>(null);

  const [feeType, setFeeType] = useState<(typeof FEE_TYPES)[number]>("IMPLEMENTATION");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeDescription, setFeeDescription] = useState("");
  const [feeContractId, setFeeContractId] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getBillingOverview(tenantId);
      setOverview(data);
      setContactEmail(data.customer?.billingEmail ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/billing/customers`, "POST", {
        billingEmail: contactEmail || null,
      });
      if (overview?.customer) {
        await apiSend(
          `/api/v1/tenants/${tenantId}/billing/customers`,
          "PATCH",
          { billingEmail: contactEmail || null },
          { ifMatch: toIfMatch(overview.customer.recordVersion) },
        );
      }
      setMessage("Billing contact saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSubmitting(false);
    }
  }

  async function createContract(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const modules = modulePricing
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [moduleCode, amount] = line.split(/[,=:]/).map((p) => p.trim());
          return { moduleCode: moduleCode || "", amountCents: Number(amount || 0) };
        })
        .filter((row) => row.moduleCode);

      await createBillingContract(tenantId, {
        name: contractName,
        status: "ACTIVE",
        billingType: "MANUAL_ENTERPRISE_CONTRACT",
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        renewalOn: renewalOn || null,
        setupFeeCents: Number(setupFeeCents || 0),
        notes: notes || null,
        pricingJson: {
          ...(overrideCents ? { overrideAmountCents: Number(overrideCents) } : {}),
          currency: "USD",
          ...(modules.length ? { modules } : {}),
        },
      });
      setMessage("Contract created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contract");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreateInvoice(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createBillingInvoice(tenantId, {
        status: invoiceStatus,
        amountDueCents: Math.round(Number(invoiceDue || 0) * 100),
        amountPaidCents: Math.round(Number(invoicePaid || 0) * 100),
        hostedInvoiceUrl: invoiceUrl.trim() || null,
      });
      setInvoiceDue("");
      setInvoiceUrl("");
      setMessage("Invoice recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveInvoice(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !editInvoice || !canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchBillingInvoice(
        tenantId,
        editInvoice.id,
        {
          status: editInvoice.status,
          amountDueCents: editInvoice.amountDueCents,
          amountPaidCents: editInvoice.amountPaidCents,
          hostedInvoiceUrl: editInvoice.hostedInvoiceUrl,
        },
        toIfMatch(editInvoice.recordVersion),
      );
      setEditInvoice(null);
      setMessage("Invoice updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreateFee(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createBillingFee(tenantId, {
        feeType,
        amountCents: Math.round(Number(feeAmount || 0) * 100),
        description: feeDescription.trim() || null,
        contractId: feeContractId.trim() || null,
      });
      setFeeAmount("");
      setFeeDescription("");
      setMessage("Fee line added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fee");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Billing</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Billing</h1>
      <p className={styles.lead}>
        Tenant commercial overview · <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/subscriptions${q}`}>Subscriptions</Link> ·{" "}
        <Link href={`/contracts${q}`}>Contracts</Link> ·{" "}
        <Link href={`/customer-modules${q}`}>Company modules</Link>
      </p>

      {!canRead ? (
        <p className={styles.error}>
          Missing permission: platform.entitlement.manage or tenant.billing.read
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {overview ? (
        <>
          <div className={styles.panel}>
            <h2>Overview</h2>
            <dl className={styles.dl}>
              <dt>Subscription status</dt>
              <dd>{overview.subscription?.status ?? "None"}</dd>
              <dt>Current plan</dt>
              <dd>{overview.subscription?.planName ?? overview.subscription?.planCode ?? "—"}</dd>
              <dt>Billing contact</dt>
              <dd>{overview.customer?.billingEmail ?? "—"}</dd>
            </dl>
          </div>

          <div className={styles.panel}>
            <h2>Invoices</h2>
            {overview.invoices.length === 0 ? (
              <p className={styles.muted}>No invoices recorded.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Paid</th>
                    <th>Link</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.status}</td>
                      <td>
                        {(inv.amountDueCents / 100).toFixed(2)} {inv.currency}
                      </td>
                      <td>
                        {(inv.amountPaidCents / 100).toFixed(2)} {inv.currency}
                      </td>
                      <td>
                        {inv.hostedInvoiceUrl ? (
                          <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <button
                            type="button"
                            className={styles.buttonSecondary}
                            onClick={() => setEditInvoice(inv)}
                          >
                            Edit
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {canManage ? (
              <form className={styles.form} onSubmit={onCreateInvoice}>
                <h3>Record invoice</h3>
                <div className={styles.formRow}>
                  <label htmlFor="invoice-status">Status</label>
                  <select
                    id="invoice-status"
                    value={invoiceStatus}
                    onChange={(e) =>
                      setInvoiceStatus(e.target.value as (typeof INVOICE_STATUSES)[number])
                    }
                  >
                    {INVOICE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="invoice-due">Amount due (USD)</label>
                  <input
                    id="invoice-due"
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceDue}
                    onChange={(e) => setInvoiceDue(e.target.value)}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="invoice-paid">Amount paid (USD)</label>
                  <input
                    id="invoice-paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoicePaid}
                    onChange={(e) => setInvoicePaid(e.target.value)}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="invoice-url">Hosted invoice URL</label>
                  <input
                    id="invoice-url"
                    type="url"
                    value={invoiceUrl}
                    onChange={(e) => setInvoiceUrl(e.target.value)}
                  />
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={submitting}>
                    Record invoice
                  </button>
                </div>
              </form>
            ) : null}

            {editInvoice && canManage ? (
              <form className={styles.form} onSubmit={onSaveInvoice}>
                <h3>Edit invoice</h3>
                <div className={styles.formRow}>
                  <label htmlFor="edit-invoice-status">Status</label>
                  <select
                    id="edit-invoice-status"
                    value={editInvoice.status}
                    onChange={(e) => setEditInvoice({ ...editInvoice, status: e.target.value })}
                  >
                    {INVOICE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="edit-invoice-due">Amount due (cents)</label>
                  <input
                    id="edit-invoice-due"
                    type="number"
                    min="0"
                    value={editInvoice.amountDueCents}
                    onChange={(e) =>
                      setEditInvoice({
                        ...editInvoice,
                        amountDueCents: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="edit-invoice-paid">Amount paid (cents)</label>
                  <input
                    id="edit-invoice-paid"
                    type="number"
                    min="0"
                    value={editInvoice.amountPaidCents}
                    onChange={(e) =>
                      setEditInvoice({
                        ...editInvoice,
                        amountPaidCents: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="edit-invoice-url">Hosted URL</label>
                  <input
                    id="edit-invoice-url"
                    value={editInvoice.hostedInvoiceUrl ?? ""}
                    onChange={(e) =>
                      setEditInvoice({
                        ...editInvoice,
                        hostedInvoiceUrl: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={submitting}>
                    Save invoice
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => setEditInvoice(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <div className={styles.panel}>
            <h2>Implementation & migration fees</h2>
            {overview.fees.length === 0 ? (
              <p className={styles.muted}>No fee lines recorded.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{fee.feeType}</td>
                      <td>
                        {(fee.amountCents / 100).toFixed(2)} {fee.currency}
                      </td>
                      <td>{fee.description ?? "—"}</td>
                      <td className={styles.mono}>{fee.contractId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {canManage ? (
              <form className={styles.form} onSubmit={onCreateFee}>
                <h3>Add fee line</h3>
                <div className={styles.formRow}>
                  <label htmlFor="fee-type">Fee type</label>
                  <select
                    id="fee-type"
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value as (typeof FEE_TYPES)[number])}
                  >
                    {FEE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="fee-amount">Amount (USD)</label>
                  <input
                    id="fee-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="fee-description">Description</label>
                  <input
                    id="fee-description"
                    value={feeDescription}
                    onChange={(e) => setFeeDescription(e.target.value)}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="fee-contract">Contract ID (optional)</label>
                  <input
                    id="fee-contract"
                    value={feeContractId}
                    onChange={(e) => setFeeContractId(e.target.value)}
                    placeholder="UUID"
                  />
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={submitting}>
                    Add fee
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {canManage ? (
            <>
              <div className={styles.panel}>
                <h2>Billing contact</h2>
                <form onSubmit={saveContact} className={styles.form}>
                  <div className={styles.formRow}>
                    <label htmlFor="billing-email">Email</label>
                    <input
                      id="billing-email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      type="email"
                    />
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.button} type="submit" disabled={submitting}>
                      Save contact
                    </button>
                  </div>
                </form>
              </div>

              <div className={styles.panel}>
                <h2>Manual enterprise contract</h2>
                <form onSubmit={createContract} className={styles.form}>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-name">Name</label>
                    <input
                      id="contract-name"
                      value={contractName}
                      onChange={(e) => setContractName(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-starts">Starts on</label>
                    <input
                      id="contract-starts"
                      type="date"
                      value={startsOn}
                      onChange={(e) => setStartsOn(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-ends">Ends on</label>
                    <input
                      id="contract-ends"
                      type="date"
                      value={endsOn}
                      onChange={(e) => setEndsOn(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-renewal">Renewal date</label>
                    <input
                      id="contract-renewal"
                      type="date"
                      value={renewalOn}
                      onChange={(e) => setRenewalOn(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-setup">Setup fee (cents)</label>
                    <input
                      id="contract-setup"
                      value={setupFeeCents}
                      onChange={(e) => setSetupFeeCents(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-override">Pricing override (cents)</label>
                    <input
                      id="contract-override"
                      value={overrideCents}
                      onChange={(e) => setOverrideCents(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-modules">Module pricing (CODE,cents per line)</label>
                    <textarea
                      id="contract-modules"
                      value={modulePricing}
                      onChange={(e) => setModulePricing(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label htmlFor="contract-notes">Notes</label>
                    <textarea
                      id="contract-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.button} type="submit" disabled={submitting}>
                      Create contract
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default function BillingPage() {
  return (
    <PlatformPageGate
      title="Billing"
      anyOf={["platform.entitlement.manage", "tenant.billing.read"]}
    >
      <Suspense
        fallback={
          <section className={styles.page}>
            <p>Loading…</p>
          </section>
        }
      >
        <BillingInner />
      </Suspense>
    </PlatformPageGate>
  );
}
