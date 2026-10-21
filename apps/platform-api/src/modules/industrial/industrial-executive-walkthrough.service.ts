import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE,
  EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS,
  EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS,
  estimateWalkthroughRuntimeMs,
} from "@forge/contracts";
import {
  createId,
  industrialExecutiveWalkthroughSettings,
  platformJobs,
  tenants,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertWalkthroughTenantAllowed } from "../../common/demo-tenant.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { IndustrialExecutiveWalkthroughNarrationService } from "./industrial-executive-walkthrough-narration.service.js";
import {
  hashWalkthroughContent,
  IndustrialExecutiveWalkthroughRenderService,
} from "./industrial-executive-walkthrough-render.service.js";

const VIEW = [
  "industrial.presentation.executive.view",
  "industrial.presentation.executive.manage",
  "industrial.presentation.executive.export",
  "industrial.admin",
  "industrial.access",
] as const;
const MANAGE = ["industrial.presentation.executive.manage", "industrial.admin"] as const;
const EXPORT = [
  "industrial.presentation.executive.export",
  "industrial.presentation.executive.manage",
  "industrial.admin",
  "industrial.access",
] as const;
const DELETE_EXPORT = [
  "industrial.presentation.executive.delete_export",
  "industrial.presentation.executive.manage",
  "industrial.admin",
] as const;

const settingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  voiceId: z.string().min(1).max(120).optional(),
  narrationSpeed: z.number().int().min(50).max(200).optional(),
  captionsDefault: z.boolean().optional(),
  includeIntro: z.boolean().optional(),
  includeOutro: z.boolean().optional(),
  exportResolution: z.enum(["1080p", "720p"]).optional(),
  retentionDays: z.number().int().positive().nullable().optional(),
  closingText: z.string().max(2000).nullable().optional(),
});

const createExportSchema = z.object({
  resolution: z.enum(["1080p", "720p"]).optional(),
  includeNarration: z.boolean().optional(),
  burnCaptions: z.boolean().optional(),
  includeIntro: z.boolean().optional(),
  includeOutro: z.boolean().optional(),
  videoTitle: z.string().min(1).max(200).optional(),
});

type SettingsDto = {
  enabled: boolean;
  voiceId: string;
  narrationSpeed: number;
  captionsDefault: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  exportResolution: "1080p" | "720p";
  retentionDays: number | null;
  closingText: string | null;
  sceneOverrides?: Record<string, unknown>;
};

@Injectable()
export class IndustrialExecutiveWalkthroughService {
  private readonly logger = new Logger(IndustrialExecutiveWalkthroughService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly narration: IndustrialExecutiveWalkthroughNarrationService,
    private readonly render: IndustrialExecutiveWalkthroughRenderService,
  ) {}

  private assertAny(principal: ForgePrincipal, perms: readonly string[]) {
    if (principal.isPlatformAdmin) return;
    if (!perms.some((p) => hasPermission(principal, p))) {
      throw new ForgeError("FORBIDDEN", "Missing executive walkthrough permission");
    }
  }

