/**
 * Primary navigation for Forge Safety - Field Version.
 * Phone: bottom tabs. Tablet: side rail.
 */
export type FieldPrimaryNavId = "home" | "work" | "scan" | "alerts" | "me";

export type FieldPrimaryNavItem = {
  id: FieldPrimaryNavId;
  href: string;
  label: string;
  match: (path: string) => boolean;
  scan?: boolean;
};

export const FIELD_PRIMARY_NAV: readonly FieldPrimaryNavItem[] = [
  {
    id: "home",
    href: "/",
    label: "Home",
    match: (path) => path === "/",
  },
  {
    id: "work",
    href: "/tasks/",
    label: "My Work",
    match: (path) =>
      path.startsWith("/tasks") ||
      path.startsWith("/corrective") ||
      path.startsWith("/training") ||
      path.startsWith("/inspection"),
  },
  {
    id: "scan",
    href: "/scan/",
    label: "Scan",
    match: (path) => path.startsWith("/scan"),
    scan: true,
  },
  {
    id: "alerts",
    href: "/alerts/",
    label: "Alerts",
    match: (path) => path.startsWith("/alerts"),
  },
  {
    id: "me",
    href: "/me/",
    label: "Me",
    match: (path) => path.startsWith("/me") || path.startsWith("/more"),
  },
] as const;

/** Extra tablet rail links (not in phone bottom bar). */
export const FIELD_TABLET_EXTRA_NAV: readonly {
  href: string;
  label: string;
  match: (path: string) => boolean;
}[] = [
  { href: "/report/", label: "Report", match: (path) => path.startsWith("/report") },
  { href: "/sanitation/", label: "Sanitation", match: (path) => path.startsWith("/sanitation") },
  {
    href: "/more/loto/",
    label: "LOTO",
    match: (path) => path.startsWith("/more/loto") || path.startsWith("/loto"),
  },
  {
    href: "/more/emergency/",
    label: "Emergency",
    match: (path) => path.startsWith("/more/emergency"),
  },
];
