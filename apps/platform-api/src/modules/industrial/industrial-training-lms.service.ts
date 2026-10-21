import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  createId,
  industrialDepartments,
  industrialPersonnel,
  industrialSites,
  industrialTrainingAccessLinks,
  industrialTrainingAcknowledgements,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingAttempts,
  industrialTrainingCompletions,
  industrialTrainingCourseSections,
  industrialTrainingCourseVersions,
  industrialTrainingPortalRateLimits,
  industrialTrainingProgress,
  industrialTrainingQuestions,
  industrialTrainingRecords,
  industrialTrainingSources,
  tenantSettings,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  employeeNumberLookupKeys,
  findPersonnelByEmployeeNumber,
} from "./employee-number.js";
import { unwrapJsonRecord } from "./form-print.js";
import { readTrainingRecordAttachments } from "./industrial-training-record-attachments.service.js";
import { notifyTrainingAssigned } from "./notify-training-assigned.js";
import {
  openPortalToken,
  readSealedPortalToken,
  withSealedPortalToken,
  withoutSealedPortalToken,
} from "./portal-token-crypto.js";
import { qrCodePngBuffer } from "./qr-svg.js";
import type { CompletionQuizItem, TrainingPrintBranding } from "./training-personnel-report.js";
import {
  buildCompletionPrintableHtml,
  buildPersonnelTrainingReportHtml,
  buildTrainingRecordPrintableHtml,
} from "./training-personnel-report.js";
import { isActivePersonnelStatus, personnelIsActive } from "./personnel-status.js";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 8;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function issueToken(): string {
  return randomBytes(32).toString("base64url");
}

