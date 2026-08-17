"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ForgeBreadcrumbItem, ForgeLinkRender } from "@forge/ui";
import {
  EnvironmentBanner,
  ForgeBreadcrumbs,
  ForgeFacilitySelector,
  ForgePage,
  ForgeProductSwitcher,
  ForgeShellState,
  ForgeTenantSwitcher,
  ForgeUserMenu,
  StatusBadge,
  ToastProvider,
  UserAvatar,
} from "@forge/ui";
import { SneatLayout, SneatThemeToggle, type SneatLinkRender } from "@forge/sneat";
import { filterNavigationForSession, useAuth } from "@forge/web-kit";
import { ConnectedCommandPalette } from "@/components/connected-command-palette";
import { ConnectedNotificationMenu } from "@/components/connected-notification-menu";
import { fetchHealth, fetchReady } from "@/lib/api";
import { CREATOR_NAV_GROUPS } from "@/lib/navigation";
import styles from "../app/shell.module.css";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";
const isProduction = appEnv === "production" || appEnv === "govcloud-production";

function displayNameFromMe(me: {
  userId: string;
  personId: string | null;
  isPlatformAdmin: boolean;
}): string {
  if (me.isPlatformAdmin) return "Platform admin";
  if (me.personId) return `Person ${me.personId}`;
  return me.userId;
}

function breadcrumbsForPath(pathname: string): ForgeBreadcrumbItem[] {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") {
    return [{ label: "Overview" }];
  }
  const segments = clean.split("/").filter(Boolean);
  const items: ForgeBreadcrumbItem[] = [{ label: "Home", href: "/" }];
  const labelMap: Record<string, string> = {
    tenants: "Customers",
    "tenant-detail": "Customer",
    "select-tenant": "Select customer",
    entitlements: "Product access",
    migrations: "Migration Center",
    support: "Support",
    sessions: "Access sessions",
    renewals: "Renewals",
    facilities: "Facilities",
    domains: "Domains",
    email: "Email",
    activity: "Activity",
    notifications: "Notifications",
  };
  let acc = "";
  for (let i = 0; i < segments.length; i += 1) {
    acc += `/${segments[i]}`;
    const seg = segments[i]!;
    const label =
      labelMap[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const last = i === segments.length - 1;
    items.push(last ? { label } : { label, href: `${acc}/` });
  }
  return items;
}

