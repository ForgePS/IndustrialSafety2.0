export const FIELD_ROOT_ROUTES = ["/"] as const;

/** Routes that manage their own in-flow back / exit controls. */
export const FIELD_BACK_HIDDEN_PREFIXES = ["/auth/", "/inspection/", "/sanitation/"] as const;

type BackTarget = { href: string; label: string };

const TAB_ROOT_BACK: Record<string, BackTarget> = {
  "/tasks/": { href: "/", label: "Home" },
  "/scan/": { href: "/", label: "Home" },
  "/alerts/": { href: "/", label: "Home" },
  "/me/": { href: "/", label: "Home" },
  "/report/": { href: "/", label: "Home" },
  "/more/": { href: "/me/", label: "Me" },
};

const BACK_OVERRIDES: Array<{ test: (path: string) => boolean; target: BackTarget }> = [
  { test: (p) => p === "/training/", target: { href: "/tasks/", label: "My Work" } },
  { test: (p) => /^\/training\/[^/]+\/$/.test(p), target: { href: "/training/", label: "My Training" } },
  { test: (p) => p.startsWith("/report/") && p !== "/report/", target: { href: "/report/", label: "Report" } },
  {
    test: (p) => p.startsWith("/more/loto/") && p !== "/more/loto/",
    target: { href: "/more/loto/", label: "LOTO" },
  },
  { test: (p) => p.startsWith("/more/") && p !== "/more/", target: { href: "/me/", label: "Me" } },
  { test: (p) => p.startsWith("/scan/sanitation-"), target: { href: "/sanitation/", label: "Sanitation" } },
  { test: (p) => p.startsWith("/scan/") && p !== "/scan/", target: { href: "/scan/", label: "Scan" } },
  { test: (p) => p.startsWith("/tasks/") && p !== "/tasks/", target: { href: "/tasks/", label: "My Work" } },
  { test: (p) => p.startsWith("/corrective/"), target: { href: "/tasks/", label: "My Work" } },
  { test: (p) => p.startsWith("/equipment/"), target: { href: "/scan/", label: "Scan" } },
  { test: (p) => p.startsWith("/loto/"), target: { href: "/more/loto/", label: "LOTO" } },
  { test: (p) => p.startsWith("/location/"), target: { href: "/scan/", label: "Scan" } },
  { test: (p) => p.startsWith("/forms/"), target: { href: "/scan/", label: "Scan" } },
  { test: (p) => p.startsWith("/jsa/") && p !== "/jsa/", target: { href: "/jsa/", label: "JSA" } },
  { test: (p) => p === "/jsa/" || p === "/workflows/", target: { href: "/workflows/", label: "Workflows" } },
  { test: (p) => p.startsWith("/workflows/"), target: { href: "/me/", label: "Me" } },
  { test: (p) => p === "/messaging/", target: { href: "/me/", label: "Me" } },
  { test: (p) => p.startsWith("/messaging/"), target: { href: "/messaging/", label: "Messages" } },
  { test: (p) => p.startsWith("/incident/"), target: { href: "/report/", label: "Report" } },
];

const PARENT_LABELS: Record<string, string> = {
  "/": "Home",
  "/tasks/": "My Work",
  "/scan/": "Scan",
  "/alerts/": "Alerts",
  "/me/": "Me",
  "/report/": "Report",
  "/more/": "Me",
  "/training/": "My Training",
};

export function normalizeFieldPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function shouldShowPageBack(pathname: string): boolean {
  const path = normalizeFieldPath(pathname);
  if ((FIELD_ROOT_ROUTES as readonly string[]).includes(path)) return false;
  return !FIELD_BACK_HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function resolvePageBack(pathname: string): BackTarget | null {
  if (!shouldShowPageBack(pathname)) return null;

  const path = normalizeFieldPath(pathname);
  const tabRoot = TAB_ROOT_BACK[path];
  if (tabRoot) return tabRoot;

  for (const rule of BACK_OVERRIDES) {
    if (rule.test(path)) return rule.target;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return { href: "/", label: "Home" };

  parts.pop();
  const parent = `/${parts.join("/")}/`;
  return { href: parent, label: PARENT_LABELS[parent] ?? "Back" };
}
