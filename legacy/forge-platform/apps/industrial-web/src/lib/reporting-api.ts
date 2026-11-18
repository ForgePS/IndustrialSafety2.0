/**
 * Industrial Reporting Center client helpers (`/api/v1/reporting`).
 */

import { apiGet, apiSend } from "@forge/web-kit";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export type ReportingOverview = {
  savedReports: number;
  scheduled: number;
  runsThisMonth: number;
  complianceBuiltinCount: number;
  recentExports: number;
  libraryCount: number;
  favorites: number;
};

export type LibraryReportItem = {
  key: string;
  id?: string | null;
  name: string;
  description: string | null;
  module: string | null;
  moduleCode?: string | null;
  category: string | null;
  reportType: string;
  origin: "builtin" | "saved" | "template" | string;
  sourceKey?: string | null;
  tags?: string[];
  isFavorite: boolean;
};

export type ReportColumn = { key: string; label: string };

export type ReportRunResult = {
  executionId: string;
  reportKey: string;
  reportName: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
};

export type ReportRunFields = {
  dateFrom?: string | null;
  dateTo?: string | null;
  relativeDateRange?: "last_7_days" | "last_30_days" | "this_month" | "prior_month" | null;
  year?: number;
  locationId?: string | null;
  departmentId?: string | null;
  fields?: string[];
  groupBy?: string | null;
  aggregate?: "count" | null;
  limit?: number;
  filters?: Record<string, unknown>;
};

export type ReportDatasetField = { key: string; label: string };

export type ReportDataset = {
  key: string;
  name: string;
  description: string;
  category: string;
  module: string;
  reportType: string;
  tags: string[];
  fields: ReportDatasetField[];
  supportsGroupBy: boolean;
};

export const REPORT_RELATIVE_DATE_OPTIONS = [
  { value: "", label: "Custom / none" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "prior_month", label: "Prior month" },
] as const;

export type ReportExportResult = {
  exportId: string;
  executionId: string;
  format: ReportExportFormat;
  filename: string;
  contentType: string;
  contentBase64: string | null;
  storage?: "INLINE" | "S3";
  jobId?: string | null;
  downloadUrl?: string | null;
  byteSize?: number;
};

export type ReportFavoriteRow = {
  id: string;
  reportKey: string | null;
  reportDefinitionId: string | null;
  createdAt: string;
};

export type ReportExecutionRow = {
  id: string;
  reportKey: string;
  reportName: string;
  status: string;
  rowCount: number;
  durationMs: number | null;
  createdAt: string;
  errorMessage?: string | null;
};

export type ReportExportRow = {
  id: string;
  reportKey: string;
  reportName: string;
  format: string;
  filename: string;
  contentType: string;
  byteSize: number;
  status: string;
  executionId: string | null;
  jobId?: string | null;
  storage?: string;
  createdAt: string;
  expiresAt: string | null;
  contentBase64?: string | null;
  artifactInline?: string | null;
};

export type ReportScheduleRow = {
  id: string;
  reportDefinitionId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  format: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  sourceKey?: string | null;
  recipients?: Array<{ email: string; name?: string | null }>;
};

export const WC_WEEKLY_STATUS_REPORT_KEY = "workers_comp.weekly_status";
/** Fridays at 7 AM US Central (12:00 UTC). */
export const WC_WEEKLY_STATUS_DEFAULT_CRON = "0 12 * * 5";

export type ReportShareRow = {
  id: string;
  reportDefinitionId: string;
  sharedWithUserId: string | null;
  sharedWithRoleId: string | null;
  permission: string;
  createdAt: string;
};

export type CreateSavedReportInput = {
  name: string;
  description?: string | null;
  sourceKey: string;
  category?: string | null;
  moduleCode?: string | null;
  payloadJson?: Record<string, unknown>;
  origin?: "saved" | "template";
};

export type CreateScheduleInput = {
  reportDefinitionId: string;
  name: string;
  cronExpression: string;
  timezone?: string | null;
  format?: ReportExportFormat;
  recipients?: Array<{ email: string; name?: string | null }>;
  enabled?: boolean;
  runInputJson?: Record<string, unknown>;
};

