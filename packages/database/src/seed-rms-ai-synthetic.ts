/**
 * Idempotent AI Narrative acceptance tenant (synthetic data only).
 * Does NOT enable AI globally or for Phase 4 synthetic tenants.
 *
 * Usage:
 *   tsx src/seed-rms-ai-synthetic.ts
 *   node dist/seed-rms-ai-synthetic.js
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import {
  aiModelPolicies,
  aiNarrativePolicies,
  aiProviderConfigurations,
  featureDefinitions,
  featureOverrides,
  membershipModuleAccess,
  membershipProductAccess,
  membershipRoleAssignments,
  nerisIncidentNumberConfigs,
  nerisSchemaVersions,
  organizations,
  organizationTypes,
  permissions,
  persons,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  rmsShifts,
  rmsStations,
  rmsUnits,
  tenantModuleEntitlements,
  tenantNerisConfiguration,
  tenantProducts,
  tenants,
  userTenantMemberships,
  users,
} from "./schema.js";
import { seedPlatformData } from "./seed.js";

export const RMS_AI_SYNTHETIC_TENANT_KEY = "rms-ai-synthetic-fd";
export const RMS_AI_SYNTHETIC_ADMIN_EMAIL = "admin@rms-ai-synthetic.test";

const AI_ACCEPTANCE_FLAGS = [
  "ai.narrative.enabled",
  "ai.narrative.rms.enabled",
  "ai.narrative.rewrite.enabled",
  "ai.narrative.quality_check.enabled",
  "rms.neris.incident_shell.enabled",
  "rms.neris.manual_intake.enabled",
  "rms.neris.officer_review.enabled",
] as const;

/** Minimum AI + incident perms for acceptance. No ai.narrative.use_sensitive_data. */
const AI_ACCEPTANCE_PERMISSIONS = [
  "ai.narrative.use",
  "ai.narrative.generate",
  "ai.narrative.rewrite",
  "ai.narrative.review",
  "ai.narrative.accept",
  "ai.narrative.reject",
  "ai.narrative.view_usage",
  "rms.incident.ai_narrative.generate",
  "rms.incident.ai_narrative.accept",
  "rms.neris.incident.view",
  "rms.neris.incident.create",
  "rms.neris.incident.edit",
  "rms.neris.incident.submit_review",
  "rms.neris.incident.approve",
  "rms.neris.incident.finalize",
] as const;

const AI_MODULES = ["CORE", "NERIS", "AI_NARRATIVE"] as const;

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

export interface RmsAiSyntheticSeedResult {
  tenantId: string;
  tenantKey: string;
  adminUserId: string;
  skipped: boolean;
}

