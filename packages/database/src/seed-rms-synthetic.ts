/**
 * Idempotent synthetic MANUAL_ONLY fire department tenant for NERIS Phase 2 dev/QA.
 *
 * Usage:
 *   pnpm neris:seed-rms
 *
 * Prerequisites: platform seed (`pnpm db:seed`) and NERIS schema import (`pnpm neris:import-schema`).
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
  nerisIncidentSections,
  nerisIncidents,
  nerisSchemaVersions,
  organizations,
  organizationTypes,
  permissions,
  persons,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  rmsApparatus,
  rmsDailyRosters,
  rmsOccupancies,
  rmsPersonnel,
  rmsPreplans,
  rmsRosterAssignments,
  rmsShifts,
  rmsStations,
  rmsUnits,
  subscriptionPlans,
  subscriptions,
  tenantModuleEntitlements,
  tenantNerisConfiguration,
  tenantProducts,
  tenants,
  userTenantMemberships,
  users,
} from "./schema.js";
import { seedPlatformData } from "./seed.js";

export const RMS_SYNTHETIC_TENANT_KEY = "rms-synthetic-fd";

const PHASE2_FEATURE_FLAGS = [
  "rms.neris.incident_shell.enabled",
  "rms.neris.manual_intake.enabled",
  "rms.neris.officer_review.enabled",
  "rms.neris.tenant_configuration.enabled",
  /** Phase 3 specialty — enabled only on approved synthetic development tenants. */
  "rms.neris.specialty_workflows.enabled",
] as const;

const RMS_MODULES = ["CORE", "PERSONNEL", "APPARATUS", "NERIS", "REPORTS"] as const;

export interface RmsSyntheticSeedResult {
  tenantId: string;
  tenantKey: string;
  adminUserId: string;
  stationIds: string[];
  incidentIds: Record<string, string>;
  skipped: boolean;
}

