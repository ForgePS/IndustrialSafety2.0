"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, apiGet, useAuth } from "@forge/web-kit";
import { EnvironmentBanner } from "@forge/ui";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { buildIndustrialNavigation, featureFlagForModule } from "@/lib/navigation";
import { clearAllOfflineData } from "@/lib/offline/cache";
import { NetworkStatusBanner } from "@/lib/offline/network-status";
import { ThemeModeToggle, useIndustrialThemeMode } from "@/components/theme-mode-toggle";
import { ForgeIndustrialMark } from "@/components/forge-industrial-mark";
import { FieldQuickBar } from "@/components/field-quick-bar";
import { useLoginBranding } from "@/hooks/use-login-branding";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import { navLogoForTenant } from "@/lib/tenant-nav-logo";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";
const NAV_GROUPS_STORAGE_KEY = "forge-ind-nav-open-groups-v2";
const FACILITY_STORAGE_KEY = "forge-ind-active-facility-id";

function normalizeAppPath(path: string | null | undefined): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function routeIsActive(pathname: string | null | undefined, route: string): boolean {
  return normalizeAppPath(pathname) === normalizeAppPath(route);
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

function GateCard({
  title,
  body,
  muted,
  children,
  brandLabel = "Industrial",
  logoUrl,
  primaryColor,
}: {
  title: string;
  body: string;
  muted?: string;
  children?: ReactNode;
  brandLabel?: string;
  logoUrl?: string;
  primaryColor?: string;
}) {
  const primaryStyle = primaryColor
    ? ({ ["--bs-primary"]: primaryColor } as CSSProperties)
    : undefined;
  return (
    <div className="container-xxl" style={primaryStyle}>
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner">
          <div className="card">
            <div className="card-body">
              <div className="app-brand justify-content-center mb-4">
                <BrandLockup
                  label={brandLabel}
                  textClassName="app-brand-text text-body fw-bolder ms-2"
                  {...(logoUrl ? { logoUrl } : {})}
                  {...(primaryColor ? { primaryColor } : {})}
                />
              </div>
              <h4 className="mb-2">{title}</h4>
              <p className="mb-4">{body}</p>
              {muted ? <p className="text-muted mb-4">{muted}</p> : null}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellBody({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, loading, error, logout, loginWithCognito, chooseTenant, hasPermission, hasProduct } =
    useAuth();
  const {
    productDisplayName,
    appShortName,
    logoUrl,
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
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [hostTenantSettled, setHostTenantSettled] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string>("");
  const navGroupsHydrated = useRef(false);
  const lastAutoOpenPath = useRef<string | null>(null);

  // Dark forest brand primaries clash on dark surfaces — keep Sneat purple in dark mode.
  const brandStyle = (
    themeMode === "dark"
      ? {}
      : {
          ...(primaryColor ? { ["--bs-primary"]: primaryColor } : {}),
          ...(secondaryColor ? { ["--ind-brand-secondary"]: secondaryColor } : {}),
          ...(accentColor && !primaryColor ? { ["--bs-primary"]: accentColor } : {}),
        }
  ) as CSSProperties;

  const signOut = async () => {
    clearAllOfflineData();
    await logout();
  };

  const isPublicAuthRoute =
    Boolean(pathname?.startsWith("/auth/callback")) || Boolean(pathname?.startsWith("/health"));

  const tenantId = me?.tenantId ?? null;
  const userId = me?.userId ?? null;
  const products = new Set(me?.activeProducts ?? []);
  const tenantProductEntitled = products.has(INDUSTRIAL_PRODUCT_CODE);
  const isPlatformAdmin = Boolean(me?.isPlatformAdmin);
  const adminSupport = isPlatformAdmin;
  const hasIndustrialAccess = hasPermission("industrial.access");
  const permissions = new Set(me?.permissions ?? []);
  if (hasIndustrialAccess) {
    permissions.add("industrial.access");
  }
  // Platform admin support does not require ordinary customer product grants.
  // Customer users still need ACTIVE product + industrial.access.
  const entitled = hasProduct(INDUSTRIAL_PRODUCT_CODE);
  const hasAccess = Boolean(
    me &&
      tenantId &&
      (adminSupport ? hasIndustrialAccess : entitled && hasIndustrialAccess),
  );

  // Vanity hosts (e.g. producers-rice-mill) map to a tenant via login-branding.
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
    if (!me?.tenantId || !me.personId) {
      setWelcomeFirstName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const person = await apiGet<{ firstName?: string | null; preferredName?: string | null }>(
          `/api/v1/tenants/${me.tenantId}/persons/${me.personId}`,
        );
        if (cancelled) return;
        const first = person.firstName?.trim() || person.preferredName?.trim() || "";
        setWelcomeFirstName(first || null);
      } catch {
        if (!cancelled) setWelcomeFirstName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId, me?.personId]);

  useEffect(() => {
    if (!hasAccess || !tenantId) {
      setFacilities([]);
      setActiveFacilityId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiGet<
          Array<{ id: string; name?: string | null; facilityKey?: string | null }>
        >(`/api/v1/tenants/${tenantId}/facilities`);
        if (cancelled) return;
        const list = (rows ?? [])
          .map((row) => ({
            id: row.id,
            name: (row.name?.trim() || row.facilityKey?.trim() || row.id).trim(),
          }))
          .filter((row) => Boolean(row.id));
        setFacilities(list);
        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(FACILITY_STORAGE_KEY) : null;
        const next =
          (stored && list.some((f) => f.id === stored) ? stored : null) ?? list[0]?.id ?? "";
        setActiveFacilityId(next);
        if (next && typeof window !== "undefined") {
          window.localStorage.setItem(FACILITY_STORAGE_KEY, next);
        }
      } catch {
        if (!cancelled) {
          setFacilities([]);
          setActiveFacilityId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, tenantId]);

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
        if (!next[activeGroup]) next = { ...next, [activeGroup]: true };
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
      const currentlyOpen = prev[group] === true;
      return { ...prev, [group]: !currentlyOpen };
    });
  };

  if (isPublicAuthRoute) {
    return <>{children}</>;
  }

  const gatePrimary = loginPrimaryColor || primaryColor || undefined;
  const gateBrand = {
    brandLabel: login.brandLabel,
    ...(login.logoUrl ? { logoUrl: login.logoUrl } : logoUrl ? { logoUrl } : {}),
    ...(gatePrimary ? { primaryColor: gatePrimary } : {}),
  };

  if (loading || (Boolean(me) && !hostTenantSettled)) {
    return <GateCard title={productDisplayName} body="Loading your session…" {...gateBrand} />;
  }

  if (error || !me) {
    return (
      <GateCard
        title={login.headline}
        body={login.body}
        muted={error ? error : login.statusText}
        {...gateBrand}
      >
        <button
          type="button"
          className="btn btn-primary d-grid w-100"
          style={
            gatePrimary
              ? {
                  backgroundColor: gatePrimary,
                  borderColor: gatePrimary,
                }
              : undefined
          }
          onClick={() => void loginWithCognito()}
        >
          {login.buttonLabel}
        </button>
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
        title="Product not entitled"
        body={`This tenant is not entitled to ${productDisplayName}.`}
        muted="Unauthorized product access"
        {...gateBrand}
      >
        {alternates.length > 0 ? (
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
        <button type="button" className="btn btn-outline-secondary d-grid w-100" onClick={() => void signOut()}>
          Sign out
        </button>
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
        title="Access denied"
        body={`You do not have permission to access ${productDisplayName}.`}
        muted="Missing industrial.access"
        {...gateBrand}
      />
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

  const welcomeLabel = welcomeFirstName ? `Welcome ${welcomeFirstName}` : "My profile";

  return (
    <div className="layout-wrapper layout-content-navbar" style={brandStyle}>
      <div className="layout-container">
        <aside id="layout-menu" className="layout-menu menu-vertical menu bg-menu-theme">
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
              className="layout-menu-toggle menu-link text-large ms-auto d-block d-xl-none btn btn-link p-0 border-0"
              aria-label="Close menu"
              aria-expanded={menuOpen}
              aria-controls="layout-menu"
              onClick={() => setMenuOpen(false)}
            >
              <i className="bx bx-chevron-left bx-sm align-middle" />
            </button>
          </div>

          <div className="menu-inner-shadow" />

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
            <li className={pathname === "/profile" || pathname === "/profile/" ? "menu-item active" : "menu-item"}>
              <Link href="/profile/" className="menu-link" onClick={() => setMenuOpen(false)}>
                <i className="menu-icon tf-icons bx bx-user" />
                <div>My profile</div>
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
                          return (
                            <li key={item.code} className={active ? "menu-item active" : "menu-item"}>
                              <Link
                                href={item.route}
                                className="menu-link"
                                aria-current={active ? "page" : undefined}
                                onClick={() => setMenuOpen(false)}
                              >
                                <i className={`menu-icon tf-icons bx ${iconForModule(item.code, item.group)}`} />
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
          </ul>
        </aside>

        <div className="layout-page">
          <nav
            className="layout-navbar container-xxl navbar navbar-expand-xl navbar-detached align-items-center bg-navbar-theme"
            id="layout-navbar"
          >
            <div className="layout-menu-toggle navbar-nav align-items-xl-center me-3 me-xl-0 d-xl-none">
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

            <div className="navbar-nav-right d-flex align-items-center flex-wrap gap-2 w-100" id="navbar-collapse">
              <div className="navbar-nav align-items-center flex-grow-1 min-w-0 gap-2 flex-wrap">
                {adminSupport ? (
                  <span
                    className="badge bg-label-warning text-wrap"
                    title="Platform administrative support context — not customer impersonation"
                  >
                    Platform Admin · Viewing: {tenantLabel}
                    {!tenantProductEntitled ? " · Product not enabled for this customer" : ""}
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
                      onChange={(event) => void onTenantChange(event.target.value)}
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
                {facilities.length > 0 ? (
                  <label className="nav-item ind-tenant-switcher mb-0">
                    <i className="bx bx-map flex-shrink-0" aria-hidden="true" />
                    <span className="ind-tenant-switcher__label">Facility</span>
                    <select
                      className="form-select form-select-sm"
                      aria-label="Active facility"
                      value={activeFacilityId}
                      onChange={(event) => {
                        const next = event.target.value;
                        setActiveFacilityId(next);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(FACILITY_STORAGE_KEY, next);
                        }
                      }}
                    >
                      {facilities.map((facility) => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <ul className="navbar-nav flex-row align-items-center ms-auto flex-shrink-0">
                <li className="nav-item d-flex align-items-center gap-2 flex-wrap">
                  <Link
                    href="/settings/"
                    className="btn btn-sm btn-outline-secondary text-decoration-none"
                    title="Settings"
                  >
                    Settings
                  </Link>
                  <ThemeModeToggle />
                  <Link
                    href="/profile/"
                    className="nav-link px-0 text-body fw-semibold text-decoration-none"
                    aria-label={welcomeLabel === "My profile" ? "Open my profile" : welcomeLabel}
                    title="My profile"
                  >
                    {welcomeLabel}
                  </Link>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          </nav>

          <div className="content-wrapper">
            <NetworkStatusBanner />
            <div className="container-xxl flex-grow-1 container-p-y ind-content-pad">
              <div className="ind-content">{children}</div>
            </div>
            <footer className="content-footer footer bg-footer-theme">
              <div className="container-xxl d-flex flex-wrap justify-content-between py-2 flex-md-row flex-column">
                <div className="mb-2 mb-md-0 small text-muted">
                  © {new Date().getFullYear()} Forge Industrial Safety, a division of Forge Public
                  Safety
                </div>
              </div>
            </footer>
            <FieldQuickBar />
          </div>
        </div>
      </div>

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
  );
}

export function IndustrialShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnvironmentBanner environment={appEnv} />
      <ShellBody>{children}</ShellBody>
    </AuthProvider>
  );
}
