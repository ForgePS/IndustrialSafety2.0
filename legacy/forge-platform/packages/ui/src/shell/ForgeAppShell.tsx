"use client";

import { useState, type ReactNode } from "react";
import type { ForgeNavigationGroup } from "@forge/design-system";
import { ForgeSidebar } from "./ForgeSidebar.js";
import { ForgeTopbar } from "./ForgeTopbar.js";
import type { ForgeLinkRender } from "./types.js";

export function ForgeAppShell({
  brand,
  brandMark,
  productLabel,
  groups,
  activePath,
  renderLink,
  envBanner,
  topbarLeft,
  topbarCenter,
  topbarRight,
  session,
  sidebarFooter,
  children,
}: {
  brand: string;
  brandMark?: string;
  productLabel?: string;
  groups: ForgeNavigationGroup[];
  activePath: string;
  renderLink: ForgeLinkRender;
  envBanner?: ReactNode;
  topbarLeft?: ReactNode;
  topbarCenter?: ReactNode;
  topbarRight?: ReactNode;
  session?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {envBanner}
      <div className="forge-shell">
        {menuOpen ? (
          <button
            type="button"
            className="forge-drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <ForgeSidebar
          brand={brand}
          {...(brandMark ? { brandMark } : {})}
          {...(productLabel ? { productLabel } : {})}
          {...(session ? { session } : {})}
          groups={groups}
          activePath={activePath}
          renderLink={renderLink}
          open={menuOpen}
          onNavigate={() => setMenuOpen(false)}
          {...(sidebarFooter ? { footer: sidebarFooter } : {})}
        />
        <div className="forge-main">
          <ForgeTopbar
            left={topbarLeft}
            center={topbarCenter}
            right={topbarRight}
            onMenuToggle={() => setMenuOpen((v) => !v)}
          />
          <div className="forge-content">{children}</div>
        </div>
      </div>
    </>
  );
}
