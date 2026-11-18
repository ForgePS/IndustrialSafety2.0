import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  idempotencyRecords,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { and, eq, lt } from "drizzle-orm";
import { DATABASE } from "../tokens.js";

/** Records live for 24 hours; retries after that re-execute. */
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyScope {
  tenantId: string;
  userId: string;
  method: string;
  route: string;
  key: string;
}

export type ClaimResult =
  | { outcome: "CLAIMED"; recordId: string }
  | { outcome: "REPLAY"; responseStatus: number; responseBody: unknown }
  | { outcome: "IN_PROGRESS" }
  | { outcome: "REQUEST_MISMATCH" };

/**
 * Durable idempotency (ADR-022).
 *
 * The claim is committed before the handler runs so that a concurrent
 * duplicate loses the unique-index race rather than performing a second write.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** SHA-256 over a key-sorted rendering of the request body. */
  hashRequest(body: unknown): string {
    return createHash("sha256").update(canonicalise(body)).digest("hex");
  }

  async claim(scope: IdempotencyScope, requestHash: string): Promise<ClaimResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RECORD_TTL_MS);

    return withTenantTransaction(
      this.db,
      scope.tenantId,
      async (tx) => {
        const inserted = await tx
          .insert(idempotencyRecords)
          .values({
            id: createId(),
            tenantId: scope.tenantId,
            userId: scope.userId,
            method: scope.method,
            route: scope.route,
            idempotencyKey: scope.key,
            requestHash,
            status: "PROCESSING",
            createdAt: now,
            expiresAt,
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyRecords.id });

        if (inserted.length > 0) {
          return { outcome: "CLAIMED", recordId: inserted[0]!.id } as const;
        }

        const existing = await tx.query.idempotencyRecords.findFirst({
          where: and(
            eq(idempotencyRecords.tenantId, scope.tenantId),
            eq(idempotencyRecords.userId, scope.userId),
            eq(idempotencyRecords.method, scope.method),
            eq(idempotencyRecords.route, scope.route),
            eq(idempotencyRecords.idempotencyKey, scope.key),
          ),
        });

        if (!existing) {
          // The row vanished between the failed insert and this read (expiry
          // sweep). Treat as a fresh attempt.
          return { outcome: "IN_PROGRESS" } as const;
        }

        if (existing.requestHash !== requestHash) {
          return { outcome: "REQUEST_MISMATCH" } as const;
        }

        const isExpired =
          existing.status === "EXPIRED" || existing.expiresAt.getTime() <= now.getTime();

        if (existing.status === "COMPLETED" && !isExpired) {
          return {
            outcome: "REPLAY",
            responseStatus: existing.responseStatus ?? 200,
            responseBody: existing.responseBody,
          } as const;
        }

        if (existing.status === "PROCESSING" && !isExpired) {
          return { outcome: "IN_PROGRESS" } as const;
        }

        // FAILED or expired: reclaim the row and let the caller re-execute.
        await tx
          .update(idempotencyRecords)
          .set({
            status: "PROCESSING",
            responseStatus: null,
            responseBody: null,
            completedAt: null,
            createdAt: now,
            expiresAt,
          })
          .where(eq(idempotencyRecords.id, existing.id));

        return { outcome: "CLAIMED", recordId: existing.id } as const;
      },
      scope.userId,
    );
  }

  async complete(
    tenantId: string,
    recordId: string,
    result: {
      responseStatus: number;
      responseBody: unknown;
      resourceType?: string | undefined;
      resourceId?: string | undefined;
    },
  ): Promise<void> {
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(idempotencyRecords)
        .set({
          status: "COMPLETED",
          responseStatus: result.responseStatus,
          responseBody: result.responseBody as never,
          resourceType: result.resourceType ?? null,
          resourceId: result.resourceId ?? null,
          completedAt: new Date(),
        })
        .where(eq(idempotencyRecords.id, recordId));
    });
  }

  async markFailed(tenantId: string, recordId: string, responseStatus: number): Promise<void> {
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(idempotencyRecords)
        .set({ status: "FAILED", responseStatus, completedAt: new Date() })
        .where(eq(idempotencyRecords.id, recordId));
    });
  }

  /** Removes records past their TTL. Intended for a scheduled worker job. */
  async sweepExpired(tenantId: string): Promise<number> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const deleted = await tx
        .delete(idempotencyRecords)
        .where(lt(idempotencyRecords.expiresAt, new Date()))
        .returning({ id: idempotencyRecords.id });
      return deleted.length;
    });
  }
}

/**
 * Deterministic JSON rendering: object keys sorted, arrays order-preserving.
 * Two logically identical bodies therefore hash identically regardless of the
 * key order the client happened to serialise.
 */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
