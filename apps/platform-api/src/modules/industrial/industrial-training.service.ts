import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  createId,
  forgeDocuments,
  industrialPersonnel,
  industrialTrainingAttempts,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingCompletions,
  industrialTrainingGroups,
  industrialTrainingMaterials,
  industrialTrainingQuestions,
  industrialTrainingQuizzes,
  industrialTrainingRecords,
  industrialTrainingSourceFolders,
  industrialTrainingSourceGroups,
  industrialTrainingSources,
  industrialTrainingUserStats,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import { IndustrialTrainingAssignmentsService } from "./industrial-training-assignments.service.js";
import { IndustrialTrainingVideoNormalizeService } from "./industrial-training-video-normalize.service.js";
import {
  flattenImportQuestions,
  parseQuestionImportCsv,
  parseQuestionImportText,
  parseQuestionImportXlsx,
  type QuestionImportPayload,
} from "./training-question-import.js";
import { decodeTextBuffer, sanitizeTrainingImportText } from "./training-import-text.js";
import { findPersonnelByEmployeeNumber } from "./employee-number.js";
import { canDeleteForms } from "./form-signatory.js";
import {
  isAllowedTrainingMaterialMime,
  isTrainingVideoFile,
  resolveTrainingVideoPlaybackMime,
  trainingMaterialCategoryForMime,
} from "./training-materials.mime.js";
import {
  normalizeTrainingMaterialTopic,
  resolveMaterialTopic,
} from "./training-material-topics.js";
import { buildPaperQuizPrintableHtml } from "./training-paper-quiz.js";
import { buildOfficeMaterialViewUrl, issueOfficeViewToken } from "./office-view-token.js";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
import { unwrapJsonRecord } from "./form-print.js";

type ListQuery = Record<string, string | undefined>;

async function parsePdfBuffer(buffer: Buffer): Promise<{ text?: string }> {
  const { default: pdfParse } = await import("pdf-parse");
  return pdfParse(buffer);
}

type AnswerRow = {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
  answeredAt: string;
};

const MAX_MATERIAL_BYTES = 500_000_000;

function pageParams(query: ListQuery) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function letterGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function materialsObjectKeyPrefix(tenantId: string): string {
  return `tenants/${tenantId}/training-materials/`;
}

function canStreamInline(mimeType: string, filename?: string | null): boolean {
  const mime = mimeType.toLowerCase();
  return (
    mime === "application/pdf" ||
    mime.startsWith("video/") ||
    mime.startsWith("image/") ||
    isTrainingVideoFile({ mimeType, filename })
  );
}

function isPresentationMimeType(mimeType: string, filename?: string | null): boolean {
  const mime = mimeType.toLowerCase();
  const name = (filename ?? "").toLowerCase();
  return (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    name.endsWith(".ppt") ||
    name.endsWith(".pptx")
  );
}

