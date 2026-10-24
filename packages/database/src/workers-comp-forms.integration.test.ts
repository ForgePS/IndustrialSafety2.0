import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  createDatabase,
  createId,
  industrialWorkersCompCases,
  industrialWorkersCompForms,
  tenants,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "../src/index.js";

/**
 * 0112 workers' comp forms: tenant RLS, HIPAA medical-access gate, immutable signed content,
 * void rules and append-only email history. Runs as forge_app so FORCE RLS applies.
 */
const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_test";
const url =
  process.env.DATABASE_URL ??
  "postgresql://forge_app:forge_local_only@localhost:5432/forge_platform_test";

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";

/** Drizzle wraps Postgres errors ("Failed query: ..."); match the database's own message on err.cause. */
async function expectDbError(run: Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await run;
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the database to reject the statement").toBeTruthy();
  const error = caught as { message?: string; cause?: { message?: string } };
  expect(`${error.message ?? ""} ${error.cause?.message ?? ""}`).toMatch(pattern);
}

describe("workers' comp forms (integration)", () => {
  let db: Database;
  const tenantA = createId();
  const tenantB = createId();
  const caseA = createId();
  const createdForms: string[] = [];

  const medical = (tx: DatabaseTransaction) =>
    tx.execute(sql`select set_config('app.industrial_wc_medical_access', 'on', true)`);

  const insertForm = (
    tx: DatabaseTransaction,
    formKey: "INJURY_GUIDELINES_ACK" | "HIPAA_AUTHORIZATION",
    tenantId = tenantA,
  ) => {
    const id = createId();
    createdForms.push(id);
    return tx
      .insert(industrialWorkersCompForms)
      .values({
        id,
        tenantId,
        caseId: caseA,
        formKey,
        formData: { employeeName: "Test Employee" },
        signatureDataUrl: SIGNATURE,
        signerName: "Test Employee",
      })
      .returning({ id: industrialWorkersCompForms.id });
  };

  beforeAll(async () => {
    const admin = createDatabase(adminUrl);
    db = createDatabase(url);
    const now = new Date();
    for (const [id, key] of [
      [tenantA, `wcf-a-${tenantA.slice(0, 8)}`],
      [tenantB, `wcf-b-${tenantB.slice(0, 8)}`],
    ] as const) {
      await admin.insert(tenants).values({
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
    await withTenantTransaction(db, tenantA, async (tx) => {
      await tx
        .insert(industrialWorkersCompCases)
        .values({ id: caseA, tenantId: tenantA, caseNumber: "WC-TEST-1" });
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const admin = createDatabase(adminUrl);
      if (createdForms.length) {
        await admin
          .delete(industrialWorkersCompForms)
          .where(inArray(industrialWorkersCompForms.id, createdForms));
      }
      await admin
        .delete(industrialWorkersCompCases)
        .where(eq(industrialWorkersCompCases.id, caseA));
      await admin.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    } catch {
      /* ignore */
    }
  });

  it("keeps guidelines acknowledgments inside their tenant", async () => {
    const [row] = await withTenantTransaction(db, tenantA, (tx) =>
      insertForm(tx, "INJURY_GUIDELINES_ACK"),
    );
    const own = await withTenantTransaction(db, tenantA, (tx) =>
      tx
        .select()
        .from(industrialWorkersCompForms)
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    expect(own).toHaveLength(1);
    const other = await withTenantTransaction(db, tenantB, (tx) =>
      tx
        .select()
        .from(industrialWorkersCompForms)
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    expect(other).toHaveLength(0);
  });

  it("refuses HIPAA inserts without the medical-access flag", async () => {
    await expect(
      withTenantTransaction(db, tenantA, (tx) => insertForm(tx, "HIPAA_AUTHORIZATION")),
    ).rejects.toThrow();
  });

  it("hides HIPAA rows unless the medical-access flag is on", async () => {
    const [row] = await withTenantTransaction(db, tenantA, async (tx) => {
      await medical(tx);
      return insertForm(tx, "HIPAA_AUTHORIZATION");
    });
    const withoutFlag = await withTenantTransaction(db, tenantA, (tx) =>
      tx
        .select()
        .from(industrialWorkersCompForms)
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    expect(withoutFlag).toHaveLength(0);
    const withFlag = await withTenantTransaction(db, tenantA, async (tx) => {
      await medical(tx);
      return tx
        .select()
        .from(industrialWorkersCompForms)
        .where(eq(industrialWorkersCompForms.id, row!.id));
    });
    expect(withFlag).toHaveLength(1);
    const otherTenant = await withTenantTransaction(db, tenantB, async (tx) => {
      await medical(tx);
      return tx
        .select()
        .from(industrialWorkersCompForms)
        .where(eq(industrialWorkersCompForms.id, row!.id));
    });
    expect(otherTenant).toHaveLength(0);
  });

  it("never lets signed content change", async () => {
    const [row] = await withTenantTransaction(db, tenantA, (tx) =>
      insertForm(tx, "INJURY_GUIDELINES_ACK"),
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx
          .update(industrialWorkersCompForms)
          .set({ formData: { employeeName: "Changed" } })
          .where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /cannot be changed/,
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx
          .update(industrialWorkersCompForms)
          .set({ signatureDataUrl: "data:image/png;base64,AAAA" })
          .where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /cannot be changed/,
    );
  });

  it("requires a reason to void and keeps voided forms final", async () => {
    const [row] = await withTenantTransaction(db, tenantA, (tx) =>
      insertForm(tx, "INJURY_GUIDELINES_ACK"),
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx
          .update(industrialWorkersCompForms)
          .set({ status: "VOIDED", voidedAt: new Date() })
          .where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /industrial_wc_forms_void_reason/,
    );
    await withTenantTransaction(db, tenantA, (tx) =>
      tx
        .update(industrialWorkersCompForms)
        .set({ status: "VOIDED", voidedAt: new Date(), voidReason: "Signed on the wrong case" })
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx
          .update(industrialWorkersCompForms)
          .set({ status: "SIGNED" })
          .where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /cannot be changed/,
    );
  });

  it("only appends to the email history", async () => {
    const [row] = await withTenantTransaction(db, tenantA, (tx) =>
      insertForm(tx, "INJURY_GUIDELINES_ACK"),
    );
    const first = { to: ["a@example.test"], at: "2026-10-23T00:00:00Z" };
    await withTenantTransaction(db, tenantA, (tx) =>
      tx
        .update(industrialWorkersCompForms)
        .set({ emailLog: [first] })
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    await withTenantTransaction(db, tenantA, (tx) =>
      tx
        .update(industrialWorkersCompForms)
        .set({ emailLog: [first, { to: ["b@example.test"], at: "2026-10-23T01:00:00Z" }] })
        .where(eq(industrialWorkersCompForms.id, row!.id)),
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx
          .update(industrialWorkersCompForms)
          .set({
            emailLog: [
              { to: ["rewritten@example.test"], at: "2026-10-23T00:00:00Z" },
              { to: ["b@example.test"], at: "2026-10-23T01:00:00Z" },
            ],
          })
          .where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /append-only/,
    );
  });

  it("does not allow forge_app to delete forms", async () => {
    const [row] = await withTenantTransaction(db, tenantA, (tx) =>
      insertForm(tx, "INJURY_GUIDELINES_ACK"),
    );
    await expectDbError(
      withTenantTransaction(db, tenantA, (tx) =>
        tx.delete(industrialWorkersCompForms).where(eq(industrialWorkersCompForms.id, row!.id)),
      ),
      /permission denied/,
    );
  });
});
