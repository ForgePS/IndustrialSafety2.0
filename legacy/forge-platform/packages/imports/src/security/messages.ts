import { z } from "zod";

export const IMPORT_MALWARE_SCAN_MESSAGE_TYPE = "IMPORT_MALWARE_SCAN" as const;
export const IMPORT_MALWARE_SCAN_SCHEMA_VERSION = "1" as const;

export const importMalwareScanMessageSchema = z.object({
  schemaVersion: z.literal(IMPORT_MALWARE_SCAN_SCHEMA_VERSION),
  messageType: z.literal(IMPORT_MALWARE_SCAN_MESSAGE_TYPE),
  jobId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fileId: z.string().uuid(),
  correlationId: z.string().min(1).max(128),
  requestedBy: z.string().uuid().nullable(),
  attempt: z.number().int().min(1).max(20),
  requestedAt: z.string().datetime({ offset: true }),
});

export type ImportMalwareScanMessage = z.infer<typeof importMalwareScanMessageSchema>;

export function createImportMalwareScanMessage(
  input: Omit<
    ImportMalwareScanMessage,
    "schemaVersion" | "messageType" | "requestedAt" | "attempt"
  > & { attempt?: number; requestedAt?: string },
): ImportMalwareScanMessage {
  return importMalwareScanMessageSchema.parse({
    schemaVersion: IMPORT_MALWARE_SCAN_SCHEMA_VERSION,
    messageType: IMPORT_MALWARE_SCAN_MESSAGE_TYPE,
    jobId: input.jobId,
    tenantId: input.tenantId,
    fileId: input.fileId,
    correlationId: input.correlationId,
    requestedBy: input.requestedBy,
    attempt: input.attempt ?? 1,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  });
}

export function validateImportMalwareScanMessage(raw: unknown) {
  const parsed = importMalwareScanMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      reason: parsed.error.issues.map((i) => i.message).join("; "),
      code: "IMPORT_MESSAGE_INVALID",
    };
  }
  return { ok: true as const, message: parsed.data };
}

export const rescanImportFileSchema = z.object({
  reason: z.string().max(2000).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export type RescanImportFileInput = z.infer<typeof rescanImportFileSchema>;

export const downloadArtifactSchema = z.object({
  artifactType: z.enum(["results", "errors", "security-report"]).default("results"),
  privileged: z.boolean().optional(),
});

export type DownloadArtifactInput = z.infer<typeof downloadArtifactSchema>;
