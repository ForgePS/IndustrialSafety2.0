"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { filterBySearch, ListControls, paginate, sortByField } from "@/components/list-controls";
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

const PAGE_SIZE = 10;

function InvitationsInner() {
  const tenantId = useTenantId();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("platform.invitation.read");
  const canManage = hasPermission("platform.invitation.manage");

  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("created-desc");
  const [page, setPage] = useState(1);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const query = filter ? { tenantId, status: filter } : { tenantId };
      setItems(await listInvitations(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invitations");
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
      (row) => row.id,
    ]);
    return sortByField(searched, sort, {
      "created-desc": (row) => -Date.parse(row.createdAt),
      "created-asc": (row) => Date.parse(row.createdAt),
      email: (row) => row.email,
      status: (row) => row.status,
    });
  }, [items, search, sort]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: {
        tenantId: string;
        email: string;
        send: true;
        firstName?: string;
        lastName?: string;
      } = {
        tenantId,
        email: email.trim(),
        send: true,
      };
      if (firstName.trim()) payload.firstName = firstName.trim();
      if (lastName.trim()) payload.lastName = lastName.trim();
      await createInvitation(payload, { idempotencyKey: crypto.randomUUID() });
      setEmail("");
      setFirstName("");
      setLastName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend(invitationId: string) {
    if (!tenantId || !canManage) return;
    setError(null);
    try {
      await resendInvitation(invitationId, { tenantId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation");
    }
  }

  async function onConfirmRevoke() {
    if (!tenantId || !revokeTarget || !revokeReason.trim()) return;
    setRevokeBusy(true);
    setError(null);
    try {
      await revokeInvitation(revokeTarget.id, revokeReason.trim(), { tenantId });
      setRevokeTarget(null);
      setRevokeReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invitation");
    } finally {
      setRevokeBusy(false);
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

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Invitations</h1>
      <p className={styles.lead}>
        Invite people by email. Forge sends the Cognito invitation message so they can set a
        password and sign in. Use Resend if the email was lost or the Cognito user already existed.
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={`/users${q}`}>Users</Link> · <Link href={`/audit${q}`}>Audit history</Link>
      </p>

      {!canRead ? (
        <p className={styles.error}>Missing permission: platform.invitation.read</p>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

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
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="firstName">First name (optional)</label>
              <input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="lastName">Last name (optional)</label>
              <input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create invitation"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <h2>Invitations</h2>
        {canRead ? (
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchLabel="Search email or status"
            filter={filter}
            filterOptions={[
              { value: "", label: "All statuses" },
              { value: "DRAFT", label: "DRAFT" },
              { value: "PENDING", label: "PENDING" },
              { value: "SENT", label: "SENT" },
              { value: "ACCEPTED", label: "ACCEPTED" },
              { value: "REVOKED", label: "REVOKED" },
              { value: "EXPIRED", label: "EXPIRED" },
            ]}
            onFilterChange={setFilter}
            sort={sort}
            sortOptions={[
              { value: "created-desc", label: "Newest first" },
              { value: "created-asc", label: "Oldest first" },
              { value: "email", label: "Email" },
              { value: "status", label: "Status" },
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
          <p className={styles.muted}>No invitations match your filters.</p>
        ) : null}

        {canRead && pageItems.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.status}</td>
                  <td className={styles.mono}>{row.expiresAt ?? "—"}</td>
                  <td className={styles.mono}>{row.createdAt}</td>
                  <td>
                    <div className={styles.actions}>
                      {canManage && ["DRAFT", "PENDING", "SENT"].includes(row.status) ? (
                        <>
                          <button
                            type="button"
                            className={styles.buttonSecondary}
                            onClick={() => void onResend(row.id)}
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            className={styles.buttonDanger}
                            onClick={() => setRevokeTarget(row)}
                          >
                            Revoke
                          </button>
                        </>
                      ) : (
                        "—"
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke invitation"
        description={
          <>
            <p>
              Revoke invitation for <strong>{revokeTarget?.email}</strong>? This cannot be undone.
            </p>
            <div className={styles.formRow}>
              <label htmlFor="revokeReason">Reason</label>
              <input
                id="revokeReason"
                required
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
              />
            </div>
          </>
        }
        confirmLabel="Revoke invitation"
        danger
        busy={revokeBusy}
        onConfirm={() => void onConfirmRevoke()}
        onCancel={() => {
          setRevokeTarget(null);
          setRevokeReason("");
        }}
      />
    </section>
  );
}

export default function InvitationsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <InvitationsInner />
    </Suspense>
  );
}
