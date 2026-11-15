import type { FieldPermission } from "@forge/contracts";
import { DEFAULT_FIELD_HOME_ACTIONS } from "@/lib/field-permissions";

export type DashboardCard = {
  id: string;
  label: string;
  href: string;
  detail?: string;
  permission?: FieldPermission;
  /** Where the shortcut lives in the default IA. */
  source: "home" | "more";
};

/** All shortcuts a user can pin to the home dashboard. */
export const FIELD_DASHBOARD_CATALOG: readonly DashboardCard[] = [
  ...DEFAULT_FIELD_HOME_ACTIONS.map((action) => ({
    id: action.id,
    label: action.label,
    href: action.href,
    permission: action.permission,
    source: "home" as const,
  })),
  { id: "more-training", label: "My Training", href: "/training/", source: "more" },
  { id: "more-equipment", label: "Equipment", href: "/more/equipment/", source: "more" },
  { id: "more-print", label: "Print Manager", href: "/more/print/", source: "more" },
  {
    id: "fleet",
    label: "Fleet",
    href: "/fleet/",
    permission: "field.fleet.inspect",
    source: "more",
  },
  {
    id: "forklifts",
    label: "Forklifts",
    href: "/forklifts/",
    permission: "field.fleet.inspect",
    source: "more",
  },
  {
    id: "more-dot",
    label: "DOT / DVIR",
    href: "/dot/",
    permission: "field.fleet.inspect",
    source: "more",
  },
  {
    id: "more-safety-supplies",
    label: "Safety Supplies",
    href: "/more/safety-supplies/",
    source: "more",
  },
  { id: "more-forms", label: "Forms", href: "/forms/", source: "more" },
  { id: "calendar", label: "Calendar", href: "/calendar/", source: "more" },
  { id: "more-reminders", label: "Reminders", href: "/reminders/", source: "more" },
  { id: "messaging", label: "Messages", href: "/messaging/", source: "more" },
  { id: "my-forge", label: "My Forge", href: "/my-forge/", source: "more" },
  {
    id: "more-loto",
    label: "LOTO",
    href: "/more/loto/",
    permission: "field.loto.execute",
    source: "more",
  },
  {
    id: "more-jsa",
    label: "JSA / JHA",
    href: "/jsa/",
    permission: "field.jsa.execute",
    source: "more",
  },
  { id: "more-permits", label: "Permits", href: "/more/permits/", source: "more" },
  {
    id: "more-sds",
    label: "SDS",
    href: "/more/sds/",
    permission: "field.sds.view",
    source: "more",
  },
  {
    id: "food-safety",
    label: "Food Safety",
    href: "/sanitation/?focus=food",
    permission: "field.sanitation.report",
    source: "more",
  },
  {
    id: "more-sanitation",
    label: "Sanitation",
    href: "/sanitation/",
    permission: "field.sanitation.report",
    source: "more",
  },
  { id: "more-workflows", label: "Safety workflows", href: "/workflows/", source: "more" },
  {
    id: "more-emergency",
    label: "Emergency",
    href: "/more/emergency/",
    permission: "field.emergency.view",
    source: "more",
  },
  { id: "more-records", label: "My Records", href: "/more/records/", source: "more" },
];

const CATALOG_BY_ID = new Map(FIELD_DASHBOARD_CATALOG.map((card) => [card.id, card]));

export function dashboardCardById(id: string): DashboardCard | undefined {
  return CATALOG_BY_ID.get(id);
}

export function defaultDashboardPinnedIds(): string[] {
  return DEFAULT_FIELD_HOME_ACTIONS.map((action) => action.id);
}
