import type { ReactNode } from "react";
import { Button } from "../primitives.js";
import type { ForgeLinkRender, ForgeShellFacility, ForgeShellTenant } from "./types.js";

const TOPBAR_SELECT_CLASS = "form-select form-select-sm";

export function ForgeTenantSwitcher({
  tenants,
  activeTenantId,
  onSelect,
  disabled,
  state = "ready",
  label = "Customer",
}: {
  tenants: ForgeShellTenant[];
  activeTenantId?: string | null;
  onSelect: (tenantId: string) => void;
  disabled?: boolean;
  state?: "ready" | "loading" | "empty" | "error" | "unauthorized" | "disabled_entitlement";
  /** User-facing label (Creator defaults to Customer; avoid Tenant jargon). */
  label?: string;
}) {
  if (state === "loading") {
    return <span className="forge-topbar__meta">Loading {label.toLowerCase()}s…</span>;
  }
  if (state === "error") {
    return <span className="forge-topbar__meta">{label} list unavailable</span>;
  }
  if (state === "unauthorized" || state === "disabled_entitlement") {
    return <span className="forge-topbar__meta">{label} switch unavailable</span>;
  }
  const selectable = tenants.filter((t) => t.selectable !== false);
  if (selectable.length === 0 || state === "empty") {
    return <span className="forge-topbar__meta">No {label.toLowerCase()}s</span>;
  }
  return (
    <label className="forge-topbar__control">
      <span>{label}</span>
      <select
        className={TOPBAR_SELECT_CLASS}
        aria-label={`Switch ${label.toLowerCase()}`}
        disabled={disabled}
        value={activeTenantId ?? ""}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
      >
        {selectable.map((t) => (
          <option key={t.tenantId} value={t.tenantId}>
            {t.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

export type ForgeUserMenuItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

export function ForgeUserMenu({
  label,
  onSignOut,
  detail,
  items = [],
  renderLink,
}: {
  label: string;
  onSignOut?: () => void;
  detail?: ReactNode;
  items?: ForgeUserMenuItem[];
  renderLink?: ForgeLinkRender;
}) {
  return (
    <div className="forge-topbar__user">
      <span className="forge-topbar__meta">{label}</span>
      {items.map((item) => {
        if (item.disabled) {
          return (
            <Button key={item.label} type="button" variant="secondary" disabled title={item.title ?? item.label}>
              {item.label}
            </Button>
          );
        }
        if (item.href && renderLink) {
          return (
            <span key={item.label}>
              {renderLink({
                href: item.href,
                className: "forge-topbar__nav-link",
                children: item.label,
                ...(item.onClick ? { onClick: item.onClick } : {}),
              })}
            </span>
          );
        }
        if (item.href) {
          return (
            <a key={item.label} href={item.href} className="forge-topbar__nav-link" onClick={item.onClick}>
              {item.label}
            </a>
          );
        }
        return (
          <Button key={item.label} type="button" variant="outline" onClick={item.onClick} title={item.title}>
            {item.label}
          </Button>
        );
      })}
      {detail}
      {onSignOut ? (
        <Button type="button" variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      ) : null}
    </div>
  );
}

export function ForgeNotificationMenu({
  count = 0,
  label = "Notifications",
  disabledReason = "Notification center not connected",
  disabled = true,
  items = [],
  open,
  onToggle,
  onMarkRead,
  onMarkAllRead,
  emptyText = "No notifications",
  viewAllHref,
  renderLink,
}: {
  count?: number;
  label?: string;
  disabledReason?: string;
  disabled?: boolean;
  items?: Array<{
    id: string;
    title: string;
    body?: string;
    createdAt?: string;
    readAt?: string | null;
  }>;
  open?: boolean;
  onToggle?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  emptyText?: string;
  viewAllHref?: string;
  renderLink?: ForgeLinkRender;
}) {
  if (disabled) {
    return (
      <Button
        type="button"
        variant="secondary"
        aria-label={label}
        title={disabledReason}
        disabled
      >
        {label}
        {count > 0 ? ` (${count})` : ""}
      </Button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <Button
        type="button"
        variant="secondary"
        aria-label={label}
        aria-expanded={open ? true : false}
        onClick={onToggle}
      >
        {label}
        {count > 0 ? ` (${count})` : ""}
      </Button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 0.35rem)",
            zIndex: 40,
            width: "22rem",
            maxHeight: "24rem",
            overflow: "auto",
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid var(--forge-color-border, #d0d5dd)",
            background: "var(--forge-color-surface, #fff)",
            boxShadow: "0 8px 24px rgba(16, 24, 40, 0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
              gap: "0.5rem",
            }}
          >
            <strong style={{ fontSize: "0.9rem" }}>{label}</strong>
            {onMarkAllRead ? (
              <Button type="button" variant="outline" onClick={onMarkAllRead}>
                Mark all read
              </Button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>{emptyText}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: "0.55rem 0.35rem",
                    borderTop: "1px solid var(--forge-color-border-light, #eaecf0)",
                    opacity: item.readAt ? 0.7 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.title}</div>
                  {item.body ? (
                    <div style={{ fontSize: "0.82rem", opacity: 0.85, marginTop: "0.15rem" }}>
                      {item.body}
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginTop: "0.35rem",
                      fontSize: "0.75rem",
                      opacity: 0.7,
                    }}
                  >
                    <span>{item.createdAt ?? ""}</span>
                    {!item.readAt && onMarkRead ? (
                      <button
                        type="button"
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "var(--forge-color-primary, #0d6efd)",
                          cursor: "pointer",
                          padding: 0,
                          font: "inherit",
                        }}
                        onClick={() => onMarkRead(item.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {viewAllHref ? (
            <div style={{ marginTop: "0.65rem", fontSize: "0.85rem" }}>
              {renderLink
                ? renderLink({ href: viewAllHref, children: "View all" })
                : (
                    <a href={viewAllHref}>View all</a>
                  )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ForgeProductSwitcher({
  products,
  activeProductId,
  onSelect,
  disabled,
  state = "ready",
}: {
  products: Array<{ id: string; name: string; entitlementDisabled?: boolean }>;
  activeProductId?: string;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  state?: "ready" | "loading" | "empty" | "error" | "unauthorized" | "disabled_entitlement";
}) {
  if (state === "loading") {
    return <span className="forge-topbar__meta">Loading products…</span>;
  }
  if (state === "error") {
    return <span className="forge-topbar__meta">Products unavailable</span>;
  }
  if (state === "unauthorized") {
    return <span className="forge-topbar__meta">Product switch unauthorized</span>;
  }
  if (state === "disabled_entitlement" || products.every((p) => p.entitlementDisabled)) {
    return <span className="forge-topbar__meta">No entitled products</span>;
  }
  if (products.length === 0 || state === "empty") return null;
  return (
    <label className="forge-topbar__control">
      <span>Product</span>
      <select
        className={TOPBAR_SELECT_CLASS}
        aria-label="Switch product"
        value={activeProductId ?? products[0]?.id}
        disabled={disabled || !onSelect}
        onChange={(e) => onSelect?.(e.target.value)}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id} disabled={p.entitlementDisabled}>
            {p.name}
            {p.entitlementDisabled ? " (not entitled)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ForgeFacilitySelector({
  facilities,
  activeFacilityId,
  onSelect,
  disabled,
  state = "ready",
}: {
  facilities: ForgeShellFacility[];
  activeFacilityId?: string | null;
  onSelect?: (facilityId: string) => void;
  disabled?: boolean;
  state?: "ready" | "loading" | "empty" | "error" | "unauthorized" | "disabled_entitlement";
}) {
  if (state === "loading") {
    return <span className="forge-topbar__meta">Loading facilities…</span>;
  }
  if (state === "error") {
    return <span className="forge-topbar__meta">Facilities unavailable</span>;
  }
  if (state === "unauthorized" || state === "disabled_entitlement") {
    return <span className="forge-topbar__meta">Facility selector unavailable</span>;
  }
  if (facilities.length === 0 || state === "empty") {
    return null;
  }
  return (
    <label className="forge-topbar__control">
      <span>Facility</span>
      <select
        className={TOPBAR_SELECT_CLASS}
        aria-label="Select facility"
        disabled={disabled || !onSelect}
        value={activeFacilityId ?? facilities[0]?.id ?? ""}
        onChange={(e) => {
          if (e.target.value) onSelect?.(e.target.value);
        }}
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ForgeSearchTrigger({
  onTrigger,
  disabled = true,
  disabledReason = "Search not connected",
  label = "Search",
}: {
  onTrigger?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      aria-label={label}
      title={disabledReason}
      disabled={disabled}
      onClick={onTrigger}
    >
      {label}
    </Button>
  );
}

export function ForgeHelpMenu({
  href,
  onClick,
  disabled = false,
  disabledReason,
  label = "Help",
  renderLink,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  renderLink?: ForgeLinkRender;
}) {
  if (disabled) {
    return (
      <Button type="button" variant="secondary" aria-label={label} title={disabledReason ?? label} disabled>
        {label}
      </Button>
    );
  }
  if (href && renderLink) {
    return (
      <span className="forge-topbar__meta">
        {renderLink({ href, children: label, ...(onClick ? { onClick } : {}) })}
      </span>
    );
  }
  if (href) {
    return (
      <a href={href} className="forge-topbar__meta" onClick={onClick}>
        {label}
      </a>
    );
  }
  return (
    <Button type="button" variant="secondary" aria-label={label} onClick={onClick}>
      {label}
    </Button>
  );
}