  private isMissingWalkthroughRelation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      /industrial_executive_walkthrough_/i.test(message) &&
      (/does not exist/i.test(message) || /undefined_table/i.test(message))
    );
  }

  private defaultSettingsDto(): SettingsDto {
    const preferredVoice = process.env.POLLY_VOICE_ID?.trim() || "Stephen";
    return {
      enabled: true,
      voiceId: preferredVoice,
      narrationSpeed: 100,
      captionsDefault: true,
      includeIntro: true,
      includeOutro: true,
      exportResolution: "1080p",
      retentionDays: null,
      closingText: null,
    };
  }

  private mapSettings(
    row: typeof industrialExecutiveWalkthroughSettings.$inferSelect,
  ): SettingsDto {
    let sceneOverrides: Record<string, unknown> = {};
    const raw = row.sceneOverrides as unknown;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          sceneOverrides = parsed as Record<string, unknown>;
        }
      } catch {
        sceneOverrides = {};
      }
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      sceneOverrides = raw as Record<string, unknown>;
    }
    return {
      enabled: row.enabled,
      voiceId: row.voiceId,
      narrationSpeed: row.narrationSpeed,
      captionsDefault: row.captionsDefault,
      includeIntro: row.includeIntro,
      includeOutro: row.includeOutro,
      exportResolution: row.exportResolution === "720p" ? "720p" : "1080p",
      retentionDays: row.retentionDays ?? null,
      closingText: row.closingText ?? null,
      sceneOverrides,
    };
  }

  private async getOrCreateSettings(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    const preferredVoice = process.env.POLLY_VOICE_ID?.trim() || "Stephen";
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const existing = await tx.query.industrialExecutiveWalkthroughSettings.findFirst({
        where: eq(industrialExecutiveWalkthroughSettings.tenantId, principal.tenantId),
      });
      if (existing) {
        // Upgrade the original robotic default to a natural generative voice.
        if (existing.voiceId === "Joanna" && preferredVoice !== "Joanna") {
          const now = new Date();
          await tx
            .update(industrialExecutiveWalkthroughSettings)
            .set({ voiceId: preferredVoice, updatedAt: now })
            .where(eq(industrialExecutiveWalkthroughSettings.id, existing.id));
          return { ...existing, voiceId: preferredVoice, updatedAt: now };
        }
        return existing;
      }
      const id = createId();
      const now = new Date();
      await tx.insert(industrialExecutiveWalkthroughSettings).values({
        id,
        tenantId: principal.tenantId,
        enabled: true,
        voiceId: preferredVoice,
        narrationSpeed: 100,
        captionsDefault: true,
        includeIntro: true,
        includeOutro: true,
        exportResolution: "1080p",
        retentionDays: null,
        closingText: null,
        sceneOverrides: {},
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });
      const created = await tx.query.industrialExecutiveWalkthroughSettings.findFirst({
        where: eq(industrialExecutiveWalkthroughSettings.id, id),
      });
      if (!created) throw new ForgeError("INTERNAL_ERROR", "Failed to create walkthrough settings");
      return created;
    }, principal.userId);
  }

  private mapExport(row: typeof platformJobs.$inferSelect) {
    const result = (row.resultJson ?? {}) as Record<string, unknown>;
    const walkthroughStatus = String(result.walkthroughStatus ?? "").toLowerCase();
    const status =
      row.status === "SUCCEEDED"
        ? "completed"
        : row.status === "FAILED"
          ? "failed"
          : walkthroughStatus ||
            (row.status === "QUEUED" || row.status === "PENDING" ? "queued" : "preparing");
    return {
      id: row.id,
      status,
      progress: row.progress,
      videoTitle: String(result.videoTitle ?? EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE),
      resolution: (result.resolution === "720p" ? "720p" : "1080p") as "1080p" | "720p",
      includeNarration: Boolean(result.includeNarration ?? true),
      burnCaptions: Boolean(result.burnCaptions ?? false),
      durationSeconds:
        typeof result.durationSeconds === "number" ? result.durationSeconds : undefined,
      fileName: row.artifactFilename ?? undefined,
      errorMessage: row.failure ?? (typeof result.errorMessage === "string" ? result.errorMessage : undefined),
      contentVersion: String(result.contentVersion ?? ""),
      requestedAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
    };
  }

  async getSettings(principal: ForgePrincipal): Promise<SettingsDto> {
    this.assertAny(principal, VIEW);
    return this.mapSettings(await this.getOrCreateSettings(principal));
  }

  async updateSettings(principal: ForgePrincipal, body: unknown): Promise<SettingsDto> {
    this.assertAny(principal, MANAGE);
    const patch = settingsPatchSchema.parse(body ?? {});
    const current = await this.getOrCreateSettings(principal);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await tx
        .update(industrialExecutiveWalkthroughSettings)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(industrialExecutiveWalkthroughSettings.id, current.id));
      const updated = await tx.query.industrialExecutiveWalkthroughSettings.findFirst({
        where: eq(industrialExecutiveWalkthroughSettings.id, current.id),
      });
      if (!updated) throw new ForgeError("NOT_FOUND", "Settings not found");
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "industrial.presentation.executive.settings.update",
        resourceType: "executive_walkthrough_settings",
        resourceId: updated.id,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: patch,
      });
      return this.mapSettings(updated);
    }, principal.userId);
  }

  async validate(principal: ForgePrincipal) {
    this.assertAny(principal, VIEW);
    const settings = await this.getOrCreateSettings(principal);
    const projectedRuntimeMs = estimateWalkthroughRuntimeMs(EXECUTIVE_WALKTHROUGH_STEPS);
    const issues: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      sceneId?: string;
    }> = [];

    if (!settings.enabled) {
      issues.push({
        code: "presentation_disabled",
        severity: "error",
        message: "Executive walkthrough is disabled for this tenant.",
      });
    }
    if (projectedRuntimeMs > EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS) {
      issues.push({
        code: "runtime_exceeds_max",
        severity: "error",
        message: "Projected runtime exceeds the ten-minute maximum.",
      });
    } else if (projectedRuntimeMs > EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS) {
      issues.push({
        code: "runtime_near_limit",
        severity: "warning",
        message: "Projected runtime exceeds 9:30. Shorten narration before export.",
      });
    }

    return {
      ready: !issues.some((i) => i.severity === "error"),
      projectedRuntimeMs,
      issues,
    };
  }

  private resolveSteps(settings: SettingsDto & { sceneOverrides?: Record<string, unknown> }) {
    const overrides =
      settings.sceneOverrides && typeof settings.sceneOverrides === "object"
        ? settings.sceneOverrides
        : {};
    return EXECUTIVE_WALKTHROUGH_STEPS.map((step) => {
      const override = overrides[step.id];
      const patch =
        override && typeof override === "object" ? (override as Record<string, unknown>) : {};
      let narrationText = step.narrationText;
      let durationMs = step.durationMs;
      if (step.id === "closing" && settings.closingText?.trim()) {
        narrationText = settings.closingText.trim();
      }
      if (typeof patch.narrationText === "string" && patch.narrationText.trim()) {
        narrationText = patch.narrationText.trim();
      }
      if (typeof patch.durationMs === "number" && patch.durationMs > 0) {
        durationMs = patch.durationMs;
      }
      return {
        ...step,
        narrationText,
        durationMs,
        title: String((step as { title?: string }).title ?? step.id),
      };
    });
  }

  async getConfig(principal: ForgePrincipal) {
    this.assertAny(principal, VIEW);

    let settings = this.defaultSettingsDto();
    let settingsFromDb = false;
    try {
      settings = this.mapSettings(await this.getOrCreateSettings(principal));
      settingsFromDb = true;
    } catch (error) {
      if (!this.isMissingWalkthroughRelation(error)) throw error;
      this.logger.warn(
        `Walkthrough settings table missing for tenant=${principal.tenantId}; serving in-memory defaults until migration 0088 is applied.`,
      );
    }

    const resolvedSteps = this.resolveSteps(settings);
    const contentVersion = hashWalkthroughContent({
      voiceId: settings.voiceId,
      narrationSpeed: settings.narrationSpeed,
      closingText: settings.closingText,
      steps: resolvedSteps,
    });

    let validation = {
      ready: true,
      projectedRuntimeMs: estimateWalkthroughRuntimeMs(resolvedSteps),
      issues: [] as Array<{
        code: string;
        severity: "error" | "warning";
        message: string;
        sceneId?: string;
      }>,
    };
    try {
      validation = await this.validate(principal);
    } catch (error) {
      if (!this.isMissingWalkthroughRelation(error)) throw error;
    }
    if (!settingsFromDb) {
      validation = {
        ...validation,
        issues: [
          ...validation.issues,
          {
            code: "walkthrough_migration_pending",
            severity: "warning",
            message:
              "Walkthrough database migration (0088) is not applied yet. Interactive playback works; Polly narration cache and MP4 export require the migration.",
          },
        ],
      };
    }

    let steps = resolvedSteps.map((step) => ({
      id: step.id,
      title: step.title,
      route: step.route,
      durationMs: step.durationMs,
      narrationText: step.narrationText,
      targetSelector: step.targetSelector,
      secondarySelectors: step.secondarySelectors ? [...step.secondarySelectors] : undefined,
      requiredModule: step.requiredModule,
      skipIfUnavailable: step.skipIfUnavailable,
      narration: null as null | {
        sceneId: string;
        durationMs: number;
        downloadUrl: string;
        contentType: string;
      },
    }));

    if (settingsFromDb) {
      try {
        const cached = await this.narration.listCachedForVersion(
          principal.tenantId,
          contentVersion,
          settings.voiceId,
          principal.userId,
        );
        const byScene = new Map(cached.map((row) => [row.sceneId, row]));
        steps = await Promise.all(
          steps.map(async (step) => {
            const row = byScene.get(step.id);
            if (!row) return step;
            // Skip stale cache rows that were keyed by an older contentVersion shape
            // or that no longer match the saved narration script.
            const expectedHash = createHash("sha256")
              .update(String(step.narrationText ?? "").trim())
              .digest("hex");
            if (row.textHash && row.textHash !== expectedHash) return step;
            return {
              ...step,
              durationMs: Math.max(step.durationMs, row.durationMs),
              narration: {
                sceneId: row.sceneId,
                durationMs: row.durationMs,
                downloadUrl: await this.narration.presignDownload(row.storageKey, row.contentType),
                contentType: row.contentType,
              },
            };
          }),
        );
      } catch (error) {
        if (!this.isMissingWalkthroughRelation(error)) throw error;
      }
    }

    let latestExport = null as Awaited<ReturnType<typeof this.listExports>>["items"][number] | null;
    try {
      const exports = await this.listExports(principal);
      latestExport =
        exports.items.find((item) => item.contentVersion === contentVersion) ??
        exports.items[0] ??
        null;
    } catch (error) {
      if (!this.isMissingWalkthroughRelation(error)) {
        this.logger.warn(
          `Walkthrough export list failed for tenant=${principal.tenantId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const tenantDisplayName = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select({ displayName: tenants.displayName })
          .from(tenants)
          .where(eq(tenants.id, principal.tenantId))
          .limit(1);
        return row?.displayName ?? "Tenant";
      },
      principal.userId,
    );

    return {
      presentationId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
      contentVersion,
      tenantDisplayName,
      settings,
      steps,
      latestExport,
      validation,
    };
  }

  async ensureNarration(principal: ForgePrincipal, body: unknown = {}) {
    // Interactive Present needs narration assets; do not gate behind export-only.
    this.assertAny(principal, VIEW);
    const input = z
      .object({ voiceId: z.string().min(1).max(120).optional() })
      .parse(body ?? {});
    const settings = this.mapSettings(await this.getOrCreateSettings(principal));
    const voiceId = input.voiceId?.trim() || settings.voiceId;
    if (
      input.voiceId?.trim() &&
      input.voiceId.trim() !== settings.voiceId &&
      MANAGE.some((p) => hasPermission(principal, p))
    ) {
      await this.updateSettings(principal, { voiceId });
    }
    const resolvedSteps = this.resolveSteps(settings);
    const contentVersion = hashWalkthroughContent({
      voiceId,
      narrationSpeed: settings.narrationSpeed,
      closingText: settings.closingText,
      steps: resolvedSteps,
    });
    const assets = await this.narration.ensureNarrationAssets(
      principal,
      contentVersion,
      voiceId,
      resolvedSteps,
      { speed: settings.narrationSpeed },
    );
    return {
      assets: assets.map((a) => ({
        sceneId: a.sceneId,
        durationMs: a.durationMs,
        downloadUrl: a.downloadUrl,
      })),
      contentVersion,
      voiceId,
    };
  }

  async createExport(principal: ForgePrincipal, body: unknown) {
    this.assertAny(principal, EXPORT);
    const input = createExportSchema.parse(body ?? {});
    const settings = this.mapSettings(await this.getOrCreateSettings(principal));
    if (!settings.enabled) {
      throw new ForgeError("VALIDATION_FAILED", "Executive walkthrough is disabled");
    }
    const validation = await this.validate(principal);
    if (!validation.ready) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        validation.issues.find((i) => i.severity === "error")?.message ??
          "Presentation is not ready for export",
      );
    }
    if (validation.projectedRuntimeMs > EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS) {
      this.logger.warn(
        `Export requested with projected runtime ${validation.projectedRuntimeMs}ms for tenant=${principal.tenantId}`,
      );
    }

    const resolvedSteps = this.resolveSteps(settings);
    const contentVersion = hashWalkthroughContent({
      voiceId: settings.voiceId,
      narrationSpeed: settings.narrationSpeed,
      closingText: settings.closingText,
      steps: resolvedSteps,
    });
    const jobId = createId();
    const options = {
      resolution: input.resolution ?? settings.exportResolution,
      includeNarration: input.includeNarration ?? true,
      burnCaptions: input.burnCaptions ?? false,
      includeIntro: input.includeIntro ?? settings.includeIntro,
      includeOutro: input.includeOutro ?? settings.includeOutro,
      videoTitle: input.videoTitle ?? EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE,
      contentVersion,
      voiceId: settings.voiceId,
      narrationSpeed: settings.narrationSpeed,
      closingText: settings.closingText,
    };

    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await tx.insert(platformJobs).values({
        id: jobId,
        tenantId: principal.tenantId,
        type: "export.executive-walkthrough",
        status: "QUEUED",
        progress: 0,
        attempt: 0,
        createdByUserId: principal.userId,
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        resultJson: {
          kind: "executive-walkthrough",
          walkthroughStatus: "queued",
          presentationId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
          ...options,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "executive_walkthrough_export_requested",
        resourceType: "platform_job",
        resourceId: jobId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: options,
      });
    }, principal.userId);

    setImmediate(() => {
      void this.render.processExport(jobId, principal, options).catch((error) => {
        this.logger.error(
          `Background export failed job=${jobId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });

    return {
      id: jobId,
      status: "queued" as const,
      progress: 0,
      videoTitle: options.videoTitle,
      resolution: options.resolution,
      includeNarration: options.includeNarration,
      burnCaptions: options.burnCaptions,
      contentVersion,
      requestedAt: new Date().toISOString(),
    };
  }

  async listExports(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx.query.platformJobs.findMany({
        where: and(
          eq(platformJobs.tenantId, principal.tenantId),
          eq(platformJobs.type, "export.executive-walkthrough"),
        ),
        orderBy: [desc(platformJobs.createdAt)],
        limit: 25,
      });
      return { items: rows.map((row) => this.mapExport(row)) };
    }, principal.userId);
  }

  async getExport(principal: ForgePrincipal, exportId: string) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const row = await tx.query.platformJobs.findFirst({
        where: and(
          eq(platformJobs.id, exportId),
          eq(platformJobs.tenantId, principal.tenantId),
          eq(platformJobs.type, "export.executive-walkthrough"),
        ),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Export not found");
      return this.mapExport(row);
    }, principal.userId);
  }

  async downloadExport(principal: ForgePrincipal, exportId: string) {
    this.assertAny(principal, EXPORT);
    const row = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      return tx.query.platformJobs.findFirst({
        where: and(
          eq(platformJobs.id, exportId),
          eq(platformJobs.tenantId, principal.tenantId),
          eq(platformJobs.type, "export.executive-walkthrough"),
        ),
      });
    }, principal.userId);
    if (!row) throw new ForgeError("NOT_FOUND", "Export not found");
    if (row.status !== "SUCCEEDED" || !row.artifactObjectKey) {
      throw new ForgeError("VALIDATION_FAILED", "Export is not ready for download");
    }
    const signed = await this.render.createDownloadUrl(
      row.artifactObjectKey,
      row.artifactFilename ?? "executive-walkthrough.mp4",
    );
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "executive_walkthrough_export_downloaded",
        resourceType: "platform_job",
        resourceId: exportId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
      });
    }, principal.userId);
    return {
      downloadUrl: signed.downloadUrl,
      fileName: row.artifactFilename ?? "executive-walkthrough.mp4",
      expiresAt: signed.expiresAt,
    };
  }

  async deleteExport(principal: ForgePrincipal, exportId: string) {
    this.assertAny(principal, DELETE_EXPORT);
    const objectKey = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const row = await tx.query.platformJobs.findFirst({
        where: and(
          eq(platformJobs.id, exportId),
          eq(platformJobs.tenantId, principal.tenantId),
          eq(platformJobs.type, "export.executive-walkthrough"),
        ),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Export not found");
      const key = row.artifactObjectKey;
      await tx
        .delete(platformJobs)
        .where(and(eq(platformJobs.id, exportId), eq(platformJobs.tenantId, principal.tenantId)));
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "executive_walkthrough_export_deleted",
        resourceType: "platform_job",
        resourceId: exportId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
      });
      return key;
    }, principal.userId);
    if (objectKey) {
      await this.render.deleteExportObject(objectKey).catch(() => undefined);
    }
    return { deleted: true };
  }

  async trackEvent(principal: ForgePrincipal, body: unknown) {
    this.assertAny(principal, VIEW);
    const event = String((body as { event?: string } | null)?.event ?? "").trim();
    if (!event) throw new ForgeError("VALIDATION_FAILED", "event is required");
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: event.slice(0, 120),
        resourceType: "executive_walkthrough",
        resourceId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: body as Record<string, unknown>,
      });
    }, principal.userId);
    return { ok: true };
  }

  resolvePublicRenderToken(token: string) {
    return this.render.resolveRenderToken(token);
  }
}
