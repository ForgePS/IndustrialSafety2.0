"use client";

import type { ReactNode } from "react";
import type { ForgeNavigationGroup, ForgeNavigationItem } from "@forge/design-system";

export type SneatLinkRender = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
  onClick?: () => void;
}) => ReactNode;

function normalizePath(path: string | null | undefined): string {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function routeIsActive(pathname: string, route: string): boolean {
  return normalizePath(pathname) === normalizePath(route);
}

function groupHasActive(group: ForgeNavigationGroup, pathname: string): boolean {
  return group.items.some(
    (item) =>
      routeIsActive(pathname, item.route) ||
      (item.children?.some((child) => routeIsActive(pathname, child.route)) ?? false),
  );
}

function iconClass(icon?: string): string {
  const name = (icon ?? "bx-cube").replace(/^bx\s+/, "").replace(/^bx-/, "bx-");
  const withPrefix = name.startsWith("bx-") ? name : `bx-${name}`;
  return `menu-icon icon-base bx ${withPrefix}`;
}

function NavLeaf({
  item,
  pathname,
  renderLink,
  onNavigate,
}: {
  item: ForgeNavigationItem;
  pathname: string;
  renderLink: SneatLinkRender;
  onNavigate?: () => void;
}) {
  const active = routeIsActive(pathname, item.route);
  return (
    <li className={active ? "menu-item active" : "menu-item"}>
      {renderLink({
        href: item.route,
        className: "menu-link",
        ...(active ? { "aria-current": "page" as const } : {}),
        ...(onNavigate ? { onClick: onNavigate } : {}),
        children: (
          <>
            <i className={iconClass(item.icon)} />
            <div>{item.label}</div>
          </>
        ),
      })}
    </li>
  );
}

export function SneatVerticalMenu({
  brand,
  brandHref = "/",
  brandMark,
  groups,
  activePath,
  renderLink,
  openGroups,
  onToggleGroup,
  menuOpen,
  onCloseMenu,
  session,
  footer,
  leadingItems,
}: {
  brand: string;
  brandHref?: string;
  brandMark?: ReactNode;
  groups: ForgeNavigationGroup[];
  activePath: string;
  renderLink: SneatLinkRender;
  openGroups: Record<string, boolean>;
  onToggleGroup: (groupId: string) => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  session?: ReactNode;
  footer?: ReactNode;
  /** Extra top-level menu items rendered before groups (e.g. Dashboard). */
  leadingItems?: ForgeNavigationItem[];
}) {
  return (
    <aside id="layout-menu" className="layout-menu menu-vertical menu bg-menu-theme">
      <div className="app-brand demo">
        {renderLink({
          href: brandHref,
          className: "app-brand-link",
          onClick: onCloseMenu,
          children: (
            <>
              {brandMark ? (
                <span className="app-brand-logo demo">{brandMark}</span>
              ) : (
                <span className="app-brand-logo demo">
                  <span className="avatar avatar-sm">
                    <span className="avatar-initial rounded bg-primary">{brand.slice(0, 2).toUpperCase()}</span>
                  </span>
                </span>
              )}
              <span className="app-brand-text demo menu-text fw-bold ms-2">{brand}</span>
            </>
          ),
        })}
        <button
          type="button"
          className="layout-menu-toggle menu-link text-large ms-auto d-block d-xl-none btn btn-link p-0 border-0"
          aria-label="Close menu"
          aria-expanded={menuOpen}
          aria-controls="layout-menu"
          onClick={onCloseMenu}
        >
          <i className="icon-base bx bx-chevron-left icon-sm d-flex align-items-center justify-content-center" />
        </button>
      </div>

      {session ? <div className="px-3 pb-2">{session}</div> : null}

      <div className="menu-inner-shadow" />

      <ul className="menu-inner py-1">
        {(leadingItems ?? []).map((item) => (
          <NavLeaf
            key={item.id}
            item={item}
            pathname={activePath}
            renderLink={renderLink}
            onNavigate={onCloseMenu}
          />
        ))}

        {groups.map((group) => {
          const isOpen = openGroups[group.id] === true;
          const hasActive = groupHasActive(group, activePath);
          return (
            <li
              key={group.id}
              className={`menu-item${isOpen ? " open" : ""}${hasActive ? " active" : ""}`}
            >
              <a
                href={`#nav-${group.id}`}
                className="menu-link menu-toggle"
                aria-expanded={isOpen}
                onClick={(event) => {
                  event.preventDefault();
                  onToggleGroup(group.id);
                }}
              >
                <i className={iconClass(group.items[0]?.icon ?? "bx-cube")} />
                <div>{group.label}</div>
              </a>
              {isOpen ? (
                <ul className="menu-sub">
                  {group.items.map((item) => (
                    <NavLeaf
                      key={item.id}
                      item={item}
                      pathname={activePath}
                      renderLink={renderLink}
                      onNavigate={onCloseMenu}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {footer ? <div className="mt-auto px-3 py-3">{footer}</div> : null}
    </aside>
  );
}
