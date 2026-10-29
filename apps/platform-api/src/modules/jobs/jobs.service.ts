import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  listPlatformJobsQuerySchema,
  type PlatformJob,
  type PlatformJobStatus,
  type PlatformJobType,
} from "@forge/contracts";
import { platformJobs, withTenantTransaction, type Database } from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

@Injectable()
export class JobsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    tenantId: string,
    rawQuery: unknown,
    principal: ForgePrincipal,
  ): Promise<PlatformJob[]> {
    this.assertTenant(tenantId, principal);
    const query = listPlatformJobsQuerySchema.parse(rawQuery);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters = [eq(platformJobs.tenantId, tenantId)];
      if (query.type) filters.push(eq(platformJobs.type, query.type));
      if (query.status) filters.push(eq(platformJobs.status, query.status));
      const rows = await tx
        .select()
        .from(platformJobs)
        .where(and(...filters))
        .orderBy(desc(platformJobs.createdAt))
        .limit(query.limit);
      return rows.map((row) => this.toPublic(row));
    });
  }

  async get(tenantId: string, jobId: string, principal: ForgePrincipal): Promise<PlatformJob> {
    this.assertTenant(tenantId, principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.platformJobs.findFirst({
        where: and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)),
      });
      if (!row) throw new NotFoundException("Job not found");
      return this.toPublic(row);
    });
  }

  toPublic(row: typeof platformJobs.$inferSelect): PlatformJob {
    const result =
      row.resultJson && typeof row.resultJson === "object" && !Array.isArray(row.resultJson)
        ? (row.resultJson as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      tenantId: row.tenantId,
      type: row.type as PlatformJobType,
      status: row.status as PlatformJobStatus,
      progress: row.progress,
      attempt: row.attempt,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      failure: row.failure,
      correlationId: row.correlationId,
      resultSummary: {
        ...result,
        // Never leak inline payload in list/get summaries.
        hasInlineArtifact: Boolean(row.artifactInline),
        hasObjectKey: Boolean(row.artifactObjectKey),
      },
      downloadAvailable:
        row.status === "SUCCEEDED" && Boolean(row.artifactInline || row.artifactObjectKey),
    };
  }

  private assertTenant(tenantId: string, principal: ForgePrincipal): void {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForbiddenException("Tenant scope mismatch");
    }
  }
}
