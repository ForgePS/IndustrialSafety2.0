import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  EXPORT_DOWNLOAD_TTL_SECONDS,
  createReportScheduleInputSchema,
  createSavedReportInputSchema,
  patchReportScheduleInputSchema,
  patchSavedReportInputSchema,
  reportExportInputSchema,
  reportRunInputSchema,
  type ReportExportFormat,
} from "@forge/contracts";
import {
  createId,
  platformJobs,
  reportDefinitions,
  reportExecutions,
  reportExports,
  reportFavorites,
  reportRecipients,
  reportSchedules,
  reportShares,
  tenantSettings,
  userTenantMemberships,
  withBypassRlsTransaction,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  isSafetyDirectorRecipientMarker,
  listSafetyDirectorRecipients,
} from "../industrial/safety-director-recipients.js";
import { IndustrialDomainService } from "../industrial/industrial-domain.service.js";
import {
  parseWorkersCompWeeklyStatusSettings,
  WC_WEEKLY_STATUS_DEFAULT_CRON,
  WC_WEEKLY_STATUS_NAMESPACE as WC_WEEKLY_STATUS_SETTINGS_NAMESPACE,
  WC_WEEKLY_STATUS_REPORT_KEY,
  WC_WEEKLY_STATUS_SETTING_KEY as WC_WEEKLY_STATUS_SETTINGS_KEY,
} from "../industrial/workers-comp-helpers.js";
import {
  runBuiltinAdapter,
  resolveRelativeDateRange,
  type ReportAdapterSources,
  type ReportRunResult,
} from "./reporting-adapters.js";
import {
  getReportDataset,
  getReportDatasetFields,
  listReportDatasets,
} from "./reporting-registry.js";
import { BUILTIN_REPORTS, builtinByKey } from "./reporting-catalog.js";
import {
  computeNextCronRun,
  computeNextCronRunAfter,
  isValidCronExpression,
} from "./reporting-cron.js";
import {
  contentTypeForFormat,
  filenameForExport,
  rowsToCsv,
  rowsToPdfBase64,
  rowsToXlsxBase64,
} from "./reporting-exporters.js";

const INLINE_MAX_CHARS = 1_500_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createShareInputSchema = z.object({
  reportDefinitionId: z.string().uuid(),
  sharedWithUserId: z.string().uuid().optional().nullable(),
  sharedWithRoleId: z.string().uuid().optional().nullable(),
  permission: z.enum(["view", "run", "export", "manage"]).default("view"),
});

