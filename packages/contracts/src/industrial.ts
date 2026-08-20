/**
 * Forge Industrial Safety product contracts.
 * Module registry drives Industrial shell navigation and Creator module management.
 *
 * implementationStatus = AWS readiness (not customer entitlement).
 * Customer access is controlled by tenant module entitlements.
 * Feature flags remain deployment overrides (Advanced).
 */

export const INDUSTRIAL_PRODUCT_CODE = "FORGE_INDUSTRIAL" as const;

/** Ops + shell permissions used by industrial-web and Nest Industrial APIs. */
export const INDUSTRIAL_PERMISSIONS = [
  "industrial.access",
  "industrial.admin",
  "industrial.personnel.view",
  "industrial.personnel.manage",
  "industrial.training.view",
  "industrial.training.manage",
  "industrial.forms.view",
  "industrial.forms.manage",
  "industrial.inspections.view",
  "industrial.inspections.manage",
  "industrial.incidents.view",
  "industrial.incidents.manage",
  "industrial.jsa.view",
  "industrial.jsa.manage",
  "industrial.observations.view",
  "industrial.observations.manage",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.fleet.view",
  "industrial.fleet.manage",
  "industrial.workers_comp.view",
  "industrial.workers_comp.manage",
  "industrial.workers_comp.medical.view",
  "industrial.workers_comp.medical.manage",
  "industrial.corrective_actions.view",
  "industrial.corrective_actions.manage",
  "industrial.scan.view",
  "industrial.scan.manage",
  "industrial.qr_links.view",
  "industrial.qr_links.manage",
  "industrial.legal.documents.read",
  "industrial.legal.documents.manage",
  "industrial.legal.documents.publish",
  "industrial.legal.acknowledgments.read_self",
  "industrial.legal.acknowledgments.read_tenant",
  "industrial.legal.acknowledgments.export",
  "industrial.legal.tenantPolicies.read",
  "industrial.legal.tenantPolicies.manage",
  "industrial.legal.tenantPolicies.publish",
  "industrial.legal.attestations.read_self",
  "industrial.legal.attestations.read_tenant",
] as const;

export type IndustrialPermission = (typeof INDUSTRIAL_PERMISSIONS)[number];

/**
 * Technical readiness of the AWS module implementation.
 * Separate from customer entitlement and from historical data migration.
 */
export type IndustrialImplementationStatus =
  | "AVAILABLE"
  | "LEGACY_ONLY"
  | "MIGRATING"
  | "COMING_SOON"
  | "DEPRECATED"
  | "UNAVAILABLE";

/**
 * @deprecated Prefer implementationStatus. Kept for API/bootstrap compatibility.
 */
export type IndustrialMigrationStatus =
  | "FOUNDATION_ONLY"
  | "MIGRATION_IN_PROGRESS"
  | "LEGACY_FIREBASE"
  | "DISABLED"
  | "LIVE";

export type IndustrialModuleRegistryEntry = {
  code: string;
  name: string;
  group: string;
  route: string;
  /** AWS technical readiness — gates whether Creator may enable the module. */
  implementationStatus: IndustrialImplementationStatus;
  /**
   * Legacy field mirrored from implementationStatus for older clients.
   * Do not use as the primary Creator/Industrial UX label.
   */
  migrationStatus: IndustrialMigrationStatus;
};

function slugRoute(code: string): string {
  return `/modules/${code.toLowerCase().replace(/_/g, "-")}`;
}

function entry(
  code: string,
  name: string,
  group: string,
  implementationStatus: IndustrialImplementationStatus,
  route = slugRoute(code),
): IndustrialModuleRegistryEntry {
  const migrationStatus: IndustrialMigrationStatus =
    implementationStatus === "AVAILABLE"
      ? code === "CORE"
        ? "FOUNDATION_ONLY"
        : "LIVE"
      : implementationStatus === "LEGACY_ONLY"
        ? "LEGACY_FIREBASE"
        : implementationStatus === "MIGRATING"
          ? "MIGRATION_IN_PROGRESS"
          : "DISABLED";
  return { code, name, group, route, implementationStatus, migrationStatus };
}

