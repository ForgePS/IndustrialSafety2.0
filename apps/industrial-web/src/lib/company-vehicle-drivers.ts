/**
 * Company vehicle drivers — insurance / MVR roster (Firebase companyVehicleDrivers).
 */

import { matchesSearchTokens } from "@/lib/search-text";
import { parseMvrAuditHistory } from "@/lib/mvr-sample";

export type CompanyVehicleDriverStatus =
  | "pending_mvr"
  | "on_insurance"
  | "suspended"
  | "removed"
  | string;

export type CompanyVehicleDriver = {
  id: string;
  personnelId: string | null;
  personnelName: string;
  employeeNumber: string;
  dateOfBirth: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiryDate: string;
  hasLicenseFront: boolean;
  hasLicenseBack: boolean;
  status: CompanyVehicleDriverStatus;
  initialMvrDate: string;
  lastMvrDate: string;
  nextMvrDueDate: string;
  mvrReleaseDate: string;
  mvrReleaseUploadCount: number;
  mvrUploadCount: number;
  lastMvrUploadAt: string;
  sampleYear: number | null;
  sampleSelectedAt: string;
  sampleCompletedAt: string;
  mvrAuditHistory: Array<{
    year: number;
    auditedAt: string;
    auditedByName: string;
    driverId: string;
    notes: string;
  }>;
  insuranceEffectiveDate: string;
  insuranceRemovedDate: string;
  notes: string;
};

export type CompanyVehicleDriverSummary = {
  total: number;
  onInsurance: number;
  pendingMvr: number;
  suspended: number;
  removed: number;
  missingLicenseExpiry: number;
  licenseExpired: number;
  licenseExpiringSoon: number;
  mvrOnFile: number;
  mvrReleaseOnFile: number;
  sampleYear: number | null;
  sampleSelected: number;
  sampleCompleted: number;
};

export const EMPTY_DRIVER_SUMMARY: CompanyVehicleDriverSummary = {
  total: 0,
  onInsurance: 0,
  pendingMvr: 0,
  suspended: 0,
  removed: 0,
  missingLicenseExpiry: 0,
  licenseExpired: 0,
  licenseExpiringSoon: 0,
  mvrOnFile: 0,
  mvrReleaseOnFile: 0,
  sampleYear: null,
  sampleSelected: 0,
  sampleCompleted: 0,
};

export function companyVehicleDriverStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "on_insurance":
      return "On insurance";
    case "pending_mvr":
      return "Pending MVR";
    case "suspended":
      return "Suspended";
    case "removed":
      return "Removed";
    default:
      return status.trim() || "Unknown";
  }
}

export function companyVehicleDriverStatusBadge(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "on_insurance":
      return "bg-label-success";
    case "pending_mvr":
      return "bg-label-warning";
    case "suspended":
      return "bg-label-danger";
    case "removed":
      return "bg-label-secondary";
    default:
      return "bg-label-primary";
  }
}

export function toCompanyVehicleDriver(row: unknown): CompanyVehicleDriver | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const text = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  const count = (key: string) =>
    typeof r[key] === "number" && Number.isFinite(r[key]) ? (r[key] as number) : 0;
  return {
    id,
    personnelId: typeof r.personnelId === "string" && r.personnelId ? r.personnelId : null,
    personnelName: text("personnelName"),
    employeeNumber: text("employeeNumber"),
    dateOfBirth: text("dateOfBirth"),
    licenseNumber: text("licenseNumber"),
    licenseState: text("licenseState"),
    licenseExpiryDate: text("licenseExpiryDate"),
    hasLicenseFront: r.hasLicenseFront === true,
    hasLicenseBack: r.hasLicenseBack === true,
    status: text("status"),
    initialMvrDate: text("initialMvrDate"),
    lastMvrDate: text("lastMvrDate"),
    nextMvrDueDate: text("nextMvrDueDate"),
    mvrReleaseDate: text("mvrReleaseDate"),
    mvrReleaseUploadCount: count("mvrReleaseUploadCount"),
    mvrUploadCount: count("mvrUploadCount"),
    lastMvrUploadAt: text("lastMvrUploadAt"),
    sampleYear:
      typeof r.sampleYear === "number" && Number.isFinite(r.sampleYear) ? r.sampleYear : null,
    sampleSelectedAt: text("sampleSelectedAt"),
    sampleCompletedAt: text("sampleCompletedAt"),
    mvrAuditHistory: parseMvrAuditHistory(r.mvrAuditHistory),
    insuranceEffectiveDate: text("insuranceEffectiveDate"),
    insuranceRemovedDate: text("insuranceRemovedDate"),
    notes: text("notes"),
  };
}

