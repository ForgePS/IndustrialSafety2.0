import { INDUSTRIAL_MODULE_REGISTRY } from "@forge/contracts";

/**
 * Maps Field dashboard / feature ids to industrial module codes.
 * Used for activeModules gating without duplicating the industrial registry.
 */
export const FIELD_FEATURE_MODULE_MAP: Record<string, string> = {
  hazard: "OBSERVATIONS",
  inspection: "INSPECTIONS",
  "inspections-hub": "INSPECTIONS",
  loto: "LOCKOUT_TAGOUT",
  training: "TRAINING",
  "more-training": "TRAINING",
  "more-equipment": "EQUIPMENT",
  "more-safety-supplies": "SAFETY_SUPPLIES",
  "more-print": "CORE",
  "more-loto": "LOCKOUT_TAGOUT",
  "more-permits": "HOT_WORK",
  "more-sds": "CHEMICAL_SAFETY",
  "more-emergency": "EMERGENCY_ALERTS",
  "more-records": "TRAINING",
  "more-sanitation": "SANITATION",
  "more-jsa": "JSAS",
  "more-workflows": "CORE",
  "more-forms": "FORMS",
  "more-dot": "DOT_COMPLIANCE",
  calendar: "CALENDAR",
  "more-reminders": "REMINDERS",
  messaging: "MESSAGING",
  "food-safety": "SANITATION",
  report: "INCIDENTS",
  jsa: "JSAS",
  fleet: "FLEET",
  forklifts: "FORKLIFTS",
  scan: "SCAN",
};

/** Permit feature visibility: show Permits card if any high-risk permit module is on. */
export const PERMIT_MODULE_CODES = [
  "HOT_WORK",
  "CONFINED_SPACE",
  "WORKING_AT_HEIGHTS",
  "ELECTRICAL_SAFETY",
] as const;

/** Emergency hub: show if Alerts or Response module is enabled. */
export const EMERGENCY_MODULE_CODES = ["EMERGENCY_ALERTS", "EMERGENCY_RESPONSE"] as const;

export function isPermitsFeatureEnabled(
  activeModules: readonly string[] | null | undefined,
  opts?: { isPlatformAdmin?: boolean },
): boolean {
  if (opts?.isPlatformAdmin) return true;
  return PERMIT_MODULE_CODES.some((code) => isFieldModuleEnabled(activeModules, code, opts));
}

export function isEmergencyFeatureModuleEnabled(
  activeModules: readonly string[] | null | undefined,
  opts?: { isPlatformAdmin?: boolean },
): boolean {
  if (opts?.isPlatformAdmin) return true;
  return EMERGENCY_MODULE_CODES.some((code) => isFieldModuleEnabled(activeModules, code, opts));
}

const AVAILABLE_CODES = new Set(
  INDUSTRIAL_MODULE_REGISTRY.filter((m) => m.implementationStatus === "AVAILABLE").map((m) => m.code),
);

/**
 * Module enablement for Field.
 * - Platform admin: all available
 * - When activeModules is non-empty: require membership (CORE always ok)
 * - When empty: allow AVAILABLE modules (bootstrap / non-strict parity with industrial-web)
 */
export function isFieldModuleEnabled(
  activeModules: readonly string[] | null | undefined,
  moduleCode: string,
  opts?: { isPlatformAdmin?: boolean },
): boolean {
  if (opts?.isPlatformAdmin) return true;
  if (moduleCode === "CORE") return true;
  if (!AVAILABLE_CODES.has(moduleCode)) return false;
  const enabled = activeModules ?? [];
  if (enabled.length === 0) return true;
  return enabled.includes(moduleCode);
}

export function isFieldFeatureModuleEnabled(
  activeModules: readonly string[] | null | undefined,
  featureId: string,
  opts?: { isPlatformAdmin?: boolean },
): boolean {
  if (featureId === "more-permits") {
    return isPermitsFeatureEnabled(activeModules, opts);
  }
  if (featureId === "more-emergency") {
    return isEmergencyFeatureModuleEnabled(activeModules, opts);
  }
  const moduleCode = FIELD_FEATURE_MODULE_MAP[featureId];
  if (!moduleCode) return true;
  return isFieldModuleEnabled(activeModules, moduleCode, opts);
}
