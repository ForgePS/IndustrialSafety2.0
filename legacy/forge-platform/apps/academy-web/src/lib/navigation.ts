import type { ForgeNavigationGroup } from "@forge/design-system";

export const ACADEMY_NAV_GROUPS: ForgeNavigationGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "home", label: "Dashboard", route: "/" },
      { id: "health", label: "Health", route: "/health" },
    ],
  },
];
