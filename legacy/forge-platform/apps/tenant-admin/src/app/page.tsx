"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import { apiGet, listInvitations, listMemberships } from "@/lib/api";
import styles from "./page.module.css";

type BillingOverview = {
  subscription: { status: string; planName: string | null; planCode: string | null } | null;
};

type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  occurredAt: string;
  result: string;
};

function OverviewInner() {
  const tenantId = useTenantId();
  const { me, hasPermission } = useAuth();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [inviteCount, setInviteCount] = useState<number | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setError(null);
    try {
      const tasks: Array<Promise<void>> = [];
      if (hasPermission("platform.membership.read")) {
        tasks.push(
          listMemberships(tenantId)
            .then((rows) => setMemberCount(rows.length))
            .catch(() => setMemberCount(null)),
        );
      }
      if (hasPermission("platform.invitation.read")) {
        tasks.push(
          listInvitations({ tenantId, status: "PENDING" })
            .then((rows) => setInviteCount(rows.length))
            .catch(() => setInviteCount(null)),
        );
      }
      if (hasPermission("tenant.billing.read") || hasPermission("platform.entitlement.manage")) {
        tasks.push(
          apiGet<BillingOverview>(`/api/v1/tenants/${tenantId}/billing/overview`)
            .then((row) => setBilling(row))
            .catch(() => setBilling(null)),
        );
      }
      if (hasPermission("platform.audit.read")) {
        tasks.push(
          apiGet<AuditEvent[]>(`/api/v1/tenants/${tenantId}/audit-events?page=1&pageSize=5`)
            .then((rows) => setAudit(rows))
            .catch(() => setAudit([])),
        );
      }
      await Promise.all(tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    }
  }, [tenantId, hasPermission]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Overview</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = tenantQuery(tenantId);

  return (
    <section className={styles.page}>
      <h1>Overview</h1>
      <p className={styles.lead}>
        Tenant administration · <span className={styles.mono}>{tenantId}</span>
        {me?.userId ? (
          <>
            {" "}
            · user <span className={styles.mono}>{me.userId.slice(0, 8)}…</span>
          </>
        ) : null}
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>At a glance</h2>
        <dl className={styles.dl}>
          <dt>Members</dt>
          <dd>{memberCount ?? "—"}</dd>
          <dt>Pending invites</dt>
          <dd>{inviteCount ?? "—"}</dd>
          <dt>Subscription</dt>
          <dd>
            {billing?.subscription
              ? `${billing.subscription.planName ?? billing.subscription.planCode ?? "Plan"} · ${billing.subscription.status}`
              : "—"}
          </dd>
        </dl>
      </div>

      <div className={styles.panel}>
        <h2>Quick links</h2>
        <nav className={styles.linkRow}>
          <Link href={`/members${q}`}>Members</Link>
          <Link href={`/invitations${q}`}>Invitations</Link>
          <Link href={`/roles${q}`}>Roles</Link>
          <Link href={`/facilities${q}`}>Facilities</Link>
          <Link href={`/billing${q}`}>Billing</Link>
          <Link href={`/branding${q}`}>Branding</Link>
          <Link href={`/audit${q}`}>Audit</Link>
          <Link href={`/studio${q}`}>Studio</Link>
        </nav>
      </div>

      <div className={styles.panel}>
        <h2>Recent activity</h2>
        {audit.length === 0 ? (
          <p className={styles.muted}>No recent audit events (or unavailable).</p>
        ) : (
          <ul>
            {audit.map((row) => (
              <li key={row.id}>
                <span className={styles.mono}>{row.occurredAt}</span> · {row.action} ·{" "}
                {row.resourceType} · {row.result}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <TenantPageGate
      title="Overview"
      anyOf={["platform.tenant.read", "tenant.configuration.update"]}
    >
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <OverviewInner />
      </Suspense>
    </TenantPageGate>
  );
}
