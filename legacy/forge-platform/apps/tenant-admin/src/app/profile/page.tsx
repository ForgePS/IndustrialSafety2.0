"use client";

import Link from "next/link";
import { ForgeBreadcrumbs, ForgePageHeader, ForgeShellState } from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";

export default function TenantAdminProfilePage() {
  const { me, loading, error } = useAuth();

  if (loading) {
    return <ForgeShellState state="loading" title="Loading profile…" />;
  }
  if (error) {
    return <ForgeShellState state="error" title="Profile unavailable" description={error} />;
  }
  if (!me) {
    return (
      <ForgeShellState
        state="unauthorized"
        title="Sign in required"
        description="Sign in to view your Tenant Admin profile."
      />
    );
  }

  return (
    <div>
      <ForgePageHeader
        title="Profile"
        subtitle="Session summary for the signed-in tenant administrator"
        breadcrumbs={
          <ForgeBreadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Profile" }]}
            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
          />
        }
      />
      <dl style={{ display: "grid", gap: "0.75rem", maxWidth: "36rem" }}>
        <div>
          <dt className="forge-topbar__meta">User ID</dt>
          <dd style={{ margin: 0 }}>{me.userId}</dd>
        </div>
        <div>
          <dt className="forge-topbar__meta">Person ID</dt>
          <dd style={{ margin: 0 }}>{me.personId ?? "—"}</dd>
        </div>
        <div>
          <dt className="forge-topbar__meta">Active tenant</dt>
          <dd style={{ margin: 0 }}>{me.tenantId || "—"}</dd>
        </div>
        <div>
          <dt className="forge-topbar__meta">Products</dt>
          <dd style={{ margin: 0 }}>{me.activeProducts.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt className="forge-topbar__meta">Modules</dt>
          <dd style={{ margin: 0 }}>{me.activeModules.join(", ") || "None"}</dd>
        </div>
      </dl>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/studio/tenant-profile/">Tenant settings</Link>
      </p>
    </div>
  );
}
