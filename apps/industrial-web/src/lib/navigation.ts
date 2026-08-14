import {
  INDUSTRIAL_MODULE_REGISTRY,
  industrialAvailabilityLabel,
  type IndustrialImplementationStatus,
} from "@forge/contracts";

export type IndustrialNavItem = {
  code: string;
  name: string;
  group: string;
  route: string;
  /** @deprecated Prefer implementationStatus for UX. */
  migrationStatus: string;
  implementationStatus: IndustrialImplementationStatus;
  awsEnabled: boolean;
  customerEnabled: boolean;
  available: boolean;
  requiredPermissions: string[];
};

const FLAG_BY_CODE: Record<string, string> = {
  CORE: "industrial.enabled",
  ANALYTICS: "industrial.module.analytics.enabled",
  PERSONNEL: "industrial.module.personnel.enabled",
  INCIDENTS: "industrial.module.incidents.enabled",
  INSPECTIONS: "industrial.module.inspections.enabled",
  TRAINING: "industrial.module.training.enabled",
  JSAS: "industrial.module.jsa.enabled",
  OBSERVATIONS: "industrial.module.observations.enabled",
  FORMS: "industrial.module.forms.enabled",
  SCAN: "industrial.module.scan.enabled",
  QR_LINKS: "industrial.module.qr_links.enabled",
  DOCUMENTS: "industrial.module.documents.enabled",
  REPORTING: "industrial.module.reporting.enabled",
  IMPORT: "industrial.enabled",
  LOCKOUT_TAGOUT: "industrial.module.loto.enabled",
  EQUIPMENT: "industrial.module.equipment.enabled",
  FORKLIFTS: "industrial.module.forklifts.enabled",
  CONFINED_SPACE: "industrial.module.confined_space.enabled",
  HOT_WORK: "industrial.module.hot_work.enabled",
  WORKING_AT_HEIGHTS: "industrial.module.working_at_heights.enabled",
  ELECTRICAL_SAFETY: "industrial.module.electrical_safety.enabled",
  CRANES_RIGGING: "industrial.module.cranes_rigging.enabled",
  MACHINE_SAFETY: "industrial.module.machine_safety.enabled",
  DOT_COMPLIANCE: "industrial.module.dot.enabled",
  WORKERS_COMP: "industrial.module.workers_comp.enabled",
  OSHA: "industrial.module.osha.enabled",
  RISK: "industrial.module.risk.enabled",
  CHEMICAL_SAFETY: "industrial.module.chemical_safety.enabled",
  WAREHOUSE_SAFETY: "industrial.module.warehouse_safety.enabled",
  MANUFACTURING_SAFETY: "industrial.module.manufacturing_safety.enabled",
  CONTRACTOR_SAFETY: "industrial.module.contractor_safety.enabled",
  PROCESS_SAFETY: "industrial.module.process_safety.enabled",
  ENVIRONMENTAL_SAFETY: "industrial.module.environmental_safety.enabled",
  TASKS: "industrial.module.tasks.enabled",
  MESSAGING: "industrial.module.messaging.enabled",
  EMERGENCY_RESPONSE: "industrial.module.emergency_response.enabled",
};

export function featureFlagForModule(code: string): string {
  return FLAG_BY_CODE[code] ?? `industrial.module.${code.toLowerCase()}.enabled`;
}

function asSet(value?: ReadonlySet<string> | readonly string[] | null): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? new Set(value) : new Set(value);
}

/**
 * Resolve whether a deployment feature flag blocks an AVAILABLE module.
 * Missing flag keys default ON for AVAILABLE modules so Creator entitlements
 * are the commercial control plane (flags stay Advanced overrides).
 */
function deploymentAllows(
  implementationStatus: IndustrialImplementationStatus,
  flagKey: string,
  flags: Record<string, boolean>,
): boolean {
  if (implementationStatus !== "AVAILABLE") {
    return Boolean(flags[flagKey]);
  }
  if (Object.prototype.hasOwnProperty.call(flags, flagKey)) {
    return Boolean(flags[flagKey]);
  }
  return true;
}

export function buildIndustrialNavigation(input: {
  entitled: boolean;
  permissions: ReadonlySet<string> | string[];
  flags: Record<string, boolean>;
  /** Customer module entitlements / me.activeModules. CORE follows product entitlement. */
  enabledModules?: ReadonlySet<string> | readonly string[] | null;
  /**
   * When true, an empty enabledModules set means only CORE is customer-enabled
   * (Creator entitlements are authoritative). When false, empty falls back to
   * deployment flags for backward-compatible bootstrap-only shells.
   */
  strictEntitlements?: boolean;
  /** When true (platform admin diagnostic), keep non-available modules in the returned list. */
  includeUnavailable?: boolean;
}): IndustrialNavItem[] {
  if (!input.entitled) {
    return [];
  }
  const perms = asSet(input.permissions);
  if (!perms.has("industrial.access")) {
    return [];
  }
  const enabledModules = asSet(input.enabledModules);
  const strict = Boolean(input.strictEntitlements);

  const items = INDUSTRIAL_MODULE_REGISTRY.map((entry) => {
    const flagKey = featureFlagForModule(entry.code);
    const requiredPermissions = ["industrial.access"];
    const hasPerms = requiredPermissions.every((p) => perms.has(p));
    const implementationStatus = entry.implementationStatus;
    const deploymentOk = deploymentAllows(implementationStatus, flagKey, input.flags);
    const customerEnabled =
      entry.code === "CORE"
        ? true
        : strict || enabledModules.size > 0
          ? enabledModules.has(entry.code)
          : deploymentOk;

    const awsEnabled = deploymentOk;
    const available =
      hasPerms &&
      implementationStatus === "AVAILABLE" &&
      customerEnabled &&
      deploymentOk;

    return {
      code: entry.code,
      name: entry.name,
      group: entry.group,
      route: entry.route,
      migrationStatus: entry.migrationStatus,
      implementationStatus,
      awsEnabled,
      customerEnabled,
      available,
      requiredPermissions,
    };
  });

  if (input.includeUnavailable) {
    return items;
  }
  return items.filter((item) => item.available);
}

export function moduleUnavailableMessage(moduleName: string): string {
  // Customer-facing copy: never name hosting/infrastructure. The adjacent
  // availability label carries the distinction between "not enabled for you"
  // and "not built yet".
  return `${moduleName} is not available for your organization yet.`;
}

export function moduleAvailabilityCaption(
  item: Pick<IndustrialNavItem, "implementationStatus" | "customerEnabled" | "available">,
): string {
  if (item.available) return "Ready";
  if (item.implementationStatus !== "AVAILABLE") {
    return industrialAvailabilityLabel(item.implementationStatus);
  }
  if (!item.customerEnabled) return "Not enabled";
  return "Unavailable";
}
