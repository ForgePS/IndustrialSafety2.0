import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialCertificateTemplates,
  industrialChemicalSafetyRecords,
  industrialConfinedSpaceRecords,
  industrialContractorSafetyRecords,
  industrialCorrectiveActions,
  industrialCranesRiggingRecords,
  industrialDepartments,
  industrialDotComplianceRecords,
  industrialElectricalSafetyRecords,
  industrialEmergencyResponseRecords,
  industrialEnvironmentalSafetyRecords,
  industrialEquipment,
  industrialAttachments,
  industrialForkliftRecords,
  industrialFormDefinitions,
  industrialFormSubmissions,
  industrialFleetDrivers,
  industrialFleetDriverSettings,
  industrialHotWorkRecords,
  industrialIncidents,
  industrialInspections,
  industrialJsas,
  industrialLotoEnergySources,
  industrialLotoIsolationPoints,
  industrialLotoProcedures,
  industrialLotoRecords,
  industrialLotoSteps,
  industrialMachineSafetyRecords,
  industrialManufacturingSafetyRecords,
  industrialObservations,
  industrialOshaCases,
  industrialPersonnel,
  industrialProcessSafetyRecords,
  industrialSites,
  industrialTasks,
  industrialTrainingRecords,
  industrialWarehouseSafetyRecords,
  industrialWorkersCompCases,
  industrialWorkersCompMedicalEncounters,
  industrialWorkingAtHeightsRecords,
  platformEhsAuditTemplates,
  tenantSettings,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import {
  assertCanComplete,
  defaultInspectionTitle,
  FALLBACK_INSPECTION_TEMPLATE,
  itemsFromTemplate,
  parseRunItems,
  templateFromLegacyRow,
  type InspectionRunItem,
  type InspectionTemplateDto,
} from "./inspection-helpers.js";
import {
  appendMvrAuditEntry,
  parseMvrAuditHistory,
  selectMvrSampleIds,
} from "./mvr-sample.js";
import {
  buildFormSubmissionPrintableHtml,
  enrichPrintFieldsForDefinition,
  resolveFormAnswers,
  unwrapJsonRecord,
  type FormPrintField,
} from "./form-print.js";

type ListQuery = Record<string, string | undefined>;

type TitledTable =
  | typeof industrialIncidents
  | typeof industrialInspections
  | typeof industrialObservations
  | typeof industrialJsas
  | typeof industrialLotoProcedures
  | typeof industrialTrainingRecords
  | typeof industrialFormDefinitions
  | typeof industrialCertificateTemplates
  | typeof industrialTasks
  | typeof industrialEmergencyResponseRecords
  | typeof industrialChemicalSafetyRecords
  | typeof industrialConfinedSpaceRecords
  | typeof industrialHotWorkRecords
  | typeof industrialContractorSafetyRecords
  | typeof industrialCranesRiggingRecords
  | typeof industrialElectricalSafetyRecords
  | typeof industrialEnvironmentalSafetyRecords
  | typeof industrialForkliftRecords
  | typeof industrialMachineSafetyRecords
  | typeof industrialManufacturingSafetyRecords
  | typeof industrialProcessSafetyRecords
  | typeof industrialWarehouseSafetyRecords
  | typeof industrialWorkingAtHeightsRecords
  | typeof industrialDotComplianceRecords
  | typeof industrialOshaCases
  | typeof industrialCorrectiveActions;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

const MODULE_TABLES: Record<string, TitledTable> = {
  incidents: industrialIncidents,
  inspections: industrialInspections,
  observations: industrialObservations,
  jsas: industrialJsas,
  loto: industrialLotoProcedures,
  training: industrialTrainingRecords,
  forms: industrialFormDefinitions,
  certifications: industrialCertificateTemplates,
  tasks: industrialTasks,
  "chemical-safety": industrialChemicalSafetyRecords,
  "confined-space": industrialConfinedSpaceRecords,
  "hot-work": industrialHotWorkRecords,
  "contractor-safety": industrialContractorSafetyRecords,
  "cranes-rigging": industrialCranesRiggingRecords,
  "electrical-safety": industrialElectricalSafetyRecords,
  "environmental-safety": industrialEnvironmentalSafetyRecords,
  forklifts: industrialForkliftRecords,
  "machine-safety": industrialMachineSafetyRecords,
  "manufacturing-safety": industrialManufacturingSafetyRecords,
  "process-safety": industrialProcessSafetyRecords,
  "warehouse-safety": industrialWarehouseSafetyRecords,
  "working-at-heights": industrialWorkingAtHeightsRecords,
  dot: industrialDotComplianceRecords,
  osha: industrialOshaCases,
  "corrective-actions": industrialCorrectiveActions,
};

/**
 * Add Person template columns (migration 0043). Kept in one place so create,
 * update and read stay in sync: a field missing from any one of them silently
 * degrades to a sourcePayload-only value that cannot be filtered or reported on.
 */
const PERSONNEL_TEXT_FIELDS = [
  "middleName",
  "suffix",
  "preferredName",
  "jobTitle",
  "departmentName",
  "companyName",
  "divisionName",
  "fileBase",
  "userAuthId",
  "digitalSource",
  "phone",
  "companyPhone",
  "companyEmail",
  "supervisorName",
  "hireDate",
  "notes",
  "signatureUrl",
  "allergies",
  "medicalHistory",
  "emergencyContact1Name",
  "emergencyContact1Phone",
  "emergencyContact1Relationship",
  "emergencyContact2Name",
  "emergencyContact2Phone",
  "emergencyContact2Relationship",
  "safetyFootwearClass",
  "prescriptionSafetyGlassesIssuedDate",
  "prescriptionSafetyGlassesExpiresDate",
  "prescriptionSafetyGlassesExtraPairApprovedBy",
  "prescriptionSafetyGlassesExtraPairApprovedDate",
  "prescriptionSafetyGlassesExtraPairReason",
  "safetyFootwearIssuedDate",
  "safetyFootwearExpiresDate",
  "safetyFootwearExtraPairApprovedBy",
  "safetyFootwearExtraPairApprovedDate",
  "safetyFootwearExtraPairReason",
] as const;

const PERSONNEL_BOOLEAN_FIELDS = [
  "isCompanyDriver",
  "tracksPrescriptionSafetyGlasses",
  "prescriptionSafetyGlassesExtraPairApproved",
  "safetyFootwearExtraPairApproved",
] as const;

type PersonnelTextField = (typeof PERSONNEL_TEXT_FIELDS)[number];
type PersonnelBooleanField = (typeof PERSONNEL_BOOLEAN_FIELDS)[number];

/** The pre-0043 form posted `department`; keep accepting it as `departmentName`. */
const PERSONNEL_FIELD_ALIASES: Partial<Record<PersonnelTextField, string>> = {
  departmentName: "department",
};

function readPersonnelText(body: Record<string, unknown>, field: PersonnelTextField): unknown {
  const alias = PERSONNEL_FIELD_ALIASES[field];
  const raw = body[field] ?? (alias ? body[alias] : undefined);
  return raw;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === 1;
}

/** Empty string must not be written to uuid columns — Postgres rejects `''`. */
function optionalUuid(
  value: unknown,
  fallback: string | null | undefined,
): string | null {
  if (value === undefined) return fallback ?? null;
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  if (!UUID_PATTERN.test(text)) return null;
  return text;
}

/** Keep YYYY-MM-DD for date columns; clear blank / invalid values. */
function optionalDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (text === "") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

const PERSONNEL_DATE_FIELDS = [
  "hireDate",
  "prescriptionSafetyGlassesIssuedDate",
  "prescriptionSafetyGlassesExpiresDate",
  "prescriptionSafetyGlassesExtraPairApprovedDate",
  "safetyFootwearIssuedDate",
  "safetyFootwearExpiresDate",
  "safetyFootwearExtraPairApprovedDate",
] as const;

/**
 * Flat `/api/v1/industrial/*` domain operations against Model A (normalized tables).
 * Replaces the diverged branch ops-record approach with first-class tables.
 */
