/**
 * Alias-based column auto-mapping for spreadsheet imports.
 * Maps common business headers to Forge target fields without requiring
 * users to edit their source files first.
 */

import type { ColumnMapper, ColumnMapping, StagedRow, TargetSchema } from "../interfaces.js";

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[#]/g, " number ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Common aliases → canonical target field keys used across Forge import schemas. */
export const COLUMN_ALIAS_GROUPS: Record<string, string[]> = {
  display_name: [
    "employee name",
    "employee",
    "name",
    "full name",
    "person name",
    "worker name",
    "display name",
  ],
  employee_number: [
    "emp number",
    "emp #",
    "employee #",
    "employee number",
    "employee id",
    "emp id",
    "badge",
    "badge #",
    "badge number",
    "personnel number",
  ],
  email: ["email", "e mail", "work email", "email address", "company email"],
  phone: ["cell", "cell phone", "mobile", "mobile phone", "phone", "telephone", "work phone"],
  department: ["dept", "department", "department name", "org unit"],
  position: ["job", "job title", "position", "title", "role", "job position"],
  employment_type: [
    "employment type",
    "emp type",
    "worker type",
    "status type",
    "full time part time",
  ],
  hire_date: ["hire date", "hired", "start date", "date hired", "employment start"],
  supervisor: ["supervisor", "manager", "reports to", "supervisor name"],
  location: ["location", "site", "facility", "work location", "location name"],
  first_name: ["first name", "given name", "fname"],
  last_name: ["last name", "surname", "family name", "lname"],
  year: ["year", "model year", "vehicle year"],
  make: ["make", "manufacturer", "brand"],
  model: ["model", "vehicle model"],
  color: ["color", "colour"],
  vin: ["vin", "vin number", "vehicle identification number"],
  license_plate: ["license", "licence", "license plate", "plate", "tag"],
  renewal_date: ["renewal date", "renewal", "registration renewal", "expires"],
  county_assessed: ["county assessed", "county", "assessed county"],
  insured: ["insured", "insurance", "is insured"],
  mileage: ["mileage", "odometer", "miles"],
  notes: ["notes", "comments", "remark", "remarks"],
  vehicle_fringe: ["not on vehicle fringe ss", "vehicle fringe", "fringe", "vehicle fringe ss"],
  assigned_driver: ["assigned driver", "driver", "driver name"],
  name: [
    "name",
    "department name",
    "dept name",
    "department",
    "site name",
    "position name",
    "job title",
    "employment type",
    "employment type name",
  ],
  description: ["description", "desc", "details"],
  site: ["site", "location", "facility", "site name", "work location"],
  site_key: ["site key", "site code", "location key", "facility code"],
  timezone: ["timezone", "time zone", "tz", "iana timezone"],
  division_name: ["division", "division name", "business unit"],
  contact_name: ["contact", "contact name", "dept contact"],
  contact_email: ["contact email", "dept email"],
  title: ["title", "course", "course title", "training", "training title"],
  course_name: ["course name", "class name"],
  completed_at: ["completed", "completed at", "completion date", "date completed", "training date"],
  expires_at: ["expires", "expires at", "expiration", "expiration date", "expiry"],
  course_code: ["course code", "class code", "training code"],
  instructor_name: ["instructor", "instructor name", "trainer", "trainer name"],
};

export function resolveAliasTarget(header: string, allowedFields: Set<string>): string | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [field, aliases] of Object.entries(COLUMN_ALIAS_GROUPS)) {
    if (!allowedFields.has(field)) continue;
    if (aliases.includes(normalized) || normalized === normalizeHeader(field)) {
      return field;
    }
  }

  // Direct field key match (snake_case or spaced)
  const asField = normalized.replace(/\s+/g, "_");
  if (allowedFields.has(asField)) return asField;

  return null;
}

export class AliasColumnMapper implements ColumnMapper {
  async suggest(headers: string[], schema: TargetSchema): Promise<ColumnMapping[]> {
    const allowed = new Set(schema.fields.map((f) => f.field));
    const usedTargets = new Set<string>();
    const mappings: ColumnMapping[] = [];

    for (const header of headers) {
      const target = resolveAliasTarget(header, allowed);
      if (target && !usedTargets.has(target)) {
        usedTargets.add(target);
        const fieldMeta = schema.fields.find((f) => f.field === target);
        mappings.push({
          sourceColumn: header,
          targetField: target,
          required: fieldMeta?.required ?? false,
        });
      } else {
        mappings.push({
          sourceColumn: header,
          targetField: "",
          required: false,
        });
      }
    }

    return mappings;
  }

  async apply(rows: StagedRow[], mappings: ColumnMapping[]): Promise<StagedRow[]> {
    return rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const mapping of mappings) {
        if (!mapping.targetField) continue;
        const raw = row.raw[mapping.sourceColumn];
        if (raw === undefined || raw === null || raw === "") continue;
        mapped[mapping.targetField] = raw;
      }
      return { ...row, mapped };
    });
  }
}

export function mappingStatus(mapping: ColumnMapping): "Mapped" | "Needs Review" | "Ignored" {
  if (!mapping.targetField || mapping.targetField === "__ignore__") return "Ignored";
  if (mapping.targetField) return "Mapped";
  return "Needs Review";
}
