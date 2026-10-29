import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { WalkthroughStep } from "@forge/contracts";
import {
  createId,
  industrialExecutiveWalkthroughNarration,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { PRESIGN_EXPIRES_SECONDS } from "../neris-incidents/document-storage.service.js";
import {
  createNarrationProvider,
  type NarrationProvider,
  type NarrationSynthInput,
  type NarrationSynthResult,
  PollyNarrationProvider,
} from "./narration/narration-providers.js";
import { Readable } from "node:stream";

export type { NarrationProvider, NarrationSynthInput, NarrationSynthResult };
export { PollyNarrationProvider, createNarrationProvider };

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as Readable).pipe === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.alloc(0);
}

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export type EnsuredNarrationAsset = {
  sceneId: string;
  durationMs: number;
  downloadUrl: string;
  contentType: string;
  storageKey: string;
};

@Injectable()
export class IndustrialExecutiveWalkthroughNarrationService {
  private readonly logger = new Logger(IndustrialExecutiveWalkthroughNarrationService.name);
  private readonly s3: S3Client;
  private readonly provider: NarrationProvider;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
    this.provider = createNarrationProvider({
      region: this.env.AWS_REGION,
      ...(process.env.WALKTHROUGH_TTS_PROVIDER
        ? { provider: process.env.WALKTHROUGH_TTS_PROVIDER }
        : {}),
      ...(process.env.OPENAI_API_KEY ? { openAiApiKey: process.env.OPENAI_API_KEY } : {}),
      ...(process.env.ELEVENLABS_API_KEY
        ? { elevenLabsApiKey: process.env.ELEVENLABS_API_KEY }
        : {}),
    });
    this.logger.log(`Narration provider: ${this.provider.name}`);
  }

  private narrationBucket(): string {
    return this.env.S3_DOCUMENT_BUCKET;
  }

  private storageKey(tenantId: string, sceneId: string, contentVersion: string): string {
    return `tenants/${tenantId}/presentations/executive-walkthrough/narration/${sceneId}-${contentVersion}.mp3`;
  }

  async ensureNarrationAssets(
    principal: ForgePrincipal,
    contentVersion: string,
    voiceId: string,
    steps: readonly Pick<WalkthroughStep, "id" | "narrationText">[],
    options: { speed?: number } = {},
  ): Promise<EnsuredNarrationAsset[]> {
    const tenantId = principal.tenantId;
    if (!tenantId) throw new ForgeError("FORBIDDEN", "Tenant scope required");
    const resolvedVoice = voiceId.trim() || process.env.POLLY_VOICE_ID || "Stephen";
    const speed = options.speed ?? 100;
    const assets: EnsuredNarrationAsset[] = [];

    for (const step of steps) {
      const text = String(step.narrationText ?? "").trim();
      if (!text) continue;

      const hash = textHash(text);
      const existing = await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          return tx.query.industrialExecutiveWalkthroughNarration.findFirst({
            where: and(
              eq(industrialExecutiveWalkthroughNarration.tenantId, tenantId),
              eq(industrialExecutiveWalkthroughNarration.sceneId, step.id),
              eq(industrialExecutiveWalkthroughNarration.contentVersion, contentVersion),
              eq(industrialExecutiveWalkthroughNarration.voiceId, resolvedVoice),
            ),
          });
        },
        principal.userId,
      );

      if (existing && existing.textHash === hash) {
        const downloadUrl = await this.presignDownload(existing.storageKey, existing.contentType);
        assets.push({
          sceneId: step.id,
          durationMs: existing.durationMs,
          downloadUrl,
          contentType: existing.contentType,
          storageKey: existing.storageKey,
        });
        continue;
      }

      const synthesized = await this.provider.synthesize({
        text,
        voiceId: resolvedVoice,
        speed,
        format: "mp3",
      });
      const key = this.storageKey(tenantId, step.id, contentVersion);

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.narrationBucket(),
          Key: key,
          Body: synthesized.audio,
          ContentType: synthesized.contentType,
          ServerSideEncryption: "aws:kms",
        }),
      );

      const now = new Date();
      const rowId = existing?.id ?? createId();
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          if (existing) {
            await tx
              .update(industrialExecutiveWalkthroughNarration)
              .set({
                textHash: hash,
                durationMs: synthesized.durationMs,
                storageBucket: this.narrationBucket(),
                storageKey: key,
                contentType: synthesized.contentType,
                updatedAt: now,
              })
              .where(eq(industrialExecutiveWalkthroughNarration.id, existing.id));
          } else {
            await tx.insert(industrialExecutiveWalkthroughNarration).values({
              id: rowId,
              tenantId,
              sceneId: step.id,
              contentVersion,
              voiceId: resolvedVoice,
              textHash: hash,
              durationMs: synthesized.durationMs,
              storageBucket: this.narrationBucket(),
              storageKey: key,
              contentType: synthesized.contentType,
              createdAt: now,
              updatedAt: now,
            });
          }
        },
        principal.userId,
      );

      this.logger.log(
        `Narration cached scene=${step.id} version=${contentVersion.slice(0, 8)} engine=${synthesized.engine}`,
      );

      assets.push({
        sceneId: step.id,
        durationMs: synthesized.durationMs,
        downloadUrl: await this.presignDownload(key, synthesized.contentType),
        contentType: synthesized.contentType,
        storageKey: key,
      });
    }

    return assets;
  }

  async listCachedForVersion(
    tenantId: string,
    contentVersion: string,
    voiceId: string,
    userId?: string | null,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        return tx.query.industrialExecutiveWalkthroughNarration.findMany({
          where: and(
            eq(industrialExecutiveWalkthroughNarration.tenantId, tenantId),
            eq(industrialExecutiveWalkthroughNarration.contentVersion, contentVersion),
            eq(industrialExecutiveWalkthroughNarration.voiceId, voiceId),
          ),
        });
      },
      userId ?? undefined,
    );
  }

  async downloadObjectBuffer(storageKey: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.narrationBucket(),
        Key: storageKey,
      }),
    );
    return streamToBuffer(response.Body);
  }

  async presignDownload(storageKey: string, contentType?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.narrationBucket(),
      Key: storageKey,
      ...(contentType ? { ResponseContentType: contentType } : {}),
      ResponseContentDisposition: "inline",
    });
    return getSignedUrl(this.s3, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  }
}