/**
 * Navigation + Creator source of truth for industrial-web.
 * AVAILABLE = FE workspace + industrial API path exist and may be customer-enabled.
 * LEGACY_ONLY = not ready in AWS (hide from normal users; block enable).
 */
export const INDUSTRIAL_MODULE_REGISTRY: readonly IndustrialModuleRegistryEntry[] = [
  entry("CORE", "Industrial Core", "Dashboard", "AVAILABLE", "/"),
  entry("ANALYTICS", "Analytics", "Dashboard", "AVAILABLE"),
  entry("PERSONNEL", "Personnel", "People & Training", "AVAILABLE"),
  entry("TRAINING", "Training", "People & Training", "AVAILABLE"),
  entry("JSAS", "JSAs", "People & Training", "AVAILABLE"),
  entry("INCIDENTS", "Incidents", "Incident & Claims", "AVAILABLE"),
  entry("OSHA", "OSHA Recordkeeping", "Incident & Claims", "AVAILABLE"),
  entry("WORKERS_COMP", "Workers' Compensation", "Incident & Claims", "AVAILABLE"),
  entry("INSPECTIONS", "Inspections", "Risk & Prevention", "AVAILABLE"),
  entry("FORMS", "Forms", "Risk & Prevention", "AVAILABLE"),
  entry("OBSERVATIONS", "Observations", "Risk & Prevention", "AVAILABLE"),
  entry("RISK", "Risk Register", "Risk & Prevention", "AVAILABLE"),
  entry("SCAN", "Scan", "Risk & Prevention", "AVAILABLE"),
  entry("CORRECTIVE_ACTIONS", "Corrective Actions", "Risk & Prevention", "AVAILABLE"),
  entry("DOT_COMPLIANCE", "DOT Compliance", "Compliance Programs", "AVAILABLE"),
  entry("CONTRACTOR_SAFETY", "Contractor Safety", "Compliance Programs", "AVAILABLE"),
  entry("PROCESS_SAFETY", "Process Safety", "Compliance Programs", "AVAILABLE"),
  entry("ENVIRONMENTAL_SAFETY", "Environmental Safety", "Compliance Programs", "AVAILABLE"),
  entry("EQUIPMENT", "Assets & Equipment", "Equipment & Operations", "AVAILABLE"),
  entry("FLEET", "Fleet", "Equipment & Operations", "AVAILABLE"),
  entry("FORKLIFTS", "Forklifts", "Equipment & Operations", "AVAILABLE"),
  entry("CRANES_RIGGING", "Cranes & Rigging", "Equipment & Operations", "AVAILABLE"),
  entry("MACHINE_SAFETY", "Machine Safety", "Equipment & Operations", "AVAILABLE"),
  entry("ELECTRICAL_SAFETY", "Electrical Safety", "Equipment & Operations", "AVAILABLE"),
  entry("LOCKOUT_TAGOUT", "Lockout/Tagout", "High-Risk Work", "AVAILABLE"),
  entry("CONFINED_SPACE", "Confined Space", "High-Risk Work", "AVAILABLE"),
  entry("HOT_WORK", "Hot Work", "High-Risk Work", "AVAILABLE"),
  entry("WORKING_AT_HEIGHTS", "Working at Heights", "High-Risk Work", "AVAILABLE"),
  entry("CHEMICAL_SAFETY", "Chemical Safety", "Facility & Operations Safety", "AVAILABLE"),
  entry("WAREHOUSE_SAFETY", "Warehouse Safety", "Facility & Operations Safety", "AVAILABLE"),
  entry("MANUFACTURING_SAFETY", "Manufacturing Safety", "Facility & Operations Safety", "AVAILABLE"),
  entry("EMERGENCY_RESPONSE", "Emergency Response", "Emergency Management", "AVAILABLE"),
  entry("TASKS", "Tasks", "System Tools", "AVAILABLE"),
  entry("MESSAGING", "Messaging", "System Tools", "AVAILABLE"),
  entry("DOCUMENTS", "Document Control", "System Tools", "AVAILABLE"),
  entry("QR_LINKS", "QR Links", "System Tools", "AVAILABLE"),
  entry("REPORTING", "Reporting", "System Tools", "AVAILABLE"),
  entry("IMPORT", "Import Center", "System Tools", "AVAILABLE"),
] as const;

