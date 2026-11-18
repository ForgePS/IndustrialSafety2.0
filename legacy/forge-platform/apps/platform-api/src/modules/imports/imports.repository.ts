import { Injectable } from "@nestjs/common";
import {
  createId,
  importColumnMappings,
  importFiles,
  importJobs,
  importProfiles,
  platformModules,
  platformProducts,
  tenantModuleEntitlements,
  tenantProducts,
  type DatabaseTransaction,
} from "@forge/database";
import type {
  CreateImportJobInput,
  CreateImportProfileInput,
  InitImportUploadInput,
  ListJobsQuery,
  ListProfilesQuery,
  PatchImportJobInput,
  PatchImportProfileInput,
  PutMappingsInput,
} from "@forge/imports";
import { S2_INITIAL_JOB_STATUS, S3_INITIAL_UPLOAD_JOB_STATUS } from "@forge/imports";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  SQL,
  sql,
} from "drizzle-orm";

@Injectable()
export class ImportsRepository {
  async assertProductModuleEntitlement(
    tx: DatabaseTransaction,
    tenantId: string,
    productKey: string,
    moduleKey: string,
  ): Promise<void> {
    const rows = await tx
      .select({
        productStatus: tenantProducts.status,
        moduleStatus: tenantModuleEntitlements.status,
      })
      .from(tenantProducts)
      .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
      .innerJoin(platformModules, eq(platformModules.productId, platformProducts.id))
      .innerJoin(
        tenantModuleEntitlements,
        and(
          eq(tenantModuleEntitlements.tenantId, tenantId),
          eq(tenantModuleEntitlements.moduleId, platformModules.id),
        ),
      )
      .where(
        and(
          eq(tenantProducts.tenantId, tenantId),
          eq(platformProducts.code, productKey),
          eq(platformModules.code, moduleKey),
          eq(tenantProducts.status, "ACTIVE"),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row || row.moduleStatus !== "ACTIVE") {
      const error = new Error("Product/module entitlement required");
      (error as Error & { code: string }).code = "IMPORT_ENTITLEMENT_REQUIRED";
      throw error;
    }
  }

  async insertJob(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      correlationId: string;
      idempotencyKey?: string | null;
      data: CreateImportJobInput;
      profile?: typeof importProfiles.$inferSelect | null;
    },
  ) {
    const id = createId();
    const now = new Date();
    const [row] = await tx
      .insert(importJobs)
      .values({
        id,
        tenantId: input.tenantId,
        productCode: input.data.productKey,
        moduleCode: input.data.moduleKey,
        recordType: input.data.recordCategory,
        status: S2_INITIAL_JOB_STATUS,
        profileId: input.profile?.id ?? input.data.profileId ?? null,
        profileKey: input.profile?.profileKey ?? null,
        profileSnapshotJson: input.profile?.snapshotJson ?? {},
        format: input.data.sourceType === "manual" ? null : input.data.sourceType,
        displayName: input.data.displayName,
        description: input.data.description ?? null,
        sourceType: input.data.sourceType,
        requestedMode: input.data.requestedMode,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: input.correlationId,
        requestId: input.data.clientRequestId ?? null,
        currentStage: "CONTROL_PLANE",
        version: 1,
        createdAt: now,
        createdBy: input.userId,
        updatedAt: now,
        updatedBy: input.userId,
      })
      .returning();
    return row!;
  }