export type CreateShareInput = {
  reportDefinitionId: string;
  sharedWithUserId?: string | null;
  sharedWithRoleId?: string | null;
  permission?: "view" | "run" | "export" | "manage";
};

const BASE = "/api/v1/reporting";

export function downloadBase64(filename: string, contentType: string, b64: string): void {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert a date input (YYYY-MM-DD) to an ISO datetime for the API. */
export function toReportDateTime(date: string, endOfDay = false): string | undefined {
  const trimmed = date.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("T")) return trimmed;
  return endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
}

export function formatReportCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function fetchReportingOverview(): Promise<ReportingOverview> {
  return apiGet<ReportingOverview>(`${BASE}/overview`);
}

export async function fetchLibraryReports(filters?: {
  search?: string;
  category?: string;
  module?: string;
  reportType?: string;
}): Promise<{ items: LibraryReportItem[]; total: number }> {
  return apiGet<{ items: LibraryReportItem[]; total: number }>(`${BASE}/reports`, {
    query: {
      search: filters?.search?.trim() || undefined,
      category: filters?.category?.trim() || undefined,
      module: filters?.module?.trim() || undefined,
      reportType: filters?.reportType?.trim() || undefined,
    },
  });
}

export async function fetchReportDatasets(): Promise<{ items: ReportDataset[] }> {
  return apiGet<{ items: ReportDataset[] }>(`${BASE}/datasets`);
}

export async function fetchReportDatasetFields(
  key: string,
): Promise<{ key: string; fields: ReportDatasetField[] }> {
  return apiGet(`${BASE}/datasets/${encodeURIComponent(key)}/fields`);
}

/** Extract numeric series for a simple bar preview (count/value columns). */
export function chartSeriesFromResult(
  result: ReportRunResult,
): Array<{ label: string; value: number }> | null {
  const labelCol =
    result.columns.find((c) => c.key === "status" || c.key === "metric" || c.key === "name") ??
    result.columns[0];
  const valueCol =
    result.columns.find((c) => c.key === "count" || c.key === "value") ??
    result.columns.find((c) => result.rows.some((r) => typeof r[c.key] === "number"));
  if (!labelCol || !valueCol) return null;
  const series = result.rows
    .slice(0, 12)
    .map((row) => ({
      label: String(row[labelCol.key] ?? "—"),
      value: Number(row[valueCol.key] ?? 0),
    }))
    .filter((s) => Number.isFinite(s.value));
  return series.length ? series : null;
}

export async function runReport(key: string, body: ReportRunFields = {}): Promise<ReportRunResult> {
  return apiSend<ReportRunResult>(`${BASE}/reports/${encodeURIComponent(key)}/run`, "POST", body);
}

export async function exportReport(
  key: string,
  body: ReportRunFields & { format: ReportExportFormat },
): Promise<ReportExportResult> {
  return apiSend<ReportExportResult>(
    `${BASE}/reports/${encodeURIComponent(key)}/export`,
    "POST",
    body,
  );
}

export async function createSavedReport(
  body: CreateSavedReportInput,
): Promise<{ id: string; name: string; sourceKey: string; origin?: string }> {
  return apiSend(`${BASE}/reports`, "POST", {
    ...body,
    payloadJson: body.payloadJson ?? {},
  });
}

