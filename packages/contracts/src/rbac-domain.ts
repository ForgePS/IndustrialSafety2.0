/**
 * RBAC domain (FORGE-SAAS MK-S4).
 * Authorize on permission codes (ADR-015), not role display names.
 * SaaS personas map onto Forge role template codes for onboarding/docs/tests.
 */

/** Core SaaS permission codes used in representative authZ matrices. */
export const CORE_SAAS_PERMISSIONS = [
  "platform.tenant.read",
  "platform.tenant.update",
  "platform.organization.read",
  "platform.organization.create",
  "platform.person.read",
  "platform.person.create",
  "platform.person.update",
  "platform.user.invite",
  "platform.role.assign",
  "platform.permission.read",
  "platform.audit.read",
  "platform.audit.export",
  "platform.membership.read",
  "platform.membership.manage",
  "platform.invitation.read",
  "platform.invitation.manage",
  "tenant.facilities.read",
  "tenant.facilities.manage",
] as const;

export type CoreSaasPermission = (typeof CORE_SAAS_PERMISSIONS)[number];

/**
 * Tenant owner: full tenant SaaS administration (billing depth deferred to later sprints).
 * Seeded as role template TENANT_OWNER.
 */
export const TENANT_OWNER_PERMISSIONS = [
  "platform.tenant.read",
  "platform.tenant.update",
  "platform.organization.read",
  "platform.organization.create",
  "platform.person.read",
  "platform.person.create",
  "platform.person.update",
  "platform.person.merge",
  "platform.user.invite",
  "platform.role.assign",
  "platform.permission.read",
  "platform.audit.read",
  "platform.audit.export",
  "platform.feature.manage",
  "tenant.billing.read",
  "platform.configuration.update",
  "platform.configuration.publish",
  "tenant.configuration.update",
  "tenant.configuration.publish",
  "tenant.facilities.read",
  "tenant.facilities.manage",
  "platform.sensitive_data.read",
  "platform.invitation.read",
  "platform.invitation.manage",
  "platform.membership.read",
  "platform.membership.manage",
  "tenant.notification.read",
  "tenant.notification.manage",
  "tenant.api_key.read",
  "tenant.api_key.manage",
  "tenant.webhook.read",
  "tenant.webhook.manage",
  "platform.jobs.read",
  "tenant.export.read",
  "tenant.export.create",
  "import.view",
  "import.upload",
  "import.map",
  "import.validate",
  "import.preview",
  "import.approve",
  "import.execute",
  "import.rollback",
  "import.profile.manage",
  "import.error.reprocess",
  // Print Manager — tenant admins/owners can register bridges and manage printers
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

/** Tenant admin: same core SaaS surface as owner for MK-S4 (no billing-owner split yet). */
export const TENANT_ADMIN_PERMISSIONS = [...TENANT_OWNER_PERMISSIONS] as const;

export const STANDARD_USER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "tenant.notification.read",
] as const;

export const READ_ONLY_USER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
  "platform.audit.read",
  "tenant.notification.read",
] as const;

export const SAAS_ROLE_PERSONAS = ["owner", "admin", "member", "viewer"] as const;
export type SaasRolePersona = (typeof SAAS_ROLE_PERSONAS)[number];

export const SAAS_PERSONA_TO_ROLE_TEMPLATE = {
  owner: "TENANT_OWNER",
  admin: "TENANT_ADMIN",
  member: "STANDARD_USER",
  viewer: "READ_ONLY_USER",
} as const satisfies Record<SaasRolePersona, string>;

export type SaasPersonaRoleTemplateCode = (typeof SAAS_PERSONA_TO_ROLE_TEMPLATE)[SaasRolePersona];

export const SAAS_PERSONA_PERMISSIONS = {
  owner: TENANT_OWNER_PERMISSIONS,
  admin: TENANT_ADMIN_PERMISSIONS,
  member: STANDARD_USER_PERMISSIONS,
  viewer: READ_ONLY_USER_PERMISSIONS,
} as const satisfies Record<SaasRolePersona, readonly string[]>;

export function isSaasRolePersona(value: string): value is SaasRolePersona {
  return (SAAS_ROLE_PERSONAS as readonly string[]).includes(value.trim().toLowerCase());
}

export function resolveSaasRolePersona(value: string): SaasRolePersona | null {
  const normalized = value.trim().toLowerCase();
  return isSaasRolePersona(normalized) ? normalized : null;
}

export function roleTemplateCodeForSaasPersona(
  persona: SaasRolePersona,
): SaasPersonaRoleTemplateCode {
  return SAAS_PERSONA_TO_ROLE_TEMPLATE[persona];
}

export function permissionsForSaasPersona(persona: SaasRolePersona): readonly string[] {
  return SAAS_PERSONA_PERMISSIONS[persona];
}

export function saasPersonaHasPermission(
  persona: SaasRolePersona,
  permissionCode: string,
): boolean {
  return (SAAS_PERSONA_PERMISSIONS[persona] as readonly string[]).includes(permissionCode);
}

/** Mutation heuristic aligned with `@forge/authorization` isReadPermission (".read" suffix). */
export function isSaasMutationPermission(permissionCode: string): boolean {
  return !permissionCode.endsWith(".read");
}
