"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityTimeline,
  EmptyState,
  ErrorState,
  ForgeMetricCard,
  ForgeMetricGrid,
  ForgePageActions,
  ForgePageHeader,
  ForgeSkeleton,
  ForgeStatusCard,
  StatusBadge,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { useAuth } from "@/hooks/use-auth";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import {
  apiGet,
  fetchHealth,
  fetchReady,
  listInvitations,
  type HealthPayload,
  type ReadyPayload,
} from "@/lib/api";
import { getMigrationStatusService } from "@/lib/migrations/mock-migration.service";
import type { MigrationSummary } from "@/lib/migrations/migration.types";
import {
  customerStatusTone,
  humanActivityTitle,
  humanCustomerStatus,
  humanMigrationStatus,
  unavailableLabel,
} from "@/lib/presentation";
import styles from "./page.module.css";

type AnalyticsOverview = {
  generatedAt: string;
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
  };
  users: {
    totalMemberships: number;
    activeMemberships: number;
    suspendedMemberships: number;
  };
  products: {
    catalogActive: number;
    tenantAssignmentsActive: number;
  };
  onboarding: {
    inProgress: number;
    completed: number;
    failed: number;
  };
  recentActivity: Array<{
    occurredAt: string;
    action: string;
    resourceType: string;
    result: string;
    tenantKey: string | null;
  }>;
};

type TenantRow = {
  id: string;
  displayName: string;
  status: string;
  tenantKey: string;
  updatedAt?: string;
};

type JobRow = { id: string; status?: string };

type AttentionItem = {
  id: string;
  title: string;
  href: string;
  tone: "warning" | "danger" | "info";
};

function metricOrUnavailable(value: number | null | undefined, loading: boolean) {
  if (loading) return undefined;
  return value ?? null;
}