export function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { me, loading, error, logout, chooseTenant, refresh, loginWithCognito } = useAuth();
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  const groups = useMemo(() => filterNavigationForSession(CREATOR_NAV_GROUPS, me), [me]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [healthResult, readyResult] = await Promise.allSettled([fetchHealth(), fetchReady()]);
      if (cancelled) return;
      const healthOkLocal = healthResult.status === "fulfilled";
      const readyOkLocal = readyResult.status === "fulfilled";
      if (!healthOkLocal && !readyOkLocal) {
        setHealthOk(false);
        return;
      }
      const status =
        healthResult.status === "fulfilled"
          ? String(healthResult.value.status ?? "").toLowerCase()
          : "unknown";
      setHealthOk(
        readyOkLocal &&
          (status === "ok" ||
            status === "healthy" ||
            status === "up" ||
            status === "unknown" ||
            healthOkLocal),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tenants =
    me?.tenants.map((t) => ({
      tenantId: t.tenantId,
      displayName: t.displayName,
      selectable: t.selectable,
    })) ?? [];

  const products =
    me?.activeProducts.map((code) => ({
      id: code,
      name: code,
    })) ?? [];

  const activeTenantLabel =
    tenants.find((t) => t.tenantId === me?.tenantId)?.displayName ?? me?.tenantId ?? "—";

  const userLabel = me ? displayNameFromMe(me) : "Signed in";

  const renderLink: ForgeLinkRender = ({
    href,
    className,
    children: linkChildren,
    "aria-current": ariaCurrent,
    onClick,
  }) => {
    const props: {
      href: string;
      className?: string;
      "aria-current"?: "page";
      onClick?: () => void;
      children: React.ReactNode;
    } = { href, children: linkChildren };
    if (className) props.className = className;
    if (ariaCurrent) props["aria-current"] = ariaCurrent;
    if (onClick) props.onClick = onClick;
    return <Link {...props} />;
  };

  const sneatRenderLink: SneatLinkRender = (props) => renderLink(props);

  const crumbs = breadcrumbsForPath(pathname);

  return (
    <ToastProvider>
      <SneatLayout
        brand="Forge Creator"
        brandMark={
          <span className="avatar avatar-sm">
            <span className="avatar-initial rounded bg-primary">FC</span>
          </span>
        }
        groups={groups}
        activePath={pathname}
        renderLink={sneatRenderLink}
        storageKey="forge-creator-nav-open-groups-v1"
        envBanner={<EnvironmentBanner environment={appEnv} />}
        footer={<>© {new Date().getFullYear()} Forge Creator Platform</>}
        session={
          loading ? (
            <ForgeShellState state="loading" title="Loading session…" />
          ) : me ? (
            <div className="d-flex align-items-center gap-2">
              <UserAvatar name={userLabel} size="md" />
              <div className="min-w-0">
                <div className="fw-semibold text-truncate">{userLabel}</div>
                <div className="small text-muted text-truncate">
                  {me.isPlatformAdmin ? "Platform admin" : "Operator"} · {activeTenantLabel}
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="d-grid gap-2">
              <p className={styles.authError}>{error}</p>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()}>
                  Retry
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => void loginWithCognito()}
                >
                  Sign in
                </button>
              </div>
            </div>
          ) : (
            <div className="d-grid gap-2">
              <ForgeShellState state="empty" title="Not signed in" description="Sign in to manage customers." />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void loginWithCognito()}>
                Sign in
              </button>
            </div>
          )
        }
        navbarCenter={
          <span className="d-inline-flex align-items-center gap-2 flex-wrap">
            <span className={isProduction ? "forge-env-pill forge-env-pill--production" : "forge-env-pill"}>
              {isProduction ? "Production" : appEnv}
            </span>
            <StatusBadge tone={healthOk === null ? "neutral" : healthOk ? "success" : "danger"}>
              {healthOk === null ? "Health…" : healthOk ? "API healthy" : "API issue"}
            </StatusBadge>
            <span className="text-muted small">Creator · {activeTenantLabel}</span>
          </span>
        }
        navbarRight={
          <>
            <ConnectedCommandPalette />
            {me ? (
              <ForgeProductSwitcher
                products={products}
                {...(products[0]?.id ? { activeProductId: products[0].id } : {})}
                state={products.length === 0 ? "empty" : "ready"}
              />
            ) : null}
            {loading ? (
              <ForgeFacilitySelector facilities={[]} state="loading" />
            ) : me ? (
              <ForgeFacilitySelector facilities={[]} state="empty" />
            ) : null}
            {me ? (
              <ForgeTenantSwitcher
                tenants={tenants}
                activeTenantId={me.tenantId}
                onSelect={(id) => void chooseTenant(id)}
                disabled={tenants.filter((t) => t.selectable !== false).length <= 1}
                state={tenants.length === 0 ? "empty" : "ready"}
              />
            ) : null}
            <ConnectedNotificationMenu viewAllHref="/notifications/" renderLink={renderLink} />
            <SneatThemeToggle />
            {me ? (
              <ForgeUserMenu
                label={userLabel}
                onSignOut={() => void logout()}
                renderLink={renderLink}
                items={[
                  { label: "Profile", href: "/profile/" },
                  { label: "Settings", href: "/settings/" },
                ]}
              />
            ) : null}
          </>
        }
      >
        {pathname !== "/login" && pathname !== "/select-tenant" ? (
          <div className="mb-3">
            <ForgeBreadcrumbs items={crumbs} renderLink={renderLink} />
          </div>
        ) : null}
        <ForgePage>{children}</ForgePage>
      </SneatLayout>
    </ToastProvider>
  );
}
