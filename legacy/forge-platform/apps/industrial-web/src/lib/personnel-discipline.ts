/** Mirrors apps/platform-api personnel-discipline-helpers. */
export const DISCIPLINARY_ACTION_TYPES = [
  { code: "COACHING", label: "Documented coaching", defaultPoints: 2 },
  { code: "VERBAL_WARNING", label: "Verbal warning", defaultPoints: 5 },
  { code: "WRITTEN_WARNING", label: "Written warning", defaultPoints: 10 },
  { code: "FINAL_WARNING", label: "Final written warning", defaultPoints: 15 },
  { code: "SUSPENSION", label: "Suspension", defaultPoints: 20 },
  { code: "TERMINATION", label: "Termination", defaultPoints: 25 },
] as const;

export const DISCIPLINARY_CATEGORIES = [
  { code: "SAFETY", label: "Safety violation" },
  { code: "PPE", label: "PPE" },
  { code: "ATTENDANCE", label: "Attendance" },
  { code: "CONDUCT", label: "Conduct" },
  { code: "POLICY", label: "Policy" },
  { code: "OTHER", label: "Other" },
] as const;

/** Every action counts against the safety score for this long after the action date. */
export const DISCIPLINE_ACTIVE_MONTHS = 12;

export type DisciplineAttachment = {
  documentId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export type DisciplinaryAction = {
  id: string;
  personnelId: string;
  actionType: string;
  actionTypeLabel: string;
  category: string;
  actionDate: string;
  reason: string;
  details: string | null;
  issuedByName: string | null;
  points: number;
  countsUntil: string;
  status: "ACTIVE" | "RESCINDED" | string;
  countingAgainstScore: boolean;
  attachments?: DisciplineAttachment[];
  rescindedAt: string | null;
  rescindedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DisciplinaryActionsResponse = {
  personnelId: string;
  impact: { deduction: number; activeCount: number; totalCount: number };
  items: DisciplinaryAction[];
};

export function pointsForAction(actionType: string): number {
  return DISCIPLINARY_ACTION_TYPES.find((t) => t.code === actionType)?.defaultPoints ?? 0;
}

export function disciplineCategoryLabel(code: string): string {
  return DISCIPLINARY_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

/** Action date + 12 months; Feb 29 clamps to Feb 28 like the API. */
export function disciplineCountsUntil(actionDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actionDate)) return "";
  const d = new Date(`${actionDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + DISCIPLINE_ACTIVE_MONTHS);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function disciplineStatusLabel(action: DisciplinaryAction): string {
  if (action.status === "RESCINDED") return "Rescinded";
  if (action.countingAgainstScore) return `−${action.points} pts`;
  return "Expired";
}

export function disciplineStatusBadgeClass(action: DisciplinaryAction): string {
  if (action.status === "RESCINDED") return "bg-label-secondary";
  if (action.countingAgainstScore) return "bg-label-danger";
  return "bg-label-info";
}
