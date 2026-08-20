/**
 * Read-only projection of a personnel record for the personnel file page.
 *
 * Walks the same section model as Add Person so a field added to the form shows
 * up on the file without a second edit, and drops blanks so an imported record
 * with mostly-null columns does not render pages of dashes.
 */
import {
  PERSONNEL_FORM_SECTIONS,
  type PersonnelField,
  type PersonnelLookupSource,
} from "./personnel-form";
import { formatPpeDateValue } from "./personnel-ppe";
import { personnelLicenseCopies, type LicenseCopies } from "./license-copies";

export type { LicenseCopies };
export { personnelLicenseCopies };
export type PersonnelFileRow = {
  label: string;
  value: string;
  /** Long-form values (textarea) render full width. */
  wide: boolean;
};

export type PersonnelFileGroup = {
  id: string;
  title: string;
  icon?: string;
  rows: PersonnelFileRow[];
};

export type LookupLabelResolver = (
  source: PersonnelLookupSource,
  id: string,
) => string | undefined;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Resolve a personnel location label from FK, stored name, or roster import keys. */
export function resolvePersonnelLocationLabel(
  record: Record<string, unknown>,
  resolveSite?: (siteId: string) => string | undefined,
): string {
  const siteId = str(record.siteId);
  const fromLookup = siteId && resolveSite ? resolveSite(siteId) : "";
  return (
    fromLookup ||
    str(record.siteName) ||
    str(record.site) ||
    str(record.location) ||
    str(record.locationName) ||
    ""
  );
}

/** Hire dates arrive as either a plain date or a timestamp; show the date part. */
export function formatFileDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1]! : value;
}

/**
 * Roster imports append a provenance sentence to Notes on every sync, so a
 * long-tenured person accumulates a paragraph of filenames. The department it
 * repeats is already its own field, so strip both and keep whatever a human
 * actually typed. The filename group tolerates one level of nesting because
 * source files are named like "active_employees_by_department (7-22-26).csv".
 */
const IMPORT_NOTE =
  /synced from employee roster\s*(?:\((?:[^()]|\([^()]*\))*\))?\s*\.?(?:\s*department:\s*\S+)?/gi;

export function stripImportNotes(notes: string): string {
  return notes.replace(IMPORT_NOTE, " ").replace(/\s+/g, " ").trim();
}

function valueFor(
  field: PersonnelField,
  record: Record<string, unknown>,
  resolve?: LookupLabelResolver,
): string {
  if (field.type === "checkbox") {
    return record[field.name] === true ? "Yes" : "";
  }

  if (field.type === "select") {
    const raw = str(record[field.name]);
    if (raw === "") return "";
    const match = field.options?.find((option) => option.value === raw);
    return match?.label ?? raw;
  }

  if (field.type === "lookup") {
    const id = str(record[field.name]);
    const named = field.nameField ? str(record[field.nameField]) : "";
    const resolved = id !== "" && field.source ? (resolve?.(field.source, id) ?? "") : "";
    // Prefer the stored label, then the catalog lookup. Never fall back to the
    // raw uuid: it reads as noise on a printed file.
    if (named || resolved) return named || resolved;
    // Roster imports often stored a free-text site/department name without an FK.
    if (field.source === "sites") {
      return resolvePersonnelLocationLabel(record, (siteId) =>
        field.source ? resolve?.(field.source, siteId) : undefined,
      );
    }
    if (field.source === "departments") {
      return str(record.department) || str(record.departmentName);
    }
    return "";
  }

  const raw = str(record[field.name]);
  if (raw === "") return "";
  if (field.name.endsWith("ExpiresDate")) {
    const issuedKey = field.name.replace(/ExpiresDate$/, "IssuedDate");
    return formatPpeDateValue(raw, new Date(), record[issuedKey]).label;
  }
  if (field.name === "notes") return stripImportNotes(raw);
  return field.type === "date" ? formatFileDate(raw) : raw;
}

function rowsFor(
  fields: readonly PersonnelField[],
  record: Record<string, unknown>,
  resolve: LookupLabelResolver | undefined,
  labelPrefix?: string,
): PersonnelFileRow[] {
  const rows: PersonnelFileRow[] = [];
  for (const field of fields) {
    // Signature and license photos render as images, not text rows.
    if (field.type === "signature" || field.type === "image") continue;
    const value = valueFor(field, record, resolve);
    if (value === "") continue;
    rows.push({
      label: labelPrefix ? `${labelPrefix} ${field.label.toLowerCase()}` : field.label,
      value,
      wide: field.type === "textarea",
    });
  }
  return rows;
}

/** Populated sections of the file, in Add Person order. */
export function buildPersonnelFile(
  record: Record<string, unknown>,
  resolve?: LookupLabelResolver,
): PersonnelFileGroup[] {
  const groups: PersonnelFileGroup[] = [];

  for (const section of PERSONNEL_FORM_SECTIONS) {
    const rows = section.columns
      ? section.columns.flatMap((column) =>
          rowsFor(column.fields, record, resolve, column.title),
        )
      : rowsFor(section.fields ?? [], record, resolve);
    if (rows.length === 0) continue;
    groups.push({
      id: section.id,
      title: section.title,
      ...(section.icon ? { icon: section.icon } : {}),
      rows,
    });
  }

  return groups;
}

/** Signature data URL or hosted URL, when the record has one. */
export function personnelSignature(record: Record<string, unknown>): string | null {
  const value = str(record.signatureUrl);
  return value === "" ? null : value;
}
