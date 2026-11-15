"use client";

import Link from "next/link";
import { Suspense } from "react";
import {
  ComingLater,
  ForgeModuleGrid,
  ForgePageHeader,
  LoadingState,
  ModuleCard,
  type ForgeLinkRender,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { useAuth } from "@/hooks/use-auth";
import { tenantQuery, useTenantId } from "@/hooks/use-tenant-id";
import styles from "../page.module.css";

function SettingsInner() {
  const { me, loading } = useAuth();
  const tenantId = useTenantId();
  const renderLink: ForgeLinkRender = ({ href, className, children }) => (
    <Link href={href} className={className}>
      {children}
    </Link>
  );

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Settings"
        subtitle="Creator Console preferences and shortcuts to Configuration Studio."
      />

      <div className={styles.panel}>
        <h2>Profile</h2>
        {loading ? (
          <p className={styles.muted}>Loading session…</p>
        ) : me ? (
          <dl className={styles.dl}>
            <dt>User ID</dt>
            <dd className={styles.mono}>{me.userId}</dd>
            <dt>Active tenant</dt>
            <dd className={styles.mono}>{me.tenantId || "—"}</dd>
            <dt>Platform admin</dt>
            <dd>{me.isPlatformAdmin ? "Yes" : "No"}</dd>
          </dl>
        ) : (
          <p className={styles.muted}>
            Not signed in. <Link href="/login/">Sign in</Link> to view your profile.
          </p>
        )}
        <p className={styles.linkRow}>
          <Link href="/profile/">Open full profile</Link>
        </p>
      </div>

      <div className={styles.panel}>
        <h2>Configuration Studio</h2>
        <p className={styles.lead} style={{ marginBottom: "1rem" }}>
          Tenant-scoped configuration modules live in Studio.
        </p>
        <ForgeModuleGrid>
          <ModuleCard
            name="Studio home"
            meta="All configuration namespaces"
            href={tenantId ? `/studio${tenantQuery(tenantId)}` : "/studio/"}
            renderLink={renderLink}
            disabled={!tenantId}
            {...(!tenantId ? { disabledReason: "Select a tenant first" } : {})}
          />
          <ModuleCard
            name="Tenant profile"
            meta="tenant_profile namespace"
            href={
              tenantId
                ? `/studio/tenant-profile${tenantQuery(tenantId)}`
                : "/studio/tenant-profile/"
            }
            renderLink={renderLink}
            disabled={!tenantId}
            {...(!tenantId ? { disabledReason: "Select a tenant first" } : {})}
          />
          <ModuleCard
            name="Branding"
            meta="Branding and assets"
            href={tenantId ? `/branding${tenantQuery(tenantId)}` : "/branding/"}
            renderLink={renderLink}
            disabled={!tenantId}
            {...(!tenantId ? { disabledReason: "Select a tenant first" } : {})}
          />
        </ForgeModuleGrid>
        {!tenantId ? (
          <p className={styles.muted} style={{ marginTop: "0.75rem" }}>
            <Link href="/select-tenant/">Select tenant</Link> or open a customer to enable Studio
            links.
          </p>
        ) : null}
      </div>

      <div className={styles.panel}>
        <h2>Notifications</h2>
        <ComingLater>Notification preferences — coming later.</ComingLater>
      </div>

      <div className={styles.panel}>
        <h2>Appearance</h2>
        <ComingLater>Theme and density preferences — coming later.</ComingLater>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <PlatformPageGate title="Settings" permission="platform.configuration.update">
      <Suspense fallback={<LoadingState label="Loading settings…" />}>
        <SettingsInner />
      </Suspense>
    </PlatformPageGate>
  );
}
