/**
 * Reporting Center sidebar IA (vision §2).
 */

export type ReportingNavItem = {
  href: string;
  label: string;
  icon: string;
  description: string;
  visible: boolean;
  soon?: boolean;
};

export type ReportingNavGroup = {
  id: string;
  label: string;
  items: ReportingNavItem[];
};

export function buildReportingNavGroups(): ReportingNavGroup[] {
  return [
    {
      id: "home",
      label: "Home",
      items: [
        {
          href: "/reporting/",
          label: "Overview",
          icon: "bx-grid-alt",
          description: "Reporting home and shortcuts",
          visible: true,
        },
      ],
    },
    {
      id: "library",
      label: "Library",
      items: [
        {
          href: "/reporting/library/",
          label: "Report library",
          icon: "bx-library",
          description: "Built-in and saved reports",
          visible: true,
        },
        {
          href: "/reporting/builder/",
          label: "Custom builder",
          icon: "bx-wrench",
          description: "Save custom report definitions",
          visible: true,
          soon: false,
        },
        {
          href: "/reporting/templates/",
          label: "Templates",
          icon: "bx-copy-alt",
          description: "Starter and saved templates",
          visible: true,
          soon: false,
        },
      ],
    },
    {
      id: "workspace",
      label: "Workspace",
      items: [
        {
          href: "/reporting/saved/",
          label: "Saved reports",
          icon: "bx-bookmark",
          description: "Your saved report definitions",
          visible: true,
        },
        {
          href: "/reporting/scheduled/",
          label: "Scheduled",
          icon: "bx-calendar",
          description: "Recurring report delivery",
          visible: true,
        },
        {
          href: "/reporting/favorites/",
          label: "Favorites",
          icon: "bx-star",
          description: "Quick access favorites",
          visible: true,
        },
      ],
    },
    {
      id: "compliance-exports",
      label: "Compliance & exports",
      items: [
        {
          href: "/reporting/compliance/",
          label: "Compliance",
          icon: "bx-shield-quarter",
          description: "OSHA and compliance packages",
          visible: true,
        },
        {
          href: "/reporting/exports/",
          label: "Exports",
          icon: "bx-export",
          description: "Download center",
          visible: true,
        },
        {
          href: "/reporting/history/",
          label: "History",
          icon: "bx-history",
          description: "Runs and audit trail",
          visible: true,
        },
      ],
    },
    {
      id: "admin",
      label: "Admin",
      items: [
        {
          href: "/reporting/analytics/",
          label: "Analytics",
          icon: "bx-line-chart",
          description: "Safety KPIs and monthly stats",
          visible: true,
          soon: false,
        },
        {
          href: "/reporting/settings/",
          label: "Settings",
          icon: "bx-cog",
          description: "Defaults and schedule runner",
          visible: true,
          soon: false,
        },
      ],
    },
  ];
}

export function reportingNavActive(pathname: string, href: string): boolean {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const target = href.endsWith("/") ? href : `${href}/`;
  if (target === "/reporting/") {
    return path === "/reporting/" || path === "/reporting";
  }
  return path === target || path.startsWith(target);
}