@Injectable()
export class ReportingService {
  private readonly s3: S3Client;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly industrialDomain?: IndustrialDomainService,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
  }

  private adapterSources(principal: ForgePrincipal): ReportAdapterSources {
    const industrialDomain = this.industrialDomain;
    if (!industrialDomain) return {};
    return {
      workersCompWeeklyStatus: () =>
        industrialDomain.getWorkersCompWeeklyStatusReport(principal, {}),
    };
  }

  canViewReporting(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.view") ||
      hasPermission(principal, "industrial.reporting.run") ||
      hasPermission(principal, "industrial.reporting.export") ||
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin") ||
      hasPermission(principal, "industrial.access")
    );
  }

  canRun(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.run") ||
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin") ||
      hasPermission(principal, "industrial.access")
    );
  }

  canExport(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.export") ||
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin") ||
      hasPermission(principal, "industrial.access")
    );
  }

  canManage(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin")
    );
  }

  canSchedule(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.schedule") ||
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin")
    );
  }

  canShare(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.share") ||
      hasPermission(principal, "industrial.reporting.manage") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin")
    );
  }

  allowSensitive(principal: ForgePrincipal): boolean {
    return (
      hasPermission(principal, "industrial.reporting.view_sensitive") ||
      hasPermission(principal, "industrial.reporting.admin") ||
      hasPermission(principal, "industrial.admin")
    );
  }

  private assertView(principal: ForgePrincipal): void {
    if (!this.canViewReporting(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting view permission required");
    }
  }

  private assertRun(principal: ForgePrincipal): void {
    if (!this.canRun(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting run permission required");
    }
  }

  private assertExport(principal: ForgePrincipal): void {
    if (!this.canExport(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting export permission required");
    }
  }

  private assertManage(principal: ForgePrincipal): void {
    if (!this.canManage(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting manage permission required");
    }
  }

  private assertSchedule(principal: ForgePrincipal): void {
    if (!this.canSchedule(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting schedule permission required");
    }
  }

  private assertShare(principal: ForgePrincipal): void {
    if (!this.canShare(principal)) {
      throw new ForgeError("FORBIDDEN", "Reporting share permission required");
    }
  }

  private canAccessModule(principal: ForgePrincipal, modulePermission: string): boolean {
    return (
      hasPermission(principal, "industrial.admin") ||
      hasPermission(principal, modulePermission) ||
      hasPermission(principal, "industrial.access")
    );
  }

  listDatasets(principal: ForgePrincipal) {
    this.assertView(principal);
    return { items: listReportDatasets() };
  }

  getDataset(principal: ForgePrincipal, key: string) {
    this.assertView(principal);
    const dataset = getReportDataset(key);
    if (!dataset) throw new ForgeError("NOT_FOUND", `Unknown dataset: ${key}`);
    return dataset;
  }

  getDatasetFields(principal: ForgePrincipal, key: string) {
    this.assertView(principal);
    const fields = getReportDatasetFields(key);
    if (!fields.length && !getReportDataset(key)) {
      throw new ForgeError("NOT_FOUND", `Unknown dataset: ${key}`);
    }
    return { key, fields };
  }

  async overview(principal: ForgePrincipal) {
    this.assertView(principal);
    const tenantId = principal.tenantId;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [saved] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reportDefinitions)
          .where(
            and(
              eq(reportDefinitions.tenantId, tenantId),
              eq(reportDefinitions.origin, "saved"),
              isNull(reportDefinitions.deletedAt),
            ),
          );
        const [scheduled] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reportSchedules)
          .where(and(eq(reportSchedules.tenantId, tenantId), isNull(reportSchedules.deletedAt)));
        const [runsThisMonth] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reportExecutions)
          .where(
            and(
              eq(reportExecutions.tenantId, tenantId),
              gte(reportExecutions.createdAt, monthStart),
            ),
          );
        const [recentExports] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reportExports)
          .where(eq(reportExports.tenantId, tenantId));
        const [favorites] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reportFavorites)
          .where(
            and(
              eq(reportFavorites.tenantId, tenantId),
              eq(reportFavorites.userId, principal.userId),
            ),
          );

        const complianceBuiltinCount = BUILTIN_REPORTS.filter(
          (r) => r.reportType === "compliance",
        ).length;
        const libraryCount = BUILTIN_REPORTS.length + (saved?.count ?? 0);

        return {
          savedReports: saved?.count ?? 0,
          scheduled: scheduled?.count ?? 0,
          runsThisMonth: runsThisMonth?.count ?? 0,
          complianceBuiltinCount,
          recentExports: recentExports?.count ?? 0,
          libraryCount,
          favorites: favorites?.count ?? 0,
        };
      },
      principal.userId,
    );
  }

  async listReports(
    principal: ForgePrincipal,
    query: { search?: string; category?: string; module?: string; reportType?: string },
  ) {
    this.assertView(principal);
    const tenantId = principal.tenantId;
    const search = query.search?.trim().toLowerCase();

    const builtin = BUILTIN_REPORTS.filter((r) => {
      if (!this.canAccessModule(principal, r.modulePermission)) return false;
      if (query.category && r.category !== query.category) return false;
      if (query.module && r.module !== query.module) return false;
      if (query.reportType && r.reportType !== query.reportType) return false;
      if (search) {
        const hay = `${r.name} ${r.description} ${r.key} ${r.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    }).map((r) => ({
      key: r.key,
      id: null as string | null,
      name: r.name,
      description: r.description,
      origin: "builtin" as const,
      category: r.category,
      module: r.module,
      moduleCode: r.module,
      reportType: r.reportType,
      sourceKey: r.key,
      tags: r.tags,
      isFavorite: false,
    }));

    const { saved, favoriteKeys } = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const conditions = [
          eq(reportDefinitions.tenantId, tenantId),
          isNull(reportDefinitions.deletedAt),
          or(eq(reportDefinitions.origin, "saved"), eq(reportDefinitions.origin, "template"))!,
        ];
        if (query.category) conditions.push(eq(reportDefinitions.category, query.category));
        if (query.module) conditions.push(eq(reportDefinitions.moduleCode, query.module));
        if (query.reportType) conditions.push(eq(reportDefinitions.reportType, query.reportType));
        if (search) {
          conditions.push(
            or(
              ilike(reportDefinitions.name, `%${search}%`),
              ilike(reportDefinitions.description, `%${search}%`),
            )!,
          );
        }

        const savedRows = await tx
          .select()
          .from(reportDefinitions)
          .where(and(...conditions))
          .orderBy(desc(reportDefinitions.updatedAt))
          .limit(500);

        const favRows = await tx
          .select({
            reportKey: reportFavorites.reportKey,
            reportDefinitionId: reportFavorites.reportDefinitionId,
          })
          .from(reportFavorites)
          .where(
            and(
              eq(reportFavorites.tenantId, tenantId),
              eq(reportFavorites.userId, principal.userId),
            ),
          );

        return { saved: savedRows, favoriteKeys: favRows };
      },
      principal.userId,
    );

    const favoriteSet = new Set<string>();
    for (const f of favoriteKeys) {
      if (f.reportKey) favoriteSet.add(f.reportKey);
      if (f.reportDefinitionId) favoriteSet.add(f.reportDefinitionId);
    }

    const savedMapped = saved.map((r) => ({
      key: r.id,
      id: r.id,
      name: r.name,
      description: r.description,
      origin: r.origin as "saved" | "template",
      category: r.category,
      module: r.moduleCode,
      moduleCode: r.moduleCode,
      reportType: r.reportType,
      sourceKey: r.sourceKey,
      tags: [] as string[],
      isFavorite: favoriteSet.has(r.id) || (r.reportKey ? favoriteSet.has(r.reportKey) : false),
    }));

    const withFavorites = [
      ...builtin.map((r) => ({ ...r, isFavorite: favoriteSet.has(r.key) })),
      ...savedMapped,
    ];

    return { items: withFavorites, total: withFavorites.length };
  }

  private async resolveAndRun(
    principal: ForgePrincipal,
    key: string,
    input: z.infer<typeof reportRunInputSchema>,
  ): Promise<{ result: ReportRunResult; definitionId: string | null }> {
    if (UUID_RE.test(key)) {
      const def = await withTenantTransaction(
        this.db,
        principal.tenantId,
        async (tx) => {
          const [row] = await tx
            .select()
            .from(reportDefinitions)
            .where(
              and(
                eq(reportDefinitions.id, key),
                eq(reportDefinitions.tenantId, principal.tenantId),
                isNull(reportDefinitions.deletedAt),
              ),
            )
            .limit(1);
          return row ?? null;
        },
        principal.userId,
      );
      if (!def) throw new ForgeError("NOT_FOUND", "Saved report not found");
      const sourceKey = def.sourceKey;
      if (!sourceKey) {
        throw new ForgeError("VALIDATION_FAILED", "Saved report has no sourceKey");
      }
      const meta = builtinByKey(sourceKey);
      if (meta && !this.canAccessModule(principal, meta.modulePermission)) {
        throw new ForgeError("FORBIDDEN", "Module permission required for this report");
      }
      const mergedInput = {
        ...((def.payloadJson as Record<string, unknown>) ?? {}),
        ...input,
      };
      const parsed = resolveRelativeDateRange(reportRunInputSchema.parse(mergedInput));
      const result = await runBuiltinAdapter(
        this.db,
        principal,
        sourceKey,
        parsed,
        this.allowSensitive(principal),
        this.adapterSources(principal),
      );
      return {
        result: {
          ...result,
          reportKey: key,
          reportName: def.name,
        },
        definitionId: def.id,
      };
    }

    const meta = builtinByKey(key);
    if (!meta) throw new ForgeError("NOT_FOUND", `Unknown report key: ${key}`);
    if (!this.canAccessModule(principal, meta.modulePermission)) {
      throw new ForgeError("FORBIDDEN", "Module permission required for this report");
    }
    const resolved = resolveRelativeDateRange(input);
    const result = await runBuiltinAdapter(
      this.db,
      principal,
      key,
      resolved,
      this.allowSensitive(principal),
      this.adapterSources(principal),
    );
    return { result, definitionId: null };
  }

  async runReport(principal: ForgePrincipal, key: string, body: unknown) {
    this.assertRun(principal);
    const parsed = reportRunInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid report run input", {
        details: parsed.error.issues,
      });
    }

    const started = Date.now();
    const { result, definitionId } = await this.resolveAndRun(principal, key, parsed.data);
    return this.persistExecution(
      principal,
      result,
      definitionId,
      parsed.data,
      Date.now() - started,
    );
  }

  private async persistExecution(
    principal: ForgePrincipal,
    result: ReportRunResult,
    definitionId: string | null,
    runInput: z.infer<typeof reportRunInputSchema>,
    durationMs: number,
  ) {
    const executionId = createId();

    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await tx.insert(reportExecutions).values({
          id: executionId,
          tenantId: principal.tenantId,
          reportKey: result.reportKey,
          reportDefinitionId: definitionId,
          reportName: result.reportName,
          status: "SUCCEEDED",
          rowCount: result.rows.length,
          durationMs,
          runInputJson: runInput,
          executedByUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "reporting.run",
          resourceType: "report_execution",
          resourceId: executionId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { reportKey: result.reportKey, rowCount: result.rows.length },
        });
      },
      principal.userId,
    );

    return { executionId, ...result };
  }

  async exportReport(principal: ForgePrincipal, key: string, body: unknown) {
    this.assertExport(principal);
    const parsed = reportExportInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid report export input", {
        details: parsed.error.issues,
      });
    }
    const { format, ...runInput } = parsed.data;
    const started = Date.now();
    const { result, definitionId } = await this.resolveAndRun(principal, key, runInput);
    const run = await this.persistExecution(
      principal,
      result,
      definitionId,
      runInput,
      Date.now() - started,
    );

    let contentBase64: string;
    if (format === "csv") {
      contentBase64 = Buffer.from(rowsToCsv(run.columns, run.rows), "utf8").toString("base64");
    } else if (format === "xlsx") {
      contentBase64 = rowsToXlsxBase64(run.columns, run.rows);
    } else {
      contentBase64 = await rowsToPdfBase64(run.reportName, run.columns, run.rows);
    }

    const exportId = createId();
    const filename = filenameForExport(run.reportKey, format as ReportExportFormat);
    const contentType = contentTypeForFormat(format as ReportExportFormat);
    const binary = Buffer.from(contentBase64, "base64");
    const byteSize = binary.byteLength;
    const large = contentBase64.length > INLINE_MAX_CHARS;

    let artifactObjectKey: string | null = null;
    let artifactInline: string | null = large ? null : contentBase64;
    let jobId: string | null = null;
    let storage: "INLINE" | "S3" = "INLINE";

    if (large) {
      const objectKey = `tenants/${principal.tenantId}/reporting/${exportId}/${filename}`;
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.env.S3_EXPORT_BUCKET,
            Key: objectKey,
            Body: binary,
            ContentType: contentType,
            ServerSideEncryption: "aws:kms",
          }),
        );
        artifactObjectKey = objectKey;
        storage = "S3";
        jobId = createId();
      } catch {
        throw new ForgeError(
          "INTERNAL_ERROR",
          "Export too large for inline storage and S3 write failed. Narrow filters or reduce limit.",
        );
      }
    }

    const expiresAt = large ? new Date(Date.now() + EXPORT_DOWNLOAD_TTL_SECONDS * 1000 * 24) : null;

    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        if (jobId && artifactObjectKey) {
          await tx.insert(platformJobs).values({
            id: jobId,
            tenantId: principal.tenantId,
            type: "export.reporting",
            status: "SUCCEEDED",
            progress: 100,
            attempt: 1,
            createdByUserId: principal.userId,
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            startedAt: new Date(),
            completedAt: new Date(),
            resultJson: {
              kind: "reporting",
              exportId,
              reportKey: run.reportKey,
              format,
              rowCount: run.rows.length,
              storage: "S3",
            },
            artifactObjectKey,
            artifactContentType: contentType,
            artifactFilename: filename,
            artifactInline: null,
            artifactExpiresAt: expiresAt,
          });
        }

        await tx.insert(reportExports).values({
          id: exportId,
          tenantId: principal.tenantId,
          executionId: run.executionId,
          reportKey: run.reportKey,
          reportName: run.reportName,
          format,
          filename,
          contentType,
          byteSize,
          status: "READY",
          artifactInline,
          artifactObjectKey,
          jobId,
          createdByUserId: principal.userId,
          expiresAt,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "reporting.export",
          resourceType: "report_export",
          resourceId: exportId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { format, filename, byteSize, storage, jobId },
        });
      },
      principal.userId,
    );

    const downloadUrl = large ? `/api/v1/reporting/exports/${exportId}/download` : null;

    return {
      exportId,
      executionId: run.executionId,
      format,
      filename,
      contentType,
      contentBase64: large ? null : contentBase64,
      storage,
      jobId,
      downloadUrl,
      byteSize,
    };
  }

  async createExportDownload(principal: ForgePrincipal, exportId: string) {
    this.assertExport(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(reportExports)
          .where(
            and(eq(reportExports.id, exportId), eq(reportExports.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Export not found");
        if (row.status !== "READY") {
          throw new ForgeError("VALIDATION_FAILED", "Export is not ready for download");
        }
        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
          throw new ForgeError("VALIDATION_FAILED", "Export artifact has expired");
        }

        const expiresInSeconds = EXPORT_DOWNLOAD_TTL_SECONDS;
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

        if (row.artifactObjectKey) {
          const command = new GetObjectCommand({
            Bucket: this.env.S3_EXPORT_BUCKET,
            Key: row.artifactObjectKey,
            ResponseContentType: row.contentType,
            ResponseContentDisposition: `attachment; filename="${row.filename}"`,
          });
          const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
          return {
            exportId,
            downloadUrl,
            expiresInSeconds,
            expiresAt,
            mode: "S3_PRESIGNED" as const,
            contentType: row.contentType,
            filename: row.filename,
          };
        }

        if (!row.artifactInline) {
          throw new ForgeError("NOT_FOUND", "Export artifact missing");
        }

        return {
          exportId,
          downloadUrl: `/api/v1/reporting/exports/${exportId}/content`,
          expiresInSeconds,
          expiresAt,
          mode: "API_STREAM" as const,
          contentType: row.contentType,
          filename: row.filename,
        };
      },
      principal.userId,
    );
  }

  async getExportInlineContent(principal: ForgePrincipal, exportId: string) {
    this.assertExport(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(reportExports)
          .where(
            and(eq(reportExports.id, exportId), eq(reportExports.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!row?.artifactInline) throw new ForgeError("NOT_FOUND", "Export content not found");
        if (row.status !== "READY") {
          throw new ForgeError("VALIDATION_FAILED", "Export is not ready");
        }
        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
          throw new ForgeError("VALIDATION_FAILED", "Export artifact has expired");
        }
        return {
          body: Buffer.from(row.artifactInline, "base64"),
          contentType: row.contentType,
          filename: row.filename,
        };
      },
      principal.userId,
    );
  }

  async createSaved(principal: ForgePrincipal, body: unknown) {
    this.assertManage(principal);
    const parsed = createSavedReportInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid saved report", {
        details: parsed.error.issues,
      });
    }
    const input = parsed.data;
    const meta = builtinByKey(input.sourceKey);
    if (!meta) {
      throw new ForgeError("VALIDATION_FAILED", `Unknown sourceKey: ${input.sourceKey}`);
    }
    if (!this.canAccessModule(principal, meta.modulePermission)) {
      throw new ForgeError("FORBIDDEN", "Module permission required for this report");
    }

    const id = createId();
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await tx.insert(reportDefinitions).values({
          id,
          tenantId: principal.tenantId,
          reportKey: null,
          name: input.name,
          description: input.description ?? null,
          origin: input.origin ?? "saved",
          category: input.category ?? meta.category,
          moduleCode: input.moduleCode ?? meta.module,
          reportType: meta.reportType,
          sourceKey: input.sourceKey,
          payloadJson: input.payloadJson ?? {},
          status: "ACTIVE",
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        });
      },
      principal.userId,
    );
    return { id, name: input.name, sourceKey: input.sourceKey, origin: input.origin ?? "saved" };
  }

  async patchSaved(principal: ForgePrincipal, id: string, body: unknown) {
    this.assertManage(principal);
    const parsed = patchSavedReportInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid saved report patch", {
        details: parsed.error.issues,
      });
    }
    const input = parsed.data;

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(reportDefinitions)
          .where(
            and(
              eq(reportDefinitions.id, id),
              eq(reportDefinitions.tenantId, principal.tenantId),
              isNull(reportDefinitions.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Saved report not found");

        if (input.sourceKey) {
          const meta = builtinByKey(input.sourceKey);
          if (!meta) {
            throw new ForgeError("VALIDATION_FAILED", `Unknown sourceKey: ${input.sourceKey}`);
          }
        }

        await tx
          .update(reportDefinitions)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.sourceKey !== undefined ? { sourceKey: input.sourceKey } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.moduleCode !== undefined ? { moduleCode: input.moduleCode } : {}),
            ...(input.payloadJson !== undefined ? { payloadJson: input.payloadJson } : {}),
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
            recordVersion: (existing.recordVersion ?? 1) + 1,
          })
          .where(eq(reportDefinitions.id, id));

        return { id, updated: true };
      },
      principal.userId,
    );
  }

  async deleteSaved(principal: ForgePrincipal, id: string) {
    this.assertManage(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: reportDefinitions.id })
          .from(reportDefinitions)
          .where(
            and(
              eq(reportDefinitions.id, id),
              eq(reportDefinitions.tenantId, principal.tenantId),
              isNull(reportDefinitions.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Saved report not found");
        await tx
          .update(reportDefinitions)
          .set({
            deletedAt: new Date(),
            status: "DELETED",
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(eq(reportDefinitions.id, id));
        return { id, deleted: true };
      },
      principal.userId,
    );
  }

  async favorite(principal: ForgePrincipal, reportKey: string) {
    this.assertView(principal);
    const id = createId();
    const isUuid = UUID_RE.test(reportKey);

    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx
          .select({ id: reportFavorites.id })
          .from(reportFavorites)
          .where(
            and(
              eq(reportFavorites.tenantId, principal.tenantId),
              eq(reportFavorites.userId, principal.userId),
              isUuid
                ? eq(reportFavorites.reportDefinitionId, reportKey)
                : eq(reportFavorites.reportKey, reportKey),
            ),
          )
          .limit(1);
        if (existing.length) return;

        await tx.insert(reportFavorites).values({
          id,
          tenantId: principal.tenantId,
          userId: principal.userId,
          reportKey: isUuid ? null : reportKey,
          reportDefinitionId: isUuid ? reportKey : null,
        });
      },
      principal.userId,
    );
    return { reportKey, favorited: true };
  }

  async unfavorite(principal: ForgePrincipal, reportKey: string) {
    this.assertView(principal);
    const isUuid = UUID_RE.test(reportKey);
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await tx
          .delete(reportFavorites)
          .where(
            and(
              eq(reportFavorites.tenantId, principal.tenantId),
              eq(reportFavorites.userId, principal.userId),
              isUuid
                ? eq(reportFavorites.reportDefinitionId, reportKey)
                : eq(reportFavorites.reportKey, reportKey),
            ),
          );
      },
      principal.userId,
    );
    return { reportKey, favorited: false };
  }

  async listFavorites(principal: ForgePrincipal) {
    this.assertView(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(reportFavorites)
          .where(
            and(
              eq(reportFavorites.tenantId, principal.tenantId),
              eq(reportFavorites.userId, principal.userId),
            ),
          )
          .orderBy(desc(reportFavorites.createdAt))
          .limit(200);
        return { items: rows, total: rows.length };
      },
      principal.userId,
    );
  }

  async listHistory(principal: ForgePrincipal) {
    this.assertView(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(reportExecutions)
          .where(eq(reportExecutions.tenantId, principal.tenantId))
          .orderBy(desc(reportExecutions.createdAt))
          .limit(100);
        return { items: rows, total: rows.length };
      },
      principal.userId,
    );
  }

  async listExports(principal: ForgePrincipal) {
    this.assertView(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select({
            id: reportExports.id,
            reportKey: reportExports.reportKey,
            reportName: reportExports.reportName,
            format: reportExports.format,
            filename: reportExports.filename,
            contentType: reportExports.contentType,
            byteSize: reportExports.byteSize,
            status: reportExports.status,
            executionId: reportExports.executionId,
            jobId: reportExports.jobId,
            storage: sql<string>`case when ${reportExports.artifactObjectKey} is not null then 'S3' else 'INLINE' end`,
            createdAt: reportExports.createdAt,
            expiresAt: reportExports.expiresAt,
          })
          .from(reportExports)
          .where(eq(reportExports.tenantId, principal.tenantId))
          .orderBy(desc(reportExports.createdAt))
          .limit(100);
        return { items: rows, total: rows.length };
      },
      principal.userId,
    );
  }

  async listSchedules(principal: ForgePrincipal) {
    this.assertView(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select({ schedule: reportSchedules, sourceKey: reportDefinitions.sourceKey })
          .from(reportSchedules)
          .leftJoin(reportDefinitions, eq(reportDefinitions.id, reportSchedules.reportDefinitionId))
          .where(
            and(
              eq(reportSchedules.tenantId, principal.tenantId),
              isNull(reportSchedules.deletedAt),
            ),
          )
          .orderBy(desc(reportSchedules.createdAt))
          .limit(200);
        const scheduleIds = rows.map((row) => row.schedule.id);
        const recipientRows =
          scheduleIds.length > 0
            ? await tx
                .select({
                  scheduleId: reportRecipients.scheduleId,
                  email: reportRecipients.email,
                  name: reportRecipients.name,
                })
                .from(reportRecipients)
                .where(inArray(reportRecipients.scheduleId, scheduleIds))
            : [];
        const items = rows.map(({ schedule, sourceKey }) => ({
          ...schedule,
          sourceKey: sourceKey ?? null,
          recipients: recipientRows
            .filter((r) => r.scheduleId === schedule.id)
            .map((r) => ({ email: r.email, name: r.name })),
        }));
        return { items, total: items.length };
      },
      principal.userId,
    );
  }

  async createSchedule(principal: ForgePrincipal, body: unknown) {
    this.assertSchedule(principal);
    const parsed = createReportScheduleInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid schedule", {
        details: parsed.error.issues,
      });
    }
    const input = parsed.data;
    if (!isValidCronExpression(input.cronExpression)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "cronExpression must be a 5-field cron (minute hour day month weekday)",
      );
    }
    const id = createId();
    const nextRunAt = computeNextCronRun(input.cronExpression) ?? null;

    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [def] = await tx
          .select({ id: reportDefinitions.id })
          .from(reportDefinitions)
          .where(
            and(
              eq(reportDefinitions.id, input.reportDefinitionId),
              eq(reportDefinitions.tenantId, principal.tenantId),
              isNull(reportDefinitions.deletedAt),
            ),
          )
          .limit(1);
        if (!def) throw new ForgeError("NOT_FOUND", "Report definition not found");

        await tx.insert(reportSchedules).values({
          id,
          tenantId: principal.tenantId,
          reportDefinitionId: input.reportDefinitionId,
          name: input.name,
          cronExpression: input.cronExpression,
          timezone: input.timezone ?? "UTC",
          format: input.format,
          enabled: input.enabled ?? true,
          runInputJson: input.runInputJson ?? {},
          nextRunAt,
          createdByUserId: principal.userId,
        });

        for (const recipient of input.recipients ?? []) {
          await tx.insert(reportRecipients).values({
            id: createId(),
            tenantId: principal.tenantId,
            scheduleId: id,
            email: recipient.email,
            name: recipient.name ?? null,
          });
        }
      },
      principal.userId,
    );

    return { id, name: input.name, nextRunAt: nextRunAt?.toISOString() ?? null };
  }

  async patchSchedule(principal: ForgePrincipal, id: string, body: unknown) {
    this.assertSchedule(principal);
    const parsed = patchReportScheduleInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid schedule patch", {
        details: parsed.error.issues,
      });
    }
    const input = parsed.data;
    if (input.cronExpression && !isValidCronExpression(input.cronExpression)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "cronExpression must be a 5-field cron (minute hour day month weekday)",
      );
    }

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(reportSchedules)
          .where(
            and(
              eq(reportSchedules.id, id),
              eq(reportSchedules.tenantId, principal.tenantId),
              isNull(reportSchedules.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Schedule not found");

        const cronExpression = input.cronExpression ?? existing.cronExpression;
        const nextRunAt =
          input.cronExpression !== undefined || input.enabled === true
            ? computeNextCronRun(cronExpression)
            : undefined;

        await tx
          .update(reportSchedules)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.cronExpression !== undefined ? { cronExpression: input.cronExpression } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone ?? "UTC" } : {}),
            ...(input.format !== undefined ? { format: input.format } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.runInputJson !== undefined ? { runInputJson: input.runInputJson } : {}),
            ...(nextRunAt !== undefined ? { nextRunAt } : {}),
            updatedAt: new Date(),
            recordVersion: (existing.recordVersion ?? 1) + 1,
          })
          .where(eq(reportSchedules.id, id));

        if (input.recipients) {
          await tx.delete(reportRecipients).where(eq(reportRecipients.scheduleId, id));
          for (const recipient of input.recipients) {
            await tx.insert(reportRecipients).values({
              id: createId(),
              tenantId: principal.tenantId,
              scheduleId: id,
              email: recipient.email,
              name: recipient.name ?? null,
            });
          }
        }

        return { id, updated: true, nextRunAt: nextRunAt?.toISOString() ?? null };
      },
      principal.userId,
    );
  }

  async deleteSchedule(principal: ForgePrincipal, id: string) {
    this.assertSchedule(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: reportSchedules.id })
          .from(reportSchedules)
          .where(
            and(
              eq(reportSchedules.id, id),
              eq(reportSchedules.tenantId, principal.tenantId),
              isNull(reportSchedules.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Schedule not found");
        await tx
          .update(reportSchedules)
          .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
          .where(eq(reportSchedules.id, id));
        return { id, deleted: true };
      },
      principal.userId,
    );
  }

  async createShare(principal: ForgePrincipal, body: unknown) {
    this.assertShare(principal);
    const parsed = createShareInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid share", {
        details: parsed.error.issues,
      });
    }
    const input = parsed.data;
    if (!input.sharedWithUserId && !input.sharedWithRoleId) {
      throw new ForgeError("VALIDATION_FAILED", "sharedWithUserId or sharedWithRoleId is required");
    }
    const id = createId();

    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [def] = await tx
          .select({ id: reportDefinitions.id })
          .from(reportDefinitions)
          .where(
            and(
              eq(reportDefinitions.id, input.reportDefinitionId),
              eq(reportDefinitions.tenantId, principal.tenantId),
              isNull(reportDefinitions.deletedAt),
            ),
          )
          .limit(1);
        if (!def) throw new ForgeError("NOT_FOUND", "Report definition not found");

        await tx.insert(reportShares).values({
          id,
          tenantId: principal.tenantId,
          reportDefinitionId: input.reportDefinitionId,
          sharedWithUserId: input.sharedWithUserId ?? null,
          sharedWithRoleId: input.sharedWithRoleId ?? null,
          permission: input.permission,
          createdByUserId: principal.userId,
        });
      },
      principal.userId,
    );

    return { id };
  }

  async listShares(principal: ForgePrincipal) {
    this.assertView(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(reportShares)
          .where(eq(reportShares.tenantId, principal.tenantId))
          .orderBy(desc(reportShares.createdAt))
          .limit(200);
        return { items: rows, total: rows.length };
      },
      principal.userId,
    );
  }

  async deleteShare(principal: ForgePrincipal, id: string) {
    this.assertShare(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: reportShares.id })
          .from(reportShares)
          .where(and(eq(reportShares.id, id), eq(reportShares.tenantId, principal.tenantId)))
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Share not found");
        await tx.delete(reportShares).where(eq(reportShares.id, id));
        return { id, deleted: true };
      },
      principal.userId,
    );
  }

  /**
   * Execute enabled schedules that are due for this tenant.
   * Recipients receive a delivery email via the platform notifications mailer.
   */
  async runDueSchedules(principal: ForgePrincipal) {
    this.assertSchedule(principal);
    const now = new Date();

    const due = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select({ schedule: reportSchedules, sourceKey: reportDefinitions.sourceKey })
          .from(reportSchedules)
          .leftJoin(reportDefinitions, eq(reportDefinitions.id, reportSchedules.reportDefinitionId))
          .where(
            and(
              eq(reportSchedules.tenantId, principal.tenantId),
              eq(reportSchedules.enabled, true),
              isNull(reportSchedules.deletedAt),
              or(isNull(reportSchedules.nextRunAt), lte(reportSchedules.nextRunAt, now))!,
            ),
          )
          .orderBy(reportSchedules.createdAt)
          .limit(25);
        return rows.map(({ schedule, sourceKey }) => ({ ...schedule, sourceKey }));
      },
      principal.userId,
    );

    const results: Array<{
      scheduleId: string;
      name: string;
      status: "SUCCEEDED" | "FAILED";
      exportId?: string;
      error?: string;
      recipientsQueued?: number;
      emailsAccepted?: number;
    }> = [];

    for (const schedule of due) {
      try {
        const runInput = resolveRelativeDateRange(
          reportRunInputSchema.parse(schedule.runInputJson ?? {}),
        );
        const format = (
          ["csv", "xlsx", "pdf"].includes(schedule.format) ? schedule.format : "csv"
        ) as ReportExportFormat;

        const exported = await this.exportReport(principal, schedule.reportDefinitionId, {
          ...runInput,
          format,
        });

        const recipients = await withTenantTransaction(
          this.db,
          principal.tenantId,
          async (tx) => {
            return tx
              .select()
              .from(reportRecipients)
              .where(eq(reportRecipients.scheduleId, schedule.id));
          },
          principal.userId,
        );

        const resolvedRecipients = await this.resolveScheduleRecipients(
          principal,
          recipients.map((r) => ({ email: r.email, name: r.name })),
        );

        const delivery =
          schedule.sourceKey === WC_WEEKLY_STATUS_REPORT_KEY
            ? await this.deliverWorkersCompWeeklyStatus(principal, resolvedRecipients)
            : await this.deliverScheduleExport(principal, {
                scheduleName: schedule.name,
                reportName: exported.filename,
                format,
                exportId: exported.exportId,
                filename: exported.filename,
                byteSize: exported.byteSize ?? 0,
                recipients: resolvedRecipients,
              });

        await withTenantTransaction(
          this.db,
          principal.tenantId,
          async (tx) => {
            const nextRunAt = computeNextCronRunAfter(schedule.cronExpression, now);
            await tx
              .update(reportSchedules)
              .set({
                lastRunAt: now,
                nextRunAt,
                updatedAt: new Date(),
              })
              .where(eq(reportSchedules.id, schedule.id));

            await this.audit.writeInTransaction(tx, {
              tenantId: principal.tenantId,
              actorUserId: principal.userId,
              actorPersonId: principal.personId,
              actorType: "USER",
              action: "reporting.schedule.run",
              resourceType: "report_schedule",
              resourceId: schedule.id,
              result: "SUCCESS",
              riskLevel: "LOW",
              correlationId: principal.correlationId,
              requestId: principal.requestId,
              after: {
                exportId: exported.exportId,
                format,
                recipientCount: resolvedRecipients.length,
                delivery: delivery.mode,
                emailsAccepted: delivery.accepted,
                emailResults: delivery.results,
              },
            });
          },
          principal.userId,
        );

        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          status: "SUCCEEDED",
          exportId: exported.exportId,
          recipientsQueued: resolvedRecipients.length,
          emailsAccepted: delivery.accepted,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Schedule run failed";
        await withTenantTransaction(
          this.db,
          principal.tenantId,
          async (tx) => {
            const nextRunAt = computeNextCronRunAfter(schedule.cronExpression, now);
            await tx
              .update(reportSchedules)
              .set({
                lastRunAt: now,
                nextRunAt,
                updatedAt: new Date(),
              })
              .where(eq(reportSchedules.id, schedule.id));
            await this.audit.writeInTransaction(tx, {
              tenantId: principal.tenantId,
              actorUserId: principal.userId,
              actorPersonId: principal.personId,
              actorType: "USER",
              action: "reporting.schedule.run",
              resourceType: "report_schedule",
              resourceId: schedule.id,
              result: "FAILURE",
              riskLevel: "MEDIUM",
              correlationId: principal.correlationId,
              requestId: principal.requestId,
              after: { error: message.slice(0, 500) },
            });
          },
          principal.userId,
        );
        results.push({
          scheduleId: schedule.id,
          name: schedule.name,
          status: "FAILED",
          error: message,
        });
      }
    }

    return { processed: results.length, results };
  }

  /**
   * Platform sweep: find tenants with due enabled schedules (bypass RLS), then
   * run each tenant's due schedules under a synthetic platform principal.
   */
  async runDueSchedulesSweep(options?: { correlationId?: string; requestId?: string }) {
    const now = new Date();
    const correlationId = options?.correlationId ?? createId();
    const requestId = options?.requestId ?? createId();

    const tenantIds = await withBypassRlsTransaction(this.db, async (tx) => {
      const rows = await tx
        .selectDistinct({ tenantId: reportSchedules.tenantId })
        .from(reportSchedules)
        .where(
          and(
            eq(reportSchedules.enabled, true),
            isNull(reportSchedules.deletedAt),
            or(isNull(reportSchedules.nextRunAt), lte(reportSchedules.nextRunAt, now))!,
          ),
        );
      return rows.map((r) => r.tenantId).filter(Boolean);
    });

    const tenantResults: Array<{
      tenantId: string;
      processed: number;
      results: Array<{
        scheduleId: string;
        name: string;
        status: "SUCCEEDED" | "FAILED";
        exportId?: string;
        error?: string;
        recipientsQueued?: number;
        emailsAccepted?: number;
      }>;
      error?: string;
    }> = [];

    for (const tenantId of tenantIds) {
      try {
        const actorUserId = await withBypassRlsTransaction(this.db, async (tx) => {
          const [row] = await tx
            .select({ userId: userTenantMemberships.userId })
            .from(userTenantMemberships)
            .where(
              and(
                eq(userTenantMemberships.tenantId, tenantId),
                eq(userTenantMemberships.status, "ACTIVE"),
              ),
            )
            .limit(1);
          return row?.userId ?? null;
        });

        if (!actorUserId) {
          tenantResults.push({
            tenantId,
            processed: 0,
            results: [],
            error: "No active tenant member available as sweep actor",
          });
          continue;
        }

        const principal: ForgePrincipal = {
          authenticationIdentityId: "system:reporting-schedules-sweep",
          userId: actorUserId,
          personId: null,
          tenantId,
          organizationIds: [],
          permissions: new Set([
            "industrial.admin",
            "industrial.reporting.schedule",
            "industrial.reporting.export",
            "industrial.reporting.run",
            "industrial.supplies.view",
            "industrial.access",
          ]),
          activeProducts: new Set(["FORGE_INDUSTRIAL"]),
          activeModules: new Set(),
          correlationId,
          requestId,
          authProvider: "COGNITO",
          isPlatformAdmin: true,
        };

        const outcome = await this.runDueSchedules(principal);
        tenantResults.push({
          tenantId,
          processed: outcome.processed,
          results: outcome.results,
        });
      } catch (error) {
        tenantResults.push({
          tenantId,
          processed: 0,
          results: [],
          error: error instanceof Error ? error.message.slice(0, 500) : "Sweep failed",
        });
      }
    }

    return {
      tenantsProcessed: tenantResults.length,
      correlationId,
      results: tenantResults,
    };
  }

  private async resolveScheduleRecipients(
    principal: ForgePrincipal,
    recipients: Array<{ email: string; name: string | null }>,
  ): Promise<Array<{ email: string; name: string | null }>> {
    const hasDirectorMarker = recipients.some((r) => isSafetyDirectorRecipientMarker(r.email));
    const staticRecipients = recipients.filter((r) => !isSafetyDirectorRecipientMarker(r.email));

    const resolved: Array<{ email: string; name: string | null }> = [];
    const seen = new Set<string>();

    for (const recipient of staticRecipients) {
      const email = recipient.email.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({ email, name: recipient.name });
    }

    if (hasDirectorMarker) {
      const directors = await listSafetyDirectorRecipients(
        this.db,
        principal.tenantId,
        principal.userId,
      );
      const withEmail = directors.filter((d) => d.email.length > 0);
      if (withEmail.length === 0) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "No Safety Director recipients with email addresses were found for this scheduled report",
        );
      }
      for (const director of withEmail) {
        const key = director.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        resolved.push({ email: director.email, name: "Safety Director" });
      }
    }

    return resolved;
  }

  private async deliverWorkersCompWeeklyStatus(
    principal: ForgePrincipal,
    recipients: Array<{ email: string; name: string | null }>,
  ): Promise<{
    mode: "none" | "emailed" | "mailer_unavailable";
    accepted: number;
    results: Array<{ to: string; accepted: boolean; detail?: string }>;
  }> {
    if (recipients.length === 0) {
      return { mode: "none", accepted: 0, results: [] };
    }
    if (!this.industrialDomain) {
      throw new ForgeError(
        "INTERNAL_ERROR",
        "Workers' Comp weekly status delivery is not available",
      );
    }
    const outcome = await this.industrialDomain.sendWorkersCompWeeklyStatus(principal, {
      recipients: recipients.map((r) => r.email),
    });
    return { mode: "emailed", accepted: outcome.acceptedCount, results: outcome.results };
  }

  /**
   * Moves tenants that turned on the legacy Workers' Comp "weekly status" switch onto a
   * Reporting schedule (Fridays 7 AM Central) so it can be rescheduled or edited in Reports.
   */
  async migrateWorkersCompWeeklyStatusSchedules() {
    // tenant_settings RLS does not honor app.bypass_rls, so read it per tenant.
    const actors = await withBypassRlsTransaction(this.db, async (tx) =>
      tx
        .selectDistinctOn([userTenantMemberships.tenantId], {
          tenantId: userTenantMemberships.tenantId,
          userId: userTenantMemberships.userId,
        })
        .from(userTenantMemberships)
        .where(eq(userTenantMemberships.status, "ACTIVE"))
        .orderBy(userTenantMemberships.tenantId, userTenantMemberships.createdAt),
    );

    const migrated: Array<{ tenantId: string; scheduleId: string | null }> = [];
    for (const actor of actors) {
      const scheduleId = await withTenantTransaction(
        this.db,
        actor.tenantId,
        async (tx) => {
          const [row] = await tx
            .select({
              id: tenantSettings.id,
              valueJson: tenantSettings.valueJson,
              updatedByUserId: tenantSettings.updatedByUserId,
            })
            .from(tenantSettings)
            .where(
              and(
                eq(tenantSettings.tenantId, actor.tenantId),
                eq(tenantSettings.namespace, WC_WEEKLY_STATUS_SETTINGS_NAMESPACE),
                eq(tenantSettings.settingKey, WC_WEEKLY_STATUS_SETTINGS_KEY),
              ),
            )
            .limit(1);
          if (!row) return undefined;
          const settings = parseWorkersCompWeeklyStatusSettings(row.valueJson);
          if (!settings.enabled) return undefined;

          const [existing] = await tx
            .select({ id: reportSchedules.id })
            .from(reportSchedules)
            .innerJoin(
              reportDefinitions,
              eq(reportDefinitions.id, reportSchedules.reportDefinitionId),
            )
            .where(
              and(
                eq(reportSchedules.tenantId, actor.tenantId),
                isNull(reportSchedules.deletedAt),
                eq(reportDefinitions.sourceKey, WC_WEEKLY_STATUS_REPORT_KEY),
              ),
            )
            .limit(1);

          let createdId: string | null = null;
          if (!existing) {
            const actorUserId = row.updatedByUserId ?? actor.userId;
            const meta = builtinByKey(WC_WEEKLY_STATUS_REPORT_KEY);
            const definitionId = createId();
            await tx.insert(reportDefinitions).values({
              id: definitionId,
              tenantId: actor.tenantId,
              reportKey: null,
              name: meta?.name ?? "Workers' Comp Weekly Status",
              description: meta?.description ?? null,
              origin: "saved",
              category: meta?.category ?? "WorkersComp",
              moduleCode: meta?.module ?? "Workers' Comp",
              reportType: meta?.reportType ?? "operational",
              sourceKey: WC_WEEKLY_STATUS_REPORT_KEY,
              payloadJson: {},
              status: "ACTIVE",
              createdByUserId: actorUserId,
              updatedByUserId: actorUserId,
            });
            createdId = createId();
            await tx.insert(reportSchedules).values({
              id: createdId,
              tenantId: actor.tenantId,
              reportDefinitionId: definitionId,
              name: meta?.name ?? "Workers' Comp Weekly Status",
              cronExpression: WC_WEEKLY_STATUS_DEFAULT_CRON,
              timezone: "America/Chicago",
              format: "pdf",
              enabled: true,
              runInputJson: {},
              nextRunAt: computeNextCronRun(WC_WEEKLY_STATUS_DEFAULT_CRON),
              createdByUserId: actorUserId,
            });
            for (const email of settings.recipients) {
              await tx.insert(reportRecipients).values({
                id: createId(),
                tenantId: actor.tenantId,
                scheduleId: createdId,
                email,
                name: null,
              });
            }
          }

          await tx
            .update(tenantSettings)
            .set({
              valueJson: { ...settings, enabled: false },
              recordVersion: sql`${tenantSettings.recordVersion} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(tenantSettings.id, row.id));
          return createdId ?? existing?.id ?? null;
        },
        actor.userId,
      );
      if (scheduleId !== undefined) migrated.push({ tenantId: actor.tenantId, scheduleId });
    }
    return { migrated };
  }

  private async deliverScheduleExport(
    principal: ForgePrincipal,
    input: {
      scheduleName: string;
      reportName: string;
      format: ReportExportFormat;
      exportId: string;
      filename: string;
      byteSize: number;
      recipients: Array<{ email: string; name: string | null }>;
    },
  ): Promise<{
    mode: "none" | "emailed" | "mailer_unavailable";
    accepted: number;
    results: Array<{ to: string; accepted: boolean; detail?: string }>;
  }> {
    if (input.recipients.length === 0) {
      return { mode: "none", accepted: 0, results: [] };
    }
    if (!this.notifications) {
      return {
        mode: "mailer_unavailable",
        accepted: 0,
        results: input.recipients.map((r) => ({
          to: r.email,
          accepted: false,
          detail: "NotificationsService not available",
        })),
      };
    }
    const mailer = this.notifications;

    let downloadUrl: string | null = null;
    try {
      const download = await this.createExportDownload(principal, input.exportId);
      downloadUrl = download.downloadUrl;
    } catch {
      downloadUrl = null;
    }

    const sizeLabel =
      input.byteSize >= 1024
        ? `${Math.round(input.byteSize / 1024)} KB`
        : `${input.byteSize} bytes`;
    const subject = `Scheduled report: ${input.scheduleName}`;
    const linkLine = downloadUrl
      ? `Download (expires soon): ${downloadUrl}`
      : "Open Industrial Reporting → Exports to download the file.";
    const htmlLink = downloadUrl
      ? `<p><a href="${downloadUrl}">Download ${input.filename}</a> (link expires soon)</p>`
      : `<p>Open <strong>Industrial Reporting → Exports</strong> to download <code>${input.filename}</code>.</p>`;

    const htmlBody = [
      `<p>Your scheduled report <strong>${escapeHtml(input.scheduleName)}</strong> is ready.</p>`,
      `<ul>`,
      `<li>File: <code>${escapeHtml(input.filename)}</code></li>`,
      `<li>Format: ${escapeHtml(input.format.toUpperCase())}</li>`,
      `<li>Size: ${escapeHtml(sizeLabel)}</li>`,
      `</ul>`,
      htmlLink,
      `<p class="muted">Export id: ${escapeHtml(input.exportId)}</p>`,
    ].join("");

    const textBody = [
      `Your scheduled report "${input.scheduleName}" is ready.`,
      `File: ${input.filename}`,
      `Format: ${input.format.toUpperCase()}`,
      `Size: ${sizeLabel}`,
      linkLine,
      `Export id: ${input.exportId}`,
    ].join("\n");

    const results: Array<{ to: string; accepted: boolean; detail?: string }> = [];
    for (const recipient of input.recipients) {
      const result = await mailer.sendTemplatedEmail({
        to: recipient.email,
        templateKey: "reporting_schedule_delivery",
        tenantId: principal.tenantId,
        vars: {
          subject,
          htmlBody,
          textBody,
          scheduleName: input.scheduleName,
          filename: input.filename,
        },
      });
      results.push({
        to: recipient.email,
        accepted: result.accepted,
        ...(result.detail ? { detail: result.detail } : {}),
      });
    }

    return {
      mode: "emailed",
      accepted: results.filter((r) => r.accepted).length,
      results,
    };
  }

  async getSettings(principal: ForgePrincipal) {
    this.assertView(principal);
    const provider = this.notifications?.getEmailProviderName() ?? "unavailable";
    return {
      defaultExportFormat: "csv" as const,
      supportedFormats: ["csv", "xlsx", "pdf"] as const,
      inlineExportMaxChars: INLINE_MAX_CHARS,
      largeExportStorage: "S3",
      scheduleCronTimezoneDefault: "UTC",
      emailDelivery: provider === "unavailable" ? "unavailable" : provider,
      emailDeliveryNotes:
        provider === "noop"
          ? "Mailer is in noop mode (accepted locally). Set FORGE_EMAIL_PROVIDER=resend (or ses) for production delivery."
          : provider === "ses"
            ? "SES provider configured; delivery depends on SES_FROM_ADDRESS and send wiring."
            : provider === "unavailable"
              ? "Notifications mailer is not mounted."
              : undefined,
      permissions: {
        view: this.canViewReporting(principal),
        run: this.canRun(principal),
        export: this.canExport(principal),
        manage: this.canManage(principal),
        schedule: this.canSchedule(principal),
        share: this.canShare(principal),
      },
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