export async function seedRmsSyntheticTenant(options?: {
  databaseUrl?: string;
}): Promise<RmsSyntheticSeedResult> {
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
      .where(eq(tenants.tenantKey, RMS_SYNTHETIC_TENANT_KEY))
      .limit(1);
    if (existing) {
      const incidents = await db
        .select({ id: nerisIncidents.id, status: nerisIncidents.status })
        .from(nerisIncidents)
        .where(eq(nerisIncidents.tenantId, existing.id));
      const incidentIds = Object.fromEntries(incidents.map((row) => [row.status, row.id]));
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.tenantId, existing.id), eq(users.primaryEmail, "admin@rms-synthetic.test")),
        )
        .limit(1);
      const stationRows = await db
        .select({ id: rmsStations.id })
        .from(rmsStations)
        .where(eq(rmsStations.tenantId, existing.id));
      // Ensure Phase 3 specialty flag override remains enabled on the approved synthetic tenant.
      await ensureFeatureOverrides(
        db,
        existing.id,
        admin?.id ?? null,
        [...PHASE2_FEATURE_FLAGS],
        now,
      );
      // Sync specialty permissions onto the synthetic admin role (idempotent).
      await ensureSyntheticAdminPermissions(db, existing.id, now);
      return {
        tenantId: existing.id,
        tenantKey: RMS_SYNTHETIC_TENANT_KEY,
        adminUserId: admin?.id ?? "",
        stationIds: stationRows.map((row) => row.id),
        incidentIds,
        skipped: true,
      };
    }

    const tenantId = createId();
    const orgId = createId();
    const adminUserId = createId();
    const adminPersonId = createId();

    await db.insert(tenants).values({
      id: tenantId,
      tenantKey: RMS_SYNTHETIC_TENANT_KEY,
      slug: RMS_SYNTHETIC_TENANT_KEY,
      legalName: "Synthetic Valley Fire Department",
      displayName: "Synthetic Valley FD",
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
      slug: "svfd",
      legalName: "Synthetic Valley Fire Department",
      displayName: "Synthetic Valley FD",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    let planId: string;
    const existingPlan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, "E2E_STANDARD"),
    });
    if (existingPlan) {
      planId = existingPlan.id;
    } else {
      planId = createId();
      await db.insert(subscriptionPlans).values({
        id: planId,
        code: "E2E_STANDARD",
        name: "E2E Standard Plan",
        billingInterval: "MONTHLY",
        status: "ACTIVE",
        currency: "USD",
        configurationJson: {},
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(subscriptions).values({
      id: createId(),
      tenantId,
      planId,
      status: "ACTIVE",
      billingProvider: "NONE",
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 86400_000),
      createdAt: now,
      updatedAt: now,
    });

    const product = await db.query.platformProducts.findFirst({
      where: eq(platformProducts.code, "FORGE_RMS"),
    });
    if (product) {
      await db.insert(tenantProducts).values({
        id: createId(),
        tenantId,
        productId: product.id,
        status: "ACTIVE",
        enabledAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

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
      forgePersonNumber: "FP-SYNTH-ADMIN",
      firstName: "Synthetic",
      lastName: "Admin",
      displayName: "Synthetic Admin",
      email: "admin@rms-synthetic.test",
      status: "ACTIVE",
      recordSource: "SEED",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: adminUserId,
      tenantId,
      personId: adminPersonId,
      primaryEmail: "admin@rms-synthetic.test",
      status: "ACTIVE",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const roleId = createId();
    await db.insert(roles).values({
      id: roleId,
      tenantId,
      code: "RMS_SYNTHETIC_ADMIN",
      name: "RMS Synthetic Admin",
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

    const membershipId = createId();
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

    if (product) {
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
    }

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

    await ensureFeatureOverrides(db, tenantId, adminUserId, [...PHASE2_FEATURE_FLAGS], now);

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
      formatTemplate: "SVFD-{YEAR4}-{SEQ:5}",
      prefix: "SVFD",
      resetMode: "CALENDAR",
      scope: "NONE",
      allowManual: false,
      status: "ACTIVE",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    const station1Id = createId();
    const station2Id = createId();
    const shiftAId = createId();
    const shiftBId = createId();
    const apparatus1Id = createId();
    const apparatus2Id = createId();
    const unit1Id = createId();
    const unit2Id = createId();

    await db.insert(rmsStations).values([
      {
        id: station1Id,
        tenantId,
        stationNumber: "1",
        name: "Synthetic Station 1",
        city: "Synthville",
        state: "TX",
        defaultResponseDistrict: "District-A",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: station2Id,
        tenantId,
        stationNumber: "2",
        name: "Synthetic Station 2",
        city: "Synthville",
        state: "TX",
        defaultResponseDistrict: "District-B",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(rmsShifts).values([
      {
        id: shiftAId,
        tenantId,
        name: "Synthetic Shift A",
        code: "A",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: shiftBId,
        tenantId,
        name: "Synthetic Shift B",
        code: "B",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(rmsApparatus).values([
      {
        id: apparatus1Id,
        tenantId,
        apparatusNumber: "E1",
        name: "Synthetic Engine 1",
        apparatusType: "ENGINE",
        stationId: station1Id,
        nerisClassification: "ENGINE",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: apparatus2Id,
        tenantId,
        apparatusNumber: "L2",
        name: "Synthetic Ladder 2",
        apparatusType: "LADDER",
        stationId: station2Id,
        nerisClassification: "LADDER",
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(rmsUnits).values([
      {
        id: unit1Id,
        tenantId,
        unitNumber: "U1",
        callSign: "SYN-E1",
        unitType: "ENGINE",
        apparatusId: apparatus1Id,
        stationId: station1Id,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: unit2Id,
        tenantId,
        unitNumber: "U2",
        callSign: "SYN-L2",
        unitType: "LADDER",
        apparatusId: apparatus2Id,
        stationId: station2Id,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const personnelSpecs = [
      { first: "Alex", last: "Engineer", rank: "Engineer" },
      { first: "Blake", last: "Captain", rank: "Captain" },
      { first: "Casey", last: "Firefighter", rank: "Firefighter" },
      { first: "Dana", last: "Lieutenant", rank: "Lieutenant" },
    ] as const;

    const personnelIds: string[] = [];
    for (const [index, spec] of personnelSpecs.entries()) {
      const personId = createId();
      const personnelId = createId();
      personnelIds.push(personnelId);
      await db.insert(persons).values({
        id: personId,
        tenantId,
        forgePersonNumber: `FP-SYNTH-${index + 1}`,
        firstName: spec.first,
        lastName: spec.last,
        displayName: `${spec.first} ${spec.last}`,
        email: `${spec.first.toLowerCase()}.${spec.last.toLowerCase()}@rms-synthetic.test`,
        status: "ACTIVE",
        recordSource: "SEED",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(rmsPersonnel).values({
        id: personnelId,
        tenantId,
        personId,
        rank: spec.rank,
        stationId: index < 2 ? station1Id : station2Id,
        shiftId: index % 2 === 0 ? shiftAId : shiftBId,
        incidentEligible: true,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const rosterId = createId();
    const rosterDate = now.toISOString().slice(0, 10);
    await db.insert(rmsDailyRosters).values({
      id: rosterId,
      tenantId,
      rosterDate,
      shiftId: shiftAId,
      stationId: station1Id,
      status: "ACTIVE",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsRosterAssignments).values([
      {
        id: createId(),
        tenantId,
        rosterId,
        personnelId: personnelIds[0]!,
        unitId: unit1Id,
        assignmentRole: "DRIVER",
        isOfficer: false,
        incidentCommanderEligible: false,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: createId(),
        tenantId,
        rosterId,
        personnelId: personnelIds[1]!,
        unitId: unit1Id,
        assignmentRole: "OFFICER",
        isOfficer: true,
        incidentCommanderEligible: true,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const occupancyId = createId();
    const preplanId = createId();
    await db.insert(rmsOccupancies).values({
      id: occupancyId,
      tenantId,
      name: "Synthetic Commerce Center",
      addressLine1: "100 Demo Plaza",
      city: "Synthville",
      state: "TX",
      postalCode: "75001",
      occupancyType: "COMMERCIAL",
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(rmsPreplans).values({
      id: preplanId,
      tenantId,
      occupancyId,
      versionLabel: "1",
      approvalStatus: "APPROVED",
      tacticalSummary:
        "Synthetic preplan: sprinklered commercial occupancy, roof access on north side.",
      hazards: "Synthetic hazard notes only.",
      primaryStationId: station1Id,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(rmsOccupancies)
      .set({ preplanId, updatedAt: now })
      .where(eq(rmsOccupancies.id, occupancyId));

    const incidentStatuses = [
      "DRAFT",
      "READY_FOR_REVIEW",
      "RETURNED_FOR_CORRECTION",
      "APPROVED",
    ] as const;
    const incidentIds: Record<string, string> = {};
    const defaultSections = [
      "OVERVIEW",
      "DISPATCH",
      "LOCATION",
      "UNITS_PERSONNEL",
      "CLASSIFICATION",
      "APPLICABLE_MODULES",
      "NARRATIVE",
      "REVIEW",
    ];

    for (const [index, status] of incidentStatuses.entries()) {
      const incidentId = createId();
      incidentIds[status] = incidentId;
      const incidentNumber = `SVFD-${now.getUTCFullYear()}-SEED${index + 1}`;
      await db.insert(nerisIncidents).values({
        id: incidentId,
        tenantId,
        incidentNumber,
        status,
        schemaVersionId: publishedSchema?.id,
        incidentDate: rosterDate,
        stationId: station1Id,
        shiftId: shiftAId,
        responseDistrict: "District-A",
        dispatchDescription: `Synthetic ${status.toLowerCase().replace(/_/g, " ")} incident`,
        primaryIncidentTypeCode: "FIRE",
        operatingMode: "MANUAL_ONLY",
        reportOwnerUserId: adminUserId,
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(nerisIncidentSections).values(
        defaultSections.map((sectionKey) => ({
          id: createId(),
          tenantId,
          incidentId,
          sectionKey,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    return {
      tenantId,
      tenantKey: RMS_SYNTHETIC_TENANT_KEY,
      adminUserId,
      stationIds: [station1Id, station2Id],
      incidentIds,
      skipped: false,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function ensureSyntheticAdminPermissions(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tenantId: string,
  now: Date,
): Promise<void> {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.tenantId, tenantId), eq(roles.code, "RMS_SYNTHETIC_ADMIN")),
  });
  if (!role) return;

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

async function ensureFeatureOverrides(
  db: ReturnType<typeof drizzle<typeof schema>>,
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
            reason: "NERIS synthetic development tenant (Phase 2/3)",
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
      reason: "NERIS synthetic development tenant (Phase 2/3)",
      createdByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function main(): Promise<void> {
  const result = await seedRmsSyntheticTenant();
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify({ ok: true, ...result }, null, 2));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-rms-synthetic.ts") ||
  process.argv[1]?.endsWith("seed-rms-synthetic.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
