import { z } from "zod";

export const PLATFORM_JOB_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export type PlatformJobStatus = (typeof PLATFORM_JOB_STATUSES)[number];

export const PLATFORM_JOB_TYPES = [
  "export.memberships.csv",
  "export.audit.json",
  "export.reporting",
  "export.executive-walkthrough",
] as const;

export type PlatformJobType = (typeof PLATFORM_JOB_TYPES)[number];

export const platformJobSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.enum(PLATFORM_JOB_TYPES),
  status: z.enum(PLATFORM_JOB_STATUSES),
  progress: z.number().int().min(0).max(100),
  attempt: z.number().int().min(0),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  failure: z.string().max(2000).nullable().optional(),
  correlationId: z.string().min(1).max(120),
  resultSummary: z.record(z.unknown()).optional(),
  downloadAvailable: z.boolean().optional(),
});

export type PlatformJob = z.infer<typeof platformJobSchema>;

export const listPlatformJobsQuerySchema = z.object({
  type: z.enum(PLATFORM_JOB_TYPES).optional(),
  status: z.enum(PLATFORM_JOB_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export type ListPlatformJobsQuery = z.infer<typeof listPlatformJobsQuerySchema>;