/** Feature-flag keys used by industrial-web navigation + Nest bootstrap. */
export const INDUSTRIAL_FEATURE_FLAGS = [
  "industrial.enabled",
  "industrial.legalAcknowledgments.enabled",
  "industrial.legalAcknowledgments.loginGate.enabled",
  "industrial.legalAcknowledgments.transactionAttestations.enabled",
  "industrial.legalAcknowledgments.adminReporting.enabled",
  "industrial.module.analytics.enabled",
  "industrial.module.personnel.enabled",
  "industrial.module.incidents.enabled",
  "industrial.module.inspections.enabled",
  "industrial.module.training.enabled",
  "industrial.module.jsa.enabled",
  "industrial.module.observations.enabled",
  "industrial.module.forms.enabled",
  "industrial.module.scan.enabled",
  "industrial.module.fleet.enabled",
  "industrial.module.corrective_actions.enabled",
  "industrial.module.qr_links.enabled",
  "industrial.module.documents.enabled",
  "industrial.module.reporting.enabled",
  "industrial.module.loto.enabled",
  "industrial.module.equipment.enabled",
  "industrial.module.forklifts.enabled",
  "industrial.module.confined_space.enabled",
  "industrial.module.hot_work.enabled",
  "industrial.module.working_at_heights.enabled",
  "industrial.module.electrical_safety.enabled",
  "industrial.module.cranes_rigging.enabled",
  "industrial.module.machine_safety.enabled",
  "industrial.module.dot.enabled",
  "industrial.module.workers_comp.enabled",
  "industrial.module.osha.enabled",
  "industrial.module.risk.enabled",
  "industrial.module.chemical_safety.enabled",
  "industrial.module.warehouse_safety.enabled",
  "industrial.module.manufacturing_safety.enabled",
  "industrial.module.contractor_safety.enabled",
  "industrial.module.process_safety.enabled",
  "industrial.module.environmental_safety.enabled",
  "industrial.module.tasks.enabled",
  "industrial.module.messaging.enabled",
  "industrial.module.emergency_response.enabled",
] as const;

/** User-facing availability label (Creator + Industrial). Never show raw constants. */
export function industrialAvailabilityLabel(
  status: IndustrialImplementationStatus | IndustrialMigrationStatus | string,
): string {
  switch (status) {
    case "AVAILABLE":
    case "LIVE":
    case "FOUNDATION_ONLY":
      return "Ready";
    case "LEGACY_ONLY":
    case "LEGACY_FIREBASE":
      return "Existing system only";
    case "MIGRATING":
    case "MIGRATION_IN_PROGRESS":
      return "Migration in progress";
    case "COMING_SOON":
      return "Coming soon";
    case "DEPRECATED":
      return "Deprecated";
    case "DISABLED":
    case "UNAVAILABLE":
      return "Not available";
    default:
      return "Not available";
  }
}

export function industrialModuleIsToggleable(
  entry: Pick<IndustrialModuleRegistryEntry, "implementationStatus" | "code">,
): boolean {
  return entry.code !== "CORE" && entry.implementationStatus === "AVAILABLE";
}

export function industrialModulesByImplementation(
  status: IndustrialImplementationStatus,
): IndustrialModuleRegistryEntry[] {
  return INDUSTRIAL_MODULE_REGISTRY.filter((m) => m.implementationStatus === status);
}

