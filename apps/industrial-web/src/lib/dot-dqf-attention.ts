import {
  collapseDotDriverProfiles,
  dotPersonnelId,
  filterDotDqfDriverRows,
  dotRecordTitle,
  dotWorkerName,
} from "./dot-compliance-module";
import { type CompanyVehicleDriver, driversWithLicenseIssues } from "./company-vehicle-drivers";
import { companyDriverMvrConsentOnFile } from "./company-driver-mvr-requirements";
import {
  DQF_WORKSHEET_DOCUMENT_ORDER,
  driverDocumentCopyFieldId,
  dotDqfField,
  filterDriverDqfDocumentFields,
  driverDocumentDateFields,
  isOptionalDqfDocumentKey,
} from "./dot-dqf-fields";
import { isDriverDiabeticEyeExamRequired, isDriverMecRequired } from "./dot-dqf-mec-rules";
import { parseDotFileValues } from "./dot-dqf-files";
import { dotDqfDetailsFromRecord } from "./dot-dqf-record";
import { dvirDefectSummary, isDvirRecord, summarizeDvirList } from "./dvir";

export const DOT_ATTENTION_WARNING_DAYS = 30;

export type DotExpiryState = "none" | "ok" | "expiring" | "expired";

export type DotAttentionKind =
  | "expired"
  | "expiring"
  | "missingDocuments"
  | "missingLicenseCopy"
  | "missingLicenseExpiry"
  | "pendingMvr"
  | "missingMvrConsent"
  | "openDvirDefects";

/** Roster summary counts from GET /api/v1/industrial/fleet/drivers. */
export type FleetDriverAttentionCounts = {
  licenseExpired: number;
  licenseExpiringSoon: number;
  missingLicenseExpiry: number;
  pendingMvr: number;
};

export type DotAttentionIssue = {
  kind: DotAttentionKind;
  recordId: string;
  driverName: string;
  reason: string;
  /** DQF worksheet field or linked form field to open. */
  fieldId?: string | undefined;
  personnelId?: string;
  /** Company roster row vs DQF driver file. */
  source?: "dqf" | "fleet";
};

export type DotDqfAttentionSummary = {
  driverProfiles: number;
  expiredDrivers: number;
  expiringDrivers: number;
  missingDocumentsDrivers: number;
  missingLicenseCopyDrivers: number;
  missingLicenseExpiryDrivers: number;
  pendingMvr: number;
  missingMvrConsent: number;
  openDvirDefects: number;
  issues: DotAttentionIssue[];
};

export type DotAttentionCard = {
  key: DotAttentionKind;
  label: string;
  count: number;
  icon: string;
  tone: "primary" | "info" | "success" | "warning" | "danger" | "secondary";
};

const ATTENTION_CARD_META: Record<
  DotAttentionKind,
  Pick<DotAttentionCard, "label" | "icon" | "tone">
> = {
  expired: { label: "Expired", icon: "bx-error-circle", tone: "danger" },
  expiring: { label: "Expiring soon (30 days)", icon: "bx-time-five", tone: "warning" },
  missingDocuments: { label: "Missing DQF documents", icon: "bx-folder-open", tone: "warning" },
  missingLicenseCopy: { label: "Missing license copy", icon: "bx-id-card", tone: "info" },
  missingLicenseExpiry: {
    label: "Missing license expiration",
    icon: "bx-calendar-x",
    tone: "info",
  },
  pendingMvr: { label: "Pending MVR", icon: "bx-time", tone: "warning" },
  missingMvrConsent: {
    label: "MVR Consent required",
    icon: "bx-file",
    tone: "warning",
  },
  openDvirDefects: { label: "Open DVIR defects", icon: "bx-wrench", tone: "danger" },
};

export const DOT_ATTENTION_KINDS: readonly DotAttentionKind[] = [
  "expired",
  "expiring",
  "missingDocuments",
  "missingLicenseCopy",
  "missingLicenseExpiry",
  "pendingMvr",
  "openDvirDefects",
];

