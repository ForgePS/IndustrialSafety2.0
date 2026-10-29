import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  importDuplicateCandidates,
  importFiles,
  importJobs,
  importProfileVersions,
  importProfiles,
  importRows,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import {
  detectDuplicates,
  detectDuplicatesSchema,
  listDuplicatesQuerySchema,
  patchImportProfileS4Schema,
  resolveDuplicateSchema,
  reviewDuplicateSchema,
  sanitizeObject,
  stageImportRowsSchema,
  validateApiImportSourceConfig,
  validateApiSourceSchema,
  validateZipMigrationBundle,
  validateZipSchema,
  type DetectDuplicatesInput,
  type DuplicateRulesConfig,
  type ListDuplicatesQuery,
  type PatchImportProfileS4Input,
} from "@forge/imports";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ForgeEnvironment } from "@forge/environment";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

@Injectable()
export class ImportDuplicatesService {
  private readonly s3: S3Client;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
  }

  private requireTenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) {
      throw new ForgeError("IMPORT_TENANT_CONTEXT_REQUIRED", "Tenant context is required.");
    }
    return principal.tenantId;
  }

  private mapDuplicate(row: typeof importDuplicateCandidates.$inferSelect) {
    return {
      id: row.id,
      jobId: row.jobId,
      rowId: row.rowId,
      matchedEntityId: row.matchedEntityId,
      matchedEntityType: row.matchedEntityType,
      confidence: Number(row.confidence),
      confidenceBand: row.confidenceBand,
      matchAlgorithm: row.matchAlgorithm,
      recommendedAction: row.recommendedAction,
      resolvedAction: row.resolvedAction,
      matchFields: sanitizeObject(row.matchFieldsJson ?? {}, {
        policy: { allowUnmask: false },
      }),
      matchReasons: row.matchReasonsJson,
      mergeCandidate: sanitizeObject(row.mergeCandidateJson ?? {}, {
        policy: { allowUnmask: false },
      }),
      reviewStatus: row.reviewStatus,
      candidateStatus: row.candidateStatus,
      reviewNotes: row.reviewNotes,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async stageRows(principal: ForgePrincipal, jobId: string, body: unknown, correlationId: string) {
    const tenantId = this.requireTenant(principal);
    const data = stageImportRowsSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await tx.query.importJobs.findFirst({
          where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)),
        });
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");

        const now = new Date();
        const inserted = [];
        for (const row of data.rows) {
          const id = createId();
          const [created] = await tx
            .insert(importRows)
            .values({
              id,
              tenantId,
              jobId,
              sourceRowKey: row.sourceRowKey,
              status: "STAGED",
              mappedJson: row.mapped,
              rawJson: null,
              containsSensitive: row.containsSensitive ?? false,
              sourceLine: row.sourceLine ?? null,
              sourceSheet: row.sourceSheet ?? null,
              correlationId,
              version: 1,
              createdAt: now,
              createdBy: principal.userId,
              updatedAt: now,
              updatedBy: principal.userId,
            })
            .onConflictDoUpdate({
              target: [importRows.jobId, importRows.sourceRowKey],
              set: {
                mappedJson: row.mapped,
                status: "STAGED",
                updatedAt: now,
                updatedBy: principal.userId,
                version: sql`${importRows.version} + 1`,
              },
            })
            .returning();
          inserted.push(created!);
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_job",
          aggregateId: jobId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_ROWS_STAGED,
          correlationId,
          actorUserId: principal.userId,
          payload: { jobId, rowCount: inserted.length },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportRowsStaged",
          resourceType: "import_job",
          resourceId: jobId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId,
          requestId: principal.requestId,
          after: { rowCount: inserted.length },
        });

        return {
          jobId,
          stagedCount: inserted.length,
          items: inserted.map((r) => ({
            id: r.id,
            sourceRowKey: r.sourceRowKey,
            status: r.status,
          })),
        };
      },
      principal.userId,
    );
  }

  async detect(principal: ForgePrincipal, jobId: string, body: unknown, correlationId: string) {
    const tenantId = this.requireTenant(principal);
    const data = detectDuplicatesSchema.parse(body) as DetectDuplicatesInput;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await tx.query.importJobs.findFirst({
          where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)),
        });
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");

        const staged = await tx
          .select()
          .from(importRows)
          .where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId)));
        if (staged.length < 1) {
          throw new ForgeError(
            "IMPORT_ROWS_REQUIRED",
            "Stage at least one import row before duplicate detection.",
          );
        }

        let rules: Partial<DuplicateRulesConfig> | undefined = data.rules as
          Partial<DuplicateRulesConfig> | undefined;
        if (job.profileId) {
          const profile = await tx.query.importProfiles.findFirst({
            where: and(eq(importProfiles.tenantId, tenantId), eq(importProfiles.id, job.profileId)),
          });
          if (profile?.duplicateRulesJson && Object.keys(profile.duplicateRulesJson).length > 0) {
            rules = {
              ...(profile.duplicateRulesJson as Partial<DuplicateRulesConfig>),
              ...(rules ?? {}),
            };
          }
        }

        const scored = detectDuplicates({
          incoming: staged.map((row) => ({
            sourceRowKey: row.sourceRowKey,
            fields: row.mappedJson as Record<string, unknown>,
          })),
          existing: data.existingRecords.map((r) => ({
            entityId: r.entityId,
            ...(r.entityType ? { entityType: r.entityType } : {}),
            fields: r.fields,
          })),
          ...(rules ? { rules } : {}),
        });

        if (data.replaceExistingCandidates) {
          await tx
            .delete(importDuplicateCandidates)
            .where(
              and(
                eq(importDuplicateCandidates.tenantId, tenantId),
                eq(importDuplicateCandidates.jobId, jobId),
              ),
            );
        }

        const now = new Date();
        const created = [];
        for (const item of scored) {
          const row = staged.find((r) => r.sourceRowKey === item.incomingSourceRowKey);
          if (!row) continue;
          const id = createId();
          const [cand] = await tx
            .insert(importDuplicateCandidates)
            .values({
              id,
              tenantId,
              jobId,
              rowId: row.id,
              matchedEntityId: item.existingEntityId,
              matchedEntityType: item.existingEntityType ?? null,
              confidence: String(item.confidence),
              confidenceBand: item.confidenceBand,
              matchAlgorithm: item.matchAlgorithm,
              recommendedAction: item.recommendedAction,
              matchFieldsJson: sanitizeObject(item.matchFields, {
                policy: { allowUnmask: false },
              }) as Record<string, unknown>,
              matchReasonsJson: item.matchReasons,
              mergeCandidateJson: sanitizeObject(
                {
                  existingEntityId: item.existingEntityId,
                  existingEntityType: item.existingEntityType ?? null,
                  incomingSourceRowKey: item.incomingSourceRowKey,
                  fieldComparisons: item.fieldComparisons,
                  conflictFields: item.conflictFields,
                  explanation: item.explanation,
                  confidence: item.confidence,
                  confidenceBand: item.confidenceBand,
                  matchAlgorithm: item.matchAlgorithm,
                  recommendedAction: item.recommendedAction,
                },
                { policy: { allowUnmask: false } },
              ) as Record<string, unknown>,
              reviewStatus: "PENDING",
              candidateStatus: "OPEN",
              correlationId,
              version: 1,
              createdAt: now,
              createdBy: principal.userId,
              updatedAt: now,
              updatedBy: principal.userId,
            })
            .returning();
          created.push(cand!);
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_job",
          aggregateId: jobId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_DUPLICATES_DETECTED,
          correlationId,
          actorUserId: principal.userId,
          payload: { jobId, candidateCount: created.length },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportDuplicatesDetected",
          resourceType: "import_job",
          resourceId: jobId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId,
          requestId: principal.requestId,
          after: { candidateCount: created.length },
        });

        return {
          jobId,
          candidateCount: created.length,
          items: created.map((c) => this.mapDuplicate(c)),
        };
      },
      principal.userId,
    );
  }

  async list(principal: ForgePrincipal, query: unknown) {
    const tenantId = this.requireTenant(principal);
    const parsed = listDuplicatesQuerySchema.parse(query) as ListDuplicatesQuery;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const filters: SQL[] = [eq(importDuplicateCandidates.tenantId, tenantId)];
        if (parsed.jobId) filters.push(eq(importDuplicateCandidates.jobId, parsed.jobId));
        if (parsed.reviewStatus) {
          filters.push(eq(importDuplicateCandidates.reviewStatus, parsed.reviewStatus));
        }
        if (parsed.confidenceBand) {
          filters.push(eq(importDuplicateCandidates.confidenceBand, parsed.confidenceBand));
        }
        const where = and(...filters);
        const sortColumn = {
          createdAt: importDuplicateCandidates.createdAt,
          confidence: importDuplicateCandidates.confidence,
          reviewStatus: importDuplicateCandidates.reviewStatus,
        }[parsed.sort];
        const order = parsed.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
        const [totalRow] = await tx
          .select({ value: count() })
          .from(importDuplicateCandidates)
          .where(where);
        const rows = await tx
          .select()
          .from(importDuplicateCandidates)
          .where(where)
          .orderBy(order)
          .limit(parsed.pageSize)
          .offset((parsed.page - 1) * parsed.pageSize);
        return {
          items: rows.map((r) => this.mapDuplicate(r)),
          page: parsed.page,
          pageSize: parsed.pageSize,
          total: Number(totalRow?.value ?? 0),
        };
      },
      principal.userId,
    );
  }

  async get(principal: ForgePrincipal, duplicateId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.importDuplicateCandidates.findFirst({
          where: and(
            eq(importDuplicateCandidates.tenantId, tenantId),
            eq(importDuplicateCandidates.id, duplicateId),
          ),
        });
        if (!row) {
          throw new ForgeError("IMPORT_DUPLICATE_NOT_FOUND", "Duplicate candidate was not found.");
        }
        return this.mapDuplicate(row);
      },
      principal.userId,
    );
  }

  private async transitionReview(
    principal: ForgePrincipal,
    duplicateId: string,
    correlationId: string,
    nextReview: "IN_REVIEW" | "APPROVED" | "REJECTED",
    auditAction: string,
    eventType: string,
    resolvedAction?: string,
    notes?: string,
  ) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.importDuplicateCandidates.findFirst({
          where: and(
            eq(importDuplicateCandidates.tenantId, tenantId),
            eq(importDuplicateCandidates.id, duplicateId),
          ),
        });
        if (!row) {
          throw new ForgeError("IMPORT_DUPLICATE_NOT_FOUND", "Duplicate candidate was not found.");
        }
        if (row.candidateStatus !== "OPEN" && nextReview !== "IN_REVIEW") {
          throw new ForgeError(
            "IMPORT_DUPLICATE_INVALID_REVIEW",
            `Candidate status '${row.candidateStatus}' cannot transition to ${nextReview}.`,
          );
        }
        if (nextReview === "IN_REVIEW" && !["PENDING", "IN_REVIEW"].includes(row.reviewStatus)) {
          throw new ForgeError(
            "IMPORT_DUPLICATE_INVALID_REVIEW",
            `Review status '${row.reviewStatus}' cannot enter IN_REVIEW.`,
          );
        }
        if (
          (nextReview === "APPROVED" || nextReview === "REJECTED") &&
          !["PENDING", "IN_REVIEW"].includes(row.reviewStatus)
        ) {
          throw new ForgeError(
            "IMPORT_DUPLICATE_INVALID_REVIEW",
            `Review status '${row.reviewStatus}' cannot be ${nextReview}.`,
          );
        }

        const now = new Date();
        const [updated] = await tx
          .update(importDuplicateCandidates)
          .set({
            reviewStatus: nextReview,
            candidateStatus:
              nextReview === "APPROVED" || nextReview === "REJECTED"
                ? "RESOLVED"
                : row.candidateStatus,
            resolvedAction:
              nextReview === "APPROVED"
                ? (resolvedAction ?? row.recommendedAction)
                : nextReview === "REJECTED"
                  ? "REJECT"
                  : row.resolvedAction,
            reviewNotes: notes ?? row.reviewNotes,
            resolvedAt:
              nextReview === "APPROVED" || nextReview === "REJECTED" ? now : row.resolvedAt,
            resolvedBy:
              nextReview === "APPROVED" || nextReview === "REJECTED"
                ? principal.userId
                : row.resolvedBy,
            version: row.version + 1,
            updatedAt: now,
            updatedBy: principal.userId,
          })
          .where(
            and(
              eq(importDuplicateCandidates.id, row.id),
              eq(importDuplicateCandidates.tenantId, tenantId),
            ),
          )
          .returning();

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_duplicate_candidate",
          aggregateId: duplicateId,
          eventType,
          correlationId,
          actorUserId: principal.userId,
          payload: {
            duplicateId,
            jobId: row.jobId,
            reviewStatus: nextReview,
            resolvedAction: updated!.resolvedAction,
          },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: auditAction,
          resourceType: "import_duplicate_candidate",
          resourceId: duplicateId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId,
          requestId: principal.requestId,
          after: { reviewStatus: nextReview, resolvedAction: updated!.resolvedAction },
        });
        return this.mapDuplicate(updated!);
      },
      principal.userId,
    );
  }

  review(principal: ForgePrincipal, duplicateId: string, body: unknown, correlationId: string) {
    const data = reviewDuplicateSchema.parse(body ?? {});
    return this.transitionReview(
      principal,
      duplicateId,
      correlationId,
      "IN_REVIEW",
      "ImportDuplicateReviewed",
      DOMAIN_EVENT_TYPES.IMPORT_DUPLICATE_REVIEWED,
      undefined,
      data.notes,
    );
  }

  approve(principal: ForgePrincipal, duplicateId: string, body: unknown, correlationId: string) {
    const data = resolveDuplicateSchema.parse(body ?? { resolvedAction: "UPDATE" });
    return this.transitionReview(
      principal,
      duplicateId,
      correlationId,
      "APPROVED",
      "ImportDuplicateApproved",
      DOMAIN_EVENT_TYPES.IMPORT_DUPLICATE_APPROVED,
      data.resolvedAction,
      data.notes,
    );
  }

  reject(principal: ForgePrincipal, duplicateId: string, body: unknown, correlationId: string) {
    const data = reviewDuplicateSchema.parse(body ?? {});
    return this.transitionReview(
      principal,
      duplicateId,
      correlationId,
      "REJECTED",
      "ImportDuplicateRejected",
      DOMAIN_EVENT_TYPES.IMPORT_DUPLICATE_REJECTED,
      "REJECT",
      data.notes,
    );
  }

  async validateZip(principal: ForgePrincipal, body: unknown, correlationId: string) {
    const tenantId = this.requireTenant(principal);
    const data = validateZipSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await tx.query.importJobs.findFirst({
          where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, data.jobId)),
        });
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await tx.query.importFiles.findFirst({
          where: and(eq(importFiles.tenantId, tenantId), eq(importFiles.jobId, data.jobId)),
        });
        if (!file) throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
        if (file.uploadStatus !== "COMPLETED") {
          throw new ForgeError(
            "IMPORT_UPLOAD_INVALID",
            "Upload must be completed before ZIP validation.",
          );
        }

        const object = await this.s3.send(
          new GetObjectCommand({ Bucket: file.s3Bucket, Key: file.s3Key }),
        );
        const bytes = Buffer.from(await object.Body!.transformToByteArray());
        const result = validateZipMigrationBundle({ bytes });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_job",
          aggregateId: data.jobId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_ZIP_VALIDATED,
          correlationId,
          actorUserId: principal.userId,
          payload: {
            jobId: data.jobId,
            ok: result.ok,
            code: result.ok ? "OK" : result.code,
          },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportZipValidated",
          resourceType: "import_job",
          resourceId: data.jobId,
          result: result.ok ? "SUCCESS" : "FAILURE",
          riskLevel: "LOW",
          correlationId,
          requestId: principal.requestId,
          after: { ok: result.ok },
        });

        if (!result.ok) {
          throw new ForgeError(result.code as never, result.message);
        }
        return {
          jobId: data.jobId,
          ok: true,
          inventoryCount: result.inventory.length,
          verifiedChecksums: result.verifiedChecksums,
          manifestVersion: result.manifest.version,
          note: "ZIP validated only. Import execution is deferred to Sprint S5.",
        };
      },
      principal.userId,
    );
  }

  async validateApiSource(principal: ForgePrincipal, body: unknown, correlationId: string) {
    const tenantId = this.requireTenant(principal);
    const data = validateApiSourceSchema.parse(body);
    const result = validateApiImportSourceConfig(data.config);
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_api_source",
          aggregateId: createId(),
          eventType: DOMAIN_EVENT_TYPES.IMPORT_API_SOURCE_VALIDATED,
          correlationId,
          actorUserId: principal.userId,
          payload: { ok: result.ok },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportApiSourceValidated",
          resourceType: "import_api_source",
          resourceId: tenantId,
          result: result.ok ? "SUCCESS" : "FAILURE",
          riskLevel: "LOW",
          correlationId,
          requestId: principal.requestId,
          after: { ok: result.ok },
        });
      },
      principal.userId,
    );
    if (!result.ok) {
      throw new ForgeError("IMPORT_API_CONFIG_INVALID", result.message, {
        details: result.details ?? [],
      });
    }
    return {
      ok: true,
      config: result.normalized,
      note: "API source framework validated. Product integrations are out of scope for S4.",
    };
  }

  async patchProfileS4(
    principal: ForgePrincipal,
    profileId: string,
    body: unknown,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const patch = patchImportProfileS4Schema.parse(body) as PatchImportProfileS4Input;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const profile = await tx.query.importProfiles.findFirst({
          where: and(eq(importProfiles.tenantId, tenantId), eq(importProfiles.id, profileId)),
        });
        if (!profile || profile.archivedAt) {
          throw new ForgeError("IMPORT_PROFILE_NOT_FOUND", "The import profile was not found.");
        }
        const now = new Date();
        const nextVersion = profile.version + 1;
        const [updated] = await tx
          .update(importProfiles)
          .set({
            ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
            ...(patch.snapshot !== undefined ? { snapshotJson: patch.snapshot } : {}),
            ...(patch.duplicateRules !== undefined
              ? { duplicateRulesJson: patch.duplicateRules }
              : {}),
            ...(patch.zipMetadata !== undefined ? { zipMetadataJson: patch.zipMetadata } : {}),
            ...(patch.apiSourceMetadata !== undefined
              ? { apiSourceMetadataJson: patch.apiSourceMetadata }
              : {}),
            version: nextVersion,
            updatedAt: now,
            updatedBy: principal.userId,
          })
          .where(and(eq(importProfiles.id, profileId), eq(importProfiles.tenantId, tenantId)))
          .returning();

        await tx.insert(importProfileVersions).values({
          id: createId(),
          tenantId,
          profileId,
          versionNumber: nextVersion,
          snapshotJson: updated!.snapshotJson,
          duplicateRulesJson: updated!.duplicateRulesJson,
          zipMetadataJson: updated!.zipMetadataJson,
          apiSourceMetadataJson: updated!.apiSourceMetadataJson,
          changeSummary: patch.changeSummary ?? "profile update",
          correlationId,
          createdAt: now,
          createdBy: principal.userId,
        });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_profile",
          aggregateId: profileId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_PROFILE_UPDATED,
          correlationId,
          actorUserId: principal.userId,
          payload: { profileId, version: nextVersion },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportProfileUpdated",
          resourceType: "import_profile",
          resourceId: profileId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId,
          requestId: principal.requestId,
          after: { version: nextVersion },
        });

        return {
          id: updated!.id,
          profileKey: updated!.profileKey,
          displayName: updated!.displayName,
          snapshot: updated!.snapshotJson,
          duplicateRules: updated!.duplicateRulesJson,
          zipMetadata: updated!.zipMetadataJson,
          apiSourceMetadata: updated!.apiSourceMetadataJson,
          version: updated!.version,
          updatedAt: updated!.updatedAt.toISOString(),
        };
      },
      principal.userId,
    );
  }

  async listProfileVersions(principal: ForgePrincipal, profileId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const profile = await tx.query.importProfiles.findFirst({
          where: and(eq(importProfiles.tenantId, tenantId), eq(importProfiles.id, profileId)),
        });
        if (!profile) {
          throw new ForgeError("IMPORT_PROFILE_NOT_FOUND", "The import profile was not found.");
        }
        const rows = await tx
          .select()
          .from(importProfileVersions)
          .where(
            and(
              eq(importProfileVersions.tenantId, tenantId),
              eq(importProfileVersions.profileId, profileId),
            ),
          )
          .orderBy(desc(importProfileVersions.versionNumber));
        return {
          items: rows.map((r) => ({
            id: r.id,
            versionNumber: r.versionNumber,
            changeSummary: r.changeSummary,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.createdBy,
          })),
        };
      },
      principal.userId,
    );
  }
}
