import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Inject, Injectable } from "@nestjs/common";
import {
  forgeDocuments,
  industrialTrainingMaterials,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { createLogger } from "@forge/observability";
import { and, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import {
  decideTrainingVideoCompat,
  iosRemuxArgs,
  iosTranscodeArgs,
  isTrainingVideoMime,
  type FfprobeReport,
} from "./training-video-ios-compat.js";
import { isTrainingVideoFile } from "./training-materials.mime.js";

const opsLogger = createLogger({
  service: "platform-api-training-video",
  environment: process.env.APP_ENV ?? "local",
});

/** Remux should finish in seconds; transcode of long clips gets a hard cap. */
const FFMPEG_TIMEOUT_MS = 8 * 60 * 1000;
/** Remote probe only needs headers + a little media; keep it short. */
const FFPROBE_TIMEOUT_MS = 90_000;

function runCommand(
  bin: string,
  args: string[],
  timeoutMs = FFMPEG_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

@Injectable()
export class IndustrialTrainingVideoNormalizeService {
  /** Serialize heavy ffmpeg work so concurrent Optimize clicks don't thrash ECS CPU. */
  private normalizeChain: Promise<void> = Promise.resolve();
  private queueDepth = 0;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private ffmpegBin(): string {
    return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  }

  private ffprobeBin(): string {
    return process.env.FFPROBE_PATH?.trim() || "ffprobe";
  }

  private normalizeEnabled(): boolean {
    const raw = process.env.TRAINING_VIDEO_IOS_NORMALIZE?.trim().toLowerCase();
    if (raw === "0" || raw === "false" || raw === "off") return false;
    return true;
  }

  /**
   * Fire-and-forget after video upload completes.
   * Probe + skip activate immediately; only remux/transcode share the CPU queue.
   */
  scheduleNormalize(input: { tenantId: string; materialId: string; userId?: string | null }): void {
    void this.runNormalizeJob(input).catch(() => undefined);
  }

  private async runNormalizeJob(input: {
    tenantId: string;
    materialId: string;
    userId?: string | null;
  }): Promise<void> {
    const started = Date.now();
    opsLogger.info("Starting training video normalize", { materialId: input.materialId });
    try {
      const outcome = await this.normalizeMaterial(input);
      opsLogger.info("Finished training video normalize", {
        materialId: input.materialId,
        outcome,
        seconds: Math.round((Date.now() - started) / 1000),
      });
    } catch (error) {
      opsLogger.error("Training video normalize failed", {
        materialId: input.materialId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * @returns skip | remux | transcode | activate-non-video | disabled
   */
  async normalizeMaterial(input: {
    tenantId: string;
    materialId: string;
    userId?: string | null;
  }): Promise<string> {
    const row = await withTenantTransaction(
      this.db,
      input.tenantId,
      async (tx) => {
        const material = await tx.query.industrialTrainingMaterials.findFirst({
          where: and(
            eq(industrialTrainingMaterials.id, input.materialId),
            eq(industrialTrainingMaterials.tenantId, input.tenantId),
          ),
        });
        if (!material || material.archivedAt) return null;
        const document = await tx.query.forgeDocuments.findFirst({
          where: and(
            eq(forgeDocuments.id, material.documentId),
            eq(forgeDocuments.tenantId, input.tenantId),
          ),
        });
        if (!document) return null;
        return { material, document };
      },
      input.userId ?? undefined,
    );

    if (!row) return "missing";
    const looksLikeVideo =
      isTrainingVideoMime(row.material.mimeType) ||
      isTrainingVideoFile({
        mimeType: row.material.mimeType,
        filename: row.material.originalFilename,
      }) ||
      isTrainingVideoMime(row.document.mimeType ?? "");
    if (!looksLikeVideo) {
      await this.markActive(input.tenantId, input.materialId, input.userId);
      return "activate-non-video";
    }

    if (!this.normalizeEnabled()) {
      opsLogger.warn("TRAINING_VIDEO_IOS_NORMALIZE disabled; activating without conversion", {
        materialId: input.materialId,
      });
      await this.markActive(input.tenantId, input.materialId, input.userId);
      return "disabled";
    }

    try {
      await this.ensureTools();

      // Probe via signed URL — no full S3 download for skip path.
      const { downloadUrl } = await this.storage.createPresignedDownloadUrl({
        objectKey: row.document.objectKey,
        mimeType: row.document.mimeType ?? row.material.mimeType,
        filename: row.material.originalFilename,
        inline: true,
      });
      opsLogger.info("Probing training video remotely", {
        materialId: input.materialId,
        objectKey: row.document.objectKey,
        byteSize: row.material.byteSize,
      });
      const probe = await this.probe(downloadUrl);
      const decision = decideTrainingVideoCompat(probe, {
        mimeType: row.material.mimeType ?? row.document.mimeType,
        filename: row.material.originalFilename,
      });
      opsLogger.info("Training video compat decision", {
        materialId: input.materialId,
        action: decision.action,
        reason: decision.reason,
      });

      if (decision.action === "skip") {
        await this.markActive(input.tenantId, input.materialId, input.userId);
        opsLogger.info("Training video ready (skip rewrite)", {
          materialId: input.materialId,
        });
        return "skip";
      }

      // Remux / transcode: serialize so multiple long encodes don't thrash 1 vCPU.
      return await this.enqueueHeavyWork(async () => {
        const workDir = await mkdtemp(join(tmpdir(), "forge-training-video-"));
        const inputPath = join(workDir, "source.bin");
        const outputPath = join(workDir, "ios-compatible.mp4");
        try {
          opsLogger.info("Downloading training video for rewrite", {
            materialId: input.materialId,
            objectKey: row.document.objectKey,
            byteSize: row.material.byteSize,
            action: decision.action,
          });
          await this.storage.downloadObjectToFile(row.document.objectKey, inputPath);

          const args =
            decision.action === "remux"
              ? iosRemuxArgs(inputPath, outputPath)
              : iosTranscodeArgs(inputPath, outputPath);

          try {
            await runCommand(this.ffmpegBin(), args);
          } catch (error) {
            if (decision.action === "remux") {
              opsLogger.warn("Remux failed; falling back to full transcode", {
                materialId: input.materialId,
                error: error instanceof Error ? error.message : String(error),
              });
              await runCommand(this.ffmpegBin(), iosTranscodeArgs(inputPath, outputPath));
            } else {
              throw error;
            }
          }

          const outStat = await stat(outputPath);
          if (!outStat.size) {
            throw new Error("Normalized video is empty");
          }

          const playbackKey = row.document.objectKey.toLowerCase().endsWith(".mp4")
            ? row.document.objectKey
            : `${row.document.objectKey.replace(/\.[^.]+$/, "")}.ios.mp4`;

          await this.storage.putObjectFromFile({
            objectKey: playbackKey,
            filePath: outputPath,
            mimeType: "video/mp4",
          });

          const now = new Date();
          await withTenantTransaction(
            this.db,
            input.tenantId,
            async (tx) => {
              await tx
                .update(forgeDocuments)
                .set({
                  objectKey: playbackKey,
                  mimeType: "video/mp4",
                  fileSizeBytes: outStat.size,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(forgeDocuments.id, row.document.id),
                    eq(forgeDocuments.tenantId, input.tenantId),
                  ),
                );

              await tx
                .update(industrialTrainingMaterials)
                .set({
                  status: "ACTIVE",
                  mimeType: "video/mp4",
                  byteSize: outStat.size,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(industrialTrainingMaterials.id, input.materialId),
                    eq(industrialTrainingMaterials.tenantId, input.tenantId),
                  ),
                );
            },
            input.userId ?? undefined,
          );

          opsLogger.info("Training video ready for tablet playback", {
            materialId: input.materialId,
            bytes: outStat.size,
            action: decision.action,
          });
          return decision.action;
        } finally {
          await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
      });
    } catch (error) {
      opsLogger.error("Training video normalize failed", {
        materialId: input.materialId,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.markFailed(input.tenantId, input.materialId, input.userId);
      throw error;
    }
  }

  private enqueueHeavyWork<T>(work: () => Promise<T>): Promise<T> {
    this.queueDepth += 1;
    const position = this.queueDepth;
    opsLogger.info("Queued heavy training video rewrite", { position });
    const run = this.normalizeChain.then(async () => {
      try {
        return await work();
      } finally {
        this.queueDepth = Math.max(0, this.queueDepth - 1);
      }
    });
    this.normalizeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensureTools(): Promise<void> {
    await runCommand(this.ffprobeBin(), ["-version"], 30_000);
    await runCommand(this.ffmpegBin(), ["-version"], 30_000);
  }

  private async probe(source: string): Promise<FfprobeReport> {
    const { stdout } = await runCommand(
      this.ffprobeBin(),
      ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", source],
      FFPROBE_TIMEOUT_MS,
    );
    return JSON.parse(stdout) as FfprobeReport;
  }

  private async markActive(
    tenantId: string,
    materialId: string,
    userId?: string | null,
  ): Promise<void> {
    const now = new Date();
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx
          .update(industrialTrainingMaterials)
          .set({ status: "ACTIVE", updatedAt: now })
          .where(
            and(
              eq(industrialTrainingMaterials.id, materialId),
              eq(industrialTrainingMaterials.tenantId, tenantId),
            ),
          );
      },
      userId ?? undefined,
    );
  }

  private async markFailed(
    tenantId: string,
    materialId: string,
    userId?: string | null,
  ): Promise<void> {
    const now = new Date();
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx
          .update(industrialTrainingMaterials)
          .set({ status: "FAILED", updatedAt: now })
          .where(
            and(
              eq(industrialTrainingMaterials.id, materialId),
              eq(industrialTrainingMaterials.tenantId, tenantId),
            ),
          );
      },
      userId ?? undefined,
    );
  }
}
