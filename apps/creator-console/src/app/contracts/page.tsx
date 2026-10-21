"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import {
  createBillingContract,
  getBillingOverview,
  patchBillingContract,
  toIfMatch,
  type BillingContract,
} from "@/lib/api";
import styles from "../page.module.css";

const CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "CANCELED"] as const;
const BILLING_TYPES = [
  "MONTHLY",
  "ANNUAL",
  "PER_SEAT",
  "PER_MODULE",
  "BUNDLE",
  "MANUAL_ENTERPRISE_CONTRACT",
  "COMPLIMENTARY",
] as const;

function ContractsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("platform.entitlement.manage");
  const canRead = canManage || hasPermission("tenant.billing.read");

  const [contracts, setContracts] = useState<BillingContract[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [createName, setCreateName] = useState("Enterprise agreement");
  const [createStatus, setCreateStatus] =
    useState<(typeof CONTRACT_STATUSES)[number]>("ACTIVE");
  const [createBillingType, setCreateBillingType] =
    useState<(typeof BILLING_TYPES)[number]>("MANUAL_ENTERPRISE_CONTRACT");
  const [createStartsOn, setCreateStartsOn] = useState("");
  const [createEndsOn, setCreateEndsOn] = useState("");
  const [createRenewalOn, setCreateRenewalOn] = useState("");
  const [createSetupFee, setCreateSetupFee] = useState("0");
  const [createNotes, setCreateNotes] = useState("");
  const [createOverrideCents, setCreateOverrideCents] = useState("");

  const [editContract, setEditContract] = useState<BillingContract | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await getBillingOverview(tenantId);
      setContracts(overview.contracts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contracts");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await createBillingContract(tenantId, {
        name: createName.trim(),
        status: createStatus,
        billingType: createBillingType,
        startsOn: createStartsOn || null,
        endsOn: createEndsOn || null,
        renewalOn: createRenewalOn || null,
        setupFeeCents: Math.round(Number(createSetupFee || 0) * 100),
        notes: createNotes.trim() || null,
        pricingJson: createOverrideCents
          ? { overrideAmountCents: Math.round(Number(createOverrideCents) * 100), currency: "USD" }
          : undefined,
      });
      setMessage("Contract created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contract");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !editContract || !canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await patchBillingContract(
        tenantId,
        editContract.id,
        {
          name: editContract.name,
          status: editContract.status,
          billingType: editContract.billingType,
          startsOn: editContract.startsOn,
          endsOn: editContract.endsOn,
          renewalOn: editContract.renewalOn,
          setupFeeCents: editContract.setupFeeCents,
          notes: editContract.notes,
          pricingJson: editContract.pricingJson,
        },
        toIfMatch(editContract.recordVersion),
      );
      setEditContract(null);
      setMessage("Contract updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contract");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Contracts</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Contracts</h1>
      <p className={styles.lead}>
        Tenant commercial contracts · <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/billing${tenantQuery(tenantId)}`}>Billing</Link> ·{" "}
        <Link href={`/subscriptions${tenantQuery(tenantId)}`}>Subscriptions</Link>
      </p>

      {!canRead ? (
        <p className={styles.error}>
          Missing permission: platform.entitlement.manage or tenant.billing.read
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {canManage ? (
        <div className={styles.panel}>
          <h2>Create contract</h2>
          <form className={styles.form} onSubmit={onCreate}>
            <div className={styles.formRow}>
              <label htmlFor="contract-name">Name</label>
              <input
                id="contract-name"
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-status">Status</label>
              <select
                id="contract-status"
                value={createStatus}
                onChange={(e) =>
                  setCreateStatus(e.target.value as (typeof CONTRACT_STATUSES)[number])
                }
              >
                {CONTRACT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-type">Billing type</label>
              <select
                id="contract-type"
                value={createBillingType}
                onChange={(e) =>
                  setCreateBillingType(e.target.value as (typeof BILLING_TYPES)[number])
                }
              >
                {BILLING_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-starts">Starts on</label>
              <input
                id="contract-starts"
                type="date"
                value={createStartsOn}
                onChange={(e) => setCreateStartsOn(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-ends">Ends on</label>
              <input
                id="contract-ends"
                type="date"
                value={createEndsOn}
                onChange={(e) => setCreateEndsOn(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-renewal">Renewal on</label>
              <input
                id="contract-renewal"
                type="date"
                value={createRenewalOn}
                onChange={(e) => setCreateRenewalOn(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-setup">Setup fee (USD)</label>
              <input
                id="contract-setup"
                type="number"
                min="0"
                step="0.01"
                value={createSetupFee}
                onChange={(e) => setCreateSetupFee(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-override">Override amount (USD)</label>
              <input
                id="contract-override"
                type="number"
                min="0"
                step="0.01"
                value={createOverrideCents}
                onChange={(e) => setCreateOverrideCents(e.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="contract-notes">Notes</label>
              <textarea
                id="contract-notes"
                rows={3}
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create contract"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Contracts</h2>
        {!loading && contracts.length === 0 ? (
          <p className={styles.muted}>No contracts for this tenant.</p>
        ) : null}
        {contracts.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Type</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Renewal</th>
                <th>Setup fee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td className={styles.mono}>{row.billingType}</td>
                  <td>{row.startsOn ?? "—"}</td>
                  <td>{row.endsOn ?? "—"}</td>
                  <td>{row.renewalOn ?? "—"}</td>
                  <td>
                    {row.setupFeeCents != null
                      ? `$${(row.setupFeeCents / 100).toFixed(2)}`
                      : "—"}
                  </td>
                  <td>
                    {canManage ? (
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => setEditContract(row)}
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
        ) : null}
      </div>

      {editContract && canManage ? (
        <div className={styles.panel}>
          <h2>Edit contract</h2>
          <form className={styles.form} onSubmit={onSaveEdit}>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-name">Name</label>
              <input
                id="edit-contract-name"
                required
                value={editContract.name}
                onChange={(e) => setEditContract({ ...editContract, name: e.target.value })}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-status">Status</label>
              <select
                id="edit-contract-status"
                value={editContract.status}
                onChange={(e) => setEditContract({ ...editContract, status: e.target.value })}
              >
                {CONTRACT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-type">Billing type</label>
              <select
                id="edit-contract-type"
                value={editContract.billingType}
                onChange={(e) =>
                  setEditContract({ ...editContract, billingType: e.target.value })
                }
              >
                {BILLING_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-starts">Starts on</label>
              <input
                id="edit-contract-starts"
                type="date"
                value={editContract.startsOn ?? ""}
                onChange={(e) =>
                  setEditContract({ ...editContract, startsOn: e.target.value || null })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-ends">Ends on</label>
              <input
                id="edit-contract-ends"
                type="date"
                value={editContract.endsOn ?? ""}
                onChange={(e) =>
                  setEditContract({ ...editContract, endsOn: e.target.value || null })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-renewal">Renewal on</label>
              <input
                id="edit-contract-renewal"
                type="date"
                value={editContract.renewalOn ?? ""}
                onChange={(e) =>
                  setEditContract({ ...editContract, renewalOn: e.target.value || null })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-setup">Setup fee (cents)</label>
              <input
                id="edit-contract-setup"
                type="number"
                min="0"
                value={editContract.setupFeeCents ?? 0}
                onChange={(e) =>
                  setEditContract({
                    ...editContract,
                    setupFeeCents: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="edit-contract-notes">Notes</label>
              <textarea
                id="edit-contract-notes"
                rows={3}
                value={editContract.notes ?? ""}
                onChange={(e) =>
                  setEditContract({ ...editContract, notes: e.target.value || null })
                }
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                Save contract
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditContract(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default function ContractsPage() {
  return (
    <PlatformPageGate
      title="Contracts"
      anyOf={["platform.entitlement.manage", "tenant.billing.read"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <ContractsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
