export const LOTO_ENERGY_TYPES = [
  "Electrical",
  "Mechanical",
  "Hydraulic",
  "Pneumatic",
  "Chemical",
  "Thermal",
  "Gravity",
  "Stored energy",
  "Other",
] as const;

export const LOTO_PROCEDURE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
] as const;

export const LOTO_LOCKOUT_STATUSES = ["ISSUED", "VERIFIED", "CLOSED"] as const;

export type LotoTab = "procedures" | "lockouts";

export type LotoStats = {
  procedures: number;
  drafts: number;
  active: number;
  reviews: number;
  openLockouts: number;
};

function upper(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function lotoStatusBadgeClass(status: string): string {
  const key = upper(status);
  if (key === "ACTIVE" || key === "APPROVED" || key === "VERIFIED" || key === "COMPLETED") {
    return "bg-label-success";
  }
  if (key === "IN_REVIEW" || key === "PENDING_APPROVAL" || key === "SUBMITTED") {
    return "bg-label-warning";
  }
  if (key === "ISSUED" || key === "OPEN") return "bg-label-info";
  if (key === "DRAFT") return "bg-label-secondary";
  if (key === "CLOSED" || key === "ARCHIVED") return "bg-label-secondary";
  return "bg-label-secondary";
}

export function lotoStatusLabel(status: string): string {
  const key = upper(status);
  if (key === "IN_REVIEW") return "In review";
  if (key === "PENDING_APPROVAL") return "Pending approval";
  if (!key) return "Unknown";
  return key.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function lotoPhaseBadgeClass(phase: string): string {
  const key = upper(phase);
  if (key === "VERIFICATION") return "bg-label-warning";
  if (key === "ISOLATION" || key === "SHUTDOWN") return "bg-label-danger";
  if (key === "RESTART") return "bg-label-success";
  return "bg-label-secondary";
}

export function canIssueLockout(status: string): boolean {
  const key = upper(status);
  return key === "ACTIVE" || key === "APPROVED";
}

export function lotoStats(
  procedures: ReadonlyArray<{ status?: unknown }>,
  lockouts: ReadonlyArray<{ status?: unknown }> = [],
): LotoStats {
  const drafts = procedures.filter((row) => upper(row.status) === "DRAFT").length;
  const active = procedures.filter((row) => upper(row.status) === "ACTIVE").length;
  const reviews = procedures.filter((row) => {
    const status = upper(row.status);
    return status === "IN_REVIEW" || status === "PENDING_APPROVAL" || status === "REVIEW_DUE";
  }).length;
  const openLockouts = lockouts.filter((row) => {
    const status = upper(row.status);
    return status === "ISSUED" || status === "VERIFIED" || status === "OPEN";
  }).length;
  return {
    procedures: procedures.length,
    drafts,
    active,
    reviews,
    openLockouts,
  };
}
