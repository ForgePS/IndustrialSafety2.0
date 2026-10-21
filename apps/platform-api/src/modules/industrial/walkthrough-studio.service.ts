import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DEMO_SEED_TARGETS,
  DEMO_LOCATIONS,
  DEMO_DIVISIONS,
  INDUSTRIAL_DEMO_COMPANY_NAME,
  INDUSTRIAL_DEMO_TENANT_SLUG,
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
  WALKTHROUGH_RUNTIME_MAX_MS,
  WALKTHROUGH_VOICE_PROFILES,
  buildWalkthroughMp4Filename,
  estimateNarrationDurationMs,
  estimateWalkthroughStudioRuntimeMs,
  flattenWalkthroughScenes,
  formatWalkthroughRuntime,
  getWalkthroughRuntimeStatus,
  type WalkthroughDefinition,
} from "@forge/contracts";
import {
  createId,
  demoSeedVersions,
  industrialExecutiveWalkthroughSettings,
  platformJobs,
  tenants,
  walkthroughEvents,
  walkthroughShareLinks,
  walkthroughVideoExports,
  walkthroughs,
  withBypassRlsTransaction,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { assertTenantAllowedForDemoSeed, assertWalkthroughTenantAllowed } from "../../common/demo-tenant.js";
import { AuditService } from "../audit/audit.service.js";
import { IndustrialExecutiveWalkthroughService } from "./industrial-executive-walkthrough.service.js";
import { IndustrialDemoSeedService } from "./industrial-demo-seed.service.js";

const VIEW = [
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.presentation.executive.view",
  "industrial.admin",
  "industrial.access",
] as const;
const MANAGE = [
  "industrial.walkthrough.manage",
  "industrial.presentation.executive.manage",
  "industrial.admin",
] as const;
const DEMO_RESET = [
  "industrial.walkthrough.demo.reset",
  "industrial.walkthrough.demo.manage",
  "industrial.admin",
] as const;
const SHARE = [
  "industrial.walkthrough.share.manage",
  "industrial.walkthrough.manage",
  "industrial.admin",
] as const;
const ANALYTICS = [
  "industrial.walkthrough.analytics.view",
  "industrial.walkthrough.view",
  "industrial.admin",
] as const;
const GENERATE = [
  "industrial.walkthrough.videos.generate",
  "industrial.presentation.executive.export",
  "industrial.walkthrough.manage",
  "industrial.admin",
] as const;

function auditBase(principal: ForgePrincipal) {
  return {
    tenantId: principal.tenantId,
    actorUserId: principal.userId,
    actorPersonId: principal.personId,
    actorType: "USER" as const,
    result: "SUCCESS" as const,
    riskLevel: "LOW" as const,
    correlationId: principal.correlationId,
    requestId: principal.requestId,
  };
}

const shareSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  pin: z.string().min(4).max(12).nullable().optional(),
  allowInteractive: z.boolean().optional(),
  allowVideoDownload: z.boolean().optional(),
  allowChapterNavigation: z.boolean().optional(),
});

const exportSchema = z.object({
  voiceProfileId: z.string().min(1).max(120).optional(),
  narrationSpeed: z.number().min(0.9).max(1.15).optional(),
  resolution: z.enum(["1080p", "720p"]).optional(),
  captions: z.enum(["off", "burned_in", "subtitle_track"]).optional(),
  includeIntro: z.boolean().optional(),
  includeOutro: z.boolean().optional(),
  overrideRuntime: z.boolean().optional(),
});

const eventSchema = z.object({
  eventType: z.string().min(1).max(64),
  chapterKey: z.string().max(80).optional(),
  sceneKey: z.string().max(80).optional(),
  payload: z.record(z.unknown()).optional(),
  sessionId: z.string().uuid().optional(),
});

const scenePatchSchema = z.object({
  sceneKey: z.string().min(1).max(80),
  narrationText: z.string().max(8000).optional(),
  // Scene duration includes narration + available pause; allow up to 5 minutes per scene.
  // Coerce in case JSON sends a float from the browser.
  durationMs: z
    .union([z.number(), z.string()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "durationMs must be a number" });
        return z.NEVER;
      }
      const rounded = Math.round(n);
      if (rounded < 1 || rounded > 300_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "durationMs must be between 1 and 300000",
        });
        return z.NEVER;
      }
      return rounded;
    }),
  voiceSpeed: z.number().min(0.9).max(1.15).optional(),
});

@Injectable()
export class WalkthroughStudioService {
  private readonly logger = new Logger(WalkthroughStudioService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly executive: IndustrialExecutiveWalkthroughService,
    private readonly demoSeed: IndustrialDemoSeedService,
  ) {}

  private assertAny(principal: ForgePrincipal, perms: readonly string[]) {
    if (principal.isPlatformAdmin) return;
    if (!perms.some((p) => hasPermission(principal, p))) {
      throw new ForgeError("FORBIDDEN", "Missing walkthrough studio permission");
    }
  }

  private definition(): WalkthroughDefinition {
    return INDUSTRIAL_PLATFORM_WALKTHROUGH;
  }

