import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { SAAS_AUDIT_ACTIONS } from "@forge/audit";
import {
  EXPORT_DOWNLOAD_TTL_SECONDS,
  EXPORT_KIND_TO_JOB_TYPE,
  EXPORT_SYNC_ROW_LIMIT,
  createExportInputSchema,
  type ExportKind,
  type PlatformJob,
} from "@forge/contracts";
import {
  auditEvents,
  createId,
  platformJobs,
  userTenantMemberships,
  users,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { JobsService } from "../jobs/jobs.service.js";

const INLINE_MAX_CHARS = 1_500_000;

@Injectable()
export class ExportsService {
  private readonly s3: S3Client;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
  }

  async create(
    tenantId: string,
    rawBody: unknown,
    principal: ForgePrincipal,
  ): Promise<PlatformJob> {
    this.assertTenant(tenantId, principal);
    const input = createExportInputSchema.parse(rawBody);
    this.assertExportAuthz(principal, input.kind);

    const jobType = EXPORT_KIND_TO_JOB_TYPE[input.kind];
    const jobId = createId();
    const correlationId = principal.correlationId;
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx.insert(platformJobs).values({
          id: jobId,
          tenantId,
          type: jobType,
          status: "PENDING",
          progress: 0,
          attempt: 0,
          createdByUserId: principal.userId,
          correlationId,
          requestId: principal.requestId,
          resultJson: { kind: input.kind },
          createdAt: now,
          updatedAt: now,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: SAAS_AUDIT_ACTIONS.DATA_EXPORT_CREATED,
          resourceType: "platform_job",
          resourceId: jobId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId,
          requestId: principal.requestId,
          after: { kind: input.kind, type: jobType },
        });
      },
      principal.userId,
    );

    try {
      return await this.runExport(
        tenantId,
        jobId,
        input.kind,
        principal,
        Boolean(input.asyncPreferred),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await tx
            .update(platformJobs)
            .set({
              status: "FAILED",
              failure: message.slice(0, 2000),
              completedAt: new Date(),
              progress: 100,
              updatedAt: new Date(),
            })
            .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
        },
        principal.userId,
      );
      throw error;
    }
  }

  async createDownload(
    tenantId: string,
    jobId: string,
    principal: ForgePrincipal,
  ): Promise<{
    jobId: string;
    downloadUrl: string;
    expiresInSeconds: number;
    expiresAt: string;
    mode: "S3_PRESIGNED" | "API_STREAM";
    contentType: string;
    filename: string;
  }> {
    this.assertTenant(tenantId, principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.platformJobs.findFirst({
          where: and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)),
        });
        if (!row) throw new NotFoundException("Export job not found");
        if (row.status !== "SUCCEEDED") {
          throw new ForgeError("VALIDATION_FAILED", "Export is not ready for download");
        }
        if (row.artifactExpiresAt && row.artifactExpiresAt.getTime() < Date.now()) {
          throw new ForgeError("VALIDATION_FAILED", "Export artifact has expired");
        }

        const kind = String((row.resultJson as { kind?: string } | null)?.kind ?? "");
        if (kind === "memberships.csv" || kind === "audit.json") {
          this.assertExportAuthz(principal, kind);
        }

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: SAAS_AUDIT_ACTIONS.DATA_EXPORT_DOWNLOADED,
          resourceType: "platform_job",
          resourceId: jobId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
        });

        const contentType = row.artifactContentType ?? "application/octet-stream";
        const filename = row.artifactFilename ?? `export-${jobId}`;
        const expiresInSeconds = EXPORT_DOWNLOAD_TTL_SECONDS;
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

        if (row.artifactObjectKey) {
          const command = new GetObjectCommand({
            Bucket: this.env.S3_EXPORT_BUCKET,
            Key: row.artifactObjectKey,
            ResponseContentType: contentType,
            ResponseContentDisposition: `attachment; filename="${filename}"`,
          });
          const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
          return {
            jobId,
            downloadUrl,
            expiresInSeconds,
            expiresAt,
            mode: "S3_PRESIGNED" as const,
            contentType,
            filename,
          };
        }

        if (!row.artifactInline) {
          throw new ForgeError("NOT_FOUND", "Export artifact missing");
        }

        // API-stream URL relative to this API (frontend uses same origin/base).
        return {
          jobId,
          downloadUrl: `/api/v1/tenants/${tenantId}/exports/${jobId}/content`,
          expiresInSeconds,
          expiresAt,
          mode: "API_STREAM" as const,
          contentType,
          filename,
        };
      },
      principal.userId,
    );
  }

  async getInlineContent(
    tenantId: string,
    jobId: string,
    principal: ForgePrincipal,
  ): Promise<{ body: string; contentType: string; filename: string }> {
    this.assertTenant(tenantId, principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.platformJobs.findFirst({
        where: and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)),
      });
      if (!row?.artifactInline) throw new NotFoundException("Export content not found");
      if (row.status !== "SUCCEEDED") {
        throw new ForgeError("VALIDATION_FAILED", "Export is not ready");
      }
      if (row.artifactExpiresAt && row.artifactExpiresAt.getTime() < Date.now()) {
        throw new ForgeError("VALIDATION_FAILED", "Export artifact has expired");
      }
      const kind = String((row.resultJson as { kind?: string } | null)?.kind ?? "");
      if (kind === "memberships.csv" || kind === "audit.json") {
        this.assertExportAuthz(principal, kind);
      }
      return {
        body: row.artifactInline,
        contentType: row.artifactContentType ?? "application/octet-stream",
        filename: row.artifactFilename ?? `export-${jobId}`,
      };
    });
  }

  private async runExport(
    tenantId: string,
    jobId: string,
    kind: ExportKind,
    principal: ForgePrincipal,
    asyncPreferred: boolean,
  ): Promise<PlatformJob> {
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx
          .update(platformJobs)
          .set({
            status: "RUNNING",
            startedAt: new Date(),
            attempt: 1,
            progress: 5,
            updatedAt: new Date(),
          })
          .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
      },
      principal.userId,
    );

    const built =
      kind === "memberships.csv"
        ? await this.buildMembershipsCsv(tenantId)
        : await this.buildAuditJson(tenantId);

    if (built.rowCount > EXPORT_SYNC_ROW_LIMIT || asyncPreferred) {
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await tx
            .update(platformJobs)
            .set({
              status: "QUEUED",
              progress: 10,
              failure: null,
              resultJson: {
                kind,
                rowCount: built.rowCount,
                queuedReason:
                  built.rowCount > EXPORT_SYNC_ROW_LIMIT ? "exceeds_sync_limit" : "async_preferred",
                note: "Large/async export queued. Process continuation via export worker is deferred; call create again with smaller scope or wait for worker wiring.",
              },
              updatedAt: new Date(),
            })
            .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
        },
        principal.userId,
      );
      return this.jobs.get(tenantId, jobId, principal);
    }

    const filename =
      kind === "memberships.csv"
        ? `memberships-${tenantId.slice(0, 8)}.csv`
        : `audit-${tenantId.slice(0, 8)}.json`;
    const contentType = kind === "memberships.csv" ? "text/csv; charset=utf-8" : "application/json";
    const objectKey = `tenants/${tenantId}/exports/${jobId}/${filename}`;
    const expiresAt = new Date(Date.now() + EXPORT_DOWNLOAD_TTL_SECONDS * 1000);

    let storedObjectKey: string | null = null;
    let inline: string | null = built.body;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.S3_EXPORT_BUCKET,
          Key: objectKey,
          Body: built.body,
          ContentType: contentType,
          ServerSideEncryption: "aws:kms",
        }),
      );
      storedObjectKey = objectKey;
      // Keep a small inline copy only when under cap for local fallback.
      if (built.body.length > INLINE_MAX_CHARS) inline = null;
    } catch {
      if (built.body.length > INLINE_MAX_CHARS) {
        throw new ForgeError(
          "INTERNAL_ERROR",
          "Export too large for inline storage and S3 write failed",
        );
      }
      storedObjectKey = null;
    }

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx
          .update(platformJobs)
          .set({
            status: "SUCCEEDED",
            progress: 100,
            completedAt: new Date(),
            artifactObjectKey: storedObjectKey,
            artifactContentType: contentType,
            artifactFilename: filename,
            artifactInline: inline,
            artifactExpiresAt: expiresAt,
            resultJson: {
              kind,
              rowCount: built.rowCount,
              storage: storedObjectKey ? "S3" : "INLINE",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
      },
      principal.userId,
    );

    return this.jobs.get(tenantId, jobId, principal);
  }

  private async buildMembershipsCsv(tenantId: string): Promise<{ body: string; rowCount: number }> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          membershipId: userTenantMemberships.id,
          userId: userTenantMemberships.userId,
          status: userTenantMemberships.status,
          email: users.primaryEmail,
          createdAt: userTenantMemberships.createdAt,
        })
        .from(userTenantMemberships)
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .where(eq(userTenantMemberships.tenantId, tenantId))
        .orderBy(desc(userTenantMemberships.createdAt))
        .limit(EXPORT_SYNC_ROW_LIMIT + 1);

      const header = "membership_id,user_id,email,status,created_at";
      const lines = rows
        .slice(0, EXPORT_SYNC_ROW_LIMIT)
        .map((row) =>
          [
            row.membershipId,
            row.userId,
            csvEscape(row.email),
            row.status,
            row.createdAt.toISOString(),
          ].join(","),
        );
      return {
        body: [header, ...lines].join("\n"),
        rowCount: rows.length,
      };
    });
  }

  private async buildAuditJson(tenantId: string): Promise<{ body: string; rowCount: number }> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.auditEvents.findMany({
        where: eq(auditEvents.tenantId, tenantId),
        orderBy: (t, { desc: d }) => [d(t.occurredAt)],
        limit: EXPORT_SYNC_ROW_LIMIT + 1,
      });
      const sliced = rows.slice(0, EXPORT_SYNC_ROW_LIMIT);
      return {
        body: JSON.stringify(
          {
            tenantId,
            generatedAt: new Date().toISOString(),
            count: sliced.length,
            truncated: rows.length > EXPORT_SYNC_ROW_LIMIT,
            events: sliced,
          },
          null,
          2,
        ),
        rowCount: rows.length,
      };
    });
  }

  private assertExportAuthz(principal: ForgePrincipal, kind: ExportKind): void {
    if (kind === "memberships.csv" && !hasPermission(principal, "platform.membership.read")) {
      throw new ForbiddenException("Missing platform.membership.read for memberships export");
    }
    if (kind === "audit.json" && !hasPermission(principal, "platform.audit.export")) {
      throw new ForbiddenException("Missing platform.audit.export for audit export");
    }
  }

  private assertTenant(tenantId: string, principal: ForgePrincipal): void {
    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForbiddenException("Tenant scope mismatch");
    }
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
