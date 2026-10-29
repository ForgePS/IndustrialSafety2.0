import {
  collapseDotDriverProfiles,
  dotLocationText,
  dotRecordTitle,
  dotWorkerName,
  filterDotDqfDriverRows,
} from "./dot-compliance-module";
import {
  isWorksheetDocumentOnFile,
  worksheetDocumentFields,
  dotDateExpiryState,
  type DotExpiryState,
} from "./dot-dqf-attention";
import {
  DQF_WORKSHEET_DOCUMENT_ORDER,
  dotDqfField,
  driverDocumentDateFields,
  filterDriverDqfDocumentFields,
  isOptionalDqfDocumentKey,
} from "./dot-dqf-fields";
import { isDriverDiabeticEyeExamRequired, isDriverMecRequired } from "./dot-dqf-mec-rules";
import { parseDotFileValues } from "./dot-dqf-files";
import { dotDqfDetailsFromRecord } from "./dot-dqf-record";

export type DqfDocumentStatus = "on_file" | "missing" | "expired" | "expiring" | "na";

export type DqfDriverSeverity = "critical" | "warning" | "ok";

export type DqfComplianceDocumentCell = {
  key: string;
  label: string;
  status: DqfDocumentStatus;
  date: string;
  copyOnFile: boolean;
};

export type DqfComplianceColumn = {
  key: string;
  label: string;
};

export type DqfComplianceDriverRow = {
  recordId: string;
  driverName: string;
  employeeNumber: string;
  location: string;
  severity: DqfDriverSeverity;
  documents: DqfComplianceDocumentCell[];
};

export type DqfComplianceReport = {
  drivers: number;
  critical: number;
  warning: number;
  missing: number;
  expired: number;
  expiringSoon: number;
  columns: DqfComplianceColumn[];
  rows: DqfComplianceDriverRow[];
};

const LICENSE_COLUMN: DqfComplianceColumn = {
  key: "driversLicense",
  label: "DRIVER'S License",
};

