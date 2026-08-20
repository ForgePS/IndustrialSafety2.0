import {
  ALL_PERMISSIONS,
  READ_ONLY_USER_PERMISSIONS,
  STANDARD_USER_PERMISSIONS,
  STARTER_TEMPLATES,
  TENANT_ADMIN_PERMISSIONS,
  TENANT_OWNER_PERMISSIONS,
  catalogModulesForSeed,
  isCreatorOnlyPermission,
} from "@forge/contracts";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import { seedLegalAcknowledgments } from "./seed-legal-acknowledgments.js";
import {
  featureDefinitions,
  organizationTypes,
  permissions,
  platformModules,
  platformProducts,
  roleTemplatePermissions,
  roleTemplates,
} from "./schema.js";

export type SeedDatabase = PostgresJsDatabase<typeof schema>;

const PRODUCTS = [
  {
    code: "FORGE_ACADEMY",
    name: "Forge Academy",
    description: "Training academy product",
  },
  {
    code: "FORGE_RMS",
    name: "Forge RMS",
    description: "Records management for fire and emergency services",
  },
  {
    code: "FORGE_INDUSTRIAL",
    name: "Forge Industrial Safety",
    description: "Industrial safety and compliance product",
  },
  {
    code: "FORGE_CREATOR",
    name: "Forge Creator",
    description: "Internal platform control plane",
  },
] as const;

type SeedModule = {
  code: string;
  name: string;
  isCore: boolean;
  category: string;
  classification: string;
  implementationStatus: string;
  customerAssignable: boolean;
  displayOrder: number;
  description?: string;
};

/**
 * Product modules from canonical MODULE-CATALOG-S2 contract.
 * Creator modules are internal and never customer-selectable.
 */
const MODULES_BY_PRODUCT: Record<string, SeedModule[]> = {
  FORGE_CREATOR: catalogModulesForSeed("FORGE_CREATOR"),
  FORGE_INDUSTRIAL: catalogModulesForSeed("FORGE_INDUSTRIAL"),
  FORGE_RMS: catalogModulesForSeed("FORGE_RMS"),
  FORGE_ACADEMY: catalogModulesForSeed("FORGE_ACADEMY"),
};

const ORG_TYPES = [
  { code: "FIRE_DEPARTMENT", name: "Fire Department" },
  { code: "FIRE_ACADEMY", name: "Fire Academy" },
  { code: "DEPARTMENT", name: "Department" },
  { code: "MUNICIPALITY", name: "Municipality" },
  { code: "WATER_UTILITY", name: "Water Utility" },
  { code: "VENDOR", name: "Vendor" },
  { code: "SAFETY_COMPANY", name: "Safety Company" },
  { code: "ENTERPRISE_CUSTOMER", name: "Enterprise Customer" },
  { code: "OTHER", name: "Other" },
] as const;

