"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, getBearerToken, useAuth, type AuthMe } from "@forge/web-kit";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { BottomNav } from "@/components/bottom-nav";
import { FieldErrorBoundary } from "@/components/field-error-boundary";
import { FieldLogo } from "@/components/field-logo";
import { FieldOrgProvider } from "@/components/field-org-provider";
import { FieldPermissionsProvider } from "@/components/field-permissions-provider";
import { LoginGate } from "@/components/login-gate";
import { OfflineBanner } from "@/components/offline-banner";
import { OrgContextBar } from "@/components/org-context-bar";
import { PwaUpdateBanner } from "@/components/pwa-update-banner";
import { ShellHeader } from "@/components/shell-header";
import { SideNav } from "@/components/side-nav";
import { useFieldLoginBranding } from "@/hooks/use-field-login-branding";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { useFieldTenantBranding } from "@/hooks/use-field-tenant-branding";
import { FIELD_PRODUCT_NAME } from "@/lib/brand";
import { fieldAuthOpts, hasFieldAccess, hasIndustrialProduct } from "@/lib/field-permissions";
import {
  isPlatformHomeTenant,
  readForceTenantPick,
  writeForceTenantPick,
} from "@/lib/field-tenant";
import {
  ensureOfflineStore,
  flushOfflineQueue,
  pendingOfflineCount,
  setOfflineScope,
  subscribeOfflinePending,
} from "@/lib/offline";
import { fieldSignOut } from "@/lib/field-sign-out";
import { isPublicAppRoute } from "@/lib/public-app-routes";

function selectableTenants(me: AuthMe) {
  return (me.tenants ?? []).filter((t) => t.selectable);
}

function needsCompanyPick(me: AuthMe, forcePick: boolean): boolean {
  const selectable = selectableTenants(me);
  if (selectable.length <= 1) return false;
  if (forcePick) return true;
  if (!me.tenantId) return true;
  const active = selectable.find((t) => t.tenantId === me.tenantId);
  return isPlatformHomeTenant(active);
}

function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // Installability still works without SW in local http; ignore registration errors.
  });
}

