"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, apiGet, useAuth } from "@forge/web-kit";
import { UnsavedChangesProvider, useUnsavedChanges } from "@/components/unsaved-changes-guard";
import { BodyRegionsProvider } from "@/hooks/use-body-regions";
import { EnvironmentBanner } from "@forge/ui";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { buildIndustrialNavigation, featureFlagForModule, isComingSoonModule } from "@/lib/navigation";
import { NetworkStatusBanner } from "@/lib/offline/network-status";
import { ThemeModeToggle, useIndustrialThemeMode } from "@/components/theme-mode-toggle";
import { ThemeCustomizer } from "@/components/theme-customizer";
import {
  DEFAULT_PRIMARY,
  DEFAULT_TEMPLATE_SETTINGS,
  TEMPLATE_SETTINGS_EVENT,
  readTemplateSettings,
  type IndustrialTemplateSettings,
} from "@/lib/theme-customizer-settings";
import { ForgeIndustrialMark } from "@/components/forge-industrial-mark";
import { CognitoPasswordLoginForm } from "@/components/cognito-password-login-form";
import { IndustrialNotificationMenu } from "@/components/industrial-notification-menu";
import { IndustrialMessagingNavButton } from "@/components/industrial-messaging-nav-button";
import { MessagingPopout } from "@/components/messaging-popout";
import { MessagingPopoutProvider } from "@/components/messaging-popout-context";
import { useLoginBranding } from "@/hooks/use-login-branding";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import {
  IndustrialFacilityProvider,
  useIndustrialFacilityState,
} from "@/hooks/use-industrial-facility";
import { ALL_DEPARTMENTS_ID, ALL_FACILITIES_ID } from "@/lib/industrial-facility";
import { navLogoForTenant } from "@/lib/tenant-nav-logo";
import { profileWelcomeName } from "@/lib/my-profile";
import { isPublicAppRoute } from "@/lib/public-app-routes";
import { WalkthroughProvider } from "@/features/executive-walkthrough/WalkthroughController";
import { WalkthroughOverlayHost } from "@/features/executive-walkthrough/WalkthroughOverlay";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";
const NAV_GROUPS_STORAGE_KEY = "forge-ind-nav-open-groups-v2";

function normalizeAppPath(path: string | null | undefined): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function routeIsActive(pathname: string | null | undefined, route: string): boolean {
  const path = normalizeAppPath(pathname);
  const target = normalizeAppPath(route);
  if (path === target) return true;
  // Nested centers (e.g. /reporting/library, /modules/fleet/asset)
  if (target !== "/" && path.startsWith(`${target}/`)) return true;
  return false;
}

function isLotoScopeRoute(pathname: string | null | undefined): boolean {
  const path = normalizeAppPath(pathname);
  return path.startsWith("/modules/loto") || path.startsWith("/modules/lockout-tagout");
}

function readStoredOpenGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, value === true]),
    );
  } catch {
    return {};
  }
}

