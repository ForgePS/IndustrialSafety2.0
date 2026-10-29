/**
 * Starter templates for customer onboarding (Sprint 1E section 11).
 *
 * A template only configures entitlements and role templates. It does not
 * implement product modules; those arrive with the product sprints.
 */

import { catalogModulesForSeed } from "./module-catalog.js";
import { FIELD_EMPLOYEE_PERMISSIONS, FIELD_SUPERVISOR_PERMISSIONS } from "./field.js";
import {
  RMS_DEPARTMENT_ADMIN_PERMISSIONS,
  RMS_FIRE_INVESTIGATOR_PERMISSIONS,
  RMS_HAZMAT_OFFICER_PERMISSIONS,
  RMS_MEMBER_INCIDENT_PERMISSIONS,
  RMS_OFFICER_PERMISSIONS,
  RMS_PERMISSIONS,
  RMS_PREVENTION_OFFICER_PERMISSIONS,
  RMS_SAFETY_OFFICER_PERMISSIONS,
  RMS_TRAINING_OFFICER_PERMISSIONS,
} from "./rms-neris.js";

export interface StarterTemplateRole {
  /** Role template code seeded into `role_templates`. */
  code: string;
  name: string;
  /** Permission codes granted by the tenant role created from this template. */
  permissions: readonly string[];
}

export interface StarterTemplateModule {
  code: string;
  name: string;
  isCore: boolean;
}

export interface StarterTemplate {
  code: string;
  name: string;
  customerType: "INDUSTRIAL" | "FIRE_DEPARTMENT" | "FIRE_ACADEMY" | "OTHER";
  productCode: string;
  organizationTypeCode: string;
  modules: readonly StarterTemplateModule[];
  roles: readonly StarterTemplateRole[];
  /** Optional onboarding step overrides (MK-S7). */
  onboarding?: {
    skipStepKeys?: readonly string[];
  };
}

const ADMIN_PERMISSIONS = [
  "platform.tenant.read",
  "platform.tenant.update",
  "platform.organization.read",
  "platform.organization.create",
  "tenant.facilities.read",
  "tenant.facilities.manage",
  "platform.person.read",
  "platform.person.create",
  "platform.person.update",
  "platform.user.invite",
  "platform.invitation.read",
  "platform.invitation.manage",
  "platform.membership.read",
  "platform.membership.manage",
  "platform.role.assign",
  "platform.permission.read",
  "platform.audit.read",
  "platform.configuration.update",
  "platform.configuration.publish",
  "tenant.configuration.update",
  "tenant.configuration.publish",
] as const;

const MANAGER_PERMISSIONS = [
  "platform.tenant.read",
  "platform.organization.read",
  "tenant.facilities.read",
  "platform.person.read",
  "platform.person.create",
  "platform.person.update",
  "platform.user.invite",
  "platform.invitation.read",
  "platform.invitation.manage",
  "platform.membership.read",
  "platform.permission.read",
] as const;

const SUPERVISOR_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.person.update",
  "platform.membership.read",
  "platform.permission.read",
] as const;

const MEMBER_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
] as const;

export const FORGE_INDUSTRIAL_TEMPLATE: StarterTemplate = {
  code: "INDUSTRIAL_STARTER",
  name: "Forge Industrial Starter",
  customerType: "INDUSTRIAL",
  productCode: "FORGE_INDUSTRIAL",
  organizationTypeCode: "SAFETY_COMPANY",
  modules: catalogModulesForSeed("FORGE_INDUSTRIAL").map((m) => ({
    code: m.code,
    name: m.name,
    isCore: m.isCore,
  })),
  roles: [
    {
      code: "INDUSTRIAL_TENANT_ADMIN",
      name: "Tenant Admin",
      permissions: [...ADMIN_PERMISSIONS, ...FIELD_SUPERVISOR_PERMISSIONS, "industrial.access"],
    },
    {
      code: "INDUSTRIAL_SAFETY_MANAGER",
      name: "Safety Director",
      permissions: [...MANAGER_PERMISSIONS, ...FIELD_SUPERVISOR_PERMISSIONS, "industrial.access"],
    },
    {
      code: "INDUSTRIAL_SUPERVISOR",
      name: "Supervisor",
      permissions: [
        ...SUPERVISOR_PERMISSIONS,
        ...FIELD_SUPERVISOR_PERMISSIONS,
        "industrial.access",
      ],
    },
    {
      code: "INDUSTRIAL_EMPLOYEE",
      name: "Employee",
      permissions: [...MEMBER_PERMISSIONS, ...FIELD_EMPLOYEE_PERMISSIONS, "industrial.access"],
    },
  ],
};

