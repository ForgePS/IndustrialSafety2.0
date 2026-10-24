"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FxBreadcrumb } from "@forge/fx-layouts";
import { FxButton, FxEnvBanner, FxOfflineIndicator } from "@forge/fx-ui";
import { applyFxTheme, type FxTheme } from "@forge/fx-design-tokens";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import { buildBreadcrumbs } from "../breadcrumbs/breadcrumb.adapter";
import { LegacyNavigationBridge } from "../compatibility/LegacyNavigationBridge";
import { HelpEntryPoint } from "../entry-points/HelpEntryPoint";
import { MyWorkEntryPoint } from "../entry-points/MyWorkEntryPoint";
import { NotificationsEntryPoint } from "../entry-points/NotificationsEntryPoint";
import { SearchEntryPoint } from "../entry-points/SearchEntryPoint";
import { SupportEntryPoint } from "../entry-points/SupportEntryPoint";
import { EnvironmentIndicator, classifyEnvironment } from "../identity/EnvironmentIndicator";
import { ProductIdentity } from "../identity/ProductIdentity";
import { TenantIdentity } from "../identity/TenantIdentity";
import { buildPrimaryNavigation, buildSecondaryNavigation } from "../navigation/navigation.adapter";
import type { RmsFxPresentationFlags } from "../flags/rms-fx-flags";
import "./rms-fx-shell.css";

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;

function isActive(pathname: string, path: string, exact?: boolean): boolean {
  if (exact) return pathname === path;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path.replace(/\/$/, ""));
}

export function RmsFxShell({
  children,
  presentation,
}: {
  children: ReactNode;
  presentation: RmsFxPresentationFlags;
}) {
  const pathname = usePathname();
  const { me, loading, error, logout } = useAuth();
  const { flags } = useFeatureFlags(Object.values(RMS_FEATURE_FLAGS));
  const [theme, setTheme] = useState<FxTheme>("light");
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    applyFxTheme(theme);
  }, [theme]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const list = Array.from(focusable);
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const trigger = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [navOpen]);

  const groups = buildPrimaryNavigation(flags, { authenticated: Boolean(me) });
  const secondary = presentation.navigationEnabled
    ? buildSecondaryNavigation(pathname, flags, { authenticated: Boolean(me) })
    : [];
  const breadcrumbs = buildBreadcrumbs(pathname);
  const envKind = classifyEnvironment(appEnv);
  const showEnvBanner = envKind !== "production";

  const navContent = (
    <>
      <ProductIdentity />
      <div style={{ height: "var(--fx-space-12)" }} />
      <TenantIdentity tenantId={me?.tenantId} loading={loading} />
      {!loading && error ? <p className="rms-fx-muted">{error}</p> : null}
      <div style={{ height: "var(--fx-space-16)" }} />
      <LegacyNavigationBridge groups={groups} pathname={pathname} />
      <nav className="rms-fx-shell__nav-group" aria-label="Session">
        <p className="rms-fx-shell__nav-group-label">Session</p>
        {me ? (
          <>
            <Link href="/select-tenant/">Switch tenant</Link>
            <FxButton tone="ghost" onClick={() => void logout()}>
              Sign out
            </FxButton>
          </>
        ) : (
          <Link href="/login/">Sign in</Link>
        )}
      </nav>
    </>
  );

  return (
    <div className="rms-fx-shell" data-rms-shell={presentation.source} data-testid="rms-fx-shell">
      {showEnvBanner ? (
        <FxEnvBanner>
          Forge RMS · {envKind === "unknown" ? "Unknown environment" : envKind} — not a silent
          production surface
        </FxEnvBanner>
      ) : null}
      <header className="rms-fx-shell__header">
        <button
          ref={menuButtonRef}
          type="button"
          className="fx-btn fx-btn--secondary rms-fx-mobile-only"
          aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={navOpen}
          aria-controls="rms-fx-mobile-nav"
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? "Close menu" : "Menu"}
        </button>
        <ProductIdentity compact />
        <EnvironmentIndicator environment={appEnv} />
        <div className="rms-fx-shell__header-actions">
          <SearchEntryPoint />
          <MyWorkEntryPoint />
          <NotificationsEntryPoint />
          <HelpEntryPoint />
          <SupportEntryPoint environment={appEnv} {...(appVersion ? { appVersion } : {})} />
          <label className="rms-fx-label" htmlFor="rms-fx-theme">
            Theme
          </label>
          <select
            id="rms-fx-theme"
            className="fx-field__input"
            style={{ minHeight: 44, width: "auto" }}
            value={theme}
            onChange={(event) => setTheme(event.target.value as FxTheme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </div>
      </header>

      <div className="rms-fx-shell__body">
        <aside className="rms-fx-shell__nav rms-fx-desktop-only" aria-label="Primary">
          {navContent}
        </aside>
        <main className="rms-fx-shell__main" id="rms-fx-main">
          <FxBreadcrumb items={breadcrumbs} />
          {secondary.length > 1 ? (
            <nav className="rms-fx-secondary-nav" aria-label="Secondary">
              {secondary.map((item) => (
                <Link
                  key={item.id}
                  href={item.path}
                  aria-current={isActive(pathname, item.path, item.exact) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {children}
        </main>
      </div>

      <footer className="rms-fx-shell__footer">
        <span>Forge RMS</span>
        <FxOfflineIndicator status="online" />
        <span data-testid="rms-fx-shell-source">Shell: {presentation.source}</span>
      </footer>

      <div className="rms-fx-drawer-root" hidden={!navOpen}>
        <div
          className="rms-fx-drawer-backdrop"
          role="presentation"
          onClick={() => setNavOpen(false)}
        />
        <div
          ref={drawerRef}
          id="rms-fx-mobile-nav"
          className="rms-fx-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="rms-fx-drawer__header">
            <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>
              Navigation
            </h2>
            <button
              type="button"
              className="fx-btn fx-btn--secondary"
              onClick={() => setNavOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="rms-fx-shell__nav">{navContent}</div>
        </div>
      </div>
    </div>
  );
}