function FieldShellBody({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { me, loading, error, logout, chooseTenant, hasProduct } = useAuth();
  const { branding } = useFieldLoginBranding();
  const { logoUrl: tenantBrandingLogoUrl, logoDarkUrl, logoLightUrl } = useFieldTenantBranding();
  const { profile } = useFieldProfile();
  const [pending, setPending] = useState(0);
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [forcePick, setForcePick] = useState(() => readForceTenantPick());
  const [bootstrapped, setBootstrapped] = useState(() => Boolean(getBearerToken()));

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!me?.tenantId || !me.userId) {
      setOfflineScope(null);
      setPending(0);
      return;
    }
    let cancelled = false;
    const refresh = () => setPending(pendingOfflineCount());
    void ensureOfflineStore().then(() => {
      if (cancelled) return;
      setOfflineScope({ tenantId: me.tenantId!, userId: me.userId! });
      refresh();
    });
    const unsubscribe = subscribeOfflinePending(refresh);
    const onOnline = () => {
      void flushOfflineQueue().finally(refresh);
    };
    window.addEventListener("online", onOnline);
    if (navigator.onLine) onOnline();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [me?.tenantId, me?.userId]);

  useEffect(() => {
    // Branding is cosmetic — never block the auth gate on it.
    if (!loading) {
      setBootstrapped(true);
    }
  }, [loading]);

  useEffect(() => {
    if (!me || !branding.hostTenantId || tenantSwitching) return;
    if (me.tenantId === branding.hostTenantId) return;
    const match = me.tenants?.find((t) => t.tenantId === branding.hostTenantId && t.selectable);
    if (!match) return;
    setTenantSwitching(true);
    void chooseTenant(branding.hostTenantId)
      .then(() => {
        writeForceTenantPick(false);
        setForcePick(false);
      })
      .finally(() => setTenantSwitching(false));
  }, [me, branding.hostTenantId, chooseTenant, tenantSwitching]);

  const publicRoute = isPublicAppRoute(pathname);

  // Public sticker routes (LOTO /scan) must not wait on Cognito.
  if (!me && publicRoute) {
    return (
      <div className="ff-app ff-app--public">
        <main id="ff-main-content" className="ff-main" tabIndex={-1}>
          <FieldErrorBoundary>{children}</FieldErrorBoundary>
        </main>
      </div>
    );
  }

  // Wait only on auth bootstrap — login-branding can hang without blocking Sign in.
  if (!me && loading && !getBearerToken() && !bootstrapped) {
    return (
      <div className="ff-gate-message">
        <FieldLogo size="compact" />
        <p className="ff-page-body">Loading…</p>
      </div>
    );
  }

  if (!me) {
    // Never mount app pages here — Home/Me/etc. call useFieldPermissions and
    // would throw if rendered outside FieldPermissionsProvider during auth boot.
    // After bootstrap finishes, an orphan bearer (refresh/me failed) must not
    // trap the shell on Loading forever — show login instead.
    if (loading && !bootstrapped) {
      return (
        <div className="ff-gate-message">
          <FieldLogo size="compact" />
          <p className="ff-page-body">Loading…</p>
        </div>
      );
    }
    return <LoginGate authError={error} />;
  }

  const permissions = me.permissions ?? [];
  const authOpts = fieldAuthOpts(me);
  const entitled =
    me.isPlatformAdmin ||
    hasProduct(INDUSTRIAL_PRODUCT_CODE) ||
    hasIndustrialProduct(me.activeProducts ?? []);
  const access = hasFieldAccess(permissions, authOpts);

  if (!entitled || !access) {
    return (
      <div className="ff-gate-message">
        <FieldLogo size="compact" />
        <h1 className="ff-page-title">No Field access</h1>
        <p className="ff-page-body">
          Your account is signed in, but this company has not enabled {FIELD_PRODUCT_NAME} for your
          role. Ask your supervisor or safety administrator.
        </p>
        {error ? <p className="ff-error">{error}</p> : null}
        <button type="button" className="ff-btn" onClick={() => void fieldSignOut(logout)}>
          Sign out
        </button>
      </div>
    );
  }

  if (needsCompanyPick(me, forcePick)) {
    const choices = selectableTenants(me).filter((t) => !isPlatformHomeTenant(t));
    const list = choices.length > 0 ? choices : selectableTenants(me);
    return (
      <div className="ff-login">
        <div className="ff-brand-stack ff-brand-stack--login">
          <FieldLogo size="compact" />
        </div>
        <div className="ff-login-card">
          <h1 className="ff-page-title">Choose company</h1>
          <p className="ff-page-body">
            Select the company Location whose field procedures you need. Platform home has no field
            procedures.
          </p>
          <div className="ff-action-grid">
            {list.map((tenant) => (
              <button
                key={tenant.tenantId}
                type="button"
                className="ff-action-tile"
                disabled={tenantSwitching}
                onClick={() => {
                  setTenantSwitching(true);
                  void chooseTenant(tenant.tenantId)
                    .then(() => {
                      writeForceTenantPick(false);
                      setForcePick(false);
                    })
                    .finally(() => setTenantSwitching(false));
                }}
              >
                {tenant.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeTenant = me.tenants?.find((t) => t.tenantId === me.tenantId);
  const tenantName =
    activeTenant?.displayName || branding.tenantDisplayName || branding.brandLabel;
  const tenantLogoUrl = (me.tenantId ? tenantBrandingLogoUrl : "") || branding.logoUrl;
  const showOrgBar = pathname === "/" || pathname.startsWith("/tasks") || pathname.startsWith("/me");

  return (
    <FieldOrgProvider tenantName={tenantName}>
      <div className="ff-app">
        <a href="#ff-main-content" className="ff-skip-link">
          Skip to content
        </a>
        <OfflineBanner pendingCount={pending} />
        <PwaUpdateBanner />
        <SideNav tenantName={tenantName} />
        <main id="ff-main-content" className="ff-main" tabIndex={-1}>
          <ShellHeader
            tenantName={tenantName}
            tenantSlug={activeTenant?.slug ?? null}
            tenantLogoUrl={tenantLogoUrl}
            tenantLogoDarkUrl={logoDarkUrl || null}
            tenantLogoLightUrl={logoLightUrl || null}
          />
          {showOrgBar ? <OrgContextBar compact /> : null}
          <FieldErrorBoundary>
            <FieldSessionContext
              profileDisplayName={profile?.displayName ?? ""}
              tenantName={tenantName}
            >
              {children}
            </FieldSessionContext>
          </FieldErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </FieldOrgProvider>
  );
}

function FieldSessionContext({
  children,
  profileDisplayName,
  tenantName,
}: {
  children: ReactNode;
  profileDisplayName: string;
  tenantName: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.ffTenant = tenantName;
    document.documentElement.dataset.ffUser = profileDisplayName;
  }, [profileDisplayName, tenantName]);
  return <>{children}</>;
}

export function FieldShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FieldPermissionsProvider>
        <FieldShellBody>{children}</FieldShellBody>
      </FieldPermissionsProvider>
    </AuthProvider>
  );
}

export function useShellTenantName(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.ffTenant ?? "";
}