/** Company-driver roster follow-ups shown separately from DOT DQF. */
export const COMPANY_DRIVER_ATTENTION_KINDS: readonly DotAttentionKind[] = [
  "expired",
  "expiring",
  "missingLicenseExpiry",
  "pendingMvr",
  "missingMvrConsent",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function dotDateExpiryState(
  date: string | undefined,
  today = todayIso(),
  warningDays = DOT_ATTENTION_WARNING_DAYS,
): DotExpiryState {
  const value = date?.trim().slice(0, 10) ?? "";
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "none";
  if (value < today) return "expired";
  if (value <= addDaysIso(today, warningDays)) return "expiring";
  return "ok";
}

function hasDqfDate(value: string | undefined): boolean {
  const text = value?.trim() ?? "";
  return text.length > 0;
}

function hasDqfFile(value: string | undefined): boolean {
  return parseDotFileValues(value).length > 0;
}

function isActiveDqfDriver(
  details: Record<string, string>,
  record: Record<string, unknown>,
): boolean {
  const employment = details.employmentStatus?.trim().toLowerCase() ?? "";
  if (employment === "terminated" || employment === "inactive" || employment === "archived") {
    return false;
  }
  const status = String(record.status ?? "")
    .trim()
    .toUpperCase();
  if (status === "TERMINATED" || status === "ARCHIVED" || status === "INACTIVE") {
    return false;
  }
  return true;
}

export type WorksheetDocFields = {
  dateId: string;
  copyId?: string;
  yesNoId?: string;
  reviewsId?: string;
};

export function worksheetDocumentFields(key: string): WorksheetDocFields {
  switch (key) {
    case "driversApplication":
      return {
        dateId: "driversApplicationForEmployment",
        copyId: "driversApplicationCopy",
      };
    case "medicalCert":
      return { dateId: "medicalCertExpiry", copyId: "medicalCertCopy" };
    case "diabeticEyeExam":
      return { dateId: "diabeticEyeExamExpiry", copyId: "diabeticEyeExamCopy" };
    case "dqfReview":
      return {
        dateId: "certificationComplianceDriverLicense",
        yesNoId: "certificationComplianceOnFile",
        reviewsId: "dqfReviews",
      };
    case "medicalExaminerNationalRegistryVerification":
      return {
        dateId: "medicalExaminerNationalRegistryVerification",
        copyId: "medicalExaminerNationalRegistryVerificationCopy",
        yesNoId: "medicalExaminerNationalRegistryVerificationStatus",
      };
    default:
      return { dateId: key, copyId: driverDocumentCopyFieldId(key) };
  }
}

/** True when National Registry verification is satisfied by fields and/or an upload. */
export function isMedicalExaminerNationalRegistryOnFile(details: Record<string, string>): boolean {
  if (hasDqfFile(details.medicalExaminerNationalRegistryVerificationCopy)) return true;
  if (hasDqfDate(details.medicalExaminerNationalRegistryVerification)) return true;
  if (details.medicalExaminerNationalRegistryVerificationStatus?.trim().toLowerCase() === "yes") {
    return true;
  }
  if (details.medicalExaminerRegistrationNumber?.trim()) return true;
  return false;
}

export function isWorksheetDocumentOnFile(details: Record<string, string>, key: string): boolean {
  if (key === "medicalExaminerNationalRegistryVerification") {
    return isMedicalExaminerNationalRegistryOnFile(details);
  }
  const fields = worksheetDocumentFields(key);
  if (hasDqfDate(details[fields.dateId])) return true;
  if (fields.copyId && hasDqfFile(details[fields.copyId])) return true;
  if (fields.yesNoId && details[fields.yesNoId]?.trim().toLowerCase() === "yes") return true;
  if (fields.reviewsId && details[fields.reviewsId]?.trim()) return true;
  return false;
}

/** Document labels and field ids that are not on file for this DRIVER profile. */
export function missingDqfDocumentItems(
  details: Record<string, string>,
  tenantSlug?: string | null,
): Array<{ label: string; fieldId: string }> {
  const mecRequired = isDriverMecRequired(details);
  const visibleDateFields = filterDriverDqfDocumentFields(driverDocumentDateFields(), tenantSlug);
  const visibleDateIds = new Set(visibleDateFields.map((field) => field.id));
  const missing: Array<{ label: string; fieldId: string }> = [];

  if (!hasDqfFile(details.driversLicenseCopy)) {
    missing.push({ label: "DRIVER'S License copy", fieldId: "driversLicenseCopy" });
  }
  if (!hasDqfDate(details.cdlExpiry)) {
    missing.push({ label: "License expiration date", fieldId: "cdlExpiry" });
  }
  if (mecRequired) {
    if (!hasDqfDate(details.medicalCertExpiry)) {
      missing.push({ label: "MEC expiration date", fieldId: "medicalCertExpiry" });
    }
    if (!hasDqfFile(details.medicalCertCopy)) {
      missing.push({ label: "Medical Examiner's Certificate", fieldId: "medicalCertCopy" });
    }
  }
  if (isDriverDiabeticEyeExamRequired(details)) {
    if (!hasDqfDate(details.diabeticEyeExamExpiry)) {
      missing.push({
        label: "Diabetic Eye Exam expiration date",
        fieldId: "diabeticEyeExamExpiry",
      });
    }
    if (!hasDqfFile(details.diabeticEyeExamCopy)) {
      missing.push({ label: "Diabetic Eye Exam", fieldId: "diabeticEyeExamCopy" });
    }
  }

  for (const key of DQF_WORKSHEET_DOCUMENT_ORDER) {
    if (key === "medicalCert" && !mecRequired) continue;
    if (key === "diabeticEyeExam") continue;
    if (isOptionalDqfDocumentKey(key)) continue;
    const fields = worksheetDocumentFields(key);
    if (
      key !== "driversApplication" &&
      key !== "medicalCert" &&
      key !== "dqfReview" &&
      !visibleDateIds.has(fields.dateId)
    ) {
      continue;
    }
    if (isWorksheetDocumentOnFile(details, key)) continue;
    const label =
      key === "driversApplication"
        ? "DOT Application for Employment"
        : key === "medicalCert"
          ? "Medical Examiner's Certificate"
          : key === "dqfReview"
            ? "DQF Review"
            : dotDqfField(fields.dateId).label;
    const fieldId =
      fields.copyId && !hasDqfFile(details[fields.copyId]) ? fields.copyId : fields.dateId;
    if (!missing.some((item) => item.fieldId === fieldId)) {
      missing.push({ label, fieldId });
    }
  }

  return missing;
}

/** @deprecated Use missingDqfDocumentItems for field-aware links. */
export function missingDqfDocumentLabels(
  details: Record<string, string>,
  tenantSlug?: string | null,
): string[] {
  return missingDqfDocumentItems(details, tenantSlug).map((item) => item.label);
}

const TRACKED_EXPIRY_FIELDS: Array<{
  fieldId: string;
  label: string;
  required: (details: Record<string, string>) => boolean;
  date: (details: Record<string, string>, record: Record<string, unknown>) => string;
}> = [
  {
    fieldId: "cdlExpiry",
    label: "License",
    required: () => true,
    date: (details) => details.cdlExpiry?.trim() ?? "",
  },
  {
    fieldId: "medicalCertExpiry",
    label: "MEC",
    required: (details) => isDriverMecRequired(details),
    date: (details) => details.medicalCertExpiry?.trim() ?? "",
  },
  {
    // Tracked whenever a date is entered, even for drivers not flagged diabetic.
    fieldId: "diabeticEyeExamExpiry",
    label: "Diabetic Eye Exam",
    required: () => true,
    date: (details) => details.diabeticEyeExamExpiry?.trim() ?? "",
  },
  {
    fieldId: "mvrAnnual",
    label: "MVR",
    required: () => true,
    date: (details, record) =>
      details.mvrAnnual?.trim() ||
      String(record.nextMvrDueDate ?? "")
        .trim()
        .slice(0, 10),
  },
];

function driverDisplayName(
  record: Record<string, unknown>,
  details: Record<string, string>,
): string {
  return (
    dotWorkerName(record) ||
    dotRecordTitle(record) ||
    details.employeeNumber ||
    String(record.id ?? "DRIVER")
  );
}

function collectDriverAttentionIssues(
  record: Record<string, unknown>,
  details: Record<string, string>,
  today: string,
  tenantSlug?: string | null,
): DotAttentionIssue[] {
  if (!isActiveDqfDriver(details, record)) return [];

  const recordId = String(record.id ?? "");
  const driverName = driverDisplayName(record, details);
  const personnelId = dotPersonnelId(record);
  const issues: DotAttentionIssue[] = [];
  const personRef = personnelId ? { personnelId } : {};

  for (const field of TRACKED_EXPIRY_FIELDS) {
    if (!field.required(details)) continue;
    const expiryDate = field.date(details, record);
    const state = dotDateExpiryState(expiryDate, today);
    if (state === "expired") {
      issues.push({
        kind: "expired",
        recordId,
        driverName,
        ...personRef,
        fieldId: field.fieldId,
        reason: `${field.label} expired ${expiryDate}`.trim(),
        source: "dqf",
      });
    } else if (state === "expiring") {
      issues.push({
        kind: "expiring",
        recordId,
        driverName,
        ...personRef,
        fieldId: field.fieldId,
        reason: `${field.label} expires ${expiryDate}`.trim(),
        source: "dqf",
      });
    }
  }

  if (!hasDqfDate(details.cdlExpiry)) {
    issues.push({
      kind: "missingLicenseExpiry",
      recordId,
      driverName,
      ...personRef,
      fieldId: "cdlExpiry",
      reason: "Missing license expiration date",
      source: "dqf",
    });
  }

  if (!hasDqfFile(details.driversLicenseCopy)) {
    issues.push({
      kind: "missingLicenseCopy",
      recordId,
      driverName,
      ...personRef,
      fieldId: "driversLicenseCopy",
      reason: "Missing DRIVER'S license copy",
      source: "dqf",
    });
  }

  for (const missing of missingDqfDocumentItems(details, tenantSlug)) {
    issues.push({
      kind: "missingDocuments",
      recordId,
      driverName,
      ...personRef,
      fieldId: missing.fieldId,
      reason: `Missing ${missing.label}`,
      source: "dqf",
    });
  }

  return issues;
}

function isLicenseAttentionKind(kind: DotAttentionKind): boolean {
  return kind === "expired" || kind === "expiring" || kind === "missingLicenseExpiry";
}

function licenseAttentionPersonKey(issue: DotAttentionIssue): string {
  return issue.personnelId?.trim() || issue.recordId;
}

function countAttentionIssues(
  issues: readonly DotAttentionIssue[],
  kind: DotAttentionKind,
): number {
  return issues.filter((issue) => issue.kind === kind).length;
}

const ATTENTION_ISSUE_RANK: Record<DotAttentionKind, number> = {
  expired: 0,
  openDvirDefects: 1,
  pendingMvr: 2,
  missingMvrConsent: 3,
  expiring: 4,
  missingLicenseExpiry: 5,
  missingLicenseCopy: 6,
  missingDocuments: 7,
};

function sortAttentionIssues(issues: DotAttentionIssue[]): void {
  issues.sort((a, b) => {
    return (
      ATTENTION_ISSUE_RANK[a.kind] - ATTENTION_ISSUE_RANK[b.kind] ||
      a.driverName.localeCompare(b.driverName, undefined, { sensitivity: "base", numeric: true })
    );
  });
}

export function buildFleetAttentionIssues(
  drivers: readonly CompanyVehicleDriver[],
  today = todayIso(),
): DotAttentionIssue[] {
  const issues: DotAttentionIssue[] = [];

  for (const { driver, kind, reason } of driversWithLicenseIssues(drivers, today)) {
    const attentionKind: DotAttentionKind =
      kind === "missing" ? "missingLicenseExpiry" : kind === "expired" ? "expired" : "expiring";
    const issue: DotAttentionIssue = {
      kind: attentionKind,
      recordId: driver.id,
      driverName: driver.personnelName.trim() || driver.employeeNumber.trim() || driver.id,
      reason,
      fieldId: "cdlExpiry",
      source: "fleet",
    };
    if (driver.personnelId) issue.personnelId = driver.personnelId;
    issues.push(issue);
  }

  for (const driver of drivers) {
    if (driver.status.toLowerCase() === "removed") continue;
    if (driver.status.toLowerCase() !== "pending_mvr") continue;
    const issue: DotAttentionIssue = {
      kind: "pendingMvr",
      recordId: driver.id,
      driverName: driver.personnelName.trim() || driver.employeeNumber.trim() || driver.id,
      reason: "Pending initial MVR",
      fieldId: "mvrReleaseForm",
      source: "fleet",
    };
    if (driver.personnelId) issue.personnelId = driver.personnelId;
    issues.push(issue);
  }

  for (const driver of drivers) {
    if (driver.status.toLowerCase() === "removed") continue;
    if (
      companyDriverMvrConsentOnFile({
        mvrReleaseDate: driver.mvrReleaseDate,
        mvrReleaseUploadCount: driver.mvrReleaseUploadCount,
      })
    ) {
      continue;
    }
    const issue: DotAttentionIssue = {
      kind: "missingMvrConsent",
      recordId: driver.id,
      driverName: driver.personnelName.trim() || driver.employeeNumber.trim() || driver.id,
      reason: "Missing MVR Consent form",
      fieldId: "mvrReleaseForm",
      source: "fleet",
    };
    if (driver.personnelId) issue.personnelId = driver.personnelId;
    issues.push(issue);
  }

  return issues;
}

export function summarizeDotDqfAttention(
  records: readonly Record<string, unknown>[],
  opts?: { tenantSlug?: string | null; today?: string },
): DotDqfAttentionSummary {
  const today = opts?.today ?? todayIso();
  const tenantSlug = opts?.tenantSlug ?? null;
  const driverRows = filterDotDqfDriverRows(records);
  const driverProfiles = collapseDotDriverProfiles(driverRows);

  const missingDocsDriverIds = new Set<string>();
  const missingCopyDriverIds = new Set<string>();
  const missingExpiryDriverIds = new Set<string>();
  const issues: DotAttentionIssue[] = [];

  for (const record of driverProfiles) {
    const details = dotDqfDetailsFromRecord(record);
    const driverIssues = collectDriverAttentionIssues(record, details, today, tenantSlug);
    const recordId = String(record.id ?? "");
    for (const issue of driverIssues) {
      issues.push(issue);
      if (issue.kind === "missingDocuments") missingDocsDriverIds.add(recordId);
      if (issue.kind === "missingLicenseCopy") missingCopyDriverIds.add(recordId);
      if (issue.kind === "missingLicenseExpiry") missingExpiryDriverIds.add(recordId);
    }
  }

  const dvirSummary = summarizeDvirList(records);
  if (dvirSummary.openDefects > 0) {
    for (const row of records) {
      if (!isDvirRecord(row)) continue;
      const status = String(row.status ?? "").toUpperCase();
      if (status === "CLOSED" || status === "ARCHIVED" || status === "COMPLETED") continue;
      const defects = dvirDefectSummary(row);
      if (!defects.hasDefects) continue;
      issues.push({
        kind: "openDvirDefects",
        recordId: String(row.id ?? ""),
        driverName: String(row.vehicleNumber ?? row.title ?? "DVIR"),
        reason: defects.text || "Open defects need disposition",
        source: "dqf",
      });
    }
  }

  issues.sort((a, b) => {
    return (
      ATTENTION_ISSUE_RANK[a.kind] - ATTENTION_ISSUE_RANK[b.kind] ||
      a.driverName.localeCompare(b.driverName, undefined, { sensitivity: "base", numeric: true })
    );
  });

  return {
    driverProfiles: driverProfiles.length,
    expiredDrivers: countAttentionIssues(issues, "expired"),
    expiringDrivers: countAttentionIssues(issues, "expiring"),
    missingDocumentsDrivers: missingDocsDriverIds.size,
    missingLicenseCopyDrivers: missingCopyDriverIds.size,
    missingLicenseExpiryDrivers: missingExpiryDriverIds.size,
    pendingMvr: 0,
    missingMvrConsent: 0,
    openDvirDefects: dvirSummary.openDefects,
    issues,
  };
}

/** Company-driver roster attention — insurance/MVR roster, not DOT DQF files. */
export function summarizeCompanyDriverAttention(
  drivers: readonly CompanyVehicleDriver[],
  opts?: { today?: string },
): DotDqfAttentionSummary {
  const issues = buildFleetAttentionIssues(drivers, opts?.today ?? todayIso());
  sortAttentionIssues(issues);
  const activeDrivers = drivers.filter((driver) => driver.status.toLowerCase() !== "removed");

  return {
    driverProfiles: activeDrivers.length,
    expiredDrivers: countAttentionIssues(issues, "expired"),
    expiringDrivers: countAttentionIssues(issues, "expiring"),
    missingDocumentsDrivers: 0,
    missingLicenseCopyDrivers: 0,
    missingLicenseExpiryDrivers: countAttentionIssues(issues, "missingLicenseExpiry"),
    pendingMvr: countAttentionIssues(issues, "pendingMvr"),
    missingMvrConsent: countAttentionIssues(issues, "missingMvrConsent"),
    openDvirDefects: 0,
    issues,
  };
}

/** @deprecated Use separate DQF and company-driver summaries instead of merging. */
export function withFleetDriverAttentionIssues(
  summary: DotDqfAttentionSummary,
  drivers: readonly CompanyVehicleDriver[],
  opts?: { today?: string },
): DotDqfAttentionSummary {
  const dqfLicenseKeys = new Set(
    summary.issues
      .filter((issue) => issue.source !== "fleet" && isLicenseAttentionKind(issue.kind))
      .map(licenseAttentionPersonKey),
  );
  const fleetIssues = buildFleetAttentionIssues(drivers, opts?.today ?? todayIso()).filter(
    (issue) => {
      if (issue.fieldId !== "cdlExpiry") return true;
      return !dqfLicenseKeys.has(licenseAttentionPersonKey(issue));
    },
  );
  if (fleetIssues.length === 0) return summary;

  const issues = [...summary.issues, ...fleetIssues];
  sortAttentionIssues(issues);

  return {
    ...summary,
    issues,
    expiredDrivers: countAttentionIssues(issues, "expired"),
    expiringDrivers: countAttentionIssues(issues, "expiring"),
    missingLicenseExpiryDrivers: countAttentionIssues(issues, "missingLicenseExpiry"),
    pendingMvr: countAttentionIssues(issues, "pendingMvr"),
    missingMvrConsent: countAttentionIssues(issues, "missingMvrConsent"),
  };
}

export function dotAttentionTotalCount(summary: DotDqfAttentionSummary): number {
  return (
    summary.expiredDrivers +
    summary.expiringDrivers +
    summary.missingDocumentsDrivers +
    summary.missingLicenseCopyDrivers +
    summary.missingLicenseExpiryDrivers +
    summary.pendingMvr +
    summary.missingMvrConsent +
    summary.openDvirDefects
  );
}

export function buildDotAttentionCards(
  summary: DotDqfAttentionSummary,
  kinds: readonly DotAttentionKind[] = DOT_ATTENTION_KINDS,
): DotAttentionCard[] {
  const counts: Record<DotAttentionKind, number> = {
    expired: countAttentionIssues(summary.issues, "expired"),
    expiring: countAttentionIssues(summary.issues, "expiring"),
    missingDocuments: summary.missingDocumentsDrivers,
    missingLicenseCopy: summary.missingLicenseCopyDrivers,
    missingLicenseExpiry: summary.missingLicenseExpiryDrivers,
    pendingMvr: summary.pendingMvr,
    missingMvrConsent: countAttentionIssues(summary.issues, "missingMvrConsent"),
    openDvirDefects: summary.openDvirDefects,
  };
  return kinds.map((key) => ({
    key,
    count: counts[key],
    ...ATTENTION_CARD_META[key],
  }));
}

export function buildCompanyDriverAttentionCards(
  summary: DotDqfAttentionSummary,
): DotAttentionCard[] {
  return buildDotAttentionCards(summary, COMPANY_DRIVER_ATTENTION_KINDS);
}

export function driverMatchesAttentionFilter(
  record: Record<string, unknown>,
  filter: DotAttentionKind,
  opts?: { tenantSlug?: string | null; today?: string },
): boolean {
  if (filter === "openDvirDefects" || filter === "pendingMvr" || filter === "missingMvrConsent") {
    return false;
  }
  const details = dotDqfDetailsFromRecord(record);
  const issues = collectDriverAttentionIssues(
    record,
    details,
    opts?.today ?? todayIso(),
    opts?.tenantSlug ?? null,
  );
  return issues.some((issue) => issue.kind === filter);
}

export function attentionIssuesForFilter(
  issues: readonly DotAttentionIssue[],
  filter: DotAttentionKind | null,
  source?: DotAttentionIssue["source"],
): DotAttentionIssue[] {
  let filtered = filter ? issues.filter((issue) => issue.kind === filter) : [...issues];
  if (source) {
    filtered = filtered.filter((issue) => (issue.source ?? "dqf") === source);
  }
  return filtered;
}

/** DQF attention rows for one Drivers (DQF) list profile. */
export function attentionIssuesForRecord(
  issues: readonly DotAttentionIssue[],
  recordId: string,
): DotAttentionIssue[] {
  const id = recordId.trim();
  if (!id) return [];
  return issues.filter(
    (issue) =>
      issue.recordId === id &&
      (issue.source ?? "dqf") === "dqf" &&
      issue.kind !== "openDvirDefects",
  );
}

function daysAgoLabel(isoDate: string, today: string): string | null {
  const day = isoDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today) return null;
  const start = Date.parse(`${day}T12:00:00Z`);
  const end = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = Math.max(0, Math.round((end - start) / 86_400_000));
  return `${days} day(s) ago`;
}

