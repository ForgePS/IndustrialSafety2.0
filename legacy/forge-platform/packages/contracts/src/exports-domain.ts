import { z } from "zod";
import { PLATFORM_JOB_TYPES } from "./jobs-domain.js";

export const EXPORT_KINDS = ["memberships.csv", "audit.json"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_KIND_TO_JOB_TYPE = {
  "memberships.csv": "export.memberships.csv",
  "audit.json": "export.audit.json",
} as const satisfies Record<ExportKind, (typeof PLATFORM_JOB_TYPES)[number]>;

/** Sync path row limit before job is marked QUEUED for async continuation. */
export const EXPORT_SYNC_ROW_LIMIT = 5000;

export const EXPORT_DOWNLOAD_TTL_SECONDS = 15 * 60;

export const createExportInputSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  /** Optional hint; server enforces authz regardless. */
  asyncPreferred: z.boolean().optional().default(false),
});

export type CreateExportInput = z.infer<typeof createExportInputSchema>;

export const exportDownloadSchema = z.object({
  jobId: z.string().uuid(),
  downloadUrl: z.string().min(1).max(4000),
  expiresInSeconds: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  mode: z.enum(["S3_PRESIGNED", "API_STREAM"]),
  contentType: z.string().min(1).max(120),
  filename: z.string().min(1).max(200),
});

export type ExportDownload = z.infer<typeof exportDownloadSchema>;
