/**
 * PPE allowance tracking: expiration windows, roster summaries, and display helpers.
 */

export const PPE_ALLOWANCE_TERM_YEARS = 1;
export const PPE_EXPIRY_WARNING_DAYS = 30;

export type PpeExpiryStatus = "none" | "ok" | "scheduled" | "expiring_soon" | "expired";

export type PersonnelPpeSummary = {
  prescriptionGlassesCount: number;
  safetyFootwearCount: number;
  prescriptionGlassesExpiringSoon: number;
  safetyFootwearExpiringSoon: number;
  prescriptionGlassesExpired: number;
  safetyFootwearExpired: number;
  expiringWithinDays: number;
};

export const EMPTY_PERSONNEL_PPE_SUMMARY: PersonnelPpeSummary = {
  prescriptionGlassesCount: 0,
  safetyFootwearCount: 0,
  prescriptionGlassesExpiringSoon: 0,
  safetyFootwearExpiringSoon: 0,
  prescriptionGlassesExpired: 0,
  safetyFootwearExpired: 0,
  expiringWithinDays: PPE_EXPIRY_WARNING_DAYS,
};

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Days from today until the expiration date (negative if already expired). */
export function daysUntilPpeExpiry(
  expiresDate: unknown,
  today: Date = new Date(),
): number | null {
  const expires = parseIsoDate(expiresDate);
  if (!expires) return null;
  const msPerDay = 86_400_000;
  return Math.floor(
    (startOfUtcDay(expires).getTime() - startOfUtcDay(today).getTime()) / msPerDay,
  );
}

export function isPpeIssuedInFuture(issuedDate: unknown, today: Date = new Date()): boolean {
  const issued = parseIsoDate(issuedDate);
  if (!issued) return false;
  return startOfUtcDay(issued).getTime() > startOfUtcDay(today).getTime();
}

export function ppeExpiryStatus(
  expiresDate: unknown,
  today: Date = new Date(),
  warningDays = PPE_EXPIRY_WARNING_DAYS,
  issuedDate?: unknown,
): PpeExpiryStatus {
  if (isPpeIssuedInFuture(issuedDate, today)) return "scheduled";
  const days = daysUntilPpeExpiry(expiresDate, today);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= warningDays) return "expiring_soon";
  return "ok";
}

export function ppeExpiryLabel(status: PpeExpiryStatus): string {
  switch (status) {
    case "expired":
      return "Expired";
    case "expiring_soon":
      return `Expiring within ${PPE_EXPIRY_WARNING_DAYS} days`;
    case "scheduled":
      return "Scheduled (post-dated)";
    case "ok":
      return "Current";
    default:
      return "";
  }
}

export function ppeExpiryBadgeClass(status: PpeExpiryStatus): string {
  switch (status) {
    case "expired":
      return "bg-danger";
    case "expiring_soon":
      return "bg-warning text-dark";
    case "scheduled":
      return "bg-info";
    case "ok":
      return "bg-success";
    default:
      return "bg-secondary";
  }
}

/** Format a UTC calendar date as YYYY-MM-DD. */
function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Suggest an expiration one allowance term after the issued date. */
export function suggestPpeExpiresDate(issuedDate: unknown): string {
  const issued = parseIsoDate(issuedDate);
  if (!issued) return "";
  const expires = new Date(
    Date.UTC(
      issued.getUTCFullYear() + PPE_ALLOWANCE_TERM_YEARS,
      issued.getUTCMonth(),
      issued.getUTCDate(),
    ),
  );
  return formatIsoDate(expires);
}

/**
 * Expiration for a new or changed issued date — always one allowance term later.
 * Manual extensions are set by editing the expires field directly.
 */
export function nextPpeExpiresDate(issuedDate: unknown, currentExpires: unknown): string {
  const suggested = suggestPpeExpiresDate(issuedDate);
  if (suggested) return suggested;
  return typeof currentExpires === "string" ? currentExpires.trim() : "";
}

export function formatPpeDateValue(
  expiresDate: unknown,
  today: Date = new Date(),
  issuedDate?: unknown,
): { date: string; status: PpeExpiryStatus; label: string } {
  const raw = typeof expiresDate === "string" ? expiresDate.trim() : "";
  if (raw === "") return { date: "", status: "none", label: "" };
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? raw;
  const status = ppeExpiryStatus(date, today, PPE_EXPIRY_WARNING_DAYS, issuedDate);
  const suffix =
    status === "expired" || status === "expiring_soon" || status === "scheduled"
      ? ppeExpiryLabel(status)
      : "";
  return {
    date,
    status,
    label: suffix ? `${date} (${suffix})` : date,
  };
}