  async getJob(tx: DatabaseTransaction, tenantId: string, jobId: string) {
    return tx.query.importJobs.findFirst({
      where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)),
    });
  }

  async listJobs(tx: DatabaseTransaction, tenantId: string, query: ListJobsQuery) {
    const filters: SQL[] = [eq(importJobs.tenantId, tenantId)];
    if (query.search) {
      filters.push(ilike(importJobs.displayName, `%${query.search}%`));
    }
    if (query.status) {
      filters.push(sql`${importJobs.status} = ${query.status}`);
    }
    if (query.productKey) {
      filters.push(eq(importJobs.productCode, query.productKey));
    }
    if (query.moduleKey) {
      filters.push(eq(importJobs.moduleCode, query.moduleKey));
    }
    if (query.recordCategory) {
      filters.push(eq(importJobs.recordType, query.recordCategory));
    }
    if (query.createdBy) {
      filters.push(eq(importJobs.createdBy, query.createdBy));
    }
    if (query.createdFrom) {
      filters.push(gte(importJobs.createdAt, new Date(query.createdFrom)));
    }
    if (query.createdTo) {
      filters.push(lte(importJobs.createdAt, new Date(query.createdTo)));
    }

    const where = and(...filters);
    const sortColumn = {
      createdAt: importJobs.createdAt,
      updatedAt: importJobs.updatedAt,
      displayName: importJobs.displayName,
      status: importJobs.status,
    }[query.sort];
    const order = query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const [totalRow] = await tx.select({ value: count() }).from(importJobs).where(where);
    const rows = await tx
      .select()
      .from(importJobs)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return { rows, total: Number(totalRow?.value ?? 0) };
  }

  async updateJobMetadata(
    tx: DatabaseTransaction,
    job: typeof importJobs.$inferSelect,
    patch: PatchImportJobInput,
    userId: string,
  ) {
    const [row] = await tx
      .update(importJobs)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        version: job.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, job.tenantId)))
      .returning();
    return row!;
  }

  async updateJobStatus(
    tx: DatabaseTransaction,
    job: typeof importJobs.$inferSelect,
    status: (typeof importJobs.status.enumValues)[number],
    userId: string,
    extras: Partial<typeof importJobs.$inferInsert> = {},
  ) {
    const [row] = await tx
      .update(importJobs)
      .set({
        status,
        version: job.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
        ...extras,
      })
      .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, job.tenantId)))
      .returning();
    return row!;
  }

  async replaceMappings(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      jobId: string;
      profileId: string | null;
      correlationId: string;
      data: PutMappingsInput;
    },
  ) {
    await tx
      .delete(importColumnMappings)
      .where(
        and(
          eq(importColumnMappings.tenantId, input.tenantId),
          eq(importColumnMappings.jobId, input.jobId),
        ),
      );

    const now = new Date();
    const values = input.data.mappings.map((mapping, index) => ({
      id: createId(),
      tenantId: input.tenantId,
      jobId: input.jobId,
      profileId: input.profileId,
      sourceColumn: mapping.sourceColumn,
      targetField: mapping.targetField,
      transformJson: (mapping.transform ?? {}) as Record<string, unknown>,
      isRequired: mapping.isRequired ?? false,
      isSensitive: mapping.isSensitive ?? false,
      ordinal: mapping.ordinal ?? index,
      correlationId: input.correlationId,
      version: 1,
      createdAt: now,
      createdBy: input.userId,
      updatedAt: now,
      updatedBy: input.userId,
    }));

    return tx.insert(importColumnMappings).values(values).returning();
  }

  async listMappings(tx: DatabaseTransaction, tenantId: string, jobId: string) {
    return tx
      .select()
      .from(importColumnMappings)
      .where(
        and(eq(importColumnMappings.tenantId, tenantId), eq(importColumnMappings.jobId, jobId)),
      )
      .orderBy(asc(importColumnMappings.ordinal), asc(importColumnMappings.sourceColumn));
  }

  async deleteMapping(tx: DatabaseTransaction, tenantId: string, jobId: string, mappingId: string) {
    const [row] = await tx
      .delete(importColumnMappings)
      .where(
        and(
          eq(importColumnMappings.tenantId, tenantId),
          eq(importColumnMappings.jobId, jobId),
          eq(importColumnMappings.id, mappingId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async getProfile(tx: DatabaseTransaction, tenantId: string, profileId: string) {
    return tx.query.importProfiles.findFirst({
      where: and(eq(importProfiles.tenantId, tenantId), eq(importProfiles.id, profileId)),
    });
  }

  async insertProfile(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      correlationId: string;
      idempotencyKey?: string | null;
      data: CreateImportProfileInput;
    },
  ) {
    const id = createId();
    const now = new Date();
    const [row] = await tx
      .insert(importProfiles)
      .values({
        id,
        tenantId: input.tenantId,
        profileKey: input.data.profileKey,
        displayName: input.data.displayName,
        productCode: input.data.productKey,
        moduleCode: input.data.moduleKey,
        recordType: input.data.recordCategory,
        sourceType: input.data.sourceType,
        snapshotJson: input.data.snapshot ?? {},
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
        version: 1,
        createdAt: now,
        createdBy: input.userId,
        updatedAt: now,
        updatedBy: input.userId,
      })
      .returning();
    return row!;
  }

  async listProfiles(tx: DatabaseTransaction, tenantId: string, query: ListProfilesQuery) {
    const filters: SQL[] = [
      eq(importProfiles.tenantId, tenantId),
      eq(importProfiles.isSnapshot, false),
    ];
    if (query.search) {
      filters.push(ilike(importProfiles.displayName, `%${query.search}%`));
    }
    if (query.productKey) {
      filters.push(eq(importProfiles.productCode, query.productKey));
    }
    if (query.moduleKey) {
      filters.push(eq(importProfiles.moduleCode, query.moduleKey));
    }
    if (query.recordCategory) {
      filters.push(eq(importProfiles.recordType, query.recordCategory));
    }
    if (query.archived === "false") {
      filters.push(isNull(importProfiles.archivedAt));
    } else if (query.archived === "true") {
      filters.push(isNotNull(importProfiles.archivedAt));
    }

    const where = and(...filters);
    const sortColumn = {
      createdAt: importProfiles.createdAt,
      updatedAt: importProfiles.updatedAt,
      displayName: importProfiles.displayName,
    }[query.sort];
    const order = query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
    const [totalRow] = await tx.select({ value: count() }).from(importProfiles).where(where);
    const rows = await tx
      .select()
      .from(importProfiles)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return { rows, total: Number(totalRow?.value ?? 0) };
  }

  async updateProfile(
    tx: DatabaseTransaction,
    profile: typeof importProfiles.$inferSelect,
    patch: PatchImportProfileInput,
    userId: string,
  ) {
    const [row] = await tx
      .update(importProfiles)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.snapshot !== undefined ? { snapshotJson: patch.snapshot } : {}),
        version: profile.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(and(eq(importProfiles.id, profile.id), eq(importProfiles.tenantId, profile.tenantId)))
      .returning();
    return row!;
  }

  async archiveProfile(
    tx: DatabaseTransaction,
    profile: typeof importProfiles.$inferSelect,
    userId: string,
  ) {
    const [row] = await tx
      .update(importProfiles)
      .set({
        archivedAt: new Date(),
        archivedBy: userId,
        version: profile.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(and(eq(importProfiles.id, profile.id), eq(importProfiles.tenantId, profile.tenantId)))
      .returning();
    return row!;
  }

  async restoreProfile(
    tx: DatabaseTransaction,
    profile: typeof importProfiles.$inferSelect,
    userId: string,
  ) {
    const [row] = await tx
      .update(importProfiles)
      .set({
        archivedAt: null,
        archivedBy: null,
        version: profile.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(and(eq(importProfiles.id, profile.id), eq(importProfiles.tenantId, profile.tenantId)))
      .returning();
    return row!;
  }

  async countMappings(tx: DatabaseTransaction, tenantId: string, jobId: string) {
    const [row] = await tx
      .select({ value: count() })
      .from(importColumnMappings)
      .where(
        and(eq(importColumnMappings.tenantId, tenantId), eq(importColumnMappings.jobId, jobId)),
      );
    return Number(row?.value ?? 0);
  }

  async insertUploadJob(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      correlationId: string;
      idempotencyKey?: string | null;
      data: InitImportUploadInput;
      profile?: typeof importProfiles.$inferSelect | null;
      profileSnapshot: Record<string, unknown>;
      format: string;
    },
  ) {
    const id = createId();
    const now = new Date();
    const [row] = await tx
      .insert(importJobs)
      .values({
        id,
        tenantId: input.tenantId,
        productCode: input.data.productKey,
        moduleCode: input.data.moduleKey,
        recordType: input.data.recordCategory,
        status: S3_INITIAL_UPLOAD_JOB_STATUS,
        profileId: input.profile?.id ?? input.data.profileId ?? null,
        profileKey: input.profile?.profileKey ?? null,
        profileSnapshotJson: input.profileSnapshot,
        format: input.format,
        displayName: input.data.displayName,
        description: input.data.description ?? null,
        sourceType: input.format,
        requestedMode: input.data.requestedMode,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: input.correlationId,
        requestId: input.data.clientRequestId ?? null,
        currentStage: "UPLOAD",
        progressPercent: 0,
        version: 1,
        createdAt: now,
        createdBy: input.userId,
        updatedAt: now,
        updatedBy: input.userId,
      })
      .returning();
    return row!;
  }

  async insertFile(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      jobId: string;
      correlationId: string;
      idempotencyKey?: string | null;
      fileName: string;
      storedFileName: string;
      contentType: string;
      format: string;
      byteSize: number;
      clientChecksumSha256?: string | null;
      s3Bucket: string;
      s3Key: string;
      multipartUploadId?: string | null;
    },
  ) {
    const id = createId();
    const now = new Date();
    const [row] = await tx
      .insert(importFiles)
      .values({
        id,
        tenantId: input.tenantId,
        jobId: input.jobId,
        fileName: input.fileName,
        storedFileName: input.storedFileName,
        contentType: input.contentType,
        format: input.format,
        byteSize: input.byteSize,
        clientChecksumSha256: input.clientChecksumSha256 ?? null,
        s3Bucket: input.s3Bucket,
        s3Key: input.s3Key,
        scanStatus: "PENDING",
        uploadStatus: "INITIALIZED",
        validationStatus: "PENDING",
        encryptionStatus: "SSE_KMS",
        multipartUploadId: input.multipartUploadId ?? null,
        uploadProgressPercent: 0,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: input.correlationId,
        version: 1,
        createdAt: now,
        createdBy: input.userId,
        updatedAt: now,
        updatedBy: input.userId,
      })
      .returning();
    return row!;
  }

  async getFileForJob(tx: DatabaseTransaction, tenantId: string, jobId: string) {
    return tx.query.importFiles.findFirst({
      where: and(
        eq(importFiles.tenantId, tenantId),
        eq(importFiles.jobId, jobId),
        isNull(importFiles.archivedAt),
      ),
    });
  }

  async getFileById(tx: DatabaseTransaction, tenantId: string, fileId: string) {
    return tx.query.importFiles.findFirst({
      where: and(eq(importFiles.tenantId, tenantId), eq(importFiles.id, fileId)),
    });
  }

  async findCompletedByContentHash(tx: DatabaseTransaction, tenantId: string, contentHash: string) {
    return tx.query.importFiles.findFirst({
      where: and(
        eq(importFiles.tenantId, tenantId),
        eq(importFiles.contentHash, contentHash),
        eq(importFiles.uploadStatus, "COMPLETED"),
        isNull(importFiles.archivedAt),
      ),
    });
  }

  async updateFile(
    tx: DatabaseTransaction,
    file: typeof importFiles.$inferSelect,
    patch: Partial<typeof importFiles.$inferInsert>,
    userId: string,
  ) {
    const [row] = await tx
      .update(importFiles)
      .set({
        ...patch,
        version: file.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(and(eq(importFiles.id, file.id), eq(importFiles.tenantId, file.tenantId)))
      .returning();
    return row!;
  }
}