const ROLE_TEMPLATES = [
  {
    code: "PLATFORM_SUPER_ADMIN",
    name: "Platform Super Admin",
    roleType: "PLATFORM",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    code: "CREATOR_ADMIN",
    name: "Creator Admin",
    roleType: "PLATFORM",
    permissions: [
      "platform.tenant.read",
      "platform.tenant.create",
      "platform.tenant.update",
      "platform.tenant.suspend",
      "platform.organization.read",
      "platform.organization.create",
      "tenant.facilities.read",
      "tenant.facilities.manage",
      "platform.person.read",
      "platform.user.invite",
      "platform.role.assign",
      "platform.permission.read",
      "platform.audit.read",
      "platform.feature.manage",
      "platform.entitlement.manage",
      "tenant.billing.read",
      "platform.configuration.update",
      "platform.configuration.publish",
      "platform.invitation.read",
      "platform.invitation.manage",
      "platform.membership.read",
      "platform.membership.manage",
      "platform.onboarding.manage",
      "platform.analytics.read",
      "import.view",
      "import.upload",
      "import.map",
      "import.validate",
      "import.preview",
      "import.approve",
      "import.execute",
      "import.rollback",
      "import.profile.manage",
      "import.template.manage",
      "import.error.reprocess",
      "import.sensitive",
    ],
  },
  {
    code: "PLATFORM_SUPPORT",
    name: "Platform Support",
    roleType: "PLATFORM",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "tenant.facilities.read",
      "platform.person.read",
      "platform.permission.read",
      "platform.audit.read",
      "platform.configuration.update",
      "platform.configuration.publish",
      "import.view",
      "import.upload",
      "import.map",
      "import.validate",
      "import.preview",
      "import.execute",
      "import.rollback",
      "import.error.reprocess",
    ],
  },
  {
    code: "TENANT_OWNER",
    name: "Tenant Owner",
    roleType: "TENANT",
    permissions: [...TENANT_OWNER_PERMISSIONS],
  },
  {
    code: "TENANT_ADMIN",
    name: "Tenant Admin",
    roleType: "TENANT",
    permissions: [...TENANT_ADMIN_PERMISSIONS],
  },
  {
    code: "CONFIGURATION_MANAGER",
    name: "Configuration Manager",
    roleType: "TENANT",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "platform.permission.read",
      "platform.audit.read",
      "tenant.configuration.update",
      "tenant.configuration.publish",
    ],
  },
  {
    code: "ORGANIZATION_ADMIN",
    name: "Organization Admin",
    roleType: "ORGANIZATION",
    permissions: [
      "platform.organization.read",
      "platform.person.read",
      "platform.person.create",
      "platform.person.update",
      "platform.user.invite",
      "platform.role.assign",
      "platform.permission.read",
    ],
  },
  {
    code: "SECURITY_ADMIN",
    name: "Security Admin",
    roleType: "TENANT",
    permissions: [
      "platform.tenant.read",
      "platform.person.read",
      "platform.role.assign",
      "platform.permission.read",
      "platform.audit.read",
      "platform.sensitive_data.read",
    ],
  },
  {
    code: "AUDITOR",
    name: "Auditor",
    roleType: "TENANT",
    permissions: [
      "platform.tenant.read",
      "platform.organization.read",
      "platform.person.read",
      "platform.permission.read",
      "platform.audit.read",
    ],
  },
  {
    code: "STANDARD_USER",
    name: "Standard User",
    roleType: "TENANT",
    permissions: [...STANDARD_USER_PERMISSIONS],
  },
  {
    code: "READ_ONLY_USER",
    name: "Read Only User",
    roleType: "TENANT",
    permissions: [...READ_ONLY_USER_PERMISSIONS],
  },
] as const;

type SeedRoleTemplate = {
  code: string;
  name: string;
  roleType: string;
  permissions: readonly string[];
};

/** Platform role templates plus one template per starter-template role. */
const ALL_ROLE_TEMPLATES: SeedRoleTemplate[] = [
  ...ROLE_TEMPLATES.map((template) => ({
    code: template.code,
    name: template.name,
    roleType: template.roleType,
    permissions: template.permissions as readonly string[],
  })),
  ...STARTER_TEMPLATES.flatMap((template) =>
    template.roles.map((role) => ({
      code: role.code,
      name: role.name,
      roleType: "TENANT",
      permissions: role.permissions,
    })),
  ),
];