type PpeRow = {
  tracksPrescriptionSafetyGlasses?: boolean | null;
  safetyFootwearClass?: string | null;
  prescriptionSafetyGlassesIssuedDate?: string | null;
  prescriptionSafetyGlassesExpiresDate?: string | null;
  safetyFootwearIssuedDate?: string | null;
  safetyFootwearExpiresDate?: string | null;
};

export function buildPersonnelPpeSummary(
  rows: readonly PpeRow[],
  today: Date = new Date(),
  warningDays = PPE_EXPIRY_WARNING_DAYS,
): PersonnelPpeSummary {
  let prescriptionGlassesCount = 0;
  let safetyFootwearCount = 0;
  let prescriptionGlassesExpiringSoon = 0;
  let safetyFootwearExpiringSoon = 0;
  let prescriptionGlassesExpired = 0;
  let safetyFootwearExpired = 0;

  for (const row of rows) {
    if (row.tracksPrescriptionSafetyGlasses === true) {
      prescriptionGlassesCount += 1;
      const status = ppeExpiryStatus(
        row.prescriptionSafetyGlassesExpiresDate,
        today,
        warningDays,
        row.prescriptionSafetyGlassesIssuedDate,
      );
      if (status === "expiring_soon") prescriptionGlassesExpiringSoon += 1;
      if (status === "expired") prescriptionGlassesExpired += 1;
    }
    const footwearClass =
      typeof row.safetyFootwearClass === "string" ? row.safetyFootwearClass.trim() : "";
    if (footwearClass !== "") {
      safetyFootwearCount += 1;
      const status = ppeExpiryStatus(
        row.safetyFootwearExpiresDate,
        today,
        warningDays,
        row.safetyFootwearIssuedDate,
      );
      if (status === "expiring_soon") safetyFootwearExpiringSoon += 1;
      if (status === "expired") safetyFootwearExpired += 1;
    }
  }

  return {
    prescriptionGlassesCount,
    safetyFootwearCount,
    prescriptionGlassesExpiringSoon,
    safetyFootwearExpiringSoon,
    prescriptionGlassesExpired,
    safetyFootwearExpired,
    expiringWithinDays: warningDays,
  };
}