function accessPublicUrl(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/training/access/${encodeURIComponent(token)}`;
}

@Injectable()
export class IndustrialTrainingLmsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async resolveAccessLinkTenantId(tokenHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_training_tenant_for_access_link(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  async checkRateLimit(tenantId: string, bucketKey: string, failed: boolean) {
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialTrainingPortalRateLimits)
        .where(
          and(
            eq(industrialTrainingPortalRateLimits.tenantId, tenantId),
            eq(industrialTrainingPortalRateLimits.bucketKey, bucketKey),
          ),
        )
        .limit(1);

      if (row?.blockedUntil && row.blockedUntil > now) {
        throw new ForgeError(
          "RATE_LIMITED",
          "Too many failed attempts. Please wait and try again.",
        );
      }

      if (!row) {
        if (!failed) return;
        await tx.insert(industrialTrainingPortalRateLimits).values({
          id: createId(),
          tenantId,
          bucketKey,
          failedAttempts: 1,
          windowStartedAt: now,
          updatedAt: now,
        });
        return;
      }

      const windowExpired =
        now.getTime() - row.windowStartedAt.getTime() > RATE_LIMIT_WINDOW_MS;
      const failedAttempts = windowExpired ? (failed ? 1 : 0) : row.failedAttempts + (failed ? 1 : 0);
      const blockedUntil =
        failedAttempts >= RATE_LIMIT_MAX_FAILURES
          ? new Date(now.getTime() + RATE_LIMIT_BLOCK_MS)
          : null;

      await tx
        .update(industrialTrainingPortalRateLimits)
        .set({
          failedAttempts,
          windowStartedAt: windowExpired ? now : row.windowStartedAt,
          blockedUntil,
          updatedAt: now,
        })
        .where(eq(industrialTrainingPortalRateLimits.id, row.id));

      if (blockedUntil) {
        throw new ForgeError(
          "RATE_LIMITED",
          "Too many failed attempts. Please wait and try again.",
        );
      }
    });
  }

  async listAccessLinks(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(
          and(
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
            isNull(industrialTrainingAccessLinks.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingAccessLinks.updatedAt));
      return rows.map((r) => ({
        id: r.id,
        linkType: r.linkType,
        title: r.title,
        description: r.description,
        sourceId: r.sourceId,
        assignmentId: r.assignmentId,
        siteId: r.siteId,
        departmentId: r.departmentId,
        status: r.status,
        expiresAt: r.expiresAt,
        allowSelfEnrollment: r.allowSelfEnrollment,
        assignedOnly: r.assignedOnly,
        hasToken: Boolean(r.publicTokenHash),
        tokenIssuedAt: r.publicTokenIssuedAt,
        updatedAt: r.updatedAt,
      }));
    });
  }

  async createAccessLink(
    principal: ForgePrincipal,
    body: {
      linkType?: string;
      title?: string;
      description?: string;
      sourceId?: string;
      assignmentId?: string;
      siteId?: string;
      departmentId?: string;
      expiresAt?: string | null;
      allowSelfEnrollment?: boolean;
      assignedOnly?: boolean;
      appBaseUrl?: string;
      issueQr?: boolean;
    },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    const linkType = String(body.linkType ?? "COMPANY_PORTAL").trim().toUpperCase();
    const now = new Date();
    const shouldIssueQr = body.issueQr !== false;
    const appBaseUrl = String(body.appBaseUrl ?? "").trim();
    const token = shouldIssueQr ? issueToken() : null;
    const tokenHash = token ? hashToken(token) : null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      await tx.insert(industrialTrainingAccessLinks).values({
        id,
        tenantId,
        linkType,
        title,
        description: body.description?.trim() || null,
        sourceId: body.sourceId?.trim() || null,
        assignmentId: body.assignmentId?.trim() || null,
        siteId: body.siteId?.trim() || null,
        departmentId: body.departmentId?.trim() || null,
        status: "ACTIVE",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        allowSelfEnrollment: Boolean(body.allowSelfEnrollment),
        assignedOnly: body.assignedOnly !== false,
        publicTokenHash: tokenHash,
        publicTokenIssuedAt: tokenHash ? now : null,
        policyJson: token ? withSealedPortalToken({}, tenantId, token) : {},
        createdByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });
      const [row] = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(eq(industrialTrainingAccessLinks.id, id))
        .limit(1);
      if (!token || !appBaseUrl) {
        return row;
      }
      const url = accessPublicUrl(appBaseUrl, token);
      const png = await qrCodePngBuffer(url);
      return {
        ...row,
        url,
        token,
        contentType: "image/png",
        dataBase64: png.toString("base64"),
      };
    });
  }

  async issueAccessLinkQr(principal: ForgePrincipal, linkId: string, appBaseUrl: string) {
    const tenantId = this.tenant(principal);
    const token = issueToken();
    const tokenHash = hashToken(token);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [link] = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(
          and(
            eq(industrialTrainingAccessLinks.id, linkId),
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
            isNull(industrialTrainingAccessLinks.archivedAt),
          ),
        )
        .limit(1);
      if (!link) throw new ForgeError("NOT_FOUND", "Access link not found");
      await tx
        .update(industrialTrainingAccessLinks)
        .set({
          publicTokenHash: tokenHash,
          publicTokenIssuedAt: now,
          policyJson: withSealedPortalToken(link.policyJson, tenantId, token),
          updatedAt: now,
        })
        .where(eq(industrialTrainingAccessLinks.id, linkId));
      const url = accessPublicUrl(appBaseUrl, token);
      const png = await qrCodePngBuffer(url);
      return { url, token, contentType: "image/png", dataBase64: png.toString("base64") };
    });
  }

  async revokeAccessLinkQr(principal: ForgePrincipal, linkId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [link] = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(
          and(
            eq(industrialTrainingAccessLinks.id, linkId),
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!link) throw new ForgeError("NOT_FOUND", "Access link not found");
      await tx
        .update(industrialTrainingAccessLinks)
        .set({
          publicTokenHash: null,
          publicTokenIssuedAt: null,
          policyJson: withoutSealedPortalToken(link.policyJson),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialTrainingAccessLinks.id, linkId),
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
          ),
        );
      return { revoked: true };
    });
  }

  async getPortalQrDisplay(principal: ForgePrincipal, appBaseUrl: string) {
    const tenantId = this.tenant(principal);
    const base = appBaseUrl.replace(/\/$/, "");
    if (!base) throw new ForgeError("VALIDATION_FAILED", "appBaseUrl is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(
          and(
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
            eq(industrialTrainingAccessLinks.linkType, "COMPANY_PORTAL"),
            eq(industrialTrainingAccessLinks.status, "ACTIVE"),
            isNull(industrialTrainingAccessLinks.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingAccessLinks.updatedAt));

      const link = rows.find((row) => Boolean(row.publicTokenHash)) ?? null;
      if (!link) {
        return { configured: false as const };
      }

      const sealed = readSealedPortalToken(link.policyJson);
      const token = sealed ? openPortalToken(tenantId, sealed) : null;
      if (!token) {
        return {
          configured: false as const,
          linkId: link.id,
          title: link.title,
          needsReissue: true as const,
        };
      }

      const url = accessPublicUrl(base, token);
      const png = await qrCodePngBuffer(url);
      return {
        configured: true as const,
        linkId: link.id,
        title: link.title,
        url,
        contentType: "image/png",
        dataBase64: png.toString("base64"),
      };
    });
  }

  async listVersions(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTrainingCourseVersions)
        .where(
          and(
            eq(industrialTrainingCourseVersions.tenantId, tenantId),
            eq(industrialTrainingCourseVersions.sourceId, sourceId),
            isNull(industrialTrainingCourseVersions.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingCourseVersions.versionNumber));
    });
  }

  async createVersion(
    principal: ForgePrincipal,
    sourceId: string,
    body: { versionLabel?: string; passingPercent?: number },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [source] = await tx
        .select()
        .from(industrialTrainingSources)
        .where(
          and(
            eq(industrialTrainingSources.id, sourceId),
            eq(industrialTrainingSources.tenantId, tenantId),
            isNull(industrialTrainingSources.archivedAt),
          ),
        )
        .limit(1);
      if (!source) throw new ForgeError("NOT_FOUND", "Course not found");

      const existing = await tx
        .select({ versionNumber: industrialTrainingCourseVersions.versionNumber })
        .from(industrialTrainingCourseVersions)
        .where(
          and(
            eq(industrialTrainingCourseVersions.sourceId, sourceId),
            eq(industrialTrainingCourseVersions.tenantId, tenantId),
          ),
        )
        .orderBy(desc(industrialTrainingCourseVersions.versionNumber))
        .limit(1);
      const nextNumber = (existing[0]?.versionNumber ?? 0) + 1;
      const now = new Date();
      const id = createId();
      await tx.insert(industrialTrainingCourseVersions).values({
        id,
        tenantId,
        sourceId,
        versionNumber: nextNumber,
        versionLabel: body.versionLabel?.trim() || `Version ${nextNumber}`,
        passingPercent: body.passingPercent ?? 70,
        status: "DRAFT",
        createdByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });
      const [row] = await tx
        .select()
        .from(industrialTrainingCourseVersions)
        .where(eq(industrialTrainingCourseVersions.id, id))
        .limit(1);
      return row;
    });
  }

  async publishVersion(principal: ForgePrincipal, versionId: string) {
    const tenantId = this.tenant(principal);
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const completionCount = await tx
        .select({ id: industrialTrainingCompletions.id })
        .from(industrialTrainingCompletions)
        .where(
          and(
            eq(industrialTrainingCompletions.versionId, versionId),
            eq(industrialTrainingCompletions.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (completionCount.length) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Cannot mutate a version that has completion records",
        );
      }
      const [row] = await tx
        .update(industrialTrainingCourseVersions)
        .set({ status: "PUBLISHED", publishedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialTrainingCourseVersions.id, versionId),
            eq(industrialTrainingCourseVersions.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Version not found");
      return row;
    });
  }

  async listSections(principal: ForgePrincipal, versionId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTrainingCourseSections)
        .where(
          and(
            eq(industrialTrainingCourseSections.tenantId, tenantId),
            eq(industrialTrainingCourseSections.versionId, versionId),
            isNull(industrialTrainingCourseSections.archivedAt),
          ),
        )
        .orderBy(industrialTrainingCourseSections.sortOrder);
    });
  }

  async upsertSection(
    principal: ForgePrincipal,
    versionId: string,
    body: {
      id?: string;
      title?: string;
      sortOrder?: number;
      required?: boolean;
      contentJson?: unknown[];
      estimatedMinutes?: number | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (body.id) {
        const [row] = await tx
          .update(industrialTrainingCourseSections)
          .set({
            title,
            sortOrder: body.sortOrder ?? 0,
            required: body.required !== false,
            contentJson: body.contentJson ?? [],
            estimatedMinutes: body.estimatedMinutes ?? null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialTrainingCourseSections.id, body.id),
              eq(industrialTrainingCourseSections.tenantId, tenantId),
              eq(industrialTrainingCourseSections.versionId, versionId),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Section not found");
        return row;
      }
      const id = createId();
      await tx.insert(industrialTrainingCourseSections).values({
        id,
        tenantId,
        versionId,
        title,
        sortOrder: body.sortOrder ?? 0,
        required: body.required !== false,
        contentJson: body.contentJson ?? [],
        estimatedMinutes: body.estimatedMinutes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      const [row] = await tx
        .select()
        .from(industrialTrainingCourseSections)
        .where(eq(industrialTrainingCourseSections.id, id))
        .limit(1);
      return row;
    });
  }

  async recordCompletion(
    input: {
      tenantId: string;
      assignmentId: string;
      assigneeId: string;
      personnelId: string | null;
      employeeNumber: string;
      sourceId: string;
      versionId: string | null;
      attemptId: string | null;
      attemptNumber: number;
      scorePercent: number;
      passingPercent: number;
      passed: boolean;
      snapshot: Record<string, unknown>;
    },
    // Prefer the caller's tenant tx to avoid nested pool transactions during quiz finish.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingTx?: any,
  ) {
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = async (tx: any) => {
      if (!input.passed) {
        await tx.insert(industrialTrainingCompletions).values({
          id: createId(),
          tenantId: input.tenantId,
          assignmentId: input.assignmentId,
          assigneeId: input.assigneeId,
          personnelId: input.personnelId,
          employeeNumber: input.employeeNumber,
          sourceId: input.sourceId,
          versionId: input.versionId,
          attemptId: input.attemptId,
          attemptNumber: input.attemptNumber,
          scorePercent: input.scorePercent,
          passingPercent: input.passingPercent,
          result: "FAILED",
          snapshotJson: input.snapshot,
          completedAt: now,
        });
        return null;
      }

      const existing = await tx
        .select({ id: industrialTrainingCompletions.id })
        .from(industrialTrainingCompletions)
        .where(
          and(
            eq(industrialTrainingCompletions.assigneeId, input.assigneeId),
            eq(industrialTrainingCompletions.result, "PASSED"),
            input.versionId
              ? eq(industrialTrainingCompletions.versionId, input.versionId)
              : isNull(industrialTrainingCompletions.versionId),
          ),
        )
        .limit(1);
      if (existing.length) return existing[0];

      const id = createId();
      await tx.insert(industrialTrainingCompletions).values({
        id,
        tenantId: input.tenantId,
        assignmentId: input.assignmentId,
        assigneeId: input.assigneeId,
        personnelId: input.personnelId,
        employeeNumber: input.employeeNumber,
        sourceId: input.sourceId,
        versionId: input.versionId,
        attemptId: input.attemptId,
        attemptNumber: input.attemptNumber,
        scorePercent: input.scorePercent,
        passingPercent: input.passingPercent,
        result: "PASSED",
        snapshotJson: input.snapshot,
        completedAt: now,
      });
      return { id };
    };
    if (existingTx) return run(existingTx);
    return withTenantTransaction(this.db, input.tenantId, run);
  }

  async getProgress(
    tenantId: string,
    assigneeId: string,
  ): Promise<typeof industrialTrainingProgress.$inferSelect | null> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialTrainingProgress)
        .where(
          and(
            eq(industrialTrainingProgress.tenantId, tenantId),
            eq(industrialTrainingProgress.assigneeId, assigneeId),
          ),
        )
        .limit(1);
      return row ?? null;
    });
  }

  async upsertProgress(input: {
    tenantId: string;
    assignmentId: string;
    assigneeId: string;
    personnelId: string | null;
    employeeNumber: string;
    versionId: string | null;
    sectionId: string | null;
    sectionsCompleted: string[];
    percentComplete: number;
    quizAvailable: boolean;
  }) {
    const now = new Date();
    return withTenantTransaction(this.db, input.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialTrainingProgress)
        .where(eq(industrialTrainingProgress.assigneeId, input.assigneeId))
        .limit(1);
      if (existing) {
        const [row] = await tx
          .update(industrialTrainingProgress)
          .set({
            currentSectionId: input.sectionId,
            sectionsCompleted: input.sectionsCompleted,
            percentComplete: input.percentComplete,
            quizAvailable: input.quizAvailable,
            contentCompletedAt: input.quizAvailable ? now : existing.contentCompletedAt,
            lastAccessedAt: now,
            updatedAt: now,
          })
          .where(eq(industrialTrainingProgress.id, existing.id))
          .returning();
        return row;
      }
      const id = createId();
      await tx.insert(industrialTrainingProgress).values({
        id,
        tenantId: input.tenantId,
        assignmentId: input.assignmentId,
        assigneeId: input.assigneeId,
        personnelId: input.personnelId,
        employeeNumber: input.employeeNumber,
        versionId: input.versionId,
        currentSectionId: input.sectionId,
        sectionsCompleted: input.sectionsCompleted,
        percentComplete: input.percentComplete,
        quizAvailable: input.quizAvailable,
        firstOpenedAt: now,
        lastAccessedAt: now,
        contentCompletedAt: input.quizAvailable ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      const [row] = await tx
        .select()
        .from(industrialTrainingProgress)
        .where(eq(industrialTrainingProgress.id, id))
        .limit(1);
      return row;
    });
  }

  buildPortalAssignmentSummary(
    assignments: Array<{ status: string; dueAt: Date | string | null }>,
  ) {
    const nowMs = Date.now();
    const dueSoonMs = 7 * 24 * 60 * 60 * 1000;
    return {
      assigned: assignments.length,
      completed: assignments.filter((a) => a.status === "PASSED").length,
      remaining: assignments.filter((a) => a.status !== "PASSED").length,
      overdue: assignments.filter(
        (a) => a.dueAt && a.status !== "PASSED" && new Date(a.dueAt).getTime() < nowMs,
      ).length,
      dueSoon: assignments.filter((a) => {
        if (!a.dueAt || a.status === "PASSED") return false;
        const due = new Date(a.dueAt).getTime();
        return due >= nowMs && due <= nowMs + dueSoonMs;
      }).length,
      certifications: assignments.filter((a) => a.status === "PASSED").length,
    };
  }

  async findActivePersonnelByEmployeeNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    employeeNumber: string,
  ) {
    const person = await findPersonnelByEmployeeNumber(tx, tenantId, employeeNumber);
    if (!person || !isActivePersonnelStatus(person.status)) return null;
    return person;
  }

  async getPortalTenantConfig(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => this.readPortalTenantConfig(tx, tenantId));
  }

  async readPortalTenantConfig(tx: DatabaseTransaction, tenantId: string) {
    const [row] = await tx
      .select()
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, "industrial.training"),
          eq(tenantSettings.settingKey, "portal"),
        ),
      )
      .limit(1);
    const value = unwrapJsonRecord(row?.valueJson ?? {});
    const prefix =
      typeof value.employeeNumberPrefix === "string" && value.employeeNumberPrefix.trim()
        ? value.employeeNumberPrefix.trim()
        : "EMP-";
    const portalEnabled = value.portalEnabled !== false;
    return {
      employeeNumberPrefix: prefix,
      portalEnabled,
      employeeNumberHint:
        typeof value.employeeNumberHint === "string" ? value.employeeNumberHint : null,
    };
  }

  async upsertPortalTenantConfig(
    principal: ForgePrincipal,
    body: {
      employeeNumberPrefix?: string;
      portalEnabled?: boolean;
      employeeNumberHint?: string | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existingRow] = await tx
        .select()
        .from(tenantSettings)
        .where(
          and(
            eq(tenantSettings.tenantId, tenantId),
            eq(tenantSettings.namespace, "industrial.training"),
            eq(tenantSettings.settingKey, "portal"),
          ),
        )
        .limit(1);
      const existingValue = unwrapJsonRecord(existingRow?.valueJson ?? {});
      const existing = {
        employeeNumberPrefix:
          typeof existingValue.employeeNumberPrefix === "string" &&
          existingValue.employeeNumberPrefix.trim()
            ? existingValue.employeeNumberPrefix.trim()
            : "EMP-",
        portalEnabled: existingValue.portalEnabled !== false,
        employeeNumberHint:
          typeof existingValue.employeeNumberHint === "string"
            ? existingValue.employeeNumberHint
            : null,
      };
      const next = {
        employeeNumberPrefix: body.employeeNumberPrefix?.trim() || existing.employeeNumberPrefix,
        portalEnabled:
          typeof body.portalEnabled === "boolean" ? body.portalEnabled : existing.portalEnabled,
        employeeNumberHint:
          body.employeeNumberHint === undefined
            ? existing.employeeNumberHint
            : body.employeeNumberHint?.trim() || null,
      };
      const now = new Date();
      if (existingRow) {
        await tx
          .update(tenantSettings)
          .set({ valueJson: next, updatedAt: now })
          .where(eq(tenantSettings.id, existingRow.id));
      } else {
        await tx.insert(tenantSettings).values({
          id: createId(),
          tenantId,
          namespace: "industrial.training",
          settingKey: "portal",
          valueJson: next,
          createdAt: now,
          updatedAt: now,
        });
      }
      return next;
    });
  }

  async listEmployeeAssignments(tenantId: string, employeeNumber: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const keys = employeeNumberLookupKeys(employeeNumber);
      const numberClause =
        keys.length > 0
          ? or(
              ...keys.map(
                (key) =>
                  sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = ${key}`,
              ),
            )
          : sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`;
      const rows = await tx
        .select({
          assignee: industrialTrainingAssignmentAssignees,
          assignment: industrialTrainingAssignments,
          sourceTitle: industrialTrainingSources.title,
        })
        .from(industrialTrainingAssignmentAssignees)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingAssignmentAssignees.assignmentId, industrialTrainingAssignments.id),
        )
        .innerJoin(
          industrialTrainingSources,
          eq(industrialTrainingAssignments.sourceId, industrialTrainingSources.id),
        )
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            numberClause,
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        )
        .orderBy(desc(industrialTrainingAssignments.dueAt));
      return rows.map((r) => ({
        assignmentId: r.assignment.id,
        assigneeId: r.assignee.id,
        title: r.assignment.title,
        sourceTitle: r.sourceTitle,
        status: r.assignee.status,
        dueAt: r.assignment.dueAt,
        passingPercent: r.assignment.passingPercent,
        bestPercent: r.assignee.bestPercent,
        completedAt: r.assignee.completedAt,
        publicTokenHash: r.assignment.publicTokenHash,
      }));
    });
  }

  async bulkAssignByOrg(
    principal: ForgePrincipal,
    assignmentId: string,
    filters: {
      departmentId?: string;
      siteId?: string;
      positionId?: string;
      jobTitle?: string;
      companyWide?: boolean;
    },
  ) {
    const tenantId = this.tenant(principal);
    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select({
          id: industrialTrainingAssignments.id,
          title: industrialTrainingAssignments.title,
        })
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Assignment not found");

      const conditions = [
        eq(industrialPersonnel.tenantId, tenantId),
        isNull(industrialPersonnel.archivedAt),
        personnelIsActive(),
      ];
      if (!filters.companyWide) {
        if (filters.departmentId) {
          conditions.push(eq(industrialPersonnel.departmentId, filters.departmentId));
        }
        if (filters.siteId) {
          conditions.push(eq(industrialPersonnel.siteId, filters.siteId));
        }
        if (filters.positionId) {
          conditions.push(eq(industrialPersonnel.positionId, filters.positionId));
        }
        if (filters.jobTitle?.trim()) {
          conditions.push(
            sql`lower(trim(${industrialPersonnel.jobTitle})) = lower(${filters.jobTitle.trim()})`,
          );
        }
        if (
          !filters.departmentId &&
          !filters.siteId &&
          !filters.positionId &&
          !filters.jobTitle?.trim()
        ) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Provide departmentId, siteId, positionId, jobTitle, or companyWide",
          );
        }
      }
      const people = await tx
        .select({
          id: industrialPersonnel.id,
          employeeNumber: industrialPersonnel.employeeNumber,
        })
        .from(industrialPersonnel)
        .where(and(...conditions));
      const seeds = people
        .filter((p) => p.employeeNumber?.trim())
        .map((p) => ({ personnelId: p.id, employeeNumber: p.employeeNumber!.trim() }));
      if (!seeds.length) {
        return { added: 0, notifyPersonnelIds: [] as string[], title: assignment.title };
      }

      const now = new Date();
      let added = 0;
      const notifyPersonnelIds: string[] = [];
      for (const seed of seeds) {
        const existing = await tx
          .select({ id: industrialTrainingAssignmentAssignees.id })
          .from(industrialTrainingAssignmentAssignees)
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
              eq(industrialTrainingAssignmentAssignees.personnelId, seed.personnelId),
            ),
          )
          .limit(1);
        if (existing.length) continue;
        await tx.insert(industrialTrainingAssignmentAssignees).values({
          id: createId(),
          tenantId,
          assignmentId,
          personnelId: seed.personnelId,
          employeeNumber: seed.employeeNumber,
          status: "NOT_STARTED",
          createdAt: now,
          updatedAt: now,
        });
        added += 1;
        notifyPersonnelIds.push(seed.personnelId);
      }
      return { added, notifyPersonnelIds, title: assignment.title };
    });

    if (result.notifyPersonnelIds.length) {
      await notifyTrainingAssigned(this.db, this.notifications, principal, {
        assignmentId,
        title: result.title,
        personnelIds: result.notifyPersonnelIds,
      });
    }
    return { added: result.added };
  }

  async getComplianceMatrix(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const courses = await tx
        .select({
          sourceId: industrialTrainingSources.id,
          title: industrialTrainingSources.title,
        })
        .from(industrialTrainingSources)
        .where(
          and(
            eq(industrialTrainingSources.tenantId, tenantId),
            isNull(industrialTrainingSources.archivedAt),
          ),
        )
        .orderBy(industrialTrainingSources.title);

      const people = await tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          departmentId: industrialPersonnel.departmentId,
          siteId: industrialPersonnel.siteId,
          jobTitle: industrialPersonnel.jobTitle,
          departmentName: industrialDepartments.name,
          siteName: industrialSites.name,
        })
        .from(industrialPersonnel)
        .leftJoin(
          industrialDepartments,
          eq(industrialPersonnel.departmentId, industrialDepartments.id),
        )
        .leftJoin(industrialSites, eq(industrialPersonnel.siteId, industrialSites.id))
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
            personnelIsActive(),
          ),
        )
        .orderBy(industrialPersonnel.displayName);

      const assigneeRows = await tx
        .select({
          personnelId: industrialTrainingAssignmentAssignees.personnelId,
          employeeNumber: industrialTrainingAssignmentAssignees.employeeNumber,
          status: industrialTrainingAssignmentAssignees.status,
          bestPercent: industrialTrainingAssignmentAssignees.bestPercent,
          completedAt: industrialTrainingAssignmentAssignees.completedAt,
          dueAt: industrialTrainingAssignments.dueAt,
          sourceId: industrialTrainingAssignments.sourceId,
          assignmentTitle: industrialTrainingAssignments.title,
        })
        .from(industrialTrainingAssignmentAssignees)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingAssignmentAssignees.assignmentId, industrialTrainingAssignments.id),
        )
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        );

      type Cell = {
        status: string;
        bestPercent: number | null;
        completedAt: string | null;
        dueAt: string | null;
        assignmentTitle: string;
      };
      const byPersonCourse = new Map<string, Cell>();
      for (const row of assigneeRows) {
        const personKey = row.personnelId ?? row.employeeNumber?.trim().toLowerCase() ?? "";
        if (!personKey || !row.sourceId) continue;
        const key = `${personKey}::${row.sourceId}`;
        const next: Cell = {
          status: row.status,
          bestPercent: row.bestPercent,
          completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
          dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null,
          assignmentTitle: row.assignmentTitle,
        };
        const prev = byPersonCourse.get(key);
        if (!prev || (prev.status !== "PASSED" && next.status === "PASSED")) {
          byPersonCourse.set(key, next);
        }
      }

      const rows = people.map((person) => {
        const personKey = person.id;
        const cells: Record<string, Cell | null> = {};
        for (const course of courses) {
          cells[course.sourceId] = byPersonCourse.get(`${personKey}::${course.sourceId}`) ?? null;
        }
        return {
          personnelId: person.id,
          displayName: person.displayName,
          employeeNumber: person.employeeNumber,
          departmentName: person.departmentName,
          siteName: person.siteName,
          jobTitle: person.jobTitle,
          cells,
        };
      });

      return { courses, rows };
    });
  }

  async recordAcknowledgement(input: {
    tenantId: string;
    employeeNumber: string;
    personnelId: string | null;
    progressId?: string | null;
    completionId?: string | null;
    versionId?: string | null;
    acknowledgementText: string;
    requestMetadata?: Record<string, unknown>;
  }) {
    const text = input.acknowledgementText.trim();
    if (!text) throw new ForgeError("VALIDATION_FAILED", "acknowledgementText is required");
    const now = new Date();
    return withTenantTransaction(this.db, input.tenantId, async (tx) => {
      const id = createId();
      await tx.insert(industrialTrainingAcknowledgements).values({
        id,
        tenantId: input.tenantId,
        progressId: input.progressId ?? null,
        completionId: input.completionId ?? null,
        personnelId: input.personnelId,
        employeeNumber: input.employeeNumber,
        versionId: input.versionId ?? null,
        acknowledgementText: text,
        acknowledgedAt: now,
        requestMetadata: input.requestMetadata ?? {},
        createdAt: now,
      });
      return { id, acknowledgedAt: now.toISOString() };
    });
  }

  async getQcDashboard(
    principal: ForgePrincipal,
    options: { sourceId?: string; days?: number } = {},
  ) {
    const tenantId = this.tenant(principal);
    const sourceId = options.sourceId?.trim() || undefined;
    const days =
      typeof options.days === "number" && Number.isFinite(options.days) && options.days > 0
        ? Math.min(Math.floor(options.days), 3650)
        : undefined;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const sources = await tx
        .select({
          id: industrialTrainingSources.id,
          title: industrialTrainingSources.title,
        })
        .from(industrialTrainingSources)
        .where(
          and(
            eq(industrialTrainingSources.tenantId, tenantId),
            isNull(industrialTrainingSources.archivedAt),
          ),
        )
        .orderBy(industrialTrainingSources.title)
        .limit(200);

      const sourceTitleById = new Map(sources.map((s) => [s.id, s.title]));

      const questionWhere = [
        eq(industrialTrainingQuestions.tenantId, tenantId),
        isNull(industrialTrainingQuestions.archivedAt),
        ...(sourceId ? [eq(industrialTrainingQuestions.sourceId, sourceId)] : []),
      ];

      const questions = await tx
        .select({
          id: industrialTrainingQuestions.id,
          stem: industrialTrainingQuestions.stem,
          sourceId: industrialTrainingQuestions.sourceId,
        })
        .from(industrialTrainingQuestions)
        .where(and(...questionWhere))
        .limit(500);

      const attemptWhere = [
        eq(industrialTrainingAttempts.tenantId, tenantId),
        eq(industrialTrainingAttempts.status, "COMPLETED"),
        ...(sourceId ? [eq(industrialTrainingAttempts.sourceId, sourceId)] : []),
        ...(since ? [gte(industrialTrainingAttempts.completedAt, since)] : []),
      ];

      const attempts = await tx
        .select({
          answers: industrialTrainingAttempts.answers,
          sourceId: industrialTrainingAttempts.sourceId,
          scoreCorrect: industrialTrainingAttempts.scoreCorrect,
          scoreTotal: industrialTrainingAttempts.scoreTotal,
          completedAt: industrialTrainingAttempts.completedAt,
        })
        .from(industrialTrainingAttempts)
        .where(and(...attemptWhere))
        .limit(8000);

      const inProgressRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.status, "IN_PROGRESS"),
            ...(sourceId ? [eq(industrialTrainingAttempts.sourceId, sourceId)] : []),
          ),
        );

      const stats = new Map<
        string,
        { presented: number; correct: number; incorrect: number; stem: string; sourceId: string }
      >();
      for (const q of questions) {
        stats.set(q.id, {
          presented: 0,
          correct: 0,
          incorrect: 0,
          stem: q.stem,
          sourceId: q.sourceId,
        });
      }

      for (const attempt of attempts) {
        const answers = (attempt.answers ?? []) as Array<{
          questionId?: string;
          correct?: boolean;
        }>;
        for (const a of answers) {
          const qid = a.questionId;
          if (!qid || !stats.has(qid)) continue;
          const row = stats.get(qid)!;
          row.presented += 1;
          if (a.correct) row.correct += 1;
          else row.incorrect += 1;
        }
      }

      const questionStats = [...stats.values()]
        .filter((s) => s.presented > 0)
        .map((s) => ({
          stem: s.stem,
          sourceId: s.sourceId,
          sourceTitle: sourceTitleById.get(s.sourceId) ?? "Course",
          presented: s.presented,
          correct: s.correct,
          incorrect: s.incorrect,
          correctRate: Math.round((s.correct / s.presented) * 100),
        }))
        .sort((a, b) => a.correctRate - b.correctRate || b.presented - a.presented);

      const completionWhere = [
        eq(industrialTrainingCompletions.tenantId, tenantId),
        ...(sourceId ? [eq(industrialTrainingCompletions.sourceId, sourceId)] : []),
        ...(since ? [gte(industrialTrainingCompletions.completedAt, since)] : []),
      ];

      const completions = await tx
        .select({
          id: industrialTrainingCompletions.id,
          result: industrialTrainingCompletions.result,
          scorePercent: industrialTrainingCompletions.scorePercent,
          attemptNumber: industrialTrainingCompletions.attemptNumber,
          sourceId: industrialTrainingCompletions.sourceId,
          employeeNumber: industrialTrainingCompletions.employeeNumber,
          completedAt: industrialTrainingCompletions.completedAt,
          passingPercent: industrialTrainingCompletions.passingPercent,
        })
        .from(industrialTrainingCompletions)
        .where(and(...completionWhere))
        .orderBy(desc(industrialTrainingCompletions.completedAt))
        .limit(10000);

      const passed = completions.filter((c) => c.result === "PASSED");
      const failed = completions.filter((c) => c.result === "FAILED");
      const firstAttempts = completions.filter((c) => c.attemptNumber <= 1);
      const firstAttemptPasses = firstAttempts.filter((c) => c.result === "PASSED").length;
      const passRate = completions.length
        ? Math.round((passed.length / completions.length) * 100)
        : 0;
      const firstAttemptPassRate = firstAttempts.length
        ? Math.round((firstAttemptPasses / firstAttempts.length) * 100)
        : 0;
      const avgScore = completions.length
        ? Math.round(
            completions.reduce((sum, c) => sum + (c.scorePercent ?? 0), 0) / completions.length,
          )
        : 0;
      const avgAttemptsToPass = passed.length
        ? Math.round(
            (passed.reduce((sum, c) => sum + Math.max(1, c.attemptNumber || 1), 0) /
              passed.length) *
              10,
          ) / 10
        : 0;
      const uniqueLearners = new Set(completions.map((c) => c.employeeNumber.trim()).filter(Boolean))
        .size;

      const scoreBuckets = [
        { label: "0–49", min: 0, max: 49 },
        { label: "50–59", min: 50, max: 59 },
        { label: "60–69", min: 60, max: 69 },
        { label: "70–79", min: 70, max: 79 },
        { label: "80–89", min: 80, max: 89 },
        { label: "90–100", min: 90, max: 100 },
      ].map((bucket) => {
        const count = completions.filter(
          (c) => c.scorePercent >= bucket.min && c.scorePercent <= bucket.max,
        ).length;
        return {
          label: bucket.label,
          count,
          percent: completions.length ? Math.round((count / completions.length) * 100) : 0,
        };
      });

      const byCourseMap = new Map<
        string,
        { sourceId: string; title: string; completions: number; passed: number; scoreSum: number }
      >();
      for (const c of completions) {
        const row = byCourseMap.get(c.sourceId) ?? {
          sourceId: c.sourceId,
          title: sourceTitleById.get(c.sourceId) ?? "Course",
          completions: 0,
          passed: 0,
          scoreSum: 0,
        };
        row.completions += 1;
        if (c.result === "PASSED") row.passed += 1;
        row.scoreSum += c.scorePercent ?? 0;
        byCourseMap.set(c.sourceId, row);
      }
      const byCourse = [...byCourseMap.values()]
        .map((row) => ({
          sourceId: row.sourceId,
          title: row.title,
          completions: row.completions,
          passed: row.passed,
          failed: row.completions - row.passed,
          passRate: row.completions ? Math.round((row.passed / row.completions) * 100) : 0,
          avgScore: row.completions ? Math.round(row.scoreSum / row.completions) : 0,
        }))
        .sort((a, b) => b.completions - a.completions);

      const attemptMap = new Map<number, { attemptNumber: number; count: number; passed: number }>();
      for (const c of completions) {
        const n = Math.max(1, c.attemptNumber || 1);
        const row = attemptMap.get(n) ?? { attemptNumber: n, count: 0, passed: 0 };
        row.count += 1;
        if (c.result === "PASSED") row.passed += 1;
        attemptMap.set(n, row);
      }
      const attemptBreakdown = [...attemptMap.values()]
        .sort((a, b) => a.attemptNumber - b.attemptNumber)
        .map((row) => ({
          attemptNumber: row.attemptNumber,
          count: row.count,
          passed: row.passed,
          passRate: row.count ? Math.round((row.passed / row.count) * 100) : 0,
        }));

      const trendMap = new Map<string, { period: string; completions: number; passed: number }>();
      for (const c of completions) {
        const d = c.completedAt ? new Date(c.completedAt) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const row = trendMap.get(period) ?? { period, completions: 0, passed: 0 };
        row.completions += 1;
        if (c.result === "PASSED") row.passed += 1;
        trendMap.set(period, row);
      }
      const trend = [...trendMap.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-12)
        .map((row) => ({
          period: row.period,
          completions: row.completions,
          passed: row.passed,
          passRate: row.completions ? Math.round((row.passed / row.completions) * 100) : 0,
        }));

      const recentCompletions = completions.slice(0, 40).map((c) => ({
        id: c.id,
        employeeNumber: c.employeeNumber,
        sourceId: c.sourceId,
        sourceTitle: sourceTitleById.get(c.sourceId) ?? "Course",
        scorePercent: c.scorePercent,
        passingPercent: c.passingPercent,
        result: c.result,
        attemptNumber: c.attemptNumber,
        completedAt: c.completedAt?.toISOString?.() ?? String(c.completedAt),
      }));

      return {
        filters: {
          sourceId: sourceId ?? null,
          days: days ?? null,
          since: since?.toISOString() ?? null,
        },
        sources: sources.map((s) => ({ id: s.id, title: s.title })),
        summary: {
          totalCompletions: completions.length,
          passed: passed.length,
          failed: failed.length,
          passRate,
          firstAttemptPassRate,
          firstAttemptCount: firstAttempts.length,
          avgScore,
          avgAttemptsToPass,
          uniqueLearners,
          inProgressAttempts: Number(inProgressRows[0]?.count ?? 0),
          completedAttempts: attempts.length,
          questionsPresented: questionStats.reduce((sum, q) => sum + q.presented, 0),
        },
        scoreDistribution: scoreBuckets,
        byCourse,
        attemptBreakdown,
        trend,
        lowQuestions: questionStats.filter((q) => q.correctRate < 70).slice(0, 25),
        highQuestions: [...questionStats]
          .filter((q) => q.presented >= 3)
          .sort((a, b) => b.correctRate - a.correctRate || b.presented - a.presented)
          .slice(0, 10),
        questionStats: questionStats.slice(0, 50),
        recentCompletions,
      };
    });
  }

  async resolveLearnerForPrincipal(principal: ForgePrincipal): Promise<{
    tenantId: string;
    personnelId: string;
    employeeNumber: string | null;
    displayName: string | null;
  } | null> {
    const tenantId = this.tenant(principal);
    const userId = String(principal.userId ?? "").trim();
    if (!userId) return null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [person] = await tx
        .select({
          id: industrialPersonnel.id,
          employeeNumber: industrialPersonnel.employeeNumber,
          displayName: industrialPersonnel.displayName,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            eq(industrialPersonnel.userAuthId, userId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1);
      if (!person) return null;
      return {
        tenantId,
        personnelId: person.id,
        employeeNumber: person.employeeNumber?.trim() || null,
        displayName: person.displayName?.trim() || null,
      };
    });
  }

  async assertCanAccessPersonnelTraining(
    principal: ForgePrincipal,
    personnelId: string,
  ): Promise<void> {
    const targetId = String(personnelId ?? "").trim();
    if (!targetId) throw new ForgeError("VALIDATION_FAILED", "personnelId is required");
    const canBrowseOthers =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.training.view") ||
      principal.permissions.has("industrial.admin") ||
      principal.permissions.has("industrial.personnel.view") ||
      principal.permissions.has("industrial.personnel.manage") ||
      principal.isPlatformAdmin;
    if (canBrowseOthers) return;
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (learner?.personnelId === targetId) return;
    throw new ForgeError("FORBIDDEN", "Training record not available");
  }

  async getMyTraining(principal: ForgePrincipal) {
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (!learner) {
      return {
        linked: false as const,
        personnelId: null,
        employeeNumber: null,
        displayName: null,
        openAssignments: [] as unknown[],
        trainingRecords: [] as unknown[],
        summary: { assigned: 0, completed: 0, overdue: 0 },
      };
    }
    const history = await this.listPersonnelTrainingHistory(
      learner.tenantId,
      learner.personnelId,
    );
    const openAssignments = history.openAssignments ?? [];
    const trainingRecords = history.trainingRecords ?? [];
    const now = Date.now();
    const overdue = openAssignments.filter((row) => {
      const due = row.assignment?.dueAt;
      if (!due) return false;
      const status = String(row.assignee?.status ?? "").toUpperCase();
      if (status === "PASSED") return false;
      const dueMs = new Date(due as string | Date).getTime();
      return Number.isFinite(dueMs) && dueMs < now;
    }).length;
    const completed = trainingRecords.filter((row) => {
      const result = String(row.result ?? "").toUpperCase();
      return result === "PASSED" || result === "COMPLETED";
    }).length;
    return {
      linked: true as const,
      personnelId: learner.personnelId,
      employeeNumber: learner.employeeNumber,
      displayName: learner.displayName,
      openAssignments,
      trainingRecords,
      summary: {
        assigned: openAssignments.length,
        completed,
        overdue,
      },
    };
  }

  async getMyTrainingHistory(principal: ForgePrincipal) {
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (!learner) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Your account is not linked to a personnel record. Ask an admin to link your user to your employee file.",
      );
    }
    return this.listPersonnelTrainingHistory(learner.tenantId, learner.personnelId);
  }

  async getMyTrainingReportPrintable(principal: ForgePrincipal) {
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (!learner) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Your account is not linked to a personnel record. Ask an admin to link your user to your employee file.",
      );
    }
    return this.getPersonnelTrainingReportPrintable(learner.tenantId, learner.personnelId);
  }

  async getMyCompletionPrintable(principal: ForgePrincipal, completionId: string) {
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (!learner) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Your account is not linked to a personnel record. Ask an admin to link your user to your employee file.",
      );
    }
    return this.getCompletionPrintable(learner.tenantId, learner.personnelId, completionId);
  }

  async getMyTrainingRecordPrintable(principal: ForgePrincipal, recordId: string) {
    const learner = await this.resolveLearnerForPrincipal(principal);
    if (!learner) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Your account is not linked to a personnel record. Ask an admin to link your user to your employee file.",
      );
    }
    return this.getTrainingRecordPrintable(learner.tenantId, learner.personnelId, recordId);
  }

  async listPersonnelTrainingHistory(tenantId: string, personnelId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [person] = await tx
        .select({
          employeeNumber: industrialPersonnel.employeeNumber,
        })
        .from(industrialPersonnel)
        .where(
          and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
        )
        .limit(1);
      const employeeNumber = person?.employeeNumber?.trim() || null;

      const completions = await tx
        .select({
          completion: industrialTrainingCompletions,
          assignmentTitle: industrialTrainingAssignments.title,
          sourceTitle: industrialTrainingSources.title,
          versionLabel: industrialTrainingCourseVersions.versionLabel,
          versionNumber: industrialTrainingCourseVersions.versionNumber,
        })
        .from(industrialTrainingCompletions)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingCompletions.assignmentId, industrialTrainingAssignments.id),
        )
        .innerJoin(
          industrialTrainingSources,
          eq(industrialTrainingCompletions.sourceId, industrialTrainingSources.id),
        )
        .leftJoin(
          industrialTrainingCourseVersions,
          eq(industrialTrainingCompletions.versionId, industrialTrainingCourseVersions.id),
        )
        .where(
          and(
            eq(industrialTrainingCompletions.tenantId, tenantId),
            eq(industrialTrainingCompletions.personnelId, personnelId),
          ),
        )
        .orderBy(desc(industrialTrainingCompletions.completedAt));

      const openAssigneeMatch = employeeNumber
        ? or(
            eq(industrialTrainingAssignmentAssignees.personnelId, personnelId),
            sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${employeeNumber})`,
          )
        : eq(industrialTrainingAssignmentAssignees.personnelId, personnelId);

      const openAssignments = await tx
        .select({
          assignee: industrialTrainingAssignmentAssignees,
          assignment: industrialTrainingAssignments,
          sourceTitle: industrialTrainingSources.title,
        })
        .from(industrialTrainingAssignmentAssignees)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingAssignmentAssignees.assignmentId, industrialTrainingAssignments.id),
        )
        .innerJoin(
          industrialTrainingSources,
          eq(industrialTrainingAssignments.sourceId, industrialTrainingSources.id),
        )
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            openAssigneeMatch,
            isNull(industrialTrainingAssignments.archivedAt),
            sql`upper(${industrialTrainingAssignmentAssignees.status}) <> 'PASSED'`,
          ),
        )
        .orderBy(desc(industrialTrainingAssignmentAssignees.updatedAt));

      const legacyRecords = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(
          and(
            eq(industrialTrainingRecords.tenantId, tenantId),
            eq(industrialTrainingRecords.personnelId, personnelId),
            isNull(industrialTrainingRecords.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingRecords.completedAt));

      const trainingRecords = [
        ...completions.map((row) => ({
          id: row.completion.id,
          kind: "completion" as const,
          title: row.assignmentTitle,
          courseName: row.sourceTitle,
          result: row.completion.result,
          scorePercent: row.completion.scorePercent,
          attemptNumber: row.completion.attemptNumber,
          completedAt: row.completion.completedAt,
          expiresAt: null as Date | null,
          printCompletionId: row.completion.id,
          attachments: [] as Array<{
            documentId: string;
            fileName: string;
            contentType: string;
            uploadedAt: string;
          }>,
          canUploadAttachment: false,
        })),
        ...legacyRecords
          .map((row) => {
            const payload = unwrapJsonRecord(row.sourcePayload ?? {});
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
                  : row.completedAt ||
                      Boolean(payload.completionCode) ||
                      row.sourceCollection === "training_database_xlsx" ||
                      row.sourceCollection === "manual_entry"
                    ? "COMPLETED"
                    : row.status;
            // Prefer LMS completion rows when both exist for the same assignment pass.
            if (
              row.sourceCollection === "industrial_training_assignments" &&
              completions.some((c) => c.completion.assignmentId === row.sourceDocumentId)
            ) {
              return null;
            }
            const attachments = readTrainingRecordAttachments(payload);
            const instructorName =
              typeof payload.instructorName === "string" ? payload.instructorName : null;
            const notes = typeof payload.notes === "string" ? payload.notes : null;
            return {
              id: row.id,
              kind: "record" as const,
              title: row.title?.trim() || row.courseName?.trim() || "Training record",
              courseName: row.courseName,
              result,
              scorePercent: percent,
              attemptNumber,
              completedAt: row.completedAt,
              expiresAt: row.expiresAt,
              instructorName,
              notes,
              printCompletionId: null as string | null,
              attachments,
              canUploadAttachment: attachments.length === 0,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row != null),
      ]
        .sort((a, b) => {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bTime - aTime;
        });

      // Collapse same course name + same completed day (e.g. import + LMS both present).
      const deduped: typeof trainingRecords = [];
      const seenKeys = new Set<string>();
      const ranked = [...trainingRecords].sort((a, b) => {
        const aScore =
          (a.kind === "completion" ? 1000 : 0) +
          (a.attachments?.length ?? 0) * 100 +
          (a.scorePercent != null ? 10 : 0) +
          (a.attemptNumber != null ? 5 : 0);
        const bScore =
          (b.kind === "completion" ? 1000 : 0) +
          (b.attachments?.length ?? 0) * 100 +
          (b.scorePercent != null ? 10 : 0) +
          (b.attemptNumber != null ? 5 : 0);
        if (bScore !== aScore) return bScore - aScore;
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });
      for (const row of ranked) {
        const courseKey = String(row.title || row.courseName || "")
          .trim()
          .toLowerCase();
        const day = row.completedAt
          ? new Date(row.completedAt).toISOString().slice(0, 10)
          : "none";
        const key = `${courseKey}::${day}`;
        if (!courseKey || seenKeys.has(key)) continue;
        seenKeys.add(key);
        deduped.push(row);
      }
      deduped.sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });

      return {
        completions,
        openAssignments,
        trainingRecords: deduped.map((row) => ({
          ...row,
          completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
          expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        })),
      };
    });
  }

  async personnelSnapshot(tx: DatabaseTransaction, tenantId: string, personnelId: string) {
    const [person] = await tx
      .select({
        displayName: industrialPersonnel.displayName,
        employeeNumber: industrialPersonnel.employeeNumber,
        jobTitle: industrialPersonnel.jobTitle,
        departmentId: industrialPersonnel.departmentId,
        siteId: industrialPersonnel.siteId,
      })
      .from(industrialPersonnel)
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      )
      .limit(1);
    if (!person) return {};
    let departmentName: string | null = null;
    let siteName: string | null = null;
    if (person.departmentId) {
      const [dept] = await tx
        .select({ name: industrialDepartments.name })
        .from(industrialDepartments)
        .where(eq(industrialDepartments.id, person.departmentId))
        .limit(1);
      departmentName = dept?.name ?? null;
    }
    if (person.siteId) {
      const [site] = await tx
        .select({ name: industrialSites.name })
        .from(industrialSites)
        .where(eq(industrialSites.id, person.siteId))
        .limit(1);
      siteName = site?.name ?? null;
    }
    return {
      displayName: person.displayName,
      employeeNumber: person.employeeNumber,
      jobTitle: person.jobTitle,
      departmentName,
      siteName,
    };
  }

  async loadTenantPrintBranding(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<TrainingPrintBranding> {
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key,
        display_name::text as display_name,
        legal_name::text as legal_name
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (Array.isArray(tenantRows)
      ? tenantRows[0]
      : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]) as
      | Record<string, unknown>
      | undefined;

    const brandingRows = await tx.execute(sql`
      select cv.payload_json as payload
      from config_objects co
      join config_versions cv on cv.id = co.current_published_version_id
      where co.tenant_id = ${tenantId}::uuid
        and co.namespace = 'branding'
        and co.object_key = 'default'
      limit 1
    `);
    const brandingPayloadRaw = (Array.isArray(brandingRows)
      ? brandingRows[0]
      : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]) as
      | { payload?: unknown }
      | undefined;
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
    return { companyName, logoUrl };
  }

  private async loadAttemptQuizItems(
    tx: DatabaseTransaction,
    tenantId: string,
    attemptId: string,
  ): Promise<CompletionQuizItem[]> {
    const attempt = await tx.query.industrialTrainingAttempts.findFirst({
      where: and(
        eq(industrialTrainingAttempts.id, attemptId),
        eq(industrialTrainingAttempts.tenantId, tenantId),
      ),
    });
    if (!attempt) return [];
    const answers = (attempt.answers ?? []) as Array<{
      questionId: string;
      selectedIndex: number;
      correct: boolean;
    }>;
    if (!answers.length) return [];
    const questionIds = answers.map((answer) => answer.questionId);
    const questions = await tx
      .select()
      .from(industrialTrainingQuestions)
      .where(
        and(
          eq(industrialTrainingQuestions.tenantId, tenantId),
          inArray(industrialTrainingQuestions.id, questionIds),
        ),
      );
    const byId = new Map(questions.map((question) => [question.id, question]));
    return answers.map((answer) => {
      const question = byId.get(answer.questionId);
      const choices = Array.isArray(question?.choices) ? (question.choices as string[]) : [];
      return {
        stem: question?.stem ?? "Question unavailable",
        choices,
        selectedIndex: answer.selectedIndex,
        correctIndex: typeof question?.correctIndex === "number" ? question.correctIndex : -1,
        correct: answer.correct,
      };
    });
  }

  async getPersonnelReportBundle(tenantId: string, personnelId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [person] = await tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, personnelId),
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1);
      if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

      const snapshot = await this.personnelSnapshot(tx, tenantId, personnelId);
      const history = await this.listPersonnelTrainingHistory(tenantId, personnelId);
      const legacyRecords = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(
          and(
            eq(industrialTrainingRecords.tenantId, tenantId),
            eq(industrialTrainingRecords.personnelId, personnelId),
            isNull(industrialTrainingRecords.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingRecords.completedAt));
      const branding = await this.loadTenantPrintBranding(tx, tenantId);
      return { person, snapshot, history, legacyRecords, branding };
    });
  }

  async getCompletionReportBundle(tenantId: string, personnelId: string, completionId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({
          completion: industrialTrainingCompletions,
          assignmentTitle: industrialTrainingAssignments.title,
          sourceTitle: industrialTrainingSources.title,
          versionLabel: industrialTrainingCourseVersions.versionLabel,
        })
        .from(industrialTrainingCompletions)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingCompletions.assignmentId, industrialTrainingAssignments.id),
        )
        .innerJoin(
          industrialTrainingSources,
          eq(industrialTrainingCompletions.sourceId, industrialTrainingSources.id),
        )
        .leftJoin(
          industrialTrainingCourseVersions,
          eq(industrialTrainingCompletions.versionId, industrialTrainingCourseVersions.id),
        )
        .where(
          and(
            eq(industrialTrainingCompletions.tenantId, tenantId),
            eq(industrialTrainingCompletions.id, completionId),
            eq(industrialTrainingCompletions.personnelId, personnelId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Completion not found");

      const snapshot = await this.personnelSnapshot(tx, tenantId, personnelId);
      const branding = await this.loadTenantPrintBranding(tx, tenantId);
      const questions = row.completion.attemptId
        ? await this.loadAttemptQuizItems(tx, tenantId, row.completion.attemptId)
        : [];
      return { row, snapshot, branding, questions };
    });
  }

  async getAttemptReportBundle(
    tenantId: string,
    attemptId: string,
    scope: {
      personnelId?: string | null;
      employeeNumber?: string | null;
      userId?: string | null;
      allowAnyInTenant?: boolean;
    },
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await tx.query.industrialTrainingAttempts.findFirst({
        where: and(
          eq(industrialTrainingAttempts.id, attemptId),
          eq(industrialTrainingAttempts.tenantId, tenantId),
        ),
      });
      if (!attempt) throw new ForgeError("NOT_FOUND", "Attempt not found");

      const userId = scope.userId?.trim();
      const employeeNumber = scope.employeeNumber?.trim();
      const personnelId = scope.personnelId?.trim();
      const attemptEmployee = attempt.employeeNumber?.trim();
      const attemptUserId = attempt.userId?.trim();
      const allowed =
        scope.allowAnyInTenant ||
        (userId && attemptUserId && userId === attemptUserId) ||
        (employeeNumber &&
          attemptEmployee &&
          employeeNumber.toLowerCase() === attemptEmployee.toLowerCase()) ||
        (personnelId &&
          attemptEmployee &&
          (await tx
            .select({ id: industrialPersonnel.id })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, personnelId),
                eq(industrialPersonnel.tenantId, tenantId),
                sql`lower(trim(${industrialPersonnel.employeeNumber})) = lower(${attemptEmployee})`,
              ),
            )
            .limit(1)).length > 0);
      if (!allowed) throw new ForgeError("FORBIDDEN", "Attempt not available");

      let resolvedPersonnelId = personnelId ?? null;
      if (!resolvedPersonnelId && attemptEmployee) {
        const [person] = await tx
          .select({ id: industrialPersonnel.id })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.tenantId, tenantId),
              sql`lower(trim(${industrialPersonnel.employeeNumber})) = lower(${attemptEmployee})`,
              isNull(industrialPersonnel.archivedAt),
            ),
          )
          .limit(1);
        resolvedPersonnelId = person?.id ?? null;
      }

      const snapshot = resolvedPersonnelId
        ? await this.personnelSnapshot(tx, tenantId, resolvedPersonnelId)
        : {
            displayName: attemptEmployee ?? "Employee",
            employeeNumber: attemptEmployee ?? "",
            jobTitle: null,
            departmentName: null,
            siteName: null,
          };
      const branding = await this.loadTenantPrintBranding(tx, tenantId);
      const questions = await this.loadAttemptQuizItems(tx, tenantId, attemptId);

      let assignmentTitle = "Training quiz";
      let sourceTitle = "Training course";
      let versionLabel: string | null = null;
      if (attempt.assignmentId) {
        const [assignmentRow] = await tx
          .select({
            assignmentTitle: industrialTrainingAssignments.title,
            sourceTitle: industrialTrainingSources.title,
          })
          .from(industrialTrainingAssignments)
          .innerJoin(
            industrialTrainingSources,
            eq(industrialTrainingAssignments.sourceId, industrialTrainingSources.id),
          )
          .where(eq(industrialTrainingAssignments.id, attempt.assignmentId))
          .limit(1);
        assignmentTitle = assignmentRow?.assignmentTitle ?? assignmentTitle;
        sourceTitle = assignmentRow?.sourceTitle ?? sourceTitle;
      } else if (attempt.sourceId) {
        const [source] = await tx
          .select({ title: industrialTrainingSources.title })
          .from(industrialTrainingSources)
          .where(eq(industrialTrainingSources.id, attempt.sourceId))
          .limit(1);
        sourceTitle = source?.title ?? sourceTitle;
        assignmentTitle = sourceTitle;
      }

      const answers = (attempt.answers ?? []) as Array<{ correct: boolean }>;
      const total = Math.max(attempt.scoreTotal, answers.length, 1);
      const scorePercent = Math.round((attempt.scoreCorrect / total) * 100);
      const passingPercent = 70;

      return {
        snapshot,
        branding,
        questions,
        assignmentTitle,
        sourceTitle,
        versionLabel,
        result: scorePercent >= passingPercent ? "PASSED" : "FAILED",
        scorePercent,
        passingPercent,
        attemptNumber: 1,
        completedAt: (attempt.completedAt ?? attempt.updatedAt ?? new Date()).toISOString(),
      };
    });
  }

  async getPersonnelTrainingReportPrintable(tenantId: string, personnelId: string) {
    const bundle = await this.getPersonnelReportBundle(tenantId, personnelId);
    const employee = {
      displayName: bundle.snapshot.displayName ?? bundle.person.displayName ?? "Employee",
      employeeNumber: bundle.snapshot.employeeNumber ?? bundle.person.employeeNumber ?? "",
      jobTitle: bundle.snapshot.jobTitle ?? null,
      departmentName: bundle.snapshot.departmentName ?? null,
      siteName: bundle.snapshot.siteName ?? null,
    };
    const html = buildPersonnelTrainingReportHtml({
      employee,
      branding: bundle.branding,
      openAssignments: bundle.history.openAssignments.map((row) => ({
        title: row.assignment.title,
        sourceTitle: row.sourceTitle,
        status: row.assignee.status,
        dueAt: row.assignment.dueAt?.toISOString?.() ?? (row.assignment.dueAt as string | null),
        bestPercent: row.assignee.bestPercent,
      })),
      trainingRecords: (bundle.history.trainingRecords ?? []).map((row) => ({
        title: row.title,
        courseName: row.courseName,
        result: row.result,
        scorePercent: row.scorePercent,
        attemptNumber: row.attemptNumber,
        completedAt: row.completedAt ? String(row.completedAt) : null,
        expiresAt: row.expiresAt ? String(row.expiresAt) : null,
        printCompletionId: row.printCompletionId,
      })),
    });
    const slug = (employee.displayName || employee.employeeNumber || "employee")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return {
      html,
      filename: `${slug || "employee"}-training-report.html`,
      contentType: "text/html; charset=utf-8",
    };
  }

  async getCompletionPrintable(tenantId: string, personnelId: string, completionId: string) {
    const bundle = await this.getCompletionReportBundle(tenantId, personnelId, completionId);
    const employee = {
      displayName: bundle.snapshot.displayName ?? "Employee",
      employeeNumber: bundle.snapshot.employeeNumber ?? "",
      jobTitle: bundle.snapshot.jobTitle ?? null,
      departmentName: bundle.snapshot.departmentName ?? null,
      siteName: bundle.snapshot.siteName ?? null,
    };
    const html = buildCompletionPrintableHtml({
      employee,
      branding: bundle.branding,
      assignmentTitle: bundle.row.assignmentTitle,
      sourceTitle: bundle.row.sourceTitle,
      versionLabel: bundle.row.versionLabel,
      result: bundle.row.completion.result,
      scorePercent: bundle.row.completion.scorePercent,
      passingPercent: bundle.row.completion.passingPercent,
      attemptNumber: bundle.row.completion.attemptNumber,
      completedAt: bundle.row.completion.completedAt.toISOString(),
      questions: bundle.questions,
    });
    const slug = (bundle.row.assignmentTitle || bundle.row.sourceTitle || "completion")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return {
      html,
      filename: `${slug || "completion"}-quiz-results.html`,
      contentType: "text/html; charset=utf-8",
    };
  }

  async getTrainingRecordPrintable(tenantId: string, personnelId: string, recordId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [record] = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(
          and(
            eq(industrialTrainingRecords.id, recordId),
            eq(industrialTrainingRecords.tenantId, tenantId),
            eq(industrialTrainingRecords.personnelId, personnelId),
            isNull(industrialTrainingRecords.archivedAt),
          ),
        )
        .limit(1);
      if (!record) throw new ForgeError("NOT_FOUND", "Training record not found");

      const snapshot = await this.personnelSnapshot(tx, tenantId, personnelId);
      const branding = await this.loadTenantPrintBranding(tx, tenantId);
      const payload = unwrapJsonRecord(record.sourcePayload ?? {});
      const percent =
        typeof payload.percent === "number"
          ? payload.percent
          : typeof payload.scorePercent === "number"
            ? payload.scorePercent
            : null;
      const result =
        typeof payload.result === "string"
          ? payload.result
          : percent != null
            ? "PASSED"
            : record.completedAt ||
                Boolean(payload.completionCode) ||
                record.sourceCollection === "training_database_xlsx" ||
                record.sourceCollection === "manual_entry"
              ? "COMPLETED"
              : record.status;
      const instructorName =
        typeof payload.instructorName === "string" ? payload.instructorName : null;
      const notes = typeof payload.notes === "string" ? payload.notes : null;
      const title = record.title?.trim() || record.courseName?.trim() || "Training record";
      const html = buildTrainingRecordPrintableHtml({
        employee: {
          displayName: snapshot.displayName ?? "Employee",
          employeeNumber: snapshot.employeeNumber ?? "",
          jobTitle: snapshot.jobTitle ?? null,
          departmentName: snapshot.departmentName ?? null,
          siteName: snapshot.siteName ?? null,
        },
        branding,
        title,
        courseName: record.courseName,
        result,
        scorePercent: percent,
        instructorName,
        notes,
        completedAt: record.completedAt ? record.completedAt.toISOString() : null,
        expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      });
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      return {
        html,
        filename: `${slug || "training-record"}-record.html`,
        contentType: "text/html; charset=utf-8",
      };
    });
  }

  async getAttemptPrintable(
    tenantId: string,
    attemptId: string,
    scope: {
      personnelId?: string | null;
      employeeNumber?: string | null;
      userId?: string | null;
      allowAnyInTenant?: boolean;
    },
  ) {
    const bundle = await this.getAttemptReportBundle(tenantId, attemptId, scope);
    const employee = {
      displayName: bundle.snapshot.displayName ?? "Employee",
      employeeNumber: bundle.snapshot.employeeNumber ?? "",
      jobTitle: bundle.snapshot.jobTitle ?? null,
      departmentName: bundle.snapshot.departmentName ?? null,
      siteName: bundle.snapshot.siteName ?? null,
    };
    const html = buildCompletionPrintableHtml({
      employee,
      branding: bundle.branding,
      assignmentTitle: bundle.assignmentTitle,
      sourceTitle: bundle.sourceTitle,
      versionLabel: bundle.versionLabel,
      result: bundle.result,
      scorePercent: bundle.scorePercent,
      passingPercent: bundle.passingPercent,
      attemptNumber: bundle.attemptNumber,
      completedAt: bundle.completedAt,
      questions: bundle.questions,
    });
    const slug = (bundle.assignmentTitle || bundle.sourceTitle || "quiz")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return {
      html,
      filename: `${slug || "quiz"}-results.html`,
      contentType: "text/html; charset=utf-8",
    };
  }
}
