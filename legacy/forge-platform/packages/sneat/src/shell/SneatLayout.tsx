"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ForgeNavigationGroup, ForgeNavigationItem } from "@forge/design-system";
import { SneatFooter } from "./SneatFooter.js";
import { SneatNavbar } from "./SneatNavbar.js";
import { SneatVerticalMenu, type SneatLinkRender } from "./SneatVerticalMenu.js";
import { useSneatMenu } from "./useSneatMenu.js";

export function SneatLayout({
  brand,
  brandHref = "/",
  brandMark,
  groups,
  activePath,
  renderLink,
  envBanner,
  navbarLeft,
  navbarCenter,
  navbarRight,
  session,
  sidebarFooter,
  footer,
  leadingItems,
  contentClassName = "",
  style,
  storageKey,
  children,
}: {
  brand: string;
  brandHref?: string;
  brandMark?: ReactNode;
  groups: ForgeNavigationGroup[];
  activePath: string;
  renderLink: SneatLinkRender;
  envBanner?: ReactNode;
  navbarLeft?: ReactNode;
  navbarCenter?: ReactNode;
  navbarRight?: ReactNode;
  session?: ReactNode;
  sidebarFooter?: ReactNode;
  footer?: ReactNode;
  leadingItems?: ForgeNavigationItem[];
  contentClassName?: string;
  style?: CSSProperties;
  storageKey?: string;
  children: ReactNode;
}) {
  const { menuOpen, openGroups, toggleGroup, closeMenu, toggleMenu } = useSneatMenu({
    ...(storageKey ? { storageKey } : {}),
  });

  return (
    <>
      {envBanner}
      <div className="layout-wrapper layout-content-navbar" style={style}>
        <div className="layout-container">
          <SneatVerticalMenu
            brand={brand}
            brandHref={brandHref}
            {...(brandMark ? { brandMark } : {})}
            groups={groups}
            activePath={activePath}
            renderLink={renderLink}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
            menuOpen={menuOpen}
            onCloseMenu={closeMenu}
            {...(session ? { session } : {})}
            {...(sidebarFooter ? { footer: sidebarFooter } : {})}
            {...(leadingItems ? { leadingItems } : {})}
          />

          <div className="layout-page">
            <SneatNavbar
              menuOpen={menuOpen}
              onToggleMenu={toggleMenu}
              {...(navbarLeft ? { left: navbarLeft } : {})}
              {...(navbarCenter ? { center: navbarCenter } : {})}
              {...(navbarRight ? { right: navbarRight } : {})}
            />

            <div className="content-wrapper">
              <div className={`container-xxl flex-grow-1 container-p-y ${contentClassName}`.trim()}>
                {children}
              </div>
              <SneatFooter>{footer}</SneatFooter>
              <div className="content-backdrop fade" />
            </div>
          </div>
        </div>

        {menuOpen ? (
          <button
            type="button"
            className="layout-overlay layout-menu-toggle"
            aria-label="Close navigation"
            onClick={closeMenu}
          />
        ) : (
          <div className="layout-overlay layout-menu-toggle" aria-hidden="true" />
        )}
        <div className="drag-target" />
      </div>
    </>
  );
}
