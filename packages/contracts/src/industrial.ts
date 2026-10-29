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
  "industrial.personnel.discipline.view",
  "industrial.personnel.discipline.manage",
  "industrial.first_aid.view",
  "industrial.first_aid.manage",
  "industrial.training.view",
  "industrial.training.manage",
  "industrial.forms.view",
  "industrial.forms.manage",
  "industrial.inspections.view",
  "industrial.inspections.manage",
  "industrial.sanitation.view",
  "industrial.sanitation.manage",
  "industrial.sanitation.inspect",
  "industrial.sanitation.clean",
  "industrial.sanitation.verify",
  "industrial.sanitation.report",
  "industrial.incidents.view",
  "industrial.incidents.manage",
  "industrial.photo_markup.view",
  "industrial.photo_markup.create",
  "industrial.photo_markup.edit",
  "industrial.photo_markup.delete",
  "industrial.photo_markup.view_original",
  "industrial.photo_markup.view_history",
  "industrial.photo_markup.restore",
  "industrial.photo_markup.redact",
  "industrial.jsa.view",
  "industrial.jsa.manage",
  "industrial.observations.view",
  "industrial.observations.manage",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.loto.approve",
  "industrial.equipment.view",
  "industrial.equipment.manage",
  "industrial.fleet.view",
  "industrial.fleet.manage",
  "industrial.supplies.view",
  "industrial.supplies.manage",
  "industrial.supplies.create",
  "industrial.supplies.edit",
  "industrial.supplies.delete",
  "industrial.supplies.issue",
  "industrial.supplies.return",
  "industrial.supplies.receive",
  "industrial.supplies.transfer",
  "industrial.supplies.adjust",
  "industrial.supplies.count",
  "industrial.supplies.count.approve",
  "industrial.supplies.ppe.view",
  "industrial.supplies.ppe.issue",
  "industrial.supplies.ppe.return",
  "industrial.supplies.inspection.perform",
  "industrial.supplies.inspection.manage",
  "industrial.supplies.requests.create",
  "industrial.supplies.requests.approve",
  "industrial.supplies.requests.view",
  "industrial.supplies.requests.review",
  "industrial.supplies.requests.deny",
  "industrial.supplies.requests.assign",
  "industrial.supplies.requests.fulfill",
  "industrial.supplies.requests.cancel",
  "industrial.supplies.qr.view",
  "industrial.supplies.qr.create",
  "industrial.supplies.qr.edit",
  "industrial.supplies.qr.disable",
  "industrial.supplies.qr.regenerate",
  "industrial.supplies.qr.delete",
  "industrial.supplies.purchase.view",
  "industrial.supplies.purchase.create",
  "industrial.supplies.purchase.approve",
  "industrial.supplies.vendor.view",
  "industrial.supplies.vendor.manage",
  "industrial.supplies.cost.view",
  "industrial.supplies.settings.manage",
  "industrial.supplies.reports.view",
  "industrial.supplies.reports.export",
  "industrial.reporting.view",
  "industrial.reporting.run",
  "industrial.reporting.export",
  "industrial.reporting.manage",
  "industrial.reporting.view_sensitive",
  "industrial.reporting.schedule",
  "industrial.reporting.share",
  "industrial.reporting.admin",
  "industrial.emergency_alerts.view",
  "industrial.emergency_alerts.create",
  "industrial.emergency_alerts.send",
  "industrial.emergency_alerts.update",
  "industrial.emergency_alerts.clear",
  "industrial.emergency_alerts.cancel",
  "industrial.emergency_alerts.approve",
  "industrial.emergency_alerts.resend",
  "industrial.emergency_alerts.view_delivery",
  "industrial.emergency_alerts.manage_templates",
  "industrial.emergency_alerts.manage_groups",
  "industrial.emergency_alerts.manage_mvix",
  "industrial.emergency_alerts.manage_settings",
  "industrial.emergency_alerts.run_drills",
  "industrial.emergency_alerts.admin",
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
  "industrial.qr.view",
  "industrial.qr.scan",
  "industrial.qr.manage",
  "industrial.qr.generate",
  "industrial.qr.print",
  "industrial.qr.replace",
  "industrial.qr.deactivate",
  "industrial.qr.inspection.perform",
  "industrial.qr.issue.create",
  "industrial.qr.history.view",
  "industrial.qr.asset.out_of_service",
  "industrial.qr.asset.return_to_service",
  "industrial.qr.audit.view",
  "industrial.qr.analytics.view",
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
  "industrial.documents.view",
  "industrial.documents.manage",
  "industrial.documents.approve",
  "industrial.documents.acknowledge",
  "industrial.presentation.executive.view",
  "industrial.presentation.executive.manage",
  "industrial.presentation.executive.export",
  "industrial.presentation.executive.delete_export",
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.walkthrough.narration.edit",
  "industrial.walkthrough.voices.manage",
  "industrial.walkthrough.demo.manage",
  "industrial.walkthrough.demo.reset",
  "industrial.walkthrough.videos.generate",
  "industrial.walkthrough.videos.download",
  "industrial.walkthrough.share.manage",
  "industrial.walkthrough.analytics.view",
  "industrial.printer.view",
  "industrial.printer.print",
  "industrial.printer.quick_print",
  "industrial.printer.reprint",
  "industrial.printer.cancel",
  "industrial.printer.manage",
  "industrial.printer.manage_defaults",
  "industrial.printer.manage_media",
  "industrial.printer.manage_templates",
  "industrial.printer.manage_bridge",
  "industrial.printer.pair_bluetooth",
  "industrial.printer.view_logs",
  "industrial.printer.run_diagnostics",
] as const;

export type IndustrialPermission = (typeof INDUSTRIAL_PERMISSIONS)[number];

