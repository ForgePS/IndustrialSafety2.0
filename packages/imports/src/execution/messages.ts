import { z } from "zod";

export const IMPORT_EXECUTE_MESSAGE_TYPE = "IMPORT_EXECUTE" as const;
export const IMPORT_EXECUTE_SCHEMA_VERSION = "1" as const;

export const importExecuteMessageSchema = z.object({
  schemaVersion: z.literal(IMPORT_EXECUTE_SCHEMA_VERSION),
  messageType: z.literal(IMPORT_EXECUTE_MESSAGE_TYPE),
  jobId: z.string().uuid(),
  tenantId: z.string().uuid(),
  requestedBy: z.string().uuid().nullable(),
  correlationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(255),
  attempt: z.number().int().min(1).max(100),
  requestedAt: z.string().datetime({ offset: true }),
});

export type ImportExecuteMessage = z.infer<typeof importExecuteMessageSchema>;

export function createImportExecuteMessage(
  input: Omit<ImportExecuteMessage, "schemaVersion" | "messageType" | "requestedAt" | "attempt"> & {
    attempt?: number;
    requestedAt?: string;
  },
): ImportExecuteMessage {
  return importExecuteMessageSchema.parse({
    schemaVersion: IMPORT_EXECUTE_SCHEMA_VERSION,
    messageType: IMPORT_EXECUTE_MESSAGE_TYPE,
    jobId: input.jobId,
    tenantId: input.tenantId,
    requestedBy: input.requestedBy,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    attempt: input.attempt ?? 1,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  });
}

export function parseImportExecuteMessage(raw: unknown): ImportExecuteMessage {
  return importExecuteMessageSchema.parse(raw);
}

export type MessageValidationResult =
  { ok: true; message: ImportExecuteMessage } | { ok: false; reason: string; code: string };

export function validateImportExecuteMessage(raw: unknown): MessageValidationResult {
  const parsed = importExecuteMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((i) => i.message).join("; "),
      code: "IMPORT_MESSAGE_INVALID",
    };
  }
  return { ok: true, message: parsed.data };
}
