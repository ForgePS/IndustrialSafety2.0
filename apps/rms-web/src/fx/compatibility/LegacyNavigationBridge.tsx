"use client";

import Link from "next/link";
import type { RmsNavGroup } from "../navigation/navigation.types";

/** Renders registry-backed groups with the same visibility rules as legacy nav. */
export function LegacyNavigationBridge({
  groups,
  pathname,
}: {
  groups: RmsNavGroup[];
  pathname: string;
}) {
  return (
    <>
      {groups.map((group) => (
        <nav key={group.id} className="rms-fx-shell__nav-group" aria-label={group.label}>
          <p className="rms-fx-shell__nav-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active =
              pathname === item.path ||
              (!item.exact && pathname.startsWith(item.path.replace(/\/$/, "")));
            return (
              <Link key={item.id} href={item.path} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      ))}
    </>
  );
}