export function personHasPpeExpiryAlert(record: Record<string, unknown>, today = new Date()): boolean {
  if (record.tracksPrescriptionSafetyGlasses === true) {
    const status = ppeExpiryStatus(
      record.prescriptionSafetyGlassesExpiresDate,
      today,
      PPE_EXPIRY_WARNING_DAYS,
      record.prescriptionSafetyGlassesIssuedDate,
    );
    if (status === "expiring_soon" || status === "expired") return true;
  }
  const footwearClass =
    typeof record.safetyFootwearClass === "string" ? record.safetyFootwearClass.trim() : "";
  if (footwearClass !== "") {
    const status = ppeExpiryStatus(
      record.safetyFootwearExpiresDate,
      today,
      PPE_EXPIRY_WARNING_DAYS,
      record.safetyFootwearIssuedDate,
    );
    if (status === "expiring_soon" || status === "expired") return true;
  }
  return false;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asIsoDate(value: unknown): string {
  const raw = asText(value);
  if (raw === "") return "";
  return /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? "";
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export type PpeExtraPairApproval = {
  approved: boolean;
  approvedBy: string;
  approvedDate: string;
  reason: string;
};

export const EMPTY_PPE_EXTRA_PAIR: PpeExtraPairApproval = {
  approved: false,
  approvedBy: "",
  approvedDate: "",
  reason: "",
};

export function ppeExtraPairApproval(
  approved: unknown,
  approvedBy: unknown,
  approvedDate: unknown,
  reason: unknown,
): PpeExtraPairApproval {
  return {
    approved: asBool(approved),
    approvedBy: asText(approvedBy),
    approvedDate: asIsoDate(approvedDate),
    reason: asText(reason),
  };
}

export function ppeExtraPairHasInfo(approval: PpeExtraPairApproval): boolean {
  return (
    approval.approved ||
    approval.approvedBy !== "" ||
    approval.approvedDate !== "" ||
    approval.reason !== ""
  );
}

export function formatPpeExtraPairSummary(approval: PpeExtraPairApproval): string {
  if (!ppeExtraPairHasInfo(approval)) return "";
  const parts: string[] = [];
  if (approval.approved) parts.push("Approved");
  if (approval.approvedBy) parts.push(`by ${approval.approvedBy}`);
  if (approval.approvedDate) parts.push(`on ${approval.approvedDate}`);
  const lead = parts.join(" ");
  if (approval.reason && lead) return `${lead} — ${approval.reason}`;
  if (approval.reason) return approval.reason;
  return lead;
}

export type PpeAllowancePerson = {
  id: string;
  displayName: string;
  employeeNumber: string;
  tracksGlasses: boolean;
  glassesIssuedDate: string;
  glassesExpiresDate: string;
  glassesExpiryStatus: PpeExpiryStatus;
  glassesExtra: PpeExtraPairApproval;
  footwearClass: string;
  footwearIssuedDate: string;
  footwearExpiresDate: string;
  footwearExpiryStatus: PpeExpiryStatus;
  footwearExtra: PpeExtraPairApproval;
};

export type PpeAllowanceFilter = "all" | "glasses" | "footwear" | "expiring" | "extra-pair";

function ppeDisplayName(row: Record<string, unknown>): string {
  const display = asText(row.displayName);
  if (display) return display;
  const given = asText(row.preferredName) || asText(row.firstName);
  const last = asText(row.lastName);
  if (given && last) return `${given} ${last}`;
  return given || last || asText(row.id);
}

export function personTracksPpeAllowance(row: Record<string, unknown>): boolean {
  if (asBool(row.tracksPrescriptionSafetyGlasses)) return true;
  return asText(row.safetyFootwearClass) !== "";
}

export function toPpeAllowancePerson(
  row: Record<string, unknown>,
  today = new Date(),
): PpeAllowancePerson | null {
  const id = asText(row.id);
  if (!id || !personTracksPpeAllowance(row)) return null;
  const tracksGlasses = asBool(row.tracksPrescriptionSafetyGlasses);
  const glassesIssuedDate = asIsoDate(row.prescriptionSafetyGlassesIssuedDate);
  const glassesExpiresDate = asIsoDate(row.prescriptionSafetyGlassesExpiresDate);
  const footwearClass = asText(row.safetyFootwearClass);
  const footwearIssuedDate = asIsoDate(row.safetyFootwearIssuedDate);
  const footwearExpiresDate = asIsoDate(row.safetyFootwearExpiresDate);
  return {
    id,
    displayName: ppeDisplayName(row),
    employeeNumber: asText(row.employeeNumber),
    tracksGlasses,
    glassesIssuedDate,
    glassesExpiresDate,
    glassesExpiryStatus: tracksGlasses
      ? ppeExpiryStatus(glassesExpiresDate, today, PPE_EXPIRY_WARNING_DAYS, glassesIssuedDate)
      : "none",
    glassesExtra: ppeExtraPairApproval(
      row.prescriptionSafetyGlassesExtraPairApproved,
      row.prescriptionSafetyGlassesExtraPairApprovedBy,
      row.prescriptionSafetyGlassesExtraPairApprovedDate,
      row.prescriptionSafetyGlassesExtraPairReason,
    ),
    footwearClass,
    footwearIssuedDate,
    footwearExpiresDate,
    footwearExpiryStatus:
      footwearClass !== ""
        ? ppeExpiryStatus(footwearExpiresDate, today, PPE_EXPIRY_WARNING_DAYS, footwearIssuedDate)
        : "none",
    footwearExtra: ppeExtraPairApproval(
      row.safetyFootwearExtraPairApproved,
      row.safetyFootwearExtraPairApprovedBy,
      row.safetyFootwearExtraPairApprovedDate,
      row.safetyFootwearExtraPairReason,
    ),
  };
}

export function toPpeAllowancePeople(items: unknown[], today = new Date()): PpeAllowancePerson[] {
  const people: PpeAllowancePerson[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const person = toPpeAllowancePerson(item as Record<string, unknown>, today);
    if (person) people.push(person);
  }
  return people;
}

export function matchesPpeAllowanceQuery(person: PpeAllowancePerson, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const extra = `${formatPpeExtraPairSummary(person.glassesExtra)} ${formatPpeExtraPairSummary(person.footwearExtra)}`;
  const haystack = [
    person.displayName,
    person.employeeNumber,
    person.footwearClass,
    extra,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterPpeAllowancePeople(
  people: readonly PpeAllowancePerson[],
  filter: PpeAllowanceFilter,
): PpeAllowancePerson[] {
  return people.filter((person) => {
    if (filter === "glasses") return person.tracksGlasses;
    if (filter === "footwear") return person.footwearClass !== "";
    if (filter === "expiring") {
      return (
        person.glassesExpiryStatus === "expiring_soon" ||
        person.glassesExpiryStatus === "expired" ||
        person.footwearExpiryStatus === "expiring_soon" ||
        person.footwearExpiryStatus === "expired"
      );
    }
    if (filter === "extra-pair") {
      return ppeExtraPairHasInfo(person.glassesExtra) || ppeExtraPairHasInfo(person.footwearExtra);
    }
    return true;
  });
}

export function sortPpeAllowancePeople(people: readonly PpeAllowancePerson[]): PpeAllowancePerson[] {
  return [...people].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}
