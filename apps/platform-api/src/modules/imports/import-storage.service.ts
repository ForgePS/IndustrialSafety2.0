import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { createId } from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { PRESIGN_EXPIRES_SECONDS } from "@forge/imports";
import { APP_ENV } from "../../tokens.js";

@Injectable()
export class ImportStorageService {
  private readonly client: S3Client;

  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {
    this.client = new S3Client({ region: this.env.AWS_REGION });
  }

  get bucketName(): string {
    return this.env.S3_IMPORT_BUCKET;
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

  buildObjectKey(tenantId: string, jobId: string, storedFilename: string): string {
    return `tenants/${tenantId}/imports/${jobId}/${storedFilename}`;
  }

  async createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    checksumSha256?: string;
  }): Promise<{ uploadUrl: string; expiresInSeconds: number; mode: "S3_PRESIGNED" }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ServerSideEncryption: "aws:kms",
      ...(input.checksumSha256
        ? { ChecksumSHA256: Buffer.from(input.checksumSha256, "hex").toString("base64") }
        : {}),
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

  async createMultipartUpload(input: { objectKey: string; contentType: string }): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        ContentType: input.contentType,
        ServerSideEncryption: "aws:kms",
      }),
    );
    if (!response.UploadId) {
      throw new Error("CreateMultipartUpload did not return UploadId");
    }
    return response.UploadId;
  }

  async createPresignedPartUrl(input: {
    objectKey: string;
    uploadId: string;
    partNumber: number;
  }): Promise<{ uploadUrl: string; expiresInSeconds: number; partNumber: number }> {
    const command = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    return {
      uploadUrl,
      expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
      partNumber: input.partNumber,
    };
  }

  async completeMultipartUpload(input: {
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              ETag: part.etag,
              PartNumber: part.partNumber,
            })),
        },
      }),
    );
  }

  async abortMultipartUpload(input: { objectKey: string; uploadId: string }): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: input.objectKey,
        UploadId: input.uploadId,
      }),
    );
  }

  async headObject(objectKey: string): Promise<{
    contentLength: number | null;
    contentType: string | null;
    eTag: string | null;
  }> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
    return {
      contentLength: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
      eTag: response.ETag ?? null,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
  }
}

export function hashImportContent(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