function hasDate(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasCopy(value: string | undefined): boolean {
  return parseDotFileValues(value).length > 0;
}

function documentLabel(key: string): string {
  if (key === "driversLicense") return LICENSE_COLUMN.label;
  if (key === "driversApplication") return "DOT Application for Employment";
  if (key === "medicalCert") return "Medical Examiner's Certificate";
  if (key === "diabeticEyeExam") return "Diabetic Eye Exam";
  if (key === "dqfReview") return "DQF Review";
  return dotDqfField(worksheetDocumentFields(key).dateId).label;
}

function isWorksheetColumnVisible(key: string, tenantSlug?: string | null): boolean {
  if (
    key === "driversApplication" ||
    key === "medicalCert" ||
    key === "diabeticEyeExam" ||
    key === "dqfReview"
  ) {
    return true;
  }
  const dateId = worksheetDocumentFields(key).dateId;
  const visible = new Set(
    filterDriverDqfDocumentFields(driverDocumentDateFields(), tenantSlug).map((field) => field.id),
  );
  return visible.has(dateId);
}

export function dqfComplianceColumns(tenantSlug?: string | null): DqfComplianceColumn[] {
  const columns: DqfComplianceColumn[] = [LICENSE_COLUMN];
  for (const key of DQF_WORKSHEET_DOCUMENT_ORDER) {
    if (!isWorksheetColumnVisible(key, tenantSlug)) continue;
    columns.push({ key, label: documentLabel(key) });
  }
  return columns;
}

function documentExpiry(date: string, today?: string): DotExpiryState {
  return today ? dotDateExpiryState(date, today) : dotDateExpiryState(date);
}

function expiryStatus(state: DotExpiryState, onFile: boolean): DqfDocumentStatus {
  if (state === "expired") return "expired";
  if (state === "expiring") return "expiring";
  if (onFile || state === "ok") return "on_file";
  return "missing";
}

function licenseCell(details: Record<string, string>, today?: string): DqfComplianceDocumentCell {
  const date = details.cdlExpiry?.trim() ?? "";
  const copyOnFile = hasCopy(details.driversLicenseCopy);
  const onFile = hasDate(date) || copyOnFile;
  return {
    key: LICENSE_COLUMN.key,
    label: LICENSE_COLUMN.label,
    status: expiryStatus(documentExpiry(date, today), onFile),
    date,
    copyOnFile,
  };
}

function worksheetCell(
  key: string,
  details: Record<string, string>,
  record: Record<string, unknown>,
  opts?: { tenantSlug?: string | null; today?: string },
): DqfComplianceDocumentCell {
  const label = documentLabel(key);
  const fields = worksheetDocumentFields(key);
  const mecRequired = isDriverMecRequired(details);

  if (key === "medicalCert" && !mecRequired) {
    return { key, label, status: "na", date: "", copyOnFile: false };
  }
  if (!isWorksheetColumnVisible(key, opts?.tenantSlug)) {
    return { key, label, status: "na", date: "", copyOnFile: false };
  }

  const copyOnFile = fields.copyId ? hasCopy(details[fields.copyId]) : false;
  const date =
    key === "mvrAnnual"
      ? details.mvrAnnual?.trim() ||
        String(record.nextMvrDueDate ?? "")
          .trim()
          .slice(0, 10)
      : (details[fields.dateId]?.trim() ?? "");
  const onFile = isWorksheetDocumentOnFile(details, key);

  if (key === "medicalCert" || key === "mvrAnnual") {
    return {
      key,
      label,
      status: expiryStatus(documentExpiry(date, opts?.today), onFile),
      date,
      copyOnFile,
    };
  }

  if (key === "diabeticEyeExam") {
    const required = isDriverDiabeticEyeExamRequired(details);
    if (!required && !onFile) {
      return { key, label, status: "na", date, copyOnFile };
    }
    const state = documentExpiry(date, opts?.today);
    const status: DqfDocumentStatus =
      state !== "expired" && required && !copyOnFile ? "missing" : expiryStatus(state, onFile);
    return { key, label, status, date, copyOnFile };
  }

  if (!onFile && isOptionalDqfDocumentKey(key)) {
    return { key, label, status: "na", date, copyOnFile };
  }

  return {
    key,
    label,
    status: onFile ? "on_file" : "missing",
    date,
    copyOnFile,
  };
}

function driverSeverity(documents: readonly DqfComplianceDocumentCell[]): DqfDriverSeverity {
  if (documents.some((doc) => doc.status === "expired")) return "critical";
  if (documents.some((doc) => doc.status === "expiring")) return "warning";
  return "ok";
}

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

export function buildDqfComplianceReport(
  records: readonly Record<string, unknown>[],
  opts?: { tenantSlug?: string | null; today?: string },
): DqfComplianceReport {
  const tenantSlug = opts?.tenantSlug ?? null;
  const columns = dqfComplianceColumns(tenantSlug);
  const profiles = collapseDotDriverProfiles(filterDotDqfDriverRows(records));

  const rows: DqfComplianceDriverRow[] = profiles.map((record) => {
    const details = dotDqfDetailsFromRecord(record);
    const documents = columns.map((column) =>
      column.key === LICENSE_COLUMN.key
        ? licenseCell(details, opts?.today)
        : worksheetCell(column.key, details, record, {
            tenantSlug,
            ...(opts?.today ? { today: opts.today } : {}),
          }),
    );
    return {
      recordId: String(record.id ?? ""),
      driverName: driverDisplayName(record, details),
      employeeNumber: details.employeeNumber?.trim() || String(record.employeeNumber ?? "").trim(),
      location: details.locationDepartment?.trim() || dotLocationText(record),
      severity: driverSeverity(documents),
      documents,
    };
  });

  rows.sort((a, b) =>
    a.driverName.localeCompare(b.driverName, undefined, { sensitivity: "base", numeric: true }),
  );

  let expired = 0;
  let expiringSoon = 0;
  let missing = 0;
  let critical = 0;
  let warning = 0;
  for (const row of rows) {
    if (row.severity === "critical") critical += 1;
    if (row.severity === "warning") warning += 1;
    if (row.documents.some((doc) => doc.status === "missing")) missing += 1;
    expired += row.documents.filter((doc) => doc.status === "expired").length;
    expiringSoon += row.documents.filter((doc) => doc.status === "expiring").length;
  }

  return {
    drivers: rows.length,
    critical,
    warning,
    missing,
    expired,
    expiringSoon,
    columns,
    rows,
  };
}

export function formatDqfComplianceStats(
  report: Pick<
    DqfComplianceReport,
    "drivers" | "critical" | "warning" | "missing" | "expired" | "expiringSoon"
  >,
): string {
  return [
    `${report.drivers} drivers`,
    `${report.critical} critical`,
    `${report.warning} warning`,
    `${report.missing} missing`,
    `${report.expired} expired`,
    `${report.expiringSoon} expiring soon`,
  ].join(" · ");
}

export function formatDqfDocumentStatus(cell: DqfComplianceDocumentCell): string {
  switch (cell.status) {
    case "na":
      return "N/A";
    case "missing":
      return "Missing";
    case "expired":
      return cell.date ? `Expired ${cell.date}` : "Expired";
    case "expiring":
      return cell.date ? `Expiring ${cell.date}` : "Expiring";
    case "on_file":
      return cell.copyOnFile ? "Copy on file" : "On file";
  }
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildDqfComplianceCsv(report: DqfComplianceReport): string {
  const headers = [
    "Driver",
    "Employee #",
    "Location",
    "Severity",
    ...report.columns.map((column) => column.label),
    ...report.columns.map((column) => `${column.label} copy`),
  ];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of report.rows) {
    const byKey = new Map(row.documents.map((doc) => [doc.key, doc]));
    const statusCells = report.columns.map((column) => {
      const cell = byKey.get(column.key);
      return formatDqfDocumentStatus(
        cell ?? {
          key: column.key,
          label: column.label,
          status: "missing",
          date: "",
          copyOnFile: false,
        },
      );
    });
    const copyCells = report.columns.map((column) => {
      const cell = byKey.get(column.key);
      if (!cell || cell.status === "na") return "N/A";
      return cell.copyOnFile ? "Yes" : "No";
    });
    lines.push(
      [row.driverName, row.employeeNumber, row.location, row.severity, ...statusCells, ...copyCells]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadDqfComplianceCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function dqfRowIssueSummary(row: DqfComplianceDriverRow): string {
  const parts: string[] = [];
  for (const doc of row.documents) {
    if (doc.status === "expired" || doc.status === "expiring" || doc.status === "missing") {
      parts.push(`${doc.label}: ${formatDqfDocumentStatus(doc)}`);
    }
  }
  return parts.join("; ");
}
