/**
 * Personnel module shortcuts: Dashboard, Company Drivers, PPE Allowance, and
 * Archived Personnel. The quick card lists every destination; off the current
 * page the remaining surfaces appear as link tabs.
 */

export const PERSONNEL_DASHBOARD_HREF = "/modules/personnel/";

export type PersonnelQuickView = "dashboard" | "company-drivers" | "ppe-allowance" | "archived";

export type PersonnelQuickLink = {
  id: PersonnelQuickView;
  label: string;
  href: string;
  description: string;
  icon: string;
};

export const PERSONNEL_QUICK_LINKS: readonly PersonnelQuickLink[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: PERSONNEL_DASHBOARD_HREF,
    description: "Active personnel directory",
    icon: "bx-grid-alt",
  },
  {
    id: "company-drivers",
    label: "Company Drivers",
    href: `${PERSONNEL_DASHBOARD_HREF}?view=company-drivers`,
    description: "Drivers on the company roster",
    icon: "bx-car",
  },
  {
    id: "ppe-allowance",
    label: "PPE Allowance",
    href: `${PERSONNEL_DASHBOARD_HREF}?view=ppe-allowance`,
    description: "Glasses, safety boots, and extra-pair approvals",
    icon: "bx-glasses",
  },
  {
    id: "archived",
    label: "Archived Personnel",
    href: `${PERSONNEL_DASHBOARD_HREF}?view=archived`,
    description: "Archived and inactive people",
    icon: "bx-archive",
  },
] as const;

export function parsePersonnelQuickView(raw: string | null | undefined): PersonnelQuickView {
  if (raw === "company-drivers" || raw === "drivers") return "company-drivers";
  if (raw === "ppe-allowance" || raw === "ppe") return "ppe-allowance";
  if (raw === "archived") return "archived";
  return "dashboard";
}

/** Destinations that are not the page you are on. */
export function personnelOffPageLinks(
  current: PersonnelQuickView,
): readonly PersonnelQuickLink[] {
  return PERSONNEL_QUICK_LINKS.filter((link) => link.id !== current);
}

export function personnelQuickLinkById(id: PersonnelQuickView): PersonnelQuickLink {
  return PERSONNEL_QUICK_LINKS.find((link) => link.id === id) ?? PERSONNEL_QUICK_LINKS[0]!;
}

/** List API query extras for a filtered personnel view. */
export function personnelListQueryForView(
  view: PersonnelQuickView,
): Record<string, string | undefined> {
  if (view === "company-drivers") return { isCompanyDriver: "true" };
  if (view === "ppe-allowance") return { ppeTracked: "true" };
  if (view === "archived") return { archived: "true" };
  return {};
}

export function personnelDirectoryTitle(view: PersonnelQuickView): string {
  if (view === "company-drivers") return "Company Drivers";
  if (view === "ppe-allowance") return "PPE Allowance";
  if (view === "archived") return "Archived Personnel";
  return "Personnel Directory";
}
