import type { ReactNode } from "react";
import { cn } from "@forge/fx-utils";
import { FxEnvBanner, FxOfflineIndicator } from "@forge/fx-ui";

export type FxNavItem = { id: string; label: string; href: string };

export function FxAppShell({
  brand = "Forge Experience",
  productLabel = "Reference",
  envBanner,
  nav,
  activeNavId,
  headerActions,
  footerLeft,
  offlineStatus = "online",
  pendingUploads = 0,
  renderNavLink,
  children,
}: {
  brand?: string;
  productLabel?: string;
  envBanner?: string;
  nav: FxNavItem[];
  activeNavId: string;
  headerActions?: ReactNode;
  footerLeft?: ReactNode;
  offlineStatus?: "online" | "degraded" | "offline" | "syncing";
  pendingUploads?: number;
  renderNavLink?: (item: FxNavItem, active: boolean) => ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fx-shell">
      {envBanner ? <FxEnvBanner>{envBanner}</FxEnvBanner> : null}
      <header className="fx-shell__header">
        <div className="fx-shell__brand">
          {brand} · {productLabel}
        </div>
        <div style={{ flex: 1 }} />
        {headerActions}
      </header>
      <div className="fx-shell__body">
        <nav className="fx-shell__nav" aria-label="Primary">
          {nav.map((item) => {
            const active = item.id === activeNavId;
            if (renderNavLink) return <div key={item.id}>{renderNavLink(item, active)}</div>;
            return (
              <a key={item.id} href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </a>
            );
          })}
        </nav>
        <main className="fx-shell__main">{children}</main>
      </div>
      <footer className="fx-shell__footer">
        {footerLeft}
        <FxOfflineIndicator status={offlineStatus} pending={pendingUploads} />
        <span>FX-S1 reference — no production business logic</span>
      </footer>
    </div>
  );
}

export function FxResponsiveGrid({ children }: { children: ReactNode }) {
  return <div className="fx-grid">{children}</div>;
}

export function FxGridItem({
  span = 4,
  children,
}: {
  span?: 3 | 4 | 6 | 8 | 12;
  children: ReactNode;
}) {
  return <div className={cn(`fx-grid__span-${span}`)}>{children}</div>;
}

export function FxBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="fx-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span
            key={`${item.label}-${i}`}
            style={{ display: "inline-flex", gap: "var(--fx-space-4)" }}
          >
            {i > 0 ? <span aria-hidden>/</span> : null}
            {last || !item.href ? (
              <span aria-current={last ? "page" : undefined}>{item.label}</span>
            ) : (
              <a href={item.href}>{item.label}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function FxWorkspaceLayout({
  title,
  status,
  actions,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="fx-workspace__header">
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--fx-font-display)", fontSize: 28 }}>{title}</h1>
          {status}
        </div>
        <div style={{ display: "flex", gap: "var(--fx-space-8)", flexWrap: "wrap" }}>{actions}</div>
      </div>
      <div className="fx-workspace__tabs" role="tablist" aria-label="Workspace">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="fx-workspace__tab"
            aria-selected={tab.id === activeTab}
            id={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {children}
      </div>
    </div>
  );
}

export function FxDashboardLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 style={{ marginTop: 0, fontFamily: "var(--fx-font-display)", fontSize: 28 }}>{title}</h1>
      {children}
    </div>
  );
}
