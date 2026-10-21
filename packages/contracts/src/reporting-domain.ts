import { z } from "zod";

/** Reporting Center permission codes (vision §55). Additive to module perms. */
export const INDUSTRIAL_REPORTING_PERMISSIONS = [
  "industrial.reporting.view",
  "industrial.reporting.run",
  "industrial.reporting.export",
  "industrial.reporting.manage",
  "industrial.reporting.view_sensitive",
  "industrial.reporting.schedule",
  "industrial.reporting.share",
  "industrial.reporting.admin",
] as const;

export type IndustrialReportingPermission = (typeof INDUSTRIAL_REPORTING_PERMISSIONS)[number];

export const REPORT_EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export const REPORT_DEFINITION_ORIGINS = ["builtin", "saved", "template"] as const;

/** Marker stored in report_recipients.email; resolved to Safety Director inboxes at send time. */
export const SAFETY_DIRECTOR_RECIPIENT_MARKER = "role:SAFETY_DIRECTOR";

const reportRecipientEmailSchema = z
  .string()
  .max(320)
  .refine(
    (value) =>
      value === SAFETY_DIRECTOR_RECIPIENT_MARKER || z.string().email().safeParse(value).success,
    { message: "Must be a valid email or role:SAFETY_DIRECTOR" },
  );

export const REPORT_RELATIVE_DATE_RANGES = [
  "last_7_days",
  "last_30_days",
  "this_month",
  "prior_month",
] as const;

export type ReportRelativeDateRange = (typeof REPORT_RELATIVE_DATE_RANGES)[number];

export const reportRunInputSchema = z.object({
  dateFrom: z.string().datetime().optional().nullable(),
  dateTo: z.string().datetime().optional().nullable(),
  relativeDateRange: z.enum(REPORT_RELATIVE_DATE_RANGES).optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional(),
  locationId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  sortBy: z.string().max(80).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  fields: z.array(z.string().max(80)).max(100).optional(),
  groupBy: z.string().max(80).optional().nullable(),
  aggregate: z.enum(["count"]).optional().nullable(),
  filters: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
});

export type ReportRunInput = z.infer<typeof reportRunInputSchema>;

export const reportExportInputSchema = reportRunInputSchema.extend({
  format: z.enum(REPORT_EXPORT_FORMATS),
});

export type ReportExportInput = z.infer<typeof reportExportInputSchema>;

export const createSavedReportInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  sourceKey: z.string().min(1).max(120),
  category: z.string().max(80).optional().nullable(),
  moduleCode: z.string().max(80).optional().nullable(),
  payloadJson: z.record(z.unknown()).default({}),
  origin: z.enum(["saved", "template"]).optional().default("saved"),
});

export type CreateSavedReportInput = z.infer<typeof createSavedReportInputSchema>;

export const patchSavedReportInputSchema = createSavedReportInputSchema.partial();

export const createReportScheduleInputSchema = z.object({
  reportDefinitionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  cronExpression: z.string().min(1).max(120),
  timezone: z.string().max(64).optional().nullable(),
  format: z.enum(REPORT_EXPORT_FORMATS).default("csv"),
  recipients: z
    .array(
      z.object({
        email: reportRecipientEmailSchema,
        name: z.string().max(200).optional().nullable(),
      }),
    )
    .max(50)
    .default([]),
  enabled: z.boolean().optional().default(true),
  runInputJson: z.record(z.unknown()).optional().default({}),
});

export type CreateReportScheduleInput = z.infer<typeof createReportScheduleInputSchema>;

export const patchReportScheduleInputSchema = createReportScheduleInputSchema.partial().omit({
  reportDefinitionId: true,
});

export const REPORT_SYNC_ROW_LIMIT = 5_000;
