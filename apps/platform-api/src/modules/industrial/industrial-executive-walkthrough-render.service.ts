import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME,
  EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS,
  EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
  EXECUTIVE_WALKTHROUGH_STEPS,
} from "@forge/contracts";
import {
  createId,
  industrialExecutiveWalkthroughRenderTokens,
  platformJobs,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, sql } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { generatePublicToken, hashPublicToken, isValidPublicToken } from "./qr-token.js";
import { IndustrialExecutiveWalkthroughNarrationService } from "./industrial-executive-walkthrough-narration.service.js";
import { PRESIGN_EXPIRES_SECONDS } from "../neris-incidents/document-storage.service.js";

export type WalkthroughJobStatus =
  "queued" | "preparing" | "rendering" | "encoding" | "uploading" | "completed" | "failed";

/** Alias matching frontend WalkthroughExportStatus naming. */
export type WalkthroughPipelineStatus = WalkthroughJobStatus;

type ExportOptions = {
  resolution: "1080p" | "720p";
  includeNarration: boolean;
  burnCaptions: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  videoTitle: string;
  contentVersion: string;
  voiceId: string;
  narrationSpeed: number;
  closingText?: string | null;
};

function runCommand(bin: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}

@Injectable()
export class IndustrialExecutiveWalkthroughRenderService {
  private readonly logger = new Logger(IndustrialExecutiveWalkthroughRenderService.name);
  private readonly s3: S3Client;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly narration: IndustrialExecutiveWalkthroughNarrationService,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
  }

  private industrialWebBaseUrl(): string {
    return process.env.INDUSTRIAL_WEB_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3004";
  }

  private ffmpegBin(): string {
    return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  }

  async createRenderToken(input: {
    tenantId: string;
    exportJobId: string;
    userId?: string | null;
  }): Promise<string> {
    const token = generatePublicToken();
    const tokenHash = hashPublicToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await withTenantTransaction(
      this.db,
      input.tenantId,
      async (tx) => {
        await tx.insert(industrialExecutiveWalkthroughRenderTokens).values({
          id: createId(),
          tenantId: input.tenantId,
          exportJobId: input.exportJobId,
          tokenHash,
          expiresAt,
          createdByUserId: input.userId ?? null,
          createdAt: new Date(),
        });
      },
      input.userId ?? undefined,
    );
    return token;
  }

  async resolvePublicRenderToken(token: string): Promise<{
    tenantId: string;
    exportId: string;
    contentVersion: string;
    presentationId: string;
  }> {
    return this.resolveRenderToken(token);
  }

  async resolveRenderToken(token: string): Promise<{
    tenantId: string;
    exportId: string;
    contentVersion: string;
    presentationId: string;
  }> {
    if (!isValidPublicToken(token)) {
      throw new ForgeError("FORBIDDEN", "Invalid render token");
    }
    const tokenHash = hashPublicToken(token);

    // Bypass RLS via SECURITY DEFINER helper, then load job under tenant scope.
    const tenantLookup = await this.db.execute(
      sql`SELECT forge_industrial_exec_walkthrough_tenant_for_render_token(${tokenHash}) AS tenant_id`,
    );
    const lookupRows = ((tenantLookup as unknown as { rows?: Array<{ tenant_id: string | null }> })
      .rows ??
      (Array.isArray(tenantLookup)
        ? (tenantLookup as unknown as Array<{ tenant_id: string | null }>)
        : [])) as Array<{ tenant_id: string | null }>;
    const tenantId = lookupRows[0]?.tenant_id ?? null;
    if (!tenantId) {
      throw new ForgeError("FORBIDDEN", "Render token is invalid or expired");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const tokenRow = await tx.query.industrialExecutiveWalkthroughRenderTokens.findFirst({
        where: and(
          eq(industrialExecutiveWalkthroughRenderTokens.tenantId, tenantId),
          eq(industrialExecutiveWalkthroughRenderTokens.tokenHash, tokenHash),
        ),
      });
      if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now() || tokenRow.usedAt) {
        throw new ForgeError("FORBIDDEN", "Render token is invalid or expired");
      }
      const job = await tx.query.platformJobs.findFirst({
        where: and(eq(platformJobs.id, tokenRow.exportJobId), eq(platformJobs.tenantId, tenantId)),
      });
      const resultJson = (job?.resultJson ?? {}) as Record<string, unknown>;
      return {
        tenantId,
        exportId: tokenRow.exportJobId,
        contentVersion: String(resultJson.contentVersion ?? "unknown"),
        presentationId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
      };
    });
  }

  async processExport(
    jobId: string,
    principal: ForgePrincipal,
    options: ExportOptions,
  ): Promise<void> {
    const engine = String(process.env.WALKTHROUGH_RENDER_ENGINE ?? "playwright").toLowerCase();
    if (engine === "remotion") {
      this.logger.warn(
        `Remotion render engine selected for job=${jobId} but worker is not deployed yet; falling back to Playwright`,
      );
    }
    const tenantId = principal.tenantId;
    const workDir = await mkdtemp(join(tmpdir(), "forge-ew-"));
    try {
      await this.patchJob(tenantId, jobId, {
        status: "PREPARING",
        progress: 5,
        walkthroughStatus: "preparing",
        userId: principal.userId,
      });

      const narrationSteps = EXECUTIVE_WALKTHROUGH_STEPS.map((step) => {
        if (step.id === "closing" && options.closingText?.trim()) {
          return { ...step, narrationText: options.closingText.trim() };
        }
        return step;
      }).filter((step) => {
        if (!options.includeIntro && step.id === "opening") return false;
        if (!options.includeOutro && step.id === "closing") return false;
        return true;
      });

      const assets = options.includeNarration
        ? await this.narration.ensureNarrationAssets(
            principal,
            options.contentVersion,
            options.voiceId,
            narrationSteps,
            { speed: options.narrationSpeed },
          )
        : [];

      await this.patchJob(tenantId, jobId, {
        status: "RENDERING",
        progress: 25,
        walkthroughStatus: "rendering",
        userId: principal.userId,
      });

      const token = await this.createRenderToken({
        tenantId,
        exportJobId: jobId,
        userId: principal.userId,
      });

      const width = options.resolution === "720p" ? 1280 : 1920;
      const height = options.resolution === "720p" ? 720 : 1080;
      let videoPath = join(workDir, "capture.webm");
      let usedFallback = false;

      try {
        videoPath = await this.captureWithPlaywright({
          workDir,
          token,
          width,
          height,
        });
      } catch (error) {
        usedFallback = true;
        this.logger.warn(
          `Playwright capture unavailable; using narration slideshow fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        videoPath = await this.buildFallbackSlideshow({
          workDir,
          width,
          height,
          title: options.videoTitle,
          assets,
        });
      }

      await this.patchJob(tenantId, jobId, {
        status: "ENCODING",
        progress: 65,
        walkthroughStatus: "encoding",
        userId: principal.userId,
      });

      const audioPaths: string[] = [];
      if (options.includeNarration && assets.length) {
        for (const asset of assets) {
          const buf = await this.narration.downloadObjectBuffer(asset.storageKey);
          const path = join(workDir, `${asset.sceneId}.mp3`);
          await writeFile(path, buf);
          audioPaths.push(path);
        }
      }

      const mp4Path = join(workDir, EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME);
      await this.encodeMp4({
        workDir,
        videoPath,
        audioPaths,
        outputPath: mp4Path,
        burnCaptions: options.burnCaptions,
        captionCues: options.burnCaptions
          ? narrationSteps.map((step) => ({
              text: String(step.narrationText ?? step.title ?? step.id).trim(),
              durationMs: assets.find((a) => a.sceneId === step.id)?.durationMs ?? step.durationMs,
            }))
          : [],
      });

      await this.patchJob(tenantId, jobId, {
        status: "UPLOADING",
        progress: 85,
        walkthroughStatus: "uploading",
        userId: principal.userId,
      });

      const objectKey = `tenants/${tenantId}/presentations/executive-walkthrough/exports/${jobId}.mp4`;
      const body = await readFile(mp4Path);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.S3_EXPORT_BUCKET,
          Key: objectKey,
          Body: body,
          ContentType: "video/mp4",
          ServerSideEncryption: "aws:kms",
        }),
      );

      const durationSeconds = Math.min(
        Math.round(EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS / 1000),
        Math.round(
          (assets.reduce((sum, a) => sum + a.durationMs, 0) ||
            EXECUTIVE_WALKTHROUGH_STEPS.reduce((s, step) => s + step.durationMs, 0)) / 1000,
        ),
      );

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
              artifactObjectKey: objectKey,
              artifactContentType: "video/mp4",
              artifactFilename: EXECUTIVE_WALKTHROUGH_DEFAULT_FILENAME,
              artifactExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              resultJson: {
                kind: "executive-walkthrough",
                walkthroughStatus: "completed",
                presentationId: EXECUTIVE_WALKTHROUGH_PRESENTATION_ID,
                contentVersion: options.contentVersion,
                videoTitle: options.videoTitle,
                resolution: options.resolution,
                includeNarration: options.includeNarration,
                burnCaptions: options.burnCaptions,
                includeIntro: options.includeIntro,
                includeOutro: options.includeOutro,
                durationSeconds,
                usedFallback,
              },
              updatedAt: new Date(),
            })
            .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
        },
        principal.userId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      this.logger.error(`Executive walkthrough export failed job=${jobId}: ${message}`);
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await tx
            .update(platformJobs)
            .set({
              status: "FAILED",
              progress: 100,
              completedAt: new Date(),
              failure: message.slice(0, 2000),
              resultJson: {
                kind: "executive-walkthrough",
                walkthroughStatus: "failed",
                contentVersion: options.contentVersion,
                videoTitle: options.videoTitle,
                resolution: options.resolution,
                includeNarration: options.includeNarration,
                burnCaptions: options.burnCaptions,
                errorMessage: message.slice(0, 500),
              },
              updatedAt: new Date(),
            })
            .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
        },
        principal.userId,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async createDownloadUrl(
    objectKey: string,
    filename: string,
  ): Promise<{
    downloadUrl: string;
    expiresAt: string;
    expiresInSeconds: number;
  }> {
    const expiresInSeconds = PRESIGN_EXPIRES_SECONDS;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const command = new GetObjectCommand({
      Bucket: this.env.S3_EXPORT_BUCKET,
      Key: objectKey,
      ResponseContentType: "video/mp4",
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });
    const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
    return { downloadUrl, expiresAt, expiresInSeconds };
  }

  async deleteExportObject(objectKey: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.env.S3_EXPORT_BUCKET,
        Key: objectKey,
      }),
    );
  }

  private async patchJob(
    tenantId: string,
    jobId: string,
    patch: {
      status?: string;
      progress: number;
      walkthroughStatus: WalkthroughJobStatus;
      userId?: string | null;
    },
  ) {
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.platformJobs.findFirst({
          where: and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)),
        });
        const prev = (existing?.resultJson ?? {}) as Record<string, unknown>;
        await tx
          .update(platformJobs)
          .set({
            ...(patch.status ? { status: patch.status } : {}),
            progress: patch.progress,
            startedAt: existing?.startedAt ?? new Date(),
            resultJson: {
              ...prev,
              kind: "executive-walkthrough",
              walkthroughStatus: patch.walkthroughStatus,
            },
            updatedAt: new Date(),
          })
          .where(and(eq(platformJobs.id, jobId), eq(platformJobs.tenantId, tenantId)));
      },
      patch.userId ?? undefined,
    );
  }

  /**
   * Preferred path: headless Chromium records the live walkthrough route.
   * Dynamic import so the API boots when playwright is not installed.
   * Listens for forge-walkthrough-ready / forge-walkthrough-complete custom events.
   */
  private async captureWithPlaywright(input: {
    workDir: string;
    token: string;
    width: number;
    height: number;
  }): Promise<string> {
    const playwright = await import("playwright").catch(() => null);
    if (!playwright?.chromium) {
      throw new Error("playwright is not installed");
    }
    const videoDir = join(input.workDir, "video");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: input.width, height: input.height },
        recordVideo: { dir: videoDir, size: { width: input.width, height: input.height } },
      });
      const page = await context.newPage();
      let ready = false;
      let complete = false;
      await page.exposeFunction("__forgeWalkthroughMark", (kind: string) => {
        if (kind === "ready") ready = true;
        if (kind === "complete") complete = true;
      });
      await page.addInitScript(`
        window.addEventListener("forge-walkthrough-ready", () => {
          if (typeof window.__forgeWalkthroughMark === "function") {
            window.__forgeWalkthroughMark("ready");
          }
        });
        window.addEventListener("forge-walkthrough-complete", () => {
          if (typeof window.__forgeWalkthroughMark === "function") {
            window.__forgeWalkthroughMark("complete");
          }
        });
      `);

      const base = this.industrialWebBaseUrl();
      const urls = [
        `${base}/walkthrough/${encodeURIComponent(input.token)}/`,
        `${base}/presentation/executive-walkthrough/render?mode=render&token=${encodeURIComponent(input.token)}`,
      ];
      let navigated = false;
      for (const url of urls) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
          navigated = true;
          break;
        } catch {
          // try next candidate
        }
      }
      if (!navigated) throw new Error("Unable to navigate to walkthrough render URL");

      const deadline = Date.now() + EXECUTIVE_WALKTHROUGH_MAX_RUNTIME_MS + 90_000;
      while (!ready && Date.now() < deadline) {
        await page.waitForTimeout(250);
      }
      while (!complete && Date.now() < deadline) {
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1500);
      await context.close();
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(videoDir);
      const webm = files.find((f) => f.endsWith(".webm"));
      if (!webm) throw new Error("No recorded video produced");
      return join(videoDir, webm);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  /**
   * Fallback when Playwright/Chromium is unavailable: encode a title-card
   * slideshow timed to narration (or silent 4:20 slate) so export still yields
   * a standards-compatible H.264 MP4.
   */
  private async buildFallbackSlideshow(input: {
    workDir: string;
    width: number;
    height: number;
    title: string;
    assets: Array<{ sceneId: string; durationMs: number }>;
  }): Promise<string> {
    const durationSec = Math.max(
      20,
      Math.round(
        (input.assets.reduce((s, a) => s + a.durationMs, 0) ||
          EXECUTIVE_WALKTHROUGH_STEPS.reduce((s, step) => s + step.durationMs, 0)) / 1000,
      ),
    );
    const out = join(input.workDir, "fallback.mp4");
    const safeTitle = input.title.replace(/:/g, "\\:").replace(/'/g, "");
    await runCommand(this.ffmpegBin(), [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x1c2733:s=${input.width}x${input.height}:d=${durationSec}`,
      "-vf",
      `drawtext=text='Forge Industrial Safety':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h/2-60),drawtext=text='${safeTitle}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=(h/2+10)`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(durationSec),
      out,
    ]);
    return out;
  }

  private async encodeMp4(input: {
    workDir: string;
    videoPath: string;
    audioPaths: string[];
    outputPath: string;
    burnCaptions: boolean;
    captionCues?: Array<{ text: string; durationMs: number }>;
  }): Promise<void> {
    const args = ["-y", "-i", input.videoPath];
    if (input.audioPaths.length === 1) {
      args.push("-i", input.audioPaths[0]!);
    } else if (input.audioPaths.length > 1) {
      const listPath = join(input.workDir, "audio.txt");
      await writeFile(
        listPath,
        input.audioPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      );
      const concatOut = join(input.workDir, "narration.mp3");
      await runCommand(this.ffmpegBin(), [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        concatOut,
      ]);
      args.push("-i", concatOut);
    }

    let videoFilter: string | null = null;
    if (input.burnCaptions && input.captionCues?.length) {
      const srtPath = join(input.workDir, "captions.srt");
      await writeFile(srtPath, buildSrt(input.captionCues));
      const escaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      videoFilter = `subtitles='${escaped}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=36'`;
    }

    if (input.audioPaths.length > 0) {
      args.push("-map", "0:v:0", "-map", "1:a:0");
      if (videoFilter) args.push("-vf", videoFilter);
      args.push("-c:v", "libx264", "-c:a", "aac", "-shortest");
    } else {
      if (videoFilter) args.push("-vf", videoFilter);
      args.push("-c:v", "libx264", "-an");
    }
    args.push("-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30", input.outputPath);
    await runCommand(this.ffmpegBin(), args);
  }
}

function formatSrtTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function buildSrt(cues: Array<{ text: string; durationMs: number }>): string {
  let cursor = 0;
  const blocks: string[] = [];
  cues.forEach((cue, index) => {
    const text = cue.text.trim();
    if (!text) {
      cursor += Math.max(1_000, cue.durationMs);
      return;
    }
    const start = cursor;
    const end = cursor + Math.max(1_500, cue.durationMs);
    cursor = end;
    blocks.push(
      `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${text}\n`,
    );
  });
  return blocks.join("\n");
}

export function hashWalkthroughContent(input: {
  voiceId: string;
  narrationSpeed: number;
  closingText?: string | null;
  /** When omitted, hashes default contract steps (legacy callers). */
  steps?: readonly Pick<
    (typeof EXECUTIVE_WALKTHROUGH_STEPS)[number],
    "id" | "narrationText" | "durationMs" | "route"
  >[];
}): string {
  const steps = input.steps ?? EXECUTIVE_WALKTHROUGH_STEPS;
  const payload = JSON.stringify({
    voiceId: input.voiceId,
    narrationSpeed: input.narrationSpeed,
    closingText: input.closingText ?? "",
    steps: steps.map((s) => ({
      id: s.id,
      narrationText: s.narrationText,
      durationMs: s.durationMs,
      route: s.route,
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}
