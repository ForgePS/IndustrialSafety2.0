/**
 * Forge Field (mobile PWA) permission contracts.
 * Field is another interface into Forge Industrial Safety — not a separate product DB.
 * Permissions integrate with existing industrial RBAC and tenant isolation.
 */

export const FIELD_PRODUCT_SURFACE = "FORGE_FIELD" as const;

/** Field App endpoint / surface permissions (server-enforced). */
export const FIELD_PERMISSIONS = [
  "field.access",
  "field.scan",
  "field.training.view",
  "field.training.complete",
  "field.inspections.perform",
  "field.incidents.create",
  "field.hazards.create",
  "field.observations.create",
  "field.correctiveActions.view",
  "field.correctiveActions.complete",
  "field.loto.execute",
  "field.jsa.execute",
  "field.permits.view",
  "field.permits.approve",
  "field.fleet.inspect",
  "field.sds.view",
  "field.documents.view",
  "field.emergency.view",
  "field.supervisor.dashboard",
  "field.sanitation.report",
  "field.sanitation.inspect",
  "field.sanitation.clean",
] as const;

export type FieldPermission = (typeof FIELD_PERMISSIONS)[number];

/** Default Field permissions for industrial floor employees. */
export const FIELD_EMPLOYEE_PERMISSIONS = [
  "field.access",
  "field.scan",
  "field.training.view",
  "field.training.complete",
  "field.inspections.perform",
  "field.incidents.create",
  "field.hazards.create",
  "field.observations.create",
  "field.correctiveActions.view",
  "field.correctiveActions.complete",
  "field.loto.execute",
  "field.jsa.execute",
  "field.permits.view",
  "field.fleet.inspect",
  "field.sds.view",
  "field.documents.view",
  "field.emergency.view",
  "field.sanitation.report",
  "field.sanitation.inspect",
  "field.sanitation.clean",
] as const satisfies readonly FieldPermission[];

/** Supervisor Field surface additions. */
export const FIELD_SUPERVISOR_PERMISSIONS = [
  ...FIELD_EMPLOYEE_PERMISSIONS,
  "field.permits.approve",
  "field.supervisor.dashboard",
] as const satisfies readonly FieldPermission[];
