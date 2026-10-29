/**
 * NERIS Phase 1 integrity + idempotency + namespace + overlay RLS tests.
 */
import { NERIS_EXPECTED_COUNTS } from "@forge/neris";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, createId, withTenantTransaction } from "../index.js";
import { importNerisSchema } from "./import-schema.js";
import * as schema from "../schema.js";
import {
  nerisFields,
  nerisModules,
  nerisValueOptions,
  nerisValueSets,
  tenantNerisConfiguration,
  tenantNerisFieldOverlays,
  tenants,
} from "../schema.js";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_test";
const appUrl =
  process.env.DATABASE_URL ??
  "postgresql://forge_app:forge_local_only@localhost:5432/forge_platform_test";

describe("NERIS schema foundation integrity", () => {
  const adminDb = createDatabase(adminUrl);
  const appDb = createDatabase(appUrl);

  beforeAll(async () => {
    await importNerisSchema({ databaseUrl: adminUrl, publish: true });
  }, 300_000);

  afterAll(async () => {
    /* connection pools close with process */
  });

  it("imports every module and field", async () => {
    const [published] = await adminDb
      .select()
      .from(schema.nerisSchemaVersions)
      .where(eq(schema.nerisSchemaVersions.state, "PUBLISHED"))
      .limit(1);
    expect(published).toBeTruthy();
    const [{ modules }] = await adminDb
      .select({ modules: count() })
      .from(nerisModules)
      .where(eq(nerisModules.schemaVersionId, published!.id));
    const [{ fields }] = await adminDb
      .select({ fields: count() })
      .from(nerisFields)
      .where(eq(nerisFields.schemaVersionId, published!.id));
    expect(modules).toBe(NERIS_EXPECTED_COUNTS.modules);
    expect(fields).toBe(NERIS_EXPECTED_COUNTS.fields);
  });

  it("imports all value sets and options with namespaces", async () => {
    const [published] = await adminDb
      .select()
      .from(schema.nerisSchemaVersions)
      .where(eq(schema.nerisSchemaVersions.state, "PUBLISHED"))
      .limit(1);
    const sets = await adminDb
      .select()
      .from(nerisValueSets)
      .where(eq(nerisValueSets.schemaVersionId, published!.id));
    expect(sets).toHaveLength(NERIS_EXPECTED_COUNTS.valueSets);
    const genders = sets.filter((set) => set.name === "type_gender");
    expect(genders.length).toBeGreaterThan(1);
    expect(new Set(genders.map((set) => set.sourceKey)).size).toBe(genders.length);

    const [{ options }] = await adminDb
      .select({ options: count() })
      .from(nerisValueOptions)
      .innerJoin(nerisValueSets, eq(nerisValueOptions.valueSetId, nerisValueSets.id))
      .where(eq(nerisValueSets.schemaVersionId, published!.id));
    expect(options).toBe(NERIS_EXPECTED_COUNTS.options);
  });

  it("does not duplicate on re-import", async () => {
    const first = await importNerisSchema({ databaseUrl: adminUrl, publish: true });
    expect(first.outcome).toBe("SKIPPED_IDENTICAL");
    const [published] = await adminDb
      .select()
      .from(schema.nerisSchemaVersions)
      .where(eq(schema.nerisSchemaVersions.state, "PUBLISHED"))
      .limit(1);
    const [{ modules }] = await adminDb
      .select({ modules: count() })
      .from(nerisModules)
      .where(eq(nerisModules.schemaVersionId, published!.id));
    expect(modules).toBe(NERIS_EXPECTED_COUNTS.modules);
  });

  it("preserves inactive options and excludes them from active-only queries", async () => {
    const [published] = await adminDb
      .select()
      .from(schema.nerisSchemaVersions)
      .where(eq(schema.nerisSchemaVersions.state, "PUBLISHED"))
      .limit(1);
    const [set] = await adminDb
      .select()
      .from(nerisValueSets)
      .where(eq(nerisValueSets.schemaVersionId, published!.id))
      .limit(1);
    const [option] = await adminDb
      .select()
      .from(nerisValueOptions)
      .where(eq(nerisValueOptions.valueSetId, set!.id))
      .limit(1);
    await adminDb
      .update(nerisValueOptions)
      .set({ active: false })
      .where(eq(nerisValueOptions.id, option!.id));

    const active = await adminDb
      .select()
      .from(nerisValueOptions)
      .where(and(eq(nerisValueOptions.valueSetId, set!.id), eq(nerisValueOptions.active, true)));
    expect(active.find((row) => row.id === option!.id)).toBeUndefined();

    const historical = await adminDb
      .select()
      .from(nerisValueOptions)
      .where(eq(nerisValueOptions.id, option!.id));
    expect(historical[0]?.code).toBe(option!.code);
    expect(historical[0]?.active).toBe(false);

    await adminDb
      .update(nerisValueOptions)
      .set({ active: true })
      .where(eq(nerisValueOptions.id, option!.id));
  });

  it("isolates tenant NERIS overlays with RLS (tenant A cannot read tenant B)", async () => {
    const tenantA = createId();
    const tenantB = createId();
    const now = new Date();
    const [field] = await adminDb.select().from(nerisFields).limit(1);
    expect(field).toBeTruthy();

    for (const [id, key] of [
      [tenantA, `neris-a-${tenantA.slice(0, 8)}`],
      [tenantB, `neris-b-${tenantB.slice(0, 8)}`],
    ] as const) {
      await adminDb.insert(tenants).values({
        id,
        tenantKey: key,
        slug: key,
        legalName: key,
        displayName: key,
        tenantType: "CUSTOMER",
        status: "ACTIVE",
        timezone: "UTC",
        defaultLocale: "en-US",
        dataRegion: "us-east-1",
        createdAt: now,
        updatedAt: now,
      });
    }

    const configA = createId();
    await withTenantTransaction(appDb, tenantA, async (tx) => {
      await tx.insert(tenantNerisConfiguration).values({
        id: configA,
        tenantId: tenantA,
        operatingMode: "MANUAL_ONLY",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(tenantNerisFieldOverlays).values({
        id: createId(),
        tenantId: tenantA,
        configurationId: configA,
        fieldId: field!.id,
        displayLabel: "Tenant A only",
        favorite: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    const seenByB = await withTenantTransaction(appDb, tenantB, async (tx) =>
      tx.select().from(tenantNerisFieldOverlays),
    );
    expect(seenByB.find((row) => row.displayLabel === "Tenant A only")).toBeUndefined();

    const seenByA = await withTenantTransaction(appDb, tenantA, async (tx) =>
      tx.select().from(tenantNerisFieldOverlays),
    );
    expect(seenByA.some((row) => row.displayLabel === "Tenant A only")).toBe(true);

    await adminDb
      .delete(tenantNerisFieldOverlays)
      .where(eq(tenantNerisFieldOverlays.tenantId, tenantA));
    await adminDb
      .delete(tenantNerisConfiguration)
      .where(eq(tenantNerisConfiguration.tenantId, tenantA));
    await adminDb.delete(tenants).where(eq(tenants.id, tenantA));
    await adminDb.delete(tenants).where(eq(tenants.id, tenantB));
  });
});