  private normalizeSceneOverrides(
    raw: unknown,
  ): Record<string, { narrationText?: string; durationMs?: number; voiceSpeed?: number }> {
    let parsed: unknown = raw ?? {};
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return {};
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, { narrationText?: string; durationMs?: number; voiceSpeed?: number }> =
      {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const durationRaw = row.durationMs;
      const durationMs =
        typeof durationRaw === "number"
          ? durationRaw
          : typeof durationRaw === "string" && Number.isFinite(Number(durationRaw))
            ? Number(durationRaw)
            : undefined;
      const voiceRaw = row.voiceSpeed;
      const voiceSpeed =
        typeof voiceRaw === "number"
          ? voiceRaw
          : typeof voiceRaw === "string" && Number.isFinite(Number(voiceRaw))
            ? Number(voiceRaw)
            : undefined;
      out[key] = {
        ...(typeof row.narrationText === "string" ? { narrationText: row.narrationText } : {}),
        ...(durationMs != null && Number.isFinite(durationMs) ? { durationMs } : {}),
        ...(voiceSpeed != null && Number.isFinite(voiceSpeed) ? { voiceSpeed } : {}),
      };
    }
    return out;
  }

  private async loadSceneOverrides(
    tenantId: string,
  ): Promise<Record<string, { narrationText?: string; durationMs?: number; voiceSpeed?: number }>> {
    const settings = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.industrialExecutiveWalkthroughSettings.findFirst({
        where: eq(industrialExecutiveWalkthroughSettings.tenantId, tenantId),
      }),
    );
    return this.normalizeSceneOverrides(settings?.sceneOverrides);
  }

  private applySceneOverrides(
    definition: WalkthroughDefinition,
    overrides: Record<string, { narrationText?: string; durationMs?: number; voiceSpeed?: number }>,
  ): WalkthroughDefinition {
    if (!Object.keys(overrides).length) return definition;
    return {
      ...definition,
      chapters: definition.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) => {
          const patch = overrides[scene.id];
          if (!patch) return scene;
          return {
            ...scene,
            ...(patch.narrationText != null ? { narrationText: patch.narrationText } : {}),
            ...(patch.durationMs != null ? { durationMs: patch.durationMs } : {}),
          };
        }),
      })),
    };
  }

  private async definitionForTenant(tenantId: string): Promise<WalkthroughDefinition> {
    const overrides = await this.loadSceneOverrides(tenantId);
    return this.applySceneOverrides(this.definition(), overrides);
  }

  private runtimeSummary(definition = this.definition()) {
    const scenes = flattenWalkthroughScenes(definition);
    const narrationMs = scenes.reduce(
      (sum, s) => sum + estimateNarrationDurationMs(s.narrationText),
      0,
    );
    const totalMs = estimateWalkthroughStudioRuntimeMs(scenes);
    const status = getWalkthroughRuntimeStatus(totalMs);
    return {
      narrationMs,
      totalMs,
      status,
      formatted: formatWalkthroughRuntime(totalMs),
      underLimit: totalMs <= WALKTHROUGH_RUNTIME_MAX_MS,
      chapterCount: definition.chapters.length,
      sceneCount: scenes.length,
    };
  }

  async ensureDefaultWalkthrough(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    const def = this.definition();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(walkthroughs)
        .where(
          and(
            eq(walkthroughs.tenantId, principal.tenantId),
            eq(walkthroughs.code, INDUSTRIAL_PLATFORM_WALKTHROUGH_ID),
          ),
        )
        .orderBy(desc(walkthroughs.createdAt))
        .limit(1);
      if (existing[0]) return existing[0];

      const id = createId();
      const runtime = this.runtimeSummary(def);
      try {
        await tx.insert(walkthroughs).values({
          id,
          tenantId: principal.tenantId,
          code: INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
          name: def.name,
          description: def.description,
          productCode: def.productCode,
          status: "published",
          defaultVoiceProfileId: def.defaultVoiceProfileId,
          publishedVersion: def.version,
          interactiveStatus: "ready",
          mp4Status: "none",
          metadata: {
            tagline: def.tagline,
            closingTagline: def.closingTagline,
            runtimeMs: runtime.totalMs,
            chapterCount: runtime.chapterCount,
          },
          createdByUserId: principal.userId ?? null,
          updatedByUserId: principal.userId ?? null,
        });
      } catch {
        // Concurrent ensure on another task — re-read the winner of the unique index.
        const raced = await tx
          .select()
          .from(walkthroughs)
          .where(
            and(
              eq(walkthroughs.tenantId, principal.tenantId),
              eq(walkthroughs.code, INDUSTRIAL_PLATFORM_WALKTHROUGH_ID),
            ),
          )
          .orderBy(desc(walkthroughs.createdAt))
          .limit(1);
        if (raced[0]) return raced[0];
        throw new ForgeError("INTERNAL_ERROR", "Failed to create default walkthrough");
      }
      const rows = await tx.select().from(walkthroughs).where(eq(walkthroughs.id, id)).limit(1);
      if (rows[0]) return rows[0];
      const fallback = await tx
        .select()
        .from(walkthroughs)
        .where(
          and(
            eq(walkthroughs.tenantId, principal.tenantId),
            eq(walkthroughs.code, INDUSTRIAL_PLATFORM_WALKTHROUGH_ID),
          ),
        )
        .orderBy(desc(walkthroughs.createdAt))
        .limit(1);
      if (fallback[0]) return fallback[0];
      throw new ForgeError("INTERNAL_ERROR", "Failed to load default walkthrough after create");
    });
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async findTenantWalkthrough(tenantId: string, walkthroughId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      // id is uuid — never bind a presentation code into the id predicate or Postgres
      // throws "invalid input syntax for type uuid" (surfaced as unexpected error).
      const match = this.isUuid(walkthroughId)
        ? or(eq(walkthroughs.id, walkthroughId), eq(walkthroughs.code, walkthroughId))
        : eq(walkthroughs.code, walkthroughId);
      const rows = await tx
        .select()
        .from(walkthroughs)
        .where(and(eq(walkthroughs.tenantId, tenantId), match))
        .orderBy(desc(walkthroughs.createdAt))
        .limit(1);
      return rows[0] ?? null;
    });
  }
  async listWalkthroughs(principal: ForgePrincipal) {
    this.assertAny(principal, VIEW);
    const row = await this.ensureDefaultWalkthrough(principal);
    const def = await this.definitionForTenant(principal.tenantId);
    const runtime = this.runtimeSummary(def);
    let settingsVoiceId: string | null = null;
    try {
      const settings = await this.executive.getSettings(principal);
      settingsVoiceId = String(settings.voiceId ?? "").trim() || null;
    } catch {
      settingsVoiceId = null;
    }
    let voice =
      (settingsVoiceId
        ? WALKTHROUGH_VOICE_PROFILES.find((v) => v.providerVoiceId === settingsVoiceId)
        : undefined) ??
      WALKTHROUGH_VOICE_PROFILES.find((v) => v.id === row.defaultVoiceProfileId) ??
      WALKTHROUGH_VOICE_PROFILES.find(
        (v) => v.id === INDUSTRIAL_PLATFORM_WALKTHROUGH.defaultVoiceProfileId,
      ) ??
      WALKTHROUGH_VOICE_PROFILES[0]!;

    if (row.defaultVoiceProfileId !== voice.id) {
      await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
        await tx
          .update(walkthroughs)
          .set({ defaultVoiceProfileId: voice.id, updatedAt: new Date() })
          .where(eq(walkthroughs.id, row.id));
      });
    }

    return {
      items: [
        {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          status: row.status,
          version: row.publishedVersion ?? "1.0",
          runtimeMs: runtime.totalMs,
          runtimeFormatted: runtime.formatted,
          runtimeStatus: runtime.status,
          chapterCount: runtime.chapterCount,
          voice: {
            id: voice.id,
            displayName: voice.displayName,
            provider: voice.provider,
          },
          lastModifiedAt: row.updatedAt,
          lastGeneratedAt: row.lastGeneratedAt,
          interactiveStatus: row.interactiveStatus,
          mp4Status: row.mp4Status,
        },
      ],
      runtime,
    };
  }

  async getWalkthrough(principal: ForgePrincipal, walkthroughId?: string) {
    this.assertAny(principal, VIEW);
    // Studio is single-presentation per tenant. Prefer an exact id/code hit, but
    // never 404 on a stale client id — always fall back to the tenant default.
    let row = walkthroughId
      ? await this.findTenantWalkthrough(principal.tenantId, walkthroughId)
      : null;
    if (!row) {
      row = await this.ensureDefaultWalkthrough(principal);
    }
    const def = await this.definitionForTenant(principal.tenantId);
    const runtime = this.runtimeSummary(def);
    const scenes = flattenWalkthroughScenes(def).map((scene) => {
      const narrationMs = estimateNarrationDurationMs(scene.narrationText);
      const availablePauseMs = scene.durationMs - narrationMs;
      return {
        ...scene,
        narrationEstimateMs: narrationMs,
        availablePauseMs,
        tightness:
          availablePauseMs < 0 ? "red" : availablePauseMs < 2_000 ? "yellow" : "green",
      };
    });

    return {
      walkthrough: {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        status: row.status,
        version: row.publishedVersion ?? def.version,
        defaultVoiceProfileId: row.defaultVoiceProfileId ?? def.defaultVoiceProfileId,
        tagline: def.tagline,
        closingTagline: def.closingTagline,
      },
      chapters: def.chapters,
      scenes,
      voices: WALKTHROUGH_VOICE_PROFILES,
      runtime,
    };
  }

  async updateSceneNarration(principal: ForgePrincipal, body: unknown) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, [
      "industrial.walkthrough.narration.edit",
      ...MANAGE,
    ]);
    const patch = scenePatchSchema.parse(body ?? {});

    const settingsId = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      let settings = await tx.query.industrialExecutiveWalkthroughSettings.findFirst({
        where: eq(industrialExecutiveWalkthroughSettings.tenantId, principal.tenantId),
      });
      // Walkthrough Studio can load before Presentation settings are ever opened.
      if (!settings) {
        const preferredVoice = process.env.POLLY_VOICE_ID?.trim() || "Stephen";
        const id = createId();
        const now = new Date();
        const inserted = await tx
          .insert(industrialExecutiveWalkthroughSettings)
          .values({
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
          })
          .returning();
        settings = inserted[0];
        if (!settings) {
          throw new ForgeError(
            "INTERNAL_ERROR",
            "Unable to create presentation settings for scene timing.",
            { exposeMessage: true },
          );
        }
      }
      const overrides = this.normalizeSceneOverrides(settings.sceneOverrides) as Record<
        string,
        Record<string, unknown>
      >;
      const prior =
        overrides[patch.sceneKey] && typeof overrides[patch.sceneKey] === "object"
          ? { ...overrides[patch.sceneKey] }
          : {};
      overrides[patch.sceneKey] = {
        ...prior,
        ...(patch.narrationText != null ? { narrationText: patch.narrationText } : {}),
        ...(patch.durationMs != null ? { durationMs: patch.durationMs } : {}),
        ...(patch.voiceSpeed != null ? { voiceSpeed: Math.round(patch.voiceSpeed * 100) } : {}),
      };
      // Plain JSON clone avoids drizzle/jsonb proxy quirks that can drop nested writes.
      const sceneOverrides = JSON.parse(JSON.stringify(overrides)) as Record<string, unknown>;
      const updated = await tx
        .update(industrialExecutiveWalkthroughSettings)
        .set({ sceneOverrides, updatedAt: new Date() })
        .where(eq(industrialExecutiveWalkthroughSettings.id, settings.id))
        .returning({
          id: industrialExecutiveWalkthroughSettings.id,
          sceneOverrides: industrialExecutiveWalkthroughSettings.sceneOverrides,
        });
      const row = updated[0];
      if (!row) {
        throw new ForgeError(
          "INTERNAL_ERROR",
          "Unable to save scene narration overrides.",
          { exposeMessage: true },
        );
      }
      const verified = this.normalizeSceneOverrides(row.sceneOverrides);
      const savedScene = verified[patch.sceneKey];
      if (
        patch.narrationText != null &&
        savedScene?.narrationText !== patch.narrationText
      ) {
        this.logger.error(
          `Scene narration write mismatch tenant=${principal.tenantId} scene=${patch.sceneKey}`,
        );
        throw new ForgeError(
          "INTERNAL_ERROR",
          "Narration script did not persist. Please try saving again.",
          { exposeMessage: true },
        );
      }
      if (patch.durationMs != null && savedScene?.durationMs !== patch.durationMs) {
        this.logger.error(
          `Scene duration write mismatch tenant=${principal.tenantId} scene=${patch.sceneKey}`,
        );
        throw new ForgeError(
          "INTERNAL_ERROR",
          "Scene timing did not persist. Please try saving again.",
          { exposeMessage: true },
        );
      }
      this.logger.log(
        `Saved scene override tenant=${principal.tenantId} scene=${patch.sceneKey} keys=${Object.keys(verified).join(",")}`,
      );
      return settings.id;
    }, principal.userId);

    // Audit after commit so a bad audit row cannot roll back the pause save.
    try {
      await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
        await this.audit.writeInTransaction(tx, {
          ...auditBase(principal),
          correlationId: principal.correlationId || "walkthrough-studio",
          requestId: principal.requestId || "walkthrough-studio",
          action: "walkthrough.scene.narration.update",
          resourceType: "executive_walkthrough_settings",
          resourceId: settingsId,
          after: { ...patch, settingsId },
        });
      }, principal.userId);
    } catch (err) {
      this.logger.warn(
        `Walkthrough scene timing saved but audit write failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return this.getWalkthrough(principal);
  }

  async validateWalkthrough(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    const def = await this.definitionForTenant(principal.tenantId);
    const scenes = flattenWalkthroughScenes(def);
    const runtime = this.runtimeSummary(def);
    const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];

    for (const scene of scenes) {
      if (!scene.route) {
        issues.push({
          severity: "error",
          code: "missing_route",
          message: `Scene ${scene.id} is missing a Forge route.`,
        });
      }
      if (!scene.narrationText?.trim()) {
        issues.push({
          severity: "error",
          code: "missing_narration",
          message: `Scene ${scene.id} is missing narration text.`,
        });
      }
      const narrationMs = estimateNarrationDurationMs(scene.narrationText);
      if (narrationMs > scene.durationMs) {
        issues.push({
          severity: "warning",
          code: "narration_overflow",
          message: `Scene ${scene.id} narration (~${formatWalkthroughRuntime(narrationMs)}) exceeds scene duration (${formatWalkthroughRuntime(scene.durationMs)}).`,
        });
      }
    }

    if (!runtime.underLimit) {
      issues.push({
        severity: "error",
        code: "runtime_exceeded",
        message: `Total runtime ${runtime.formatted} exceeds the 9:45 standard limit.`,
      });
    }

    const tenant = await this.db
      .select({
        id: tenants.id,
        isDemoTenant: tenants.isDemoTenant,
        slug: tenants.slug,
      })
      .from(tenants)
      .where(eq(tenants.id, principal.tenantId))
      .limit(1);

    return {
      ok: !issues.some((i) => i.severity === "error"),
      canPublish: !issues.some((i) => i.severity === "error"),
      runtime,
      issues,
      demoTenant: tenant[0]
        ? {
            id: tenant[0].id,
            slug: tenant[0].slug,
            isDemoTenant: Boolean(tenant[0].isDemoTenant),
          }
        : null,
      checkedAt: new Date().toISOString(),
    };
  }

  async listVoices(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    return {
      items: WALKTHROUGH_VOICE_PROFILES,
      defaultVoiceProfileId: INDUSTRIAL_PLATFORM_WALKTHROUGH.defaultVoiceProfileId,
      styleInstructions:
        "Natural professional American English. Warm, confident, knowledgeable, and conversational.",
    };
  }

  async previewVoice(principal: ForgePrincipal, body: unknown) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    const schema = z.object({
      voiceProfileId: z.string().min(1),
      sampleText: z.string().min(10).max(600).optional(),
    });
    const input = schema.parse(body ?? {});
    const voice =
      WALKTHROUGH_VOICE_PROFILES.find((v) => v.id === input.voiceProfileId) ??
      WALKTHROUGH_VOICE_PROFILES[0]!;
    const sampleText =
      input.sampleText?.trim() ||
      "Welcome to Forge Industrial Safety. This short preview demonstrates a natural professional narration voice for corporate safety leadership.";

    await this.executive.updateSettings(principal, { voiceId: voice.providerVoiceId });
    const ensured = await this.executive.ensureNarration(principal, {
      voiceId: voice.providerVoiceId,
    });
    const asset =
      ensured.assets?.find((a) => a.sceneId === "introduction") ??
      ensured.assets?.[0] ??
      null;

    return {
      voice,
      sampleText,
      durationMs: asset?.durationMs ?? estimateNarrationDurationMs(sampleText),
      downloadUrl: asset?.downloadUrl ?? null,
      note: "Preview uses the Introduction chapter audio for the selected voice.",
    };
  }

  async getDemoEnvironment(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, [
      "industrial.walkthrough.demo.manage",
      ...VIEW,
    ]);
    const tenantRows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, principal.tenantId))
      .limit(1);
    const tenant = tenantRows[0];
    const seeds = await withTenantTransaction(this.db, principal.tenantId, async (tx) =>
      tx
        .select()
        .from(demoSeedVersions)
        .where(eq(demoSeedVersions.tenantId, principal.tenantId))
        .orderBy(desc(demoSeedVersions.createdAt))
        .limit(5),
    );
    const seedStatus = await this.demoSeed.getLatestSeedStatus(principal.tenantId);

    return {
      tenant: tenant
        ? {
            id: tenant.id,
            slug: tenant.slug,
            displayName: tenant.displayName,
            isDemoTenant: Boolean(tenant.isDemoTenant),
            suggestedSlug: INDUSTRIAL_DEMO_TENANT_SLUG,
            suggestedCompany: INDUSTRIAL_DEMO_COMPANY_NAME,
          }
        : null,
      seedTargets: DEMO_SEED_TARGETS,
      seedVersions: seeds,
      seedStatus,
      safety: {
        externalSmsBlocked: Boolean(tenant?.isDemoTenant),
        externalEmailBlocked: Boolean(tenant?.isDemoTenant),
        emergencyAlertsInternalOnly: Boolean(tenant?.isDemoTenant),
        printersBlocked: Boolean(tenant?.isDemoTenant),
        dotExternalBlocked: Boolean(tenant?.isDemoTenant),
      },
    };
  }

  async getDemoSeedStatus(principal: ForgePrincipal) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, VIEW);
    return this.demoSeed.getLatestSeedStatus(principal.tenantId);
  }

  async enableDemoMode(principal: ForgePrincipal, enabled = true) {
    this.assertAny(principal, ["industrial.walkthrough.demo.manage", ...MANAGE]);
    // Enabling is restricted to Forge Platform demo tenants; disabling is always allowed
    // so a mistaken flag on a customer tenant can be cleared from Studio.
    if (enabled) {
      await assertTenantAllowedForDemoSeed(this.db, principal.tenantId);
    }
    await this.db
      .update(tenants)
      .set({ isDemoTenant: enabled, updatedAt: new Date() })
      .where(eq(tenants.id, principal.tenantId));
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await this.audit.writeInTransaction(tx, {
        ...auditBase(principal),
        action: enabled ? "walkthrough.demo.enable" : "walkthrough.demo.disable",
        resourceType: "tenant",
        resourceId: principal.tenantId,
        riskLevel: "MEDIUM",
      });
    }, principal.userId);
    return this.getDemoEnvironment(principal);
  }

  async resetDemo(principal: ForgePrincipal) {
    this.assertAny(principal, DEMO_RESET);
    await assertTenantAllowedForDemoSeed(this.db, principal.tenantId);
    const tenantRows = await this.db
      .select({ isDemoTenant: tenants.isDemoTenant })
      .from(tenants)
      .where(eq(tenants.id, principal.tenantId))
      .limit(1);
    if (!tenantRows[0]?.isDemoTenant) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Reset Demo is only available for tenants marked as demo environments.",
      );
    }

    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const id = createId();
      await tx.insert(demoSeedVersions).values({
        id,
        tenantId: principal.tenantId,
        seedKey: "default",
        version: `reset-${new Date().toISOString().slice(0, 19)}`,
        snapshotJson: {
          targets: DEMO_SEED_TARGETS,
          locations: DEMO_LOCATIONS,
          divisions: DEMO_DIVISIONS,
          companyName: INDUSTRIAL_DEMO_COMPANY_NAME,
          tenantSlug: INDUSTRIAL_DEMO_TENANT_SLUG,
          note: "Deterministic demo reset checkpoint. Module data restore hooks run via demo.seed.apply.",
        },
        isActive: true,
        seededAt: new Date(),
      });
      await tx
        .update(demoSeedVersions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(demoSeedVersions.tenantId, principal.tenantId),
            sql`${demoSeedVersions.id} <> ${id}::uuid`,
          ),
        );
      await this.audit.writeInTransaction(tx, {
        ...auditBase(principal),
        action: "walkthrough.demo.reset",
        resourceType: "tenant",
        resourceId: principal.tenantId,
        riskLevel: "HIGH",
      });
    }, principal.userId);

    this.logger.log(`Demo reset requested for tenant ${principal.tenantId}`);

    // Apply deterministic synthetic demo rows (sites, departments, personnel).
    const seedResult = await this.demoSeed.enqueueAndApply(principal);

    return {
      ok: true,
      message:
        "Demo environment reset and seed applied. Synthetic FORGE_DEMO rows are ready for presentations.",
      resetAt: new Date().toISOString(),
      seedTargets: DEMO_SEED_TARGETS,
      applied: {
        locations: DEMO_LOCATIONS.length,
        divisions: DEMO_DIVISIONS.length,
        ...seedResult.counts,
        jobId: seedResult.jobId,
        seedVersionId: seedResult.seedVersionId,
        pendingWorkerJob: null,
      },
    };
  }

  async createShareLink(principal: ForgePrincipal, walkthroughId: string, body: unknown) {
    this.assertAny(principal, SHARE);
    const input = shareSchema.parse(body ?? {});
    let wt = await this.findTenantWalkthrough(principal.tenantId, walkthroughId);
    if (!wt) {
      wt = await this.ensureDefaultWalkthrough(principal);
      if (walkthroughId !== wt.id && walkthroughId !== wt.code) {
        throw new ForgeError("NOT_FOUND", "Walkthrough not found");
      }
    }

    const publicToken = randomBytes(6).toString("hex").toUpperCase().slice(0, 8);
    const rawSecret = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(rawSecret).digest("hex");
    const pinHash = input.pin
      ? createHash("sha256").update(input.pin).digest("hex")
      : null;

    const id = createId();
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await tx.insert(walkthroughShareLinks).values({
        id,
        tenantId: principal.tenantId,
        walkthroughId: wt.id,
        publicToken,
        tokenHash,
        pinHash,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        allowInteractive: input.allowInteractive ?? true,
        allowVideoDownload: input.allowVideoDownload ?? false,
        allowChapterNavigation: input.allowChapterNavigation ?? true,
        createdByUserId: principal.userId ?? null,
      });
    });

    const path = `/w/${publicToken}`;
    return {
      id,
      publicToken,
      path,
      shareUrl: path,
      secret: rawSecret,
      expiresAt: input.expiresAt ?? null,
      requirePin: Boolean(pinHash),
      allowInteractive: input.allowInteractive ?? true,
      allowVideoDownload: input.allowVideoDownload ?? false,
      allowChapterNavigation: input.allowChapterNavigation ?? true,
    };
  }

  async listShareLinks(principal: ForgePrincipal) {
    this.assertAny(principal, SHARE);
    const wt = await this.ensureDefaultWalkthrough(principal);
    const rows = await withTenantTransaction(this.db, principal.tenantId, async (tx) =>
      tx
        .select()
        .from(walkthroughShareLinks)
        .where(
          and(
            eq(walkthroughShareLinks.tenantId, principal.tenantId),
            eq(walkthroughShareLinks.walkthroughId, wt.id),
          ),
        )
        .orderBy(desc(walkthroughShareLinks.createdAt))
        .limit(50),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        publicToken: r.publicToken,
        path: `/w/${r.publicToken}`,
        expiresAt: r.expiresAt,
        requirePin: Boolean(r.pinHash),
        allowInteractive: r.allowInteractive,
        allowVideoDownload: r.allowVideoDownload,
        allowChapterNavigation: r.allowChapterNavigation,
        isRevoked: r.isRevoked,
        createdAt: r.createdAt,
      })),
    };
  }

  async revokeShareLink(principal: ForgePrincipal, shareLinkId: string) {
    this.assertAny(principal, SHARE);
    const wt = await this.ensureDefaultWalkthrough(principal);
    const updated = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(walkthroughShareLinks)
        .where(
          and(
            eq(walkthroughShareLinks.id, shareLinkId),
            eq(walkthroughShareLinks.tenantId, principal.tenantId),
            eq(walkthroughShareLinks.walkthroughId, wt.id),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Share link not found");
      if (row.isRevoked) return row;
      await tx
        .update(walkthroughShareLinks)
        .set({ isRevoked: true, updatedAt: new Date() })
        .where(eq(walkthroughShareLinks.id, row.id));
      await this.audit.writeInTransaction(tx, {
        ...auditBase(principal),
        action: "walkthrough.share.revoke",
        resourceType: "walkthrough_share_link",
        resourceId: row.id,
        riskLevel: "MEDIUM",
      });
      return { ...row, isRevoked: true };
    }, principal.userId);

    return {
      id: updated.id,
      publicToken: updated.publicToken,
      path: `/w/${updated.publicToken}`,
      isRevoked: true,
    };
  }

  private async loadShareByPublicToken(publicToken: string) {
    const token = publicToken.trim().toUpperCase();
    if (!token) throw new ForgeError("NOT_FOUND", "Share link not found");
    return withBypassRlsTransaction(this.db, async (tx) => {
      const [row] = await tx
        .select()
        .from(walkthroughShareLinks)
        .where(eq(walkthroughShareLinks.publicToken, token))
        .limit(1);
      return row ?? null;
    });
  }

  async resolvePublicShare(publicToken: string) {
    const row = await this.loadShareByPublicToken(publicToken);
    if (!row || row.isRevoked) throw new ForgeError("NOT_FOUND", "Share link not found");
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new ForgeError("FORBIDDEN", "This share link has expired");
    }

    const def = this.definition();
    const runtime = this.runtimeSummary(def);
    return {
      publicToken: row.publicToken,
      requirePin: Boolean(row.pinHash),
      unlocked: !row.pinHash,
      allowInteractive: row.allowInteractive,
      allowVideoDownload: row.allowVideoDownload,
      allowChapterNavigation: row.allowChapterNavigation,
      walkthrough: {
        code: INDUSTRIAL_PLATFORM_WALKTHROUGH_ID,
        name: def.name,
        description: def.description,
        version: def.version,
        tagline: def.tagline,
        closingTagline: def.closingTagline,
        chapters: def.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          order: c.order,
          targetDurationMs: c.targetDurationMs,
        })),
      },
      runtime,
      viewerPath: `/w/${row.publicToken}`,
      demoBadge: true,
    };
  }

  async unlockPublicShare(publicToken: string, pin?: string) {
    const row = await this.loadShareByPublicToken(publicToken);
    if (!row || row.isRevoked) throw new ForgeError("NOT_FOUND", "Share link not found");
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new ForgeError("FORBIDDEN", "This share link has expired");
    }
    if (row.pinHash) {
      const candidate = createHash("sha256")
        .update(String(pin ?? ""))
        .digest("hex");
      if (candidate !== row.pinHash) {
        throw new ForgeError("FORBIDDEN", "Incorrect PIN");
      }
    }
    const resolved = await this.resolvePublicShare(publicToken);
    return { ...resolved, unlocked: true };
  }

  async createExport(principal: ForgePrincipal, body: unknown) {
    await assertWalkthroughTenantAllowed(this.db, principal.tenantId);
    this.assertAny(principal, GENERATE);
    const input = exportSchema.parse(body ?? {});
    const def = await this.definitionForTenant(principal.tenantId);
    const runtime = this.runtimeSummary(def);
    if (!runtime.underLimit && !input.overrideRuntime) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Standard walkthrough runtime ${runtime.formatted} exceeds 9:45. Enable Override Standard Runtime to continue.`,
      );
    }

    const voice =
      WALKTHROUGH_VOICE_PROFILES.find((v) => v.id === input.voiceProfileId) ??
      WALKTHROUGH_VOICE_PROFILES.find(
        (v) => v.id === INDUSTRIAL_PLATFORM_WALKTHROUGH.defaultVoiceProfileId,
      ) ??
      WALKTHROUGH_VOICE_PROFILES[0]!;

    await this.executive.updateSettings(principal, {
      voiceId: voice.providerVoiceId,
      exportResolution: input.resolution ?? "1080p",
      includeIntro: input.includeIntro ?? true,
      includeOutro: input.includeOutro ?? true,
      ...(input.narrationSpeed != null
        ? { narrationSpeed: Math.round(input.narrationSpeed * 100) }
        : {}),
    });

    const result = await this.executive.createExport(principal, {
      resolution: input.resolution ?? "1080p",
      includeNarration: true,
      burnCaptions: input.captions === "burned_in",
      includeIntro: input.includeIntro ?? true,
      includeOutro: input.includeOutro ?? true,
      videoTitle: INDUSTRIAL_PLATFORM_WALKTHROUGH.name,
    });

    const wt = await this.ensureDefaultWalkthrough(principal);
    const exportId = createId();
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await tx.insert(walkthroughVideoExports).values({
        id: exportId,
        tenantId: principal.tenantId,
        walkthroughId: wt.id,
        exportJobId: (result as { id?: string }).id ?? null,
        voiceProfileId: voice.id,
        resolution: input.resolution ?? "1080p",
        captionMode: input.captions ?? "off",
        status: "queued",
        overrideRuntime: Boolean(input.overrideRuntime),
        renderConfig: {
          narrationSpeed: input.narrationSpeed ?? 1,
          filename: buildWalkthroughMp4Filename(),
        },
        requestedByUserId: principal.userId ?? null,
      });
      await tx
        .update(walkthroughs)
        .set({
          mp4Status: "generating",
          lastGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(walkthroughs.id, wt.id));
    });

    return {
      ...result,
      studioExportId: exportId,
      filename: buildWalkthroughMp4Filename(),
      runtime,
      voice,
    };
  }

  async listExports(principal: ForgePrincipal) {
    this.assertAny(principal, VIEW);
    const executiveExports = await this.executive.listExports(principal);
    const wt = await this.ensureDefaultWalkthrough(principal);
    const studioRows = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(walkthroughVideoExports)
        .where(eq(walkthroughVideoExports.walkthroughId, wt.id))
        .orderBy(desc(walkthroughVideoExports.createdAt))
        .limit(50);

      const jobIds = rows
        .map((r) => r.exportJobId)
        .filter((id): id is string => Boolean(id));
      const jobs =
        jobIds.length === 0
          ? []
          : await tx
              .select()
              .from(platformJobs)
              .where(
                and(
                  eq(platformJobs.tenantId, principal.tenantId),
                  inArray(platformJobs.id, jobIds),
                ),
              );
      const jobById = new Map(jobs.map((j) => [j.id, j]));

      for (const row of rows) {
        if (!row.exportJobId) continue;
        const job = jobById.get(row.exportJobId);
        if (!job) continue;
        const nextStatus =
          job.status === "SUCCEEDED"
            ? "completed"
            : job.status === "FAILED"
              ? "failed"
              : job.status === "QUEUED" || job.status === "PENDING"
                ? "queued"
                : "generating";
        const result = (job.resultJson ?? {}) as Record<string, unknown>;
        const durationMs =
          typeof result.durationSeconds === "number"
            ? Math.round(result.durationSeconds * 1000)
            : row.durationMs;
        const needsUpdate =
          row.status !== nextStatus ||
          (nextStatus === "completed" && !row.completedAt) ||
          (job.artifactObjectKey && row.storageKey !== job.artifactObjectKey);
        if (!needsUpdate) continue;
        await tx
          .update(walkthroughVideoExports)
          .set({
            status: nextStatus,
            storageKey: job.artifactObjectKey ?? row.storageKey,
            fileSizeBytes:
              typeof result.fileSizeBytes === "number"
                ? result.fileSizeBytes
                : row.fileSizeBytes,
            durationMs,
            errorMessage: job.failure ?? row.errorMessage,
            completedAt:
              nextStatus === "completed" || nextStatus === "failed"
                ? (job.completedAt ?? new Date())
                : null,
            updatedAt: new Date(),
          })
          .where(eq(walkthroughVideoExports.id, row.id));
        row.status = nextStatus;
        row.storageKey = job.artifactObjectKey ?? row.storageKey;
        row.durationMs = durationMs;
        row.completedAt =
          nextStatus === "completed" || nextStatus === "failed"
            ? (job.completedAt ?? row.completedAt)
            : row.completedAt;
      }

      const mp4Status = rows.some((r) => r.status === "generating" || r.status === "queued")
        ? "generating"
        : rows.some((r) => r.status === "completed")
          ? "ready"
          : "idle";
      await tx
        .update(walkthroughs)
        .set({ mp4Status, updatedAt: new Date() })
        .where(eq(walkthroughs.id, wt.id));

      return rows;
    });

    const items = Array.isArray((executiveExports as { items?: unknown[] }).items)
      ? (executiveExports as { items: unknown[] }).items
      : Array.isArray(executiveExports)
        ? executiveExports
        : [];

    return {
      items,
      studioExports: studioRows.map((row) => ({
        id: row.id,
        exportJobId: row.exportJobId,
        voiceProfileId: row.voiceProfileId,
        resolution: row.resolution,
        durationMs: row.durationMs,
        status: row.status,
        fileSizeBytes: row.fileSizeBytes,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        downloadReady: row.status === "completed" && Boolean(row.exportJobId || row.storageKey),
      })),
      filenamePattern: buildWalkthroughMp4Filename(),
    };
  }

  async downloadExport(principal: ForgePrincipal, exportId: string) {
    this.assertAny(principal, GENERATE);
    const row = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [studio] = await tx
        .select()
        .from(walkthroughVideoExports)
        .where(
          and(
            eq(walkthroughVideoExports.id, exportId),
            eq(walkthroughVideoExports.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      return studio ?? null;
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Export not found");
    const jobId = row.exportJobId;
    if (!jobId) throw new ForgeError("VALIDATION_FAILED", "Export is not ready for download");
    return this.executive.downloadExport(principal, jobId);
  }

  async trackEvent(principal: ForgePrincipal, body: unknown) {
    this.assertAny(principal, VIEW);
    const input = eventSchema.parse(body ?? {});
    const wt = await this.ensureDefaultWalkthrough(principal);
    const id = createId();
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await tx.insert(walkthroughEvents).values({
        id,
        tenantId: principal.tenantId,
        walkthroughId: wt.id,
        sessionId: input.sessionId ?? null,
        eventType: input.eventType,
        chapterKey: input.chapterKey ?? null,
        sceneKey: input.sceneKey ?? null,
        payloadJson: input.payload ?? {},
      });
    });
    return { ok: true, id };
  }

  async getAnalytics(principal: ForgePrincipal) {
    this.assertAny(principal, ANALYTICS);
    const wt = await this.ensureDefaultWalkthrough(principal);
    const events = await withTenantTransaction(this.db, principal.tenantId, async (tx) =>
      tx
        .select({
          eventType: walkthroughEvents.eventType,
          chapterKey: walkthroughEvents.chapterKey,
          count: sql<number>`count(*)::int`,
        })
        .from(walkthroughEvents)
        .where(eq(walkthroughEvents.walkthroughId, wt.id))
        .groupBy(walkthroughEvents.eventType, walkthroughEvents.chapterKey),
    );

    const byType = new Map<string, number>();
    const chapterExits = new Map<string, number>();
    const chapterInterest = new Map<string, number>();
    for (const row of events) {
      byType.set(row.eventType, (byType.get(row.eventType) ?? 0) + Number(row.count));
      if (!row.chapterKey) continue;
      const count = Number(row.count);
      if (row.eventType === "chapter_exit") {
        chapterExits.set(row.chapterKey, (chapterExits.get(row.chapterKey) ?? 0) + count);
        chapterInterest.set(row.chapterKey, (chapterInterest.get(row.chapterKey) ?? 0) + count);
      } else if (row.eventType === "chapter_select") {
        chapterInterest.set(row.chapterKey, (chapterInterest.get(row.chapterKey) ?? 0) + count);
      }
    }

    return {
      starts: byType.get("walkthrough_start") ?? 0,
      completions: byType.get("walkthrough_complete") ?? 0,
      replays: byType.get("walkthrough_replay") ?? 0,
      exploreSelections: byType.get("explore_forge") ?? 0,
      mp4Downloads: byType.get("mp4_download") ?? 0,
      chapterExits: Object.fromEntries(chapterExits),
      mostViewedModules: [...chapterInterest.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([chapterKey, count]) => ({ chapterKey, count })),
    };
  }
}
