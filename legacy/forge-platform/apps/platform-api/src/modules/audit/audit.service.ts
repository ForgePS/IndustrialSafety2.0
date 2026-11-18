import { Inject, Injectable } from "@nestjs/common";
import { buildAuditRecord, type AuditEventInput } from "@forge/audit";
import {
  auditEvents,
  createId,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { and, eq, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async writeInTransaction(
    tx: DatabaseTransaction,
    input: Omit<AuditEventInput, "id"> & { id?: string },
  ): Promise<string> {
    const id = input.id ?? createId();
    const record = buildAuditRecord({ ...input, id });
    await tx.insert(auditEvents).values({
      id: record.id,
      tenantId: record.tenantId,
      actorUserId: record.actorUserId,
      actorPersonId: record.actorPersonId,
      actorType: record.actorType,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      organizationId: record.organizationId,
      result: record.result,
      riskLevel: record.riskLevel,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      correlationId: record.correlationId,
      requestId: record.requestId,
      beforeJson: record.beforeJson as Record<string, unknown> | null,
      afterJson: record.afterJson as Record<string, unknown> | null,
      metadataJson: (record.metadataJson as Record<string, unknown>) ?? {},
      occurredAt: record.occurredAt,
    });
    return id;
  }

  async list(tenantId: string, page = 1, pageSize = 25, filters: { actorUserId?: string } = {}) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const actorUserId = (filters.actorUserId ?? "").trim();
      const whereClause = actorUserId
        ? and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.actorUserId, actorUserId))
        : eq(auditEvents.tenantId, tenantId);

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(auditEvents)
        .where(whereClause);
      const total = countRow?.count ?? 0;
      const rows = await tx.query.auditEvents.findMany({
        where: whereClause,
        orderBy: (t, { desc }) => [desc(t.occurredAt)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { rows, total };
    });
  }

  async getById(tenantId: string, auditEventId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.auditEvents.findFirst({
        where: eq(auditEvents.id, auditEventId),
      });
    });
  }

  async exportWithSelfAudit(
    tenantId: string,
    principal: {
      userId: string;
      personId: string | null;
      correlationId: string;
      requestId: string;
    },
    ids: { correlationId: string; requestId: string },
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const rows = await tx.query.auditEvents.findMany({
          where: eq(auditEvents.tenantId, tenantId),
          orderBy: (t, { desc }) => [desc(t.occurredAt)],
          limit: 200,
        });

        const exportId = createId();
        await this.writeInTransaction(tx, {
          id: exportId,
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "audit.export.generated",
          resourceType: "audit_export",
          resourceId: exportId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: ids.correlationId || principal.correlationId,
          requestId: ids.requestId || principal.requestId,
          metadata: { format: "json", count: rows.length },
        });

        return {
          format: "json" as const,
          exportId,
          exportedAt: new Date().toISOString(),
          count: rows.length,
          events: rows,
        };
      },
      principal.userId,
    );
  }
}
