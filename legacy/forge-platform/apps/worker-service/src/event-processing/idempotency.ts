import {
  createId,
  eventProcessingRecords,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { sql, eq, and } from "drizzle-orm";
import type { InboundDomainEvent } from "../domain-event.js";

export type ClaimResult =
  | { status: "claimed"; recordId: string }
  | { status: "already_completed" }
  | { status: "in_progress" }
  | { status: "retry"; recordId: string };

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && (current as { code?: string }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

async function findExistingRecord(
  db: Database | DatabaseTransaction,
  eventId: string,
  handlerName: string,
) {
  const rows = await db
    .select({
      id: eventProcessingRecords.id,
      status: eventProcessingRecords.status,
    })
    .from(eventProcessingRecords)
    .where(
      and(
        eq(eventProcessingRecords.eventId, eventId),
        eq(eventProcessingRecords.handlerName, handlerName),
      ),
    )
    .limit(1);
  return rows[0];
}

async function runWithTenantContext<T>(
  db: Database,
  tenantId: string | null,
  callback: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  if (tenantId) {
    return withTenantTransaction(db, tenantId, callback);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'on', true)`);
    return callback(tx);
  });
}

export async function claimEventProcessing(
  db: Database,
  event: InboundDomainEvent,
  handlerName: string,
): Promise<ClaimResult> {
  const recordId = createId();

  try {
    await runWithTenantContext(db, event.tenantId, async (tx) => {
      await tx.insert(eventProcessingRecords).values({
        id: recordId,
        tenantId: event.tenantId,
        eventId: event.id,
        eventType: event.type,
        handlerName,
        status: "PROCESSING",
        attemptCount: 1,
        correlationId: event.correlationId,
      });
    });
    return { status: "claimed", recordId };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await runWithTenantContext(db, event.tenantId, async (tx) =>
      findExistingRecord(tx, event.id, handlerName),
    );

    if (!existing) {
      return { status: "in_progress" };
    }

    if (existing.status === "COMPLETED") {
      return { status: "already_completed" };
    }

    if (existing.status === "PROCESSING") {
      return { status: "in_progress" };
    }

    await runWithTenantContext(db, event.tenantId, async (tx) => {
      await tx
        .update(eventProcessingRecords)
        .set({
          status: "PROCESSING",
          attemptCount: sql`${eventProcessingRecords.attemptCount} + 1`,
          errorMessage: null,
          completedAt: null,
          durationMs: null,
        })
        .where(eq(eventProcessingRecords.id, existing.id));
    });

    return { status: "retry", recordId: existing.id };
  }
}

export async function completeEventProcessing(
  db: Database,
  event: InboundDomainEvent,
  recordId: string,
  durationMs: number,
): Promise<void> {
  await runWithTenantContext(db, event.tenantId, async (tx) => {
    await tx
      .update(eventProcessingRecords)
      .set({
        status: "COMPLETED",
        durationMs,
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(eventProcessingRecords.id, recordId));
  });
}

export async function failEventProcessing(
  db: Database,
  event: InboundDomainEvent,
  recordId: string,
  durationMs: number,
  errorMessage: string,
): Promise<void> {
  const safe = errorMessage.slice(0, 2000);
  await runWithTenantContext(db, event.tenantId, async (tx) => {
    await tx
      .update(eventProcessingRecords)
      .set({
        status: "FAILED",
        durationMs,
        completedAt: new Date(),
        errorMessage: safe,
      })
      .where(eq(eventProcessingRecords.id, recordId));
  });
}
