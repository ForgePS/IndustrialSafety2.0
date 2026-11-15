import { z } from "zod";
import { DUPLICATE_ACTIONS } from "./types.js";
import { CONFIDENCE_BANDS, MATCH_ALGORITHMS } from "./duplicates/engine.js";

const fieldRuleSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    weight: z.number().min(0).max(10),
    strategy: z.enum(MATCH_ALGORITHMS),
    required: z.boolean().optional(),
  })
  .strict();

export const duplicateRulesSchema = z
  .object({
    algorithms: z.array(z.enum(MATCH_ALGORITHMS)).min(1).max(4).optional(),
    fields: z.array(fieldRuleSchema).min(1).max(50).optional(),
    thresholds: z
      .object({
        high: z.number().min(0).max(1),
        medium: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    fuzzyMaxDistance: z.number().int().min(0).max(10).optional(),
    recommend: z
      .object({
        highAction: z.enum(DUPLICATE_ACTIONS),
        mediumAction: z.enum(DUPLICATE_ACTIONS),
        lowAction: z.enum(DUPLICATE_ACTIONS),
      })
      .strict()
      .optional(),
  })
  .strict();

export const stageImportRowsSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            sourceRowKey: z.string().trim().min(1).max(200),
            mapped: z.record(z.unknown()),
            sourceLine: z.number().int().positive().optional(),
            sourceSheet: z.string().trim().max(200).optional(),
            containsSensitive: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5000),
  })
  .strict();

export const detectDuplicatesSchema = z
  .object({
    existingRecords: z
      .array(
        z
          .object({
            entityId: z.string().uuid(),
            entityType: z.string().trim().min(1).max(120).optional(),
            fields: z.record(z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .max(20_000),
    rules: duplicateRulesSchema.optional(),
    replaceExistingCandidates: z.boolean().optional().default(true),
  })
  .strict();

export const listDuplicatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  jobId: z.string().uuid().optional(),
  reviewStatus: z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"]).optional(),
  confidenceBand: z.enum(CONFIDENCE_BANDS).optional(),
  sort: z.enum(["createdAt", "confidence", "reviewStatus"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const reviewDuplicateSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const resolveDuplicateSchema = z
  .object({
    resolvedAction: z.enum(DUPLICATE_ACTIONS),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const validateZipSchema = z
  .object({
    jobId: z.string().uuid(),
  })
  .strict();

export const validateApiSourceSchema = z
  .object({
    config: z.record(z.unknown()),
  })
  .strict();

export const patchImportProfileS4Schema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    snapshot: z.record(z.unknown()).optional(),
    duplicateRules: duplicateRulesSchema.optional(),
    zipMetadata: z.record(z.unknown()).optional(),
    apiSourceMetadata: z.record(z.unknown()).optional(),
    changeSummary: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.snapshot !== undefined ||
      v.duplicateRules !== undefined ||
      v.zipMetadata !== undefined ||
      v.apiSourceMetadata !== undefined,
    { message: "At least one field is required" },
  );

export type StageImportRowsInput = z.infer<typeof stageImportRowsSchema>;
export type DetectDuplicatesInput = z.infer<typeof detectDuplicatesSchema>;
export type ListDuplicatesQuery = z.infer<typeof listDuplicatesQuerySchema>;
export type ReviewDuplicateInput = z.infer<typeof reviewDuplicateSchema>;
export type ResolveDuplicateInput = z.infer<typeof resolveDuplicateSchema>;
export type PatchImportProfileS4Input = z.infer<typeof patchImportProfileS4Schema>;
