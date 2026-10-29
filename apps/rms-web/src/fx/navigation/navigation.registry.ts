import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import type { RmsNavigationItem } from "./navigation.types";

/**
 * Authoritative typed registry of verified live rms-web routes (FX-S2A inventory).
 * DEC-S2-005: Controlled hybrid — registry owns path/id/flags; no invented modules.
 */
export const RMS_NAVIGATION_REGISTRY: readonly RmsNavigationItem[] = [
  {
    id: "home",
    label: "Home",
    path: "/",
    group: "home",
    groupLabel: "Home",
    exact: true,
    mobile: true,
  },
  {
    id: "incidents-list",
    label: "Incidents",
    path: "/incidents/",
    group: "incidents",
    groupLabel: "Incidents",
    featureFlag: RMS_FEATURE_FLAGS.incidentShell,
    permission: "rms.neris.incident.view",
    mobile: true,
  },
  {
    id: "incidents-new",
    label: "Create Incident",
    path: "/incidents/new/",
    group: "incidents",
    groupLabel: "Incidents",
    featureFlag: RMS_FEATURE_FLAGS.manualIntake,
    permission: "rms.neris.incident.create",
    mobile: true,
  },
  {
    id: "review",
    label: "Review Queue",
    path: "/review/",
    group: "incidents",
    groupLabel: "Incidents",
    featureFlag: RMS_FEATURE_FLAGS.officerReview,
    permission: "rms.neris.incident.review",
    mobile: true,
  },
  {
    id: "cad-operations",
    label: "CAD Operations",
    path: "/cad/operations/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadOperations,
    mobile: true,
  },
  {
    id: "cad-conflicts",
    label: "CAD Conflicts",
    path: "/cad/conflicts/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadEnabled,
    mobile: true,
  },
  {
    id: "cad-messages",
    label: "CAD Messages",
    path: "/cad/messages/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadOperations,
    mobile: true,
  },
  {
    id: "cad-connections",
    label: "CAD Connections",
    path: "/cad/connections/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadEnabled,
    mobile: true,
  },
  {
    id: "cad-unmapped",
    label: "CAD Unmapped",
    path: "/cad/unmapped/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadEnabled,
    mobile: true,
  },
  {
    id: "cad-mappings",
    label: "CAD Unit / Personnel",
    path: "/cad/mappings/",
    group: "cad",
    groupLabel: "CAD",
    featureFlag: RMS_FEATURE_FLAGS.cadEnabled,
    mobile: true,
  },
  {
    id: "neris-configuration",
    label: "NERIS Configuration",
    path: "/configuration/",
    group: "neris",
    groupLabel: "NERIS",
    featureFlag: RMS_FEATURE_FLAGS.tenantConfiguration,
    permission: "rms.neris.configuration.view",
    mobile: true,
  },
  {
    id: "select-tenant",
    label: "Switch tenant",
    path: "/select-tenant/",
    group: "session",
    groupLabel: "Session",
    mobile: true,
  },
  {
    id: "login",
    label: "Sign in",
    path: "/login/",
    group: "session",
    groupLabel: "Session",
    mobile: true,
  },
] as const;

/** Routes intentionally omitted from primary nav (still deep-linkable). */
export const RMS_NON_NAV_ROUTES = [
  { id: "auth-callback", path: "/auth/callback/", note: "OAuth callback" },
  { id: "health", path: "/health/", note: "Ops health probe" },
  { id: "incident-detail", path: "/incidents/[id]/", note: "Record workspace via list/create" },
] as const;

export function findNavItemByPath(pathname: string): RmsNavigationItem | undefined {
  const normalized = pathname.endsWith("/") || pathname === "/" ? pathname : `${pathname}/`;
  const exact = RMS_NAVIGATION_REGISTRY.find((item) => item.exact && item.path === normalized);
  if (exact) return exact;
  return RMS_NAVIGATION_REGISTRY.filter((item) => !item.exact && item.path !== "/")
    .sort((a, b) => b.path.length - a.path.length)
    .find(
      (item) => normalized === item.path || normalized.startsWith(item.path.replace(/\/$/, "")),
    );
}