/**
 * Technical readiness of the AWS module implementation.
 * Separate from customer entitlement and from historical data migration.
 */
export type IndustrialImplementationStatus =
  "AVAILABLE" | "LEGACY_ONLY" | "MIGRATING" | "COMING_SOON" | "DEPRECATED" | "UNAVAILABLE";

/**
 * @deprecated Prefer implementationStatus. Kept for API/bootstrap compatibility.
 */
export type IndustrialMigrationStatus =
  "FOUNDATION_ONLY" | "MIGRATION_IN_PROGRESS" | "LEGACY_FIREBASE" | "DISABLED" | "LIVE";

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
  entry("FIRST_AID", "First Aid", "People & Training", "AVAILABLE"),
  entry("TRAINING", "Training", "People & Training", "AVAILABLE"),
  entry("JSAS", "JSAs", "People & Training", "AVAILABLE"),
  entry("INCIDENTS", "Incidents", "Incident & Claims", "AVAILABLE"),
  entry("OSHA", "OSHA Recordkeeping", "Incident & Claims", "AVAILABLE"),
  entry("WORKERS_COMP", "Workers' Compensation", "Incident & Claims", "AVAILABLE"),
  entry("INSPECTIONS", "Inspections", "Risk & Prevention", "AVAILABLE"),
  entry("SANITATION", "Sanitation", "Risk & Prevention", "AVAILABLE"),
  entry("FORMS", "Forms", "Risk & Prevention", "AVAILABLE"),
  entry("OBSERVATIONS", "Observations", "Risk & Prevention", "AVAILABLE"),
  entry("RISK", "Risk Register", "Risk & Prevention", "AVAILABLE"),
  entry("SCAN", "QR Scan", "Risk & Prevention", "AVAILABLE"),
  entry("CORRECTIVE_ACTIONS", "Corrective Actions", "Risk & Prevention", "AVAILABLE"),
  entry("DOT_COMPLIANCE", "DOT Compliance", "Compliance Programs", "AVAILABLE"),
  entry("CONTRACTOR_SAFETY", "Contractor Safety", "Compliance Programs", "AVAILABLE"),
  entry("PROCESS_SAFETY", "Process Safety", "Compliance Programs", "AVAILABLE"),
  entry("ENVIRONMENTAL_SAFETY", "Environmental Safety", "Compliance Programs", "AVAILABLE"),
  entry("EQUIPMENT", "Assets & Equipment", "Equipment & Operations", "AVAILABLE"),
  entry("FLEET", "Fleet", "Equipment & Operations", "AVAILABLE"),
  entry("SAFETY_SUPPLIES", "Safety Supplies", "Equipment & Operations", "AVAILABLE"),
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
  entry(
    "MANUFACTURING_SAFETY",
    "Manufacturing Safety",
    "Facility & Operations Safety",
    "AVAILABLE",
  ),
  entry("EMERGENCY_RESPONSE", "Emergency Response", "Emergency Management", "AVAILABLE"),
  entry("EMERGENCY_ALERTS", "Emergency Alerts", "Emergency Management", "AVAILABLE"),
  entry("TASKS", "Tasks", "System Tools", "AVAILABLE"),
  entry("CALENDAR", "Calendar", "System Tools", "AVAILABLE"),
  entry("REMINDERS", "Reminders", "System Tools", "AVAILABLE"),
  entry("MESSAGING", "Messaging", "System Tools", "AVAILABLE"),
  entry("DOCUMENTS", "Document Control", "System Tools", "AVAILABLE"),
  entry("QR_LINKS", "QR Management", "System Tools", "AVAILABLE"),
  entry("REPORTING", "Reporting", "System Tools", "AVAILABLE", "/reporting"),
  entry("IMPORT", "Import Center", "System Tools", "AVAILABLE"),
  entry("PRINT_MANAGER", "Print Manager", "System Tools", "AVAILABLE"),
  entry("PRINT_QUEUE", "Print Queue", "System Tools", "AVAILABLE"),
  entry("PRINT_HISTORY", "Print History", "System Tools", "AVAILABLE"),
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
  "industrial.module.first_aid.enabled",
  "industrial.module.incidents.enabled",
  "industrial.module.inspections.enabled",
  "industrial.module.sanitation.enabled",
  "industrial.module.training.enabled",
  "industrial.module.jsa.enabled",
  "industrial.module.observations.enabled",
  "industrial.module.forms.enabled",
  "industrial.module.scan.enabled",
  "industrial.module.fleet.enabled",
  "industrial.module.safety_supplies.enabled",
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
  "industrial.module.calendar.enabled",
  "industrial.module.reminders.enabled",
  "industrial.module.messaging.enabled",
  "industrial.module.emergency_response.enabled",
  "industrial.module.emergency_alerts.enabled",
  "industrial.module.print_manager.enabled",
  "industrial.module.print_queue.enabled",
  "industrial.module.print_history.enabled",
  "forge.printing.enabled",
  "forge.printing.print_manager.enabled",
  "forge.printing.bridge.enabled",
  "forge.printing.bluetooth.enabled",
  "forge.printing.directBluetooth.enabled",
  "forge.printing.batch.enabled",
  "forge.printing.failover.enabled",
  "forge.printing.analytics.enabled",
  "forge.printing.supplies.enabled",
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

export const FLEET_COMMUTE_STATUSES = ["UNKNOWN", "YES", "NO", "OCCASIONAL"] as const;
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
  /** DOT-regulated assets require DVIR; non-commercial assets do not. */
  dotRegulated: boolean;
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

export type FleetRenewalBucket = "OVERDUE" | "DUE_30" | "DUE_60" | "DUE_90" | "LATER" | "UNKNOWN";
