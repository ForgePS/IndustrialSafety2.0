import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import {
  brandingObjectKeyPrefix,
  isSignedAccessExpired,
  objectKeyBelongsToTenant,
} from "@forge/contracts";
import type { ForgeEnvironment } from "@forge/environment";
import { createId } from "@forge/database";
import { ForgeError } from "@forge/errors";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { APP_ENV } from "../../tokens.js";

export const PRESIGN_EXPIRES_SECONDS = 15 * 60;

@Injectable()
export class DocumentStorageService {
  private readonly client: S3Client;

  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {
    this.client = new S3Client({ region: this.env.AWS_REGION });
  }

  get bucketName(): string {
    return this.env.S3_DOCUMENT_BUCKET;
  }

  /** Tenant-scoped object key — never public. */
  buildObjectKey(tenantId: string, incidentId: string, storedFilename: string): string {
    return `tenants/${tenantId}/incidents/${incidentId}/documents/${storedFilename}`;
  }

  /** Branding asset key (MK-S14). */
  buildBrandingObjectKey(
    tenantId: string,
    kind: "logo" | "logo_dark" | "icon",
    storedFilename: string,
  ): string {
    return `${brandingObjectKeyPrefix(tenantId)}${kind}/${storedFilename}`;
  }

  buildStoredFilename(originalFilename: string): string {
    const basename = originalFilename.replace(/\\/g, "/").split("/").pop() ?? "file";
    const safe = basename
      .replace(/\.\.+/g, ".")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 180);
    return `${createId()}-${safe || "file"}`;
  }

  assertTenantObjectKey(objectKey: string, tenantId: string): void {
    if (!objectKeyBelongsToTenant(objectKey, tenantId)) {
      throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
    }
  }

  assertDownloadNotExpired(expiresAt: Date | string, now: Date = new Date()): void {
    if (isSignedAccessExpired(expiresAt, now)) {
      throw new ForgeError("VALIDATION_FAILED", "Signed access has expired");
    }
  }

  async createPresignedUploadUrl(input: {
    objectKey: string;
    mimeType: string;
    contentLength: number;
  }): Promise<{ uploadUrl: string; expiresInSeconds: number; mode: "S3_PRESIGNED" }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ContentType: input.mimeType,
      ContentLength: input.contentLength,
      ServerSideEncryption: "aws:kms",
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    return {
      uploadUrl,
      expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
      mode: "S3_PRESIGNED",
    };
  }

  async assertObjectExists(objectKey: string): Promise<void> {
    await this.headObject(objectKey);
  }

  async headObject(objectKey: string): Promise<{ contentLength: number | undefined }> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey,
        }),
      );
      return { contentLength: response.ContentLength };
    } catch {
      throw new ForgeError("NOT_FOUND", "Stored file is missing. Try uploading again.");
    }
  }

  async getObjectStream(objectKey: string): Promise<{
    body: Readable;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    await this.assertObjectExists(objectKey);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
    const body = response.Body;
    if (!body || typeof (body as Readable).pipe !== "function") {
      throw new ForgeError("INTERNAL_ERROR", "Unable to read stored file");
    }
    return {
      body: body as Readable,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  /** Stream an object to a local file without buffering the whole object in memory. */
  async downloadObjectToFile(objectKey: string, destPath: string): Promise<void> {
    const { body } = await this.getObjectStream(objectKey);
    await pipeline(body, createWriteStream(destPath));
  }

  /** Upload a local file with KMS encryption (used after video normalization). */
  async putObjectFromFile(input: {
    objectKey: string;
    filePath: string;
    mimeType: string;
  }): Promise<{ contentLength: number }> {
    const info = await stat(input.filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        Body: createReadStream(input.filePath),
        ContentType: input.mimeType,
        ContentLength: info.size,
        ServerSideEncryption: "aws:kms",
      }),
    );
    return { contentLength: info.size };
  }

  /** Upload an in-memory buffer with KMS encryption (print artifacts, etc.). */
  async putObject(input: {
    objectKey: string;
    body: Buffer;
    mimeType: string;
  }): Promise<{ contentLength: number }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.mimeType,
        ContentLength: input.body.length,
        ServerSideEncryption: "aws:kms",
      }),
    );
    return { contentLength: input.body.length };
  }

  async createPresignedDownloadUrl(input: {
    objectKey: string;
    mimeType?: string;
    filename?: string;
    inline?: boolean;
    /** Defaults to 15 minutes. */
    expiresInSeconds?: number;
  }): Promise<{
    downloadUrl: string;
    expiresInSeconds: number;
    expiresAt: string;
    mode: "S3_PRESIGNED";
  }> {
    const expiresIn = input.expiresInSeconds ?? PRESIGN_EXPIRES_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const disposition = input.inline
      ? "inline"
      : `attachment; filename="${sanitizeDownloadFilename(input.filename)}"`;
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ...(input.mimeType ? { ResponseContentType: input.mimeType } : {}),
      ResponseContentDisposition: disposition,
    });
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn });
    return {
      downloadUrl,
      expiresInSeconds: expiresIn,
      expiresAt: expiresAt.toISOString(),
      mode: "S3_PRESIGNED",
    };
  }
}

function sanitizeDownloadFilename(filename: string | undefined): string {
  const base = (filename ?? "download").replace(/\\/g, "/").split("/").pop() ?? "download";
  return (
    base
      .replace(/"/g, "")
      .replace(/[^\w.\-() ]+/g, "_")
      .slice(0, 180) || "download"
  );
}