/**
 * One-line follow-up for the Drivers list under the person's name.
 * Example: "MEC expired on 8/5/2026 (28 day(s) ago) (+2 more)"
 */
export function formatDriverListAttentionLine(
  issues: readonly DotAttentionIssue[],
  opts?: { today?: string },
): string | null {
  if (issues.length === 0) return null;
  const today = opts?.today ?? todayIso();
  const ranked = [...issues].sort(
    (a, b) =>
      ATTENTION_ISSUE_RANK[a.kind] - ATTENTION_ISSUE_RANK[b.kind] ||
      a.reason.localeCompare(b.reason, undefined, { sensitivity: "base" }),
  );
  const primary = ranked[0]!;
  let text = primary.reason;
  if (primary.kind === "expired") {
    const dateMatch = primary.reason.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch?.[1]) {
      const ago = daysAgoLabel(dateMatch[1], today);
      const label = primary.reason.replace(/\s+\d{4}-\d{2}-\d{2}.*/, "").trim();
      const onDate = new Date(`${dateMatch[1]}T12:00:00`).toLocaleDateString();
      text = ago ? `${label} expired on ${onDate} (${ago})` : `${label} expired on ${onDate}`;
    }
  } else if (primary.kind === "expiring") {
    const dateMatch = primary.reason.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch?.[1]) {
      const label = primary.reason.replace(/\s+\d{4}-\d{2}-\d{2}.*/, "").trim();
      const onDate = new Date(`${dateMatch[1]}T12:00:00`).toLocaleDateString();
      text = `${label} expires on ${onDate}`;
    }
  }
  const more = ranked.length - 1;
  if (more > 0) text = `${text} (+${more} more)`;
  return text;
}