@Injectable()
export class IndustrialTrainingService {
  private readonly logger = new Logger(IndustrialTrainingService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
    private readonly assignments: IndustrialTrainingAssignmentsService,
    private readonly videoNormalize: IndustrialTrainingVideoNormalizeService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  // ─── Completion records (migrated) ───────────────────────────────────────

  async listRecordCourseNames(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select distinct trim(coalesce(nullif(course_name, ''), nullif(title, ''))) as course_name
        from industrial_training_records
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
          and trim(coalesce(nullif(course_name, ''), nullif(title, ''))) <> ''
        order by 1
        limit 2000
      `);
      const list = (
        Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
      ) as Array<{
        course_name?: string | null;
      }>;
      return list.map((row) => String(row.course_name ?? "").trim()).filter(Boolean);
    });
  }

  async listRecords(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [
        eq(industrialTrainingRecords.tenantId, tenantId),
        isNull(industrialTrainingRecords.archivedAt),
      ];
      if (query.status) conds.push(eq(industrialTrainingRecords.status, query.status));
      const courseExact = String(query.course ?? query.courseName ?? "").trim();
      if (courseExact) {
        conds.push(
          sql`lower(trim(coalesce(nullif(${industrialTrainingRecords.courseName}, ''), nullif(${industrialTrainingRecords.title}, '')))) = lower(${courseExact})`,
        );
      } else if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(
          sql`(lower(coalesce(${industrialTrainingRecords.title}, '')) like ${q} or lower(coalesce(${industrialTrainingRecords.courseName}, '')) like ${q})`,
        );
      }
      const where = and(...conds);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialTrainingRecords)
        .where(where);
      const rows = await tx
        .select({
          record: industrialTrainingRecords,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          personnelArchivedAt: industrialPersonnel.archivedAt,
        })
        .from(industrialTrainingRecords)
        .leftJoin(
          industrialPersonnel,
          eq(industrialTrainingRecords.personnelId, industrialPersonnel.id),
        )
        .where(where)
        .orderBy(
          desc(industrialTrainingRecords.completedAt),
          desc(industrialTrainingRecords.updatedAt),
        )
        .limit(pageSize)
        .offset(offset);
      const items = rows.map(({ record: r, displayName, employeeNumber, personnelArchivedAt }) => {
        const payload = (r.sourcePayload as Record<string, unknown>) ?? {};
        const percent =
          typeof payload.percent === "number"
            ? payload.percent
            : typeof payload.scorePercent === "number"
              ? payload.scorePercent
              : null;
        const attemptNumber =
          typeof payload.attemptNumber === "number" ? payload.attemptNumber : null;
        const result =
          typeof payload.result === "string"
            ? payload.result
            : percent != null
              ? "PASSED"
              : r.completedAt ||
                  Boolean(payload.completionCode) ||
                  r.sourceCollection === "training_database_xlsx" ||
                  r.sourceCollection === "manual_entry"
                ? "COMPLETED"
                : r.status;
        return {
          id: r.id,
          title: r.title ?? r.courseName ?? "Training record",
          courseCode: payload.courseCode ?? null,
          instructorName: payload.instructorName ?? null,
          notes: payload.notes ?? null,
          courseName: r.courseName,
          status: r.status,
          result,
          scorePercent: percent,
          attemptNumber,
          completedAt: r.completedAt,
          expiresAt: r.expiresAt,
          updatedAt: r.updatedAt,
          personnelId: r.personnelId,
          displayName: displayName ?? null,
          employeeNumber: employeeNumber ?? null,
          personnelArchived: Boolean(personnelArchivedAt),
          sourceCollection: r.sourceCollection ?? null,
        };
      });
      return { items, page, pageSize, total: Number(countRow?.count ?? items.length) };
    });
  }

  async createRecord(
    principal: ForgePrincipal,
    body: {
      title?: string;
      courseCode?: string;
      instructorName?: string;
      notes?: string;
      personnelId?: string;
      employeeNumber?: string;
      completedAt?: string;
      expiresAt?: string;
      result?: string;
      scorePercent?: number | null;
      attemptNumber?: number | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    const result =
      String(body.result ?? "COMPLETED")
        .trim()
        .toUpperCase() || "COMPLETED";
    const scoreRaw = body.scorePercent;
    const scorePercent =
      scoreRaw == null || (typeof scoreRaw === "string" && !String(scoreRaw).trim())
        ? null
        : Number(scoreRaw);
    if (
      scorePercent != null &&
      (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100)
    ) {
      throw new ForgeError("VALIDATION_FAILED", "scorePercent must be between 0 and 100");
    }
    const attemptRaw = body.attemptNumber;
    const attemptNumber =
      attemptRaw == null || (typeof attemptRaw === "string" && !String(attemptRaw).trim())
        ? null
        : Number(attemptRaw);
    if (
      attemptNumber != null &&
      (!Number.isFinite(attemptNumber) || !Number.isInteger(attemptNumber) || attemptNumber < 1)
    ) {
      throw new ForgeError("VALIDATION_FAILED", "attemptNumber must be a positive integer");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const personnelId = await this.resolveRecordPersonnelId(tx, tenantId, body);
      const person = personnelId
        ? await tx.query.industrialPersonnel.findFirst({
            where: and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, tenantId),
            ),
          })
        : null;
      const employeeNumber = person?.employeeNumber?.trim() || body.employeeNumber?.trim() || null;
      const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
      if (Number.isNaN(completedAt.getTime())) {
        throw new ForgeError("VALIDATION_FAILED", "completedAt is invalid");
      }
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new ForgeError("VALIDATION_FAILED", "expiresAt is invalid");
      }
      const now = new Date();
      const id = createId();
      const courseCode = String(body.courseCode ?? "").trim() || null;
      const instructorName = String(body.instructorName ?? "").trim() || null;
      const notes = String(body.notes ?? "").trim() || null;
      const [row] = await tx
        .insert(industrialTrainingRecords)
        .values({
          id,
          tenantId,
          title,
          courseName: title,
          status: "ACTIVE",
          completedAt,
          expiresAt,
          personnelId,
          sourceSystem: "FORGE",
          sourceCollection: "manual_entry",
          sourceDocumentId: id,
          sourcePayload: {
            result,
            scorePercent,
            percent: scorePercent,
            attemptNumber,
            courseCode,
            instructorName,
            notes,
            personnelId,
            employeeNumber,
            courseName: title,
            manuallyCreated: true,
            createdByUserId: principal.userId ?? null,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async updateRecord(
    principal: ForgePrincipal,
    recordId: string,
    body: {
      title?: string;
      courseCode?: string;
      instructorName?: string;
      notes?: string;
      personnelId?: string | null;
      employeeNumber?: string | null;
      completedAt?: string | null;
      expiresAt?: string | null;
      status?: string;
      result?: string;
      scorePercent?: number | null;
      attemptNumber?: number | null;
    },
  ) {
    this.assertCanEditOrDeleteTrainingRecords(principal);
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingRecords.findFirst({
        where: and(
          eq(industrialTrainingRecords.id, recordId),
          eq(industrialTrainingRecords.tenantId, tenantId),
          isNull(industrialTrainingRecords.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Training record not found");

      const now = new Date();
      const patch: Record<string, unknown> = { updatedAt: now };
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
        patch.title = title;
        patch.courseName = title;
      }
      if (body.status !== undefined) patch.status = String(body.status).trim() || existing.status;
      if (body.completedAt !== undefined) {
        const completedAt = body.completedAt ? new Date(body.completedAt) : null;
        if (completedAt && Number.isNaN(completedAt.getTime())) {
          throw new ForgeError("VALIDATION_FAILED", "completedAt is invalid");
        }
        patch.completedAt = completedAt;
      }
      if (body.expiresAt !== undefined) {
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
          throw new ForgeError("VALIDATION_FAILED", "expiresAt is invalid");
        }
        patch.expiresAt = expiresAt;
      }

      let scorePercent: number | null | undefined;
      if (body.scorePercent !== undefined) {
        const scoreRaw = body.scorePercent;
        scorePercent =
          scoreRaw == null || (typeof scoreRaw === "string" && !String(scoreRaw).trim())
            ? null
            : Number(scoreRaw);
        if (
          scorePercent != null &&
          (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100)
        ) {
          throw new ForgeError("VALIDATION_FAILED", "scorePercent must be between 0 and 100");
        }
      }

      let attemptNumber: number | null | undefined;
      if (body.attemptNumber !== undefined) {
        const attemptRaw = body.attemptNumber;
        attemptNumber =
          attemptRaw == null || (typeof attemptRaw === "string" && !String(attemptRaw).trim())
            ? null
            : Number(attemptRaw);
        if (
          attemptNumber != null &&
          (!Number.isFinite(attemptNumber) || !Number.isInteger(attemptNumber) || attemptNumber < 1)
        ) {
          throw new ForgeError("VALIDATION_FAILED", "attemptNumber must be a positive integer");
        }
      }

      const result =
        body.result !== undefined
          ? String(body.result ?? "")
              .trim()
              .toUpperCase() || "COMPLETED"
          : undefined;

      let personnelId = existing.personnelId;
      if (body.personnelId !== undefined || body.employeeNumber !== undefined) {
        if (body.personnelId === null && !body.employeeNumber) {
          personnelId = null;
        } else {
          const resolveBody: { personnelId?: string; employeeNumber?: string } = {};
          if (typeof body.personnelId === "string" && body.personnelId.trim()) {
            resolveBody.personnelId = body.personnelId.trim();
          }
          if (typeof body.employeeNumber === "string" && body.employeeNumber.trim()) {
            resolveBody.employeeNumber = body.employeeNumber.trim();
          }
          personnelId = await this.resolveRecordPersonnelId(tx, tenantId, resolveBody);
        }
        patch.personnelId = personnelId;
      }

      const person = personnelId
        ? await tx.query.industrialPersonnel.findFirst({
            where: and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, tenantId),
              isNull(industrialPersonnel.archivedAt),
            ),
          })
        : null;
      const existingPayload = (existing.sourcePayload as Record<string, unknown>) ?? {};
      const payload: Record<string, unknown> = {
        ...existingPayload,
        ...(body.courseCode !== undefined
          ? { courseCode: String(body.courseCode ?? "").trim() || null }
          : {}),
        ...(body.instructorName !== undefined
          ? { instructorName: String(body.instructorName ?? "").trim() || null }
          : {}),
        ...(body.notes !== undefined ? { notes: String(body.notes ?? "").trim() || null } : {}),
        ...(result !== undefined ? { result } : {}),
        ...(scorePercent !== undefined ? { scorePercent, percent: scorePercent } : {}),
        ...(attemptNumber !== undefined ? { attemptNumber } : {}),
        personnelId,
        employeeNumber:
          person?.employeeNumber?.trim() ||
          (typeof body.employeeNumber === "string" ? body.employeeNumber.trim() : "") ||
          existingPayload.employeeNumber ||
          null,
        lastEditedByUserId: principal.userId ?? null,
        lastEditedAt: now.toISOString(),
      };
      if (body.title !== undefined) {
        payload.courseName = patch.title;
      }
      patch.sourcePayload = payload;

      const [row] = await tx
        .update(industrialTrainingRecords)
        .set(patch)
        .where(eq(industrialTrainingRecords.id, recordId))
        .returning();
      return row;
    });
  }

  async archiveRecord(principal: ForgePrincipal, recordId: string) {
    this.assertCanEditOrDeleteTrainingRecords(principal);
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingRecords.findFirst({
        where: and(
          eq(industrialTrainingRecords.id, recordId),
          eq(industrialTrainingRecords.tenantId, tenantId),
          isNull(industrialTrainingRecords.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Training record not found");

      const now = new Date();
      const existingPayload = (existing.sourcePayload as Record<string, unknown>) ?? {};
      const [row] = await tx
        .update(industrialTrainingRecords)
        .set({
          archivedAt: now,
          status: "ARCHIVED",
          updatedAt: now,
          sourcePayload: {
            ...existingPayload,
            archivedByUserId: principal.userId ?? null,
            archivedAt: now.toISOString(),
          },
        })
        .where(eq(industrialTrainingRecords.id, recordId))
        .returning();
      return { id: row?.id ?? recordId, status: "ARCHIVED" as const };
    });
  }

  private assertCanEditOrDeleteTrainingRecords(principal: ForgePrincipal) {
    if (principal.isPlatformAdmin) return;
    if (
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin")
    ) {
      return;
    }
    throw new ForgeError(
      "FORBIDDEN",
      "Training manage permission is required to edit or delete training history records.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveRecordPersonnelId(
    tx: any,
    tenantId: string,
    body: { personnelId?: string; employeeNumber?: string },
  ) {
    const personnelId = body.personnelId?.trim();
    if (personnelId) {
      const person = await tx.query.industrialPersonnel.findFirst({
        where: and(
          eq(industrialPersonnel.id, personnelId),
          eq(industrialPersonnel.tenantId, tenantId),
        ),
      });
      if (!person) throw new ForgeError("VALIDATION_FAILED", "Personnel not found");
      return person.id;
    }
    const employeeNumber = body.employeeNumber?.trim();
    if (employeeNumber) {
      const person = await findPersonnelByEmployeeNumber(tx, tenantId, employeeNumber);
      if (!person)
        throw new ForgeError("VALIDATION_FAILED", `Employee number not found: ${employeeNumber}`);
      return person.id;
    }
    return null;
  }

  // ─── Sources / questions ───────────────────────────────────────────────────

  private normalizeGroupIds(raw: unknown): string[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
      throw new ForgeError("VALIDATION_FAILED", "groupIds must be an array");
    }
    return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
  }

  private async replaceSourceGroups(
    tx: DatabaseTransaction,
    tenantId: string,
    sourceId: string,
    groupIds: string[],
  ) {
    if (groupIds.length) {
      const found = await tx
        .select({ id: industrialTrainingGroups.id })
        .from(industrialTrainingGroups)
        .where(
          and(
            eq(industrialTrainingGroups.tenantId, tenantId),
            inArray(industrialTrainingGroups.id, groupIds),
            isNull(industrialTrainingGroups.archivedAt),
          ),
        );
      if (found.length !== groupIds.length) {
        throw new ForgeError("VALIDATION_FAILED", "One or more training groups were not found");
      }
    }
    await tx
      .delete(industrialTrainingSourceGroups)
      .where(
        and(
          eq(industrialTrainingSourceGroups.tenantId, tenantId),
          eq(industrialTrainingSourceGroups.sourceId, sourceId),
        ),
      );
    if (!groupIds.length) return;
    const now = new Date();
    await tx.insert(industrialTrainingSourceGroups).values(
      groupIds.map((groupId) => ({
        id: createId(),
        tenantId,
        sourceId,
        groupId,
        createdAt: now,
      })),
    );
  }

  private async attachGroupsToSources<T extends { id: string }>(
    tx: DatabaseTransaction,
    tenantId: string,
    items: T[],
  ): Promise<Array<T & { groupIds: string[]; groupNames: string[] }>> {
    if (!items.length) return [];
    const links = await tx
      .select({
        sourceId: industrialTrainingSourceGroups.sourceId,
        groupId: industrialTrainingSourceGroups.groupId,
        groupName: industrialTrainingGroups.name,
      })
      .from(industrialTrainingSourceGroups)
      .innerJoin(
        industrialTrainingGroups,
        eq(industrialTrainingSourceGroups.groupId, industrialTrainingGroups.id),
      )
      .where(
        and(
          eq(industrialTrainingSourceGroups.tenantId, tenantId),
          inArray(
            industrialTrainingSourceGroups.sourceId,
            items.map((item) => item.id),
          ),
          isNull(industrialTrainingGroups.archivedAt),
        ),
      )
      .orderBy(asc(industrialTrainingGroups.name));
    const bySource = new Map<string, { groupIds: string[]; groupNames: string[] }>();
    for (const link of links) {
      const bucket = bySource.get(link.sourceId) ?? { groupIds: [], groupNames: [] };
      bucket.groupIds.push(link.groupId);
      bucket.groupNames.push(link.groupName);
      bySource.set(link.sourceId, bucket);
    }
    return items.map((item) => {
      const groups = bySource.get(item.id) ?? { groupIds: [], groupNames: [] };
      return { ...item, groupIds: groups.groupIds, groupNames: groups.groupNames };
    });
  }

  async listSources(
    principal: ForgePrincipal,
    query: ListQuery,
    opts?: { publishedOnly?: boolean },
  ) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const publishedOnly = opts?.publishedOnly === true;
    const filterGroupId = query.groupId?.trim() || "";
    const archivedMode = String(query.archived ?? "")
      .trim()
      .toLowerCase();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [eq(industrialTrainingSources.tenantId, tenantId)];
      if (archivedMode === "true" || archivedMode === "1" || archivedMode === "only") {
        conds.push(isNotNull(industrialTrainingSources.archivedAt));
      } else if (archivedMode === "all") {
        // include active + archived
      } else {
        conds.push(isNull(industrialTrainingSources.archivedAt));
      }
      if (publishedOnly) conds.push(eq(industrialTrainingSources.status, "PUBLISHED"));
      else if (query.status) conds.push(eq(industrialTrainingSources.status, query.status));
      if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(sql`lower(${industrialTrainingSources.title}) like ${q}`);
      }
      if (filterGroupId) {
        const linked = await tx
          .select({ sourceId: industrialTrainingSourceGroups.sourceId })
          .from(industrialTrainingSourceGroups)
          .where(
            and(
              eq(industrialTrainingSourceGroups.tenantId, tenantId),
              eq(industrialTrainingSourceGroups.groupId, filterGroupId),
            ),
          );
        const linkedIds = [...new Set(linked.map((row) => row.sourceId))];
        if (!linkedIds.length) return { items: [], page, pageSize };
        conds.push(inArray(industrialTrainingSources.id, linkedIds));
      }
      const items = await tx
        .select()
        .from(industrialTrainingSources)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingSources.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const enriched = await this.attachGroupsToSources(tx, tenantId, items);
      return { items: enriched, page, pageSize };
    });
  }

  async getSource(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Training source not found");
      const enrichedRows = await this.attachGroupsToSources(tx, tenantId, [row]);
      const enriched = enrichedRows[0];
      if (!enriched) throw new ForgeError("INTERNAL_ERROR", "Failed to load training source");
      return enriched;
    });
  }

  async createSource(
    principal: ForgePrincipal,
    body: { title?: string; edition?: string; description?: string; groupIds?: string[] },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    const groupIds = this.normalizeGroupIds(body.groupIds) ?? [];
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const inserted = await tx
        .insert(industrialTrainingSources)
        .values({
          id: createId(),
          tenantId,
          title,
          edition: body.edition?.trim() || null,
          description: body.description?.trim() || null,
          status: "DRAFT",
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create training source");
      await this.replaceSourceGroups(tx, tenantId, row.id, groupIds);
      const enrichedRows = await this.attachGroupsToSources(tx, tenantId, [row]);
      const enriched = enrichedRows[0];
      if (!enriched) throw new ForgeError("INTERNAL_ERROR", "Failed to load training source");
      return enriched;
    });
  }

  async updateSource(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      title?: string;
      edition?: string;
      description?: string;
      status?: string;
      groupIds?: string[];
    },
  ) {
    const tenantId = this.tenant(principal);
    const status = body.status?.trim().toUpperCase();
    if (status === "ARCHIVED") {
      return this.archiveSource(principal, sourceId);
    }
    const groupIds = this.normalizeGroupIds(body.groupIds);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Training source not found");
      if (status && status !== "DRAFT" && status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "status must be DRAFT or PUBLISHED");
      }
      const now = new Date();
      const updated = await tx
        .update(industrialTrainingSources)
        .set({
          title: body.title?.trim() || existing.title,
          edition: body.edition !== undefined ? body.edition?.trim() || null : existing.edition,
          description:
            body.description !== undefined
              ? body.description?.trim() || null
              : existing.description,
          status: status || existing.status,
          publishedAt:
            status === "PUBLISHED" ? now : status === "DRAFT" ? null : existing.publishedAt,
          updatedAt: now,
        })
        .where(eq(industrialTrainingSources.id, sourceId))
        .returning();
      const row = updated[0];
      if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to update training source");
      if (groupIds !== undefined) {
        await this.replaceSourceGroups(tx, tenantId, sourceId, groupIds);
      }
      const enrichedRows = await this.attachGroupsToSources(tx, tenantId, [row]);
      const enriched = enrichedRows[0];
      if (!enriched) throw new ForgeError("INTERNAL_ERROR", "Failed to load training source");
      return enriched;
    });
  }

  async archiveSource(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Training source not found");

      const now = new Date();
      // Soft-archive open assignments so the course leaves active training queues.
      // Keep materials/folders linked so the course can be restored later.
      await tx
        .update(industrialTrainingAssignments)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(
            eq(industrialTrainingAssignments.sourceId, sourceId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        );
      const [row] = await tx
        .update(industrialTrainingSources)
        .set({
          archivedAt: now,
          status: "ARCHIVED",
          publishedAt: null,
          updatedAt: now,
        })
        .where(eq(industrialTrainingSources.id, sourceId))
        .returning();
      return { id: row!.id, status: row!.status };
    });
  }

  async restoreSource(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNotNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Archived training source not found");

      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingSources)
        .set({
          archivedAt: null,
          status: "DRAFT",
          publishedAt: null,
          updatedAt: now,
        })
        .where(eq(industrialTrainingSources.id, sourceId))
        .returning();
      const enrichedRows = await this.attachGroupsToSources(tx, tenantId, [row!]);
      const enriched = enrichedRows[0];
      if (!enriched) throw new ForgeError("INTERNAL_ERROR", "Failed to load restored course");
      return enriched;
    });
  }

  /**
   * Permanently remove an archived course. Admin / Creator only.
   * Cascades LMS quiz/assignment history for that course; materials are unlinked (kept).
   */
  async purgeSource(principal: ForgePrincipal, sourceId: string) {
    this.assertCanPurgeTrainingSources(principal);
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNotNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!existing) {
        throw new ForgeError(
          "NOT_FOUND",
          "Archived training source not found. Archive the course before permanently deleting it.",
        );
      }

      const assignmentRows = await tx
        .select({ id: industrialTrainingAssignments.id })
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            eq(industrialTrainingAssignments.sourceId, sourceId),
          ),
        );
      const assignmentIds = assignmentRows.map((row) => row.id);

      // Completions hold a non-cascading FK to sources; remove them first.
      await tx
        .delete(industrialTrainingCompletions)
        .where(
          and(
            eq(industrialTrainingCompletions.tenantId, tenantId),
            eq(industrialTrainingCompletions.sourceId, sourceId),
          ),
        );

      // Attempts / quizzes also lack ON DELETE CASCADE from sources.
      await tx
        .delete(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.sourceId, sourceId),
          ),
        );
      await tx
        .delete(industrialTrainingQuizzes)
        .where(
          and(
            eq(industrialTrainingQuizzes.tenantId, tenantId),
            eq(industrialTrainingQuizzes.sourceId, sourceId),
          ),
        );

      if (assignmentIds.length) {
        await tx
          .delete(industrialTrainingAssignments)
          .where(
            and(
              eq(industrialTrainingAssignments.tenantId, tenantId),
              inArray(industrialTrainingAssignments.id, assignmentIds),
            ),
          );
      }

      // Keep material files; just unlink from the course (FK set null also covers folders).
      await tx
        .update(industrialTrainingMaterials)
        .set({ sourceId: null, folderId: null, updatedAt: new Date() })
        .where(
          and(
            eq(industrialTrainingMaterials.tenantId, tenantId),
            eq(industrialTrainingMaterials.sourceId, sourceId),
          ),
        );

      await tx
        .delete(industrialTrainingSources)
        .where(
          and(
            eq(industrialTrainingSources.id, sourceId),
            eq(industrialTrainingSources.tenantId, tenantId),
          ),
        );

      return { id: sourceId, status: "DELETED" as const };
    });
  }

  private assertCanPurgeTrainingSources(principal: ForgePrincipal) {
    if (
      canDeleteForms({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      return;
    }
    throw new ForgeError(
      "FORBIDDEN",
      "Only a Tenant Admin or Creator can permanently delete training courses.",
    );
  }

  // ─── Sources / questions ─────────────────────────────────────────────────

  async listSourceFolders(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      return tx
        .select()
        .from(industrialTrainingSourceFolders)
        .where(
          and(
            eq(industrialTrainingSourceFolders.tenantId, tenantId),
            eq(industrialTrainingSourceFolders.sourceId, sourceId),
            isNull(industrialTrainingSourceFolders.archivedAt),
          ),
        )
        .orderBy(
          asc(industrialTrainingSourceFolders.sortOrder),
          asc(industrialTrainingSourceFolders.createdAt),
        );
    });
  }

  async createSourceFolder(
    principal: ForgePrincipal,
    sourceId: string,
    body: { name?: string; sortOrder?: number },
  ) {
    const tenantId = this.tenant(principal);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingSourceFolders)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          name,
          sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async updateSourceFolder(
    principal: ForgePrincipal,
    folderId: string,
    body: { name?: string; sortOrder?: number; status?: string },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSourceFolders.findFirst({
        where: and(
          eq(industrialTrainingSourceFolders.id, folderId),
          eq(industrialTrainingSourceFolders.tenantId, tenantId),
          isNull(industrialTrainingSourceFolders.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Folder not found");
      const now = new Date();
      const status = body.status?.trim().toUpperCase();
      if (status === "ARCHIVED") {
        await tx
          .update(industrialTrainingMaterials)
          .set({ folderId: null, updatedAt: now })
          .where(
            and(
              eq(industrialTrainingMaterials.folderId, folderId),
              eq(industrialTrainingMaterials.tenantId, tenantId),
              isNull(industrialTrainingMaterials.archivedAt),
            ),
          );
      }
      const [row] = await tx
        .update(industrialTrainingSourceFolders)
        .set({
          name: body.name?.trim() || existing.name,
          sortOrder:
            body.sortOrder !== undefined && Number.isFinite(body.sortOrder)
              ? Number(body.sortOrder)
              : existing.sortOrder,
          updatedAt: now,
          archivedAt: status === "ARCHIVED" ? now : existing.archivedAt,
        })
        .where(eq(industrialTrainingSourceFolders.id, folderId))
        .returning();
      return row;
    });
  }

  async listQuestions(principal: ForgePrincipal, sourceId: string, query: ListQuery) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const conds = [
        eq(industrialTrainingQuestions.tenantId, tenantId),
        eq(industrialTrainingQuestions.sourceId, sourceId),
        isNull(industrialTrainingQuestions.archivedAt),
      ];
      if (query.status) conds.push(eq(industrialTrainingQuestions.status, query.status));
      return tx
        .select()
        .from(industrialTrainingQuestions)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingQuestions.updatedAt));
    });
  }

  async createQuestion(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      stem?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string;
      pageRef?: string;
      difficulty?: string;
      status?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    const stem = String(body.stem ?? "").trim();
    const choices = Array.isArray(body.choices)
      ? body.choices.map((c) => String(c).trim()).filter(Boolean)
      : [];
    if (!stem) throw new ForgeError("VALIDATION_FAILED", "stem is required");
    if (choices.length < 2)
      throw new ForgeError("VALIDATION_FAILED", "at least 2 choices required");
    const correctIndex = Number(body.correctIndex ?? 0);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      throw new ForgeError("VALIDATION_FAILED", "correctIndex out of range");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingQuestions)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          stem,
          choices,
          correctIndex,
          explanation: body.explanation?.trim() || null,
          pageRef: body.pageRef?.trim() || null,
          difficulty: body.difficulty?.trim() || "MEDIUM",
          status: body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await this.refreshSourceCounts(tx, tenantId, sourceId);
      return row;
    });
  }

  async importQuestionBank(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      chapters?: Array<{
        title?: string;
        pageRange?: string;
        questions?: Array<{
          stem?: string;
          choices?: string[];
          correctIndex?: number;
          explanation?: string;
          pageRef?: string;
          difficulty?: string;
          status?: string;
        }>;
      }>;
      defaultStatus?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    const defaultStatus =
      String(body.defaultStatus ?? "DRAFT").toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    const incoming = flattenImportQuestions({
      chapters: body.chapters ?? [],
    } as QuestionImportPayload);
    if (!incoming.length) {
      throw new ForgeError("VALIDATION_FAILED", "at least one question is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const now = new Date();
      let questionsCreated = 0;

      for (const raw of incoming) {
        const stem = sanitizeTrainingImportText(String(raw.stem ?? "")).trim();
        const choices = Array.isArray(raw.choices)
          ? raw.choices.map((c) => sanitizeTrainingImportText(String(c)).trim()).filter(Boolean)
          : [];
        if (!stem) throw new ForgeError("VALIDATION_FAILED", "question stem is required");
        if (choices.length < 2) {
          throw new ForgeError("VALIDATION_FAILED", "each question needs at least 2 choices");
        }
        const correctIndex = Number(raw.correctIndex ?? 0);
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
          throw new ForgeError("VALIDATION_FAILED", "correctIndex out of range");
        }
        const status =
          String(raw.status ?? defaultStatus).toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
        await tx.insert(industrialTrainingQuestions).values({
          id: createId(),
          tenantId,
          sourceId,
          stem,
          choices,
          correctIndex,
          explanation: raw.explanation
            ? sanitizeTrainingImportText(String(raw.explanation)).trim() || null
            : null,
          pageRef: raw.pageRef
            ? sanitizeTrainingImportText(String(raw.pageRef)).trim() || null
            : null,
          difficulty: raw.difficulty
            ? sanitizeTrainingImportText(String(raw.difficulty)).trim() || "MEDIUM"
            : "MEDIUM",
          status,
          createdAt: now,
          updatedAt: now,
        });
        questionsCreated += 1;
      }

      await this.refreshSourceCounts(tx, tenantId, sourceId);
      return { questionsCreated };
    });
  }

  async importQuestionsFromFile(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      filename?: string;
      contentBase64?: string;
      defaultStatus?: string;
    },
  ) {
    const filename = String(body.filename ?? "")
      .trim()
      .toLowerCase();
    const contentBase64 = String(body.contentBase64 ?? "").trim();
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!contentBase64) throw new ForgeError("VALIDATION_FAILED", "contentBase64 is required");

    let buffer: Buffer;
    try {
      buffer = Buffer.from(contentBase64, "base64");
    } catch {
      throw new ForgeError("VALIDATION_FAILED", "contentBase64 is invalid");
    }
    if (!buffer.length) throw new ForgeError("VALIDATION_FAILED", "Uploaded file is empty");
    if (buffer.length > 15_000_000) {
      throw new ForgeError("VALIDATION_FAILED", "Uploaded file is too large (15 MB max)");
    }

    let payload;
    if (filename.endsWith(".pdf")) {
      let parsed: { text?: string };
      try {
        parsed = await parsePdfBuffer(buffer);
      } catch {
        throw new ForgeError("VALIDATION_FAILED", "Could not read PDF file");
      }
      const chapterTitle = "Imported from PDF";
      try {
        payload = parseQuestionImportText(
          sanitizeTrainingImportText(parsed.text ?? ""),
          chapterTitle,
        );
      } catch (error) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Could not parse quiz questions from PDF",
        );
      }
    } else if (filename.endsWith(".csv")) {
      const text = decodeTextBuffer(buffer);
      try {
        payload = parseQuestionImportCsv(text);
      } catch (error) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Could not parse CSV file",
        );
      }
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      try {
        payload = parseQuestionImportXlsx(buffer);
      } catch (error) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Could not parse Excel file",
        );
      }
    } else {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Unsupported file type. Upload CSV, Excel (.xlsx), or PDF quiz banks.",
      );
    }

    return this.importQuestionBank(principal, sourceId, {
      chapters: payload.chapters,
      defaultStatus: body.defaultStatus ?? "PUBLISHED",
    });
  }

  async updateQuestion(
    principal: ForgePrincipal,
    questionId: string,
    body: {
      stem?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string;
      pageRef?: string;
      difficulty?: string;
      status?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
          isNull(industrialTrainingQuestions.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Question not found");
      const choices = Array.isArray(body.choices)
        ? body.choices.map((c) => String(c).trim()).filter(Boolean)
        : (existing.choices as string[]);
      const correctIndex =
        body.correctIndex !== undefined ? Number(body.correctIndex) : existing.correctIndex;
      if (choices.length < 2)
        throw new ForgeError("VALIDATION_FAILED", "at least 2 choices required");
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
        throw new ForgeError("VALIDATION_FAILED", "correctIndex out of range");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingQuestions)
        .set({
          stem: body.stem?.trim() || existing.stem,
          choices,
          correctIndex,
          explanation:
            body.explanation !== undefined
              ? body.explanation?.trim() || null
              : existing.explanation,
          pageRef: body.pageRef !== undefined ? body.pageRef?.trim() || null : existing.pageRef,
          difficulty: body.difficulty?.trim() || existing.difficulty,
          status: body.status?.trim() || existing.status,
          updatedAt: now,
          archivedAt: body.status === "ARCHIVED" ? now : existing.archivedAt,
        })
        .where(eq(industrialTrainingQuestions.id, questionId))
        .returning();
      await this.refreshSourceCounts(tx, tenantId, existing.sourceId);
      return row;
    });
  }

  async archiveQuestion(principal: ForgePrincipal, questionId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
          isNull(industrialTrainingQuestions.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Question not found");
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingQuestions)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(industrialTrainingQuestions.id, questionId))
        .returning();
      await this.refreshSourceCounts(tx, tenantId, existing.sourceId);
      return row;
    });
  }

  // ─── Quizzes / attempts ──────────────────────────────────────────────────

  async createQuiz(
    principal: ForgePrincipal,
    body: {
      sourceId?: string;
      mode?: string;
      optionCount?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
      assignmentId?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    let sourceId = String(body.sourceId ?? "").trim();
    const assignmentId = body.assignmentId ? String(body.assignmentId).trim() : null;
    let mode = (body.mode ?? "STANDARD").toUpperCase() === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
    let optionCount = Math.min(4, Math.max(2, Number(body.optionCount ?? 4) || 4));
    let feedbackEnabled = body.feedbackEnabled !== false;
    let timerSeconds = body.timerSeconds == null ? null : Number(body.timerSeconds);

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      if (assignmentId) {
        const assignment = await tx.query.industrialTrainingAssignments.findFirst({
          where: and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        });
        if (!assignment || assignment.status !== "ACTIVE") {
          throw new ForgeError("NOT_FOUND", "Assignment not found");
        }
        const assignee = await this.assignments.findAssigneeForQuiz(
          tenantId,
          assignmentId,
          principal.userId,
        );
        if (!assignee) throw new ForgeError("FORBIDDEN", "Assignment is not assigned to you");
        if (assignee.status === "PASSED") {
          throw new ForgeError("VALIDATION_FAILED", "Assignment already completed");
        }
        sourceId = assignment.sourceId;
        mode = assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
        optionCount = assignment.optionCount;
        feedbackEnabled = assignment.feedbackEnabled;
        timerSeconds = assignment.timerSeconds;
      }

      if (!sourceId) throw new ForgeError("VALIDATION_FAILED", "sourceId is required");

      const source = await this.requireSource(tx, tenantId, sourceId);
      if (source.status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "Source must be published to start a quiz");
      }
      const questions = await tx
        .select()
        .from(industrialTrainingQuestions)
        .where(
          and(
            eq(industrialTrainingQuestions.tenantId, tenantId),
            eq(industrialTrainingQuestions.sourceId, sourceId),
            eq(industrialTrainingQuestions.status, "PUBLISHED"),
            isNull(industrialTrainingQuestions.archivedAt),
          ),
        );
      if (!questions.length) {
        throw new ForgeError("VALIDATION_FAILED", "No published questions for this course");
      }
      const now = new Date();
      const [quiz] = await tx
        .insert(industrialTrainingQuizzes)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          assignmentId,
          createdByUserId: principal.userId,
          mode,
          optionCount,
          feedbackEnabled,
          timerSeconds,
          settings: {},
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      const questionIds = shuffled.map((q) => q.id);
      const [attempt] = await tx
        .insert(industrialTrainingAttempts)
        .values({
          id: createId(),
          tenantId,
          quizId: quiz!.id,
          userId: principal.userId,
          sourceId,
          assignmentId,
          status: "IN_PROGRESS",
          questionIds,
          answers: [],
          bookmarks: [],
          currentIndex: 0,
          scoreCorrect: 0,
          scoreTotal: mode === "STANDARD" ? questionIds.length : 0,
          masteryState: { remaining: questionIds, mastered: [] },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { quiz, attempt, questionCount: questionIds.length, sourceTitle: source.title };
    });

    if (assignmentId && result.attempt) {
      await this.assignments.markAssigneeInProgress(
        tenantId,
        assignmentId,
        principal.userId,
        result.attempt.id,
      );
    }

    return result;
  }

  async getAttempt(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      return { attempt, quiz };
    });
  }

  async resumeAttempt(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        throw new ForgeError("VALIDATION_FAILED", "Attempt is not in progress");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingAttempts)
        .set({ resumedAt: now, updatedAt: now })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();
      return row;
    });
  }

  async nextQuestion(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        return { done: true, attempt };
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");

      const questionIds = attempt.questionIds as string[];
      const answers = attempt.answers as AnswerRow[];
      const answered = new Set(answers.map((a) => a.questionId));
      const mastery = (attempt.masteryState ?? {}) as { remaining?: string[]; mastered?: string[] };

      let nextId: string | undefined;
      if (quiz.mode === "ADAPTIVE") {
        const mastered = new Set(mastery.mastered ?? []);
        const pool = (mastery.remaining?.length ? mastery.remaining : questionIds).filter(
          (id) => !mastered.has(id),
        );
        // Prefer never-answered, then previously incorrect
        const unanswered = pool.filter((id) => !answered.has(id));
        const incorrect = answers
          .filter((a) => !a.correct && !mastered.has(a.questionId))
          .map((a) => a.questionId);
        nextId = unanswered[0] ?? incorrect[0] ?? pool[0];
        if (!nextId) {
          return { done: true, attempt };
        }
      } else {
        if (attempt.currentIndex >= questionIds.length) {
          return { done: true, attempt };
        }
        nextId = questionIds[attempt.currentIndex];
      }

      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: eq(industrialTrainingQuestions.id, nextId!),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const choices = (q.choices as string[]).slice(0, quiz.optionCount);
      return {
        done: false,
        index: attempt.currentIndex,
        total: questionIds.length,
        feedbackEnabled: quiz.feedbackEnabled,
        timerSeconds: quiz.timerSeconds ?? null,
        mode: quiz.mode,
        mastery: {
          mastered: (mastery.mastered ?? []).length,
          total: questionIds.length,
        },
        question: {
          id: q.id,
          stem: q.stem,
          choices,
          pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        },
      };
    });
  }

  async answerQuestion(
    principal: ForgePrincipal,
    attemptId: string,
    body: { questionId?: string; selectedIndex?: number },
  ) {
    const tenantId = this.tenant(principal);
    const questionId = String(body.questionId ?? "").trim();
    const selectedIndex = Number(body.selectedIndex);
    if (!questionId) throw new ForgeError("VALIDATION_FAILED", "questionId required");
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      throw new ForgeError("VALIDATION_FAILED", "selectedIndex required");
    }
    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        // Idempotent finish: client may retry after a sync failure left the attempt COMPLETED.
        if (attempt.status === "COMPLETED") {
          const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
            where: eq(industrialTrainingQuizzes.id, attempt.quizId),
          });
          const answers = attempt.answers as AnswerRow[];
          const prior = answers.find((a) => a.questionId === questionId);
          const q = await tx.query.industrialTrainingQuestions.findFirst({
            where: and(
              eq(industrialTrainingQuestions.id, questionId),
              eq(industrialTrainingQuestions.tenantId, tenantId),
            ),
          });
          return {
            correct: prior?.correct ?? selectedIndex === q?.correctIndex,
            done: true,
            explanation: quiz?.feedbackEnabled ? q?.explanation : undefined,
            pageRef: quiz?.feedbackEnabled ? q?.pageRef : undefined,
            correctIndex: quiz?.feedbackEnabled ? q?.correctIndex : undefined,
            attempt,
            assignmentMeta: null as null,
          };
        }
        throw new ForgeError("VALIDATION_FAILED", "Attempt is not in progress");
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");
      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
        ),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const correct = selectedIndex === q.correctIndex;
      const answers = [...(attempt.answers as AnswerRow[])];
      const existingIdx = answers.findIndex((a) => a.questionId === questionId);
      const row: AnswerRow = {
        questionId,
        selectedIndex,
        correct,
        answeredAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) answers[existingIdx] = row;
      else answers.push(row);

      const mastery = {
        remaining: [
          ...((attempt.masteryState as { remaining?: string[] })?.remaining ??
            (attempt.questionIds as string[])),
        ],
        mastered: [...((attempt.masteryState as { mastered?: string[] })?.mastered ?? [])],
      };
      if (correct && !mastery.mastered.includes(questionId)) {
        mastery.mastered.push(questionId);
        mastery.remaining = mastery.remaining.filter((id) => id !== questionId);
      }

      const scoreCorrect = answers.filter((a) => a.correct).length;
      let nextIndex = attempt.currentIndex;
      if (quiz.mode === "STANDARD") nextIndex = attempt.currentIndex + 1;

      const adaptiveDone =
        quiz.mode === "ADAPTIVE" &&
        mastery.mastered.length >= (attempt.questionIds as string[]).length;
      const standardDone =
        quiz.mode === "STANDARD" && nextIndex >= (attempt.questionIds as string[]).length;
      const done = adaptiveDone || standardDone;

      const now = new Date();
      const [updated] = await tx
        .update(industrialTrainingAttempts)
        .set({
          answers,
          masteryState: mastery,
          currentIndex: nextIndex,
          scoreCorrect,
          scoreTotal:
            quiz.mode === "ADAPTIVE"
              ? (attempt.questionIds as string[]).length
              : attempt.scoreTotal,
          status: done ? "COMPLETED" : "IN_PROGRESS",
          completedAt: done ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();

      if (done) {
        await this.updateStats(tx, tenantId, principal.userId, attempt.sourceId, updated!);
      }

      let assignmentMeta: {
        assignmentId: string;
        passingPercent: number;
        sourceTitle: string;
        percent: number;
      } | null = null;
      if (done && updated!.assignmentId) {
        const assignment = await tx.query.industrialTrainingAssignments.findFirst({
          where: eq(industrialTrainingAssignments.id, updated!.assignmentId!),
        });
        const source = await tx.query.industrialTrainingSources.findFirst({
          where: eq(industrialTrainingSources.id, attempt.sourceId),
        });
        const total = Math.max(updated!.scoreTotal, (updated!.answers as AnswerRow[]).length, 1);
        assignmentMeta = {
          assignmentId: updated!.assignmentId!,
          passingPercent: assignment?.passingPercent ?? 70,
          sourceTitle: source?.title ?? "Training",
          percent: Math.round((updated!.scoreCorrect / total) * 100),
        };
      }

      return {
        correct,
        done,
        explanation: quiz.feedbackEnabled ? q.explanation : undefined,
        pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        correctIndex: quiz.feedbackEnabled ? q.correctIndex : undefined,
        attempt: updated,
        assignmentMeta,
      };
    });

    if (result.done && result.assignmentMeta) {
      try {
        await this.assignments.syncQuizCompletion({
          tenantId,
          userId: principal.userId,
          assignmentId: result.assignmentMeta.assignmentId,
          attemptId,
          sourceId: result.attempt!.sourceId,
          sourceTitle: result.assignmentMeta.sourceTitle,
          percent: result.assignmentMeta.percent,
          passingPercent: result.assignmentMeta.passingPercent,
        });
      } catch (err) {
        this.logger.error(
          `Quiz completion sync failed for attempt ${attemptId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const { assignmentMeta: _meta, ...response } = result;
    return response;
  }

  async toggleBookmark(principal: ForgePrincipal, attemptId: string, questionId: string) {
    const tenantId = this.tenant(principal);
    const qid = String(questionId ?? "").trim();
    if (!qid) throw new ForgeError("VALIDATION_FAILED", "questionId required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const bookmarks = new Set(attempt.bookmarks as string[]);
      if (bookmarks.has(qid)) bookmarks.delete(qid);
      else bookmarks.add(qid);
      const [row] = await tx
        .update(industrialTrainingAttempts)
        .set({ bookmarks: [...bookmarks], updatedAt: new Date() })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();
      return row;
    });
  }

  async getResults(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const answers = attempt.answers as AnswerRow[];
      const total = Math.max(attempt.scoreTotal, answers.length, 1);
      const pct = Math.round((attempt.scoreCorrect / total) * 100);
      return {
        attempt,
        scoreCorrect: attempt.scoreCorrect,
        scoreTotal: total,
        percent: pct,
        letterGrade: letterGrade(pct),
        wrongQuestionIds: answers.filter((a) => !a.correct).map((a) => a.questionId),
        bookmarkedQuestionIds: attempt.bookmarks as string[],
      };
    });
  }

  async createRetake(
    principal: ForgePrincipal,
    attemptId: string,
    mode: "wrong" | "bookmarked" | "same" | "new",
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const prior = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, prior.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");
      const answers = prior.answers as AnswerRow[];
      let questionIds = prior.questionIds as string[];
      if (mode === "wrong") {
        questionIds = answers.filter((a) => !a.correct).map((a) => a.questionId);
      } else if (mode === "bookmarked") {
        questionIds = [...(prior.bookmarks as string[])];
      } else if (mode === "new") {
        questionIds = [...questionIds].sort(() => Math.random() - 0.5);
      }
      if (!questionIds.length) {
        throw new ForgeError("VALIDATION_FAILED", "No questions available for retake mode");
      }
      const now = new Date();
      const [attempt] = await tx
        .insert(industrialTrainingAttempts)
        .values({
          id: createId(),
          tenantId,
          quizId: quiz.id,
          userId: principal.userId,
          sourceId: prior.sourceId,
          assignmentId: prior.assignmentId ?? null,
          status: "IN_PROGRESS",
          questionIds,
          answers: [],
          bookmarks: [],
          currentIndex: 0,
          scoreCorrect: 0,
          scoreTotal: questionIds.length,
          masteryState: { remaining: questionIds, mastered: [] },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return { quiz, attempt };
    });
  }

  async listProgress(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const stats = await tx
        .select()
        .from(industrialTrainingUserStats)
        .where(
          and(
            eq(industrialTrainingUserStats.tenantId, tenantId),
            eq(industrialTrainingUserStats.userId, principal.userId),
          ),
        )
        .orderBy(desc(industrialTrainingUserStats.updatedAt));
      const attempts = await tx
        .select()
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.userId, principal.userId),
          ),
        )
        .orderBy(desc(industrialTrainingAttempts.updatedAt))
        .limit(20);
      return { stats, recentAttempts: attempts };
    });
  }

  async listInProgress(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.userId, principal.userId),
            eq(industrialTrainingAttempts.status, "IN_PROGRESS"),
          ),
        )
        .orderBy(desc(industrialTrainingAttempts.updatedAt));
    });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireSource(tx: any, tenantId: string, sourceId: string) {
    const row = await tx.query.industrialTrainingSources.findFirst({
      where: and(
        eq(industrialTrainingSources.id, sourceId),
        eq(industrialTrainingSources.tenantId, tenantId),
        isNull(industrialTrainingSources.archivedAt),
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Training source not found");
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireSourceFolder(tx: any, tenantId: string, folderId: string) {
    const row = await tx.query.industrialTrainingSourceFolders.findFirst({
      where: and(
        eq(industrialTrainingSourceFolders.id, folderId),
        eq(industrialTrainingSourceFolders.tenantId, tenantId),
        isNull(industrialTrainingSourceFolders.archivedAt),
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Folder not found");
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireAttempt(tx: any, tenantId: string, attemptId: string, userId: string) {
    const row = await tx.query.industrialTrainingAttempts.findFirst({
      where: and(
        eq(industrialTrainingAttempts.id, attemptId),
        eq(industrialTrainingAttempts.tenantId, tenantId),
        eq(industrialTrainingAttempts.userId, userId),
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Attempt not found");
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async refreshSourceCounts(tx: any, tenantId: string, sourceId: string) {
    const questions = await tx
      .select({ id: industrialTrainingQuestions.id })
      .from(industrialTrainingQuestions)
      .where(
        and(
          eq(industrialTrainingQuestions.tenantId, tenantId),
          eq(industrialTrainingQuestions.sourceId, sourceId),
          isNull(industrialTrainingQuestions.archivedAt),
        ),
      );
    await tx
      .update(industrialTrainingSources)
      .set({
        questionCount: questions.length,
        updatedAt: new Date(),
      })
      .where(eq(industrialTrainingSources.id, sourceId));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async updateStats(
    tx: any,
    tenantId: string,
    userId: string,
    sourceId: string,
    attempt: typeof industrialTrainingAttempts.$inferSelect,
  ) {
    const total = Math.max(attempt.scoreTotal, 1);
    const pct = (attempt.scoreCorrect / total) * 100;
    const existing = await tx.query.industrialTrainingUserStats.findFirst({
      where: and(
        eq(industrialTrainingUserStats.tenantId, tenantId),
        eq(industrialTrainingUserStats.userId, userId),
        eq(industrialTrainingUserStats.sourceId, sourceId),
      ),
    });
    const now = new Date();
    const answers = attempt.answers as AnswerRow[];
    if (!existing) {
      await tx.insert(industrialTrainingUserStats).values({
        id: createId(),
        tenantId,
        userId,
        sourceId,
        seenCount: answers.length,
        correctCount: attempt.scoreCorrect,
        masteredCount: ((attempt.masteryState as { mastered?: string[] })?.mastered ?? []).length,
        attemptCount: 1,
        avgScore: pct.toFixed(2),
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }
    const attemptCount = existing.attemptCount + 1;
    const prevAvg = Number(existing.avgScore ?? 0);
    const avgScore = ((prevAvg * existing.attemptCount + pct) / attemptCount).toFixed(2);
    await tx
      .update(industrialTrainingUserStats)
      .set({
        seenCount: existing.seenCount + answers.length,
        correctCount: existing.correctCount + attempt.scoreCorrect,
        masteredCount: Math.max(
          existing.masteredCount,
          ((attempt.masteryState as { mastered?: string[] })?.mastered ?? []).length,
        ),
        attemptCount,
        avgScore,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(industrialTrainingUserStats.id, existing.id));
  }

  // ─── Training materials (PPT / video / docs) ───────────────────────────────

  async listMaterials(
    principal: ForgePrincipal,
    query: ListQuery,
    opts?: { publishedOnly?: boolean },
  ) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [
        eq(industrialTrainingMaterials.tenantId, tenantId),
        isNull(industrialTrainingMaterials.archivedAt),
      ];
      if (opts?.publishedOnly) {
        conds.push(eq(industrialTrainingMaterials.status, "ACTIVE"));
        conds.push(eq(industrialTrainingMaterials.visibility, "PUBLISHED"));
      } else {
        // Managers see processing / failed uploads; learners (publishedOnly) only see ready videos.
        conds.push(inArray(industrialTrainingMaterials.status, ["ACTIVE", "PROCESSING", "FAILED"]));
      }
      if (query.category?.trim()) {
        conds.push(eq(industrialTrainingMaterials.category, query.category.trim().toUpperCase()));
      }
      if (query.sourceId?.trim()) {
        conds.push(eq(industrialTrainingMaterials.sourceId, query.sourceId.trim()));
      }
      if (query.folderId?.trim()) {
        const folderId = query.folderId.trim();
        if (folderId.toLowerCase() === "none") {
          conds.push(isNull(industrialTrainingMaterials.folderId));
        } else {
          conds.push(eq(industrialTrainingMaterials.folderId, folderId));
        }
      }
      if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(
          sql`(lower(${industrialTrainingMaterials.title}) like ${q} or lower(${industrialTrainingMaterials.originalFilename}) like ${q} or lower(coalesce(${industrialTrainingMaterials.description}, '')) like ${q})`,
        );
      }
      const rows = await tx
        .select()
        .from(industrialTrainingMaterials)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingMaterials.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: resolveMaterialTopic(r.category),
          mediaKind: trainingMaterialCategoryForMime(r.mimeType),
          mimeType: r.mimeType,
          originalFilename: r.originalFilename,
          byteSize: r.byteSize,
          status: r.status,
          visibility: r.visibility,
          sourceId: r.sourceId,
          folderId: r.folderId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      };
    });
  }

  async createMaterialUploadUrl(
    principal: ForgePrincipal,
    body: {
      title?: string;
      description?: string;
      filename?: string;
      mimeType?: string;
      contentLength?: number;
      visibility?: string;
      sourceId?: string | null;
      folderId?: string | null;
      category?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_MATERIAL_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_MATERIAL_BYTES} bytes`,
      );
    }
    if (!isAllowedTrainingMaterialMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF, PowerPoint, Word, Excel, image, or common video formats.",
      );
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${materialsObjectKeyPrefix(tenantId)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const materialId = createId();
    const documentId = createId();
    const now = new Date();
    let category: string;
    try {
      category = normalizeTrainingMaterialTopic(body.category);
    } catch {
      throw new ForgeError("VALIDATION_FAILED", "Invalid training material category");
    }
    const visibility =
      String(body.visibility ?? "PUBLISHED").toUpperCase() === "DRAFT" ? "DRAFT" : "PUBLISHED";
    const sourceId = body.sourceId ? String(body.sourceId).trim() : null;
    const folderId = body.folderId ? String(body.folderId).trim() : null;

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      if (sourceId) {
        await this.requireSource(tx, tenantId, sourceId);
      }
      if (folderId) {
        const folder = await this.requireSourceFolder(tx, tenantId, folderId);
        if (!sourceId) {
          throw new ForgeError("VALIDATION_FAILED", "sourceId is required when folderId is set");
        }
        if (folder.sourceId !== sourceId) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "folderId does not belong to the selected source",
          );
        }
      }

      await tx.insert(forgeDocuments).values({
        id: documentId,
        tenantId,
        originalFilename: filename,
        storedFilename,
        objectKey,
        bucketName: this.storage.bucketName,
        mimeType,
        fileSizeBytes: contentLength,
        securityClassification: "INTERNAL",
        malwareScanStatus: "PENDING",
        retentionRule: "TRAINING_MATERIAL_DEFAULT",
        uploadStatus: "INITIALIZED",
        source: "INDUSTRIAL_TRAINING",
        uploadedByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(industrialTrainingMaterials).values({
        id: materialId,
        tenantId,
        documentId,
        title,
        description: body.description?.trim() || null,
        category,
        mimeType,
        originalFilename: filename,
        byteSize: contentLength,
        status: "PENDING_UPLOAD",
        visibility,
        sourceId,
        folderId,
        createdByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    const presign = await this.storage.createPresignedUploadUrl({
      objectKey,
      mimeType,
      contentLength,
    });

    return {
      id: materialId,
      documentId,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      category,
    };
  }

  async completeMaterialUpload(principal: ForgePrincipal, materialId: string) {
    const tenantId = this.tenant(principal);
    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const material = await tx.query.industrialTrainingMaterials.findFirst({
        where: and(
          eq(industrialTrainingMaterials.id, materialId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
        ),
      });
      if (!material || material.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Training material not found");
      }
      const document = await tx.query.forgeDocuments.findFirst({
        where: and(
          eq(forgeDocuments.id, material.documentId),
          eq(forgeDocuments.tenantId, tenantId),
        ),
      });
      if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
      if (!documentBelongsToTenant(document.tenantId, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
      }
      if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
      }

      await this.storage.assertObjectExists(document.objectKey);
      const head = await this.storage.headObject(document.objectKey);
      if (
        head.contentLength != null &&
        document.fileSizeBytes > 0 &&
        head.contentLength !== document.fileSizeBytes
      ) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Uploaded file size does not match the original. Try uploading again.",
        );
      }

      const now = new Date();
      await tx
        .update(forgeDocuments)
        .set({
          uploadStatus: "COMPLETE",
          uploadedAt: now,
          updatedAt: now,
        })
        .where(eq(forgeDocuments.id, document.id));

      const nextStatus = isTrainingVideoFile({
        mimeType: material.mimeType,
        filename: material.originalFilename,
      })
        ? "PROCESSING"
        : "ACTIVE";
      const [updated] = await tx
        .update(industrialTrainingMaterials)
        .set({
          status: nextStatus,
          updatedAt: now,
        })
        .where(eq(industrialTrainingMaterials.id, materialId))
        .returning();

      return {
        id: updated!.id,
        title: updated!.title,
        status: updated!.status,
        category: updated!.category,
        mimeType: updated!.mimeType,
        originalFilename: updated!.originalFilename,
        byteSize: updated!.byteSize,
        visibility: updated!.visibility,
      };
    });

    if (result.status === "PROCESSING") {
      this.videoNormalize.scheduleNormalize({
        tenantId,
        materialId: result.id,
        userId: principal.userId,
      });
    }

    return result;
  }

  /** Re-run Apple/iOS MP4 normalization on an already-uploaded training video. */
  async reoptimizeMaterialVideo(principal: ForgePrincipal, materialId: string) {
    const tenantId = this.tenant(principal);
    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const material = await tx.query.industrialTrainingMaterials.findFirst({
        where: and(
          eq(industrialTrainingMaterials.id, materialId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
        ),
      });
      if (!material || material.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Training material not found");
      }
      if (
        !isTrainingVideoFile({
          mimeType: material.mimeType,
          filename: material.originalFilename,
        })
      ) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Only video materials can be optimized for tablets",
        );
      }
      const document = await tx.query.forgeDocuments.findFirst({
        where: and(
          eq(forgeDocuments.id, material.documentId),
          eq(forgeDocuments.tenantId, tenantId),
        ),
      });
      if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
      await this.storage.assertObjectExists(document.objectKey);

      const now = new Date();
      const [updated] = await tx
        .update(industrialTrainingMaterials)
        .set({ status: "PROCESSING", updatedAt: now })
        .where(eq(industrialTrainingMaterials.id, materialId))
        .returning();

      return {
        id: updated!.id,
        title: updated!.title,
        status: updated!.status,
        category: updated!.category,
        mimeType: updated!.mimeType,
        originalFilename: updated!.originalFilename,
        byteSize: updated!.byteSize,
        visibility: updated!.visibility,
      };
    });

    this.videoNormalize.scheduleNormalize({
      tenantId,
      materialId: result.id,
      userId: principal.userId,
    });
    return result;
  }

  async createMaterialDownloadUrl(principal: ForgePrincipal, materialId: string) {
    const { material, document } = await this.requireActiveMaterialDocument(principal, materialId);
    const inline = canStreamInline(material.mimeType, material.originalFilename);
    const playbackMime = isTrainingVideoFile({
      mimeType: material.mimeType,
      filename: material.originalFilename,
    })
      ? resolveTrainingVideoPlaybackMime({
          mimeType: document.mimeType ?? material.mimeType,
          filename: material.originalFilename,
        })
      : (document.mimeType ?? material.mimeType);

    await this.storage.assertObjectExists(document.objectKey);

    const presign = await this.storage.createPresignedDownloadUrl({
      objectKey: document.objectKey,
      mimeType: playbackMime,
      filename: material.originalFilename,
      inline,
    });
    this.storage.assertDownloadNotExpired(presign.expiresAt);

    return {
      id: material.id,
      title: material.title,
      mimeType: playbackMime,
      category: material.category,
      originalFilename: material.originalFilename,
      downloadUrl: presign.downloadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      expiresAt: presign.expiresAt,
      mode: presign.mode,
      inline,
    };
  }

  async createMaterialViewUrlByTenant(
    tenantId: string,
    materialId: string,
    options?: { requirePublished?: boolean },
  ) {
    const { material, document } = await this.requireTenantMaterialDocument(
      tenantId,
      materialId,
      options,
    );

    await this.storage.assertObjectExists(document.objectKey);

    // PowerPoint: Microsoft Office Online needs a public HTTPS URL it can fetch.
    // Video / PDF / images: return S3 presigned so the browser can stream with Range seeks.
    if (isPresentationMimeType(material.mimeType, material.originalFilename)) {
      const publicApiUrl = process.env.PUBLIC_API_URL?.trim() || "http://localhost:4000";
      const issued = issueOfficeViewToken(tenantId, materialId);
      const viewUrl = buildOfficeMaterialViewUrl(publicApiUrl, materialId, issued.token);
      return {
        id: material.id,
        title: material.title,
        mimeType: material.mimeType,
        originalFilename: material.originalFilename,
        byteSize: material.byteSize,
        viewUrl,
        expiresInSeconds: issued.expiresInSeconds,
        expiresAt: issued.expiresAt,
        mode: "OFFICE_VIEW_TOKEN",
      };
    }

    const playbackMime = isTrainingVideoFile({
      mimeType: material.mimeType,
      filename: material.originalFilename,
    })
      ? resolveTrainingVideoPlaybackMime({
          mimeType: document.mimeType ?? material.mimeType,
          filename: material.originalFilename,
        })
      : (document.mimeType ?? material.mimeType);

    const presign = await this.storage.createPresignedDownloadUrl({
      objectKey: document.objectKey,
      mimeType: playbackMime,
      filename: material.originalFilename,
      inline: true,
    });
    this.storage.assertDownloadNotExpired(presign.expiresAt);

    return {
      id: material.id,
      title: material.title,
      mimeType: playbackMime,
      originalFilename: material.originalFilename,
      byteSize: material.byteSize,
      viewUrl: presign.downloadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      expiresAt: presign.expiresAt,
      mode: presign.mode,
    };
  }

  async createMaterialViewUrl(principal: ForgePrincipal, materialId: string) {
    const tenantId = this.tenant(principal);
    return this.createMaterialViewUrlByTenant(tenantId, materialId);
  }

  async getMaterialContent(principal: ForgePrincipal, materialId: string) {
    const { material, document } = await this.requireActiveMaterialDocument(principal, materialId);
    return this.streamMaterialDocument(material, document);
  }

  async getMaterialContentByTenant(
    tenantId: string,
    materialId: string,
    options?: { requirePublished?: boolean },
  ) {
    const { material, document } = await this.requireTenantMaterialDocument(
      tenantId,
      materialId,
      options,
    );
    return this.streamMaterialDocument(material, document);
  }

  private streamMaterialDocument(
    material: typeof industrialTrainingMaterials.$inferSelect,
    document: { mimeType: string | null; objectKey: string },
  ) {
    const stream = this.storage.getObjectStream(document.objectKey);
    return stream.then((body) => {
      const inline = canStreamInline(material.mimeType, material.originalFilename);
      const contentType = isTrainingVideoFile({
        mimeType: material.mimeType,
        filename: material.originalFilename,
      })
        ? resolveTrainingVideoPlaybackMime({
            mimeType: body.contentType ?? document.mimeType ?? material.mimeType,
            filename: material.originalFilename,
          })
        : (body.contentType ?? document.mimeType ?? "application/octet-stream");
      return {
        body: body.body,
        contentType,
        contentLength: body.contentLength ?? material.byteSize,
        filename: material.originalFilename,
        disposition: inline ? ("inline" as const) : ("attachment" as const),
      };
    });
  }

  private async requireTenantMaterialDocument(
    tenantId: string,
    materialId: string,
    options?: { requirePublished?: boolean },
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const material = await tx.query.industrialTrainingMaterials.findFirst({
        where: and(
          eq(industrialTrainingMaterials.id, materialId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
        ),
      });
      if (!material || material.archivedAt || material.status !== "ACTIVE") {
        throw new ForgeError("NOT_FOUND", "Training material not found");
      }
      if (options?.requirePublished !== false && material.visibility !== "PUBLISHED") {
        throw new ForgeError("FORBIDDEN", "Material is not published");
      }

      const document = await tx.query.forgeDocuments.findFirst({
        where: and(
          eq(forgeDocuments.id, material.documentId),
          eq(forgeDocuments.tenantId, tenantId),
        ),
      });
      if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
      if (!documentBelongsToTenant(document.tenantId, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
      }
      if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
      }

      return { material, document };
    });
  }

  private async requireActiveMaterialDocument(principal: ForgePrincipal, materialId: string) {
    const tenantId = this.tenant(principal);
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const material = await tx.query.industrialTrainingMaterials.findFirst({
        where: and(
          eq(industrialTrainingMaterials.id, materialId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
        ),
      });
      if (!material || material.archivedAt || material.status !== "ACTIVE") {
        throw new ForgeError("NOT_FOUND", "Training material not found");
      }
      if (!canManage && material.visibility !== "PUBLISHED") {
        throw new ForgeError("FORBIDDEN", "Material is not published");
      }

      const document = await tx.query.forgeDocuments.findFirst({
        where: and(
          eq(forgeDocuments.id, material.documentId),
          eq(forgeDocuments.tenantId, tenantId),
        ),
      });
      if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
      if (!documentBelongsToTenant(document.tenantId, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
      }
      if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
        throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
      }

      return { material, document };
    });
  }

  /** Drop assignment pins that point at a material no longer usable for the course. */
  private async clearAssignmentMaterialPins(
    tx: DatabaseTransaction,
    tenantId: string,
    materialId: string,
  ) {
    const now = new Date();
    await tx
      .update(industrialTrainingAssignments)
      .set({ materialId: null, updatedAt: now })
      .where(
        and(
          eq(industrialTrainingAssignments.tenantId, tenantId),
          eq(industrialTrainingAssignments.materialId, materialId),
        ),
      );
  }

  async updateMaterial(
    principal: ForgePrincipal,
    materialId: string,
    body: {
      title?: string;
      description?: string | null;
      category?: string;
      visibility?: string;
      sourceId?: string | null;
      folderId?: string | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const material = await tx.query.industrialTrainingMaterials.findFirst({
        where: and(
          eq(industrialTrainingMaterials.id, materialId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
          isNull(industrialTrainingMaterials.archivedAt),
        ),
      });
      if (!material || material.status !== "ACTIVE") {
        throw new ForgeError("NOT_FOUND", "Training material not found");
      }

      const patch: {
        title?: string;
        description?: string | null;
        category?: string;
        visibility?: string;
        sourceId?: string | null;
        folderId?: string | null;
        updatedAt: Date;
      } = { updatedAt: new Date() };

      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) throw new ForgeError("VALIDATION_FAILED", "title cannot be empty");
        patch.title = title;
      }
      if (body.description !== undefined) {
        const description = body.description == null ? null : String(body.description).trim();
        patch.description = description || null;
      }
      if (body.category !== undefined) {
        try {
          patch.category = normalizeTrainingMaterialTopic(body.category);
        } catch {
          throw new ForgeError("VALIDATION_FAILED", "Invalid training material category");
        }
      }
      if (body.visibility !== undefined) {
        const visibility = String(body.visibility).toUpperCase();
        if (visibility !== "PUBLISHED" && visibility !== "DRAFT") {
          throw new ForgeError("VALIDATION_FAILED", "visibility must be PUBLISHED or DRAFT");
        }
        patch.visibility = visibility;
      }
      if (body.sourceId !== undefined) {
        const sourceId = body.sourceId ? String(body.sourceId).trim() : null;
        if (sourceId) {
          await this.requireSource(tx, tenantId, sourceId);
        }
        patch.sourceId = sourceId;
        if (!sourceId) {
          patch.folderId = null;
        } else if (material.folderId) {
          const folder = await this.requireSourceFolder(tx, tenantId, material.folderId);
          if (folder.sourceId !== sourceId) {
            patch.folderId = null;
          }
        }
      }
      if (body.folderId !== undefined) {
        const folderId = body.folderId ? String(body.folderId).trim() : null;
        const effectiveSourceId = patch.sourceId !== undefined ? patch.sourceId : material.sourceId;
        if (folderId) {
          const folder = await this.requireSourceFolder(tx, tenantId, folderId);
          if (!effectiveSourceId || folder.sourceId !== effectiveSourceId) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              "folderId must belong to the material's linked source",
            );
          }
        }
        patch.folderId = folderId;
      }

      const [updated] = await tx
        .update(industrialTrainingMaterials)
        .set(patch)
        .where(eq(industrialTrainingMaterials.id, materialId))
        .returning();

      if (body.sourceId !== undefined) {
        const nextSourceId = updated!.sourceId;
        if (!nextSourceId) {
          await this.clearAssignmentMaterialPins(tx, tenantId, materialId);
        }
      }

      return {
        id: updated!.id,
        title: updated!.title,
        description: updated!.description,
        category: resolveMaterialTopic(updated!.category),
        mediaKind: trainingMaterialCategoryForMime(updated!.mimeType),
        mimeType: updated!.mimeType,
        originalFilename: updated!.originalFilename,
        byteSize: updated!.byteSize,
        status: updated!.status,
        visibility: updated!.visibility,
        sourceId: updated!.sourceId,
        folderId: updated!.folderId,
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
      };
    });
  }

  async archiveMaterial(principal: ForgePrincipal, materialId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingMaterials)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(
            eq(industrialTrainingMaterials.id, materialId),
            eq(industrialTrainingMaterials.tenantId, tenantId),
            isNull(industrialTrainingMaterials.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Training material not found");
      await this.clearAssignmentMaterialPins(tx, tenantId, materialId);
      return { id: row.id, status: row.status };
    });
  }

  // ─── Public QR assignment quiz (employee number gate) ─────────────────────

  async createQuizPublic(tenantId: string, employeeNumber: string, assignmentId: string) {
    const normalized = employeeNumber.trim();
    if (!normalized) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const assignment = await tx.query.industrialTrainingAssignments.findFirst({
        where: and(
          eq(industrialTrainingAssignments.id, assignmentId),
          eq(industrialTrainingAssignments.tenantId, tenantId),
          isNull(industrialTrainingAssignments.archivedAt),
        ),
      });
      if (!assignment || assignment.status !== "ACTIVE") {
        throw new ForgeError("NOT_FOUND", "Assignment not found");
      }
      const assignee = await this.assignments.findAssigneeByEmployeeNumber(
        tenantId,
        assignmentId,
        normalized,
      );
      if (!assignee)
        throw new ForgeError("FORBIDDEN", "Employee number is not assigned to this training");
      if (assignee.status === "PASSED") {
        throw new ForgeError("VALIDATION_FAILED", "Assignment already completed");
      }

      const person = await findPersonnelByEmployeeNumber(tx, tenantId, normalized);
      const canonicalEmployeeNumber = person?.employeeNumber?.trim() || normalized;

      const sourceId = assignment.sourceId;
      const mode = assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
      const optionCount = assignment.optionCount;
      const feedbackEnabled = assignment.feedbackEnabled;
      const timerSeconds = assignment.timerSeconds;

      const source = await this.requireSource(tx, tenantId, sourceId);
      if (source.status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "Source must be published to start a quiz");
      }
      const questions = await tx
        .select()
        .from(industrialTrainingQuestions)
        .where(
          and(
            eq(industrialTrainingQuestions.tenantId, tenantId),
            eq(industrialTrainingQuestions.sourceId, sourceId),
            eq(industrialTrainingQuestions.status, "PUBLISHED"),
            isNull(industrialTrainingQuestions.archivedAt),
          ),
        );
      if (!questions.length) {
        throw new ForgeError("VALIDATION_FAILED", "No published questions for this course");
      }

      const now = new Date();
      const prior = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.assignmentId, assignmentId),
            sql`lower(trim(${industrialTrainingAttempts.employeeNumber})) = lower(${canonicalEmployeeNumber})`,
          ),
        );
      const attemptNumber = (prior[0]?.count ?? 0) + 1;

      const [quiz] = await tx
        .insert(industrialTrainingQuizzes)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          assignmentId,
          createdByUserId: null,
          mode,
          optionCount,
          feedbackEnabled,
          timerSeconds,
          settings: { via: "public-qr" },
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      const questionIds = shuffled.map((q) => q.id);
      const [attempt] = await tx
        .insert(industrialTrainingAttempts)
        .values({
          id: createId(),
          tenantId,
          quizId: quiz!.id,
          userId: null,
          employeeNumber: canonicalEmployeeNumber,
          sourceId,
          assignmentId,
          courseVersionId: assignment.courseVersionId ?? null,
          attemptNumber,
          status: "IN_PROGRESS",
          questionIds,
          answers: [],
          bookmarks: [],
          currentIndex: 0,
          scoreCorrect: 0,
          scoreTotal: mode === "STANDARD" ? questionIds.length : 0,
          masteryState: { remaining: questionIds, mastered: [] },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { quiz, attempt, questionCount: questionIds.length, sourceTitle: source.title };
    });

    if (result.attempt) {
      await this.assignments.markAssigneeInProgressByEmployeeNumber(
        tenantId,
        assignmentId,
        normalized,
        result.attempt.id,
      );
    }

    return result;
  }

  async nextQuestionPublic(tenantId: string, employeeNumber: string, attemptId: string) {
    const normalized = employeeNumber.trim();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttemptForEmployee(tx, tenantId, attemptId, normalized);
      if (attempt.status !== "IN_PROGRESS") {
        return { done: true, attempt };
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");

      const questionIds = attempt.questionIds as string[];
      const answers = attempt.answers as AnswerRow[];
      const answered = new Set(answers.map((a) => a.questionId));
      const mastery = (attempt.masteryState ?? {}) as { remaining?: string[]; mastered?: string[] };

      let nextId: string | undefined;
      if (quiz.mode === "ADAPTIVE") {
        const mastered = new Set(mastery.mastered ?? []);
        const pool = (mastery.remaining?.length ? mastery.remaining : questionIds).filter(
          (id) => !mastered.has(id),
        );
        const unanswered = pool.filter((id) => !answered.has(id));
        const incorrect = answers
          .filter((a) => !a.correct && !mastered.has(a.questionId))
          .map((a) => a.questionId);
        nextId = unanswered[0] ?? incorrect[0] ?? pool[0];
        if (!nextId) return { done: true, attempt };
      } else {
        if (attempt.currentIndex >= questionIds.length) return { done: true, attempt };
        nextId = questionIds[attempt.currentIndex];
      }

      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: eq(industrialTrainingQuestions.id, nextId!),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const choices = (q.choices as string[]).slice(0, quiz.optionCount);
      return {
        done: false,
        index: attempt.currentIndex,
        total: questionIds.length,
        feedbackEnabled: quiz.feedbackEnabled,
        timerSeconds: quiz.timerSeconds ?? null,
        mode: quiz.mode,
        mastery: {
          mastered: (mastery.mastered ?? []).length,
          total: questionIds.length,
        },
        question: {
          id: q.id,
          stem: q.stem,
          choices,
          pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        },
      };
    });
  }

  async answerQuestionPublic(
    tenantId: string,
    employeeNumber: string,
    attemptId: string,
    body: { questionId?: string; selectedIndex?: number },
  ) {
    const normalized = employeeNumber.trim();
    const questionId = String(body.questionId ?? "").trim();
    const selectedIndex = Number(body.selectedIndex);
    if (!questionId) throw new ForgeError("VALIDATION_FAILED", "questionId required");
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      throw new ForgeError("VALIDATION_FAILED", "selectedIndex required");
    }

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttemptForEmployee(tx, tenantId, attemptId, normalized);
      if (attempt.status !== "IN_PROGRESS") {
        if (attempt.status === "COMPLETED") {
          const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
            where: eq(industrialTrainingQuizzes.id, attempt.quizId),
          });
          const answers = attempt.answers as AnswerRow[];
          const prior = answers.find((a) => a.questionId === questionId);
          const q = await tx.query.industrialTrainingQuestions.findFirst({
            where: and(
              eq(industrialTrainingQuestions.id, questionId),
              eq(industrialTrainingQuestions.tenantId, tenantId),
            ),
          });
          return {
            correct: prior?.correct ?? selectedIndex === q?.correctIndex,
            done: true,
            explanation: quiz?.feedbackEnabled ? q?.explanation : undefined,
            pageRef: quiz?.feedbackEnabled ? q?.pageRef : undefined,
            correctIndex: quiz?.feedbackEnabled ? q?.correctIndex : undefined,
            attempt,
            assignmentMeta: null as null,
          };
        }
        throw new ForgeError("VALIDATION_FAILED", "Attempt is not in progress");
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");
      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
        ),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const correct = selectedIndex === q.correctIndex;
      const answers = [...(attempt.answers as AnswerRow[])];
      const existingIdx = answers.findIndex((a) => a.questionId === questionId);
      const row: AnswerRow = {
        questionId,
        selectedIndex,
        correct,
        answeredAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) answers[existingIdx] = row;
      else answers.push(row);

      const mastery = {
        remaining: [
          ...((attempt.masteryState as { remaining?: string[] })?.remaining ??
            (attempt.questionIds as string[])),
        ],
        mastered: [...((attempt.masteryState as { mastered?: string[] })?.mastered ?? [])],
      };
      if (correct && !mastery.mastered.includes(questionId)) {
        mastery.mastered.push(questionId);
        mastery.remaining = mastery.remaining.filter((id) => id !== questionId);
      }

      const scoreCorrect = answers.filter((a) => a.correct).length;
      let nextIndex = attempt.currentIndex;
      if (quiz.mode === "STANDARD") nextIndex = attempt.currentIndex + 1;

      const adaptiveDone =
        quiz.mode === "ADAPTIVE" &&
        mastery.mastered.length >= (attempt.questionIds as string[]).length;
      const standardDone =
        quiz.mode === "STANDARD" && nextIndex >= (attempt.questionIds as string[]).length;
      const done = adaptiveDone || standardDone;

      const now = new Date();
      const [updated] = await tx
        .update(industrialTrainingAttempts)
        .set({
          answers,
          masteryState: mastery,
          currentIndex: nextIndex,
          scoreCorrect,
          scoreTotal:
            quiz.mode === "ADAPTIVE"
              ? (attempt.questionIds as string[]).length
              : attempt.scoreTotal,
          status: done ? "COMPLETED" : "IN_PROGRESS",
          completedAt: done ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();

      let assignmentMeta: {
        assignmentId: string;
        passingPercent: number;
        sourceTitle: string;
        percent: number;
      } | null = null;
      if (done && updated!.assignmentId) {
        const assignment = await tx.query.industrialTrainingAssignments.findFirst({
          where: eq(industrialTrainingAssignments.id, updated!.assignmentId!),
        });
        const source = await tx.query.industrialTrainingSources.findFirst({
          where: eq(industrialTrainingSources.id, attempt.sourceId),
        });
        const total = Math.max(updated!.scoreTotal, (updated!.answers as AnswerRow[]).length, 1);
        assignmentMeta = {
          assignmentId: updated!.assignmentId!,
          passingPercent: assignment?.passingPercent ?? 70,
          sourceTitle: source?.title ?? "Training",
          percent: Math.round((updated!.scoreCorrect / total) * 100),
        };
      }

      return {
        correct,
        done,
        explanation: quiz.feedbackEnabled ? q.explanation : undefined,
        pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        correctIndex: quiz.feedbackEnabled ? q.correctIndex : undefined,
        attempt: updated,
        assignmentMeta,
      };
    });

    if (result.done && result.assignmentMeta) {
      try {
        await this.assignments.syncQuizCompletionByEmployeeNumber({
          tenantId,
          employeeNumber: normalized,
          assignmentId: result.assignmentMeta.assignmentId,
          attemptId,
          sourceId: result.attempt!.sourceId,
          sourceTitle: result.assignmentMeta.sourceTitle,
          percent: result.assignmentMeta.percent,
          passingPercent: result.assignmentMeta.passingPercent,
        });
      } catch (err) {
        this.logger.error(
          `Public quiz completion sync failed for attempt ${attemptId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const { assignmentMeta: _meta, ...response } = result;
    return response;
  }

  async getResultsPublic(tenantId: string, employeeNumber: string, attemptId: string) {
    const normalized = employeeNumber.trim();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttemptForEmployee(tx, tenantId, attemptId, normalized);
      const answers = attempt.answers as AnswerRow[];
      const total = Math.max(attempt.scoreTotal, answers.length, 1);
      const pct = Math.round((attempt.scoreCorrect / total) * 100);
      return {
        attempt,
        scoreCorrect: attempt.scoreCorrect,
        scoreTotal: total,
        percent: pct,
        letterGrade: letterGrade(pct),
        wrongQuestionIds: answers.filter((a) => !a.correct).map((a) => a.questionId),
        bookmarkedQuestionIds: attempt.bookmarks as string[],
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireAttemptForEmployee(
    tx: any,
    tenantId: string,
    attemptId: string,
    employeeNumber: string,
  ) {
    const row = await tx.query.industrialTrainingAttempts.findFirst({
      where: and(
        eq(industrialTrainingAttempts.id, attemptId),
        eq(industrialTrainingAttempts.tenantId, tenantId),
        sql`lower(trim(${industrialTrainingAttempts.employeeNumber})) = lower(${employeeNumber.trim()})`,
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Attempt not found");
    return row;
  }

  /** Printable paper quiz (trainee sheet) or instructor answer key for a course. */
  async getPaperQuizPrintable(
    principal: ForgePrincipal,
    sourceId: string,
    variant: "trainee" | "key" = "trainee",
  ): Promise<{ html: string; filename: string; contentType: string }> {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const source = await this.requireSource(tx, tenantId, sourceId);
      const questions = await tx
        .select()
        .from(industrialTrainingQuestions)
        .where(
          and(
            eq(industrialTrainingQuestions.tenantId, tenantId),
            eq(industrialTrainingQuestions.sourceId, sourceId),
            eq(industrialTrainingQuestions.status, "PUBLISHED"),
            isNull(industrialTrainingQuestions.archivedAt),
          ),
        )
        .orderBy(asc(industrialTrainingQuestions.createdAt));

      if (!questions.length) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "This course has no published questions to print.",
        );
      }

      const tenantRows = await tx.execute(sql`
        select tenant_key::text as tenant_key,
          display_name::text as display_name,
          legal_name::text as legal_name
        from tenants
        where id = ${tenantId}::uuid
        limit 1
      `);
      const tenantRow = (
        Array.isArray(tenantRows)
          ? tenantRows[0]
          : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
      ) as Record<string, unknown> | undefined;

      const brandingRows = await tx.execute(sql`
        select cv.payload_json as payload
        from config_objects co
        join config_versions cv on cv.id = co.current_published_version_id
        where co.tenant_id = ${tenantId}::uuid
          and co.namespace = 'branding'
          and co.object_key = 'default'
        limit 1
      `);
      const brandingPayloadRaw = (
        Array.isArray(brandingRows)
          ? brandingRows[0]
          : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]
      ) as { payload?: unknown } | undefined;
      const brandingPayload = unwrapJsonRecord(brandingPayloadRaw?.payload);
      const tenantKey = String(tenantRow?.tenant_key ?? "").trim();
      const companyName =
        String(
          brandingPayload.productDisplayName ??
            tenantRow?.display_name ??
            tenantRow?.legal_name ??
            "",
        ).trim() || null;
      const logoUrl =
        String(brandingPayload.logoUrl ?? brandingPayload.logo_url ?? "").trim() ||
        (tenantKey === "producers-rice-mill"
          ? "https://producersrice.forgeindustrialsafety.com/branding/producers-rice-mill.png"
          : null);

      const html = buildPaperQuizPrintableHtml({
        courseTitle: source.title,
        edition: source.edition,
        description: source.description,
        variant,
        branding: {
          companyName,
          logoUrl,
        },
        questions: questions.map((q) => ({
          stem: q.stem,
          choices: Array.isArray(q.choices) ? (q.choices as string[]) : [],
          correctIndex: q.correctIndex,
          pageRef: q.pageRef,
        })),
      });

      const slug =
        source.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "quiz";
      const filename = variant === "key" ? `${slug}-answer-key.html` : `${slug}-paper-quiz.html`;

      return { html, filename, contentType: "text/html; charset=utf-8" };
    });
  }
}