export async function patchSavedReport(
  id: string,
  body: Partial<CreateSavedReportInput>,
): Promise<{ id: string; updated: boolean }> {
  return apiSend(`${BASE}/reports/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function deleteSavedReport(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiSend(`${BASE}/reports/${encodeURIComponent(id)}`, "DELETE");
}

export async function favoriteReport(
  key: string,
): Promise<{ reportKey: string; favorited: boolean }> {
  return apiSend(`${BASE}/reports/${encodeURIComponent(key)}/favorite`, "POST", {});
}

export async function unfavoriteReport(
  key: string,
): Promise<{ reportKey: string; favorited: boolean }> {
  return apiSend(`${BASE}/reports/${encodeURIComponent(key)}/favorite`, "DELETE");
}

export async function fetchFavorites(): Promise<{ items: ReportFavoriteRow[]; total: number }> {
  return apiGet(`${BASE}/favorites`);
}

export async function fetchHistory(): Promise<{ items: ReportExecutionRow[]; total: number }> {
  return apiGet(`${BASE}/history`);
}

export async function fetchExports(): Promise<{ items: ReportExportRow[]; total: number }> {
  return apiGet(`${BASE}/exports`);
}

export async function requestExportDownload(exportId: string): Promise<{
  exportId: string;
  downloadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
  mode: "S3_PRESIGNED" | "API_STREAM";
  contentType: string;
  filename: string;
}> {
  return apiSend(`${BASE}/exports/${encodeURIComponent(exportId)}/download`, "POST", {});
}

export async function fetchReportingSettings(): Promise<{
  defaultExportFormat: string;
  supportedFormats: string[];
  inlineExportMaxChars: number;
  largeExportStorage: string;
  scheduleCronTimezoneDefault: string;
  emailDelivery: string;
  emailDeliveryNotes?: string;
  permissions: Record<string, boolean>;
}> {
  return apiGet(`${BASE}/settings`);
}

export async function fetchSchedules(): Promise<{ items: ReportScheduleRow[]; total: number }> {
  return apiGet(`${BASE}/schedules`);
}

export async function createSchedule(
  body: CreateScheduleInput,
): Promise<{ id: string; name: string; nextRunAt?: string | null }> {
  return apiSend(`${BASE}/schedules`, "POST", {
    format: "csv",
    recipients: [],
    enabled: true,
    runInputJson: {},
    ...body,
  });
}

export async function patchSchedule(
  id: string,
  body: Partial<Omit<CreateScheduleInput, "reportDefinitionId">>,
): Promise<{ id: string; updated: boolean; nextRunAt?: string | null }> {
  return apiSend(`${BASE}/schedules/${encodeURIComponent(id)}`, "PATCH", body);
}

export async function runDueSchedules(): Promise<{
  processed: number;
  results: Array<{
    scheduleId: string;
    name: string;
    status: "SUCCEEDED" | "FAILED";
    exportId?: string;
    error?: string;
    recipientsQueued?: number;
  }>;
}> {
  return apiSend(`${BASE}/schedules/run-due`, "POST", {});
}

export async function deleteSchedule(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiSend(`${BASE}/schedules/${encodeURIComponent(id)}`, "DELETE");
}

export async function fetchShares(): Promise<{ items: ReportShareRow[]; total: number }> {
  return apiGet(`${BASE}/shares`);
}

export async function createShare(body: CreateShareInput): Promise<{ id: string }> {
  return apiSend(`${BASE}/shares`, "POST", {
    permission: "view",
    ...body,
  });
}

export async function deleteShare(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiSend(`${BASE}/shares/${encodeURIComponent(id)}`, "DELETE");
}

/** Common selectable fields for the custom builder (by source key). */
export const BUILDER_FIELD_OPTIONS: Record<string, Array<{ key: string; label: string }>> = {
  "incidents.summary": [
    { key: "type", label: "Type" },
    { key: "severity", label: "Severity" },
    { key: "status", label: "Status" },
    { key: "count", label: "Count" },
  ],
  "incidents.by_location": [
    { key: "location", label: "Location" },
    { key: "department", label: "Department" },
    { key: "count", label: "Count" },
  ],
  "training.completion": [
    { key: "course", label: "Course" },
    { key: "person", label: "Person" },
    { key: "status", label: "Status" },
    { key: "completedAt", label: "Completed" },
  ],
  "personnel.roster": [
    { key: "name", label: "Name" },
    { key: "location", label: "Location" },
    { key: "department", label: "Department" },
    { key: "role", label: "Role" },
  ],
  "safety.monthly_stats": [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
  ],
  "capa.open": [
    { key: "title", label: "Title" },
    { key: "owner", label: "Owner" },
    { key: "dueDate", label: "Due date" },
    { key: "status", label: "Status" },
  ],
  "fleet.assets": [
    { key: "unitNumber", label: "Unit" },
    { key: "status", label: "Status" },
    { key: "assetType", label: "Type" },
  ],
};