const FEATURES = [
  {
    key: "person.duplicate_detection.enabled",
    name: "Person duplicate detection",
    description: "Generate duplicate candidate signals for persons",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "audit.export.enabled",
    name: "Audit export",
    description: "Allow queuing audit event exports",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "branding.custom_css",
    name: "Custom CSS branding",
    description: "Allow tenant custom CSS (disabled by default)",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "auth.invitation.enabled",
    name: "User invitations",
    description: "Allow inviting users to a tenant",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "rms.neris.registry.enabled",
    name: "NERIS schema registry",
    description: "Enable NERIS schema registry API reads",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "rms.neris.schema_browser.enabled",
    name: "NERIS Creator schema browser",
    description: "Expose unfinished NERIS schema browser UI to tenants (creator may bypass)",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.neris.incident_shell.enabled",
    name: "NERIS incident shell",
    description: "Enable NERIS incident shell APIs and RMS incident navigation",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.neris.manual_intake.enabled",
    name: "NERIS MANUAL_ONLY intake",
    description: "Enable manual incident creation workflow for MANUAL_ONLY tenants",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.neris.officer_review.enabled",
    name: "NERIS officer review",
    description: "Enable officer review submit/return/approve workflow",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.neris.tenant_configuration.enabled",
    name: "NERIS tenant configuration editor",
    description: "Enable tenant-facing NERIS overlay configuration UI",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.neris.specialty_workflows.enabled",
    name: "NERIS specialty workflows",
    description:
      "Enable Phase 3 dynamic fire/specialty workflow groups (schema-driven section activation). Default false; enable only via tenant override for approved development tenants.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.enabled",
    name: "CAD integration",
    description:
      "Master switch for CAD APIs and UI. Default false; enable only via tenant override for approved synthetic development tenants.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.webhook.enabled",
    name: "CAD webhook intake",
    description: "Enable signed CAD webhook endpoints. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.polling.enabled",
    name: "CAD polling",
    description: "Enable CAD polling adapters. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.hybrid.enabled",
    name: "CAD hybrid intake",
    description: "Enable HYBRID intake matching and manual linking. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.operations.enabled",
    name: "CAD operations dashboard",
    description: "Enable CAD operations dashboard and queue tools. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.raw_payload_access.enabled",
    name: "CAD raw payload access",
    description:
      "Allow restricted raw CAD payload access when permission is also granted. Default false. High sensitivity.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "rms.cad.simulator.enabled",
    name: "CAD synthetic simulator",
    description: "Enable synthetic CAD simulator endpoints. Default false. Development only.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "platform.cad.adapter_management.enabled",
    name: "CAD adapter management",
    description: "Enable Creator Console CAD adapter and mapping template management. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.enabled",
    name: "AI Narrative Assistant",
    description:
      "Master switch for shared AI Narrative Assistant. Default false; never auto-enable for synthetic Phase 4 tenants.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.rms.enabled",
    name: "AI Narrative for Forge RMS",
    description: "Enable AI narratives for RMS records. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.industrial.enabled",
    name: "AI Narrative for Forge Industrial",
    description: "Enable AI narratives for Industrial records. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "industrial.legalAcknowledgments.enabled",
    name: "Industrial legal acknowledgments",
    description: "Enable legal acknowledgment subsystem for Forge Industrial Safety.",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "industrial.legalAcknowledgments.loginGate.enabled",
    name: "Industrial legal acknowledgment login gate",
    description: "Require outstanding legal acknowledgments before Industrial app access.",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "industrial.legalAcknowledgments.transactionAttestations.enabled",
    name: "Industrial transaction attestations",
    description: "Enable transaction-specific electronic attestations.",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "industrial.legalAcknowledgments.adminReporting.enabled",
    name: "Industrial legal acknowledgment admin reporting",
    description: "Enable admin compliance reporting and CSV export for acknowledgments.",
    valueType: "BOOLEAN",
    defaultValueJson: true as const,
  },
  {
    key: "rms.legalAcknowledgments.enabled",
    name: "RMS legal acknowledgments",
    description: "Enable legal acknowledgments for Forge RMS. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "academy.legalAcknowledgments.enabled",
    name: "Academy legal acknowledgments",
    description: "Enable legal acknowledgments for Forge Academy. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.academy.enabled",
    name: "AI Narrative for Forge Academy",
    description: "Enable AI narratives for Academy records. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.rewrite.enabled",
    name: "AI Narrative rewrite modes",
    description: "Enable rewrite/improve narrative modes. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.quality_check.enabled",
    name: "AI Narrative quality checks",
    description: "Enable quality/missing-information narrative modes. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.voice_input.enabled",
    name: "AI Narrative voice input",
    description: "Enable voice input for narrative assistant. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.sensitive_data.enabled",
    name: "AI Narrative sensitive data",
    description:
      "Allow restricted/confidential data paths under approved policy. Default false. High sensitivity.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "ai.narrative.analytics.enabled",
    name: "AI Narrative analytics",
    description: "Enable AI narrative usage analytics surfaces. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.shell.enabled",
    name: "FX RMS application shell",
    description:
      "Enable Forge Experience application shell for Forge RMS. Default false; fail safe to legacy shell. Presentation only.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.navigation.enabled",
    name: "FX RMS navigation",
    description:
      "Enable Forge Experience navigation presentation for Forge RMS. Requires fx.rms.shell.enabled. Default false.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.dashboard.enabled",
    name: "FX RMS dashboard",
    description:
      "Enable Forge Experience dashboard foundation on the RMS home route. Default false; presentation only; fail safe to legacy home.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.workspace.enabled",
    name: "FX RMS record workspace",
    description:
      "Enable Forge Experience shared record workspace chrome for Incident records. Default false; presentation only; fail safe to legacy incident layout. Independent of shell, navigation, and dashboard flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.forms.enabled",
    name: "FX RMS forms",
    description:
      "Enable Forge Experience shared forms presentation for existing RMS forms. Default false; presentation only; fail safe to legacy form markup. Independent of other FX flags. Does not change validation rules or payloads.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.tables.enabled",
    name: "FX RMS data tables",
    description:
      "Enable Forge Experience shared data table presentation for existing RMS lists. Default false; presentation only; fail safe to legacy tables. Independent of other FX flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.incidents.enabled",
    name: "FX RMS module — Incidents",
    description:
      "Enable FX presentation composition for the Incidents operational module. Default false; requires foundation flags for FX surfaces; fail safe to legacy. Independent of other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.incidentReview.enabled",
    name: "FX RMS module — Incident Review",
    description:
      "Enable FX presentation for Incident Review module. Default false. Not wired until S2F-2.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.cadMessages.enabled",
    name: "FX RMS module — CAD Messages",
    description:
      "Enable FX presentation for CAD Messages module. Default false. Not wired until S2F-3.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.cadConnections.enabled",
    name: "FX RMS module — CAD Connections",
    description:
      "Enable FX presentation composition for the CAD Connections operational module. Default false; requires forms/tables foundations for FX surfaces; fail safe to legacy. Independent of other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.cadConflicts.enabled",
    name: "FX RMS module — CAD Conflicts",
    description:
      "Enable FX presentation composition for the CAD Conflicts operational module. Default false; requires tables foundation for FX list; fail safe to legacy. Independent of other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.nerisConfiguration.enabled",
    name: "FX RMS module — NERIS Configuration",
    description:
      "Enable FX presentation composition for the NERIS Configuration operational module. Default false; requires forms foundation for FX surfaces; fail safe to legacy. Independent of other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.administration.enabled",
    name: "FX RMS module — Administration",
    description:
      "Enable FX presentation composition for verified RMS administration screens (select tenant). Default false; requires tables foundation for FX table; fail safe to legacy. Independent of other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
  {
    key: "fx.rms.module.utilities.enabled",
    name: "FX RMS module — Utilities",
    description:
      "Enable FX presentation composition for verified RMS utility screens (platform health). Default false; fail safe to legacy. Independent of administration and other module flags.",
    valueType: "BOOLEAN",
    defaultValueJson: false as const,
  },
] as const;

function permissionMeta(code: string): {
  name: string;
  scopeType: string;
  riskLevel: string;
  isSensitive: boolean;
} {
  const isSensitive =
    code.includes("sensitive") ||
    code.includes("merge") ||
    code.includes("suspend") ||
    code.includes("raw_payload") ||
    code.includes("rotate_secret");
  const riskLevel =
    isSensitive ||
    code.includes("create") ||
    code.includes("assign") ||
    code.includes("manage") ||
    code.includes("enable") ||
    code.includes("disable")
      ? "HIGH"
      : "NORMAL";
  return {
    name: code
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    scopeType:
      code.startsWith("platform.tenant") || isCreatorOnlyPermission(code) ? "PLATFORM" : "TENANT",
    riskLevel,
    isSensitive,
  };
}

/** Idempotent seed of platform-global catalog data. Safe to re-run. */
export async function seedPlatformData(db: SeedDatabase): Promise<void> {
  const now = new Date();

  for (const product of PRODUCTS) {
    const existing = await db
      .select({ id: platformProducts.id })
      .from(platformProducts)
      .where(eq(platformProducts.code, product.code))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(platformProducts).values({
        id: createId(),
        code: product.code,
        name: product.name,
        description: product.description,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const productRows = await db.select().from(platformProducts);
  const productIdByCode = new Map(productRows.map((row) => [row.code, row.id]));

  for (const [productCode, modules] of Object.entries(MODULES_BY_PRODUCT)) {
    const productId = productIdByCode.get(productCode);
    if (!productId) continue;
    for (const mod of modules) {
      const existing = await db
        .select({ id: platformModules.id })
        .from(platformModules)
        .where(
          and(eq(platformModules.productId, productId), eq(platformModules.code, mod.code)),
        )
        .limit(1);
      if (existing.length === 0) {
        await db.insert(platformModules).values({
          id: createId(),
          productId,
          code: mod.code,
          name: mod.name,
          description: mod.description ?? `${mod.name} module`,
          status: "ACTIVE",
          isCore: mod.isCore,
          category: mod.category,
          classification: mod.classification,
          implementationStatus: mod.implementationStatus,
          customerAssignable: mod.customerAssignable,
          displayOrder: mod.displayOrder,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await db
          .update(platformModules)
          .set({
            name: mod.name,
            description: mod.description ?? `${mod.name} module`,
            isCore: mod.isCore,
            category: mod.category,
            classification: mod.classification,
            implementationStatus: mod.implementationStatus,
            customerAssignable: mod.customerAssignable,
            displayOrder: mod.displayOrder,
            updatedAt: now,
          })
          .where(eq(platformModules.id, existing[0]!.id));
      }
    }
  }

  for (const code of ALL_PERMISSIONS) {
    const meta = permissionMeta(code);
    await db
      .insert(permissions)
      .values({
        id: createId(),
        code,
        name: meta.name,
        description: `Permission ${code}`,
        scopeType: meta.scopeType,
        riskLevel: meta.riskLevel,
        isSensitive: meta.isSensitive,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: permissions.code });
  }

  const permissionRows = await db.select().from(permissions);
  const permissionIdByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

  for (const template of ALL_ROLE_TEMPLATES) {
    let templateId: string;
    const existing = await db
      .select({ id: roleTemplates.id })
      .from(roleTemplates)
      .where(eq(roleTemplates.code, template.code))
      .limit(1);
    if (existing.length === 0) {
      templateId = createId();
      await db.insert(roleTemplates).values({
        id: templateId,
        code: template.code,
        name: template.name,
        description: `${template.name} role template`,
        roleType: template.roleType,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      templateId = existing[0]!.id;
    }

    for (const permCode of template.permissions) {
      const permissionId = permissionIdByCode.get(permCode);
      if (!permissionId) continue;
      const link = await db
        .select({ roleTemplateId: roleTemplatePermissions.roleTemplateId })
        .from(roleTemplatePermissions)
        .where(
          and(
            eq(roleTemplatePermissions.roleTemplateId, templateId),
            eq(roleTemplatePermissions.permissionId, permissionId),
          ),
        )
        .limit(1);
      if (link.length === 0) {
        await db.insert(roleTemplatePermissions).values({
          roleTemplateId: templateId,
          permissionId,
          createdAt: now,
        });
      }
    }
  }

  for (const orgType of ORG_TYPES) {
    const existing = await db
      .select({ id: organizationTypes.id })
      .from(organizationTypes)
      .where(eq(organizationTypes.code, orgType.code))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(organizationTypes).values({
        id: createId(),
        code: orgType.code,
        name: orgType.name,
        description: orgType.name,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const feature of FEATURES) {
    const existing = await db
      .select({ id: featureDefinitions.id })
      .from(featureDefinitions)
      .where(eq(featureDefinitions.key, feature.key))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(featureDefinitions).values({
        id: createId(),
        key: feature.key,
        name: feature.name,
        description: feature.description,
        valueType: feature.valueType,
        defaultValueJson: feature.defaultValueJson,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Keep catalog defaults aligned (e.g. specialty workflows default false).
      await db
        .update(featureDefinitions)
        .set({
          name: feature.name,
          description: feature.description,
          defaultValueJson: feature.defaultValueJson,
          updatedAt: now,
        })
        .where(eq(featureDefinitions.id, existing[0]!.id));
    }
  }

  await seedLegalAcknowledgments(db);
}

async function main(): Promise<void> {
  const { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } = await import("@forge/environment");
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const connectionString = env.DATABASE_URL;
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await seedPlatformData(db);
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({ status: "seeded", host: new URL(connectionString).host }));
  } finally {
    await client.end({ timeout: 5 });
  }
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun =
  Boolean(entryFile) &&
  (thisFile === entryFile ||
    import.meta.url === pathToFileURL(entryFile).href ||
    thisFile.toLowerCase() === entryFile.toLowerCase());

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