/** "Front + back", "Front only", "Back only", or "" when nothing is on file. */
export function licenseCopyLabel(driver: CompanyVehicleDriver): string {
  if (driver.hasLicenseFront && driver.hasLicenseBack) return "Front + back";
  if (driver.hasLicenseFront) return "Front only";
  if (driver.hasLicenseBack) return "Back only";
  return "";
}

export function fileCountLabel(count: number): string {
  if (count <= 0) return "";
  return `${count} file${count === 1 ? "" : "s"}`;
}

/** MVR release column: signed date wins, otherwise the uploaded release count. */
export function mvrReleaseLabel(driver: CompanyVehicleDriver): string {
  if (driver.mvrReleaseDate) return driver.mvrReleaseDate;
  return fileCountLabel(driver.mvrReleaseUploadCount);
}

/** Annual 10% sample column, scoped to the most recent sample year. */
export function sampleLabel(driver: CompanyVehicleDriver, sampleYear: number | null): string {
  if (sampleYear === null || driver.sampleYear !== sampleYear) return "";
  if (driver.sampleCompletedAt) return `Audited ${driver.sampleCompletedAt.slice(0, 10)}`;
  return `Selected ${driver.sampleYear}`;
}

/** Drivers selected for a given annual MVR sample year. */
export function driversInMvrSample(
  drivers: readonly CompanyVehicleDriver[],
  sampleYear: number | null,
): CompanyVehicleDriver[] {
  if (sampleYear == null) return [];
  return [...drivers]
    .filter((driver) => driver.sampleYear === sampleYear)
    .sort((a, b) => {
      const aDone = a.sampleCompletedAt ? 1 : 0;
      const bDone = b.sampleCompletedAt ? 1 : 0;
      return (
        aDone - bDone ||
        a.personnelName.localeCompare(b.personnelName, undefined, {
          sensitivity: "base",
          numeric: true,
        })
      );
    });
}

export type LicenseExpiryState = "none" | "ok" | "expiring" | "expired";

export type LicenseIssueKind = "missing" | "expired" | "expiring";

export type LicenseIssueItem = {
  driver: CompanyVehicleDriver;
  kind: LicenseIssueKind;
  reason: string;
};

export function licenseExpiryState(
  driver: CompanyVehicleDriver,
  today = new Date().toISOString().slice(0, 10),
): LicenseExpiryState {
  if (driver.status.toLowerCase() === "removed") return "none";
  if (!driver.licenseExpiryDate) return "none";
  if (driver.licenseExpiryDate < today) return "expired";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return driver.licenseExpiryDate <= soon.toISOString().slice(0, 10) ? "expiring" : "ok";
}

/** Active drivers missing, expired, or soon-to-expire license dates (removed excluded). */
export function driversWithLicenseIssues(
  drivers: readonly CompanyVehicleDriver[],
  today = new Date().toISOString().slice(0, 10),
  kinds?: ReadonlyArray<LicenseIssueKind>,
): LicenseIssueItem[] {
  const allow = kinds ? new Set(kinds) : null;
  const out: LicenseIssueItem[] = [];
  for (const driver of drivers) {
    if (driver.status.toLowerCase() === "removed") continue;
    const state = licenseExpiryState(driver, today);
    let kind: LicenseIssueKind | null = null;
    let reason = "";
    if (!driver.licenseExpiryDate) {
      kind = "missing";
      reason = "Missing license expiration";
    } else if (state === "expired") {
      kind = "expired";
      reason = `Expired ${driver.licenseExpiryDate}`;
    } else if (state === "expiring") {
      kind = "expiring";
      reason = `Expires ${driver.licenseExpiryDate}`;
    }
    if (!kind) continue;
    if (allow && !allow.has(kind)) continue;
    out.push({ driver, kind, reason });
  }
  return out.sort((a, b) => {
    const rank = { expired: 0, missing: 1, expiring: 2 } as const;
    return (
      rank[a.kind] - rank[b.kind] ||
      a.driver.personnelName.localeCompare(b.driver.personnelName, undefined, {
        sensitivity: "base",
        numeric: true,
      })
    );
  });
}

export function toCompanyVehicleDrivers(rows: unknown[]): CompanyVehicleDriver[] {
  return rows.map(toCompanyVehicleDriver).filter((d): d is CompanyVehicleDriver => d !== null);
}

