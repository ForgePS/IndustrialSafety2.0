import type {
  RowValidationResult,
  StagedRow,
  TargetSchema,
  Validator,
  ValidationIssue,
} from "../interfaces.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Row validator for import staging — business-friendly issues, no DB exceptions.
 */
export class SchemaRowValidator implements Validator {
  async validate(rows: StagedRow[], schema: TargetSchema): Promise<RowValidationResult[]> {
    const required = schema.fields.filter((f) => f.required).map((f) => f.field);
    const byField = new Map(schema.fields.map((f) => [f.field, f]));

    return rows.map((row) => {
      const issues: ValidationIssue[] = [];
      const mapped = row.mapped ?? {};

      for (const field of required) {
        const v = mapped[field];
        if (v === undefined || v === null || String(v).trim() === "") {
          issues.push({
            rule: "required",
            severity: "ERROR",
            fieldPath: field,
            message: `Missing required value for ${field.replace(/_/g, " ")}`,
          });
        }
      }

      for (const [field, value] of Object.entries(mapped)) {
        const meta = byField.get(field);
        if (!meta || value === undefined || value === null || value === "") continue;

        if (meta.dataType === "email" || field === "email" || field.endsWith("_email")) {
          if (!EMAIL_RE.test(String(value).trim())) {
            issues.push({
              rule: "email",
              severity: "ERROR",
              fieldPath: field,
              message: "Email address is not valid",
              details: { value: String(value) },
            });
          }
        }

        if (meta.dataType === "date" || field.endsWith("_date") || field === "hire_date") {
          if (!parseDate(value)) {
            issues.push({
              rule: "date",
              severity: "ERROR",
              fieldPath: field,
              message: "Date is not valid — use a recognizable date such as MM/DD/YYYY",
              details: { value: String(value) },
            });
          }
        }

        if (meta.dataType === "number" || meta.dataType === "integer") {
          if (Number.isNaN(Number(value))) {
            issues.push({
              rule: "type",
              severity: "ERROR",
              fieldPath: field,
              message: "Value must be a number",
              details: { value: String(value) },
            });
          }
        }
      }

      return { sourceRowKey: row.sourceRowKey, issues };
    });
  }
}

export function summarizeValidation(results: RowValidationResult[]): {
  totalRows: number;
  ready: number;
  needReview: number;
  cannotImport: number;
} {
  let ready = 0;
  let needReview = 0;
  let cannotImport = 0;
  for (const row of results) {
    const errors = row.issues.filter((i) => i.severity === "ERROR");
    const warnings = row.issues.filter((i) => i.severity === "WARNING");
    if (errors.length === 0 && warnings.length === 0) ready += 1;
    else if (errors.length === 0) needReview += 1;
    else cannotImport += 1;
  }
  return { totalRows: results.length, ready, needReview, cannotImport };
}
