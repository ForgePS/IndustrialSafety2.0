"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FxAppShell } from "@forge/fx-layouts";
import { FxButton } from "@forge/fx-ui";
import { useOffline, useTheme } from "@forge/fx-hooks";
import type { FxTheme } from "@forge/fx-design-tokens";
import { IconBell, IconSearch } from "@forge/fx-icons";

const NAV = [
  { id: "dashboard", label: "Operations", href: "/" },
  { id: "workspace", label: "Person record", href: "/workspace" },
  { id: "forms", label: "Forms", href: "/forms" },
  { id: "playground", label: "Component playground", href: "/playground" },
  { id: "patterns", label: "Patterns", href: "/patterns" },
  { id: "a11y", label: "A11y & themes", href: "/validation" },
];

function activeFromPath(pathname: string): string {
  if (pathname.startsWith("/workspace")) return "workspace";
  if (pathname.startsWith("/forms")) return "forms";
  if (pathname.startsWith("/playground")) return "playground";
  if (pathname.startsWith("/patterns")) return "patterns";
  if (pathname.startsWith("/validation")) return "a11y";
  return "dashboard";
}

export function ReferenceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme("light");
  const offline = useOffline("online");

  return (
    <FxAppShell
      envBanner="FX-S1 REFERENCE — not a production application"
      nav={NAV}
      activeNavId={activeFromPath(pathname)}
      renderNavLink={(item, active) => (
        <Link href={item.href} aria-current={active ? "page" : undefined}>
          {item.label}
        </Link>
      )}
      offlineStatus={offline.status}
      pendingUploads={offline.pending}
      headerActions={
        <>
          <label className="fx-field__label" htmlFor="fx-theme">
            Theme
          </label>
          <select
            id="fx-theme"
            className="fx-field__input"
            style={{ minHeight: 44, width: "auto" }}
            value={theme}
            onChange={(e) => setTheme(e.target.value as FxTheme)}
            suppressHydrationWarning
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
          <FxButton tone="ghost" aria-label="Search">
            <IconSearch title="Search" />
          </FxButton>
          <FxButton tone="ghost" aria-label="Notifications">
            <IconBell title="Notifications" />
          </FxButton>
          <FxButton
            tone="secondary"
            onClick={() => {
              offline.setStatus(offline.status === "online" ? "offline" : "online");
              offline.setPending(offline.status === "online" ? 2 : 0);
            }}
          >
            Toggle offline demo
          </FxButton>
        </>
      }
      footerLeft={
        <Link href="/validation" style={{ color: "inherit" }}>
          Validation checklist
        </Link>
      }
    >
      {children}
    </FxAppShell>
  );
}