export function toCompanyVehicleDriverSummary(raw: unknown): CompanyVehicleDriverSummary {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DRIVER_SUMMARY };
  const r = raw as Record<string, unknown>;
  const num = (key: keyof CompanyVehicleDriverSummary) =>
    typeof r[key] === "number" && Number.isFinite(r[key]) ? (r[key] as number) : 0;
  return {
    total: num("total"),
    onInsurance: num("onInsurance"),
    pendingMvr: num("pendingMvr"),
    suspended: num("suspended"),
    removed: num("removed"),
    missingLicenseExpiry: num("missingLicenseExpiry"),
    licenseExpired: num("licenseExpired"),
    licenseExpiringSoon: num("licenseExpiringSoon"),
    mvrOnFile: num("mvrOnFile"),
    mvrReleaseOnFile: num("mvrReleaseOnFile"),
    sampleYear:
      typeof r.sampleYear === "number" && Number.isFinite(r.sampleYear) ? r.sampleYear : null,
    sampleSelected: num("sampleSelected"),
    sampleCompleted: num("sampleCompleted"),
  };
}

export function matchesCompanyDriverQuery(driver: CompanyVehicleDriver, query: string): boolean {
  return matchesSearchTokens(
    [
      driver.personnelName,
      driver.employeeNumber,
      driver.licenseNumber,
      driver.licenseState,
      companyVehicleDriverStatusLabel(driver.status),
    ],
    query,
  );
}

export type CompanyDriverSort =
  | "firstName"
  | "lastName"
  | "expired"
  | "pending_mvr"
  | "on_insurance";

export const COMPANY_DRIVER_SORT_OPTIONS: ReadonlyArray<{
  value: CompanyDriverSort;
  label: string;
}> = [
  { value: "firstName", label: "First name (A–Z)" },
  { value: "lastName", label: "Last name (A–Z)" },
  { value: "expired", label: "Expired / missing license" },
  { value: "pending_mvr", label: "Pending MVR" },
  { value: "on_insurance", label: "On insurance" },
];

export const DEFAULT_COMPANY_DRIVER_SORT: CompanyDriverSort = "lastName";

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

function lastWord(value: string): string {
  const words = value.trim().split(/\s+/).filter((w) => w !== "");
  return words.length === 0 ? "" : words[words.length - 1]!;
}

/** Split a display name the way the personnel directory does for A–Z sorts. */
export function driverNameParts(personnelName: string): { first: string; last: string } {
  const name = personnelName.trim();
  return { first: firstWord(name), last: lastWord(name) };
}

function collate(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareByName(a: CompanyVehicleDriver, b: CompanyVehicleDriver, sort: "firstName" | "lastName"): number {
  const aParts = driverNameParts(a.personnelName);
  const bParts = driverNameParts(b.personnelName);
  const [aPrimary, aSecondary] =
    sort === "firstName" ? [aParts.first, aParts.last] : [aParts.last, aParts.first];
  const [bPrimary, bSecondary] =
    sort === "firstName" ? [bParts.first, bParts.last] : [bParts.last, bParts.first];
  return (
    collate(aPrimary, bPrimary) ||
    collate(aSecondary, bSecondary) ||
    collate(a.personnelName, b.personnelName) ||
    collate(a.employeeNumber, b.employeeNumber)
  );
}

/** Expired and missing dates surface first so compliance follow-up is at the top. */
function expiryRank(driver: CompanyVehicleDriver, today: string): number {
  const state = licenseExpiryState(driver, today);
  if (state === "expired") return 0;
  if (!driver.licenseExpiryDate && driver.status.toLowerCase() !== "removed") return 1;
  if (state === "expiring") return 2;
  if (state === "ok") return 3;
  return 4;
}

function statusRank(driver: CompanyVehicleDriver, prefer: "pending_mvr" | "on_insurance"): number {
  return driver.status.toLowerCase() === prefer ? 0 : 1;
}

/**
 * Reorders the loaded driver roster. Name sorts are pure A–Z; compliance sorts
 * pin the matching group to the top and keep last-name order inside each group.
 */
export function sortCompanyVehicleDrivers(
  drivers: readonly CompanyVehicleDriver[],
  sort: CompanyDriverSort,
  today = new Date().toISOString().slice(0, 10),
): CompanyVehicleDriver[] {
  return [...drivers].sort((a, b) => {
    if (sort === "firstName" || sort === "lastName") {
      return compareByName(a, b, sort);
    }
    if (sort === "expired") {
      return expiryRank(a, today) - expiryRank(b, today) || compareByName(a, b, "lastName");
    }
    return statusRank(a, sort) - statusRank(b, sort) || compareByName(a, b, "lastName");
  });
}
