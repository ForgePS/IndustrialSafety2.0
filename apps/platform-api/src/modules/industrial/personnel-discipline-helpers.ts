import { ForgeError } from "@forge/errors";

export const DISCIPLINARY_ACTION_TYPES = [
  { code: "COACHING", label: "Documented coaching", defaultPoints: 2 },
  { code: "VERBAL_WARNING", label: "Verbal warning", defaultPoints: 5 },
  { code: "WRITTEN_WARNING", label: "Written warning", defaultPoints: 10 },
  { code: "FINAL_WARNING", label: "Final written warning", defaultPoints: 15 },
  { code: "SUSPENSION", label: "Suspension", defaultPoints: 20 },
  { code: "TERMINATION", label: "Termination", defaultPoints: 25 },
] as const;

export type DisciplinaryActionType = (typeof DISCIPLINARY_ACTION_TYPES)[number]["code"];

export const DISCIPLINARY_CATEGORIES = [
  "SAFETY",
  "PPE",
  "ATTENDANCE",
  "CONDUCT",
  "POLICY",
  "OTHER",
] as const;

export type DisciplinaryCategory = (typeof DISCIPLINARY_CATEGORIES)[number];

/** Every action deducts from the safety score for this long after the action date. */
export const DISCIPLINE_ACTIVE_MONTHS = 12;

export const DISCIPLINE_ATTACHMENT_SOURCE = "INDUSTRIAL_PERSONNEL_DISCIPLINE";

export function disciplineAttachmentObjectKeyPrefix(tenantId: string, actionId: string): string {
  return `tenants/${tenantId}/personnel/discipline/${actionId}/`;
}

export type DisciplineAttachment = {
  documentId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readDisciplineAttachments(raw: unknown): DisciplineAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: DisciplineAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const documentId = String(row.documentId ?? "").trim();
    if (!UUID_PATTERN.test(documentId)) continue;
    out.push({
      documentId,
      fileName: String(row.fileName ?? "").trim() || "Attachment",
      contentType: String(row.contentType ?? "").trim() || "application/octet-stream",
      uploadedAt: String(row.uploadedAt ?? "").trim() || new Date(0).toISOString(),
    });
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: unknown, field: string): string {
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!ISO_DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new ForgeError("VALIDATION_FAILED", `${field} must be a date (YYYY-MM-DD)`);
  }
  return raw;
}

export function disciplinaryActionType(code: unknown) {
  const normalized = String(code ?? "").trim().toUpperCase();
  return DISCIPLINARY_ACTION_TYPES.find((t) => t.code === normalized) ?? null;
}

/** Same as Postgres `date + interval '12 months'` (Feb 29 clamps to Feb 28). */
export function disciplineCountsUntil(actionDate: string): string {
  const d = new Date(`${actionDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + DISCIPLINE_ACTIVE_MONTHS);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export type DisciplinaryActionInput = {
  actionType: DisciplinaryActionType;
  category: DisciplinaryCategory;
  actionDate: string;
  reason: string;
  details: string | null;
  issuedByName: string | null;
  points: number;
  countsUntil: string;
};

/**
 * Validate a create/update body. On update, `existing` supplies values for
 * omitted fields so partial PATCH bodies work. Points and counts-until are
 * always derived from the action type and date; client values are ignored.
 */
export function normalizeDisciplinaryActionInput(
  body: Record<string, unknown>,
  existing?: DisciplinaryActionInput,
): DisciplinaryActionInput {
  const type =
    body.actionType !== undefined
      ? disciplinaryActionType(body.actionType)
      : existing
        ? disciplinaryActionType(existing.actionType)
        : null;
  if (!type) {
    throw new ForgeError(
      "VALIDATION_FAILED",
      `actionType must be one of ${DISCIPLINARY_ACTION_TYPES.map((t) => t.code).join(", ")}`,
    );
  }

  const categoryRaw =
    body.category !== undefined
      ? String(body.category ?? "").trim().toUpperCase()
      : (existing?.category ?? "SAFETY");
  const category = DISCIPLINARY_CATEGORIES.find((c) => c === categoryRaw);
  if (!category) {
    throw new ForgeError(
      "VALIDATION_FAILED",
      `category must be one of ${DISCIPLINARY_CATEGORIES.join(", ")}`,
    );
  }

  const actionDate =
    body.actionDate !== undefined
      ? parseIsoDate(body.actionDate, "actionDate")
      : existing
        ? existing.actionDate
        : parseIsoDate(body.actionDate, "actionDate");

  const reason =
    body.reason !== undefined ? String(body.reason ?? "").trim() : (existing?.reason ?? "");
  if (!reason) {
    throw new ForgeError("VALIDATION_FAILED", "A reason is required");
  }

  const optionalText = (key: "details" | "issuedByName", max: number) => {
    if (body[key] === undefined) return existing?.[key] ?? null;
    const value = String(body[key] ?? "").trim();
    return value ? value.slice(0, max) : null;
  };

  return {
    actionType: type.code,
    category,
    actionDate,
    reason: reason.slice(0, 4000),
    details: optionalText("details", 8000),
    issuedByName: optionalText("issuedByName", 200),
    points: type.defaultPoints,
    countsUntil: disciplineCountsUntil(actionDate),
  };
}

export type DisciplineScoreRow = {
  actionType: string;
  status: string;
  points: number;
  actionDate: string;
};

/**
 * Active = not rescinded, already issued, and within 12 months of the action
 * date. Points come from the action type so stored values cannot drift.
 */
export function disciplinePoints(row: Pick<DisciplineScoreRow, "actionType" | "points">): number {
  return disciplinaryActionType(row.actionType)?.defaultPoints ?? row.points;
}

export function isDisciplineCounting(row: DisciplineScoreRow, now = new Date()): boolean {
  if (row.status !== "ACTIVE" || disciplinePoints(row) <= 0) return false;
  const today = now.toISOString().slice(0, 10);
  if (row.actionDate > today) return false;
  return disciplineCountsUntil(row.actionDate) >= today;
}

export type DisciplineScoreImpact = {
  deduction: number;
  activeCount: number;
  totalCount: number;
};

export function computeDisciplineScoreImpact(
  rows: DisciplineScoreRow[],
  now = new Date(),
): DisciplineScoreImpact {
  let deduction = 0;
  let activeCount = 0;
  for (const row of rows) {
    if (!isDisciplineCounting(row, now)) continue;
    deduction += disciplinePoints(row);
    activeCount += 1;
  }
  return { deduction, activeCount, totalCount: rows.length };
}