/** When logoUrl is set, show full logo only (no short-name text). Falls back to Forge mark + label. */
function BrandLockup({
  logoUrl,
  label,
  primaryColor = "#696cff",
  href,
  onClick,
  textClassName = "app-brand-text menu-text fw-bolder ms-2",
}: {
  logoUrl?: string;
  label: string;
  primaryColor?: string;
  href?: string;
  onClick?: () => void;
  textClassName?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showFullLogo = Boolean(logoUrl?.trim()) && !logoFailed;

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const inner = showFullLogo ? (
    <span className="app-brand-logo app-brand-full-logo">
      <img
        src={logoUrl}
        alt={label}
        className="app-brand-full-logo-img"
        onError={() => setLogoFailed(true)}
      />
    </span>
  ) : (
    <>
      <span className="app-brand-logo">
        <ForgeIndustrialMark primaryColor={primaryColor} title={label} />
      </span>
      <span className={textClassName}>{label}</span>
    </>
  );

  const linkClassName = showFullLogo ? "app-brand-link app-brand-link--full-logo" : "app-brand-link";

  if (href) {
    return (
      <Link href={href} className={linkClassName} {...(onClick ? { onClick } : {})}>
        {inner}
      </Link>
    );
  }
  return <div className={linkClassName}>{inner}</div>;
}

function iconForModule(code: string, group: string): string {
  const c = code.toLowerCase();
  if (c.includes("loto") || c.includes("lockout")) return "bx-lock-alt";
  if (c.includes("equipment")) return "bx-cog";
  if (c.includes("personnel") || c.includes("people")) return "bx-group";
  if (c.includes("training")) return "bx-book";
  if (c.includes("inspection")) return "bx-check-shield";
  if (c.includes("sanitation")) return "bx-spray-can";
  if (c.includes("incident")) return "bx-error";
  if (c.includes("document")) return "bx-file";
  if (c.includes("report")) return "bx-bar-chart-alt-2";
  if (c.includes("qr")) return "bx-qr";
  if (c.includes("message")) return "bx-message";
  if (c.includes("task")) return "bx-task";
  if (c.includes("form")) return "bx-edit";
  if (c.includes("setting")) return "bx-cog";
  if (c.includes("jsa")) return "bx-list-check";
  if (c.includes("observ")) return "bx-show";
  if (group.toLowerCase().includes("high")) return "bx-error-circle";
  return "bx-cube";
}

function ComingSoonNavIcon({ className = "" }: { className?: string }) {
  return (
    <i
      className={`bx bx-time-five text-muted flex-shrink-0 ${className}`.trim()}
      title="Coming soon"
      aria-label="Coming soon"
      style={{ fontSize: "1rem", lineHeight: 1 }}
    />
  );
}

function GateCard({
  title,
  body,
  muted,
  children,
  brandLabel = "Industrial",
  logoUrl,
  primaryColor,
  centerText = false,
}: {
  title: string;
  body: string;
  muted?: string;
  children?: ReactNode;
  brandLabel?: string;
  logoUrl?: string;
  primaryColor?: string;
  centerText?: boolean;
}) {
  const primaryStyle = primaryColor
    ? ({ ["--bs-primary"]: primaryColor } as CSSProperties)
    : undefined;
  const textAlign = centerText ? "text-center" : "";
  return (
    <div className="authentication-wrapper authentication-basic container-p-y" style={primaryStyle}>
      <div className="ind-auth-theme-toggle">
        <ThemeModeToggle />
      </div>
      <div className="authentication-inner">
        <div className="card">
          <div className="card-body">
            <div className="app-brand justify-content-center">
              <BrandLockup
                label={brandLabel}
                textClassName="app-brand-text text-body fw-bolder ms-2"
                {...(logoUrl ? { logoUrl } : {})}
                {...(primaryColor ? { primaryColor } : {})}
              />
            </div>
            <h4 className={`mb-2 ${textAlign}`.trim()}>{title}</h4>
            <p className={`mb-4 ${textAlign}`.trim()}>{body}</p>
            {muted ? <p className={`text-muted mb-4 ${textAlign}`.trim()}>{muted}</p> : null}
            {children}
            <p className="text-center text-muted small mt-4 mb-0">
              Forge Industrial Safety, a division of Forge Public Safety
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellBody({ children }: { children: ReactNode }) {
  const { confirmLeave } = useUnsavedChanges();
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading, error, logout, chooseTenant, hasPermission, hasProduct, refresh, rolePreview, exitRolePreview } =
    useAuth();
  const {
    productDisplayName,
    appShortName,
    logoUrl,
    logoLightUrl,
    logoDarkUrl,
    iconUrl,
    primaryColor,
    secondaryColor,
    accentColor,
  } = useTenantBranding();
  const {
    login,
    primaryColor: loginPrimaryColor,
    hostTenantId,
    loadingHost,
  } = useLoginBranding();
  const themeMode = useIndustrialThemeMode();
  const [templateSettings, setTemplateSettings] =
    useState<IndustrialTemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [hostTenantSettled, setHostTenantSettled] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navGroupsHydrated = useRef(false);
  const lastAutoOpenPath = useRef<string | null>(null);

  // Dark forest brand primaries clash on dark surfaces — keep customizer / Sneat purple in dark mode.
  // Tenant branding only fills --bs-primary when the customizer still uses the default purple.
  const customizerUsesDefaultPrimary =
    templateSettings.primaryColor.toUpperCase() === DEFAULT_PRIMARY.toUpperCase();
  const brandStyle = (
    themeMode === "dark" || !customizerUsesDefaultPrimary
      ? {
          ...(secondaryColor ? { ["--ind-brand-secondary"]: secondaryColor } : {}),
        }
      : {
          ...(primaryColor ? { ["--bs-primary"]: primaryColor } : {}),
          ...(secondaryColor ? { ["--ind-brand-secondary"]: secondaryColor } : {}),
          ...(accentColor && !primaryColor ? { ["--bs-primary"]: accentColor } : {}),
        }
  ) as CSSProperties;

  const contentContainerClass =
    templateSettings.contentWidth === "wide" ? "container-fluid" : "container-xxl";
  const isHorizontalLayout = templateSettings.layout === "horizontal";
  const menuToggleClass = isHorizontalLayout
    ? "layout-menu-toggle navbar-nav align-items-xl-center me-3 me-xl-0 d-xl-none"
    : "layout-menu-toggle navbar-nav align-items-xl-center me-3 me-xl-0 d-xl-none";
  const desktopMenuCloseClass =
    "layout-menu-toggle menu-link text-large ms-auto d-block d-xl-none btn btn-link p-0 border-0";
  const shellWrapperClass = isHorizontalLayout
    ? "layout-wrapper layout-content-navbar layout-horizontal"
    : "layout-wrapper layout-content-navbar";
  const navbarClass = isHorizontalLayout
    ? `layout-navbar ${contentContainerClass} navbar navbar-expand-xl align-items-center bg-navbar-theme`
    : `layout-navbar ${contentContainerClass} navbar navbar-expand-xl navbar-detached align-items-center bg-navbar-theme`;

  const signOut = async () => {
    // ApiBootstrap registers purgeIndustrialForgeBrowserState; AuthProvider.logout runs it.
    await logout();
  };

  const isPublicRoute = isPublicAppRoute(pathname);
  const isLegalGateRoute = Boolean(pathname?.startsWith("/legal/"));

  const tenantId = me?.tenantId ?? null;
  const userId = me?.userId ?? null;
  const products = new Set(me?.activeProducts ?? []);
  const tenantProductEntitled = products.has(INDUSTRIAL_PRODUCT_CODE);
  const isPlatformAdmin = Boolean(me?.isPlatformAdmin);
  const adminSupport = isPlatformAdmin && !rolePreview;
  const hasIndustrialAccess = hasPermission("industrial.access");
  const permissions = new Set(me?.permissions ?? []);
  if (hasIndustrialAccess) {
    permissions.add("industrial.access");
  }
  // Platform admin support does not require ordinary customer product grants.
  // Customer users still need ACTIVE product + industrial.access.
  // Role preview uses the selected role's permissions (no platform-admin bypass).
  const entitled = hasProduct(INDUSTRIAL_PRODUCT_CODE);
  const hasAccess = Boolean(
    me &&
      tenantId &&
      (adminSupport ? hasIndustrialAccess : entitled && hasIndustrialAccess),
  );

  const exitRolePreviewButton =
    rolePreview != null ? (
      <button
        type="button"
        className="btn btn-warning"
        onClick={() => {
          exitRolePreview();
          router.push("/settings/roles/");
        }}
      >
        Exit role preview
      </button>
    ) : null;

  useEffect(() => {
    if (!me || !hasAccess || isPublicRoute || isLegalGateRoute) return;
    if (me.legalAcknowledgments?.status === "REQUIRED") {
      router.replace(me.legalAcknowledgments.gatePath || "/legal/acknowledge/");
    }
  }, [me, hasAccess, isPublicRoute, isLegalGateRoute, router]);

  // Prefer Settings icon when uploaded; restore default favicon when cleared.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = iconUrl.trim() || "/sneat/img/favicon.ico";
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [iconUrl]);

  // Vanity hosts map to a tenant via bundled vanity-login-branding (not public API).
  // Prefer that tenant once after sign-in so a leftover Creator localStorage
  // selection does not land users on "Product not entitled".
  useEffect(() => {
    if (!me) {
      setHostTenantSettled(false);
      return;
    }
    if (loading || loadingHost || hostTenantSettled) return;

    if (!hostTenantId) {
      setHostTenantSettled(true);
      return;
    }
    if (me.tenantId === hostTenantId) {
      setHostTenantSettled(true);
      return;
    }
    const selectable = me.tenants.some((t) => t.tenantId === hostTenantId && t.selectable);
    if (!selectable) {
      setHostTenantSettled(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await chooseTenant(hostTenantId);
      } finally {
        if (!cancelled) setHostTenantSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, loadingHost, me, hostTenantId, hostTenantSettled, chooseTenant]);

  useEffect(() => {
    if (!me?.userId) {
      setWelcomeFirstName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const profile = await apiGet<{
          firstName?: string | null;
          preferredName?: string | null;
          displayName?: string | null;
        }>("/api/v1/auth/profile");
        if (cancelled) return;
        setWelcomeFirstName(profileWelcomeName(profile));
      } catch {
        if (!cancelled) setWelcomeFirstName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.userId, me?.tenantId]);

  const facility = useIndustrialFacilityState(tenantId, hasAccess);

  useEffect(() => {
    if (!hasAccess || !tenantId) {
      setFlags({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<{
          industrialEnabled: boolean;
          modules: Array<{ code: string; awsEnabled: boolean; featureFlagKey?: string }>;
        }>("/api/v1/industrial/bootstrap");
        if (cancelled) return;
        const next: Record<string, boolean> = {
          "industrial.enabled": Boolean(boot.industrialEnabled),
        };
        for (const m of boot.modules) {
          const key = m.featureFlagKey ?? featureFlagForModule(m.code);
          next[key] = Boolean(m.awsEnabled);
        }
        setFlags(next);
      } catch {
        if (!cancelled) setFlags({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, tenantId, userId]);

  useEffect(() => {
    document.documentElement.classList.toggle("layout-menu-expanded", menuOpen);
  }, [menuOpen]);

  useEffect(() => {
    setTemplateSettings(readTemplateSettings());
    const onSettings = (event: Event) => {
      const next = (event as CustomEvent<{ settings: IndustrialTemplateSettings }>).detail
        ?.settings;
      if (next) setTemplateSettings(next);
    };
    window.addEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(TEMPLATE_SETTINGS_EVENT, onSettings);
  }, []);

  // Expand collapsed sidebar on hover (Sneat layout-menu-hover).
  useEffect(() => {
    if (templateSettings.layout !== "collapsed") {
      document.documentElement.classList.remove("layout-menu-hover");
      return;
    }
    const menu = document.getElementById("layout-menu");
    if (!menu) return;
    const onEnter = () => document.documentElement.classList.add("layout-menu-hover");
    const onLeave = () => document.documentElement.classList.remove("layout-menu-hover");
    menu.addEventListener("mouseenter", onEnter);
    menu.addEventListener("mouseleave", onLeave);
    return () => {
      menu.removeEventListener("mouseenter", onEnter);
      menu.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("layout-menu-hover");
    };
  }, [templateSettings.layout]);

  useEffect(() => {
    if (templateSettings.layout === "horizontal") setMenuOpen(false);
  }, [templateSettings.layout]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // FORGE-UI-S5: Escape closes drawer; lock body scroll while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Collapse overlay drawer when viewport crosses into desktop nav.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const nav = hasAccess
    ? [
        ...buildIndustrialNavigation({
          entitled: true,
          permissions,
          flags,
          enabledModules: me?.activeModules ?? [],
          strictEntitlements: true,
        }),
        {
          code: "SETTINGS",
          name: "Settings",
          group: "System Tools",
          route: "/settings/",
          migrationStatus: "LIVE",
          implementationStatus: "AVAILABLE" as const,
          awsEnabled: true,
          customerEnabled: true,
          available: true,
          requiredPermissions: ["industrial.access"],
        },
      ]
    : [];
  const groups = [...new Set(nav.map((n) => n.group))];
  const navGroupKey = groups.join("|");

  useEffect(() => {
    if (!navGroupKey) return;
    const groupList = navGroupKey.split("|");
    const path = normalizeAppPath(pathname);
    const activeGroup =
      nav.find((item) => routeIsActive(pathname, item.route))?.group ?? null;

    setOpenGroups((prev) => {
      let next = prev;
      if (!navGroupsHydrated.current) {
        navGroupsHydrated.current = true;
        const stored = readStoredOpenGroups();
        next = { ...stored };
        for (const group of groupList) {
          if (typeof next[group] !== "boolean") next[group] = false;
        }
      }
    // Only auto-expand when the route changes — never fight a user collapse click.
    if (activeGroup && lastAutoOpenPath.current !== path) {
      lastAutoOpenPath.current = path;
      next = { ...next };
      for (const g of groupList) {
        next[g] = g === activeGroup;
      }
    }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navGroupKey stands in for groups/nav
  }, [navGroupKey, pathname]);

  useEffect(() => {
    if (!navGroupsHydrated.current) return;
    try {
      window.localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(openGroups));
    } catch {
      // ignore quota / private mode
    }
  }, [openGroups]);

  const toggleNavGroup = (group: string) => {
    setOpenGroups((prev) => {
      if (prev[group] === true) {
        return { ...prev, [group]: false };
      }
      const next = { ...prev };
      for (const g of Object.keys(next)) {
        next[g] = false;
      }
      next[group] = true;
      return next;
    });
  };

  if (isPublicRoute) {
    return <>{children}</>;
  }

  const gatePrimary = loginPrimaryColor || primaryColor || undefined;
  const gateBrand = {
    brandLabel: login.brandLabel,
    // Prefer theme-resolved Settings/config logos from useTenantBranding.
    ...(logoUrl ? { logoUrl } : login.logoUrl ? { logoUrl: login.logoUrl } : {}),
    ...(gatePrimary ? { primaryColor: gatePrimary } : {}),
  };

  // Only show the login-styled GateCard while we have no session at all.
  // Remounts after static-export soft-nav failures keep a cached `me` (and token),
  // so we must not flash "Loading your session…" on every click.
  if (loading && !me) {
    return <GateCard title={productDisplayName} body="Loading your session…" {...gateBrand} />;
  }

  if (!me) {
    return (
      <GateCard
        title={login.headline}
        body={login.body}
        centerText
        {...gateBrand}
      >
        {error ? (
          <div className="alert alert-warning" role="alert">
            <div>{error}</div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mt-2"
              onClick={() => void refresh()}
            >
              Retry session check
            </button>
          </div>
        ) : null}
        <CognitoPasswordLoginForm
          submitLabel={login.buttonLabel}
          {...(gatePrimary ? { primaryColor: gatePrimary } : {})}
        />
      </GateCard>
    );
  }

  if (!me.tenantId) {
    const selectable = me.tenants.filter((t) => t.selectable);
    return (
      <GateCard
        title="Select a tenant"
        body="Choose a tenant to continue."
        muted="No tenant selected"
        {...gateBrand}
      >
        <div className="d-grid gap-2">
          {selectable.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              className="btn btn-outline-primary"
              onClick={() => void chooseTenant(t.tenantId)}
            >
              {t.displayName}
            </button>
          ))}
        </div>
      </GateCard>
    );
  }

  if (!entitled && !adminSupport) {
    const alternates = me.tenants.filter(
      (t) => t.selectable && t.tenantId !== me.tenantId,
    );
    return (
      <GateCard
        title={rolePreview ? "Role preview: product not entitled" : "Product not entitled"}
        body={
          rolePreview
            ? `Viewing as ${rolePreview.roleName}. This tenant is not entitled to ${productDisplayName}, so this role cannot use the product.`
            : `This tenant is not entitled to ${productDisplayName}.`
        }
        muted="Unauthorized product access"
        {...gateBrand}
      >
        {exitRolePreviewButton ? <div className="mb-3">{exitRolePreviewButton}</div> : null}
        {alternates.length > 0 && !rolePreview ? (
          <div className="d-grid gap-2 mb-3">
            <p className="text-muted mb-0">Switch to another tenant:</p>
            {alternates.map((t) => (
              <button
                key={t.tenantId}
                type="button"
                className="btn btn-outline-primary"
                onClick={() => void chooseTenant(t.tenantId)}
              >
                {t.displayName}
              </button>
            ))}
          </div>
        ) : null}
        {!rolePreview ? (
          <button
            type="button"
            className="btn btn-outline-secondary d-grid w-100"
            onClick={() => confirmLeave(() => void signOut())}
          >
            Sign out
          </button>
        ) : null}
      </GateCard>
    );
  }

  if (adminSupport && !tenantId) {
    const selectable = me.tenants.filter((t) => t.selectable);
    return (
      <GateCard
        title="Select a customer"
        body="Platform Admin support requires an explicit customer tenant context."
        muted="Administrative Access"
        {...gateBrand}
      >
        <div className="d-grid gap-2">
          {selectable.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              className="btn btn-outline-primary"
              onClick={() =>
                void chooseTenant(t.tenantId)
              }
            >
              {t.displayName}
            </button>
          ))}
        </div>
      </GateCard>
    );
  }

  if (!hasIndustrialAccess) {
    return (
      <GateCard
        title={rolePreview ? "Role preview: access denied" : "Access denied"}
        body={
          rolePreview
            ? `Viewing as ${rolePreview.roleName}. This role does not include industrial.access, so the platform is hidden for this preview.`
            : `You do not have permission to access ${productDisplayName}.`
        }
        muted={
          rolePreview
            ? `Missing industrial.access on ${rolePreview.roleCode}`
            : "Missing industrial.access"
        }
        {...gateBrand}
      >
        {exitRolePreviewButton}
      </GateCard>
    );
  }

  if (isLegalGateRoute) {
    return (
      <div className="layout-wrapper">
        <EnvironmentBanner environment={appEnv} />
        <div className="content-wrapper">
          <div className="container-xxl flex-grow-1 container-p-y">{children}</div>
        </div>
      </div>
    );
  }

  const selectableTenants = me.tenants.filter((t) => t.selectable);
  const activeTenant =
    selectableTenants.find((t) => t.tenantId === me.tenantId) ??
    me.tenants.find((t) => t.tenantId === me.tenantId);
  const tenantLabel = activeTenant?.displayName ?? me.tenantId;
  const navLogo = navLogoForTenant({
    slug: activeTenant?.slug,
    displayName: activeTenant?.displayName ?? tenantLabel,
    theme: themeMode,
    logoLightUrl,
    logoDarkUrl,
    brandingLogoUrl: logoUrl,
  });

  const onTenantChange = async (nextTenantId: string) => {
    if (!nextTenantId || nextTenantId === me.tenantId || tenantSwitching) return;
    setTenantSwitching(true);
    try {
      await chooseTenant(nextTenantId);
    } finally {
      setTenantSwitching(false);
    }
  };

  const welcomeLabel = welcomeFirstName ? `Welcome, ${welcomeFirstName}` : "My profile";

  const verticalMenuItems = (
    <ul className="menu-inner py-1">
      <li className={routeIsActive(pathname, "/") ? "menu-item active" : "menu-item"}>
        <Link href="/" className="menu-link" onClick={() => setMenuOpen(false)}>
          <i className="menu-icon tf-icons bx bx-home-circle" />
          <div>Dashboard</div>
        </Link>
      </li>
      <li
        className={
          pathname === "/modules/analytics" || pathname === "/modules/analytics/"
            ? "menu-item active"
            : "menu-item"
        }
      >
        <Link href="/modules/analytics/" className="menu-link" onClick={() => setMenuOpen(false)}>
          <i className="menu-icon tf-icons bx bx-bar-chart-alt-2" />
          <div>Analytics</div>
        </Link>
      </li>
      {groups
        .filter((group) => group !== "Dashboard")
        .map((group) => {
          const items = nav.filter((item) => item.group === group && item.available);
          if (items.length === 0) return null;
          const groupOpen = openGroups[group] === true;
          const groupHasActive = items.some((item) => routeIsActive(pathname, item.route));
          return (
            <li
              key={`grp-${group}`}
              className={`menu-item${groupOpen ? " open" : ""}${groupHasActive ? " active" : ""}`}
            >
              <a
                href={`#nav-${group.replace(/\s+/g, "-").toLowerCase()}`}
                className="menu-link menu-toggle"
                aria-expanded={groupOpen}
                onClick={(event) => {
                  event.preventDefault();
                  toggleNavGroup(group);
                }}
              >
                <i className={`menu-icon tf-icons bx ${iconForModule("", group)}`} />
                <div>{group}</div>
              </a>
              {groupOpen ? (
                <ul className="menu-sub">
                  {items.map((item) => {
                    const active = routeIsActive(pathname, item.route);
                    const comingSoon = isComingSoonModule(item.code);
                    return (
                      <li key={item.code} className={active ? "menu-item active" : "menu-item"}>
                        <Link
                          href={item.route}
                          className="menu-link"
                          aria-current={active ? "page" : undefined}
                          title={comingSoon ? `${item.name} (Coming soon)` : item.name}
                          onClick={() => setMenuOpen(false)}
                        >
                          {comingSoon ? (
                            <ComingSoonNavIcon className="menu-icon tf-icons" />
                          ) : (
                            <i
                              className={`menu-icon tf-icons bx ${iconForModule(item.code, item.group)}`}
                            />
                          )}
                          <div>{item.name}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      <li
        className={`${routeIsActive(pathname, "/my-training/") ? "menu-item active" : "menu-item"} menu-item-pinned`}
      >
        <Link
          href="/my-training/"
          className="menu-link"
          aria-current={routeIsActive(pathname, "/my-training/") ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <i className="menu-icon tf-icons bx bx-book-reader" />
          <div>My Training</div>
        </Link>
      </li>
      <li
        className={`${routeIsActive(pathname, "/profile/") ? "menu-item active" : "menu-item"} menu-item-pinned`}
      >
        <Link
          href="/profile/"
          className="menu-link"
          aria-current={routeIsActive(pathname, "/profile/") ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <i className="menu-icon tf-icons bx bx-user" />
          <div>My profile</div>
        </Link>
      </li>
    </ul>
  );

  return (
    <IndustrialFacilityProvider value={facility}>
    <div className={shellWrapperClass} style={brandStyle}>
      <div className="layout-container">
        <aside
          id="layout-menu"
          className={`layout-menu menu-vertical menu bg-menu-theme${isHorizontalLayout ? " ind-horizontal-drawer" : ""}`}
        >
          <div className="app-brand">
            <BrandLockup
              href="/"
              label={navLogo?.label || appShortName}
              primaryColor={primaryColor || "#696cff"}
              onClick={() => setMenuOpen(false)}
              {...(navLogo?.src ? { logoUrl: navLogo.src } : logoUrl ? { logoUrl } : {})}
            />
            <button
              type="button"
              className={desktopMenuCloseClass}
              aria-label="Close menu"
              aria-expanded={menuOpen}
              aria-controls="layout-menu"
              onClick={() => setMenuOpen(false)}
            >
              <i className="bx bx-chevron-left bx-sm align-middle" />
            </button>
          </div>

          <div className="menu-inner-shadow" />
          {verticalMenuItems}
        </aside>

        <div className="layout-page">
          <nav className={navbarClass} id="layout-navbar">
            <div className={menuToggleClass}>
              <button
                type="button"
                className="nav-item nav-link px-0 me-xl-4 btn btn-link"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="layout-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <i className="bx bx-menu bx-sm" aria-hidden="true" />
              </button>
            </div>

            {isHorizontalLayout ? (
              <div className="navbar-nav align-items-center me-auto d-none d-xl-flex">
                <BrandLockup
                  href="/"
                  label={navLogo?.label || appShortName}
                  primaryColor={primaryColor || "#696cff"}
                  textClassName="app-brand-text demo menu-text fw-bolder ms-2"
                  {...(navLogo?.src ? { logoUrl: navLogo.src } : logoUrl ? { logoUrl } : {})}
                />
              </div>
            ) : null}

            <div className="navbar-nav-right ind-navbar-toolbar d-flex align-items-center gap-2 w-100" id="navbar-collapse">
              <div className="ind-navbar-toolbar__start d-flex align-items-center gap-2 min-w-0">
                {normalizeAppPath(pathname) !== "/" ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-shrink-0"
                    aria-label="Go back to previous page"
                    onClick={() =>
                      confirmLeave(() => {
                        if (typeof window !== "undefined" && window.history.length > 1) {
                          router.back();
                        } else {
                          router.push("/");
                        }
                      })
                    }
                  >
                    <i className="bx bx-arrow-back" aria-hidden="true" />
                    <span className="ind-navbar-back-label ms-1">Back</span>
                  </button>
                ) : null}
                {rolePreview ? (
                  <span
                    className="badge bg-label-info ind-navbar-admin-badge d-inline-flex align-items-center gap-2"
                    title={`UI preview as ${rolePreview.roleName}. API calls still use your Creator session.`}
                  >
                    <span className="ind-navbar-admin-badge__full">
                      Viewing as role: {rolePreview.roleName}
                    </span>
                    <span className="ind-navbar-admin-badge__short">As {rolePreview.roleName}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-info py-0 px-1"
                      onClick={() => {
                        exitRolePreview();
                        router.push("/settings/roles/");
                      }}
                    >
                      Exit
                    </button>
                  </span>
                ) : adminSupport ? (
                  <span
                    className="badge bg-label-warning ind-navbar-admin-badge"
                    title={
                      tenantProductEntitled
                        ? `Platform administrative support context — viewing ${tenantLabel}`
                        : `Platform administrative support context — viewing ${tenantLabel} · Product not enabled for this customer`
                    }
                  >
                    <span className="ind-navbar-admin-badge__full">
                      Platform Admin · Viewing: {tenantLabel}
                      {!tenantProductEntitled ? " · Product not enabled" : ""}
                    </span>
                    <span className="ind-navbar-admin-badge__short">Admin · {tenantLabel}</span>
                  </span>
                ) : null}
                <label className="nav-item ind-tenant-switcher mb-0">
                  <i className="bx bx-buildings flex-shrink-0" aria-hidden="true" />
                  <span className="ind-tenant-switcher__label">Tenant</span>
                  {selectableTenants.length > 1 ? (
                    <select
                      className="form-select form-select-sm"
                      aria-label="Switch tenant"
                      value={me.tenantId ?? ""}
                      disabled={tenantSwitching}
                      onChange={(event) => {
                        const nextTenantId = event.target.value;
                        confirmLeave(() => void onTenantChange(nextTenantId));
                      }}
                    >
                      {selectableTenants.map((t) => (
                        <option key={t.tenantId} value={t.tenantId}>
                          {t.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted small text-truncate" title={tenantLabel}>
                      {tenantLabel}
                    </span>
                  )}
                  {tenantSwitching ? (
                    <span className="text-muted small flex-shrink-0" role="status">
                      Switching…
                    </span>
                  ) : null}
                </label>
                {facility.facilities.length > 0 ? (
                  <label className="nav-item ind-tenant-switcher mb-0">
                    <i className="bx bx-map flex-shrink-0" aria-hidden="true" />
                    <span className="ind-tenant-switcher__label">Location</span>
                    <select
                      className="form-select form-select-sm"
                      aria-label="Active location"
                      value={facility.facilityId}
                      onChange={(event) => facility.setFacilityId(event.target.value)}
                    >
                      {facility.facilities.length > 1 ? (
                        <option value={ALL_FACILITIES_ID}>All locations</option>
                      ) : null}
                      {facility.facilities.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isLotoScopeRoute(pathname) && facility.departmentsForFacility.length > 0 ? (
                  <label className="nav-item ind-tenant-switcher mb-0">
                    <i className="bx bx-buildings flex-shrink-0" aria-hidden="true" />
                    <span className="ind-tenant-switcher__label">Department</span>
                    <select
                      className="form-select form-select-sm"
                      aria-label="Active department"
                      value={facility.departmentId}
                      onChange={(event) => facility.setDepartmentId(event.target.value)}
                    >
                      <option value={ALL_DEPARTMENTS_ID}>All departments</option>
                      {facility.departmentsForFacility.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <ul className="navbar-nav ind-navbar-toolbar__end flex-row align-items-center ms-auto flex-nowrap gap-1 min-w-0">
                {me?.isDemoTenant ? (
                  <li className="nav-item d-flex align-items-center">
                    <span className="forge-demo-env-badge forge-demo-env-badge--navbar">
                      DEMO ENVIRONMENT
                    </span>
                  </li>
                ) : null}
                <IndustrialMessagingNavButton />
                <IndustrialNotificationMenu />
                <li className="nav-item d-flex align-items-center gap-2 flex-nowrap min-w-0">
                  <Link
                    href="/settings/"
                    className="btn btn-sm btn-outline-secondary text-decoration-none flex-shrink-0"
                    title="Settings"
                    aria-label="Settings"
                  >
                    <i className="bx bx-cog d-xl-none" aria-hidden="true" />
                    <span className="ind-navbar-end-label d-none d-xl-inline">Settings</span>
                  </Link>
                  <ThemeModeToggle openCustomizer />
                  <Link
                    href="/profile/"
                    className="nav-link px-0 text-body fw-semibold text-decoration-none ind-navbar-profile-link"
                    aria-label={welcomeLabel === "My profile" ? "Open my profile" : welcomeLabel}
                    title={welcomeLabel}
                  >
                    {welcomeLabel}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-shrink-0"
                    title="Sign out"
                    aria-label="Sign out"
                    onClick={() => confirmLeave(() => void signOut())}
                  >
                    <i className="bx bx-log-out d-xl-none" aria-hidden="true" />
                    <span className="ind-navbar-end-label d-none d-xl-inline">Sign out</span>
                  </button>
                </li>
              </ul>
            </div>
          </nav>

          {isHorizontalLayout ? (
            <div className="ind-horizontal-nav d-none d-xl-block bg-menu-theme">
              <div className={contentContainerClass}>
                <ul className="ind-horizontal-nav__list">
                  <li className={routeIsActive(pathname, "/") ? "is-active" : undefined}>
                    <Link href="/" className="ind-horizontal-nav__link">
                      <i className="bx bx-home-circle" aria-hidden="true" />
                      <span>Dashboard</span>
                    </Link>
                  </li>
                  <li
                    className={
                      pathname === "/modules/analytics" || pathname === "/modules/analytics/"
                        ? "is-active"
                        : undefined
                    }
                  >
                    <Link href="/modules/analytics/" className="ind-horizontal-nav__link">
                      <i className="bx bx-bar-chart-alt-2" aria-hidden="true" />
                      <span>Analytics</span>
                    </Link>
                  </li>
                  {groups
                    .filter((group) => group !== "Dashboard")
                    .map((group) => {
                      const items = nav.filter((item) => item.group === group && item.available);
                      if (items.length === 0) return null;
                      const groupHasActive = items.some((item) =>
                        routeIsActive(pathname, item.route),
                      );
                      return (
                        <li
                          key={`hgrp-${group}`}
                          className={`ind-horizontal-nav__group${groupHasActive ? " is-active" : ""}`}
                        >
                          <button type="button" className="ind-horizontal-nav__link" aria-haspopup="true">
                            <i className={`bx ${iconForModule("", group)}`} aria-hidden="true" />
                            <span>{group}</span>
                            <i className="bx bx-chevron-down ind-horizontal-nav__caret" aria-hidden="true" />
                          </button>
                          <ul className="ind-horizontal-nav__submenu" role="menu">
                            {items.map((item) => {
                              const active = routeIsActive(pathname, item.route);
                              const comingSoon = isComingSoonModule(item.code);
                              return (
                                <li key={item.code} role="none">
                                  <Link
                                    href={item.route}
                                    className={`ind-horizontal-nav__sublink${active ? " is-active" : ""}`}
                                    role="menuitem"
                                    aria-current={active ? "page" : undefined}
                                    title={comingSoon ? `${item.name} (Coming soon)` : item.name}
                                  >
                                    {comingSoon ? (
                                      <ComingSoonNavIcon />
                                    ) : (
                                      <i
                                        className={`bx ${iconForModule(item.code, item.group)}`}
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span>{item.name}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      );
                    })}
                  <li className={routeIsActive(pathname, "/my-training/") ? "is-active" : undefined}>
                    <Link href="/my-training/" className="ind-horizontal-nav__link">
                      <i className="bx bx-book-reader" aria-hidden="true" />
                      <span>My Training</span>
                    </Link>
                  </li>
                  <li className={routeIsActive(pathname, "/profile/") ? "is-active" : undefined}>
                    <Link href="/profile/" className="ind-horizontal-nav__link">
                      <i className="bx bx-user" aria-hidden="true" />
                      <span>My profile</span>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          <div className="content-wrapper">
            <NetworkStatusBanner />
            <div className={`${contentContainerClass} flex-grow-1 container-p-y ind-content-pad`}>
              <div className="ind-content">{children}</div>
            </div>
            <footer className="content-footer footer bg-footer-theme">
              <div className={`${contentContainerClass} d-flex flex-wrap justify-content-between py-2 flex-md-row flex-column`}>
                <div className="mb-2 mb-md-0 small text-muted">
                  © {new Date().getFullYear()} Forge Industrial Safety, a division of Forge Public
                  Safety
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>

      <MessagingPopout />
      <ThemeCustomizer />

      {menuOpen ? (
        <button
          type="button"
          className="layout-overlay layout-menu-toggle"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : (
        <div className="layout-overlay layout-menu-toggle" aria-hidden="true" />
      )}
    </div>
    </IndustrialFacilityProvider>
  );
}

export function IndustrialShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnvironmentBanner environment={appEnv} />
      <UnsavedChangesProvider>
        <BodyRegionsProvider>
          <MessagingPopoutProvider>
            <WalkthroughProvider>
              <ShellBody>{children}</ShellBody>
              <WalkthroughOverlayHost />
            </WalkthroughProvider>
          </MessagingPopoutProvider>
        </BodyRegionsProvider>
      </UnsavedChangesProvider>
    </AuthProvider>
  );
}
