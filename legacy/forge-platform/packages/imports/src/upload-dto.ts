import { z } from "zod";

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, "Invalid key format");

const sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "checksumSha256 must be a 64-char hex digest");

export const initImportUploadSchema = z
  .object({
    productKey: keySchema,
    moduleKey: keySchema,
    recordCategory: z.string().trim().min(1).max(120),
    displayName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    profileId: z.string().uuid().optional(),
    requestedMode: z.enum(["CREATE", "UPDATE", "UPSERT"]).default("UPSERT"),
    fileName: z.string().trim().min(1).max(500),
    contentType: z.string().trim().min(3).max(200),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    format: z.enum(["csv", "xlsx", "json"]).optional(),
    checksumSha256: sha256Schema.optional(),
    uploadMode: z.enum(["SINGLE", "MULTIPART"]).optional(),
    partSizeBytes: z
      .number()
      .int()
      .min(5 * 1024 * 1024)
      .max(64 * 1024 * 1024)
      .optional(),
    clientRequestId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const completeImportUploadSchema = z
  .object({
    checksumSha256: sha256Schema.optional(),
    parts: z
      .array(
        z
          .object({
            partNumber: z.number().int().min(1).max(10_000),
            etag: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(10_000)
      .optional(),
  })
  .strict();

export const importUploadPartsSchema = z
  .object({
    partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
  })
  .strict();

export type InitImportUploadInput = z.infer<typeof initImportUploadSchema>;
export type CompleteImportUploadInput = z.infer<typeof completeImportUploadSchema>;
export type ImportUploadPartsInput = z.infer<typeof importUploadPartsSchema>;

export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
export const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_UPLOAD_BYTES = 100 * 1024 * 1024;
export const PRESIGN_EXPIRES_SECONDS = 15 * 60;

export const ALLOWED_IMPORT_CONTENT_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "application/octet-stream",
]);
