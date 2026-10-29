/**
 * Second synthetic RMS tenant for cross-tenant isolation acceptance.
 * Idempotent. Key: rms-synthetic-fd-b / admin@rms-synthetic-b.test
 */
import { RMS_PERMISSIONS } from "@forge/contracts";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import {
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

export const RMS_SYNTHETIC_TENANT_B_KEY = "rms-synthetic-fd-b";
export const RMS_SYNTHETIC_ADMIN_B_EMAIL = "admin@rms-synthetic-b.test";

const PHASE2_FLAGS = [
  "rms.neris.incident_shell.enabled",
  "rms.neris.manual_intake.enabled",
  "rms.neris.officer_review.enabled",
  "rms.neris.tenant_configuration.enabled",
] as const;

const RMS_MODULES = ["CORE", "PERSONNEL", "APPARATUS", "NERIS", "REPORTS"] as const;

export async function seedRmsSyntheticTenantB(options?: { databaseUrl?: string }) {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(options?.databaseUrl ?? env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date();
  const tenantKey = RMS_SYNTHETIC_TENANT_B_KEY;
  const adminEmail = RMS_SYNTHETIC_ADMIN_B_EMAIL;

  try {
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantKey, tenantKey))
      .limit(1);
    if (existing) {
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, existing.id), eq(users.primaryEmail, adminEmail)))
        .limit(1);
      return {
        ok: true,
        skipped: true,
        tenantId: existing.id,
        tenantKey,
        adminUserId: admin?.id ?? null,
      };
    }

    const tenantId = createId();
    const adminUserId = createId();
    const adminPersonId = createId();
    const roleId = createId();
    const membershipId = createId();
    const stationId = createId();
    const shiftId = createId();
    const unitId = createId();

    await db.insert(tenants).values({
      id: tenantId,
      tenantKey,
      slug: tenantKey,
      legalName: "Synthetic Ridge Fire Department",
      displayName: "Synthetic Ridge FD",
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
    if (!orgType) throw new Error("FIRE_DEPARTMENT organization type missing");

    await db.insert(organizations).values({
      id: createId(),
      tenantId,
      organizationTypeId: orgType.id,
      slug: "srfd",
      legalName: "Synthetic Ridge Fire Department",
      displayName: "Synthetic Ridge FD",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const product = await db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, "FORGE_RMS"),
    });
    if (!product) throw new Error("FORGE_RMS product missing");

    await db.insert(tenantProducts).values({
      id: createId(),
      tenantId,
      productId: product.id,
      status: "ACTIVE",
      enabledAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Subscription optional for isolation seed — skip if plan fields are incomplete.

    const moduleRows = await db
      .select({ module: platformModules })
      .from(platformModules)
      .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
      .where(
        and(
          eq(platformProducts.code, "FORGE_RMS"),
          inArray(platformModules.code, [...RMS_MODULES]),
        ),
      );

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
      forgePersonNumber: "FP-SYNTH-B-ADMIN",
      firstName: "Synthetic",
      lastName: "RidgeAdmin",
      displayName: "Synthetic Ridge Admin",
      email: adminEmail,
      status: "ACTIVE",
      recordSource: "SEED",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: adminUserId,
      tenantId,
      personId: adminPersonId,
      primaryEmail: adminEmail,
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      code: "RMS_SYNTHETIC_ADMIN_B",
      name: "RMS Synthetic Admin B",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const permRows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(
        inArray(permissions.code, [
          ...RMS_PERMISSIONS,
          "platform.tenant.read",
          "platform.organization.read",
          "platform.person.read",
          "platform.feature.manage",
        ]),
      );
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

    const featureRows = await db
      .select()
      .from(featureDefinitions)
      .where(inArray(featureDefinitions.key, [...PHASE2_FLAGS]));
    for (const feature of featureRows) {
      await db.insert(featureOverrides).values({
        id: createId(),
        tenantId,
        featureDefinitionId: feature.id,
        valueJson: true,
        reason: "NERIS Phase 2 isolation tenant B",
        createdByUserId: adminUserId,
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
      formatTemplate: "SRFD-{YEAR4}-{SEQ:5}",
      prefix: "SRFD",
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
      name: "Ridge Station 1",
      city: "Ridgeville",
      state: "TX",
      defaultResponseDistrict: "Ridge-A",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsShifts).values({
      id: shiftId,
      tenantId,
      name: "Ridge Shift A",
      code: "A",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsUnits).values({
      id: unitId,
      tenantId,
      unitNumber: "R1",
      callSign: "SRFD-E1",
      unitType: "ENGINE",
      stationId,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      skipped: false,
      tenantId,
      tenantKey,
      adminUserId,
      adminEmail,
      stationId,
      unitId,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const result = await seedRmsSyntheticTenantB();
  // eslint-disable-next-line no-console -- CLI
  console.info(JSON.stringify(result, null, 2));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-rms-synthetic-b.ts") ||
  process.argv[1]?.endsWith("seed-rms-synthetic-b.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
