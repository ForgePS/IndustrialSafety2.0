import { z } from "zod";

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, "Invalid key format");

const transformSchema = z
  .object({
    transformId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
      .optional(),
    defaultValue: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]).optional(),
  })
  .strict()
  .refine(
    (value) => {
      const serialized = JSON.stringify(value);
      return !/(javascript:|eval\(|function\s*\(|SELECT\s+|DROP\s+|;\s*--|\/\*|\*\/)/i.test(
        serialized,
      );
    },
    { message: "Unsafe transform definition" },
  );

export const createImportJobSchema = z
  .object({
    productKey: keySchema,
    moduleKey: keySchema,
    recordCategory: z.string().trim().min(1).max(120),
    sourceType: z.enum(["csv", "xlsx", "json", "zip", "api", "manual"]).default("manual"),
    profileId: z.string().uuid().optional(),
    displayName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    requestedMode: z.enum(["CREATE", "UPDATE", "UPSERT"]).default("UPSERT"),
    clientRequestId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const patchImportJobSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.description !== undefined, {
    message: "At least one field is required",
  });

export const mappingItemSchema = z
  .object({
    sourceColumn: z.string().trim().min(1).max(300),
    targetField: z.string().trim().min(1).max(300),
    transform: transformSchema.optional(),
    isRequired: z.boolean().optional().default(false),
    isSensitive: z.boolean().optional().default(false),
    ordinal: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const putMappingsSchema = z
  .object({
    mappings: z.array(mappingItemSchema).min(1).max(500),
  })
  .strict();

export const createImportProfileSchema = z
  .object({
    profileKey: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
    displayName: z.string().trim().min(1).max(200),
    productKey: keySchema,
    moduleKey: keySchema,
    recordCategory: z.string().trim().min(1).max(120),
    sourceType: z.enum(["csv", "xlsx", "json", "zip", "api", "manual"]).default("manual"),
    snapshot: z.record(z.unknown()).optional().default({}),
  })
  .strict();

export const patchImportProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    snapshot: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.snapshot !== undefined, {
    message: "At least one field is required",
  });

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(64).optional(),
  productKey: z.string().trim().max(64).optional(),
  moduleKey: z.string().trim().max(64).optional(),
  recordCategory: z.string().trim().max(120).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  createdBy: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "updatedAt", "displayName", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const listProfilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  productKey: z.string().trim().max(64).optional(),
  moduleKey: z.string().trim().max(64).optional(),
  recordCategory: z.string().trim().max(120).optional(),
  archived: z.enum(["true", "false", "any"]).default("false"),
  sort: z.enum(["createdAt", "updatedAt", "displayName"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateImportJobInput = z.infer<typeof createImportJobSchema>;
export type PatchImportJobInput = z.infer<typeof patchImportJobSchema>;
export type PutMappingsInput = z.infer<typeof putMappingsSchema>;
export type CreateImportProfileInput = z.infer<typeof createImportProfileSchema>;
export type PatchImportProfileInput = z.infer<typeof patchImportProfileSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type ListProfilesQuery = z.infer<typeof listProfilesQuerySchema>;
