import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  createId,
  persons,
  tenants,
  withTenantTransaction,
  type Database,
} from "../src/index.js";
import { eq } from "drizzle-orm";

/** Must use non-superuser forge_app so FORCE RLS applies. */
const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_test";
const url =
  process.env.DATABASE_URL ??
  "postgresql://forge_app:forge_local_only@localhost:5432/forge_platform_test";

describe("tenant isolation (integration)", () => {
  let db: Database;
  const tenantA = createId();
  const tenantB = createId();
  const personA = createId();
  const personB = createId();

  beforeAll(async () => {
    const admin = createDatabase(adminUrl);
    db = createDatabase(url);
    const now = new Date();
    for (const [id, key, slug] of [
      [tenantA, `iso-a-${tenantA.slice(0, 8)}`, `iso-a-${tenantA.slice(0, 8)}`],
      [tenantB, `iso-b-${tenantB.slice(0, 8)}`, `iso-b-${tenantB.slice(0, 8)}`],
    ] as const) {
      await admin.insert(tenants).values({
        id,
        tenantKey: key,
        slug,
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
    await withTenantTransaction(db, tenantA, async (tx) => {
      await tx.insert(persons).values({
        id: personA,
        tenantId: tenantA,
        forgePersonNumber: `FP-A-${personA.slice(0, 6)}`,
        firstName: "Ada",
        lastName: "A",
        displayName: "Ada A",
        status: "ACTIVE",
        recordSource: "TEST",
        createdAt: now,
        updatedAt: now,
      });
    });
    await withTenantTransaction(db, tenantB, async (tx) => {
      await tx.insert(persons).values({
        id: personB,
        tenantId: tenantB,
        forgePersonNumber: `FP-B-${personB.slice(0, 6)}`,
        firstName: "Bob",
        lastName: "B",
        displayName: "Bob B",
        status: "ACTIVE",
        recordSource: "TEST",
        createdAt: now,
        updatedAt: now,
      });
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const admin = createDatabase(adminUrl);
      await admin.delete(persons).where(eq(persons.id, personA));
      await admin.delete(persons).where(eq(persons.id, personB));
      await admin.delete(tenants).where(eq(tenants.id, tenantA));
      await admin.delete(tenants).where(eq(tenants.id, tenantB));
    } catch {
      /* ignore */
    }
  });

  it("does not return cross-tenant persons inside tenant A context", async () => {
    const rows = await withTenantTransaction(db, tenantA, async (tx) => {
      return tx.select().from(persons);
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(personA);
    expect(ids).not.toContain(personB);
  });

  it("blocks cross-tenant reads through forge_app RLS", async () => {
    const row = await withTenantTransaction(db, tenantA, async (tx) => {
      return tx.query.persons.findFirst({ where: eq(persons.id, personB) });
    });
    expect(row).toBeUndefined();
  });

  it("blocks cross-tenant updates through forge_app RLS", async () => {
    await expect(
      withTenantTransaction(db, tenantA, async (tx) => {
        await tx.update(persons).set({ firstName: "Hacked" }).where(eq(persons.id, personB));
      }),
    ).resolves.not.toThrow();

    const untouched = await withTenantTransaction(db, tenantB, async (tx) => {
      return tx.query.persons.findFirst({ where: eq(persons.id, personB) });
    });
    expect(untouched?.firstName).toBe("Bob");
  });

  it("blocks cross-tenant inserts through forge_app RLS", async () => {
    const intruderId = createId();
    await expect(
      withTenantTransaction(db, tenantA, async (tx) => {
        await tx.insert(persons).values({
          id: intruderId,
          tenantId: tenantB,
          forgePersonNumber: `FP-X-${intruderId.slice(0, 6)}`,
          firstName: "Cross",
          lastName: "Insert",
          displayName: "Cross Insert",
          status: "ACTIVE",
          recordSource: "TEST",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/row-level security policy|Failed query/i),
    });

    const visibleInB = await withTenantTransaction(db, tenantB, async (tx) => {
      return tx.query.persons.findFirst({ where: eq(persons.id, intruderId) });
    });
    expect(visibleInB).toBeUndefined();
  });
});
