import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  createDatabase,
  createId,
  supportTicketMessages,
  supportTickets,
  tenants,
  withTenantTransaction,
  type Database,
} from "../src/index.js";

/** Must use non-superuser forge_app so FORCE RLS applies. */
const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_test";
const url =
  process.env.DATABASE_URL ??
  "postgresql://forge_app:forge_local_only@localhost:5432/forge_platform_test";

const TEST_YEAR = 2999;

describe("help desk tenant isolation (integration)", () => {
  let db: Database;
  const tenantA = createId();
  const tenantB = createId();
  const ticketA = createId();

  beforeAll(async () => {
    const admin = createDatabase(adminUrl);
    db = createDatabase(url);
    const now = new Date();
    for (const [id, key] of [
      [tenantA, `hd-a-${tenantA.slice(0, 8)}`],
      [tenantB, `hd-b-${tenantB.slice(0, 8)}`],
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
      await tx.insert(supportTickets).values({
        id: ticketA,
        tenantId: tenantA,
        ticketNumber: `SUP-TEST-${ticketA.slice(0, 8)}`,
        requesterName: "Tenant A user",
        requestType: "TECHNICAL_ISSUE",
        subject: "Tenant A ticket",
        description: "Only tenant A may read this ticket.",
      });
      await tx.insert(supportTicketMessages).values({
        id: createId(),
        tenantId: tenantA,
        ticketId: ticketA,
        authorName: "Agent",
        authorType: "SUPPORT",
        messageType: "INTERNAL_NOTE",
        body: "internal only",
        isInternal: true,
      });
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const admin = createDatabase(adminUrl);
      await admin.delete(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticketA));
      await admin.delete(supportTickets).where(inArray(supportTickets.tenantId, [tenantA, tenantB]));
      await admin.execute(sql`delete from support_ticket_sequences where year = ${TEST_YEAR}`);
      await admin.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    } catch {
      /* ignore */
    }
  });

  it("hides tenant A tickets and messages from tenant B", async () => {
    const result = await withTenantTransaction(db, tenantB, async (tx) => ({
      tickets: await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketA)),
      messages: await tx.select().from(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticketA)),
    }));
    expect(result.tickets).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  it("blocks tenant B from writing a ticket into tenant A", async () => {
    await expect(
      withTenantTransaction(db, tenantB, async (tx) => {
        await tx.insert(supportTickets).values({
          id: createId(),
          tenantId: tenantA,
          ticketNumber: `SUP-TEST-${createId().slice(0, 8)}`,
          requesterName: "Intruder",
          requestType: "OTHER",
          subject: "Cross-tenant write",
          description: "Should be rejected by RLS WITH CHECK.",
        });
      }),
    ).rejects.toThrow();
  });

  it("rejects internal notes stored as customer-visible", async () => {
    await expect(
      withTenantTransaction(db, tenantA, async (tx) => {
        await tx.insert(supportTicketMessages).values({
          id: createId(),
          tenantId: tenantA,
          ticketId: ticketA,
          authorName: "Agent",
          authorType: "SUPPORT",
          messageType: "INTERNAL_NOTE",
          body: "leak",
          isInternal: false,
        });
      }),
    ).rejects.toThrow();
  });

  it("never hands out the same ticket number under concurrent creation", async () => {
    const claims = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        withTenantTransaction(db, i % 2 ? tenantA : tenantB, async (tx) => {
          const rows = await tx.execute(sql`
            insert into support_ticket_sequences (year, last_value, updated_at)
            values (${TEST_YEAR}, 1, now())
            on conflict (year) do update
              set last_value = support_ticket_sequences.last_value + 1, updated_at = now()
            returning last_value
          `);
          const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{
            last_value: number | string;
          }>;
          return Number(list[0]?.last_value);
        }),
      ),
    );
    expect(new Set(claims).size).toBe(25);
    expect(Math.max(...claims)).toBe(25);
  });
});