function DashboardInner() {
  const { me, loading: authLoading, error: authError, hasPermission } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [overviewUnavailable, setOverviewUnavailable] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [pendingInvites, setPendingInvites] = useState<number | null>(null);
  const [importJobs, setImportJobs] = useState<number | null>(null);
  const [migrations, setMigrations] = useState<MigrationSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAnalytics = hasPermission("platform.analytics.read") || Boolean(me?.isPlatformAdmin);
  const canTenants = hasPermission("platform.tenant.read") || Boolean(me?.isPlatformAdmin);
  const canInvites = hasPermission("platform.invitation.read") || Boolean(me?.isPlatformAdmin);
  const canJobs =
    hasPermission("platform.jobs.read") ||
    hasPermission("import.view") ||
    Boolean(me?.isPlatformAdmin);
  const canBilling =
    hasPermission("platform.entitlement.manage") ||
    hasPermission("tenant.billing.read") ||
    Boolean(me?.isPlatformAdmin);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, readyResult] = await Promise.allSettled([fetchHealth(), fetchReady()]);
      setHealth(healthResult.status === "fulfilled" ? healthResult.value : null);
      setReady(readyResult.status === "fulfilled" ? readyResult.value : null);

      if (canAnalytics) {
        try {
          setOverview(await apiGet<AnalyticsOverview>("/api/v1/platform/analytics/overview"));
          setOverviewUnavailable(false);
        } catch {
          setOverview(null);
          setOverviewUnavailable(true);
        }
      } else {
        setOverview(null);
        setOverviewUnavailable(false);
      }

      if (canTenants) {
        try {
          setTenants(await apiGet<TenantRow[]>("/api/v1/platform/tenants"));
        } catch {
          setTenants(null);
        }
      } else {
        setTenants(null);
      }

      if (canInvites && me?.tenantId) {
        try {
          const invites = await listInvitations({ tenantId: me.tenantId, status: "PENDING" });
          setPendingInvites(invites.length);
        } catch {
          setPendingInvites(null);
        }
      } else {
        setPendingInvites(null);
      }

      if (canJobs) {
        try {
          const jobs = await apiGet<JobRow[]>("/api/v1/platform/jobs");
          setImportJobs(jobs.length);
        } catch {
          try {
            const jobs = await apiGet<JobRow[]>("/api/v1/imports/jobs");
            setImportJobs(jobs.length);
          } catch {
            setImportJobs(null);
          }
        }
      } else {
        setImportJobs(null);
      }

      try {
        setMigrations(await getMigrationStatusService().listMigrations());
      } catch {
        setMigrations(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [canAnalytics, canInvites, canJobs, canTenants, me?.tenantId]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const customerCount = tenants?.length ?? overview?.tenants.total ?? null;
  const recentCustomers = useMemo(
    () =>
      [...(tenants ?? [])]
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
        .slice(0, 8),
    [tenants],
  );
  const openMigrations =
    migrations?.filter((m) => m.status !== "COMPLETE" && m.status !== "NOT_STARTED").length ?? null;
  const reviewMigrations =
    migrations?.filter((m) => m.status === "VALIDATION_REQUIRED" || m.status === "FAILED").length ??
    0;

  const attention = useMemo(() => {
    const items: AttentionItem[] = [];
    if (pendingInvites != null && pendingInvites > 0) {
      items.push({
        id: "invites",
        title: `${pendingInvites} invitation${pendingInvites === 1 ? "" : "s"} pending`,
        href: "/invitations/",
        tone: "warning",
      });
    }
    if (reviewMigrations > 0) {
      items.push({
        id: "mig-review",
        title: `${reviewMigrations} migration${reviewMigrations === 1 ? "" : "s"} require review`,
        href: "/migrations/",
        tone: "danger",
      });
    }
    if (overview && overview.onboarding.inProgress > 0) {
      items.push({
        id: "onboarding",
        title: `${overview.onboarding.inProgress} customer${overview.onboarding.inProgress === 1 ? "" : "s"} still onboarding`,
        href: "/onboarding/",
        tone: "info",
      });
    }
    if (ready?.checks.database === false) {
      items.push({
        id: "db",
        title: "Database needs attention",
        href: "/operations/health/",
        tone: "danger",
      });
    }
    if (health && String(health.status).toLowerCase() !== "ok" && String(health.status).toLowerCase() !== "healthy") {
      items.push({
        id: "api",
        title: "Platform API reported an issue",
        href: "/operations/health/",
        tone: "danger",
      });
    }
    return items;
  }, [health, overview, pendingInvites, ready, reviewMigrations]);

  const activityItems =
    overview?.recentActivity.slice(0, 8).map((event, index) => {
      const item: {
        id: string;
        title: string;
        detail?: string;
        at: string;
        tone: "danger" | "neutral";
      } = {
        id: `${event.occurredAt}-${index}`,
        title: humanActivityTitle(event.action, event.resourceType, event.result),
        at: new Date(event.occurredAt).toLocaleString(),
        tone: event.result.toLowerCase().includes("fail") ? "danger" : "neutral",
      };
      if (event.tenantKey) item.detail = `Customer · ${event.tenantKey}`;
      return item;
    }) ?? [];

  const apiHealthy =
    health != null &&
    ["ok", "healthy", "up"].includes(String(health.status).toLowerCase());
  const dbHealthy = ready?.checks.database === true;

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Forge Creator Console"
        subtitle="Manage customers, products, users, migrations, and platform operations."
        actions={
          <ForgePageActions>
            {canTenants ? (
              <Link className="btn btn-primary" href="/onboarding/new/">
                + Add Company
              </Link>
            ) : null}
            <Link className="btn btn-outline-secondary" href="/migrations/">
              Start Migration
            </Link>
          </ForgePageActions>
        }
      />

      {authError ? <div className="alert alert-danger" role="alert">{authError}</div> : null}
      {error ? (
        <ErrorState
          title="We couldn't load your dashboard"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      ) : null}

      {loading || authLoading ? (
        <ForgeMetricGrid>
          <ForgeSkeleton height="5rem" />
          <ForgeSkeleton height="5rem" />
          <ForgeSkeleton height="5rem" />
          <ForgeSkeleton height="5rem" />
        </ForgeMetricGrid>
      ) : null}

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Needs your attention</h5>
        </div>
        <div className="card-body">
          {loading ? (
            <p className="text-muted mb-0">Checking…</p>
          ) : attention.length === 0 ? (
            <EmptyState title="You're all caught up" description="No urgent items right now." />
          ) : (
            <ul className="list-unstyled mb-0 d-grid gap-2">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="d-flex align-items-center gap-2 text-body">
                    <span
                      className={`badge bg-label-${item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : "info"}`}
                    >
                      Attention
                    </span>
                    <span>{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ForgeMetricGrid>
        <ForgeMetricCard
          label="Active customers"
          value={metricOrUnavailable(overview?.tenants.active ?? customerCount, loading)}
        />
        <ForgeMetricCard
          label="Active users"
          value={metricOrUnavailable(overview?.users.activeMemberships, loading || overviewUnavailable)}
          {...(overviewUnavailable ? { hint: "Analytics overview unavailable" } : {})}
        />
        <ForgeMetricCard
          label="Products enabled"
          value={metricOrUnavailable(
            overview?.products.tenantAssignmentsActive,
            loading || overviewUnavailable,
          )}
        />
        <ForgeMetricCard
          label="Open migrations"
          value={metricOrUnavailable(openMigrations, loading)}
        />
        <ForgeMetricCard
          label="Pending invitations"
          value={metricOrUnavailable(pendingInvites, loading)}
        />
        <ForgeMetricCard
          label="Background jobs"
          value={metricOrUnavailable(importJobs, loading)}
        />
        <ForgeMetricCard
          label="Monthly / annual revenue"
          value={null}
          hint="Billing totals require configured invoices — open Billing"
        />
        <ForgeMetricCard
          label="Renewals due"
          value={null}
          hint="Open Renewals when subscription end dates are available"
        />
      </ForgeMetricGrid>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Quick actions</h5>
        </div>
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2">
            {canTenants ? (
              <Link className="btn btn-primary" href="/onboarding/new/">
                Add Company
              </Link>
            ) : null}
            {canInvites ? (
              <Link className="btn btn-outline-secondary" href="/invitations/">
                Invite User
              </Link>
            ) : null}
            <Link className="btn btn-outline-secondary" href="/migrations/">
              Start Migration
            </Link>
            {hasPermission("platform.entitlement.manage") || me?.isPlatformAdmin ? (
              <Link className="btn btn-outline-secondary" href="/products/">
                Add Product
              </Link>
            ) : null}
            {canBilling ? (
              <Link className="btn btn-outline-secondary" href="/billing/">
                View Billing
              </Link>
            ) : null}
            <Link className="btn btn-outline-secondary" href="/operations/health/">
              View Health
            </Link>
            <Link className="btn btn-outline-secondary" href="/support/">
              Customer Support
            </Link>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Customer overview</h5>
        </div>
        <div className="card-body">
          {tenants === null && !loading ? (
            <p className="text-muted mb-0">Customer list unavailable.</p>
          ) : recentCustomers.length === 0 ? (
            <EmptyState
              title="No companies yet"
              description="Add a company to begin guided onboarding."
              action={
                <Link className="btn btn-primary" href="/onboarding/new/">
                  Add Company
                </Link>
              }
            />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Last activity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCustomers.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={tenantDetailHref(row.id)}>{row.displayName}</Link>
                      </td>
                      <td>
                        <StatusBadge tone={customerStatusTone(row.status)}>
                          {humanCustomerStatus(row.status)}
                        </StatusBadge>
                      </td>
                      <td>
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : unavailableLabel()}
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-2">
                          <Link href={tenantDetailHref(row.id)}>Open</Link>
                          <Link href={`${tenantDetailHref(row.id)}&tab=products`}>Manage</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 mb-0">
            <Link href="/customers/">All customers</Link>
          </p>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <h5 className="card-title mb-0">System health</h5>
            </div>
            <div className="card-body">
              <ForgeMetricGrid>
                <ForgeStatusCard
                  title="Forge Platform"
                  status={apiHealthy ? "Healthy" : health ? "Needs attention" : "Unavailable"}
                />
                <ForgeStatusCard
                  title="Sign in"
                  status={apiHealthy ? "Healthy" : "Unavailable"}
                  detail="Application authentication"
                />
                <ForgeStatusCard
                  title="Database"
                  status={dbHealthy ? "Healthy" : ready ? "Needs attention" : "Unavailable"}
                />
                <ForgeStatusCard
                  title="Email"
                  status="Unavailable"
                  detail="Email service status is not wired yet — open Email"
                />
              </ForgeMetricGrid>
              <p className="mt-3 mb-0">
                <Link href="/operations/health/">View details</Link>
              </p>
            </div>
          </div>
        </div>

        <div className="col-md-6 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <h5 className="card-title mb-0">Recent migrations</h5>
            </div>
            <div className="card-body">
              {migrations === null ? (
                <p className="text-muted mb-0">Migration status unavailable.</p>
              ) : migrations.length === 0 ? (
                <EmptyState
                  title="No migrations"
                  description="Start a migration when moving an existing customer into Forge."
                  action={
                    <Link className="btn btn-primary" href="/migrations/">
                      Start Migration
                    </Link>
                  }
                />
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrations.slice(0, 5).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <Link href={`/migrations/detail/?id=${encodeURIComponent(row.id)}`}>
                              {row.tenantDisplayName}
                            </Link>
                          </td>
                          <td>
                            <StatusBadge
                              tone={
                                row.status === "FAILED"
                                  ? "danger"
                                  : row.status === "COMPLETE"
                                    ? "success"
                                    : "info"
                              }
                            >
                              {humanMigrationStatus(row.status)}
                            </StatusBadge>
                          </td>
                          <td>
                            {row.progressPercent == null ? unavailableLabel() : `${row.progressPercent}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-0">Activity</h5>
        </div>
        <div className="card-body">
          {overviewUnavailable || !overview ? (
            <p className="text-muted mb-0">
              {canAnalytics
                ? "Activity feed unavailable right now."
                : "You need permission to view platform activity."}
            </p>
          ) : (
            <ActivityTimeline items={activityItems} emptyLabel="No recent activity." />
          )}
          <p className="mt-3 mb-0 d-flex flex-wrap gap-3">
            <Link href="/activity/">Full activity</Link>
            <Link href="/audit/">Audit log</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <PlatformPageGate title="Dashboard" anyOf={["platform.tenant.read", "platform.analytics.read"]}>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <DashboardInner />
      </Suspense>
    </PlatformPageGate>
  );
}