export const FORGE_RMS_TEMPLATE: StarterTemplate = {
  code: "RMS_STARTER",
  name: "Forge RMS Starter",
  customerType: "FIRE_DEPARTMENT",
  productCode: "FORGE_RMS",
  organizationTypeCode: "FIRE_DEPARTMENT",
  modules: catalogModulesForSeed("FORGE_RMS").map((m) => ({
    code: m.code,
    name: m.name,
    isCore: m.isCore,
  })),
  roles: [
    {
      code: "RMS_DEPARTMENT_ADMIN",
      name: "Department Admin",
      permissions: RMS_DEPARTMENT_ADMIN_PERMISSIONS,
    },
    {
      code: "RMS_CHIEF_OFFICER",
      name: "Chief Officer",
      permissions: [
        ...MANAGER_PERMISSIONS,
        ...RMS_PERMISSIONS.filter((p) => !p.endsWith(".manage") || p.includes("configuration")),
      ],
    },
    {
      code: "RMS_COMPANY_OFFICER",
      name: "Company Officer",
      permissions: RMS_OFFICER_PERMISSIONS,
    },
    {
      code: "RMS_MEMBER",
      name: "Member",
      permissions: RMS_MEMBER_INCIDENT_PERMISSIONS,
    },
    {
      code: "RMS_FIRE_INVESTIGATOR",
      name: "Fire Investigator",
      permissions: RMS_FIRE_INVESTIGATOR_PERMISSIONS,
    },
    {
      code: "RMS_HAZMAT_OFFICER",
      name: "Hazmat Officer",
      permissions: RMS_HAZMAT_OFFICER_PERMISSIONS,
    },
    {
      code: "RMS_SAFETY_OFFICER",
      name: "Safety Officer",
      permissions: RMS_SAFETY_OFFICER_PERMISSIONS,
    },
    {
      code: "RMS_PREVENTION_OFFICER",
      name: "Prevention Officer",
      permissions: RMS_PREVENTION_OFFICER_PERMISSIONS,
    },
    {
      code: "RMS_TRAINING_OFFICER",
      name: "Training Officer",
      permissions: RMS_TRAINING_OFFICER_PERMISSIONS,
    },
  ],
};

export const FORGE_ACADEMY_TEMPLATE: StarterTemplate = {
  code: "ACADEMY_STARTER",
  name: "Forge Academy Starter",
  customerType: "FIRE_ACADEMY",
  productCode: "FORGE_ACADEMY",
  organizationTypeCode: "FIRE_ACADEMY",
  modules: catalogModulesForSeed("FORGE_ACADEMY").map((m) => ({
    code: m.code,
    name: m.name,
    isCore: m.isCore,
  })),
  roles: [
    { code: "ACADEMY_ADMIN", name: "Academy Admin", permissions: ADMIN_PERMISSIONS },
    { code: "ACADEMY_REGISTRAR", name: "Registrar", permissions: MANAGER_PERMISSIONS },
    { code: "ACADEMY_INSTRUCTOR", name: "Instructor", permissions: SUPERVISOR_PERMISSIONS },
    { code: "ACADEMY_STUDENT", name: "Student", permissions: MEMBER_PERMISSIONS },
    {
      code: "ACADEMY_DEPARTMENT_COORDINATOR",
      name: "Department Coordinator",
      permissions: MANAGER_PERMISSIONS,
    },
  ],
};

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  FORGE_INDUSTRIAL_TEMPLATE,
  FORGE_RMS_TEMPLATE,
  FORGE_ACADEMY_TEMPLATE,
];

export function findStarterTemplate(code: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((template) => template.code === code);
}

export function findStarterTemplateForCustomerType(
  customerType: StarterTemplate["customerType"],
): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((template) => template.customerType === customerType);
}
