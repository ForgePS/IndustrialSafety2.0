import { z } from "zod";

export const executeImportJobSchema = z.object({
  idempotencyKey: z.string().min(1).max(255).optional(),
  batchSize: z.number().int().min(1).max(500).optional(),
  adapterKey: z.string().min(1).max(160).optional(),
});

export type ExecuteImportJobInput = z.infer<typeof executeImportJobSchema>;

export const cancelExecutionSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export type CancelExecutionInput = z.infer<typeof cancelExecutionSchema>;

export const rollbackRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export type RollbackRequestInput = z.infer<typeof rollbackRequestSchema>;

export const retryRowErrorSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export type RetryRowErrorInput = z.infer<typeof retryRowErrorSchema>;