/** Fleet asset classification (spreadsheet sheet defaults + custom). */
export const FLEET_ASSET_TYPES = [
  "PASSENGER_VEHICLE",
  "FLEET_VEHICLE",
  "BOB_TRUCK",
  "TRASH_TRUCK",
  "TRACTOR_TRUCK",
  "DUMP_TRUCK",
  "CONSTRUCTION_EQUIPMENT",
  "TRAILER",
  "OTHER",
] as const;
export type FleetAssetType = (typeof FLEET_ASSET_TYPES)[number];

export const FLEET_ASSET_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "OUT_OF_SERVICE",
  "REMOVED",
  "SOLD",
  "DISPOSED",
  "ARCHIVED",
] as const;
export type FleetAssetStatus = (typeof FLEET_ASSET_STATUSES)[number];

export const FLEET_ASSESSMENT_STATUSES = [
  "UNKNOWN",
  "ASSESSED",
  "NOT_ASSESSED",
  "EXEMPT",
  "PENDING",
] as const;
export type FleetAssessmentStatus = (typeof FLEET_ASSESSMENT_STATUSES)[number];

export const FLEET_INSURANCE_STATUSES = [
  "UNKNOWN",
  "INSURED",
  "NOT_INSURED",
  "PENDING",
  "LAPSED",
] as const;
export type FleetInsuranceStatus = (typeof FLEET_INSURANCE_STATUSES)[number];

export const FLEET_COMMUTE_STATUSES = [
  "UNKNOWN",
  "YES",
  "NO",
  "OCCASIONAL",
] as const;
export type FleetCommuteStatus = (typeof FLEET_COMMUTE_STATUSES)[number];

export const FLEET_COMPLIANCE_STATUSES = [
  "UNKNOWN",
  "REQUIRED",
  "FILED",
  "NOT_REQUIRED",
  "OVERDUE",
] as const;
export type FleetComplianceStatus = (typeof FLEET_COMPLIANCE_STATUSES)[number];

export type FleetAsset = {
  id: string;
  tenantId?: string;
  siteId: string | null;
  assetNumber: string | null;
  assetType: FleetAssetType | string;
  customAssetTypeLabel: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  vin: string | null;
  serialNumber: string | null;
  licensePlate: string | null;
  licenseState: string | null;
  renewalDate: string | null;
  registrationRenewalMonth: number | null;
  locationName: string | null;
  assignedDriverId: string | null;
  assignedDriverPersonnelId: string | null;
  assignedDriverName: string | null;
  countyAssessed: string | null;
  countyAssessmentStatus: string | null;
  countyAssessmentNotes: string | null;
  insured: boolean | null;
  insuranceStatus: string | null;
  mileage: number | null;
  mileageUpdatedAt: string | null;
  engineHours: number | null;
  engineHoursUpdatedAt: string | null;
  notes: string | null;
  vehicleFringe: boolean | null;
  notOnVehicleFringeSs: boolean | null;
  commuteUseStatus: string | null;
  commuteUseNotes: string | null;
  form2290Status: string | null;
  form2290Notes: string | null;
  irpStatus: string | null;
  irpNotes: string | null;
  dispositionStatus: string | null;
  dispositionDate: string | null;
  dispositionNotes: string | null;
  outOfService: boolean;
  outOfServiceReason: string | null;
  status: FleetAssetStatus | string;
  createdAt: string;
  updatedAt: string;
};

export type FleetAssetCreateInput = Partial<
  Omit<FleetAsset, "id" | "createdAt" | "updatedAt" | "tenantId">
> & {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
};

export type FleetAssetPatchInput = Partial<FleetAssetCreateInput>;

export type FleetDriver = {
  id: string;
  siteId: string | null;
  personnelId: string | null;
  personnelName: string | null;
  employeeNumber: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpiryDate: string | null;
  dateOfBirth: string | null;
  status: string;
  initialMvrDate: string | null;
  lastMvrDate: string | null;
  nextMvrDueDate: string | null;
  insuranceEffectiveDate: string | null;
  insuranceRemovedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FleetRenewalBucket =
  | "OVERDUE"
  | "DUE_30"
  | "DUE_60"
  | "DUE_90"
  | "LATER"
  | "UNKNOWN";