export async function seedRmsAiSyntheticTenant(options?: {
  databaseUrl?: string;
}): Promise<RmsAiSyntheticSeedResult> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const databaseUrl = options?.databaseUrl ?? env.DATABASE_URL;
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date();

  try {
    await seedPlatformData(db);

    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantKey, RMS_AI_SYNTHETIC_TENANT_KEY))
      .limit(1);

    if (existing) {
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, existing.id),
            eq(users.primaryEmail, RMS_AI_SYNTHETIC_ADMIN_EMAIL),
          ),
        )
        .limit(1);
      await ensureAiAcceptanceEnablement(db, existing.id, admin?.id ?? null);
      return {
        tenantId: existing.id,
        tenantKey: RMS_AI_SYNTHETIC_TENANT_KEY,
        adminUserId: admin?.id ?? "",
        skipped: true,
      };
    }

    const tenantId = createId();
    const orgId = createId();
    const adminUserId = createId();
    const adminPersonId = createId();
    const roleId = createId();
    const membershipId = createId();
    const stationId = createId();
    const shiftId = createId();
    const unitId = createId();

    await db.insert(tenants).values({
      id: tenantId,
      tenantKey: RMS_AI_SYNTHETIC_TENANT_KEY,
      slug: RMS_AI_SYNTHETIC_TENANT_KEY,
      legalName: "AI Synthetic Valley Fire Department",
      displayName: "AI Synthetic Valley FD",
      tenantType: "CUSTOMER",
      status: "ACTIVE",
      timezone: "America/Chicago",
      defaultLocale: "en-US",
      dataRegion: "us-east-1",
      createdAt: now,
      updatedAt: now,
    });

    const orgType = await db.query.organizationTypes.findFirst({
      where: eq(organizationTypes.code, "FIRE_DEPARTMENT"),
    });
    if (!orgType) {
      throw new Error("FIRE_DEPARTMENT organization type missing — run platform seed first");
    }

    await db.insert(organizations).values({
      id: orgId,
      tenantId,
      organizationTypeId: orgType.id,
      slug: "aisvfd",
      legalName: "AI Synthetic Valley Fire Department",
      displayName: "AI Synthetic Valley FD",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const product = await db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, "FORGE_RMS"),
    });
    if (!product) throw new Error("FORGE_RMS product missing — run platform seed first");

    await db.insert(tenantProducts).values({
      id: createId(),
      tenantId,
      productId: product.id,
      status: "ACTIVE",
      enabledAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const moduleRows = await db
      .select({ module: platformModules })
      .from(platformModules)
      .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
      .where(
        and(eq(platformProducts.code, "FORGE_RMS"), inArray(platformModules.code, [...AI_MODULES])),
      );

    if (moduleRows.length < AI_MODULES.length) {
      const found = new Set(moduleRows.map((r) => r.module.code));
      const missing = AI_MODULES.filter((code) => !found.has(code));
      throw new Error(
        `Missing FORGE_RMS modules (expected via STARTER_TEMPLATES / seedPlatformData): ${missing.join(", ")}`,
      );
    }

    for (const row of moduleRows) {
      await db.insert(tenantModuleEntitlements).values({
        id: createId(),
        tenantId,
        moduleId: row.module.id,
        status: "ACTIVE",
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(persons).values({
      id: adminPersonId,
      tenantId,
      forgePersonNumber: "FP-AI-SYNTH-ADMIN",
      firstName: "AI",
      lastName: "SyntheticAdmin",
      displayName: "AI Synthetic Admin",
      email: RMS_AI_SYNTHETIC_ADMIN_EMAIL,
      status: "ACTIVE",
      recordSource: "SEED",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: adminUserId,
      tenantId,
      personId: adminPersonId,
      primaryEmail: RMS_AI_SYNTHETIC_ADMIN_EMAIL,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      code: "RMS_AI_SYNTHETIC_ADMIN",
      name: "RMS AI Synthetic Admin",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const permRows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.code, [...AI_ACCEPTANCE_PERMISSIONS]));
    for (const perm of permRows) {
      await db.insert(rolePermissions).values({
        roleId,
        permissionId: perm.id,
        effect: "ALLOW",
        createdAt: now,
      });
    }

    await db.insert(userTenantMemberships).values({
      id: membershipId,
      tenantId,
      userId: adminUserId,
      status: "ACTIVE",
      isDefaultTenant: true,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(membershipRoleAssignments).values({
      id: createId(),
      tenantId,
      membershipId,
      roleId,
      status: "ACTIVE",
      grantedByUserId: adminUserId,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(membershipProductAccess).values({
      id: createId(),
      tenantId,
      membershipId,
      productId: product.id,
      status: "ACTIVE",
      grantedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    for (const row of moduleRows) {
      await db.insert(membershipModuleAccess).values({
        id: createId(),
        tenantId,
        membershipId,
        moduleId: row.module.id,
        status: "ACTIVE",
        grantedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [publishedSchema] = await db
      .select()
      .from(nerisSchemaVersions)
      .where(eq(nerisSchemaVersions.state, "PUBLISHED"))
      .limit(1);

    await db.insert(tenantNerisConfiguration).values({
      id: createId(),
      tenantId,
      schemaVersionId: publishedSchema?.id,
      operatingMode: "MANUAL_ONLY",
      status: "ACTIVE",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(nerisIncidentNumberConfigs).values({
      id: createId(),
      tenantId,
      name: "DEFAULT",
      formatTemplate: "AISVFD-{YEAR4}-{SEQ:5}",
      prefix: "AISVFD",
      resetMode: "CALENDAR",
      scope: "NONE",
      allowManual: false,
      status: "ACTIVE",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsStations).values({
      id: stationId,
      tenantId,
      stationNumber: "1",
      name: "AI Synthetic Station 1",
      city: "Synthville",
      state: "TX",
      defaultResponseDistrict: "AI-District-A",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsShifts).values({
      id: shiftId,
      tenantId,
      name: "AI Synthetic Shift A",
      code: "A",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsUnits).values({
      id: unitId,
      tenantId,
      unitNumber: "AI1",
      callSign: "AISVFD-E1",
      unitType: "ENGINE",
      stationId,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await ensureAiAcceptanceEnablement(db, tenantId, adminUserId);

    return {
      tenantId,
      tenantKey: RMS_AI_SYNTHETIC_TENANT_KEY,
      adminUserId,
      skipped: false,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Idempotent re-enablement for AI Narrative acceptance on an existing tenant.
 * Safe to call on re-runs; does not touch Phase 4 or other tenants.
 */
export async function ensureAiAcceptanceEnablement(
  db: SeedDb,
  tenantId: string,
  actorUserId: string | null,
): Promise<void> {
  const now = new Date();

  await ensureFeatureOverrides(db, tenantId, actorUserId, [...AI_ACCEPTANCE_FLAGS], now);
  await ensureAdminPermissions(db, tenantId, now);
  await ensureEntitlements(db, tenantId, actorUserId, now);
  await ensurePolicy(db, tenantId, actorUserId, now);
  await ensureProvider(db, tenantId, now);
  await ensureModelPolicy(db, tenantId, now);
}

async function ensureFeatureOverrides(
  db: SeedDb,
  tenantId: string,
  actorUserId: string | null,
  flagKeys: readonly string[],
  now: Date,
): Promise<void> {
  const featureRows = await db
    .select()
    .from(featureDefinitions)
    .where(inArray(featureDefinitions.key, [...flagKeys]));
  for (const feature of featureRows) {
    const existing = await db.query.featureOverrides.findFirst({
      where: and(
        eq(featureOverrides.tenantId, tenantId),
        eq(featureOverrides.featureDefinitionId, feature.id),
      ),
    });
    if (existing) {
      if (existing.valueJson !== true) {
        await db
          .update(featureOverrides)
          .set({
            valueJson: true,
            reason: "AI Narrative acceptance synthetic tenant only",
            updatedAt: now,
          })
          .where(eq(featureOverrides.id, existing.id));
      }
      continue;
    }
    if (!actorUserId) continue;
    await db.insert(featureOverrides).values({
      id: createId(),
      tenantId,
      featureDefinitionId: feature.id,
      valueJson: true,
      reason: "AI Narrative acceptance synthetic tenant only",
      createdByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function ensureAdminPermissions(db: SeedDb, tenantId: string, now: Date): Promise<void> {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.tenantId, tenantId), eq(roles.code, "RMS_AI_SYNTHETIC_ADMIN")),
  });
  if (!role) return;

  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, [...AI_ACCEPTANCE_PERMISSIONS]));

  for (const perm of permRows) {
    const existing = await db.query.rolePermissions.findFirst({
      where: and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, perm.id)),
    });
    if (existing) continue;
    await db.insert(rolePermissions).values({
      roleId: role.id,
      permissionId: perm.id,
      effect: "ALLOW",
      createdAt: now,
    });
  }
}

async function ensureEntitlements(
  db: SeedDb,
  tenantId: string,
  actorUserId: string | null,
  now: Date,
): Promise<void> {
  const product = await db.query.platformProducts.findFirst({
    where: eq(platformProducts.code, "FORGE_RMS"),
  });
  if (!product) return;

  const existingProduct = await db.query.tenantProducts.findFirst({
    where: and(eq(tenantProducts.tenantId, tenantId), eq(tenantProducts.productId, product.id)),
  });
  if (!existingProduct) {
    await db.insert(tenantProducts).values({
      id: createId(),
      tenantId,
      productId: product.id,
      status: "ACTIVE",
      enabledAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } else if (existingProduct.status !== "ACTIVE") {
    await db
      .update(tenantProducts)
      .set({ status: "ACTIVE", enabledAt: now, updatedAt: now })
      .where(eq(tenantProducts.id, existingProduct.id));
  }

  const moduleRows = await db
    .select({ module: platformModules })
    .from(platformModules)
    .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
    .where(
      and(eq(platformProducts.code, "FORGE_RMS"), inArray(platformModules.code, [...AI_MODULES])),
    );

  for (const row of moduleRows) {
    const existing = await db.query.tenantModuleEntitlements.findFirst({
      where: and(
        eq(tenantModuleEntitlements.tenantId, tenantId),
        eq(tenantModuleEntitlements.moduleId, row.module.id),
      ),
    });
    if (!existing) {
      await db.insert(tenantModuleEntitlements).values({
        id: createId(),
        tenantId,
        moduleId: row.module.id,
        status: "ACTIVE",
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else if (existing.status !== "ACTIVE") {
      await db
        .update(tenantModuleEntitlements)
        .set({ status: "ACTIVE", updatedAt: now })
        .where(eq(tenantModuleEntitlements.id, existing.id));
    }
  }

  const [membership] = await db
    .select()
    .from(userTenantMemberships)
    .where(
      and(eq(userTenantMemberships.tenantId, tenantId), eq(userTenantMemberships.status, "ACTIVE")),
    )
    .limit(1);
  if (!membership || !actorUserId) return;

  const existingMpa = await db.query.membershipProductAccess.findFirst({
    where: and(
      eq(membershipProductAccess.membershipId, membership.id),
      eq(membershipProductAccess.productId, product.id),
    ),
  });
  if (!existingMpa) {
    await db.insert(membershipProductAccess).values({
      id: createId(),
      tenantId,
      membershipId: membership.id,
      productId: product.id,
      status: "ACTIVE",
      grantedByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const row of moduleRows) {
    const existingMma = await db.query.membershipModuleAccess.findFirst({
      where: and(
        eq(membershipModuleAccess.membershipId, membership.id),
        eq(membershipModuleAccess.moduleId, row.module.id),
      ),
    });
    if (!existingMma) {
      await db.insert(membershipModuleAccess).values({
        id: createId(),
        tenantId,
        membershipId: membership.id,
        moduleId: row.module.id,
        status: "ACTIVE",
        grantedByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function ensurePolicy(
  db: SeedDb,
  tenantId: string,
  actorUserId: string | null,
  now: Date,
): Promise<void> {
  const existing = await db.query.aiNarrativePolicies.findFirst({
    where: and(eq(aiNarrativePolicies.tenantId, tenantId), eq(aiNarrativePolicies.product, "RMS")),
  });
  if (existing) {
    await db
      .update(aiNarrativePolicies)
      .set({
        status: "ACTIVE",
        requireAcceptedTerms: true,
        termsAcceptedAt: existing.termsAcceptedAt ?? now,
        termsAcceptedByUserId: existing.termsAcceptedByUserId ?? actorUserId,
        monthlyRequestQuota: 100,
        dailyUserQuota: 20,
        perRecordLimit: 10,
        updatedAt: now,
      })
      .where(eq(aiNarrativePolicies.id, existing.id));
    return;
  }
  await db.insert(aiNarrativePolicies).values({
    id: createId(),
    tenantId,
    product: "RMS",
    requireAcceptedTerms: true,
    termsAcceptedAt: now,
    termsAcceptedByUserId: actorUserId,
    monthlyRequestQuota: 100,
    dailyUserQuota: 20,
    perRecordLimit: 10,
    status: "ACTIVE",
    policyJson: {},
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureProvider(db: SeedDb, tenantId: string, now: Date): Promise<void> {
  const existing = await db.query.aiProviderConfigurations.findFirst({
    where: and(
      eq(aiProviderConfigurations.tenantId, tenantId),
      eq(aiProviderConfigurations.product, "RMS"),
      eq(aiProviderConfigurations.providerKey, "stub"),
    ),
  });
  if (existing) {
    if (existing.status !== "ENABLED") {
      await db
        .update(aiProviderConfigurations)
        .set({ status: "ENABLED", secretArn: null, region: "us-east-1", updatedAt: now })
        .where(eq(aiProviderConfigurations.id, existing.id));
    }
    return;
  }
  await db.insert(aiProviderConfigurations).values({
    id: createId(),
    tenantId,
    product: "RMS",
    providerKey: "stub",
    status: "ENABLED",
    secretArn: null,
    region: "us-east-1",
    configurationJson: { note: "Stub provider for AI Narrative acceptance only" },
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureModelPolicy(db: SeedDb, tenantId: string, now: Date): Promise<void> {
  const existing = await db.query.aiModelPolicies.findFirst({
    where: and(
      eq(aiModelPolicies.tenantId, tenantId),
      eq(aiModelPolicies.product, "RMS"),
      eq(aiModelPolicies.providerKey, "stub"),
      eq(aiModelPolicies.modelId, "stub-v1"),
    ),
  });
  if (existing) {
    if (existing.status !== "APPROVED") {
      await db
        .update(aiModelPolicies)
        .set({ status: "APPROVED", updatedAt: now })
        .where(eq(aiModelPolicies.id, existing.id));
    }
    return;
  }
  await db.insert(aiModelPolicies).values({
    id: createId(),
    tenantId,
    product: "RMS",
    name: "Stub narrative model",
    providerKey: "stub",
    modelId: "stub-v1",
    maxInputTokens: 8000,
    maxOutputTokens: 2000,
    allowConfidential: false,
    allowRestricted: false,
    status: "APPROVED",
    createdAt: now,
    updatedAt: now,
  });
}

async function main(): Promise<void> {
  const result = await seedRmsAiSyntheticTenant();
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify({ ok: true, ...result }, null, 2));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-rms-ai-synthetic.ts") ||
  process.argv[1]?.endsWith("seed-rms-ai-synthetic.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