@Injectable()
export class IndustrialDomainService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Non-empty template values for an insert; omitted keys stay null. */
  private personnelInsertValues(body: Record<string, unknown>): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of PERSONNEL_TEXT_FIELDS) {
      const raw = readPersonnelText(body, field);
      if (raw == null) continue;
      const text = String(raw).trim();
      if (!text) continue;
      if ((PERSONNEL_DATE_FIELDS as readonly string[]).includes(field)) {
        const date = optionalDate(text);
        if (date) values[field] = date;
        continue;
      }
      values[field] = text;
    }
    for (const field of PERSONNEL_BOOLEAN_FIELDS) {
      if (body[field] !== undefined) {
        values[field] = toBoolean(body[field]);
      }
    }
    return values;
  }

  /**
   * Patch semantics: only keys present in the body change. An explicit empty
   * string clears the column so a user can remove a value.
   */
  private personnelUpdateValues(
    body: Record<string, unknown>,
    existing: Record<string, unknown>,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of PERSONNEL_TEXT_FIELDS) {
      const raw = readPersonnelText(body, field);
      if (raw === undefined) {
        const existingValue = existing[field] ?? null;
        if (
          (PERSONNEL_DATE_FIELDS as readonly string[]).includes(field) &&
          existingValue != null
        ) {
          values[field] = optionalDate(existingValue);
        } else {
          values[field] = existingValue;
        }
        continue;
      }
      const text = raw == null ? "" : String(raw).trim();
      if ((PERSONNEL_DATE_FIELDS as readonly string[]).includes(field)) {
        values[field] = text === "" ? null : optionalDate(text);
        continue;
      }
      values[field] = text === "" ? null : text;
    }
    for (const field of PERSONNEL_BOOLEAN_FIELDS) {
      values[field] =
        body[field] === undefined ? Boolean(existing[field]) : toBoolean(body[field]);
    }
    return values;
  }

  /** Template columns echoed back on read so the detail form can round-trip. */
  private personnelReadValues(row: Record<string, unknown>): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of PERSONNEL_TEXT_FIELDS) {
      values[field] = row[field] ?? null;
    }
    for (const field of PERSONNEL_BOOLEAN_FIELDS) {
      values[field] = Boolean(row[field]);
    }
    return values;
  }

  /**
   * Import left some tenants (notably producers-rice-mill) with source_payload
   * stored as a JSON *string* inside jsonb. Without unwrapping, the personnel
   * file only sees typed columns — which for that import are mostly blank —
   * and job title / hire date / suffix vanish.
   */
  private unwrapSourcePayload(raw: unknown): Record<string, unknown> {
    let current: unknown = raw;
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current === "string") {
        const trimmed = current.trim();
        if (trimmed === "") return {};
        try {
          current = JSON.parse(trimmed);
          continue;
        } catch {
          return {};
        }
      }
      if (current && typeof current === "object" && !Array.isArray(current)) {
        return current as Record<string, unknown>;
      }
      return {};
    }
    return {};
  }

  /**
   * Firebase roster keys → Model A column names so the personnel file and
   * directory can read one shape. Only fills a target when it is still blank.
   */
  private normalizePersonnelPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    const blank = (value: unknown) =>
      value == null || (typeof value === "string" && value.trim() === "");

    const aliases: Array<[string, string]> = [
      ["goesBy", "preferredName"],
      ["hire_date", "hireDate"],
      ["job_title", "jobTitle"],
      ["employee_number", "employeeNumber"],
      ["first_name", "firstName"],
      ["last_name", "lastName"],
      ["middle_name", "middleName"],
      ["department", "departmentName"],
      ["company", "companyName"],
      ["division", "divisionName"],
      ["supervisor", "supervisorName"],
      // Roster imports store the work site as `site` without a sites FK.
      ["site", "siteName"],
      ["location", "siteName"],
      ["locationName", "siteName"],
    ];
    for (const [from, to] of aliases) {
      if (blank(out[to]) && !blank(out[from])) out[to] = out[from];
    }

    // Roster imports often only stored the combined display name.
    if (blank(out.firstName) && blank(out.lastName) && typeof out.displayName === "string") {
      const parsed = this.splitDisplayName(out.displayName);
      if (parsed.firstName) out.firstName = parsed.firstName;
      if (parsed.lastName) out.lastName = parsed.lastName;
      if (blank(out.suffix) && parsed.suffix) out.suffix = parsed.suffix;
      if (blank(out.middleName) && parsed.middleName) out.middleName = parsed.middleName;
    }

    return out;
  }

  private splitDisplayName(displayName: string): {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
  } {
    const suffixes = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
    const parts = displayName
      .trim()
      .split(/\s+/)
      .map((p) => p.replace(/,/g, ""))
      .filter((p) => p !== "");
    if (parts.length === 0) return {};
    let suffix: string | undefined;
    if (parts.length > 1 && suffixes.has(parts[parts.length - 1]!.toUpperCase())) {
      suffix = parts.pop();
    }
    if (parts.length === 1) {
      return {
        ...(parts[0] ? { firstName: parts[0] } : {}),
        ...(suffix ? { suffix } : {}),
      };
    }
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined;
    return {
      ...(firstName ? { firstName } : {}),
      ...(middleName ? { middleName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(suffix ? { suffix } : {}),
    };
  }

  /** Empty strings and nulls from typed columns must not blank out payload values. */
  private preferFilled(
    columns: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...payload };
    for (const [key, value] of Object.entries(columns)) {
      if (value == null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      merged[key] = value;
    }
    return merged;
  }

  /** Imported upload history entries (MVR pulls, signed releases, license photos). */
  private uploadList(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && !Array.isArray(entry),
    );
  }

  private hasUpload(raw: unknown): boolean {
    return !!raw && typeof raw === "object" && !Array.isArray(raw);
  }

  /** Viewable image URL/data URL from a license upload object or string field. */
  private uploadImageSrc(raw: unknown): string | null {
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value === "") return null;
      if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) return value;
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    for (const key of ["dataUrl", "url", "downloadURL", "downloadUrl", "src", "href"]) {
      const nested = this.uploadImageSrc(entry[key]);
      if (nested) return nested;
    }
    return null;
  }

  /**
   * Project front/back license copies onto a personnel GET payload, filling
   * from the linked company-driver or DOT (DQF) record when the person row
   * does not already carry them.
   */
  private projectLicenseCopies(args: {
    personnelPayload: Record<string, unknown>;
    driverPayload?: Record<string, unknown> | null;
    dotPayload?: Record<string, unknown> | null;
    isCompanyDriver: boolean;
  }): Record<string, unknown> {
    const { personnelPayload, driverPayload, dotPayload, isCompanyDriver } = args;
    const fromPersonFront =
      this.uploadImageSrc(personnelPayload.licenseFrontUrl) ??
      this.uploadImageSrc(personnelPayload.licenseFrontUpload);
    const fromPersonBack =
      this.uploadImageSrc(personnelPayload.licenseBackUrl) ??
      this.uploadImageSrc(personnelPayload.licenseBackUpload);

    const fromDriverFront = this.uploadImageSrc(driverPayload?.licenseFrontUpload);
    const fromDriverBack = this.uploadImageSrc(driverPayload?.licenseBackUpload);

    const fromDotFront =
      this.uploadImageSrc(dotPayload?.licenseFrontUpload) ??
      this.uploadImageSrc(dotPayload?.licenseFrontUrl) ??
      this.uploadImageSrc(dotPayload?.driversLicenseFront) ??
      this.uploadImageSrc(dotPayload?.driversLicenseCopy) ??
      this.uploadImageSrc(
        Array.isArray(dotPayload?.driversLicenseCopy)
          ? (dotPayload?.driversLicenseCopy as unknown[])[0]
          : null,
      );
    const fromDotBack =
      this.uploadImageSrc(dotPayload?.licenseBackUpload) ??
      this.uploadImageSrc(dotPayload?.licenseBackUrl) ??
      this.uploadImageSrc(dotPayload?.driversLicenseBack);

    const front = fromPersonFront ?? fromDriverFront ?? fromDotFront ?? null;
    const back = fromPersonBack ?? fromDriverBack ?? fromDotBack ?? null;
    const requiresLicenseCopies =
      isCompanyDriver || !!driverPayload || !!dotPayload;

    const out: Record<string, unknown> = {
      requiresLicenseCopies,
      hasLicenseFront: !!front,
      hasLicenseBack: !!back,
    };
    if (front) {
      out.licenseFrontUrl = front;
      if (!personnelPayload.licenseFrontUpload && (driverPayload?.licenseFrontUpload || dotPayload?.licenseFrontUpload)) {
        out.licenseFrontUpload =
          driverPayload?.licenseFrontUpload ?? dotPayload?.licenseFrontUpload;
      }
    }
    if (back) {
      out.licenseBackUrl = back;
      if (!personnelPayload.licenseBackUpload && (driverPayload?.licenseBackUpload || dotPayload?.licenseBackUpload)) {
        out.licenseBackUpload =
          driverPayload?.licenseBackUpload ?? dotPayload?.licenseBackUpload;
      }
    }
    return out;
  }

  private latestUploadAt(uploads: Record<string, unknown>[]): string {
    let latest = "";
    for (const upload of uploads) {
      const at = String(upload.uploadedAt ?? "").trim();
      if (at > latest) latest = at;
    }
    return latest;
  }

  private page(query: ListQuery) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50) || 50));
    return { page, pageSize, offset: (page - 1) * pageSize };
  }

  private mapListItem(row: {
    id: string;
    title?: string | null | undefined;
    displayName?: string | null | undefined;
    name?: string | null | undefined;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    sourcePayload?: unknown;
    extra?: Record<string, unknown>;
  }) {
    const title = row.title ?? row.displayName ?? row.name ?? row.id;
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const filled = this.preferFilled(row.extra ?? {}, payload);
    return {
      id: row.id,
      title,
      displayName: title,
      name: title,
      status: row.status,
      ...filled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private tableFor(moduleKey: string): TitledTable {
    const table = MODULE_TABLES[moduleKey];
    if (!table) throw new ForgeError("NOT_FOUND", `Unknown industrial module: ${moduleKey}`);
    return table;
  }

  /**
   * Record ids are uuid columns, so a non-uuid path segment would reach Postgres
   * as a cast error and surface as a 500. The flat `:module/:id` routes are
   * catch-alls, so any unknown sub-path (e.g. /training/records) lands here and
   * must read as "no such record" rather than crashing the caller's UI.
   */
  private assertRecordId(id: string): string {
    if (!UUID_PATTERN.test(id.trim())) {
      throw new ForgeError("NOT_FOUND", "Record not found");
    }
    return id.trim();
  }

  async listModule(principal: ForgePrincipal, moduleKey: string, query: ListQuery) {
    const table = this.tableFor(moduleKey);
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [eq(table.tenantId, principal.tenantId), isNull(table.archivedAt)];
      if (status) conditions.push(eq(table.status, status));
      if (siteId && "siteId" in table) {
        conditions.push(eq((table as typeof industrialIncidents).siteId, siteId));
      }
      if (q && "title" in table) {
        conditions.push(ilike((table as typeof industrialIncidents).title, `%${q}%`));
      }
      const items = await tx
        .select()
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) => {
          const base = {
            id: r.id,
            title: "title" in r ? (r as { title?: string | null }).title : null,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
          };
          if ("siteId" in r || "schemaJson" in r) {
            return this.mapListItem({
              ...base,
              extra: {
                siteId: "siteId" in r ? ((r as { siteId?: string | null }).siteId ?? null) : undefined,
                ...("schemaJson" in r
                  ? {
                      schemaJson: (r as { schemaJson?: unknown }).schemaJson ?? {},
                      formKey: (r as { formKey?: string | null }).formKey ?? null,
                      version: (r as { version?: string | null }).version ?? null,
                      sourceDocumentId:
                        (r as { sourceDocumentId?: string | null }).sourceDocumentId ?? null,
                    }
                  : {}),
              },
            });
          }
          return this.mapListItem(base);
        }),
      };
    });
  }

  async getModule(principal: ForgePrincipal, moduleKey: string, id: string) {
    const table = this.tableFor(moduleKey);
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(table)
        .where(and(eq(table.id, recordId), eq(table.tenantId, principal.tenantId)))
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Record not found");
      if ("schemaJson" in row) {
        return this.mapListItem({
          id: row.id,
          title: "title" in row ? (row as { title?: string | null }).title : null,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: row.sourcePayload,
          extra: {
            schemaJson: (row as { schemaJson?: unknown }).schemaJson ?? {},
            formKey: (row as { formKey?: string | null }).formKey ?? null,
            version: (row as { version?: string | null }).version ?? null,
            sourceDocumentId:
              (row as { sourceDocumentId?: string | null }).sourceDocumentId ?? null,
          },
        });
      }
      return this.mapListItem({
        id: row.id,
        title: "title" in row ? (row as { title?: string | null }).title : null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
      });
    });
  }

  async createModule(principal: ForgePrincipal, moduleKey: string, body: Record<string, unknown>) {
    const table = this.tableFor(moduleKey);
    const title = String(
      body.title ?? body.name ?? body.displayName ?? body.description ?? "",
    ).trim();
    if (!title) {
      throw new ForgeError("VALIDATION_FAILED", "Please provide a title or name for this record.");
    }
    const status = String(body.status ?? "ACTIVE").trim() || "ACTIVE";
    const siteId = body.siteId ? String(body.siteId) : null;
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const values: Record<string, unknown> = {
        id: createId(),
        tenantId: principal.tenantId,
        title,
        status,
        sourceSystem: "FORGE",
        sourcePayload: body,
        createdAt: now,
        updatedAt: now,
      };
      if ("siteId" in table && siteId) values.siteId = siteId;
      if ("courseName" in table) {
        values.courseName = String(body.courseCode ?? body.courseName ?? title);
      }
      if ("personnelId" in table && body.personnelId) {
        values.personnelId = String(body.personnelId);
      }
      if (moduleKey === "corrective-actions") {
        values.parentEntityType = String(body.parentEntityType ?? "MANUAL");
        values.title = title;
        if (body.parentEntityId) values.parentEntityId = String(body.parentEntityId);
        if (body.description) values.description = String(body.description);
        if (body.priority) values.priority = String(body.priority);
        if (body.dueDate) values.dueDate = String(body.dueDate);
      }
      if (moduleKey === "forms") {
        values.formKey = String(body.formKey ?? body.category ?? title)
          .trim()
          .slice(0, 120);
        values.version = String(body.version ?? "1").trim() || "1";
        values.schemaJson =
          body.schemaJson && typeof body.schemaJson === "object"
            ? body.schemaJson
            : body.schema && typeof body.schema === "object"
              ? body.schema
              : { fields: Array.isArray(body.fields) ? body.fields : [] };
      }
      const [row] = await tx
        .insert(table)
        .values(values as never)
        .returning();
      if (moduleKey === "forms") {
        return this.mapListItem({
          id: row!.id,
          title: "title" in row! ? (row as { title?: string | null }).title : title,
          status: row!.status,
          createdAt: row!.createdAt,
          updatedAt: row!.updatedAt,
          sourcePayload: row!.sourcePayload,
          extra: {
            schemaJson: values.schemaJson,
            formKey: values.formKey,
            version: values.version,
          },
        });
      }
      return this.mapListItem({
        id: row!.id,
        title: "title" in row! ? (row as { title?: string | null }).title : title,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
      });
    });
  }

  async archiveModule(principal: ForgePrincipal, moduleKey: string, id: string) {
    const table = this.tableFor(moduleKey);
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(table)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now } as never)
        .where(and(eq(table.id, recordId), eq(table.tenantId, principal.tenantId)))
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Record not found");
      return this.mapListItem({
        id: row.id,
        title: "title" in row ? (row as { title?: string | null }).title : null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
      });
    });
  }

  private mapFormSubmission(row: {
    id: string;
    title?: string | null;
    status: string;
    formDefinitionId?: string | null;
    submittedAt?: Date | null;
    answers?: unknown;
    createdAt: Date;
    updatedAt: Date;
    sourcePayload: unknown;
  }) {
    const payload = unwrapJsonRecord(row.sourcePayload);
    const answers = resolveFormAnswers(row.answers, row.sourcePayload);
    const title =
      row.title ??
      (typeof payload.templateName === "string" ? payload.templateName : null) ??
      (typeof payload.title === "string" ? payload.title : null);
    return this.mapListItem({
      id: row.id,
      title,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourcePayload: Object.keys(payload).length > 0 ? payload : row.sourcePayload,
      extra: {
        formDefinitionId: row.formDefinitionId ?? null,
        submittedAt: row.submittedAt ?? null,
        answers,
      },
    });
  }

  async listFormSubmissions(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const formDefinitionId = (query.formDefinitionId ?? query.formId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialFormSubmissions.tenantId, principal.tenantId),
        isNull(industrialFormSubmissions.archivedAt),
      ];
      if (status) conditions.push(eq(industrialFormSubmissions.status, status));
      if (formDefinitionId) {
        conditions.push(eq(industrialFormSubmissions.formDefinitionId, formDefinitionId));
      }
      if (q) {
        conditions.push(ilike(industrialFormSubmissions.title, `%${q}%`));
      }
      const items = await tx
        .select()
        .from(industrialFormSubmissions)
        .where(and(...conditions))
        .orderBy(desc(industrialFormSubmissions.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return { page, pageSize, items: items.map((row) => this.mapFormSubmission(row)) };
    });
  }

  async getFormSubmission(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFormSubmissions)
        .where(
          and(
            eq(industrialFormSubmissions.id, recordId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Form submission not found");
      return this.mapFormSubmission(row);
    });
  }

  async createFormSubmission(principal: ForgePrincipal, body: Record<string, unknown>) {
    const formDefinitionId = String(body.formDefinitionId ?? body.formId ?? "").trim();
    if (!formDefinitionId) {
      throw new ForgeError("VALIDATION_FAILED", "Please choose a form to submit.");
    }
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    const title = String(body.title ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [definition] = await tx
        .select()
        .from(industrialFormDefinitions)
        .where(
          and(
            eq(industrialFormDefinitions.id, formDefinitionId),
            eq(industrialFormDefinitions.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!definition) throw new ForgeError("NOT_FOUND", "Form not found");
      const now = new Date();
      const [row] = await tx
        .insert(industrialFormSubmissions)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          siteId: definition.siteId,
          title: title || definition.title || "Form submission",
          status: String(body.status ?? "SUBMITTED").trim() || "SUBMITTED",
          formDefinitionId: definition.id,
          submittedAt: now,
          answers,
          sourceSystem: "FORGE",
          sourcePayload: {
            formDefinitionId: definition.id,
            formTitle: definition.title,
            answers,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapFormSubmission(row!);
    });
  }

  async updateFormSubmission(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFormSubmissions)
        .where(
          and(
            eq(industrialFormSubmissions.id, recordId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
            isNull(industrialFormSubmissions.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Form submission not found");

      const answers =
        body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
          ? (body.answers as Record<string, unknown>)
          : existing.answers && typeof existing.answers === "object" && !Array.isArray(existing.answers)
            ? (existing.answers as Record<string, unknown>)
            : {};
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : (existing.title ?? "Form submission");
      const status =
        typeof body.status === "string" && body.status.trim()
          ? body.status.trim()
          : existing.status;
      const now = new Date();
      const prevPayload =
        existing.sourcePayload &&
        typeof existing.sourcePayload === "object" &&
        !Array.isArray(existing.sourcePayload)
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};
      const [row] = await tx
        .update(industrialFormSubmissions)
        .set({
          title,
          status,
          answers,
          sourcePayload: {
            ...prevPayload,
            formDefinitionId: existing.formDefinitionId,
            answers,
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFormSubmissions.id, recordId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Form submission not found");
      return this.mapFormSubmission(row);
    });
  }

  async formSubmissionPrintable(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialFormSubmissions)
        .where(
          and(
            eq(industrialFormSubmissions.id, recordId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Form submission not found");

      let definition: {
        title?: string | null;
        formKey?: string | null;
        sourceDocumentId?: string | null;
        schemaJson?: unknown;
        sourcePayload?: unknown;
      } | null = null;
      if (row.formDefinitionId) {
        const [def] = await tx
          .select()
          .from(industrialFormDefinitions)
          .where(
            and(
              eq(industrialFormDefinitions.id, row.formDefinitionId),
              eq(industrialFormDefinitions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        definition = def ?? null;
      }

      const tenantRows = await tx.execute(sql`
        select tenant_key::text as tenant_key,
          display_name::text as display_name,
          legal_name::text as legal_name
        from tenants
        where id = ${principal.tenantId}::uuid
        limit 1
      `);
      const tenantRow = (Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]) as
        | Record<string, unknown>
        | undefined;

      const brandingRows = await tx.execute(sql`
        select cv.payload_json as payload
        from config_objects co
        join config_versions cv on cv.id = co.current_published_version_id
        where co.tenant_id = ${principal.tenantId}::uuid
          and co.namespace = 'branding'
          and co.object_key = 'default'
        limit 1
      `);
      const brandingPayloadRaw = (Array.isArray(brandingRows)
        ? brandingRows[0]
        : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]) as
        | { payload?: unknown }
        | undefined;
      const brandingPayload = unwrapJsonRecord(brandingPayloadRaw?.payload);

      const tenantKey = String(tenantRow?.tenant_key ?? "").trim();
      const companyName =
        String(
          brandingPayload.productDisplayName ??
            tenantRow?.display_name ??
            tenantRow?.legal_name ??
            "",
        ).trim() || null;
      const logoUrl =
        String(brandingPayload.logoUrl ?? "").trim() ||
        (tenantKey === "producers-rice-mill"
          ? "https://producersrice.forgepublicsafety.com/branding/producers-rice-mill.png"
          : null);
      const reportIdentity =
        String(brandingPayload.reportIdentity ?? companyName ?? "").trim() || null;
      const documentFooter =
        String(brandingPayload.documentFooter ?? companyName ?? "").trim() || null;

      const mapped = this.mapFormSubmission(row) as Record<string, unknown>;
      const answers = unwrapJsonRecord(mapped.answers);
      const fields = enrichPrintFieldsForDefinition(
        this.extractPrintFields(definition),
        definition,
      );
      const html = buildFormSubmissionPrintableHtml({
        title: String(mapped.title ?? definition?.title ?? "Form submission"),
        status: String(mapped.status ?? row.status ?? ""),
        submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
        fields,
        answers,
        branding: {
          logoUrl,
          reportIdentity,
          documentFooter,
          companyName,
        },
      });
      return { html, title: mapped.title ?? "Form submission" };
    });
  }

  private extractPrintFields(
    definition: {
      schemaJson?: unknown;
      sourcePayload?: unknown;
      title?: string | null;
    } | null,
  ): FormPrintField[] {
    if (!definition) return [];
    const sources = [definition.schemaJson, definition.sourcePayload, definition];
    const fields: FormPrintField[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      const root = unwrapJsonRecord(source);
      const buckets = [root.fields, root.questions, root.formFields];
      if (Array.isArray(root.sections)) {
        for (const section of root.sections) {
          const sec = unwrapJsonRecord(section);
          if (Array.isArray(sec.fields)) buckets.push(sec.fields);
          if (Array.isArray(sec.questions)) buckets.push(sec.questions);
        }
      }
      for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const [index, raw] of bucket.entries()) {
          const rec =
            typeof raw === "string"
              ? { id: `field-${index + 1}`, label: raw }
              : unwrapJsonRecord(raw);
          const id = String(rec.id ?? rec.key ?? rec.name ?? `field-${index + 1}`).trim();
          const label = String(rec.label ?? rec.title ?? rec.name ?? id).trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const type = String(rec.type ?? "").trim().toLowerCase();
          const content = String(
            rec.content ?? rec.body ?? rec.html ?? rec.placeholder ?? rec.text ?? "",
          ).trim();
          if (type === "content" || type === "html" || type === "static" || content) {
            fields.push({
              id,
              label: label || id,
              kind: "content",
              content,
            });
          } else {
            fields.push({ id, label: label || id, kind: "answer" });
          }
        }
      }
      if (fields.length > 0) break;
    }
    return fields;
  }

  async transitionModule(
    principal: ForgePrincipal,
    moduleKey: string,
    id: string,
    action: string,
    body: Record<string, unknown> = {},
  ) {
    const statusMap: Record<string, string> = {
      submit: "SUBMITTED",
      approve: "APPROVED",
      close: "CLOSED",
      complete: "COMPLETED",
      reopen: "OPEN",
      archive: "ARCHIVED",
      ...(moduleKey === "loto"
        ? {
            submit: "IN_REVIEW",
            "submit-review": "IN_REVIEW",
            "submit-approval": "PENDING_APPROVAL",
            activate: "ACTIVE",
            reopen: "DRAFT",
          }
        : {}),
    };
    const next = statusMap[action] ?? String(body.status ?? "").trim();
    if (!next) {
      throw new ForgeError("VALIDATION_FAILED", "That action is not supported for this record.");
    }
    if (action === "archive") return this.archiveModule(principal, moduleKey, id);
    const table = this.tableFor(moduleKey);
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(table)
        .set({ status: next, updatedAt: now } as never)
        .where(and(eq(table.id, recordId), eq(table.tenantId, principal.tenantId)))
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Record not found");
      return this.mapListItem({
        id: row.id,
        title: "title" in row ? (row as { title?: string | null }).title : null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
      });
    });
  }

  // ---- Convenience wrappers used by existing controller methods ----
  listIncidents(p: ForgePrincipal, q: ListQuery) {
    return this.listIncidentsDetailed(p, q);
  }
  listInspections(p: ForgePrincipal, q: ListQuery) {
    return this.listModule(p, "inspections", q);
  }
  listObservations(p: ForgePrincipal, q: ListQuery) {
    return this.listModule(p, "observations", q);
  }
  listJsas(p: ForgePrincipal, q: ListQuery) {
    return this.listModule(p, "jsas", q);
  }
  listLoto(p: ForgePrincipal, q: ListQuery) {
    return this.listLotoProceduresDetailed(p, q);
  }
  createIncident(p: ForgePrincipal, b: Record<string, unknown>) {
    const category = String(b.category ?? b.incidentCategory ?? "").trim();
    return this.createModule(p, "incidents", {
      ...b,
      status: b.status ?? "open",
      ...(category ? { category } : {}),
    });
  }

  /**
   * Patch an incident: merge workflow / evaluation / RCA into source_payload
   * and optionally update status / title fields.
   */
  async updateIncident(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.id, recordId),
            eq(industrialIncidents.tenantId, principal.tenantId),
            isNull(industrialIncidents.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Record not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const nextPayload: Record<string, unknown> = { ...payload };

      if (body.lifecycle !== undefined) nextPayload.lifecycle = body.lifecycle;
      if (body.evaluationChecklist !== undefined) {
        nextPayload.evaluationChecklist = body.evaluationChecklist;
      }
      if (body.rootCauseAnalysis !== undefined) {
        nextPayload.rootCauseAnalysis = body.rootCauseAnalysis;
      }
      if (body.bodyLocations !== undefined) {
        nextPayload.bodyLocations = Array.isArray(body.bodyLocations)
          ? body.bodyLocations.filter((value): value is string => typeof value === "string")
          : [];
      }

      for (const key of [
        "category",
        "severity",
        "location",
        "description",
        "reportedBy",
        "dateOccurred",
      ] as const) {
        if (body[key] !== undefined) nextPayload[key] = body[key];
      }

      const now = new Date();
      const patch: Record<string, unknown> = {
        sourcePayload: nextPayload,
        updatedAt: now,
      };
      if (typeof body.title === "string" && body.title.trim()) {
        patch.title = body.title.trim();
      }
      if (typeof body.status === "string" && body.status.trim()) {
        patch.status = body.status.trim();
      } else if (body.lifecycle && typeof body.lifecycle === "object") {
        const lifecycle = body.lifecycle as {
          currentStage?: string;
          steps?: Array<{ status?: string }>;
        };
        const steps = Array.isArray(lifecycle.steps) ? lifecycle.steps : [];
        const allComplete =
          steps.length > 0 && steps.every((s) => String(s.status ?? "").toLowerCase() === "complete");
        if (allComplete || lifecycle.currentStage === "closure") {
          patch.status = "closed";
        } else if (steps.some((s) => String(s.status ?? "").toLowerCase() === "in-progress")) {
          patch.status = "in-workflow";
        }
      }

      const [row] = await tx
        .update(industrialIncidents)
        .set(patch as never)
        .where(
          and(
            eq(industrialIncidents.id, recordId),
            eq(industrialIncidents.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Record not found");
      return this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
      });
    });
  }

  /**
   * Incident roster with optional category filter (injuries, near-misses, …).
   * Category lives in source_payload from the Firebase import / create form.
   */
  async listIncidentsDetailed(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const category = (query.category ?? "").trim().toLowerCase();
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialIncidents.tenantId, principal.tenantId),
        isNull(industrialIncidents.archivedAt),
      ];
      if (status) {
        conditions.push(sql`lower(${industrialIncidents.status}) = ${status.toLowerCase()}`);
      }
      if (siteId) conditions.push(eq(industrialIncidents.siteId, siteId));
      if (category) {
        conditions.push(
          sql`lower(coalesce(${industrialIncidents.sourcePayload}->>'category', ${industrialIncidents.sourcePayload}->>'incidentCategory', '')) = ${category}`,
        );
      }
      if (q) {
        conditions.push(
          or(
            ilike(industrialIncidents.title, `%${q}%`),
            sql`coalesce(${industrialIncidents.sourcePayload}->>'description', '') ilike ${`%${q}%`}`,
          )!,
        );
      }
      const items = await tx
        .select()
        .from(industrialIncidents)
        .where(and(...conditions))
        .orderBy(desc(industrialIncidents.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const [totals] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(industrialIncidents)
        .where(and(...conditions));
      return {
        page,
        pageSize,
        total: totals?.c ?? items.length,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: this.unwrapSourcePayload(r.sourcePayload),
            extra: { siteId: r.siteId },
          }),
        ),
      };
    });
  }

  /** Summary tiles for the Incidents module header. */
  async incidentsSummary(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select({
          status: industrialIncidents.status,
          sourcePayload: industrialIncidents.sourcePayload,
        })
        .from(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.tenantId, principal.tenantId),
            isNull(industrialIncidents.archivedAt),
          ),
        );

      const summary = {
        injuries: 0,
        nearMisses: 0,
        medicalRefusals: 0,
        propertyDamage: 0,
        automotive: 0,
        open: 0,
        inWorkflow: 0,
        evaluations: 0,
        rcas: 0,
        total: rows.length,
      };

      for (const row of rows) {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const category = String(payload.category ?? payload.incidentCategory ?? "")
          .trim()
          .toLowerCase();
        if (category === "injuries" || category === "injury") summary.injuries += 1;
        else if (category === "near-misses" || category === "near_miss" || category === "nearmiss")
          summary.nearMisses += 1;
        else if (category === "medical-refusals" || category === "medical_refusals")
          summary.medicalRefusals += 1;
        else if (category === "property-damage" || category === "property_damage")
          summary.propertyDamage += 1;
        else if (category === "automotive" || category === "vehicle") summary.automotive += 1;

        const status = String(row.status ?? "").trim().toLowerCase();
        if (status === "open" || status === "active") summary.open += 1;
        let inWorkflow = false;
        if (
          status === "under-review" ||
          status === "in-workflow" ||
          status === "in_workflow" ||
          status === "investigating"
        ) {
          inWorkflow = true;
        }
        const lifecycle = payload.lifecycle;
        if (lifecycle && typeof lifecycle === "object") {
          const lc = lifecycle as { currentStage?: string; steps?: Array<{ status?: string }> };
          const steps = Array.isArray(lc.steps) ? lc.steps : [];
          if (steps.some((s) => String(s.status ?? "").toLowerCase() === "in-progress")) {
            inWorkflow = true;
          } else if (
            lc.currentStage &&
            lc.currentStage !== "closure" &&
            steps.some((s) => String(s.status ?? "").toLowerCase() !== "complete")
          ) {
            inWorkflow = true;
          }
        }
        if (inWorkflow) summary.inWorkflow += 1;
        if (payload.evaluationChecklist) summary.evaluations += 1;
        if (payload.rootCauseAnalysis) summary.rcas += 1;
      }

      return summary;
    });
  }

  async createInspection(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const departmentId = body.departmentId ? String(body.departmentId) : null;
      let departmentName =
        typeof body.departmentName === "string" ? body.departmentName.trim() : "";
      let contactPersonnelId: string | null =
        typeof body.responsiblePersonnelId === "string" && body.responsiblePersonnelId
          ? body.responsiblePersonnelId
          : null;
      let contactName =
        typeof body.responsibleName === "string" ? body.responsibleName.trim() : "";

      if (departmentId) {
        const [dept] = await tx
          .select()
          .from(industrialDepartments)
          .where(
            and(
              eq(industrialDepartments.id, departmentId),
              eq(industrialDepartments.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (dept) {
          departmentName = departmentName || dept.name;
          if (!contactPersonnelId && dept.contactPersonnelId) {
            contactPersonnelId = dept.contactPersonnelId;
          }
          if (!contactName) {
            contactName = dept.contactName ?? "";
          }
          if (contactPersonnelId && !contactName) {
            const [person] = await tx
              .select({
                displayName: industrialPersonnel.displayName,
              })
              .from(industrialPersonnel)
              .where(
                and(
                  eq(industrialPersonnel.id, contactPersonnelId),
                  eq(industrialPersonnel.tenantId, principal.tenantId),
                ),
              )
              .limit(1);
            contactName = person?.displayName ?? contactName;
          }
        }
      }

      const templates = await this.loadInspectionTemplatesInTx(tx, principal.tenantId);
      const templateId = body.templateId ? String(body.templateId) : null;
      const template =
        templates.find((t) => t.id === templateId) ??
        (departmentName
          ? templates.find(
              (t) =>
                t.departmentHint &&
                t.departmentHint.toLowerCase().includes(departmentName.toLowerCase()),
            )
          : undefined) ??
        templates[0] ??
        FALLBACK_INSPECTION_TEMPLATE;

      const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
      const title = titleRaw || defaultInspectionTitle(departmentName || template.name);
      const inspectionDate =
        typeof body.inspectionDate === "string" && body.inspectionDate.trim()
          ? body.inspectionDate.trim()
          : new Date().toISOString().slice(0, 10);
      const items =
        Array.isArray(body.items) && body.items.length > 0
          ? parseRunItems(body.items)
          : itemsFromTemplate(template);

      const now = new Date();
      const id = createId();
      const sourcePayload = {
        ...body,
        title,
        inspectionDate,
        departmentId,
        departmentName,
        templateId: template.id,
        templateName: template.name,
        responsiblePersonnelId: contactPersonnelId,
        responsibleName: contactName,
        items,
      };
      const [row] = await tx
        .insert(industrialInspections)
        .values({
          id,
          tenantId: principal.tenantId,
          siteId: body.siteId ? String(body.siteId) : null,
          departmentId,
          title,
          status: String(body.status ?? "IN_PROGRESS"),
          templateId: template.id === FALLBACK_INSPECTION_TEMPLATE.id ? null : template.id,
          inspectionType: typeof body.inspectionType === "string" ? body.inspectionType : "AREA",
          sourceSystem: "FORGE",
          sourcePayload,
          createdAt: now,
          updatedAt: now,
        } as never)
        .returning();
      return this.mapInspectionRow(row!);
    }, principal.userId);
  }

  getIncident(p: ForgePrincipal, id: string) {
    return this.getModule(p, "incidents", id);
  }
  getInspection(p: ForgePrincipal, id: string) {
    return this.getModule(p, "inspections", id);
  }

  async listDepartments(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, principal.tenantId),
            isNull(industrialDepartments.archivedAt),
          ),
        )
        .orderBy(industrialDepartments.name)
        .limit(500);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        siteId: row.siteId,
        status: row.status,
        contactPersonnelId: row.contactPersonnelId,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
      }));
    }, principal.userId);
  }

  async listInspectionTemplates(principal: ForgePrincipal, query: ListQuery = {}) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const templates = await this.loadInspectionTemplatesInTx(tx, principal.tenantId);
      const departmentId = query.departmentId?.trim();
      if (!departmentId) return templates;
      const [dept] = await tx
        .select({ name: industrialDepartments.name })
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.id, departmentId),
            eq(industrialDepartments.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!dept) return templates;
      const name = dept.name.toLowerCase();
      const preferred = templates.filter(
        (t) => t.departmentHint && t.departmentHint.toLowerCase().includes(name),
      );
      return preferred.length > 0 ? [...preferred, ...templates.filter((t) => !preferred.includes(t))] : templates;
    }, principal.userId);
  }

  async updateInspection(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.id, recordId),
            eq(industrialInspections.tenantId, principal.tenantId),
            isNull(industrialInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Inspection not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const nextPayload: Record<string, unknown> = { ...payload };
      for (const key of [
        "inspectionDate",
        "departmentId",
        "departmentName",
        "templateId",
        "templateName",
        "responsiblePersonnelId",
        "responsibleName",
        "items",
      ] as const) {
        if (body[key] !== undefined) nextPayload[key] = body[key];
      }

      const now = new Date();
      const patch: Record<string, unknown> = {
        sourcePayload: nextPayload,
        updatedAt: now,
      };
      if (typeof body.title === "string" && body.title.trim()) {
        patch.title = body.title.trim();
        nextPayload.title = body.title.trim();
      }
      if (typeof body.status === "string" && body.status.trim()) {
        patch.status = body.status.trim();
      }
      if (body.departmentId !== undefined) {
        patch.departmentId = body.departmentId ? String(body.departmentId) : null;
      }
      if (body.templateId !== undefined) {
        const tid = body.templateId ? String(body.templateId) : null;
        patch.templateId = tid === FALLBACK_INSPECTION_TEMPLATE.id ? null : tid;
      }

      const [row] = await tx
        .update(industrialInspections)
        .set(patch as never)
        .where(eq(industrialInspections.id, recordId))
        .returning();
      return this.mapInspectionRow(row!);
    }, principal.userId);
  }

  async completeInspection(principal: ForgePrincipal, id: string, body: Record<string, unknown> = {}) {
    const recordId = this.assertRecordId(id);
    const appBase =
      (typeof body.appBaseUrl === "string" && body.appBaseUrl.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgepublicsafety.com";

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.id, recordId),
            eq(industrialInspections.tenantId, principal.tenantId),
            isNull(industrialInspections.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Inspection not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const items = parseRunItems(body.items ?? payload.items);
      try {
        assertCanComplete(items);
      } catch (e) {
        throw new ForgeError("VALIDATION_FAILED", e instanceof Error ? e.message : "Cannot complete");
      }

      const responsiblePersonnelId =
        (typeof payload.responsiblePersonnelId === "string" && payload.responsiblePersonnelId) ||
        null;
      const responsibleName =
        (typeof payload.responsibleName === "string" && payload.responsibleName) || "";

      const now = new Date();
      const nextItems: InspectionRunItem[] = [];
      for (const item of items) {
        if (item.answer !== "NO") {
          nextItems.push(item);
          continue;
        }
        if (item.correctiveActionId) {
          nextItems.push(item);
          continue;
        }

        const token = randomBytes(24).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const caId = createId();
        const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        await tx.insert(industrialCorrectiveActions).values({
          id: caId,
          tenantId: principal.tenantId,
          siteId: existing.siteId,
          parentEntityType: "INSPECTION",
          parentEntityId: recordId,
          title: `Inspection finding: ${item.label}`.slice(0, 500),
          description: item.notes ?? "",
          finding: item.notes ?? item.label,
          requiredAction: "Correct the finding and close out with evidence.",
          status: "OPEN",
          assignedPersonnelId: responsiblePersonnelId,
          ownerName: responsibleName || null,
          evidenceNotes: null,
          closeoutTokenHash: tokenHash,
          closeoutTokenExpiresAt: expires,
          sourceSystem: "FORGE",
          sourcePayload: {
            inspectionId: recordId,
            inspectionItemId: item.id,
            inspectionTitle: existing.title,
            photos: item.photos ?? [],
          },
          createdAt: now,
          updatedAt: now,
        } as never);

        // Query token: industrial-web is a static export; path tokens need a
        // CloudFront rewrite (same pattern as /incidents/placeholder).
        const closeoutUrl = `${appBase.replace(/\/$/, "")}/closeout/?token=${encodeURIComponent(token)}`;
        nextItems.push({
          ...item,
          correctiveActionId: caId,
          closeoutUrl,
          closeoutToken: token,
        });
      }

      const nextPayload = {
        ...payload,
        items: nextItems,
        completedAt: now.toISOString(),
      };
      const [row] = await tx
        .update(industrialInspections)
        .set({
          status: "COMPLETED",
          completedAt: now,
          sourcePayload: nextPayload,
          updatedAt: now,
        } as never)
        .where(eq(industrialInspections.id, recordId))
        .returning();

      return this.mapInspectionRow(row!);
    }, principal.userId);
  }

  private async resolveCloseoutTenantId(tokenHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_closeout_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  async getCloseoutByToken(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tenantId = await this.resolveCloseoutTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Close-out link not found");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialCorrectiveActions)
        .where(eq(industrialCorrectiveActions.closeoutTokenHash, tokenHash))
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Close-out link not found");
      if (row.closeoutTokenExpiresAt && row.closeoutTokenExpiresAt.getTime() < Date.now()) {
        throw new ForgeError("BAD_REQUEST", "Close-out link has expired");
      }
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        finding: row.finding,
        status: row.status,
        ownerName: row.ownerName,
        inspectionId: payload.inspectionId ?? row.parentEntityId,
        inspectionItemId: payload.inspectionItemId,
        photos: Array.isArray(payload.photos) ? payload.photos : [],
        completedAt: row.completedAt,
        evidenceNotes: row.evidenceNotes,
      };
    });
  }

  async submitCloseoutByToken(token: string, body: Record<string, unknown>) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (!notes) throw new ForgeError("VALIDATION_FAILED", "Close-out notes are required");
    const completedBy =
      typeof body.completedByName === "string" && body.completedByName.trim()
        ? body.completedByName.trim()
        : "Close-out link";

    const tenantId = await this.resolveCloseoutTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Close-out link not found");

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialCorrectiveActions)
        .where(eq(industrialCorrectiveActions.closeoutTokenHash, tokenHash))
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Close-out link not found");
      if (existing.closeoutTokenExpiresAt && existing.closeoutTokenExpiresAt.getTime() < Date.now()) {
        throw new ForgeError("BAD_REQUEST", "Close-out link has expired");
      }
      if (String(existing.status).toUpperCase() === "COMPLETED") {
        return;
      }

      const now = new Date();
      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const photos = Array.isArray(body.photos) ? body.photos : payload.photos;
      await tx
        .update(industrialCorrectiveActions)
        .set({
          status: "COMPLETED",
          completedAt: now,
          evidenceNotes: notes,
          closeoutCompletedByName: completedBy,
          sourcePayload: { ...payload, closeoutPhotos: photos, closedVia: "public-link" },
          updatedAt: now,
        } as never)
        .where(eq(industrialCorrectiveActions.id, existing.id));
    });

    return this.getCloseoutByToken(token);
  }

  async completeCorrectiveAction(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialCorrectiveActions)
        .where(
          and(
            eq(industrialCorrectiveActions.id, recordId),
            eq(industrialCorrectiveActions.tenantId, principal.tenantId),
            isNull(industrialCorrectiveActions.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Corrective action not found");
      const notes =
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : existing.evidenceNotes;
      const now = new Date();
      const [row] = await tx
        .update(industrialCorrectiveActions)
        .set({
          status: "COMPLETED",
          completedAt: now,
          evidenceNotes: notes,
          closeoutCompletedByName:
            typeof body.completedByName === "string" ? body.completedByName : null,
          updatedAt: now,
        } as never)
        .where(eq(industrialCorrectiveActions.id, recordId))
        .returning();
      return row;
    }, principal.userId);
  }

  async updateDepartmentContact(
    principal: ForgePrincipal,
    departmentId: string,
    body: Record<string, unknown>,
  ) {
    const id = this.assertRecordId(departmentId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const contactPersonnelId = body.contactPersonnelId
        ? String(body.contactPersonnelId)
        : null;
      let contactName =
        typeof body.contactName === "string" ? body.contactName.trim() : "";
      let contactEmail =
        typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
      if (contactPersonnelId) {
        const [person] = await tx
          .select()
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, contactPersonnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (person) {
          contactName = contactName || person.displayName;
          contactEmail = contactEmail || person.email || person.companyEmail || "";
        }
      }
      const [row] = await tx
        .update(industrialDepartments)
        .set({
          contactPersonnelId,
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          updatedAt: new Date(),
        } as never)
        .where(
          and(
            eq(industrialDepartments.id, id),
            eq(industrialDepartments.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Department not found");
      return row;
    }, principal.userId);
  }

  async createInspectionAttachment(
    principal: ForgePrincipal,
    body: Record<string, unknown>,
  ) {
    const entityType = String(body.entityType ?? "INSPECTION_ITEM");
    const entityId = body.entityId ? String(body.entityId) : null;
    const fileName = String(body.fileName ?? body.originalFilename ?? "photo.jpg");
    const contentType = String(body.contentType ?? "image/jpeg");
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!dataUrl.startsWith("data:")) {
      throw new ForgeError("VALIDATION_FAILED", "dataUrl is required for photo upload");
    }
    if (dataUrl.length > 3_500_000) {
      throw new ForgeError("VALIDATION_FAILED", "Photo is too large; compress and retry");
    }
    const id = createId();
    const now = new Date();
    const [row] = await this.db
      .insert(industrialAttachments)
      .values({
        id,
        tenantId: principal.tenantId,
        entityType,
        entityId,
        originalFilename: fileName.slice(0, 255),
        contentType: contentType.slice(0, 200),
        sizeBytes: dataUrl.length,
        storageBucket: "inline",
        storageKey: `inline:${id}`,
        status: "ACTIVE",
        sourceSystem: "FORGE",
        sourcePayload: { dataUrl, fileName, contentType },
        createdAt: now,
        updatedAt: now,
      } as never)
      .returning();
    return {
      id: row!.id,
      fileName,
      contentType,
      dataUrl,
    };
  }

  private async loadInspectionTemplatesInTx(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    tenantId: string,
  ): Promise<InspectionTemplateDto[]> {
    const out: InspectionTemplateDto[] = [];
    const seen = new Set<string>();

    const ehsRows = await tx
      .select()
      .from(platformEhsAuditTemplates)
      .where(
        and(
          eq(platformEhsAuditTemplates.status, "ACTIVE"),
          or(
            eq(platformEhsAuditTemplates.ownershipScope, "PLATFORM_GLOBAL"),
            eq(platformEhsAuditTemplates.tenantId, tenantId),
          ),
        ),
      )
      .limit(100);
    for (const row of ehsRows) {
      const template = templateFromLegacyRow({
        id: row.id,
        name: row.name,
        source: "ehs",
        templateJson: row.templateJson,
        sourcePayload: row.sourcePayload,
      });
      if (template && !seen.has(template.id)) {
        seen.add(template.id);
        out.push(template);
      }
    }

    const imported = await tx
      .select()
      .from(industrialInspections)
      .where(
        and(
          eq(industrialInspections.tenantId, tenantId),
          or(
            eq(industrialInspections.sourceCollection, "inspectionTemplates"),
            eq(industrialInspections.inspectionType, "TEMPLATE"),
            sql`coalesce(${industrialInspections.sourcePayload}->>'isTemplate','') = 'true'`,
          ),
        ),
      )
      .limit(100);
    for (const row of imported) {
      const template = templateFromLegacyRow({
        id: row.id,
        title: row.title,
        source: "imported",
        sourcePayload: row.sourcePayload,
      });
      if (template && !seen.has(template.id)) {
        seen.add(template.id);
        out.push(template);
      }
    }

    const formDefs = await tx
      .select()
      .from(industrialFormDefinitions)
      .where(
        and(
          eq(industrialFormDefinitions.tenantId, tenantId),
          or(
            ilike(industrialFormDefinitions.formKey, "%inspect%"),
            ilike(industrialFormDefinitions.title, "%inspect%"),
          ),
        ),
      )
      .limit(50);
    for (const row of formDefs) {
      const template = templateFromLegacyRow({
        id: row.id,
        title: row.title,
        name: row.title,
        source: "imported",
        schemaJson: row.schemaJson,
        sourcePayload: row.sourcePayload,
      });
      if (template && !seen.has(template.id)) {
        seen.add(template.id);
        out.push(template);
      }
    }

    if (out.length === 0) out.push(FALLBACK_INSPECTION_TEMPLATE);
    else if (!seen.has(FALLBACK_INSPECTION_TEMPLATE.id)) out.push(FALLBACK_INSPECTION_TEMPLATE);
    return out;
  }

  private mapInspectionRow(row: typeof industrialInspections.$inferSelect) {
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    return {
      ...row,
      ...payload,
      id: row.id,
      title: row.title,
      status: row.status,
      departmentId: row.departmentId,
      templateId: row.templateId,
      inspectionType: row.inspectionType,
      completedAt: row.completedAt,
      sourcePayload: payload,
    };
  }

  /**
   * Roster ordering for the personnel directory. Imported rows sometimes only
   * carry display_name, so each key falls back to the matching word of it
   * rather than sorting those people into one blank clump. Ordering is
   * case-insensitive, and id breaks ties so paging cannot repeat or skip a
   * person. Callers that pass no sort keep the recently-updated-first default.
   */
  private personnelOrderBy(sort: string) {
    if (sort === "firstName" || sort === "lastName") {
      const first = sql`lower(coalesce(nullif(btrim(${industrialPersonnel.firstName}), ''), split_part(btrim(${industrialPersonnel.displayName}), ' ', 1)))`;
      const last = sql`lower(coalesce(nullif(btrim(${industrialPersonnel.lastName}), ''), regexp_replace(btrim(${industrialPersonnel.displayName}), '^.*\\s+', '')))`;
      return sort === "firstName"
        ? [first, last, industrialPersonnel.id]
        : [last, first, industrialPersonnel.id];
    }
    return [desc(industrialPersonnel.updatedAt), industrialPersonnel.id];
  }

  async listPersonnel(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const sort = (query.sort ?? "").trim();
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    const archivedOnly =
      query.archived === "true" || query.archived === "1" || query.scope === "archived";
    const companyDriversOnly =
      query.isCompanyDriver === "true" ||
      query.isCompanyDriver === "1" ||
      query.scope === "company-drivers";
    const ppeTrackedOnly =
      query.ppeTracked === "true" ||
      query.ppeTracked === "1" ||
      query.scope === "ppe-allowance";
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialPersonnel.tenantId, principal.tenantId),
        archivedOnly
          ? isNotNull(industrialPersonnel.archivedAt)
          : isNull(industrialPersonnel.archivedAt),
      ];
      if (companyDriversOnly) {
        conditions.push(eq(industrialPersonnel.isCompanyDriver, true));
      }
      if (ppeTrackedOnly) {
        conditions.push(
          or(
            eq(industrialPersonnel.tracksPrescriptionSafetyGlasses, true),
            sql`coalesce(btrim(${industrialPersonnel.safetyFootwearClass}), '') <> ''`,
          )!,
        );
      }
      if (status) conditions.push(eq(industrialPersonnel.status, status));
      if (siteId) conditions.push(eq(industrialPersonnel.siteId, siteId));
      if (q) {
        conditions.push(
          or(
            ilike(industrialPersonnel.displayName, `%${q}%`),
            ilike(industrialPersonnel.employeeNumber, `%${q}%`),
            ilike(industrialPersonnel.email, `%${q}%`),
          )!,
        );
      }
      const items = await tx
        .select()
        .from(industrialPersonnel)
        .where(and(...conditions))
        .orderBy(...this.personnelOrderBy(sort))
        .limit(pageSize)
        .offset(offset);
      // Roster size for the same filters, so the directory can page to the end
      // instead of guessing from the length of the page it just received.
      const [totals] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(industrialPersonnel)
        .where(and(...conditions));
      return {
        page,
        pageSize,
        total: totals?.c ?? items.length,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            displayName: r.displayName,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: this.normalizePersonnelPayload(
              this.unwrapSourcePayload(r.sourcePayload),
            ),
            extra: {
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              employeeNumber: r.employeeNumber,
              siteId: r.siteId,
              departmentId: r.departmentId,
              positionId: r.positionId,
              ...this.personnelReadValues(r as unknown as Record<string, unknown>),
            },
          }),
        ),
      };
    });
  }

  async getPersonnel(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, recordId),
            eq(industrialPersonnel.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Personnel not found");
      const training = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(
          and(
            eq(industrialTrainingRecords.tenantId, principal.tenantId),
            eq(industrialTrainingRecords.personnelId, id),
            isNull(industrialTrainingRecords.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingRecords.updatedAt))
        .limit(25);

      const normalizedPayload = this.normalizePersonnelPayload(
        this.unwrapSourcePayload(row.sourcePayload),
      );
      const readValues = this.personnelReadValues(row as unknown as Record<string, unknown>);
      const isCompanyDriver =
        readValues.isCompanyDriver === true ||
        normalizedPayload.isCompanyDriver === true ||
        normalizedPayload.isCompanyDriver === "true";

      const [linkedDriver] = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            eq(industrialFleetDrivers.personnelId, recordId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .limit(1);

      const [linkedDot] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            eq(industrialDotComplianceRecords.personnelId, recordId),
            isNull(industrialDotComplianceRecords.archivedAt),
          ),
        )
        .orderBy(desc(industrialDotComplianceRecords.updatedAt))
        .limit(1);

      const driverPayload = linkedDriver
        ? this.unwrapSourcePayload(linkedDriver.sourcePayload)
        : null;
      const dotPayload = linkedDot
        ? this.unwrapSourcePayload(linkedDot.sourcePayload)
        : null;
      const licenseProjection = this.projectLicenseCopies({
        personnelPayload: { ...normalizedPayload, ...readValues },
        driverPayload,
        dotPayload,
        isCompanyDriver: !!isCompanyDriver,
      });

      return {
        ...this.mapListItem({
          id: row.id,
          displayName: row.displayName,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: normalizedPayload,
          extra: {
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            employeeNumber: row.employeeNumber,
            siteId: row.siteId,
            departmentId: row.departmentId,
            positionId: row.positionId,
            // Columns win over the legacy sourcePayload copy of the same keys
            // when they are actually filled; blanks no longer wipe payload.
            ...readValues,
            ...licenseProjection,
            companyDriverId: linkedDriver?.id ?? null,
            dotRecordId: linkedDot?.id ?? null,
          },
        }),
        training: training.map((t) =>
          this.mapListItem({
            id: t.id,
            title: t.title ?? t.courseName,
            status: t.status,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            sourcePayload: t.sourcePayload,
            extra: {
              courseName: t.courseName,
              completedAt: t.completedAt?.toISOString() ?? null,
              expiresAt: t.expiresAt?.toISOString() ?? null,
            },
          }),
        ),
      };
    });
  }

  /**
   * Safety profile for one person: counts + linked records so the personnel
   * file can open Incidents / Training / Forms the same way the legacy roster
   * profile did. Matching uses personnel_id when present, otherwise the
   * employee number / display name inside source_payload (roster imports).
   */
  async personnelAnalytics(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [person] = await tx
        .select()
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, recordId),
            eq(industrialPersonnel.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

      const displayName = (person.displayName ?? "").trim();
      const employeeNumber = (person.employeeNumber ?? "").trim();
      const searchHint = employeeNumber || displayName;

      // source_payload exists on every industrial record table we query here;
      // drizzle column brands differ per table so we accept the column loosely.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloadMatchSql = (sourcePayload: any) => {
        const textBits = [
          sql`${sourcePayload}::text ilike ${`%${recordId}%`}`,
          ...(employeeNumber
            ? [sql`${sourcePayload}::text ilike ${`%${employeeNumber}%`}`]
            : []),
          ...(displayName.length >= 3
            ? [sql`${sourcePayload}::text ilike ${`%${displayName}%`}`]
            : []),
        ];
        return or(...textBits)!;
      };

      const toItem = (
        row: {
          id: string;
          title?: string | null;
          status: string;
          updatedAt: Date;
          createdAt?: Date;
          date?: string | null;
        },
        module: string,
        labelFallback: string,
      ) => ({
        id: row.id,
        module,
        label: (row.title && row.title.trim()) || labelFallback,
        date: row.date || row.updatedAt.toISOString(),
        status: row.status,
        href: `/modules/${module}/?q=${encodeURIComponent(searchHint || row.id)}`,
      });

      const isOpen = (status: string) => {
        const s = status.toLowerCase();
        return s.includes("open") || s === "active" || s === "in_progress" || s === "in progress";
      };
      const isPast = (iso: string | null | undefined) => {
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return !Number.isNaN(t) && t < Date.now();
      };
      const expiringSoon = (iso: string | null | undefined) => {
        if (!iso) return false;
        const t = new Date(iso).getTime();
        if (Number.isNaN(t)) return false;
        const now = Date.now();
        return t >= now && t <= now + 30 * 24 * 60 * 60 * 1000;
      };
      const latest = (dates: Array<string | null | undefined>) => {
        const sorted = dates
          .map((d) => (typeof d === "string" ? d.trim() : ""))
          .filter((d) => d !== "")
          .sort((a, b) => b.localeCompare(a));
        return sorted[0] ?? null;
      };

      const [incidents, observations, training, submissions, templates, workersComp, fleetDrivers, dot, forklifts, confined] =
        await Promise.all([
          tx
            .select()
            .from(industrialIncidents)
            .where(
              and(
                eq(industrialIncidents.tenantId, principal.tenantId),
                isNull(industrialIncidents.archivedAt),
                payloadMatchSql(industrialIncidents.sourcePayload),
              ),
            )
            .orderBy(desc(industrialIncidents.updatedAt))
            .limit(50),
          tx
            .select()
            .from(industrialObservations)
            .where(
              and(
                eq(industrialObservations.tenantId, principal.tenantId),
                isNull(industrialObservations.archivedAt),
                payloadMatchSql(industrialObservations.sourcePayload),
              ),
            )
            .orderBy(desc(industrialObservations.updatedAt))
            .limit(50),
          tx
            .select()
            .from(industrialTrainingRecords)
            .where(
              and(
                eq(industrialTrainingRecords.tenantId, principal.tenantId),
                isNull(industrialTrainingRecords.archivedAt),
                or(
                  eq(industrialTrainingRecords.personnelId, recordId),
                  payloadMatchSql(industrialTrainingRecords.sourcePayload),
                )!,
              ),
            )
            .orderBy(desc(industrialTrainingRecords.updatedAt))
            .limit(50),
          tx
            .select()
            .from(industrialFormSubmissions)
            .where(
              and(
                eq(industrialFormSubmissions.tenantId, principal.tenantId),
                isNull(industrialFormSubmissions.archivedAt),
                payloadMatchSql(industrialFormSubmissions.sourcePayload),
              ),
            )
            .orderBy(desc(industrialFormSubmissions.updatedAt))
            .limit(50),
          tx
            .select()
            .from(industrialFormDefinitions)
            .where(
              and(
                eq(industrialFormDefinitions.tenantId, principal.tenantId),
                isNull(industrialFormDefinitions.archivedAt),
              ),
            )
            .orderBy(desc(industrialFormDefinitions.updatedAt))
            .limit(50),
          tx
            .select()
            .from(industrialWorkersCompCases)
            .where(
              and(
                eq(industrialWorkersCompCases.tenantId, principal.tenantId),
                isNull(industrialWorkersCompCases.archivedAt),
                or(
                  eq(industrialWorkersCompCases.personnelId, recordId),
                  payloadMatchSql(industrialWorkersCompCases.sourcePayload),
                )!,
              ),
            )
            .limit(50),
          tx
            .select()
            .from(industrialFleetDrivers)
            .where(
              and(
                eq(industrialFleetDrivers.tenantId, principal.tenantId),
                isNull(industrialFleetDrivers.archivedAt),
                or(
                  eq(industrialFleetDrivers.personnelId, recordId),
                  payloadMatchSql(industrialFleetDrivers.sourcePayload),
                )!,
              ),
            )
            .limit(25),
          tx
            .select()
            .from(industrialDotComplianceRecords)
            .where(
              and(
                eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
                isNull(industrialDotComplianceRecords.archivedAt),
                or(
                  eq(industrialDotComplianceRecords.personnelId, recordId),
                  payloadMatchSql(industrialDotComplianceRecords.sourcePayload),
                )!,
              ),
            )
            .limit(50),
          tx
            .select()
            .from(industrialForkliftRecords)
            .where(
              and(
                eq(industrialForkliftRecords.tenantId, principal.tenantId),
                isNull(industrialForkliftRecords.archivedAt),
                or(
                  eq(industrialForkliftRecords.personnelId, recordId),
                  payloadMatchSql(industrialForkliftRecords.sourcePayload),
                )!,
              ),
            )
            .limit(50),
          tx
            .select()
            .from(industrialConfinedSpaceRecords)
            .where(
              and(
                eq(industrialConfinedSpaceRecords.tenantId, principal.tenantId),
                isNull(industrialConfinedSpaceRecords.archivedAt),
                or(
                  eq(industrialConfinedSpaceRecords.personnelId, recordId),
                  payloadMatchSql(industrialConfinedSpaceRecords.sourcePayload),
                )!,
              ),
            )
            .limit(50),
        ]);

      const incidentItems = incidents.map((r) => {
        const payload =
          r.sourcePayload && typeof r.sourcePayload === "object" && !Array.isArray(r.sourcePayload)
            ? (r.sourcePayload as Record<string, unknown>)
            : {};
        const role =
          typeof payload.reportedBy === "string" &&
          displayName &&
          String(payload.reportedBy).toLowerCase().includes(displayName.toLowerCase())
            ? "reporter"
            : "subject";
        return {
          ...toItem(
            {
              id: r.id,
              title: r.title,
              status: r.status,
              updatedAt: r.updatedAt,
              date:
                typeof payload.dateOccurred === "string"
                  ? payload.dateOccurred
                  : r.updatedAt.toISOString(),
            },
            "incidents",
            "Incident",
          ),
          role,
          recordable: Boolean(payload.oshaRecordable || payload.recordable),
        };
      });

      const observationItems = observations.map((r) =>
        toItem(
          { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt },
          "observations",
          "Observation",
        ),
      );

      const trainingItems = training.map((r) =>
        toItem(
          {
            id: r.id,
            title: r.title ?? r.courseName,
            status: r.status,
            updatedAt: r.updatedAt,
            date: r.completedAt?.toISOString() ?? r.updatedAt.toISOString(),
          },
          "training",
          "Training record",
        ),
      );

      const submissionItems = submissions.map((r) =>
        toItem(
          {
            id: r.id,
            title: r.title,
            status: r.status,
            updatedAt: r.updatedAt,
            date: r.submittedAt?.toISOString() ?? r.updatedAt.toISOString(),
          },
          "forms",
          "Form submission",
        ),
      );

      const templateItems = templates.map((r) =>
        toItem(
          { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt },
          "forms",
          "Form template",
        ),
      );

      const qualificationItems = [
        ...dot.map((r) =>
          toItem(
            { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt },
            "dot-compliance",
            "DOT qualification",
          ),
        ),
        ...forklifts.map((r) =>
          toItem(
            { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt },
            "forklifts",
            "Forklift qualification",
          ),
        ),
        ...confined.map((r) =>
          toItem(
            { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt },
            "confined-space",
            "Confined space authorization",
          ),
        ),
        ...workersComp.map((r) =>
          toItem(
            {
              id: r.id,
              title: r.caseNumber ?? "Workers' comp case",
              status: r.status,
              updatedAt: r.updatedAt,
            },
            "workers-comp",
            "Workers' comp case",
          ),
        ),
        ...fleetDrivers.map((r) =>
          toItem(
            {
              id: r.id,
              title: r.personnelName ?? "Company driver",
              status: r.status,
              updatedAt: r.updatedAt,
            },
            "fleet",
            "Company driver",
          ),
        ),
      ];

      const completedTraining = training.filter((t) => {
        const s = t.status.toLowerCase();
        return s.includes("complete") || Boolean(t.completedAt);
      });
      const inProgressTraining = training.filter((t) => {
        const s = t.status.toLowerCase();
        return s.includes("progress") || s === "active" || s === "enrolled";
      });
      const overdueTraining = training.filter(
        (t) =>
          inProgressTraining.some((p) => p.id === t.id) &&
          isPast(t.expiresAt?.toISOString() ?? null),
      );
      const certificates = training.filter((t) => Boolean(t.completedAt) || Boolean(t.expiresAt));
      const expiringCertificates = certificates.filter((t) =>
        expiringSoon(t.expiresAt?.toISOString() ?? null),
      );

      const recentActivity = [
        ...incidentItems,
        ...observationItems,
        ...submissionItems,
        ...trainingItems,
        ...qualificationItems.slice(0, 6),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12);

      const body = {
        incidents: {
          total: incidentItems.length,
          open: incidentItems.filter((i) => isOpen(i.status)).length,
          recordable: incidentItems.filter((i) => i.recordable).length,
          asSubject: incidentItems.filter((i) => i.role === "subject").length,
          asReporter: incidentItems.filter((i) => i.role === "reporter").length,
          lastDate: latest(incidentItems.map((i) => i.date)),
          items: incidentItems.map(({ role: _role, recordable: _r, ...item }) => item),
        },
        observations: {
          total: observationItems.length,
          open: observationItems.filter((i) => isOpen(i.status)).length,
          lastDate: latest(observationItems.map((i) => i.date)),
          items: observationItems,
        },
        forms: {
          total: submissionItems.length,
          submitted: submissionItems.filter((i) => {
            const s = i.status.toLowerCase();
            return s.includes("submit") || s === "complete" || s === "completed";
          }).length,
          drafts: submissionItems.filter((i) => i.status.toLowerCase().includes("draft")).length,
          lastDate: latest(submissionItems.map((i) => i.date)),
          templates: templateItems,
          submissions: submissionItems,
        },
        training: {
          enrollments: trainingItems.length,
          completed: completedTraining.length,
          inProgress: inProgressTraining.length,
          overdue: overdueTraining.length,
          certificates: certificates.length,
          expiringCertificates: expiringCertificates.length,
          lastActivityDate: latest(trainingItems.map((i) => i.date)),
          items: trainingItems,
        },
        qualifications: {
          total: qualificationItems.length,
          active: qualificationItems.filter((i) => !i.status.toLowerCase().includes("expir")).length,
          expiringSoon: qualificationItems.filter((i) =>
            i.status.toLowerCase().includes("expir"),
          ).length,
          expired: qualificationItems.filter((i) => i.status.toLowerCase() === "expired").length,
          items: qualificationItems,
        },
        scanActivity: {
          completions: 0,
          lastDate: null as string | null,
          items: [] as typeof trainingItems,
        },
        recentActivity,
      };

      let safetyScore = 100;
      safetyScore -= body.incidents.open * 12;
      safetyScore -= body.incidents.recordable * 8;
      safetyScore -= body.training.overdue * 6;
      safetyScore -= body.qualifications.expired * 5;
      safetyScore -= body.qualifications.expiringSoon * 2;
      safetyScore += Math.min(body.training.completed * 2, 10);
      safetyScore += Math.min(body.observations.total, 5);
      safetyScore = Math.max(0, Math.min(100, Math.round(safetyScore)));

      return {
        personId: recordId,
        safetyScore,
        searchHint,
        ...body,
      };
    });
  }

  async createPersonnel(principal: ForgePrincipal, body: Record<string, unknown>) {
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    if (!firstName || !lastName) {
      throw new ForgeError("VALIDATION_FAILED", "First name and last name are required.");
    }
    const displayName =
      String(body.displayName ?? "").trim() || `${firstName} ${lastName}`.trim();
    const status = String(body.status ?? "Active").trim() || "Active";
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialPersonnel)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          firstName,
          lastName,
          displayName,
          email: body.email ? String(body.email) : null,
          employeeNumber: body.employeeNumber ? String(body.employeeNumber) : null,
          siteId: body.siteId ? String(body.siteId) : null,
          departmentId: body.departmentId ? String(body.departmentId) : null,
          positionId: body.positionId ? String(body.positionId) : null,
          ...this.personnelInsertValues(body),
          status,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        } as never)
        .returning();
      return this.mapListItem({
        id: row!.id,
        displayName: row!.displayName,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
        extra: this.personnelReadValues(row as unknown as Record<string, unknown>),
      });
    });
  }

  async updatePersonnel(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, recordId),
            eq(industrialPersonnel.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Personnel not found");
      const now = new Date();
      const firstName = body.firstName != null ? String(body.firstName) : existing.firstName;
      const lastName = body.lastName != null ? String(body.lastName) : existing.lastName;
      const displayName =
        body.displayName != null
          ? String(body.displayName)
          : `${firstName ?? ""} ${lastName ?? ""}`.trim() || existing.displayName;
      const [row] = await tx
        .update(industrialPersonnel)
        .set({
          firstName,
          lastName,
          displayName,
          email: body.email != null ? String(body.email) : existing.email,
          employeeNumber:
            body.employeeNumber != null ? String(body.employeeNumber) : existing.employeeNumber,
          status: body.status != null ? String(body.status) : existing.status,
          siteId: optionalUuid(body.siteId, existing.siteId),
          departmentId: optionalUuid(body.departmentId, existing.departmentId),
          positionId: optionalUuid(body.positionId, existing.positionId),
          ...this.personnelUpdateValues(body, existing as unknown as Record<string, unknown>),
          sourcePayload: { ...(existing.sourcePayload as object), ...body },
          updatedAt: now,
          archivedAt:
            String(body.status ?? "").toLowerCase() === "inactive" ||
            String(body.status ?? "").toLowerCase() === "terminated"
              ? existing.archivedAt ?? now
              : existing.archivedAt,
        })
        .where(eq(industrialPersonnel.id, recordId))
        .returning();

      // Keep company-driver roster license copies in sync with the personnel file.
      const licenseTouched =
        Object.prototype.hasOwnProperty.call(body, "licenseFrontUrl") ||
        Object.prototype.hasOwnProperty.call(body, "licenseBackUrl") ||
        Object.prototype.hasOwnProperty.call(body, "licenseFrontUpload") ||
        Object.prototype.hasOwnProperty.call(body, "licenseBackUpload");
      if (licenseTouched) {
        const [linkedDriver] = await tx
          .select()
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.tenantId, principal.tenantId),
              eq(industrialFleetDrivers.personnelId, recordId),
              isNull(industrialFleetDrivers.archivedAt),
            ),
          )
          .limit(1);
        if (linkedDriver) {
          const driverPayload = this.unwrapSourcePayload(linkedDriver.sourcePayload);
          const nextPayload: Record<string, unknown> = { ...driverPayload };
          if (Object.prototype.hasOwnProperty.call(body, "licenseFrontUpload")) {
            nextPayload.licenseFrontUpload = body.licenseFrontUpload;
          } else if (typeof body.licenseFrontUrl === "string") {
            const front = String(body.licenseFrontUrl).trim();
            nextPayload.licenseFrontUpload = front
              ? {
                  dataUrl: front.startsWith("data:") ? front : undefined,
                  url: front.startsWith("http") ? front : undefined,
                  fileName: "drivers-license-front.jpg",
                  contentType: "image/jpeg",
                  uploadedAt: now.toISOString(),
                }
              : null;
          }
          if (Object.prototype.hasOwnProperty.call(body, "licenseBackUpload")) {
            nextPayload.licenseBackUpload = body.licenseBackUpload;
          } else if (typeof body.licenseBackUrl === "string") {
            const back = String(body.licenseBackUrl).trim();
            nextPayload.licenseBackUpload = back
              ? {
                  dataUrl: back.startsWith("data:") ? back : undefined,
                  url: back.startsWith("http") ? back : undefined,
                  fileName: "drivers-license-back.jpg",
                  contentType: "image/jpeg",
                  uploadedAt: now.toISOString(),
                }
              : null;
          }
          await tx
            .update(industrialFleetDrivers)
            .set({ sourcePayload: nextPayload, updatedAt: now })
            .where(eq(industrialFleetDrivers.id, linkedDriver.id));
        }
      }

      return this.mapListItem({
        id: row!.id,
        displayName: row!.displayName,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
      });
    });
  }

  /**
   * Company vehicle / insurance driver roster (Firebase companyVehicleDrivers).
   * Status values stay as imported: on_insurance, pending_mvr, suspended, removed.
   */
  async listCompanyVehicleDrivers(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim().toLowerCase();
    const status = (query.status ?? "").trim().toLowerCase();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .orderBy(desc(industrialFleetDrivers.updatedAt));

      const mapped = rows.map((row) => {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const licenseExpiryDate = String(
          payload.licenseExpiryDate ?? payload.licenseExpiry ?? payload.license_expiry_date ?? "",
        ).trim();
        const personnelName = String(
          row.personnelName ?? payload.personnelName ?? "",
        ).trim();
        const employeeNumber = String(payload.employeeNumber ?? "").trim();
        const driverStatus = String(payload.status ?? row.status ?? "").trim();
        const mvrUploads = this.uploadList(payload.mvrUploads);
        const mvrReleaseUploads = this.uploadList(payload.mvrReleaseUploads);
        const sampleYear = Number(payload.sampleYear);
        return {
          id: row.id,
          personnelId: row.personnelId ?? (typeof payload.personnelId === "string" ? payload.personnelId : null),
          personnelName,
          employeeNumber,
          dateOfBirth: String(payload.dateOfBirth ?? "").trim(),
          licenseNumber: String(row.licenseNumber ?? payload.licenseNumber ?? "").trim(),
          licenseState: String(row.licenseState ?? payload.licenseState ?? "").trim(),
          licenseExpiryDate,
          hasLicenseFront: this.hasUpload(payload.licenseFrontUpload),
          hasLicenseBack: this.hasUpload(payload.licenseBackUpload),
          status: driverStatus,
          initialMvrDate: String(payload.initialMvrDate ?? "").trim(),
          lastMvrDate: String(payload.lastMvrDate ?? "").trim(),
          nextMvrDueDate: String(payload.nextMvrDueDate ?? "").trim(),
          mvrReleaseDate: String(payload.mvrReleaseDate ?? "").trim(),
          mvrReleaseUploadCount: mvrReleaseUploads.length,
          mvrUploadCount: mvrUploads.length,
          lastMvrUploadAt: this.latestUploadAt(mvrUploads),
          sampleYear: Number.isFinite(sampleYear) && sampleYear > 0 ? sampleYear : null,
          sampleSelectedAt: String(payload.sampleSelectedAt ?? "").trim(),
          sampleCompletedAt: String(payload.sampleCompletedAt ?? "").trim(),
          mvrAuditHistory: parseMvrAuditHistory(payload.mvrAuditHistory),
          insuranceEffectiveDate: String(payload.insuranceEffectiveDate ?? "").trim(),
          insuranceRemovedDate: String(payload.insuranceRemovedDate ?? "").trim(),
          notes: String(payload.notes ?? "").trim(),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      const filtered = mapped.filter((item) => {
        if (status && item.status.toLowerCase() !== status) return false;
        if (!q) return true;
        const hay = `${item.personnelName} ${item.employeeNumber} ${item.licenseNumber}`.toLowerCase();
        return hay.includes(q);
      });

      const notRemoved = mapped.filter((item) => item.status.toLowerCase() !== "removed");
      const today = new Date().toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sampleYears = mapped
        .map((item) => item.sampleYear)
        .filter((year): year is number => typeof year === "number");
      const summary = {
        total: mapped.length,
        onInsurance: mapped.filter((item) => item.status.toLowerCase() === "on_insurance").length,
        pendingMvr: mapped.filter((item) => item.status.toLowerCase() === "pending_mvr").length,
        suspended: mapped.filter((item) => item.status.toLowerCase() === "suspended").length,
        removed: mapped.filter((item) => item.status.toLowerCase() === "removed").length,
        missingLicenseExpiry: notRemoved.filter((item) => item.licenseExpiryDate === "").length,
        licenseExpired: notRemoved.filter(
          (item) => item.licenseExpiryDate !== "" && item.licenseExpiryDate < today,
        ).length,
        licenseExpiringSoon: notRemoved.filter(
          (item) =>
            item.licenseExpiryDate !== "" &&
            item.licenseExpiryDate >= today &&
            item.licenseExpiryDate <= soon,
        ).length,
        mvrOnFile: mapped.filter((item) => item.mvrUploadCount > 0).length,
        mvrReleaseOnFile: mapped.filter(
          (item) => item.mvrReleaseDate !== "" || item.mvrReleaseUploadCount > 0,
        ).length,
        sampleYear: sampleYears.length > 0 ? Math.max(...sampleYears) : null,
        sampleSelected: 0,
        sampleCompleted: 0,
      };
      if (summary.sampleYear !== null) {
        const inSample = mapped.filter((item) => item.sampleYear === summary.sampleYear);
        summary.sampleSelected = inSample.length;
        summary.sampleCompleted = inSample.filter((item) => item.sampleCompletedAt !== "").length;
      }

      return {
        page,
        pageSize,
        total: filtered.length,
        items: filtered.slice(offset, offset + pageSize),
        summary,
      };
    });
  }

  /**
   * Start (or return) the annual 10% MVR sample for a calendar year.
   * Idempotent for the year unless forceRedraw is true.
   */
  async startCompanyDriverMvrSample(
    principal: ForgePrincipal,
    body: Record<string, unknown> = {},
  ) {
    const yearRaw = Number(body.year);
    const year =
      Number.isFinite(yearRaw) && yearRaw >= 2000
        ? Math.trunc(yearRaw)
        : new Date().getUTCFullYear();
    const forceRedraw = body.force === true || body.forceRedraw === true;
    const selectedAt = new Date().toISOString();

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        );

      const mapped = rows.map((row) => {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const sampleYear = Number(payload.sampleYear);
        return {
          id: row.id,
          status: String(payload.status ?? row.status ?? "").trim(),
          sampleYear: Number.isFinite(sampleYear) && sampleYear > 0 ? sampleYear : null,
          row,
          payload,
        };
      });

      const existingIds = mapped
        .filter((item) => item.sampleYear === year)
        .map((item) => item.id);
      let selectedIds = existingIds;
      if (forceRedraw || existingIds.length === 0) {
        if (forceRedraw && existingIds.length > 0) {
          for (const item of mapped.filter((row) => row.sampleYear === year)) {
            const nextPayload = { ...item.payload };
            delete nextPayload.sampleYear;
            delete nextPayload.sampleSelectedAt;
            delete nextPayload.sampleCompletedAt;
            await tx
              .update(industrialFleetDrivers)
              .set({
                sourcePayload: nextPayload,
                updatedAt: new Date(),
              } as never)
              .where(eq(industrialFleetDrivers.id, item.id));
            item.sampleYear = null;
            item.payload = nextPayload;
          }
        }
        selectedIds = selectMvrSampleIds(
          mapped.map((item) => ({
            id: item.id,
            status: item.status,
            sampleYear: item.sampleYear,
          })),
          year,
        );
        for (const id of selectedIds) {
          const item = mapped.find((row) => row.id === id);
          if (!item) continue;
          const nextPayload = {
            ...item.payload,
            sampleYear: year,
            sampleSelectedAt: selectedAt,
            sampleCompletedAt: "",
          };
          await tx
            .update(industrialFleetDrivers)
            .set({
              sourcePayload: nextPayload,
              updatedAt: new Date(),
            } as never)
            .where(eq(industrialFleetDrivers.id, id));
        }
      }

      const [settings] = await tx
        .select()
        .from(industrialFleetDriverSettings)
        .where(eq(industrialFleetDriverSettings.tenantId, principal.tenantId))
        .limit(1);
      if (settings) {
        await tx
          .update(industrialFleetDriverSettings)
          .set({
            lastSampleYear: year,
            updatedAt: new Date(),
          } as never)
          .where(eq(industrialFleetDriverSettings.id, settings.id));
      } else {
        await tx.insert(industrialFleetDriverSettings).values({
          id: createId(),
          tenantId: principal.tenantId,
          lastSampleYear: year,
          emailOnRemoval: false,
          settings: {},
          sourceSystem: "FORGE",
          sourcePayload: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
      }

      return {
        year,
        selectedCount: selectedIds.length,
        redrawn: forceRedraw || existingIds.length === 0,
        selectedIds,
      };
    }, principal.userId);
  }

  /** Mark a sampled driver as MVR-audited for their sample year; append history on driver + personnel. */
  async completeCompanyDriverMvrSample(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = this.assertRecordId(id);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const auditedByName =
      typeof body.auditedByName === "string" && body.auditedByName.trim()
        ? body.auditedByName.trim()
        : "Auditor";
    const auditedAt = new Date().toISOString();

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.id, recordId),
            eq(industrialFleetDrivers.tenantId, principal.tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Company driver not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const sampleYear = Number(payload.sampleYear);
      if (!Number.isFinite(sampleYear) || sampleYear <= 0) {
        throw new ForgeError("VALIDATION_FAILED", "This driver is not in the current MVR sample");
      }

      const entry = {
        year: sampleYear,
        auditedAt,
        auditedByName,
        driverId: recordId,
        notes,
      };
      const nextPayload = {
        ...payload,
        sampleCompletedAt: auditedAt,
        lastMvrDate: auditedAt.slice(0, 10),
        mvrAuditHistory: appendMvrAuditEntry(payload.mvrAuditHistory, entry),
      };

      const [row] = await tx
        .update(industrialFleetDrivers)
        .set({
          lastMvrDate: auditedAt.slice(0, 10),
          sourcePayload: nextPayload,
          updatedAt: new Date(),
        } as never)
        .where(eq(industrialFleetDrivers.id, recordId))
        .returning();

      const personnelId =
        existing.personnelId ??
        (typeof payload.personnelId === "string" && payload.personnelId
          ? payload.personnelId
          : null);
      if (personnelId) {
        const [person] = await tx
          .select()
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (person) {
          const personPayload = this.unwrapSourcePayload(person.sourcePayload);
          await tx
            .update(industrialPersonnel)
            .set({
              sourcePayload: {
                ...personPayload,
                mvrAuditHistory: appendMvrAuditEntry(personPayload.mvrAuditHistory, entry),
              },
              updatedAt: new Date(),
            } as never)
            .where(eq(industrialPersonnel.id, personnelId));
        }
      }

      return {
        id: row!.id,
        sampleYear,
        sampleCompletedAt: auditedAt,
        mvrAuditHistory: parseMvrAuditHistory(nextPayload.mvrAuditHistory),
        personnelId,
      };
    }, principal.userId);
  }

  /**
   * Distinct division names and supervisor frequency keyed by
   * Division + Location + Department. Used by Add Person to populate the
   * division dropdown and auto-fill supervisor.
   *
   * Division options = tenant catalog (tenant_settings industrial /
   * personnel.divisions) union distinct division_name values already on the
   * roster. Catalog covers the empty-roster case; roster values keep imported
   * or newly typed divisions available.
   */
  async personnelPpeSummary(principal: ForgePrincipal) {
    const warningDays = 30;
    const today = new Date();
    const startOfDay = (date: Date) =>
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const asDay = (value: string | Date | null | undefined) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }
      return value == null ? null : String(value);
    };
    const expiryStatus = (
      expiresValue: string | Date | null | undefined,
      issuedValue?: string | Date | null,
    ) => {
      const issuedRaw = asDay(issuedValue);
      if (issuedRaw) {
        const issuedMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(issuedRaw.trim());
        if (issuedMatch) {
          const issued = Date.UTC(
            Number(issuedMatch[1]),
            Number(issuedMatch[2]) - 1,
            Number(issuedMatch[3]),
          );
          if (issued > startOfDay(today)) return "scheduled";
        }
      }
      const expiresRaw = asDay(expiresValue);
      if (!expiresRaw) return "none";
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiresRaw.trim());
      if (!match) return "none";
      const expires = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      const days = Math.floor((expires - startOfDay(today)) / 86_400_000);
      if (days < 0) return "expired";
      if (days <= warningDays) return "expiring_soon";
      return "ok";
    };

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select({
          tracksPrescriptionSafetyGlasses: industrialPersonnel.tracksPrescriptionSafetyGlasses,
          safetyFootwearClass: industrialPersonnel.safetyFootwearClass,
          prescriptionSafetyGlassesIssuedDate:
            industrialPersonnel.prescriptionSafetyGlassesIssuedDate,
          prescriptionSafetyGlassesExpiresDate:
            industrialPersonnel.prescriptionSafetyGlassesExpiresDate,
          safetyFootwearIssuedDate: industrialPersonnel.safetyFootwearIssuedDate,
          safetyFootwearExpiresDate: industrialPersonnel.safetyFootwearExpiresDate,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, principal.tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        );

      let prescriptionGlassesCount = 0;
      let safetyFootwearCount = 0;
      let prescriptionGlassesExpiringSoon = 0;
      let safetyFootwearExpiringSoon = 0;
      let prescriptionGlassesExpired = 0;
      let safetyFootwearExpired = 0;

      for (const row of rows) {
        if (row.tracksPrescriptionSafetyGlasses) {
          prescriptionGlassesCount += 1;
          const status = expiryStatus(
            row.prescriptionSafetyGlassesExpiresDate,
            row.prescriptionSafetyGlassesIssuedDate,
          );
          if (status === "expiring_soon") prescriptionGlassesExpiringSoon += 1;
          if (status === "expired") prescriptionGlassesExpired += 1;
        }
        const footwearClass = row.safetyFootwearClass?.trim() ?? "";
        if (footwearClass !== "") {
          safetyFootwearCount += 1;
          const status = expiryStatus(row.safetyFootwearExpiresDate, row.safetyFootwearIssuedDate);
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
    });
  }

  async personnelAssignmentOptions(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [rows, catalogRow] = await Promise.all([
        tx
          .select({
            divisionName: industrialPersonnel.divisionName,
            siteId: industrialPersonnel.siteId,
            departmentId: industrialPersonnel.departmentId,
            supervisorName: industrialPersonnel.supervisorName,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.tenantId, principal.tenantId),
              isNull(industrialPersonnel.archivedAt),
            ),
          ),
        tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, "industrial"),
            eq(tenantSettings.settingKey, "personnel.divisions"),
          ),
        }),
      ]);

      const divisions = new Set<string>();
      const catalog = catalogRow?.valueJson;
      if (Array.isArray(catalog)) {
        for (const entry of catalog) {
          if (typeof entry === "string" && entry.trim() !== "") {
            divisions.add(entry.trim());
          }
        }
      }

      const counts = new Map<
        string,
        {
          divisionName: string;
          siteId: string;
          departmentId: string;
          supervisorName: string;
          count: number;
        }
      >();

      for (const row of rows) {
        const divisionName = row.divisionName?.trim() ?? "";
        if (divisionName !== "") divisions.add(divisionName);

        const supervisorName = row.supervisorName?.trim() ?? "";
        const siteId = row.siteId?.trim() ?? "";
        const departmentId = row.departmentId?.trim() ?? "";
        if (!divisionName || !supervisorName || !siteId || !departmentId) continue;

        const key = `${divisionName.toLowerCase()}|${siteId}|${departmentId}|${supervisorName.toLowerCase()}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else {
          counts.set(key, {
            divisionName,
            siteId,
            departmentId,
            supervisorName,
            count: 1,
          });
        }
      }

      return {
        divisions: [...divisions].sort((a, b) => a.localeCompare(b)),
        supervisors: [...counts.values()],
      };
    });
  }

  async listSites(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const items = await tx
        .select()
        .from(industrialSites)
        .where(
          and(eq(industrialSites.tenantId, principal.tenantId), isNull(industrialSites.archivedAt)),
        )
        .orderBy(desc(industrialSites.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            name: r.name,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
          }),
        ),
      };
    });
  }

  async listEquipment(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialEquipment.tenantId, principal.tenantId),
        isNull(industrialEquipment.archivedAt),
      ];
      if (q) {
        conditions.push(
          or(
            ilike(industrialEquipment.name, `%${q}%`),
            ilike(industrialEquipment.equipmentNumber, `%${q}%`),
          )!,
        );
      }
      const items = await tx
        .select()
        .from(industrialEquipment)
        .where(and(...conditions))
        .orderBy(desc(industrialEquipment.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            name: r.name,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: {
              ...(typeof r.sourcePayload === "object" && r.sourcePayload
                ? (r.sourcePayload as object)
                : {}),
              equipmentName: r.name,
              equipmentNumber: r.equipmentNumber,
              equipmentType: r.equipmentType,
            },
          }),
        ),
      };
    });
  }

  async createEquipment(principal: ForgePrincipal, body: Record<string, unknown>) {
    const name = String(body.name ?? body.equipmentName ?? "").trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Equipment name is required.");
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialEquipment)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          name,
          equipmentNumber: body.equipmentNumber ? String(body.equipmentNumber) : null,
          equipmentType: body.equipmentType ? String(body.equipmentType) : null,
          siteId: body.siteId ? String(body.siteId) : null,
          status: String(body.status ?? "ACTIVE"),
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapListItem({
        id: row!.id,
        name: row!.name,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
      });
    });
  }

  async archiveEquipment(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(industrialEquipment)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(
            eq(industrialEquipment.id, recordId),
            eq(industrialEquipment.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Equipment not found");
      return this.mapListItem({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
      });
    });
  }

  async getLotoDetail(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [proc] = await tx
        .select()
        .from(industrialLotoProcedures)
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!proc) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");
      const [energySources, isolationPoints, steps, lockouts] = await Promise.all([
        tx
          .select()
          .from(industrialLotoEnergySources)
          .where(
            and(
              eq(industrialLotoEnergySources.tenantId, principal.tenantId),
              eq(industrialLotoEnergySources.procedureId, id),
              isNull(industrialLotoEnergySources.archivedAt),
            ),
          )
          .orderBy(industrialLotoEnergySources.sortOrder),
        tx
          .select()
          .from(industrialLotoIsolationPoints)
          .where(
            and(
              eq(industrialLotoIsolationPoints.tenantId, principal.tenantId),
              eq(industrialLotoIsolationPoints.procedureId, id),
              isNull(industrialLotoIsolationPoints.archivedAt),
            ),
          )
          .orderBy(industrialLotoIsolationPoints.sortOrder),
        tx
          .select()
          .from(industrialLotoSteps)
          .where(
            and(
              eq(industrialLotoSteps.tenantId, principal.tenantId),
              eq(industrialLotoSteps.procedureId, id),
              isNull(industrialLotoSteps.archivedAt),
            ),
          )
          .orderBy(industrialLotoSteps.stepNumber),
        tx
          .select()
          .from(industrialLotoRecords)
          .where(
            and(
              eq(industrialLotoRecords.tenantId, principal.tenantId),
              eq(industrialLotoRecords.procedureId, id),
              isNull(industrialLotoRecords.archivedAt),
            ),
          )
          .orderBy(desc(industrialLotoRecords.updatedAt)),
      ]);
      return {
        ...this.mapListItem({
          id: proc.id,
          title: proc.title,
          status: proc.status,
          createdAt: proc.createdAt,
          updatedAt: proc.updatedAt,
          sourcePayload: proc.sourcePayload,
          extra: {
            procedureNumber: proc.procedureNumber,
            equipmentId: proc.equipmentId,
            revision: proc.revision,
            siteId: proc.siteId,
          },
        }),
        energySources,
        isolationPoints,
        steps,
        lockouts: lockouts.map((r) =>
          this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
            extra: { procedureId: r.procedureId, siteId: r.siteId, dueDate: r.dueDate },
          }),
        ),
        procedure: proc,
      };
    });
  }

  async listLotoProceduresDetailed(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialLotoProcedures.tenantId, principal.tenantId),
        isNull(industrialLotoProcedures.archivedAt),
      ];
      if (status) conditions.push(eq(industrialLotoProcedures.status, status));
      if (q) {
        conditions.push(
          or(
            ilike(industrialLotoProcedures.title, `%${q}%`),
            ilike(industrialLotoProcedures.procedureNumber, `%${q}%`),
          )!,
        );
      }
      const items = await tx
        .select()
        .from(industrialLotoProcedures)
        .where(and(...conditions))
        .orderBy(desc(industrialLotoProcedures.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
            extra: {
              procedureNumber: r.procedureNumber,
              equipmentId: r.equipmentId,
              revision: r.revision,
            },
          }),
        ),
      };
    });
  }

  async listLotoLockouts(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const status = (query.status ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialLotoRecords.tenantId, principal.tenantId),
        isNull(industrialLotoRecords.archivedAt),
      ];
      if (status) conditions.push(eq(industrialLotoRecords.status, status));
      const items = await tx
        .select()
        .from(industrialLotoRecords)
        .where(and(...conditions))
        .orderBy(desc(industrialLotoRecords.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
            extra: { procedureId: r.procedureId, siteId: r.siteId, dueDate: r.dueDate },
          }),
        ),
      };
    });
  }

  async createLoto(principal: ForgePrincipal, body: Record<string, unknown>) {
    const equipmentName = String(body.equipmentName ?? "").trim();
    const title = String(body.title ?? "").trim() || (equipmentName ? `${equipmentName} LOTO` : "");
    if (!title) {
      throw new ForgeError("VALIDATION_FAILED", "Please provide a title or equipment name.");
    }
    const equipmentIdRaw = String(body.equipmentId ?? "").trim();
    const equipmentId = UUID_PATTERN.test(equipmentIdRaw) ? equipmentIdRaw : null;
    const status = String(body.status ?? "DRAFT").trim() || "DRAFT";
    const siteId = body.siteId ? String(body.siteId) : null;
    const incomingSteps = Array.isArray(body.steps) ? body.steps : [];
    const incomingEnergy = Array.isArray(body.energySources) ? body.energySources : [];
    const incomingPoints = Array.isArray(body.isolationPoints) ? body.isolationPoints : [];

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const procedureId = createId();
      const procedureNumber =
        String(body.procedureNumber ?? "").trim() ||
        `LOTO-${now.getFullYear()}-${procedureId.slice(0, 8).toUpperCase()}`;
      const [proc] = await tx
        .insert(industrialLotoProcedures)
        .values({
          id: procedureId,
          tenantId: principal.tenantId,
          siteId,
          equipmentId,
          title,
          procedureNumber,
          revision: String(body.revision ?? "1").trim() || "1",
          status,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!proc) throw new ForgeError("INTERNAL_ERROR", "Failed to create LOTO procedure");

      const energyIds: string[] = [];
      for (const [index, raw] of incomingEnergy.entries()) {
        const row = asRecord(raw);
        const energyType = String(row.energyType ?? row.energySourceName ?? "").trim();
        if (!energyType) continue;
        const energyId = createId();
        energyIds.push(energyId);
        await tx.insert(industrialLotoEnergySources).values({
          id: energyId,
          tenantId: principal.tenantId,
          procedureId,
          energyType,
          description: String(row.description ?? "").trim() || null,
          magnitude: String(row.magnitude ?? row.energyMagnitude ?? "").trim() || null,
          sortOrder: Number(row.sortOrder ?? index) || index,
          sourceSystem: "FORGE",
          sourcePayload: row,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const [index, raw] of incomingSteps.entries()) {
        const row = asRecord(raw);
        const energyType = String(row.energySourceName ?? row.energyType ?? "").trim();
        if (!energyType && !String(row.instruction ?? "").trim()) continue;
        let energyId: string | null = null;
        if (energyType) {
          energyId = createId();
          await tx.insert(industrialLotoEnergySources).values({
            id: energyId,
            tenantId: principal.tenantId,
            procedureId,
            energyType,
            description: String(row.energyNotes ?? "").trim() || null,
            magnitude: String(row.energyMagnitude ?? row.magnitude ?? "").trim() || null,
            sortOrder: energyIds.length + index,
            sourceSystem: "FORGE",
            sourcePayload: row,
            createdAt: now,
            updatedAt: now,
          });
          energyIds.push(energyId);
        }
        const isolationLabel =
          String(row.lockoutDeviceName ?? row.isolationLocationText ?? row.label ?? energyType).trim() ||
          `Point ${index + 1}`;
        const isolationId = createId();
        await tx.insert(industrialLotoIsolationPoints).values({
          id: isolationId,
          tenantId: principal.tenantId,
          procedureId,
          energySourceId: energyId,
          label: isolationLabel,
          locationDescription: String(row.isolationLocationText ?? row.locationDescription ?? "").trim() || null,
          isolationMethod: String(row.isolationAction ?? row.isolationMethod ?? "").trim() || null,
          sortOrder: index,
          sourceSystem: "FORGE",
          sourcePayload: row,
          createdAt: now,
          updatedAt: now,
        });
        const instruction =
          String(row.instruction ?? "").trim() ||
          [
            energyType && `Isolate ${energyType}`,
            row.energyMagnitude && `(${String(row.energyMagnitude)})`,
            row.isolationLocationText && `at ${String(row.isolationLocationText)}`,
            row.isolationAction && `by ${String(row.isolationAction)}`,
            row.lockoutDeviceName && `using ${String(row.lockoutDeviceName)}`,
          ]
            .filter(Boolean)
            .join(" ");
        await tx.insert(industrialLotoSteps).values({
          id: createId(),
          tenantId: principal.tenantId,
          procedureId,
          stepPhase: String(row.stepPhase ?? "ISOLATION").trim() || "ISOLATION",
          stepNumber: Number(row.stepNumber ?? (index + 1) * 2 - 1) || (index + 1) * 2 - 1,
          instruction: instruction || `Isolation step ${index + 1}`,
          isolationPointId: isolationId,
          isVerification: false,
          sourceSystem: "FORGE",
          sourcePayload: row,
          createdAt: now,
          updatedAt: now,
        });
        const verification = String(row.verificationMethodName ?? row.verification ?? "").trim();
        if (verification) {
          await tx.insert(industrialLotoSteps).values({
            id: createId(),
            tenantId: principal.tenantId,
            procedureId,
            stepPhase: "VERIFICATION",
            stepNumber: (Number(row.stepNumber ?? index + 1) || index + 1) * 2,
            instruction: `Verify zero energy: ${verification}`,
            isolationPointId: isolationId,
            isVerification: true,
            sourceSystem: "FORGE",
            sourcePayload: { ...row, verification },
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      for (const [index, raw] of incomingPoints.entries()) {
        const row = asRecord(raw);
        const label = String(row.label ?? row.lockoutDeviceName ?? "").trim();
        if (!label) continue;
        await tx.insert(industrialLotoIsolationPoints).values({
          id: createId(),
          tenantId: principal.tenantId,
          procedureId,
          energySourceId: energyIds[Number(row.energySourceIndex ?? 0)] ?? null,
          label,
          locationDescription: String(row.locationDescription ?? "").trim() || null,
          isolationMethod: String(row.isolationMethod ?? "").trim() || null,
          sortOrder: Number(row.sortOrder ?? index) || index,
          sourceSystem: "FORGE",
          sourcePayload: row,
          createdAt: now,
          updatedAt: now,
        });
      }

      return this.mapListItem({
        id: proc.id,
        title: proc.title,
        status: proc.status,
        createdAt: proc.createdAt,
        updatedAt: proc.updatedAt,
        sourcePayload: proc.sourcePayload,
        extra: {
          procedureNumber: proc.procedureNumber,
          equipmentId: proc.equipmentId,
          revision: proc.revision,
        },
      });
    });
  }

  async issueLotoLockout(principal: ForgePrincipal, procedureId: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(procedureId);
    const authorizedEmployee = String(body.authorizedEmployee ?? body.workerName ?? "").trim();
    if (!authorizedEmployee) {
      throw new ForgeError("VALIDATION_FAILED", "Authorized employee is required to issue a lockout.");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [proc] = await tx
        .select()
        .from(industrialLotoProcedures)
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
            isNull(industrialLotoProcedures.archivedAt),
          ),
        )
        .limit(1);
      if (!proc) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");
      const status = proc.status.toUpperCase();
      if (status !== "ACTIVE" && status !== "APPROVED") {
        throw new ForgeError(
          "CONFLICT",
          "Approve and activate the procedure before issuing a lockout.",
        );
      }
      const now = new Date();
      const lockoutId = createId();
      const [row] = await tx
        .insert(industrialLotoRecords)
        .values({
          id: lockoutId,
          tenantId: principal.tenantId,
          siteId: proc.siteId,
          procedureId: proc.id,
          title: `${proc.procedureNumber ?? proc.title} lockout`,
          status: "ISSUED",
          sourceSystem: "FORGE",
          sourcePayload: {
            ...body,
            authorizedEmployee,
            affectedEmployees: String(body.affectedEmployees ?? "").trim() || null,
            lockTagId: String(body.lockTagId ?? "").trim() || null,
            tryStartRequired: body.tryStartRequired !== false,
            issuedAt: now.toISOString(),
            issuedByUserId: principal.userId,
            procedureNumber: proc.procedureNumber,
            equipmentName: (proc.sourcePayload as { equipmentName?: string } | null)?.equipmentName,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapListItem({
        id: row!.id,
        title: row!.title,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
        extra: { procedureId: row!.procedureId },
      });
    });
  }

  async transitionLotoLockout(
    principal: ForgePrincipal,
    lockoutId: string,
    action: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = this.assertRecordId(lockoutId);
    const next =
      action === "verify" ? "VERIFIED" : action === "close" ? "CLOSED" : String(body.status ?? "").trim();
    if (!next) {
      throw new ForgeError("VALIDATION_FAILED", "That lockout action is not supported.");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialLotoRecords)
        .where(
          and(
            eq(industrialLotoRecords.id, recordId),
            eq(industrialLotoRecords.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Lockout record not found");
      if (action === "verify" && existing.status !== "ISSUED") {
        throw new ForgeError("CONFLICT", "Only an issued lockout can be verified.");
      }
      if (action === "close" && existing.status !== "ISSUED" && existing.status !== "VERIFIED") {
        throw new ForgeError("CONFLICT", "Only an issued or verified lockout can be closed.");
      }
      if (action === "verify") {
        if (body.zeroEnergyConfirmed !== true && body.zeroEnergyConfirmed !== "true") {
          throw new ForgeError("VALIDATION_FAILED", "Confirm zero-energy verification before continuing.");
        }
      }
      const now = new Date();
      const prior =
        existing.sourcePayload && typeof existing.sourcePayload === "object"
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};
      const [row] = await tx
        .update(industrialLotoRecords)
        .set({
          status: next,
          updatedAt: now,
          sourcePayload: {
            ...prior,
            ...body,
            ...(action === "verify"
              ? {
                  verifiedAt: now.toISOString(),
                  verifiedByUserId: principal.userId,
                  tryStartCompleted: body.tryStartCompleted === true || body.tryStartCompleted === "true",
                  zeroEnergyConfirmed: true,
                }
              : {}),
            ...(action === "close"
              ? {
                  closedAt: now.toISOString(),
                  closedByUserId: principal.userId,
                  restorationComplete: body.restorationComplete !== false,
                }
              : {}),
          },
        })
        .where(eq(industrialLotoRecords.id, recordId))
        .returning();
      return this.mapListItem({
        id: row!.id,
        title: row!.title,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
        extra: { procedureId: row!.procedureId },
      });
    });
  }

  async lotoPrintable(principal: ForgePrincipal, id: string) {
    const detail = await this.getLotoDetail(principal, id);
    const title = String(detail.title ?? "LOTO Procedure");
    const steps = (detail.steps as Array<{ stepNumber?: number; instruction?: string }>).map(
      (s) => `<li>${s.stepNumber ?? ""}. ${s.instruction ?? ""}</li>`,
    );
    const energy = (
      detail.energySources as Array<{ energyType?: string; description?: string | null }>
    ).map((e) => `<li>${e.energyType ?? ""} — ${e.description ?? ""}</li>`);
    const isolation = (
      detail.isolationPoints as Array<{
        label?: string;
        locationDescription?: string | null;
        isolationMethod?: string | null;
      }>
    ).map(
      (p) =>
        `<li>${p.label ?? ""} — ${p.locationDescription ?? ""} ${p.isolationMethod ? `(${p.isolationMethod})` : ""}</li>`,
    );
    const procedureNumber = String(detail.procedure.procedureNumber ?? "");
    return {
      html: `<!doctype html><html><head><title>${title}</title></head><body>
        <h1>${title}</h1>
        <p>Status: ${String(detail.status ?? "")} · Procedure ${procedureNumber}</p>
        <h2>Energy sources</h2><ul>${energy.join("") || "<li>None listed</li>"}</ul>
        <h2>Isolation points</h2><ul>${isolation.join("") || "<li>None listed</li>"}</ul>
        <h2>Steps</h2><ol>${steps.join("") || "<li>None listed</li>"}</ol>
      </body></html>`,
    };
  }

  async bulkTraining(principal: ForgePrincipal, body: Record<string, unknown>) {
    const title = String(body.title ?? body.courseName ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "Please select a training course.");
    const personnelIds = Array.isArray(body.personnelIds)
      ? body.personnelIds.map(String)
      : Array.isArray(body.employeeIds)
        ? body.employeeIds.map(String)
        : [];
    if (personnelIds.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "Please select at least one employee.");
    }
    const completedAt = body.completedAt ? new Date(String(body.completedAt)) : new Date();
    const instructor = body.instructorName ? String(body.instructorName) : null;
    const location = body.location ? String(body.location) : null;
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const created = [];
      for (const personnelId of personnelIds) {
        const [row] = await tx
          .insert(industrialTrainingRecords)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            title,
            courseName: title,
            personnelId,
            status: "COMPLETED",
            completedAt,
            siteId: body.siteId ? String(body.siteId) : null,
            sourceSystem: "FORGE",
            sourcePayload: { ...body, instructorName: instructor, location, personnelId },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        created.push(
          this.mapListItem({
            id: row!.id,
            title: row!.title,
            status: row!.status,
            createdAt: row!.createdAt,
            updatedAt: row!.updatedAt,
            sourcePayload: row!.sourcePayload,
          }),
        );
      }
      return { createdCount: created.length, items: created };
    });
  }

  async listWorkersComp(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const status = (query.status ?? "").trim();
    const canMedical =
      principal.isPlatformAdmin ||
      principal.permissions.has("industrial.workers_comp.medical.view") ||
      principal.permissions.has("industrial.workers_comp.medical.manage") ||
      principal.permissions.has("industrial.admin");
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialWorkersCompCases.tenantId, principal.tenantId),
        isNull(industrialWorkersCompCases.archivedAt),
      ];
      if (status) conditions.push(eq(industrialWorkersCompCases.status, status));
      const items = await tx
        .select()
        .from(industrialWorkersCompCases)
        .where(and(...conditions))
        .orderBy(desc(industrialWorkersCompCases.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) => {
          const payload =
            typeof r.sourcePayload === "object" && r.sourcePayload
              ? { ...(r.sourcePayload as Record<string, unknown>) }
              : {};
          if (!canMedical) {
            delete payload.medical;
            delete payload.diagnosis;
            delete payload.treatment;
          }
          return {
            id: r.id,
            title: r.caseNumber ?? r.id,
            caseNumber: r.caseNumber,
            status: r.status,
            personnelId: r.personnelId,
            siteId: r.siteId,
            medicalAllowed: canMedical,
            ...payload,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }),
      };
    });
  }

  async getWorkersComp(principal: ForgePrincipal, id: string) {
    const canMedical =
      principal.isPlatformAdmin ||
      principal.permissions.has("industrial.workers_comp.medical.view") ||
      principal.permissions.has("industrial.workers_comp.medical.manage") ||
      principal.permissions.has("industrial.admin");
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialWorkersCompCases)
        .where(
          and(
            eq(industrialWorkersCompCases.id, recordId),
            eq(industrialWorkersCompCases.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");
      let medical: unknown[] = [];
      if (canMedical) {
        medical = await tx
          .select()
          .from(industrialWorkersCompMedicalEncounters)
          .where(
            and(
              eq(industrialWorkersCompMedicalEncounters.tenantId, principal.tenantId),
              eq(industrialWorkersCompMedicalEncounters.caseId, id),
              isNull(industrialWorkersCompMedicalEncounters.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompMedicalEncounters.createdAt))
          .limit(50);
      }
      const payload =
        typeof row.sourcePayload === "object" && row.sourcePayload
          ? { ...(row.sourcePayload as Record<string, unknown>) }
          : {};
      if (!canMedical) {
        delete payload.medical;
        delete payload.diagnosis;
        delete payload.treatment;
      }
      return {
        id: row.id,
        title: row.caseNumber ?? row.id,
        caseNumber: row.caseNumber,
        status: row.status,
        personnelId: row.personnelId,
        siteId: row.siteId,
        medicalAllowed: canMedical,
        medical: canMedical ? medical : undefined,
        medicalDeniedReason: canMedical
          ? undefined
          : "You don't have permission to view medical details for this case.",
        ...payload,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  async createWorkersComp(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialWorkersCompCases)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          caseNumber: body.caseNumber ? String(body.caseNumber) : null,
          personnelId: body.personnelId ? String(body.personnelId) : null,
          siteId: body.siteId ? String(body.siteId) : null,
          status: String(body.status ?? "OPEN"),
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        id: row!.id,
        title: row!.caseNumber ?? row!.id,
        caseNumber: row!.caseNumber,
        status: row!.status,
        createdAt: row!.createdAt.toISOString(),
        updatedAt: row!.updatedAt.toISOString(),
      };
    });
  }

  async taskAction(principal: ForgePrincipal, id: string, action: string) {
    return this.transitionModule(principal, "tasks", id, action);
  }

  async listEmergencyCategory(principal: ForgePrincipal, category: string, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const items = await tx
        .select()
        .from(industrialEmergencyResponseRecords)
        .where(
          and(
            eq(industrialEmergencyResponseRecords.tenantId, principal.tenantId),
            isNull(industrialEmergencyResponseRecords.archivedAt),
            or(
              eq(industrialEmergencyResponseRecords.responseType, category),
              ilike(industrialEmergencyResponseRecords.title, `%${category}%`),
            ),
          ),
        )
        .orderBy(desc(industrialEmergencyResponseRecords.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
            extra: { responseType: r.responseType, category },
          }),
        ),
      };
    });
  }

  async createEmergencyCategory(
    principal: ForgePrincipal,
    category: string,
    body: Record<string, unknown>,
  ) {
    const title = String(body.title ?? body.name ?? category).trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialEmergencyResponseRecords)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          title,
          status: String(body.status ?? "ACTIVE"),
          responseType: category,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapListItem({
        id: row!.id,
        title: row!.title,
        status: row!.status,
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
        sourcePayload: row!.sourcePayload,
      });
    });
  }

  /** Messaging has no Model A table — return empty business-friendly payload. */
  messagingThreads() {
    return { items: [], available: false, message: "Messaging is not configured for this customer yet." };
  }

  messagingThread(_id: string) {
    throw new ForgeError(
      "NOT_FOUND",
      "Messaging is not available. Contact your administrator if you need this feature.",
    );
  }

  /**
   * Seasonal workforce tables are not in Model A DDL.
   * Provide personnel-status based projections so the UI does not 404.
   */
  async seasonalPersonnel(principal: ForgePrincipal, query: ListQuery) {
    return this.listPersonnel(principal, {
      ...query,
      status: query.status ?? "Seasonal",
    });
  }

  async personnelSearch(principal: ForgePrincipal, query: ListQuery) {
    return this.listPersonnel(principal, query);
  }

  async personnelSeasons() {
    return {
      items: [],
      available: false,
      message:
        "Season seasons are not stored in the normalized Model A schema yet. Use personnel status filters.",
    };
  }

  async seasonalMetrics(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          seasonal: sql<number>`count(*) filter (where ${industrialPersonnel.status} ilike 'seasonal%')::int`,
          prehire: sql<number>`count(*) filter (where ${industrialPersonnel.status} ilike 'pre%hire%')::int`,
          orientation: sql<number>`count(*) filter (where ${industrialPersonnel.status} ilike 'orientation%')::int`,
          active: sql<number>`count(*) filter (where ${industrialPersonnel.status} ilike 'active%')::int`,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, principal.tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        );
      return {
        total: row?.total ?? 0,
        seasonal: row?.seasonal ?? 0,
        prehire: row?.prehire ?? 0,
        orientation: row?.orientation ?? 0,
        active: row?.active ?? 0,
      };
    });
  }

  async dashboard(principal: ForgePrincipal, query: ListQuery) {
      const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      async function countOpen(table: TitledTable, openStatuses: string[]): Promise<number> {
        const conditions = [
          eq(table.tenantId, principal.tenantId),
          isNull(table.archivedAt),
          inArray(table.status, openStatuses),
        ];
        if (siteId && "siteId" in table) {
          conditions.push(eq((table as typeof industrialIncidents).siteId, siteId));
        }
        const [row] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(table)
          .where(and(...conditions));
        return row?.c ?? 0;
      }

      const [
        openIncidents,
        openCorrectiveActions,
        inspectionsOpen,
        trainingExpiring,
        observationsOpen,
        lotoActive,
        wcOpen,
        tasksOpen,
      ] = await Promise.all([
        countOpen(industrialIncidents, ["OPEN", "INVESTIGATING", "ACTIVE"]),
        countOpen(industrialCorrectiveActions, ["OPEN", "IN_PROGRESS", "ACTIVE"]),
        countOpen(industrialInspections, ["OPEN", "IN_PROGRESS", "DUE", "ACTIVE"]),
        (async () => {
          const [row] = await tx
            .select({ c: sql<number>`count(*)::int` })
            .from(industrialTrainingRecords)
            .where(
              and(
                eq(industrialTrainingRecords.tenantId, principal.tenantId),
                isNull(industrialTrainingRecords.archivedAt),
                sql`${industrialTrainingRecords.expiresAt} is not null and ${industrialTrainingRecords.expiresAt} < now() + interval '30 days'`,
              ),
            );
          return row?.c ?? 0;
        })(),
        countOpen(industrialObservations, ["OPEN", "ACTIVE", "AT_RISK"]),
        countOpen(industrialLotoProcedures, ["ACTIVE", "REVIEW_DUE", "OPEN"]),
        (async () => {
          const [row] = await tx
            .select({ c: sql<number>`count(*)::int` })
            .from(industrialWorkersCompCases)
            .where(
              and(
                eq(industrialWorkersCompCases.tenantId, principal.tenantId),
                isNull(industrialWorkersCompCases.archivedAt),
                inArray(industrialWorkersCompCases.status, ["OPEN", "ACTIVE"]),
              ),
            );
          return row?.c ?? 0;
        })(),
        countOpen(industrialTasks, ["OPEN", "ACTIVE", "IN_PROGRESS"]),
      ]);

      const attention = [
        { key: "openIncidents", label: "Open Incidents", count: openIncidents, href: "/modules/incidents?status=OPEN" },
        {
          key: "openCorrectiveActions",
          label: "Open Corrective Actions",
          count: openCorrectiveActions,
          href: "/modules/corrective-actions?status=OPEN",
        },
        {
          key: "inspectionsDue",
          label: "Inspections Due",
          count: inspectionsOpen,
          href: "/modules/inspections?status=OPEN",
        },
        {
          key: "trainingExpiring",
          label: "Training / Certifications Expiring",
          count: trainingExpiring,
          href: "/modules/training",
        },
        {
          key: "observations",
          label: "Safety Observations",
          count: observationsOpen,
          href: "/modules/observations",
        },
        { key: "lotoReviews", label: "LOTO Reviews Due", count: lotoActive, href: "/modules/loto" },
        {
          key: "workersComp",
          label: "Workers Comp Open Cases",
          count: wcOpen,
          href: "/modules/workers-comp?status=OPEN",
        },
        { key: "tasks", label: "Open Tasks", count: tasksOpen, href: "/modules/tasks" },
      ];

      return {
        generatedAt: new Date().toISOString(),
        facilityId: siteId || null,
        attention,
        quickActions: [
          { label: "Report incident", href: "/modules/incidents" },
          { label: "New observation", href: "/modules/observations" },
          { label: "Start inspection", href: "/modules/inspections" },
          { label: "Record training", href: "/modules/training" },
        ],
      };
    });
  }

  /**
   * Safety Intelligence Center overview. Counts and trends from Model A tables
   * for the selected rolling window, plus the three fixed period cards.
   */
  async analyticsOverview(principal: ForgePrincipal, query: ListQuery) {
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    const preset = (query.preset ?? "6m").trim().toLowerCase();
    const rangeDays = preset === "3m" ? 90 : preset === "1y" || preset === "12m" ? 365 : 180;
    const end = new Date();
    const start = new Date(end.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const periodLabel =
      rangeDays === 90 ? "Last 3 months" : rangeDays === 365 ? "Last 12 months" : "Last 6 months";

    const enterpriseKeys = [
      "forklifts",
      "loto",
      "confined-space",
      "hot-work",
      "working-at-heights",
      "electrical-safety",
      "cranes-rigging",
      "machine-safety",
      "chemical-safety",
      "warehouse-safety",
      "manufacturing-safety",
      "contractor-safety",
      "process-safety",
      "environmental-safety",
    ] as const;

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const siteClause = (table: { siteId?: unknown }) =>
        siteId && "siteId" in table
          ? eq((table as typeof industrialIncidents).siteId, siteId)
          : undefined;

      const countInRange = async (
        table: TitledTable | typeof industrialPersonnel | typeof industrialFormSubmissions,
        since: Date,
      ): Promise<number> => {
        const conditions = [
          eq(table.tenantId, principal.tenantId),
          isNull(table.archivedAt),
          gte(table.createdAt, since),
        ];
        const site = siteClause(table as { siteId?: unknown });
        if (site) conditions.push(site);
        const [row] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(table)
          .where(and(...conditions));
        return row?.c ?? 0;
      };

      const countOpen = async (table: TitledTable, since: Date): Promise<number> => {
        const conditions = [
          eq(table.tenantId, principal.tenantId),
          isNull(table.archivedAt),
          gte(table.createdAt, since),
          sql`lower(${table.status}) not like '%closed%'`,
          sql`lower(${table.status}) not like '%resolv%'`,
          sql`lower(${table.status}) not like '%archiv%'`,
          sql`lower(${table.status}) not like '%complet%'`,
        ];
        const site = siteClause(table as { siteId?: unknown });
        if (site) conditions.push(site);
        const [row] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(table)
          .where(and(...conditions));
        return row?.c ?? 0;
      };

      const monthlyTrend = async (table: TitledTable, since: Date) => {
        const conditions = [
          eq(table.tenantId, principal.tenantId),
          isNull(table.archivedAt),
          gte(table.createdAt, since),
        ];
        const site = siteClause(table as { siteId?: unknown });
        if (site) conditions.push(site);
        const rows = await tx
          .select({
            month: sql<string>`to_char(date_trunc('month', ${table.createdAt}), 'YYYY-MM')`,
            count: sql<number>`count(*)::int`,
          })
          .from(table)
          .where(and(...conditions))
          .groupBy(sql`date_trunc('month', ${table.createdAt})`)
          .orderBy(sql`date_trunc('month', ${table.createdAt})`);
        return rows.map((r) => ({ month: r.month, count: r.count }));
      };

      const statusBreakdown = async (table: TitledTable, since: Date) => {
        const conditions = [
          eq(table.tenantId, principal.tenantId),
          isNull(table.archivedAt),
          gte(table.createdAt, since),
        ];
        const site = siteClause(table as { siteId?: unknown });
        if (site) conditions.push(site);
        const rows = await tx
          .select({
            label: sql<string>`coalesce(nullif(btrim(${table.status}), ''), 'Unknown')`,
            count: sql<number>`count(*)::int`,
          })
          .from(table)
          .where(and(...conditions))
          .groupBy(sql`coalesce(nullif(btrim(${table.status}), ''), 'Unknown')`)
          .orderBy(sql`count(*) desc`)
          .limit(8);
        return rows.map((r) => ({ label: r.label, count: r.count }));
      };

      const buildWindow = async (days: number, id: "threeMonth" | "sixMonth" | "oneYear", label: string) => {
        const since = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const [
          incidents,
          inspections,
          observations,
          formSubmissions,
          training,
          jsas,
          openIncidents,
          dotTotal,
          dotOpen,
          ...enterpriseCounts
        ] = await Promise.all([
          countInRange(industrialIncidents, since),
          countInRange(industrialInspections, since),
          countInRange(industrialObservations, since),
          countInRange(industrialFormSubmissions, since),
          countInRange(industrialTrainingRecords, since),
          countInRange(industrialJsas, since),
          countOpen(industrialIncidents, since),
          countInRange(industrialDotComplianceRecords, since),
          countOpen(industrialDotComplianceRecords, since),
          ...enterpriseKeys.map((key) => countInRange(MODULE_TABLES[key]!, since)),
        ]);
        const enterpriseActivity = enterpriseCounts.reduce((sum, n) => sum + n, 0);
        const totalActivity =
          incidents +
          inspections +
          observations +
          formSubmissions +
          training +
          jsas +
          enterpriseActivity;
        const safetyScore = this.computeSafetyIndex({
          openIncidents,
          totalIncidents: incidents,
          inspectionCount: inspections,
          trainingCount: training,
          enterpriseOpenHint: 0,
        });
        const dotCompliance =
          dotTotal === 0 ? 100 : Math.round(((dotTotal - dotOpen) / Math.max(dotTotal, 1)) * 100);
        return {
          id,
          label,
          dateRange: { start: since.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
          incidents,
          inspections,
          observations,
          formSubmissions,
          trainingCompletions: training,
          scanCompletions: 0,
          enterpriseActivity,
          jsas,
          totalActivity,
          avgInspectionScore: null as number | null,
          safetyScore,
          safetyGrade: this.safetyGrade(safetyScore),
          openIncidents,
          dot: {
            totalRecords: dotTotal,
            openItems: dotOpen,
            complianceScore: dotCompliance,
          },
        };
      };

      const [threeMonth, sixMonth, oneYear] = await Promise.all([
        buildWindow(90, "threeMonth", "Last 3 Months"),
        buildWindow(180, "sixMonth", "Last 6 Months"),
        buildWindow(365, "oneYear", "Last 12 Months"),
      ]);

      const active =
        rangeDays === 90 ? threeMonth : rangeDays === 365 ? oneYear : sixMonth;

      const [
        incidentTrend,
        observationsTrend,
        inspectionsTrend,
        incidentsByStatus,
        observationsByStatus,
        formDefs,
      ] = await Promise.all([
        monthlyTrend(industrialIncidents, start),
        monthlyTrend(industrialObservations, start),
        monthlyTrend(industrialInspections, start),
        statusBreakdown(industrialIncidents, start),
        statusBreakdown(industrialObservations, start),
        countInRange(industrialFormDefinitions, start),
      ]);

      const enterpriseByModule = await Promise.all(
        enterpriseKeys.map(async (key) => ({
          label: key
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          key,
          count: await countInRange(MODULE_TABLES[key]!, start),
          href: `/modules/${key}/`,
        })),
      );

      const trainingRate =
        active.trainingCompletions > 0
          ? Math.round((active.trainingCompletions / Math.max(active.trainingCompletions, 1)) * 100)
          : 0;
      const dotTotal = active.dot.totalRecords;
      const dotOpen = active.dot.openItems;
      const dotCompliance = active.dot.complianceScore;

      const activityByModule = [
        { label: "Incidents", key: "incidents", count: active.incidents, href: "/modules/incidents/" },
        { label: "Inspections", key: "inspections", count: active.inspections, href: "/modules/inspections/" },
        { label: "Observations", key: "observations", count: active.observations, href: "/modules/observations/" },
        { label: "Forms", key: "forms", count: active.formSubmissions, href: "/modules/forms/" },
        { label: "Training", key: "training", count: active.trainingCompletions, href: "/modules/training/" },
        { label: "JSAs", key: "jsas", count: active.jsas, href: "/modules/jsas/" },
        {
          label: "Enterprise",
          key: "enterprise",
          count: active.enterpriseActivity,
          href: "/modules/lockout-tagout/",
        },
        { label: "DOT", key: "dot", count: dotTotal, href: "/modules/dot-compliance/" },
      ].sort((a, b) => b.count - a.count);

      const mostActive = activityByModule[0];

      const insights: string[] = [];
      if (active.openIncidents === 0) insights.push("No open incidents in this period.");
      else insights.push(`${active.openIncidents} open incident${active.openIncidents === 1 ? "" : "s"} need attention.`);
      if (active.enterpriseActivity > 0) {
        insights.push(`${active.enterpriseActivity} enterprise program records across ${enterpriseKeys.length} modules.`);
      }
      if (mostActive && mostActive.count > 0) {
        insights.push(`Most active module: ${mostActive.label} (${mostActive.count}).`);
      }
      if (active.observations === 0) insights.push("No observations recorded in this period.");
      if (dotTotal > 0) insights.push(`DOT compliance score ${dotCompliance}% (${dotOpen} open items).`);

      const kpis = [
        {
          id: "safety-score",
          label: "Safety Score",
          value: active.safetyScore,
          sub: `Grade ${active.safetyGrade}`,
          href: "/modules/analytics/?tab=overview",
        },
        {
          id: "open-incidents",
          label: "Open Incidents",
          value: active.openIncidents,
          sub: `${active.incidents} total in range`,
          href: "/modules/incidents/?status=open",
        },
        {
          id: "inspections",
          label: "Inspections",
          value: active.inspections,
          href: "/modules/inspections/",
        },
        {
          id: "observations",
          label: "Observations",
          value: active.observations,
          href: "/modules/observations/",
        },
        {
          id: "inspection-score",
          label: "Inspection Score",
          value: "—",
          sub: "Avg. score not scored yet",
          href: "/modules/inspections/",
        },
        {
          id: "forms",
          label: "Form Submissions",
          value: active.formSubmissions,
          sub: formDefs > 0 ? `${formDefs} templates touched` : undefined,
          href: "/modules/forms/",
        },
        {
          id: "training",
          label: "Training Completion",
          value: active.trainingCompletions,
          sub: `${trainingRate}% completion rate`,
          href: "/modules/training/",
        },
        {
          id: "scan",
          label: "Scan Completions",
          value: 0,
          sub: "Scan module activity",
          href: "/modules/scan/",
        },
        {
          id: "jsas",
          label: "JSAs in Range",
          value: active.jsas,
          sub: "0 open items",
          href: "/modules/jsas/",
        },
        {
          id: "enterprise",
          label: "Enterprise Programs",
          value: active.enterpriseActivity,
          sub: `0 open · ${enterpriseKeys.length} modules`,
          href: "/modules/lockout-tagout/",
        },
        {
          id: "dot",
          label: "DOT Compliance",
          value: `${dotCompliance}%`,
          sub: `${dotOpen} open items`,
          href: "/modules/dot-compliance/",
        },
      ];

      return {
        model: "MODEL_A",
        generatedAt: new Date().toISOString(),
        facilityId: siteId || null,
        periodLabel,
        preset: rangeDays === 90 ? "3m" : rangeDays === 365 ? "1y" : "6m",
        dateRange: active.dateRange,
        safetyScore: active.safetyScore,
        safetyGrade: active.safetyGrade,
        insights,
        periodSummaries: [threeMonth, sixMonth, oneYear],
        kpis,
        incidentTrend,
        observationsTrend,
        inspectionsTrend,
        incidentsByStatus,
        observationsByStatus,
        activityByModule,
        enterpriseByModule,
        dot: {
          totalRecords: dotTotal,
          openItems: dotOpen,
          complianceScore: dotCompliance,
        },
        // Backward-compatible fields for the prior simple workspace.
        kpisLegacy: undefined,
        drilldowns: activityByModule.map((m) => ({
          key: m.key,
          count: m.count,
          href: m.href,
        })),
      };
    });
  }

  private safetyGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  private computeSafetyIndex(input: {
    openIncidents: number;
    totalIncidents: number;
    inspectionCount: number;
    trainingCount: number;
    enterpriseOpenHint: number;
  }): number {
    let score = 100;
    score -= Math.min(input.openIncidents * 4, 24);
    if (input.totalIncidents > 0) {
      const closedRatio = 1 - input.openIncidents / input.totalIncidents;
      score = score * 0.6 + closedRatio * 100 * 0.4;
    }
    if (input.inspectionCount > 0) {
      score = score * 0.85 + 100 * 0.15;
    }
    if (input.trainingCount > 0) {
      score = score * 0.92 + 100 * 0.08;
    }
    if (input.enterpriseOpenHint > 0) {
      score -= Math.min(input.enterpriseOpenHint * 2, 12);
    }
    return Math.round(Math.min(Math.max(score, 0), 100));
  }

  /** Risk register has no dedicated table — project from observations + corrective actions. */
  async listRisk(principal: ForgePrincipal, query: ListQuery) {
    const obs = await this.listModule(principal, "observations", query);
    return {
      ...obs,
      items: obs.items.map((i) => ({ ...i, riskSource: "observation" })),
      projectedFrom: "industrial_observations",
    };
  }
}
