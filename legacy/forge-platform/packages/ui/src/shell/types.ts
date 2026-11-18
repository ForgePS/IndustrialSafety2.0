import type { ReactNode } from "react";
import type { ForgeNavigationGroup, ForgeNavigationItem } from "@forge/design-system";

export type ForgeLinkRender = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page" | undefined;
  onClick?: () => void;
}) => ReactNode;

export type ForgeShellTenant = {
  tenantId: string;
  displayName: string;
  selectable?: boolean;
};

export type ForgeShellFacility = {
  id: string;
  name: string;
};

export type ForgeShellNavProps = {
  groups: ForgeNavigationGroup[];
  activePath: string;
  renderLink: ForgeLinkRender;
  onNavigate?: () => void;
};

export function isNavActive(activePath: string, route: string): boolean {
  if (route === "/") return activePath === "/";
  return activePath === route || activePath.startsWith(`${route}/`);
}

export function flattenNavItems(groups: ForgeNavigationGroup[]): ForgeNavigationItem[] {
  const out: ForgeNavigationItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      out.push(item);
      if (item.children) out.push(...item.children);
    }
  }
  return out;
}
