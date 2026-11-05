import { Inject, Injectable, Optional, forwardRef } from "@nestjs/common";
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
  industrialFleetVehicles,
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
  forgeDocuments,
  industrialTasks,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingRecords,
  industrialWarehouseSafetyRecords,
  industrialWorkersCompCases,
  industrialWorkersCompCarriers,
  industrialWorkersCompMedicalEncounters,
  industrialWorkersCompRestrictions,
  industrialWorkersCompWeeklyUpdates,
  industrialWorkersCompWorkStatusPeriods,
  industrialWorkingAtHeightsRecords,
  industrialPersonnelDisciplinaryActions,
  industrialPersonnelSmsConsents,
  membershipRoleAssignments,
  persons,
  platformEhsAuditTemplates,
  roles,
  tenantSettings,
  userNotifications,
  users,
  userTenantMemberships,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { createHash, randomBytes } from "node:crypto";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  documentBelongsToTenant,
  EMERGENCY_SMS_CONSENT_TEXT,
  EMERGENCY_SMS_CONSENT_VERSION,
  INDUSTRIAL_DASHBOARD_ATTENTION_SOURCES,
  industrialDashboardAttentionAllowed,
  modulePagePermissionOk,
  objectKeyBelongsToTenant,
} from "@forge/contracts";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { IndustrialQrService } from "./industrial-qr.service.js";
import {
  assertCanComplete,
  checklistFieldsToInspectionItems,
  cleanInspectionTemplateName,
  defaultInspectionTitle,
  dedupeInspectionTemplates,
  FALLBACK_INSPECTION_TEMPLATE,
  itemsFromTemplate,
  parseRunItems,
  templateFromLegacyRow,
  type InspectionRunItem,
  type InspectionTemplateDto,
  type InspectionTemplateItem,
} from "./inspection-helpers.js";
import { isQrAssetTargetType, markQrAssetOutOfService } from "./qr-scan-asset.js";
import {
  appendMvrAuditEntry,
  mergeMvrAuditHistories,
  parseMvrAuditHistory,
  selectMvrSampleIds,
} from "./mvr-sample.js";
import { formSubmissionBelongsToPerson } from "./form-subject.js";
import {
  buildFormSubmissionPrintableHtml,
  enrichPrintFieldsForDefinition,
  extractFormDefinitionFields,
  flattenFormResponses,
  resolveFormAnswers,
  unwrapJsonRecord,
  type FormPrintBranding,
  type FormPrintField,
} from "./form-print.js";
import {
  emptyFormCatalogImportSummary,
  parseFormCatalogImportPayload,
  type FormCatalogImportSummary,
} from "./form-catalog-import.js";
import { checklistToFormTemplate, parseChecklistFile } from "./form-checklist-import.js";
import { isProducersMvrConsentForm } from "./producers-mvr-policy.js";
import {
  COMPANY_DRIVER_MVR_CONSENT_NOTIFICATION_TYPE,
  fleetDriverMissingMvrConsent,
} from "./company-driver-mvr-consent.js";
import { normalizePersonnelDivisionCatalog } from "./industrial.service.js";
import {
  assertDvirDriverBody,
  DVIR_RETENTION_DAYS,
  dvirRetentionCutoffDate,
  dvirRetentionCutoffTimestamp,
  dvirStatusForDefects,
  dvirTitle,
  isDvirDotRecord,
  parseOptionalSignedAt,
  payloadNeedsDriverReview,
  payloadNeedsMechanic,
} from "./dvir-helpers.js";
import { buildDvirDayPrintableHtml, buildDvirPrintableHtml } from "./dvir-print.js";
import { buildIncidentPrintableHtml } from "./incident-print.js";
import { buildRcaPrintableHtml, normalizeRcaForPrint } from "./rca-print.js";
import { buildLotoPrintableHtml } from "./loto-print.js";
import { buildWorkersCompPrintableHtml, workersCompPrintTitle } from "./workers-comp-print.js";
import { ensureCompanyDriverRosterEntry } from "./company-driver-roster.js";
import { normalizePersonnelStatus, personnelStatusMatches } from "./personnel-status.js";
import { assertDemoAllowsDotExternal } from "../../common/demo-tenant.js";
import {
  canonicalEmployeeNumber,
  employeeNumberLookupKeys,
  employeeNumbersMatch,
  findPersonnelByEmployeeNumber,
} from "./employee-number.js";
import {
  isOpenWcStatus,
  normalizeWcCaseStatus,
  wcSeverityKey,
  mergeWorkersCompClaimSummary,
  parseWorkersCompClaimSummary,
  hydrateWorkersCompFromSource,
  resolveWorkersCompCaseNumber,
  syncWorkersCompClaimNumber,
  normalizeWorkersCompWorkerKey,
  workersCompInjuryDateKey,
  canViewWorkersCompMedical,
  canManageWorkersCompMedical,
  canEditWorkersCompAuthoredNote,
  buildWorkersCompWeeklyStatusEmail,
  incidentNarrativeFromPayload,
  resolveWorkersCompReportLocation,
  WC_WEEKLY_STATUS_REPORT_COLUMNS,
  workersCompWeeklyStatusReportRows,
  normalizeEmailAddress,
  normalizeEmailRecipients,
  parseWorkersCompWeeklyStatusSettings,
  parseWorkersCompOshaLinkage,
  oshaPayloadFromWorkersComp,
  normalizeWorkersCompGender,
  normalizeThursdayWeekOf,
  sortWorkersCompWeeklyStatusCases,
  weeklyUpdateRowStatus,
  WC_WEEKLY_STATUS_NAMESPACE,
  WC_WEEKLY_STATUS_SETTING_KEY,
  type WorkersCompWeeklyStatusSettings,
} from "./workers-comp-helpers.js";
import {
  OBSERVATIONS_SETTINGS_KEY,
  OBSERVATIONS_SETTINGS_NAMESPACE,
  buildObservationTitle,
  normalizeObservationCategories,
  normalizeObservationStatus,
  addObservationFollowUpToken,
  appendObservationEmailLog,
  buildObservationEmail,
  createObservationFollowUpToken,
  normalizeObservationFollowUp,
  observationFollowUpMissing,
  observationFollowUpTokenValid,
  parseObservationFollowUpToken,
  normalizeObservationEmail,
  normalizeObservationRecipients,
  observationAssigneeKey,
  observationFieldsFromBody,
  observationStatusFilterValues,
  parseObservationsSettings,
  applyObservedPeopleFault,
  computeObservationScoreImpact,
  isPositiveObservationType,
  normalizeObservedPeople,
  observedPersonAtFault,
  observedPersonKey,
} from "./observations-helpers.js";
import {
  computeDisciplineScoreImpact,
  disciplinaryActionType,
  disciplineCountsUntil,
  disciplinePoints,
  isDisciplineCounting,
  normalizeDisciplinaryActionInput,
  readDisciplineAttachments,
  type DisciplinaryActionInput,
} from "./personnel-discipline-helpers.js";
import {
  emptyOshaForm300AMeta,
  hydrateOshaFromSource,
  mergeOshaCasePayloadFields,
  mergeOshaSeedPreferExisting,
  normalizeOshaRecordability,
  oshaFlagsFromRecordability,
  parseOshaForm300AMeta,
  divisionFromPayload,
  OSHA_FORM300A_DIVISIONS_KEY,
  readOshaForm300AMetaForDivision,
  readOshaForm300AMetaFromSitePayload,
  writeOshaForm300AMetaForDivision,
  seedForm301FieldsFromIncident,
  writeOshaForm300AMetaToSitePayload,
  type OshaRecordability,
} from "./osha-helpers.js";
import {
  ehsDirectorSignatureValueChanged,
  FORM_STATUS_PENDING_SIGNATURE,
  formSignatoryKindForField,
  canDeleteIncidents,
  canDeleteForms,
  canDeleteInspections,
  canDeleteTask,
  taskCreatedByUserId,
  isSafetyDirectorRole,
  isSignatureAnswerPresent,
  isSupervisorRole,
  listEhsDirectorSignatureFields,
  missingDeferredSignatureFields,
  missingEhsDirectorSignatureFields,
  hasDeferredSignatoryFields,
  resolveFormSubmissionStatus,
  principalCanSignEhsDirector,
  type FormSignatoryKind,
  type SignatoryFieldRef,
} from "./form-signatory.js";
import { listSafetyDirectorRecipients as lookupSafetyDirectorRecipients } from "./safety-director-recipients.js";
import {
  accommodationsPayloadHasContent,
  parseWorkersCompAccommodationsPayload,
  readAccommodationsFromSourcePayload,
  summarizeWorkersCompAccommodationsPayload,
} from "./wc-restrictions-accommodations.js";

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
  "dateOfBirth",
  "street",
  "city",
  "state",
  "zip",
  "gender",
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
  "cprCertificationExpiresDate",
  "firstAidCertificationExpiresDate",
] as const;

const PERSONNEL_BOOLEAN_FIELDS = [
  "isCompanyDriver",
  "isDotDriver",
  "tracksPrescriptionSafetyGlasses",
  "prescriptionSafetyGlassesExtraPairApproved",
  "safetyFootwearExtraPairApproved",
  "tracksFirstAid",
] as const;

type PersonnelTextField = (typeof PERSONNEL_TEXT_FIELDS)[number];

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
function optionalUuid(value: unknown, fallback: string | null | undefined): string | null {
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
  "dateOfBirth",
  "prescriptionSafetyGlassesIssuedDate",
  "prescriptionSafetyGlassesExpiresDate",
  "prescriptionSafetyGlassesExtraPairApprovedDate",
  "safetyFootwearIssuedDate",
  "safetyFootwearExpiresDate",
  "safetyFootwearExtraPairApprovedDate",
  "cprCertificationExpiresDate",
  "firstAidCertificationExpiresDate",
] as const;

/**
 * Flat `/api/v1/industrial/*` domain operations against Model A (normalized tables).
 * Replaces the diverged branch ops-record approach with first-class tables.
 */
@Injectable()
export class IndustrialDomainService {
  /** Short-lived per-tenant cache so DOT/fleet list paging does not re-scan all personnel. */
  private readonly personnelLinkIndexCache = new Map<
    string,
    {
      expiresAt: number;
      value: { byLegacyId: Map<string, string>; byEmployee: Map<string, string> };
    }
  >();
  private readonly dvirPurgeAtByTenant = new Map<string, number>();
  /** Throttle soft-archive of DQF files linked to inactive/archived personnel. */
  private readonly dqfInactiveArchiveAtByTenant = new Map<string, number>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => IndustrialQrService))
    private readonly qr?: IndustrialQrService,
    @Optional() private readonly storage?: DocumentStorageService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** Non-empty template values for an insert; omitted keys stay null. */
  private normalizeEmployeeNumberInput(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    return canonicalEmployeeNumber(text) || null;
  }

  /**
   * Resolve a personnel UUID from form answers (personnelId key or Employee #).
   * Used so Form Builder Employee # fields attach submissions to personnel files.
   */
  private async resolvePersonnelIdFromFormAnswers(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    answers: Record<string, unknown>,
  ): Promise<string | null> {
    const direct = String(answers.personnelId ?? answers.personnel_id ?? "").trim();
    if (UUID_PATTERN.test(direct)) return direct;

    const empKeys = [
      "employeeNumber",
      "employee_number",
      "empNumber",
      "emp_number",
      "employeeNo",
      "employee_no",
    ] as const;
    let empRaw = "";
    for (const key of empKeys) {
      const value = String(answers[key] ?? "").trim();
      if (value) {
        empRaw = value;
        break;
      }
    }
    // Also accept any answer whose key looks like employee number.
    if (!empRaw) {
      for (const [key, value] of Object.entries(answers)) {
        if (!/employee|emp/i.test(key)) continue;
        if (!/(number|num|#|no)/i.test(key)) continue;
        const text = String(value ?? "").trim();
        if (text) {
          empRaw = text;
          break;
        }
      }
    }
    if (!String(empRaw ?? "").trim()) return null;
    const match = await findPersonnelByEmployeeNumber(tx, tenantId, empRaw);
    return match?.id ?? null;
  }

  private personnelInsertValues(body: Record<string, unknown>): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of PERSONNEL_TEXT_FIELDS) {
      const raw = readPersonnelText(body, field);
      if (raw == null) continue;
      const text = String(raw).trim();
      if (!text) continue;
      if (field === "gender") {
        const gender = normalizeWorkersCompGender(text);
        if (gender) values[field] = gender;
        continue;
      }
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

  /** Producers: DOT drivers are always company drivers (roster + MVR). */
  private async applyProducersDotDriverCompanyRule(
    tx: DatabaseTransaction,
    tenantId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    if (!values.isDotDriver) return;
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;
    if (String(tenantRow?.tenant_key ?? "").trim() !== "producers-rice-mill") return;
    values.isCompanyDriver = true;
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
        if ((PERSONNEL_DATE_FIELDS as readonly string[]).includes(field) && existingValue != null) {
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
      if (field === "gender") {
        values[field] = text === "" ? null : normalizeWorkersCompGender(text) || null;
        continue;
      }
      values[field] = text === "" ? null : text;
    }
    for (const field of PERSONNEL_BOOLEAN_FIELDS) {
      values[field] = body[field] === undefined ? Boolean(existing[field]) : toBoolean(body[field]);
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
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    values.smsNotificationNumber = phone || null;
    values.smsAuthorizedAt = this.toIsoOrNull(row.smsAuthorizedAt);
    values.smsAuthorizedByUserId =
      typeof row.smsAuthorizedByUserId === "string" && row.smsAuthorizedByUserId.trim()
        ? row.smsAuthorizedByUserId.trim()
        : (row.smsAuthorizedByUserId ?? null);
    values.smsOptedOutAt = this.toIsoOrNull(row.smsOptedOutAt);
    values.smsAuthorized = Boolean(values.smsAuthorizedAt) && !values.smsOptedOutAt;
    return values;
  }

  private toIsoOrNull(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    const text = String(value).trim();
    return text || null;
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
      ["date_of_birth", "dateOfBirth"],
      ["dob", "dateOfBirth"],
      ["birthDate", "dateOfBirth"],
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
      ["address", "street"],
      ["streetAddress", "street"],
      ["zipCode", "zip"],
      ["postalCode", "zip"],
      ["sex", "gender"],
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

  /**
   * Profile/directory read departmentName, not the FK. When the client posts
   * only departmentId (or an older row has a blank name), fill from the catalog.
   */
  private async resolvePersonnelDepartmentName(
    tx: DatabaseTransaction,
    tenantId: string,
    departmentId: string | null,
    providedName: string | null | undefined,
  ): Promise<string | null> {
    const provided =
      typeof providedName === "string" && providedName.trim() !== "" ? providedName.trim() : null;
    if (provided) return provided;
    if (!departmentId) return null;
    const [dept] = await tx
      .select({ name: industrialDepartments.name })
      .from(industrialDepartments)
      .where(
        and(
          eq(industrialDepartments.id, departmentId),
          eq(industrialDepartments.tenantId, tenantId),
        ),
      )
      .limit(1);
    const name = typeof dept?.name === "string" ? dept.name.trim() : "";
    return name || null;
  }

  private personnelLegacyKeysFromPayload(payload: Record<string, unknown>): string[] {
    const keys = new Set<string>();
    for (const field of ["id", "_id", "firebaseId", "docId", "personnelId"]) {
      const raw = payload[field];
      if (typeof raw === "string" && raw.trim()) keys.add(raw.trim());
    }
    return [...keys];
  }

  /** Extract a small text key from personnel.source_payload without loading the full JSON. */
  private personnelPayloadTextKey(key: string) {
    return sql<string | null>`nullif(btrim(coalesce(
      case
        when jsonb_typeof(${industrialPersonnel.sourcePayload}) = 'string'
          then ((${industrialPersonnel.sourcePayload} #>> '{}')::jsonb ->> ${key})
        else ${industrialPersonnel.sourcePayload} ->> ${key}
      end,
      ''
    )), '')`;
  }

  /**
   * Strip huge inline binaries (license photos / DQF copies as data URLs) from list
   * payloads so DOT/personnel list responses stay small. Detail endpoints still return
   * the full payload. Truthy stubs keep "has file" attention checks working.
   */
  private slimJsonValueForList(value: unknown, depth = 0): unknown {
    if (depth > 12) return null;
    if (typeof value === "string") {
      if (value.startsWith("data:") && value.length > 128) return "data:omitted";
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.slimJsonValueForList(entry, depth + 1));
    }
    if (!value || typeof value !== "object") return value;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        (key === "dataUrl" || key === "dataURL" || key === "downloadURL") &&
        typeof nested === "string" &&
        nested.length > 128
      ) {
        next[key] = nested.startsWith("data:") ? "data:omitted" : "[omitted]";
        continue;
      }
      next[key] = this.slimJsonValueForList(nested, depth + 1);
    }
    return next;
  }

  private slimPayloadForList(payload: Record<string, unknown>): Record<string, unknown> {
    const slimmed = this.slimJsonValueForList(payload);
    return slimmed && typeof slimmed === "object" && !Array.isArray(slimmed)
      ? (slimmed as Record<string, unknown>)
      : {};
  }

  /**
   * Block new base64 document embeds on DOT updates. Large data URLs OOM the API
   * and surface as INTERNAL_ERROR; DQF copies must use the S3 upload endpoints.
   */
  private assertNoInlineDocumentPayload(value: unknown, depth = 0): void {
    if (depth > 14) return;
    if (typeof value === "string") {
      if (value.startsWith("data:") && value.length > 8_192) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Inline document uploads are no longer supported. Use the document upload button to attach PDF or image copies.",
        );
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) this.assertNoInlineDocumentPayload(entry, depth + 1);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const nested of Object.values(value as Record<string, unknown>)) {
      this.assertNoInlineDocumentPayload(nested, depth + 1);
    }
  }

  private async loadPersonnelLinkIndex(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<{ byLegacyId: Map<string, string>; byEmployee: Map<string, string> }> {
    const cached = this.personnelLinkIndexCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Do not select source_payload wholesale — rows often embed multi-MB data URLs and
    // loading every personnel payload on each DOT list page freezes the UI.
    const rows = await tx
      .select({
        id: industrialPersonnel.id,
        employeeNumber: industrialPersonnel.employeeNumber,
        sourceDocumentId: industrialPersonnel.sourceDocumentId,
        payloadId: this.personnelPayloadTextKey("id"),
        payloadUnderscoreId: this.personnelPayloadTextKey("_id"),
        payloadFirebaseId: this.personnelPayloadTextKey("firebaseId"),
        payloadDocId: this.personnelPayloadTextKey("docId"),
        payloadPersonnelId: this.personnelPayloadTextKey("personnelId"),
      })
      .from(industrialPersonnel)
      .where(
        and(eq(industrialPersonnel.tenantId, tenantId), isNull(industrialPersonnel.archivedAt)),
      );

    const byLegacyId = new Map<string, string>();
    const byEmployee = new Map<string, string>();
    for (const row of rows) {
      byLegacyId.set(row.id, row.id);
      const sourceDoc = row.sourceDocumentId?.trim();
      if (sourceDoc) byLegacyId.set(sourceDoc, row.id);
      const emp = row.employeeNumber?.trim();
      if (emp) {
        // Index EMP-#### and bare digits so DQF/fleet payloads match either form.
        for (const key of employeeNumberLookupKeys(emp)) {
          if (!byEmployee.has(key)) byEmployee.set(key, row.id);
        }
      }
      for (const key of [
        row.payloadId,
        row.payloadUnderscoreId,
        row.payloadFirebaseId,
        row.payloadDocId,
        row.payloadPersonnelId,
      ]) {
        const trimmed = typeof key === "string" ? key.trim() : "";
        if (trimmed) byLegacyId.set(trimmed, row.id);
      }
    }
    const value = { byLegacyId, byEmployee };
    this.personnelLinkIndexCache.set(tenantId, {
      expiresAt: Date.now() + 60_000,
      value,
    });
    return value;
  }

  private resolvePersonnelIdFromDriverRow(
    row: { personnelId?: string | null; employeeNumber?: string | null },
    payload: Record<string, unknown>,
    index: { byLegacyId: Map<string, string>; byEmployee: Map<string, string> },
  ): string | null {
    const columnId = String(row.personnelId ?? "").trim();
    if (columnId && UUID_PATTERN.test(columnId)) return columnId;

    for (const key of this.personnelLegacyKeysFromPayload(payload)) {
      if (UUID_PATTERN.test(key)) return key;
      const hit = index.byLegacyId.get(key);
      if (hit) return hit;
    }
    const payloadPersonnelId =
      typeof payload.personnelId === "string" ? payload.personnelId.trim() : "";
    if (payloadPersonnelId) {
      if (UUID_PATTERN.test(payloadPersonnelId)) return payloadPersonnelId;
      const hit = index.byLegacyId.get(payloadPersonnelId);
      if (hit) return hit;
    }
    for (const raw of this.employeeNumberCandidatesFromPayload(payload, row.employeeNumber)) {
      for (const key of employeeNumberLookupKeys(raw)) {
        const hit = index.byEmployee.get(key);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Employee # values from payload / details / column for EMP-#### ↔ digits matching. */
  private employeeNumberCandidatesFromPayload(
    payload: Record<string, unknown>,
    rowEmployeeNumber?: string | null,
  ): string[] {
    const details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? (payload.details as Record<string, unknown>)
        : {};
    const raws = [
      payload.employeeNumber,
      payload.employee_number,
      details.employeeNumber,
      details.employee_number,
      rowEmployeeNumber,
    ];
    const out: string[] = [];
    for (const raw of raws) {
      const text = String(raw ?? "").trim();
      if (text) out.push(text);
    }
    return out;
  }

  /**
   * Resolve a DOT row's personnel id without scanning every personnel payload
   * (loadPersonnelLinkIndex). Full-index scans were ~10–15s on large tenants.
   */
  private async resolvePersonnelIdForDotDetail(
    tx: DatabaseTransaction,
    tenantId: string,
    row: { personnelId?: string | null },
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const columnId = String(row.personnelId ?? "").trim();
    if (columnId && UUID_PATTERN.test(columnId)) return columnId;

    const candidates = new Set<string>();
    for (const key of this.personnelLegacyKeysFromPayload(payload)) {
      const trimmed = key.trim();
      if (trimmed) candidates.add(trimmed);
    }
    const payloadPersonnelId =
      typeof payload.personnelId === "string" ? payload.personnelId.trim() : "";
    if (payloadPersonnelId) candidates.add(payloadPersonnelId);

    for (const candidate of candidates) {
      if (UUID_PATTERN.test(candidate)) return candidate;
    }

    for (const candidate of [...candidates].slice(0, 8)) {
      const [bySource] = await tx
        .select({ id: industrialPersonnel.id })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
            eq(industrialPersonnel.sourceDocumentId, candidate),
          ),
        )
        .limit(1);
      if (bySource) return bySource.id;
    }

    for (const raw of this.employeeNumberCandidatesFromPayload(payload)) {
      const match = await findPersonnelByEmployeeNumber(tx, tenantId, raw);
      if (match) return match.id;
    }

    return columnId || null;
  }

  private async resolvePersonnelRecordId(
    principal: ForgePrincipal,
    rawId: string,
    tx?: DatabaseTransaction,
  ): Promise<string> {
    const trimmed = rawId.trim();
    if (!trimmed) throw new ForgeError("NOT_FOUND", "Record not found");
    if (UUID_PATTERN.test(trimmed)) return trimmed;

    const resolve = async (innerTx: DatabaseTransaction) => {
      const index = await this.loadPersonnelLinkIndex(innerTx, principal.tenantId);
      const byLegacy = index.byLegacyId.get(trimmed);
      if (byLegacy) return byLegacy;
      for (const key of employeeNumberLookupKeys(trimmed)) {
        const byEmp = index.byEmployee.get(key);
        if (byEmp) return byEmp;
      }
      throw new ForgeError("NOT_FOUND", "Record not found");
    };

    if (tx) return resolve(tx);
    return withTenantTransaction(this.db, principal.tenantId, resolve);
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

  /** Viewable image URL from a license upload — never return multi-MB data URLs over the API. */
  private uploadImageSrc(raw: unknown, seen?: Set<object>, depth = 0): string | null {
    if (depth > 12) return null;
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value === "") return null;
      if (/^https?:\/\//i.test(value)) return value;
      // Presence stub only — embedding base64 in list/detail JSON is what made DQF file loads 10s+.
      if (value.startsWith("data:image/") || value.startsWith("data:")) {
        return value.length > 128 ? "data:omitted" : value;
      }
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const visited = seen ?? new Set<object>();
    if (visited.has(raw)) return null;
    visited.add(raw);
    const entry = raw as Record<string, unknown>;
    for (const key of ["dataUrl", "url", "downloadURL", "downloadUrl", "src", "href"]) {
      const nested = this.uploadImageSrc(entry[key], visited, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  private mapDotComplianceItem(
    row: {
      id: string;
      title?: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      siteId?: string | null;
      personnelId?: string | null;
      sourceCollection?: string | null;
      sourceDocumentId?: string | null;
      sourcePath?: string | null;
      recordDate?: string | null;
      sourcePayload?: unknown;
    },
    personnelLinkIndex: { byLegacyId: Map<string, string>; byEmployee: Map<string, string> },
  ) {
    const payload = this.slimPayloadForList(this.unwrapSourcePayload(row.sourcePayload));
    const resolvedPersonnelId = this.resolvePersonnelIdFromDriverRow(
      {
        personnelId: row.personnelId ?? null,
        employeeNumber: typeof payload.employeeNumber === "string" ? payload.employeeNumber : null,
      },
      payload,
      personnelLinkIndex,
    );
    return this.mapListItem({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourcePayload: payload,
      extra: {
        siteId: row.siteId ?? null,
        personnelId: resolvedPersonnelId,
        sourceCollection: row.sourceCollection ?? null,
        sourceDocumentId: row.sourceDocumentId ?? null,
        sourcePath: row.sourcePath ?? null,
        recordDate: row.recordDate ?? null,
      },
    });
  }

  private async enrichDotListItem(
    tx: DatabaseTransaction,
    tenantId: string,
    mapped: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const personnelId = String(mapped.personnelId ?? "").trim();
    if (!personnelId || !UUID_PATTERN.test(personnelId)) return mapped;

    const [personRows, driverRows] = await Promise.all([
      tx
        .select({
          id: industrialPersonnel.id,
          isDotDriver: industrialPersonnel.isDotDriver,
          isCompanyDriver: industrialPersonnel.isCompanyDriver,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          email: industrialPersonnel.email,
          sourcePayload: this.slimJsonbPayloadExpr(industrialPersonnel.sourcePayload),
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, personnelId),
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1),
      tx
        .select({
          id: industrialFleetDrivers.id,
          sourcePayload: this.slimJsonbPayloadExpr(industrialFleetDrivers.sourcePayload),
        })
        .from(industrialFleetDrivers)
        .where(
          and(
            eq(industrialFleetDrivers.personnelId, personnelId),
            eq(industrialFleetDrivers.tenantId, tenantId),
            isNull(industrialFleetDrivers.archivedAt),
          ),
        )
        .limit(1),
    ]);
    const person = personRows[0];
    const linkedDriver = driverRows[0];

    const personnelPayload = person ? this.unwrapSourcePayload(person.sourcePayload) : {};
    const driverPayload = linkedDriver
      ? this.unwrapSourcePayload(linkedDriver.sourcePayload)
      : null;
    const dotPayload = { ...mapped };
    const licenseProjection = this.projectLicenseCopies({
      personnelPayload,
      driverPayload,
      dotPayload,
      isDotDriver: Boolean(person?.isDotDriver),
    });
    return { ...mapped, ...licenseProjection };
  }

  /** True Drivers (DQF) file — not company-driver roster noise seeded into DOT. */
  private isDotDqfDriverRecord(
    row: {
      sourceCollection?: string | null;
      sourcePath?: string | null;
      sourceDocumentId?: string | null;
      title?: string | null;
    },
    payload: Record<string, unknown>,
  ): boolean {
    const seeded = String(payload.seededFrom ?? "").toLowerCase();
    const collection = String(row.sourceCollection ?? "").toLowerCase();
    const path = String(row.sourcePath ?? "").toLowerCase();
    if (
      seeded.includes("industrial_fleet_drivers") ||
      seeded.includes("is_company_driver") ||
      collection === "companyvehicledrivers" ||
      collection === "personneldriverqualification" ||
      path.includes("companyvehicledrivers")
    ) {
      return false;
    }
    const hay = [
      row.sourceDocumentId,
      row.sourcePath,
      row.sourceCollection,
      row.title,
      payload.sourceDocumentId,
      payload.recordNumber,
      payload.category,
      payload.createdByName,
      payload.seededFrom,
    ]
      .map((value) => String(value ?? ""))
      .join(" ")
      .toLowerCase();
    if (/\bdrv-\d{4}-\d+\b/.test(hay)) return true;
    if (/dqf\s*import/.test(hay) || collection.includes("dqf")) return true;
    if (/dot-compliance\/[^/]+\/drivers\/drv-/.test(hay)) return true;
    const cat = String(payload.category ?? "")
      .trim()
      .toLowerCase();
    if (cat.includes("dqf")) return true;
    if (payload.dqf === true) return true;
    if (cat === "drivers" || cat.includes("driver")) return true;
    return false;
  }

  private async markPersonnelDotDriverFromDqf(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
  ): Promise<void> {
    if (!UUID_PATTERN.test(personnelId)) return;
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;
    const tenantKey = String(tenantRow?.tenant_key ?? "").trim();
    const ensureCompanyDriver = tenantKey === "producers-rice-mill";

    const [person] = await tx
      .select({
        id: industrialPersonnel.id,
        displayName: industrialPersonnel.displayName,
        siteId: industrialPersonnel.siteId,
        employeeNumber: industrialPersonnel.employeeNumber,
        isCompanyDriver: industrialPersonnel.isCompanyDriver,
      })
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.id, personnelId),
          eq(industrialPersonnel.tenantId, tenantId),
          isNull(industrialPersonnel.archivedAt),
        ),
      )
      .limit(1);
    if (!person) return;

    const patch: Record<string, unknown> = {
      isDotDriver: true,
      updatedAt: new Date(),
    };
    if (ensureCompanyDriver) patch.isCompanyDriver = true;
    await tx
      .update(industrialPersonnel)
      .set(patch as never)
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      );

    if (ensureCompanyDriver || person.isCompanyDriver) {
      await ensureCompanyDriverRosterEntry(tx, tenantId, {
        personnelId,
        driverName: person.displayName,
        siteId: person.siteId,
        employeeNumber: person.employeeNumber,
        seededFrom: "personnel_is_dot_driver",
      });
    }
  }

  /**
   * Persist personnel_id on matching unlinked DOT DQF / fleet driver rows when
   * employee numbers match (EMP-24952 ↔ 24952). Soft read-time resolve alone
   * leaves FKs null so personnel files cannot open the related DQF/roster.
   */
  private async linkMatchingRecordsByEmployeeNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
  ): Promise<{ linkedDotIds: string[]; linkedFleetIds: string[] }> {
    const linkedDotIds: string[] = [];
    const linkedFleetIds: string[] = [];
    if (!UUID_PATTERN.test(personnelId)) return { linkedDotIds, linkedFleetIds };

    const [person] = await tx
      .select({
        id: industrialPersonnel.id,
        employeeNumber: industrialPersonnel.employeeNumber,
        displayName: industrialPersonnel.displayName,
        siteId: industrialPersonnel.siteId,
      })
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.id, personnelId),
          eq(industrialPersonnel.tenantId, tenantId),
          isNull(industrialPersonnel.archivedAt),
        ),
      )
      .limit(1);
    const personEmp = String(person?.employeeNumber ?? "").trim();
    if (!person || !personEmp) return { linkedDotIds, linkedFleetIds };

    const keys = employeeNumberLookupKeys(personEmp);
    if (keys.length === 0) return { linkedDotIds, linkedFleetIds };
    const keySql = sql.join(
      keys.map((key) => sql`${key}`),
      sql`, `,
    );

    const now = new Date();
    const unlinkedDot = await tx
      .select({
        id: industrialDotComplianceRecords.id,
        title: industrialDotComplianceRecords.title,
        sourceCollection: industrialDotComplianceRecords.sourceCollection,
        sourcePath: industrialDotComplianceRecords.sourcePath,
        sourceDocumentId: industrialDotComplianceRecords.sourceDocumentId,
        sourcePayload: industrialDotComplianceRecords.sourcePayload,
      })
      .from(industrialDotComplianceRecords)
      .where(
        and(
          eq(industrialDotComplianceRecords.tenantId, tenantId),
          isNull(industrialDotComplianceRecords.personnelId),
          isNull(industrialDotComplianceRecords.archivedAt),
          sql`(
            lower(btrim(coalesce(${industrialDotComplianceRecords.sourcePayload}->>'employeeNumber', ''))) in (${keySql})
            or lower(btrim(coalesce(${industrialDotComplianceRecords.sourcePayload}->>'employee_number', ''))) in (${keySql})
            or lower(btrim(coalesce(${industrialDotComplianceRecords.sourcePayload}->'details'->>'employeeNumber', ''))) in (${keySql})
            or lower(btrim(coalesce(${industrialDotComplianceRecords.sourcePayload}->'details'->>'employee_number', ''))) in (${keySql})
          )`,
        ),
      )
      .limit(50);

    for (const row of unlinkedDot) {
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      const candidates = this.employeeNumberCandidatesFromPayload(payload);
      if (!candidates.some((candidate) => employeeNumbersMatch(personEmp, candidate))) {
        continue;
      }
      if (!this.isDotDqfDriverRecord(row, payload)) continue;
      await tx
        .update(industrialDotComplianceRecords)
        .set({
          personnelId,
          sourcePayload: { ...payload, personnelId, employeeNumber: personEmp },
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialDotComplianceRecords.id, row.id),
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.personnelId),
          ),
        );
      linkedDotIds.push(row.id);
    }

    if (linkedDotIds.length > 0) {
      await this.markPersonnelDotDriverFromDqf(tx, tenantId, personnelId);
    }

    const unlinkedFleet = await tx
      .select({
        id: industrialFleetDrivers.id,
        employeeNumber: industrialFleetDrivers.employeeNumber,
        sourcePayload: industrialFleetDrivers.sourcePayload,
      })
      .from(industrialFleetDrivers)
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          isNull(industrialFleetDrivers.personnelId),
          isNull(industrialFleetDrivers.archivedAt),
          sql`(
            lower(btrim(coalesce(${industrialFleetDrivers.employeeNumber}, ''))) in (${keySql})
            or lower(btrim(coalesce(${industrialFleetDrivers.sourcePayload}->>'employeeNumber', ''))) in (${keySql})
            or lower(btrim(coalesce(${industrialFleetDrivers.sourcePayload}->>'employee_number', ''))) in (${keySql})
          )`,
        ),
      )
      .limit(50);

    for (const row of unlinkedFleet) {
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      const candidates = this.employeeNumberCandidatesFromPayload(payload, row.employeeNumber);
      if (!candidates.some((candidate) => employeeNumbersMatch(personEmp, candidate))) {
        continue;
      }
      await tx
        .update(industrialFleetDrivers)
        .set({
          personnelId,
          personnelName: person.displayName,
          employeeNumber: personEmp,
          siteId: person.siteId ?? undefined,
          sourcePayload: {
            ...payload,
            personnelId,
            employeeNumber: personEmp,
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialFleetDrivers.id, row.id),
            eq(industrialFleetDrivers.tenantId, tenantId),
            isNull(industrialFleetDrivers.personnelId),
          ),
        );
      linkedFleetIds.push(row.id);
    }

    if (linkedDotIds.length > 0 || linkedFleetIds.length > 0) {
      this.personnelLinkIndexCache.delete(tenantId);
    }
    return { linkedDotIds, linkedFleetIds };
  }

  /**
   * Soft-archive / restore Drivers (DQF) files when the personnel DOT Driver
   * toggle changes, or when the person is terminated/archived. Turning DOT
   * Driver off (or removing the person) hides the file from Drivers lists
   * without deleting history; turning DOT Driver back on restores the same file
   * when it was archived for those reasons.
   */
  private async syncLinkedDotDqfArchiveForPersonnel(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
    isDotDriver: boolean,
    archivedReason = "personnel_is_dot_driver_off",
  ): Promise<void> {
    const now = new Date();
    if (!isDotDriver) {
      const activeRows = await tx
        .select({
          id: industrialDotComplianceRecords.id,
          title: industrialDotComplianceRecords.title,
          sourceCollection: industrialDotComplianceRecords.sourceCollection,
          sourcePath: industrialDotComplianceRecords.sourcePath,
          sourceDocumentId: industrialDotComplianceRecords.sourceDocumentId,
          sourcePayload: industrialDotComplianceRecords.sourcePayload,
        })
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            eq(industrialDotComplianceRecords.personnelId, personnelId),
            isNull(industrialDotComplianceRecords.archivedAt),
          ),
        );
      for (const row of activeRows) {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        if (!this.isDotDqfDriverRecord(row, payload)) continue;
        await tx
          .update(industrialDotComplianceRecords)
          .set({
            archivedAt: now,
            status: "ARCHIVED",
            sourcePayload: {
              ...payload,
              archivedReason,
              archivedFromStatus: String(payload.status ?? "ACTIVE"),
            },
            updatedAt: now,
          })
          .where(eq(industrialDotComplianceRecords.id, row.id));
      }
      return;
    }

    const restorableReasons = new Set([
      "personnel_is_dot_driver_off",
      "personnel_terminated_or_archived",
    ]);
    const archivedRows = await tx
      .select({
        id: industrialDotComplianceRecords.id,
        title: industrialDotComplianceRecords.title,
        sourceCollection: industrialDotComplianceRecords.sourceCollection,
        sourcePath: industrialDotComplianceRecords.sourcePath,
        sourceDocumentId: industrialDotComplianceRecords.sourceDocumentId,
        sourcePayload: industrialDotComplianceRecords.sourcePayload,
      })
      .from(industrialDotComplianceRecords)
      .where(
        and(
          eq(industrialDotComplianceRecords.tenantId, tenantId),
          eq(industrialDotComplianceRecords.personnelId, personnelId),
          isNotNull(industrialDotComplianceRecords.archivedAt),
        ),
      )
      .orderBy(desc(industrialDotComplianceRecords.updatedAt));
    for (const row of archivedRows) {
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      if (!this.isDotDqfDriverRecord(row, payload)) continue;
      const reason = String(payload.archivedReason ?? "").trim();
      if (reason && !restorableReasons.has(reason)) continue;
      const priorStatus = String(payload.archivedFromStatus ?? "ACTIVE").trim() || "ACTIVE";
      const nextPayload = { ...payload };
      delete nextPayload.archivedReason;
      delete nextPayload.archivedFromStatus;
      await tx
        .update(industrialDotComplianceRecords)
        .set({
          archivedAt: null,
          status: priorStatus === "ARCHIVED" ? "ACTIVE" : priorStatus,
          sourcePayload: nextPayload,
          updatedAt: now,
        })
        .where(eq(industrialDotComplianceRecords.id, row.id));
      // Restore at most one DQF file per person.
      break;
    }
  }

  /**
   * Soft-archive active Drivers (DQF) files whose linked personnel is
   * terminated, archived, or otherwise inactive. Clears isDotDriver on those
   * people. Self-heals orphans that predate terminate/archive sync.
   */
  private async archiveDqfForInactivePersonnel(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<void> {
    const now = new Date();
    const rows = await tx
      .select({
        id: industrialDotComplianceRecords.id,
        title: industrialDotComplianceRecords.title,
        sourceCollection: industrialDotComplianceRecords.sourceCollection,
        sourcePath: industrialDotComplianceRecords.sourcePath,
        sourceDocumentId: industrialDotComplianceRecords.sourceDocumentId,
        sourcePayload: industrialDotComplianceRecords.sourcePayload,
        personnelId: industrialDotComplianceRecords.personnelId,
      })
      .from(industrialDotComplianceRecords)
      .innerJoin(
        industrialPersonnel,
        and(
          eq(industrialDotComplianceRecords.personnelId, industrialPersonnel.id),
          eq(industrialPersonnel.tenantId, tenantId),
        ),
      )
      .where(
        and(
          eq(industrialDotComplianceRecords.tenantId, tenantId),
          isNull(industrialDotComplianceRecords.archivedAt),
          isNotNull(industrialDotComplianceRecords.personnelId),
          or(
            isNotNull(industrialPersonnel.archivedAt),
            sql`upper(btrim(${industrialPersonnel.status})) in ('INACTIVE', 'TERMINATED', 'ARCHIVED')`,
          ),
        ),
      )
      .limit(500);

    const personnelIds = new Set<string>();
    for (const row of rows) {
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      if (!this.isDotDqfDriverRecord(row, payload)) continue;
      await tx
        .update(industrialDotComplianceRecords)
        .set({
          archivedAt: now,
          status: "ARCHIVED",
          sourcePayload: {
            ...payload,
            archivedReason: "personnel_terminated_or_archived",
            archivedFromStatus: String(payload.status ?? "ACTIVE"),
          },
          updatedAt: now,
        })
        .where(eq(industrialDotComplianceRecords.id, row.id));
      if (row.personnelId) personnelIds.add(row.personnelId);
    }

    if (personnelIds.size > 0) {
      await tx
        .update(industrialPersonnel)
        .set({ isDotDriver: false, updatedAt: now })
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            inArray(industrialPersonnel.id, [...personnelIds]),
          ),
        );
    }
  }

  /**
   * Soft-remove company-driver roster when Company Driver is turned off.
   * Does not delete history; ensureCompanyDriverRosterEntry can revive the row.
   */
  private async syncCompanyDriverRosterForPersonnel(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
    isCompanyDriver: boolean,
  ): Promise<void> {
    if (isCompanyDriver) return;
    const now = new Date();
    await tx
      .update(industrialFleetDrivers)
      .set({
        status: "removed",
        archivedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          eq(industrialFleetDrivers.personnelId, personnelId),
          isNull(industrialFleetDrivers.archivedAt),
        ),
      );
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
    isDotDriver: boolean;
  }): Record<string, unknown> {
    const { personnelPayload, driverPayload, dotPayload, isDotDriver } = args;
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

    const documentIdFrom = (raw: unknown): string | null => {
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const id = String((row as Record<string, unknown>).documentId ?? "").trim();
      return UUID_PATTERN.test(id) ? id : null;
    };

    const frontDoc =
      documentIdFrom(personnelPayload.licenseFrontUpload) ??
      documentIdFrom(driverPayload?.licenseFrontUpload) ??
      documentIdFrom(dotPayload?.licenseFrontUpload) ??
      documentIdFrom(dotPayload?.driversLicenseCopy);
    const backDoc =
      documentIdFrom(personnelPayload.licenseBackUpload) ??
      documentIdFrom(driverPayload?.licenseBackUpload) ??
      documentIdFrom(dotPayload?.licenseBackUpload) ??
      documentIdFrom(dotPayload?.driversLicenseBack);

    const front = fromPersonFront ?? fromDriverFront ?? fromDotFront ?? null;
    const back = fromPersonBack ?? fromDriverBack ?? fromDotBack ?? null;
    const requiresLicenseCopies = isDotDriver || !!dotPayload;

    const out: Record<string, unknown> = {
      requiresLicenseCopies,
      hasLicenseFront: !!front || !!frontDoc,
      hasLicenseBack: !!back || !!backDoc,
    };
    if (front) {
      out.licenseFrontUrl = front;
    }
    if (back) {
      out.licenseBackUrl = back;
    }
    const pickUpload = (...candidates: unknown[]) => {
      for (const candidate of candidates) {
        const slim = this.slimPayloadForList(this.unwrapSourcePayload(candidate));
        if (slim && Object.keys(slim).length > 0) return slim;
        const docId = documentIdFrom(candidate);
        if (docId) {
          return {
            documentId: docId,
            ...(typeof candidate === "object" && candidate && !Array.isArray(candidate)
              ? {
                  name: String(
                    (candidate as Record<string, unknown>).name ??
                      (candidate as Record<string, unknown>).fileName ??
                      "License copy",
                  ),
                }
              : {}),
          };
        }
      }
      return null;
    };
    const frontUpload =
      pickUpload(
        personnelPayload.licenseFrontUpload,
        driverPayload?.licenseFrontUpload,
        dotPayload?.licenseFrontUpload,
        Array.isArray(dotPayload?.driversLicenseCopy)
          ? (dotPayload?.driversLicenseCopy as unknown[])[0]
          : dotPayload?.driversLicenseCopy,
      ) || null;
    if (frontUpload) out.licenseFrontUpload = frontUpload;
    const backUpload =
      pickUpload(
        personnelPayload.licenseBackUpload,
        driverPayload?.licenseBackUpload,
        dotPayload?.licenseBackUpload,
        dotPayload?.driversLicenseBack,
      ) || null;
    if (backUpload) out.licenseBackUpload = backUpload;
    return out;
  }

  private licenseDocumentIdFromUpload(raw: unknown): string | null {
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const id = String((row as Record<string, unknown>).documentId ?? "").trim();
    return UUID_PATTERN.test(id) ? id : null;
  }

  /** Turn S3-backed license documentIds into short-lived presigned image URLs for GET. */
  private async resolveLicenseDownloadUrls(
    tx: DatabaseTransaction,
    tenantId: string,
    projection: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.storage) return projection;

    const out = { ...projection };
    const resolveSide = async (
      uploadKey: "licenseFrontUpload" | "licenseBackUpload",
      urlKey: "licenseFrontUrl" | "licenseBackUrl",
    ) => {
      const existing = this.uploadImageSrc(out[urlKey]);
      if (existing && existing !== "data:omitted") {
        out[urlKey] = existing;
        return;
      }

      const documentId = this.licenseDocumentIdFromUpload(out[uploadKey]);
      if (!documentId) return;

      const [document] = await tx
        .select({
          id: forgeDocuments.id,
          tenantId: forgeDocuments.tenantId,
          objectKey: forgeDocuments.objectKey,
          mimeType: forgeDocuments.mimeType,
          originalFilename: forgeDocuments.originalFilename,
          uploadStatus: forgeDocuments.uploadStatus,
          source: forgeDocuments.source,
        })
        .from(forgeDocuments)
        .where(and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)))
        .limit(1);
      if (!document || document.uploadStatus !== "COMPLETE") return;
      if (
        document.source !== "INDUSTRIAL_PERSONNEL_LICENSE" &&
        document.source !== "INDUSTRIAL_DOT_DQF"
      ) {
        return;
      }
      if (
        !documentBelongsToTenant(document.tenantId, tenantId) ||
        !objectKeyBelongsToTenant(document.objectKey, tenantId)
      ) {
        return;
      }

      const inline =
        document.mimeType.startsWith("image/") || document.mimeType === "application/pdf";
      const presign = await this.storage!.createPresignedDownloadUrl({
        objectKey: document.objectKey,
        mimeType: document.mimeType,
        filename: document.originalFilename,
        inline,
      });
      out[urlKey] = presign.downloadUrl;
    };

    await Promise.all([
      resolveSide("licenseFrontUpload", "licenseFrontUrl"),
      resolveSide("licenseBackUpload", "licenseBackUrl"),
    ]);
    return out;
  }

  /** Copy DQF license document refs onto the linked personnel source_payload. */
  private async syncPersonnelLicenseFromDotPayload(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
    dotPayload: Record<string, unknown>,
  ): Promise<void> {
    if (!UUID_PATTERN.test(personnelId)) return;
    const [person] = await tx
      .select({
        id: industrialPersonnel.id,
        sourcePayload: industrialPersonnel.sourcePayload,
      })
      .from(industrialPersonnel)
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      )
      .limit(1);
    if (!person) return;

    const extractUpload = (raw: unknown): Record<string, unknown> | null => {
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const entry = row as Record<string, unknown>;
      const documentId = String(entry.documentId ?? "").trim();
      if (!UUID_PATTERN.test(documentId)) return null;
      return {
        name: String(
          entry.name ?? entry.fileName ?? entry.originalFilename ?? "License copy",
        ).trim(),
        fileName: String(entry.fileName ?? entry.name ?? "license.jpg").trim(),
        documentId,
        contentType: String(entry.contentType ?? entry.mimeType ?? "image/jpeg").trim(),
        ...(typeof entry.fileSizeBytes === "number" ? { fileSizeBytes: entry.fileSizeBytes } : {}),
        uploadedAt: String(entry.uploadedAt ?? new Date().toISOString()),
      };
    };

    const front =
      extractUpload(dotPayload.licenseFrontUpload) ??
      extractUpload(dotPayload.driversLicenseCopy) ??
      extractUpload(dotPayload.driversLicenseFront);
    const back =
      extractUpload(dotPayload.licenseBackUpload) ?? extractUpload(dotPayload.driversLicenseBack);
    if (!front && !back) return;

    const payload = this.unwrapSourcePayload(person.sourcePayload);
    const next: Record<string, unknown> = { ...payload };
    if (front) {
      next.licenseFrontUpload = front;
      next.licenseFrontUrl = "";
    }
    if (back) {
      next.licenseBackUpload = back;
      next.licenseBackUrl = "";
    }
    const now = new Date();
    await tx
      .update(industrialPersonnel)
      .set({ sourcePayload: next, updatedAt: now })
      .where(eq(industrialPersonnel.id, personnelId));

    const [linkedDriver] = await tx
      .select()
      .from(industrialFleetDrivers)
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          eq(industrialFleetDrivers.personnelId, personnelId),
          isNull(industrialFleetDrivers.archivedAt),
        ),
      )
      .limit(1);
    if (linkedDriver) {
      const driverPayload = this.unwrapSourcePayload(linkedDriver.sourcePayload);
      await tx
        .update(industrialFleetDrivers)
        .set({
          sourcePayload: {
            ...driverPayload,
            ...(front ? { licenseFrontUpload: front, licenseFrontUrl: "" } : {}),
            ...(back ? { licenseBackUpload: back, licenseBackUrl: "" } : {}),
          },
          updatedAt: now,
        })
        .where(eq(industrialFleetDrivers.id, linkedDriver.id));
    }
  }

  private latestUploadAt(uploads: Record<string, unknown>[]): string {
    let latest = "";
    for (const upload of uploads) {
      const at = String(upload.uploadedAt ?? "").trim();
      if (at > latest) latest = at;
    }
    return latest;
  }

  private page(query: ListQuery, maxPageSize = 500) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(maxPageSize, Math.max(1, Number(query.pageSize ?? 50) || 50));
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
    // Authoritative row fields must win — Firebase payloads often include their own
    // `id` / `status` / timestamps, which would break detail deep-links if spread last.
    return {
      ...filled,
      id: row.id,
      title,
      displayName: title,
      name: title,
      status: row.status,
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

  /**
   * Strip inline binaries from jsonb WITHOUT regexp_replace on the whole document.
   * Full-document regexp on multi-MB DQF payloads is what made GET /dot/:id take ~15s.
   * Large string values are stubbed (optionally keeping documentId from the first 8KB).
   */
  private slimJsonbPayloadExpr(column: typeof industrialDotComplianceRecords.sourcePayload) {
    return sql<unknown>`(
      case
        when ${column} is null then '{}'::jsonb
        when jsonb_typeof(${column}) = 'object' then (
          select coalesce(jsonb_object_agg(key, slimmed), '{}'::jsonb)
          from (
            select
              key,
              case
                when jsonb_typeof(value) = 'string'
                  and (
                    length(value #>> '{}') > 2048
                    or (value #>> '{}') like 'data:%'
                  )
                then
                  case
                    when (value #>> '{}') like 'data:%' then '"data:omitted"'::jsonb
                    when left(value #>> '{}', 1) in ('[', '{') then
                      to_jsonb(
                        '[{"name":"document"'
                        || case
                          when position('"documentId"' in left(value #>> '{}', 8192)) > 0 then
                            ',"documentId":"'
                            || coalesce(
                              substring(
                                left(value #>> '{}', 8192)
                                from '"documentId"[[:space:]]*:[[:space:]]*"([^"]{8,80})"'
                              ),
                              ''
                            )
                            || '"'
                          else ''
                        end
                        || ',"dataUrl":"data:omitted"}]'
                      )
                    else '"[omitted]"'::jsonb
                  end
                when jsonb_typeof(value) = 'object' then (
                  select coalesce(jsonb_object_agg(k2, v2), '{}'::jsonb)
                  from (
                    select
                      k2,
                      case
                        when jsonb_typeof(v2) = 'string'
                          and (
                            length(v2 #>> '{}') > 2048
                            or (v2 #>> '{}') like 'data:%'
                          )
                        then
                          case
                            when (v2 #>> '{}') like 'data:%' then '"data:omitted"'::jsonb
                            else '"[omitted]"'::jsonb
                          end
                        else v2
                      end as v2
                    from jsonb_each(value) as nested(k2, v2)
                  ) slim_obj
                )
                when jsonb_typeof(value) = 'array' then (
                  select coalesce(jsonb_agg(slim_el ORDER BY ord), '[]'::jsonb)
                  from (
                    select
                      ord,
                      case
                        when jsonb_typeof(el) = 'object' then (
                          select coalesce(jsonb_object_agg(ek, ev), '{}'::jsonb)
                          from (
                            select
                              ek,
                              case
                                when ek in ('dataUrl', 'dataURL', 'downloadURL', 'url')
                                  and jsonb_typeof(ev) = 'string'
                                  and (
                                    length(ev #>> '{}') > 128
                                    or (ev #>> '{}') like 'data:%'
                                  )
                                then
                                  case
                                    when (ev #>> '{}') like 'data:%' then '"data:omitted"'::jsonb
                                    when (ev #>> '{}') like 'http%' then ev
                                    else '"[omitted]"'::jsonb
                                  end
                                when jsonb_typeof(ev) = 'string'
                                  and length(ev #>> '{}') > 2048
                                then '"[omitted]"'::jsonb
                                else ev
                              end as ev
                            from jsonb_each(el) as e(ek, ev)
                          ) slim_file
                        )
                        when jsonb_typeof(el) = 'string'
                          and (
                            length(el #>> '{}') > 2048
                            or (el #>> '{}') like 'data:%'
                          )
                        then
                          case
                            when (el #>> '{}') like 'data:%' then '"data:omitted"'::jsonb
                            else '"[omitted]"'::jsonb
                          end
                        else el
                      end as slim_el
                    from jsonb_array_elements(value) with ordinality as arr(el, ord)
                  ) slim_arr
                )
                else value
              end as slimmed
            from jsonb_each(${column}) as root(key, value)
          ) slim_root
        )
        when jsonb_typeof(${column}) = 'string' then (
          case
            when length(${column} #>> '{}') > 2048
              or (${column} #>> '{}') like 'data:%'
            then '"data:omitted"'::jsonb
            else
              case
                when left(btrim(${column} #>> '{}'), 1) = '{' then (
                  -- String-wrapped object: slim the inner object with the same rules (one unwrap).
                  select coalesce(jsonb_object_agg(key, slimmed), '{}'::jsonb)
                  from (
                    select
                      key,
                      case
                        when jsonb_typeof(value) = 'string'
                          and (
                            length(value #>> '{}') > 2048
                            or (value #>> '{}') like 'data:%'
                          )
                        then
                          case
                            when (value #>> '{}') like 'data:%' then '"data:omitted"'::jsonb
                            when left(value #>> '{}', 1) in ('[', '{') then
                              to_jsonb(
                                '[{"name":"document"'
                                || case
                                  when position('"documentId"' in left(value #>> '{}', 8192)) > 0 then
                                    ',"documentId":"'
                                    || coalesce(
                                      substring(
                                        left(value #>> '{}', 8192)
                                        from '"documentId"[[:space:]]*:[[:space:]]*"([^"]{8,80})"'
                                      ),
                                      ''
                                    )
                                    || '"'
                                  else ''
                                end
                                || ',"dataUrl":"data:omitted"}]'
                              )
                            else '"[omitted]"'::jsonb
                          end
                        else value
                      end as slimmed
                    from jsonb_each((${column} #>> '{}')::jsonb) as root(key, value)
                  ) slim_wrapped
                )
                else ${column}
              end
          end
        )
        else ${column}
      end
    )`;
  }

  async listModule(principal: ForgePrincipal, moduleKey: string, query: ListQuery) {
    const table = this.tableFor(moduleKey);
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      // Purge at most once per tenant per 6h — do not re-delete on every first-page list.
      if (moduleKey === "dot" && page === 1) {
        const lastPurge = this.dvirPurgeAtByTenant.get(principal.tenantId) ?? 0;
        if (Date.now() - lastPurge > 6 * 60 * 60 * 1000) {
          await this.purgeExpiredDvirs(tx, principal.tenantId);
          this.dvirPurgeAtByTenant.set(principal.tenantId, Date.now());
        }
        const lastDqfArchive = this.dqfInactiveArchiveAtByTenant.get(principal.tenantId) ?? 0;
        if (Date.now() - lastDqfArchive > 5 * 60 * 1000) {
          await this.archiveDqfForInactivePersonnel(tx, principal.tenantId);
          this.dqfInactiveArchiveAtByTenant.set(principal.tenantId, Date.now());
        }
      }
      const conditions = [eq(table.tenantId, principal.tenantId), isNull(table.archivedAt)];
      if (status) conditions.push(eq(table.status, status));
      if (siteId && "siteId" in table) {
        conditions.push(eq((table as typeof industrialIncidents).siteId, siteId));
      }
      if (q && "title" in table) {
        conditions.push(ilike((table as typeof industrialIncidents).title, `%${q}%`));
      }
      if (moduleKey === "dot") {
        const dotTable = industrialDotComplianceRecords;
        const items = await tx
          .select({
            id: dotTable.id,
            title: dotTable.title,
            status: dotTable.status,
            createdAt: dotTable.createdAt,
            updatedAt: dotTable.updatedAt,
            siteId: dotTable.siteId,
            personnelId: dotTable.personnelId,
            sourceCollection: dotTable.sourceCollection,
            sourceDocumentId: dotTable.sourceDocumentId,
            sourcePath: dotTable.sourcePath,
            recordDate: dotTable.recordDate,
            sourcePayload: this.slimJsonbPayloadExpr(dotTable.sourcePayload),
          })
          .from(dotTable)
          .where(and(...conditions))
          .orderBy(desc(dotTable.updatedAt))
          .limit(pageSize)
          .offset(offset);
        const personnelLinkIndex = await this.loadPersonnelLinkIndex(tx, principal.tenantId);
        return {
          page,
          pageSize,
          items: items.map((r) =>
            this.mapDotComplianceItem(
              r as {
                id: string;
                title?: string | null;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                siteId?: string | null;
                personnelId?: string | null;
                sourceCollection?: string | null;
                sourceDocumentId?: string | null;
                sourcePath?: string | null;
                recordDate?: string | null;
                sourcePayload?: unknown;
              },
              personnelLinkIndex,
            ),
          ),
        };
      }
      if (moduleKey === "forms") {
        const formTable = industrialFormDefinitions;
        const items = await tx
          .select({
            id: formTable.id,
            title: formTable.title,
            status: formTable.status,
            createdAt: formTable.createdAt,
            updatedAt: formTable.updatedAt,
            formKey: formTable.formKey,
            version: formTable.version,
            sourceDocumentId: formTable.sourceDocumentId,
            category: sql<string | null>`nullif(btrim(coalesce(
              case
                when jsonb_typeof(${formTable.sourcePayload}) = 'string'
                  then ((${formTable.sourcePayload} #>> '{}')::jsonb ->> 'category')
                else ${formTable.sourcePayload} ->> 'category'
              end,
              ${formTable.formKey},
              ''
            )), '')`,
            fieldCount: sql<number>`coalesce(
              case
                when jsonb_typeof(${formTable.schemaJson} -> 'fields') = 'array'
                  then jsonb_array_length(${formTable.schemaJson} -> 'fields')
                when jsonb_typeof(${formTable.schemaJson} -> 'questions') = 'array'
                  then jsonb_array_length(${formTable.schemaJson} -> 'questions')
                else 0
              end,
              0
            )::int`,
          })
          .from(formTable)
          .where(and(...conditions))
          .orderBy(desc(formTable.updatedAt))
          .limit(pageSize)
          .offset(offset);
        return {
          page,
          pageSize,
          items: items.map((r) => {
            const title = r.title ?? r.id;
            return {
              id: r.id,
              title,
              displayName: title,
              name: title,
              status: r.status,
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
              formKey: r.formKey ?? null,
              version: r.version ?? null,
              sourceDocumentId: r.sourceDocumentId ?? null,
              category: r.category ?? null,
              fieldCount: r.fieldCount,
            };
          }),
        };
      }
      if (moduleKey === "observations") {
        const obs = industrialObservations;
        const obsConditions = [eq(obs.tenantId, principal.tenantId), isNull(obs.archivedAt)];
        if (status) obsConditions.push(inArray(obs.status, observationStatusFilterValues(status)));
        if (siteId) obsConditions.push(eq(obs.siteId, siteId));
        if (q) obsConditions.push(ilike(obs.title, `%${q}%`));
        // Photos are stripped in SQL so list queries never pull image data off disk.
        const rows = await tx
          .select({
            id: obs.id,
            title: obs.title,
            status: obs.status,
            createdAt: obs.createdAt,
            updatedAt: obs.updatedAt,
            siteId: obs.siteId,
            sourcePayload: sql<unknown>`case when jsonb_typeof(${obs.sourcePayload}) = 'object'
              then (${obs.sourcePayload} - 'photos' - 'followUp' - 'followUpTokens' - 'emailLog')
                || jsonb_build_object(
                  'followUpCompletedAt', ${obs.sourcePayload} -> 'followUp' ->> 'completedAt',
                  'followUpSavedAt', ${obs.sourcePayload} -> 'followUp' ->> 'savedAt'
                )
              else '{}'::jsonb end`,
            photoCount: sql<number>`case when jsonb_typeof(${obs.sourcePayload} -> 'photos') = 'array'
              then jsonb_array_length(${obs.sourcePayload} -> 'photos') else 0 end`,
          })
          .from(obs)
          .where(and(...obsConditions))
          .orderBy(desc(obs.updatedAt))
          .limit(pageSize)
          .offset(offset);
        return {
          page,
          pageSize,
          items: rows.map((r) => ({
            ...this.mapListItem({ ...r, extra: { siteId: r.siteId ?? null } }),
            photoCount: Number(r.photoCount) || 0,
          })),
        };
      }
      const items = await tx
        .select()
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.updatedAt))
        .limit(pageSize)
        .offset(offset);
      if (moduleKey === "tasks") {
        const assigneeIds = [
          ...new Set(
            items
              .map((r) =>
                "assigneePersonnelId" in r
                  ? String((r as { assigneePersonnelId?: string | null }).assigneePersonnelId ?? "")
                  : "",
              )
              .filter(Boolean),
          ),
        ];
        const nameById = new Map<string, string>();
        if (assigneeIds.length > 0) {
          const people = await tx
            .select({
              id: industrialPersonnel.id,
              displayName: industrialPersonnel.displayName,
            })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.tenantId, principal.tenantId),
                inArray(industrialPersonnel.id, assigneeIds),
              ),
            );
          for (const person of people) {
            nameById.set(person.id, person.displayName);
          }
        }
        return {
          page,
          pageSize,
          items: items.map((r) => {
            const task = r as {
              id: string;
              title?: string | null;
              status: string;
              createdAt: Date;
              updatedAt: Date;
              sourcePayload?: unknown;
              assigneePersonnelId?: string | null;
              dueDate?: string | null;
            };
            const assigneePersonnelId = task.assigneePersonnelId ?? null;
            const assigneeName = assigneePersonnelId
              ? (nameById.get(assigneePersonnelId) ?? null)
              : null;
            const payload =
              task.sourcePayload &&
              typeof task.sourcePayload === "object" &&
              !Array.isArray(task.sourcePayload)
                ? (task.sourcePayload as Record<string, unknown>)
                : {};
            const createdByUserId = taskCreatedByUserId(payload);
            return this.mapListItem({
              id: task.id,
              title: task.title,
              status: task.status,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt,
              sourcePayload: task.sourcePayload,
              extra: {
                assigneePersonnelId,
                assigneeName,
                dueDate: task.dueDate ?? null,
                deadlineDate: task.dueDate ?? null,
                ...(createdByUserId ? { createdByUserId } : {}),
              },
            });
          }),
        };
      }
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
                siteId:
                  "siteId" in r ? ((r as { siteId?: string | null }).siteId ?? null) : undefined,
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
      if (moduleKey === "dot") {
        const dotTable = industrialDotComplianceRecords;
        const [row] = await tx
          .select({
            id: dotTable.id,
            title: dotTable.title,
            status: dotTable.status,
            createdAt: dotTable.createdAt,
            updatedAt: dotTable.updatedAt,
            siteId: dotTable.siteId,
            personnelId: dotTable.personnelId,
            sourceCollection: dotTable.sourceCollection,
            sourceDocumentId: dotTable.sourceDocumentId,
            sourcePath: dotTable.sourcePath,
            recordDate: dotTable.recordDate,
            // Slim in SQL so multi-MB license/DQF blobs never leave Postgres on open.
            // Node-side slim still paid the transfer + parse cost (~10–15s on fat rows).
            sourcePayload: this.slimJsonbPayloadExpr(dotTable.sourcePayload),
          })
          .from(dotTable)
          .where(and(eq(dotTable.id, recordId), eq(dotTable.tenantId, principal.tenantId)))
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Record not found");
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const resolvedPersonnelId = await this.resolvePersonnelIdForDotDetail(
          tx,
          principal.tenantId,
          { personnelId: row.personnelId },
          payload,
        );
        // Persist soft matches so personnel files and archive toggles share the FK.
        if (
          resolvedPersonnelId &&
          UUID_PATTERN.test(resolvedPersonnelId) &&
          String(row.personnelId ?? "").trim() !== resolvedPersonnelId
        ) {
          await tx
            .update(dotTable)
            .set({
              personnelId: resolvedPersonnelId,
              updatedAt: new Date(),
            })
            .where(and(eq(dotTable.id, recordId), eq(dotTable.tenantId, principal.tenantId)));
          if (
            this.isDotDqfDriverRecord(
              {
                sourceCollection: row.sourceCollection,
                sourcePath: row.sourcePath,
                sourceDocumentId: row.sourceDocumentId,
                title: row.title,
              },
              payload,
            )
          ) {
            await this.markPersonnelDotDriverFromDqf(tx, principal.tenantId, resolvedPersonnelId);
          }
        }
        // Never call loadPersonnelLinkIndex / enrichDotListItem on detail — both
        // re-scan or re-load multi-MB personnel payloads and dominate open time.
        return this.mapListItem({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: payload,
          extra: {
            siteId: row.siteId ?? null,
            personnelId: resolvedPersonnelId,
            sourceCollection: row.sourceCollection ?? null,
            sourceDocumentId: row.sourceDocumentId ?? null,
            sourcePath: row.sourcePath ?? null,
            recordDate: row.recordDate ?? null,
          },
        });
      }
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
      if ("personnelId" in table) {
        let personnelId = body.personnelId ? String(body.personnelId).trim() : "";
        if (!UUID_PATTERN.test(personnelId) && moduleKey === "dot") {
          const payloadBody =
            body && typeof body === "object" && !Array.isArray(body)
              ? (body as Record<string, unknown>)
              : {};
          for (const raw of this.employeeNumberCandidatesFromPayload(payloadBody)) {
            const match = await findPersonnelByEmployeeNumber(tx, principal.tenantId, raw);
            if (match) {
              personnelId = match.id;
              break;
            }
          }
        }
        if (UUID_PATTERN.test(personnelId)) {
          values.personnelId = personnelId;
          if (moduleKey === "dot") {
            values.sourcePayload = {
              ...(typeof values.sourcePayload === "object" &&
              values.sourcePayload &&
              !Array.isArray(values.sourcePayload)
                ? (values.sourcePayload as Record<string, unknown>)
                : body),
              personnelId,
            };
          }
        }
      }
      if (moduleKey === "corrective-actions") {
        values.parentEntityType = String(body.parentEntityType ?? "MANUAL");
        values.title = title;
        if (body.parentEntityId) values.parentEntityId = String(body.parentEntityId);
        if (body.description) values.description = String(body.description);
        if (body.priority) values.priority = String(body.priority);
        if (body.dueDate) values.dueDate = String(body.dueDate);
      }
      if (moduleKey === "tasks") {
        const assigneePersonnelId = String(
          body.assigneePersonnelId ?? body.assigneeId ?? "",
        ).trim();
        const dueRaw = String(body.dueDate ?? body.deadlineDate ?? "").trim();
        const dueDate = /^\d{4}-\d{2}-\d{2}/.test(dueRaw) ? dueRaw.slice(0, 10) : "";
        let assigneeName = typeof body.assigneeName === "string" ? body.assigneeName.trim() : "";
        if (assigneePersonnelId) {
          const [person] = await tx
            .select({
              id: industrialPersonnel.id,
              displayName: industrialPersonnel.displayName,
            })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, assigneePersonnelId),
                eq(industrialPersonnel.tenantId, principal.tenantId),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
            .limit(1);
          if (!person) {
            throw new ForgeError("VALIDATION_FAILED", "Assignee not found.");
          }
          values.assigneePersonnelId = person.id;
          assigneeName = person.displayName?.trim() || assigneeName;
        }
        if (dueDate) values.dueDate = dueDate;
        values.sourcePayload = {
          ...body,
          createdByUserId: principal.userId,
          ...(assigneePersonnelId ? { assigneePersonnelId } : {}),
          ...(assigneeName ? { assigneeName } : {}),
          ...(dueDate ? { deadlineDate: dueDate, dueDate } : {}),
        };
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
      if (moduleKey === "dot" && String(body.recordType ?? "").toUpperCase() === "DVIR") {
        try {
          const parsed = assertDvirDriverBody(body);
          const nextPayload = {
            ...body,
            ...parsed,
            category: "dvirs",
            recordType: "DVIR",
            submittedVia: body.submittedVia === "public-qr" ? "public-qr" : "office",
          };
          values.sourcePayload = nextPayload;
          values.sourceCollection = "dvirs";
          values.status = dvirStatusForDefects(
            parsed.truckDefects.length + parsed.trailerDefects.length,
          );
          values.title = String(body.title ?? dvirTitle(parsed.tripType, parsed.truckNumber));
          if (parsed.inspectionDate) values.recordDate = parsed.inspectionDate.slice(0, 10);
        } catch (e) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            e instanceof Error ? e.message : "Invalid DVIR",
          );
        }
      }
      const [row] = await tx
        .insert(table)
        .values(values as never)
        .returning();
      if (
        moduleKey === "dot" &&
        values.personnelId &&
        this.isDotDqfDriverRecord(
          {
            sourceCollection:
              typeof values.sourceCollection === "string" ? values.sourceCollection : null,
            sourcePath: typeof values.sourcePath === "string" ? values.sourcePath : null,
            sourceDocumentId:
              typeof values.sourceDocumentId === "string" ? values.sourceDocumentId : null,
            title: typeof values.title === "string" ? values.title : title,
          },
          this.unwrapSourcePayload(values.sourcePayload),
        )
      ) {
        await this.markPersonnelDotDriverFromDqf(
          tx,
          principal.tenantId,
          String(values.personnelId),
        );
      }
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
      if (moduleKey === "tasks") {
        const taskRow = row as {
          id: string;
          title?: string | null;
          status: string;
          createdAt: Date;
          updatedAt: Date;
          sourcePayload?: unknown;
          assigneePersonnelId?: string | null;
          dueDate?: string | null;
        };
        return this.mapListItem({
          id: taskRow.id,
          title: taskRow.title ?? title,
          status: taskRow.status,
          createdAt: taskRow.createdAt,
          updatedAt: taskRow.updatedAt,
          sourcePayload: taskRow.sourcePayload,
          extra: {
            assigneePersonnelId: taskRow.assigneePersonnelId ?? null,
            dueDate: taskRow.dueDate ?? null,
            deadlineDate: taskRow.dueDate ?? null,
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
      const archived = row as {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        title?: string | null;
      };
      const title = archived.title?.trim() ? archived.title : archived.id;
      // Omit source_payload / schema — form archives were returning multi-MB bodies.
      return {
        id: archived.id,
        title,
        displayName: title,
        name: title,
        status: archived.status,
        createdAt: archived.createdAt.toISOString(),
        updatedAt: archived.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Soft-delete an incident. Restricted to EHS / Safety Director roles and
   * Forge Creator (platform admin or FORGE_CREATOR product).
   */
  async archiveIncident(principal: ForgePrincipal, id: string) {
    await this.assertCanDeleteIncidents(principal);
    return this.archiveModule(principal, "incidents", id);
  }

  /**
   * Soft-delete a form template. Restricted to Tenant Admin and Forge Creator.
   */
  async archiveFormDefinition(principal: ForgePrincipal, id: string) {
    this.assertCanDeleteForms(principal);
    return this.archiveModule(principal, "forms", id);
  }

  async incidentPrintable(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
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
      if (!row) throw new ForgeError("NOT_FOUND", "Incident not found");
      const branding = await this.loadFormPrintBranding(tx, principal.tenantId);
      const mapped = this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: this.unwrapSourcePayload(row.sourcePayload),
        extra: { siteId: row.siteId },
      }) as Record<string, unknown>;
      const html = buildIncidentPrintableHtml(mapped, branding);
      return { html, title: String(mapped.title ?? "Incident report") };
    });
  }

  /** Root cause analysis report; prints `rootCauseAnalysis` from the body (unsaved edits) or the saved one. */
  async incidentRcaPrintable(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
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
      if (!row) throw new ForgeError("NOT_FOUND", "Incident not found");
      const branding = await this.loadFormPrintBranding(tx, principal.tenantId);
      const payload = this.unwrapSourcePayload(row.sourcePayload);
      const mapped = this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: payload,
        extra: { siteId: row.siteId },
      }) as Record<string, unknown>;
      const rca = normalizeRcaForPrint(body.rootCauseAnalysis ?? payload.rootCauseAnalysis);
      const html = buildRcaPrintableHtml({ incident: mapped, rca, branding });
      return { html, title: `Root Cause Analysis - ${String(mapped.title ?? "Incident")}` };
    });
  }

  private async assertCanDeleteIncidents(principal: ForgePrincipal) {
    if (
      canDeleteIncidents({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        roles: [],
      })
    ) {
      return;
    }
    const roles = await withTenantTransaction(this.db, principal.tenantId, (tx) =>
      this.loadPrincipalRoles(principal, tx),
    );
    if (
      canDeleteIncidents({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        roles,
      })
    ) {
      return;
    }
    throw new ForgeError("FORBIDDEN", "Only an EHS Director or Creator can delete incidents.");
  }

  private assertCanDeleteForms(principal: ForgePrincipal) {
    if (
      canDeleteForms({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      return;
    }
    throw new ForgeError("FORBIDDEN", "Only a Tenant Admin or Creator can delete forms.");
  }

  private assertCanDeleteInspections(principal: ForgePrincipal) {
    if (
      canDeleteInspections({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      return;
    }
    throw new ForgeError("FORBIDDEN", "Only a Tenant Admin or Creator can delete inspections.");
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

  private async reconcileFormSubmissionRow(
    tx: DatabaseTransaction,
    tenantId: string,
    row: typeof industrialFormSubmissions.$inferSelect,
    definitionCache: Map<string, typeof industrialFormDefinitions.$inferSelect | undefined>,
  ): Promise<typeof industrialFormSubmissions.$inferSelect> {
    if (
      String(row.status ?? "")
        .trim()
        .toUpperCase() !== FORM_STATUS_PENDING_SIGNATURE ||
      !row.formDefinitionId
    ) {
      return row;
    }
    let definition = definitionCache.get(row.formDefinitionId);
    if (definition === undefined) {
      const [loaded] = await tx
        .select()
        .from(industrialFormDefinitions)
        .where(
          and(
            eq(industrialFormDefinitions.id, row.formDefinitionId),
            eq(industrialFormDefinitions.tenantId, tenantId),
          ),
        )
        .limit(1);
      definition = loaded;
      definitionCache.set(row.formDefinitionId, loaded);
    }
    if (!definition) return row;

    const fields = this.extractSignatoryFields(definition);
    if (!hasDeferredSignatoryFields(fields)) return row;

    const answers = resolveFormAnswers(row.answers, row.sourcePayload);
    const resolvedStatus = resolveFormSubmissionStatus(fields, answers, row.status);
    if (resolvedStatus === row.status) return row;

    const now = new Date();
    const [updated] = await tx
      .update(industrialFormSubmissions)
      .set({ status: resolvedStatus, updatedAt: now })
      .where(
        and(
          eq(industrialFormSubmissions.id, row.id),
          eq(industrialFormSubmissions.tenantId, tenantId),
        ),
      )
      .returning();
    return updated ?? { ...row, status: resolvedStatus, updatedAt: now };
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
      const definitionCache = new Map<
        string,
        typeof industrialFormDefinitions.$inferSelect | undefined
      >();
      const reconciled = await Promise.all(
        items.map((row) =>
          this.reconcileFormSubmissionRow(tx, principal.tenantId, row, definitionCache),
        ),
      );
      return { page, pageSize, items: reconciled.map((row) => this.mapFormSubmission(row)) };
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
      const definitionCache = new Map<
        string,
        typeof industrialFormDefinitions.$inferSelect | undefined
      >();
      const reconciled = await this.reconcileFormSubmissionRow(
        tx,
        principal.tenantId,
        row,
        definitionCache,
      );
      return this.mapFormSubmission(reconciled);
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
    let personnelId =
      typeof body.personnelId === "string" && UUID_PATTERN.test(body.personnelId.trim())
        ? body.personnelId.trim()
        : null;

    const prepared = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      if (!personnelId) {
        personnelId = await this.resolvePersonnelIdFromFormAnswers(tx, principal.tenantId, answers);
      }
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

      const fields = this.extractSignatoryFields(definition);
      const roleList = await this.loadPrincipalRoles(principal, tx);
      this.assertEhsDirectorSignatureWritesSync(
        principalCanSignEhsDirector(roleList),
        fields,
        {},
        answers,
      );

      const normalizedAnswers = flattenFormResponses(answers);
      if (personnelId && !normalizedAnswers.personnelId) {
        normalizedAnswers.personnelId = personnelId;
      }
      const missingDeferred = missingDeferredSignatureFields(fields, normalizedAnswers);
      const missingEhs = missingEhsDirectorSignatureFields(fields, normalizedAnswers);
      const requestedStatus = String(body.status ?? "").trim();
      const status = resolveFormSubmissionStatus(
        fields,
        normalizedAnswers,
        missingDeferred.length > 0 ? FORM_STATUS_PENDING_SIGNATURE : requestedStatus || "SUBMITTED",
      );

      const now = new Date();
      const [row] = await tx
        .insert(industrialFormSubmissions)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          siteId: definition.siteId,
          title: title || definition.title || "Form submission",
          status,
          formDefinitionId: definition.id,
          submittedAt: now,
          answers: normalizedAnswers,
          sourceSystem: "FORGE",
          sourcePayload: {
            formDefinitionId: definition.id,
            formTitle: definition.title,
            answers: normalizedAnswers,
            ...(personnelId ? { personnelId } : {}),
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        mapped: this.mapFormSubmission(row!),
        row: row!,
        definition,
        fields,
        missingDeferred,
        missingEhs,
      };
    });

    if (prepared.missingEhs.length > 0) {
      await this.notifySafetyDirectorsOfPendingSignature(principal, {
        submissionId: String(prepared.row.id),
        formDefinitionId: String(prepared.definition.id),
        title: String(prepared.mapped.title ?? prepared.definition.title ?? "Form"),
        missingLabels: prepared.missingEhs.map((field) => field.label),
      });
    }

    return prepared.mapped;
  }

  async importFormCatalog(
    principal: ForgePrincipal,
    body: Record<string, unknown>,
  ): Promise<FormCatalogImportSummary> {
    const parsed = parseFormCatalogImportPayload(body);
    const summary = emptyFormCatalogImportSummary(parsed.dryRun);
    summary.templatesInSource = parsed.templates.length;
    summary.submissionsInSource = parsed.submissions.length;

    if (parsed.templates.length === 0 && parsed.submissions.length === 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "No form templates found. Upload JSON with formTemplates, templates, or a single form with title and fields.",
      );
    }

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const templateIdMap = new Map<string, string>();

      for (const template of parsed.templates) {
        const [existing] = await tx
          .select({ id: industrialFormDefinitions.id })
          .from(industrialFormDefinitions)
          .where(
            and(
              eq(industrialFormDefinitions.tenantId, principal.tenantId),
              eq(industrialFormDefinitions.sourceCollection, template.sourceCollection),
              eq(industrialFormDefinitions.sourceDocumentId, template.sourceDocumentId),
            ),
          )
          .limit(1);

        const defId = existing?.id ?? createId();
        templateIdMap.set(template.linkId, defId);
        templateIdMap.set(template.sourceDocumentId, defId);

        if (!parsed.dryRun) {
          const now = new Date();
          if (existing) {
            await tx
              .update(industrialFormDefinitions)
              .set({
                title: template.title,
                status: "ACTIVE",
                formKey: template.formKey,
                schemaJson: template.schemaJson,
                sourcePath: template.sourcePath,
                sourcePayload: template.sourcePayload,
                archivedAt: null,
                updatedAt: now,
              })
              .where(eq(industrialFormDefinitions.id, defId));
          } else {
            await tx.insert(industrialFormDefinitions).values({
              id: defId,
              tenantId: principal.tenantId,
              title: template.title,
              status: "ACTIVE",
              formKey: template.formKey,
              version: "1",
              schemaJson: template.schemaJson,
              sourceSystem: "FORGE",
              sourceCollection: template.sourceCollection,
              sourceDocumentId: template.sourceDocumentId,
              sourcePath: template.sourcePath,
              sourcePayload: template.sourcePayload,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        summary.definitionsUpserted += 1;
      }

      const existingDefs = await tx
        .select({
          id: industrialFormDefinitions.id,
          sourceDocumentId: industrialFormDefinitions.sourceDocumentId,
        })
        .from(industrialFormDefinitions)
        .where(eq(industrialFormDefinitions.tenantId, principal.tenantId));
      for (const row of existingDefs) {
        if (row.sourceDocumentId && !templateIdMap.has(row.sourceDocumentId)) {
          templateIdMap.set(row.sourceDocumentId, row.id);
        }
      }

      if (!parsed.includeSubmissions) return summary;

      for (const submission of parsed.submissions) {
        const formDefinitionId = submission.templateLinkId
          ? (templateIdMap.get(submission.templateLinkId) ?? null)
          : null;
        if (!formDefinitionId) summary.submissionsUnlinked += 1;

        const answers = flattenFormResponses(
          submission.sourcePayload.responses ??
            submission.sourcePayload.answers ??
            submission.sourcePayload.values,
        );

        const [existingSub] = await tx
          .select({ id: industrialFormSubmissions.id })
          .from(industrialFormSubmissions)
          .where(
            and(
              eq(industrialFormSubmissions.tenantId, principal.tenantId),
              eq(industrialFormSubmissions.sourceCollection, submission.sourceCollection),
              eq(industrialFormSubmissions.sourceDocumentId, submission.sourceDocumentId),
            ),
          )
          .limit(1);

        if (!parsed.dryRun) {
          const now = new Date();
          const submittedAt = submission.submittedAt ? new Date(submission.submittedAt) : now;
          if (existingSub) {
            const submissionPatch: {
              title: string;
              status: string;
              submittedAt: Date;
              answers: Record<string, unknown>;
              sourcePath: string | null;
              sourcePayload: Record<string, unknown>;
              archivedAt: null;
              updatedAt: Date;
              formDefinitionId?: string;
            } = {
              title: submission.title,
              status: submission.status,
              submittedAt,
              answers,
              sourcePath: submission.sourcePath,
              sourcePayload: submission.sourcePayload,
              archivedAt: null,
              updatedAt: now,
            };
            if (formDefinitionId) submissionPatch.formDefinitionId = formDefinitionId;
            await tx
              .update(industrialFormSubmissions)
              .set(submissionPatch)
              .where(eq(industrialFormSubmissions.id, existingSub.id));
          } else {
            await tx.insert(industrialFormSubmissions).values({
              id: createId(),
              tenantId: principal.tenantId,
              title: submission.title,
              status: submission.status,
              formDefinitionId,
              submittedAt,
              answers,
              sourceSystem: "FORGE",
              sourceCollection: submission.sourceCollection,
              sourceDocumentId: submission.sourceDocumentId,
              sourcePath: submission.sourcePath,
              sourcePayload: submission.sourcePayload,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        summary.submissionsUpserted += 1;
      }

      return summary;
    });
  }

  async importFormChecklistFile(
    principal: ForgePrincipal,
    body: Record<string, unknown>,
  ): Promise<FormCatalogImportSummary> {
    const filename = String(body.filename ?? "").trim();
    const contentBase64 = String(body.contentBase64 ?? "").trim();
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!contentBase64) throw new ForgeError("VALIDATION_FAILED", "contentBase64 is required");

    const buffer = Buffer.from(contentBase64, "base64");
    if (!buffer.length) throw new ForgeError("VALIDATION_FAILED", "Uploaded file is empty");
    if (buffer.length > 15_000_000) {
      throw new ForgeError("VALIDATION_FAILED", "Uploaded file is too large (15 MB max)");
    }

    let pdfText: string | undefined;
    if (filename.toLowerCase().endsWith(".pdf")) {
      try {
        const { default: pdfParse } = await import("pdf-parse");
        const parsed = await pdfParse(buffer);
        pdfText = parsed.text;
      } catch {
        throw new ForgeError("VALIDATION_FAILED", "Could not read PDF file");
      }
    }

    let parsed;
    try {
      parsed = parseChecklistFile(buffer, filename, pdfText);
    } catch (error) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        error instanceof Error ? error.message : "Could not parse checklist file",
      );
    }

    const title = String(body.title ?? "").trim() || parsed.title;
    const category = String(body.category ?? "").trim() || parsed.category || null;
    const sourceDocumentId = `file-${createHash("sha256").update(buffer).digest("hex").slice(0, 32)}`;
    const template = checklistToFormTemplate({ ...parsed, title, category }, sourceDocumentId);

    return this.importFormCatalog(principal, {
      formTemplates: [template],
      dryRun: body.dryRun === true || body.preview === true,
    });
  }

  async updateFormSubmission(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    const prepared = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
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

      const previousResolved = resolveFormAnswers(existing.answers, existing.sourcePayload);
      const incoming =
        body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
          ? flattenFormResponses(body.answers)
          : {};
      let answers =
        Object.keys(incoming).length > 0 ? { ...previousResolved, ...incoming } : previousResolved;

      const [definition] = existing.formDefinitionId
        ? await tx
            .select()
            .from(industrialFormDefinitions)
            .where(
              and(
                eq(industrialFormDefinitions.id, existing.formDefinitionId),
                eq(industrialFormDefinitions.tenantId, principal.tenantId),
              ),
            )
            .limit(1)
        : [];

      const fields = this.extractSignatoryFields(definition ?? null);
      const roleList = await this.loadPrincipalRoles(principal, tx);
      const canSignEhs = principalCanSignEhsDirector(roleList);
      if (!canSignEhs) {
        for (const field of listEhsDirectorSignatureFields(fields)) {
          // Non-signers must not clear or overwrite reserved signatures.
          if (ehsDirectorSignatureValueChanged(field.id, previousResolved, answers)) {
            answers = { ...answers, [field.id]: previousResolved[field.id] };
          }
        }
      }
      this.assertEhsDirectorSignatureWritesSync(canSignEhs, fields, previousResolved, answers);

      const missingDeferred = missingDeferredSignatureFields(fields, answers);
      const missingEhs = missingEhsDirectorSignatureFields(fields, answers);
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : (existing.title ?? "Form submission");
      const requestedStatus =
        typeof body.status === "string" && body.status.trim()
          ? body.status.trim()
          : existing.status;
      const status = resolveFormSubmissionStatus(fields, answers, requestedStatus);

      const now = new Date();
      const prevPayload =
        existing.sourcePayload &&
        typeof existing.sourcePayload === "object" &&
        !Array.isArray(existing.sourcePayload)
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};
      let personnelId =
        typeof body.personnelId === "string" && UUID_PATTERN.test(body.personnelId.trim())
          ? body.personnelId.trim()
          : typeof prevPayload.personnelId === "string" &&
              UUID_PATTERN.test(prevPayload.personnelId)
            ? prevPayload.personnelId
            : null;
      if (!personnelId) {
        personnelId = await this.resolvePersonnelIdFromFormAnswers(tx, principal.tenantId, answers);
      }
      if (personnelId && !answers.personnelId) {
        answers = { ...answers, personnelId };
      }
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
            ...(personnelId ? { personnelId } : {}),
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
      return {
        mapped: this.mapFormSubmission(row),
        row,
        definition: definition ?? null,
        fields,
        missingDeferred,
        missingEhs,
        previouslyMissingEhs: missingEhsDirectorSignatureFields(fields, previousResolved),
        prevPayload,
      };
    });

    const shouldNotify =
      prepared.missingEhs.length > 0 && prepared.prevPayload.ehsSignatureNotifiedAt == null;
    if (shouldNotify) {
      await this.notifySafetyDirectorsOfPendingSignature(principal, {
        submissionId: String(prepared.row.id),
        formDefinitionId: String(prepared.definition?.id ?? prepared.row.formDefinitionId ?? ""),
        title: String(prepared.mapped.title ?? prepared.definition?.title ?? "Form"),
        missingLabels: prepared.missingEhs.map((field) => field.label),
      });
    }

    return prepared.mapped;
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

      const branding = await this.loadFormPrintBranding(tx, principal.tenantId);
      const mapped = this.mapFormSubmission(row) as Record<string, unknown>;
      const answers = unwrapJsonRecord(mapped.answers);
      const fields = enrichPrintFieldsForDefinition(
        this.extractPrintFields(definition),
        definition,
      );
      const siteNames = await this.loadSiteNameMap(tx, principal.tenantId);
      const resolvedAnswers = { ...answers };
      for (const field of fields) {
        if (field.kind !== "location") continue;
        const raw = resolvedAnswers[field.id];
        if (raw == null || raw === "") continue;
        const siteId = String(raw).trim();
        resolvedAnswers[field.id] = siteNames.get(siteId) ?? siteId;
      }
      const html = buildFormSubmissionPrintableHtml({
        title: String(mapped.title ?? definition?.title ?? "Form submission"),
        status: String(mapped.status ?? row.status ?? ""),
        submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
        fields,
        answers: resolvedAnswers,
        branding,
        onePage: isProducersMvrConsentForm(definition),
      });
      return { html, title: mapped.title ?? "Form submission" };
    });
  }

  async formDefinitionPrintable(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [definition] = await tx
        .select()
        .from(industrialFormDefinitions)
        .where(
          and(
            eq(industrialFormDefinitions.id, recordId),
            eq(industrialFormDefinitions.tenantId, principal.tenantId),
            isNull(industrialFormDefinitions.archivedAt),
          ),
        )
        .limit(1);
      if (!definition) throw new ForgeError("NOT_FOUND", "Form not found");

      const branding = await this.loadFormPrintBranding(tx, principal.tenantId);
      const fields = enrichPrintFieldsForDefinition(
        this.extractPrintFields(definition),
        definition,
      );
      const title = String(definition.title ?? "Form");
      const html = buildFormSubmissionPrintableHtml({
        title,
        fields,
        answers: {},
        branding,
        blank: true,
        onePage: isProducersMvrConsentForm(definition),
      });
      return { html, title };
    });
  }

  async updateFormDefinition(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFormDefinitions)
        .where(
          and(
            eq(industrialFormDefinitions.id, recordId),
            eq(industrialFormDefinitions.tenantId, principal.tenantId),
            isNull(industrialFormDefinitions.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Form not found");

      const title = String(body.title ?? body.name ?? existing.title ?? "").trim();
      if (!title) {
        throw new ForgeError("VALIDATION_FAILED", "Form name is required.");
      }
      const category = String(body.category ?? body.formKey ?? existing.formKey ?? "")
        .trim()
        .slice(0, 120);
      const rawFields = body.fields ?? unwrapJsonRecord(body.schemaJson).fields;
      const schemaJson =
        rawFields !== undefined
          ? {
              fields: Array.isArray(rawFields) ? rawFields : [],
            }
          : existing.schemaJson;
      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const nextPayload: Record<string, unknown> = {
        ...payload,
        ...body,
        name: title,
        title,
        fields: unwrapJsonRecord(schemaJson).fields ?? [],
      };
      if (category) {
        nextPayload.category = category;
        nextPayload.formKey = category;
      }

      const now = new Date();
      const [row] = await tx
        .update(industrialFormDefinitions)
        .set({
          title,
          formKey: category || existing.formKey,
          schemaJson,
          sourcePayload: nextPayload,
          updatedAt: now,
        } as never)
        .where(
          and(
            eq(industrialFormDefinitions.id, recordId),
            eq(industrialFormDefinitions.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Form not found");
      return this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
        extra: {
          schemaJson: row.schemaJson,
          formKey: row.formKey,
          version: row.version,
          sourceDocumentId: row.sourceDocumentId,
        },
      });
    });
  }

  private async loadFormPrintBranding(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<FormPrintBranding> {
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key,
        display_name::text as display_name,
        legal_name::text as legal_name
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;

    const brandingRows = await tx.execute(sql`
      select cv.payload_json as payload
      from config_objects co
      join config_versions cv on cv.id = co.current_published_version_id
      where co.tenant_id = ${tenantId}::uuid
        and co.namespace = 'branding'
        and co.object_key = 'default'
      limit 1
    `);
    const brandingPayloadRaw = (
      Array.isArray(brandingRows)
        ? brandingRows[0]
        : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]
    ) as { payload?: unknown } | undefined;
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
        ? "https://producersrice.forgeindustrialsafety.com/branding/producers-rice-mill.png"
        : null);
    const reportIdentity =
      String(brandingPayload.reportIdentity ?? companyName ?? "").trim() || null;
    const documentFooter =
      String(brandingPayload.documentFooter ?? companyName ?? "").trim() || null;
    return {
      logoUrl,
      reportIdentity,
      documentFooter,
      companyName,
    };
  }

  private extractSignatoryFields(
    definition: {
      schemaJson?: unknown;
      sourcePayload?: unknown;
      title?: string | null;
      name?: string | null;
      formKey?: string | null;
      sourceDocumentId?: string | null;
    } | null,
  ): SignatoryFieldRef[] {
    return this.extractRawSignatoryFields(definition);
  }

  private extractRawSignatoryFields(
    definition: {
      schemaJson?: unknown;
      sourcePayload?: unknown;
      schema?: unknown;
      title?: string | null;
      name?: string | null;
      formKey?: string | null;
      sourceDocumentId?: string | null;
    } | null,
  ): SignatoryFieldRef[] {
    if (!definition) return [];
    return extractFormDefinitionFields(definition as Record<string, unknown>);
  }

  private assertEhsDirectorSignatureWritesSync(
    canSign: boolean,
    fields: SignatoryFieldRef[],
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ) {
    for (const field of listEhsDirectorSignatureFields(fields)) {
      if (!ehsDirectorSignatureValueChanged(field.id, previous, next)) continue;
      if (!canSign) {
        throw new ForgeError(
          "FORBIDDEN",
          `${field.label || "EHS Director signature"} can only be signed by the Safety Director.`,
        );
      }
    }
  }

  private async loadPrincipalRoles(principal: ForgePrincipal, tx: DatabaseTransaction) {
    const membership = await tx.query.userTenantMemberships.findFirst({
      where: and(
        eq(userTenantMemberships.tenantId, principal.tenantId),
        eq(userTenantMemberships.userId, principal.userId),
      ),
    });
    if (!membership) return [];
    return tx
      .select({
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(membershipRoleAssignments)
      .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
      .where(
        and(
          eq(membershipRoleAssignments.tenantId, principal.tenantId),
          eq(membershipRoleAssignments.membershipId, membership.id),
          inArray(membershipRoleAssignments.status, ["ACTIVE", "PENDING"]),
        ),
      );
  }

  private listSafetyDirectorRecipients(tenantId: string) {
    return lookupSafetyDirectorRecipients(this.db, tenantId);
  }

  private async notifySafetyDirectorsOfPendingSignature(
    principal: ForgePrincipal,
    input: {
      submissionId: string;
      formDefinitionId: string;
      title: string;
      missingLabels: string[];
    },
  ) {
    const recipients = await this.listSafetyDirectorRecipients(principal.tenantId);
    if (recipients.length === 0 || !this.notifications) return;

    const hrefParts = new URLSearchParams({ tab: "fill", submission: input.submissionId });
    if (input.formDefinitionId) hrefParts.set("form", input.formDefinitionId);
    const href = `/modules/forms/?${hrefParts.toString()}`;
    const labels = input.missingLabels.filter(Boolean).join(", ") || "EHS Director signature";
    const title = "Form needs your signature";
    const body = `"${input.title}" is waiting for ${labels}. Open Forms to review and sign.`;

    for (const recipient of recipients) {
      try {
        await this.notifications.create(
          principal.tenantId,
          {
            userId: recipient.userId,
            type: "industrial.form.signature_required",
            title,
            body,
            priority: "HIGH",
            destination: recipient.email ? "BOTH" : "IN_APP",
            ...(recipient.email
              ? { emailTo: recipient.email, emailTemplateKey: "system_notification" as const }
              : {}),
            href,
            metadataJson: {
              submissionId: input.submissionId,
              formDefinitionId: input.formDefinitionId,
            },
          },
          principal,
        );
      } catch {
        // Best-effort: signing still works even if a notify fails.
      }
    }

    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialFormSubmissions)
        .where(
          and(
            eq(industrialFormSubmissions.id, input.submissionId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) return;
      const prevPayload =
        existing.sourcePayload &&
        typeof existing.sourcePayload === "object" &&
        !Array.isArray(existing.sourcePayload)
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};
      await tx
        .update(industrialFormSubmissions)
        .set({
          sourcePayload: {
            ...prevPayload,
            ehsSignatureNotifiedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialFormSubmissions.id, input.submissionId),
            eq(industrialFormSubmissions.tenantId, principal.tenantId),
          ),
        );
    });
  }

  async listMyNotifications(principal: ForgePrincipal, limit = 20) {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      return tx
        .select({
          id: userNotifications.id,
          type: userNotifications.type,
          title: userNotifications.title,
          body: userNotifications.body,
          href: userNotifications.href,
          priority: userNotifications.priority,
          createdAt: userNotifications.createdAt,
          readAt: userNotifications.readAt,
        })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.tenantId, principal.tenantId),
            eq(userNotifications.userId, principal.userId),
          ),
        )
        .orderBy(desc(userNotifications.createdAt))
        .limit(pageSize);
    });
  }

  async myNotificationUnreadCount(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.tenantId, principal.tenantId),
            eq(userNotifications.userId, principal.userId),
            isNull(userNotifications.readAt),
          ),
        );
      return { count: Number(row?.count ?? 0) };
    });
  }

  async markMyNotificationRead(principal: ForgePrincipal, notificationId: string) {
    const id = this.assertRecordId(notificationId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(userNotifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(userNotifications.id, id),
            eq(userNotifications.tenantId, principal.tenantId),
            eq(userNotifications.userId, principal.userId),
          ),
        )
        .returning({
          id: userNotifications.id,
          readAt: userNotifications.readAt,
        });
      if (!row) throw new ForgeError("NOT_FOUND", "Notification not found");
      return row;
    });
  }

  async markAllMyNotificationsRead(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(userNotifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(userNotifications.tenantId, principal.tenantId),
            eq(userNotifications.userId, principal.userId),
            isNull(userNotifications.readAt),
          ),
        )
        .returning({ id: userNotifications.id });
      return { updated: updated.length };
    });
  }

  private industrialAppBaseUrl(override?: string | null): string {
    const raw =
      (typeof override === "string" && override.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgeindustrialsafety.com";
    return raw.replace(/\/+$/, "");
  }

  private formSubmissionSignPath(input: {
    submissionId: string;
    formDefinitionId?: string | null;
  }): string {
    const params = new URLSearchParams({
      tab: "fill",
      submission: input.submissionId,
    });
    if (input.formDefinitionId) params.set("form", input.formDefinitionId);
    return `/modules/forms/?${params.toString()}`;
  }

  async listFormSignatoryRecipients(principal: ForgePrincipal, kindRaw: string | undefined) {
    const kind = (kindRaw ?? "supervisor").trim().toLowerCase();
    if (kind !== "supervisor" && kind !== "ehs_director") {
      throw new ForgeError("VALIDATION_FAILED", "Choose supervisor or ehs_director recipients.");
    }
    const match =
      kind === "supervisor"
        ? (role: { roleCode: string; roleName: string }) =>
            isSupervisorRole({ roleCode: role.roleCode, roleName: role.roleName })
        : (role: { roleCode: string; roleName: string }) =>
            isSafetyDirectorRole({ roleCode: role.roleCode, roleName: role.roleName });

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          email: users.primaryEmail,
          roleCode: roles.code,
          roleName: roles.name,
        })
        .from(membershipRoleAssignments)
        .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
        .innerJoin(
          userTenantMemberships,
          eq(userTenantMemberships.id, membershipRoleAssignments.membershipId),
        )
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .where(
          and(
            eq(membershipRoleAssignments.tenantId, principal.tenantId),
            eq(userTenantMemberships.tenantId, principal.tenantId),
            eq(userTenantMemberships.status, "ACTIVE"),
            inArray(membershipRoleAssignments.status, ["ACTIVE", "PENDING"]),
            isNull(membershipRoleAssignments.revokedAt),
          ),
        );

      const byUser = new Map<
        string,
        { userId: string; email: string; roleName: string; label: string }
      >();
      for (const row of rows) {
        if (!match({ roleCode: row.roleCode, roleName: row.roleName })) continue;
        if (!row.userId || byUser.has(row.userId)) continue;
        const email = String(row.email ?? "").trim();
        byUser.set(row.userId, {
          userId: row.userId,
          email,
          roleName: row.roleName,
          label: email || row.roleName || row.userId,
        });
      }
      return {
        kind: kind as FormSignatoryKind,
        items: [...byUser.values()].sort((a, b) => a.label.localeCompare(b.label)),
      };
    });
  }

  /**
   * Email / notify a supervisor (or Safety Director) with a deep link to open
   * and sign a saved form submission remotely.
   */
  async requestFormSignature(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    const kindRaw = String(body.signatoryKind ?? body.kind ?? "supervisor")
      .trim()
      .toLowerCase();
    const kind: FormSignatoryKind =
      kindRaw === "ehs_director" || kindRaw === "ehs" ? "ehs_director" : "supervisor";
    const fieldId = String(body.fieldId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    const emailInput = String(body.email ?? body.emailTo ?? "")
      .trim()
      .toLowerCase();
    const appBase = this.industrialAppBaseUrl(
      typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
    );

    const prepared = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
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

      const [definition] = existing.formDefinitionId
        ? await tx
            .select()
            .from(industrialFormDefinitions)
            .where(
              and(
                eq(industrialFormDefinitions.id, existing.formDefinitionId),
                eq(industrialFormDefinitions.tenantId, principal.tenantId),
              ),
            )
            .limit(1)
        : [];

      const fields = this.extractSignatoryFields(definition ?? null);
      const answers =
        existing.answers && typeof existing.answers === "object" && !Array.isArray(existing.answers)
          ? (existing.answers as Record<string, unknown>)
          : {};

      const candidates = fields.filter((field) => formSignatoryKindForField(field) === kind);
      if (candidates.length === 0) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          kind === "supervisor"
            ? "This form has no supervisor signature field."
            : "This form has no EHS Director signature field.",
        );
      }

      const target =
        (fieldId ? candidates.find((field) => field.id === fieldId) : null) ??
        candidates.find((field) => !isSignatureAnswerPresent(answers[field.id])) ??
        candidates[0]!;

      if (isSignatureAnswerPresent(answers[target.id])) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `${target.label || "Signature"} is already signed on this form.`,
        );
      }

      let recipientUserId = userId;
      let recipientEmail = emailInput;
      if (recipientUserId) {
        const [userRow] = await tx
          .select({ id: users.id, email: users.primaryEmail })
          .from(users)
          .where(and(eq(users.id, recipientUserId), eq(users.tenantId, principal.tenantId)))
          .limit(1);
        if (!userRow) throw new ForgeError("NOT_FOUND", "Recipient user was not found.");
        recipientEmail =
          recipientEmail ||
          String(userRow.email ?? "")
            .trim()
            .toLowerCase();
      } else if (recipientEmail) {
        const [userRow] = await tx
          .select({ id: users.id, email: users.primaryEmail })
          .from(users)
          .where(
            and(
              eq(users.tenantId, principal.tenantId),
              sql`lower(${users.primaryEmail}) = ${recipientEmail}`,
            ),
          )
          .limit(1);
        if (userRow) recipientUserId = userRow.id;
      }

      if (!recipientUserId && !recipientEmail) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Choose a supervisor (or enter an email) to send the sign link.",
        );
      }

      const href = this.formSubmissionSignPath({
        submissionId: String(existing.id),
        formDefinitionId: existing.formDefinitionId,
      });
      return {
        href,
        absoluteUrl: `${appBase}${href}`,
        title: String(existing.title ?? definition?.title ?? "Form"),
        fieldLabel:
          target.label ||
          (kind === "supervisor" ? "Supervisor signature" : "EHS Director signature"),
        fieldId: target.id,
        recipientUserId: recipientUserId || null,
        recipientEmail: recipientEmail || null,
        formDefinitionId: existing.formDefinitionId,
      };
    });

    const notifyTitle =
      kind === "supervisor" ? "Please sign this form" : "Form needs your signature";
    const notifyBody = `"${prepared.title}" needs your ${prepared.fieldLabel}. Open this link to review and sign: ${prepared.absoluteUrl}`;

    let notified = false;
    let emailed = false;
    if (prepared.recipientUserId && this.notifications) {
      try {
        await this.notifications.create(
          principal.tenantId,
          {
            userId: prepared.recipientUserId,
            type: "industrial.form.signature_request",
            title: notifyTitle,
            body: notifyBody,
            priority: "HIGH",
            destination: prepared.recipientEmail ? "BOTH" : "IN_APP",
            ...(prepared.recipientEmail
              ? {
                  emailTo: prepared.recipientEmail,
                  emailTemplateKey: "system_notification" as const,
                }
              : {}),
            href: prepared.href,
            metadataJson: {
              submissionId: recordId,
              fieldId: prepared.fieldId,
              signatoryKind: kind,
            },
          },
          principal,
        );
        notified = true;
        emailed = Boolean(prepared.recipientEmail);
      } catch {
        // fall through to email-only when possible
      }
    }

    if (!notified && prepared.recipientEmail && this.notifications) {
      try {
        await this.notifications.sendTemplatedEmail({
          to: prepared.recipientEmail,
          templateKey: "system_notification",
          tenantId: principal.tenantId,
          vars: {
            title: notifyTitle,
            detail: notifyBody,
          },
        });
        emailed = true;
      } catch {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Could not send the sign-link email. You can still copy the link.",
        );
      }
    }

    if (!notified && !emailed) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Could not notify that recipient. Copy the link and send it manually.",
      );
    }

    return {
      href: prepared.href,
      absoluteUrl: prepared.absoluteUrl,
      fieldId: prepared.fieldId,
      fieldLabel: prepared.fieldLabel,
      signatoryKind: kind,
      notified,
      emailed,
      recipientEmail: prepared.recipientEmail,
    };
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
          const type = String(rec.type ?? "")
            .trim()
            .toLowerCase();
          const content = String(
            rec.content ?? rec.body ?? rec.html ?? rec.placeholder ?? rec.text ?? "",
          ).trim();
          if (type === "label" || type === "heading" || type === "group" || type === "section") {
            fields.push({
              id,
              label: label || id,
              kind: "label",
            });
          } else if (type === "checkbox" || type === "boolean") {
            fields.push({
              id,
              label: label || id,
              kind: "checkbox",
            });
          } else if (type === "location" || type === "site" || type === "facility") {
            fields.push({
              id,
              label: label || id,
              kind: "location",
            });
          } else if (type === "content" || type === "html" || type === "static" || content) {
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

  private async loadSiteNameMap(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
  ): Promise<Map<string, string>> {
    const rows = await tx
      .select({ id: industrialSites.id, name: industrialSites.name })
      .from(industrialSites)
      .where(and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt)));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async transitionModule(
    principal: ForgePrincipal,
    moduleKey: string,
    id: string,
    action: string,
    body: Record<string, unknown> = {},
  ) {
    if (moduleKey === "loto") {
      return this.transitionLotoProcedure(principal, id, action, body);
    }
    const statusMap: Record<string, string> = {
      submit: "SUBMITTED",
      approve: "APPROVED",
      close: "CLOSED",
      complete: "COMPLETED",
      reopen: "OPEN",
      archive: "ARCHIVED",
      acknowledge: "ACKNOWLEDGED",
      start: "IN_PROGRESS",
      ...(moduleKey === "tasks"
        ? {
            acknowledge: "acknowledged",
            start: "in_progress",
            complete: "completed",
            cancel: "cancelled",
            assign: "assigned",
          }
        : {}),
      ...(moduleKey === "jsas"
        ? {
            acknowledge: "ACKNOWLEDGED",
            brief: "BRIEFED",
            activate: "ACTIVE",
          }
        : {}),
      ...(moduleKey === "hot-work" ||
      moduleKey === "confined-space" ||
      moduleKey === "working-at-heights" ||
      moduleKey === "electrical-safety"
        ? {
            start: "ACTIVE",
            acknowledge: "ACKNOWLEDGED",
            close: "CLOSED",
            complete: "CLOSED",
            approve: "APPROVED",
          }
        : {}),
    };
    const next = statusMap[action] ?? String(body.status ?? "").trim();
    if (!next) {
      throw new ForgeError("VALIDATION_FAILED", "That action is not supported for this record.");
    }
    if (action === "archive") {
      if (moduleKey === "incidents") {
        throw new ForgeError(
          "FORBIDDEN",
          "Incident delete requires EHS Director or Creator access. Use POST /api/v1/industrial/incidents/:id/archive.",
        );
      }
      if (moduleKey === "forms") {
        throw new ForgeError(
          "FORBIDDEN",
          "Form delete requires Tenant Admin or Creator access. Use POST /api/v1/industrial/forms/:id/archive.",
        );
      }
      return this.archiveModule(principal, moduleKey, id);
    }
    const table = this.tableFor(moduleKey);
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(table)
        .where(and(eq(table.id, recordId), eq(table.tenantId, principal.tenantId)))
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Record not found");

      const prevPayload = this.unwrapSourcePayload(
        "sourcePayload" in existing ? existing.sourcePayload : null,
      );
      const nextPayload: Record<string, unknown> = { ...prevPayload, ...body };
      if (action === "acknowledge" || moduleKey === "jsas") {
        const priorAcks = Array.isArray(prevPayload.acknowledgments)
          ? [...(prevPayload.acknowledgments as unknown[])]
          : [];
        if (body.acknowledgment && typeof body.acknowledgment === "object") {
          priorAcks.push({
            ...(body.acknowledgment as Record<string, unknown>),
            acknowledgedAt: now.toISOString(),
          });
          nextPayload.acknowledgments = priorAcks;
        }
      }
      if (body.atmosphericReading && typeof body.atmosphericReading === "object") {
        const readings = Array.isArray(prevPayload.atmosphericReadings)
          ? [...(prevPayload.atmosphericReadings as unknown[])]
          : [];
        readings.push({
          ...(body.atmosphericReading as Record<string, unknown>),
          recordedAt: now.toISOString(),
        });
        nextPayload.atmosphericReadings = readings;
      }

      const patch: Record<string, unknown> = {
        status: next,
        updatedAt: now,
        sourcePayload: nextPayload,
      };
      if (moduleKey === "tasks" && (action === "complete" || next.toUpperCase() === "COMPLETED")) {
        patch.completedAt = now;
      }
      const [row] = await tx
        .update(table)
        .set(patch as never)
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

  /**
   * LOTO procedure workflow:
   * DRAFT / NEEDS_CORRECTION → activate (optional skip) → ACTIVE
   * DRAFT / NEEDS_CORRECTION → submit → IN_REVIEW (optional higher validation)
   * IN_REVIEW → approve (= activate) → ACTIVE
   * IN_REVIEW → request-changes → NEEDS_CORRECTION (with notes)
   */
  async transitionLotoProcedure(
    principal: ForgePrincipal,
    id: string,
    action: string,
    body: Record<string, unknown> = {},
  ) {
    const actionKey = String(action ?? "")
      .trim()
      .toLowerCase();
    if (actionKey === "archive") {
      return this.archiveModule(principal, "loto", id);
    }

    const submitActions = new Set(["submit", "submit-review", "submit-approval"]);
    const approveActions = new Set(["approve", "activate"]);
    const returnActions = new Set(["request-changes", "return", "send-back", "reject"]);

    let nextStatus = "";
    if (submitActions.has(actionKey)) nextStatus = "IN_REVIEW";
    else if (approveActions.has(actionKey)) nextStatus = "ACTIVE";
    else if (returnActions.has(actionKey)) nextStatus = "NEEDS_CORRECTION";
    else if (actionKey === "reopen") nextStatus = "DRAFT";
    else if (actionKey === "close") nextStatus = "CLOSED";
    else {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "That action is not supported for LOTO procedures.",
      );
    }

    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(industrialLotoProcedures)
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");

      const current = String(existing.status ?? "")
        .trim()
        .toUpperCase();
      const inReview = current === "IN_REVIEW" || current === "PENDING_APPROVAL";
      const canSubmit = current === "DRAFT" || current === "NEEDS_CORRECTION";
      const canActivateDirect = canSubmit;

      if (submitActions.has(actionKey) && !canSubmit) {
        throw new ForgeError(
          "CONFLICT",
          "Only draft or needs-correction procedures can be submitted for EHS review.",
        );
      }
      if (approveActions.has(actionKey) && !inReview && !canActivateDirect) {
        throw new ForgeError(
          "CONFLICT",
          "Only draft, needs-correction, or in-review procedures can be activated.",
        );
      }
      if (returnActions.has(actionKey) && !inReview) {
        throw new ForgeError(
          "CONFLICT",
          "Only procedures in EHS review can be sent back for correction.",
        );
      }

      const returnNotes = String(
        body.reviewReturnNotes ?? body.notes ?? body.correctionNotes ?? "",
      ).trim();
      if (returnActions.has(actionKey) && !returnNotes) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Notes are required when sending a procedure back for correction.",
        );
      }

      const prevPayload = this.unwrapSourcePayload(existing.sourcePayload);
      const actorName = String(principal.userId ?? "").trim() || "EHS Director";
      const nextPayload: Record<string, unknown> = { ...prevPayload };

      // Do not merge arbitrary body keys into payload for workflow actions.
      if (submitActions.has(actionKey)) {
        nextPayload.submittedForReviewAt = now.toISOString();
        nextPayload.submittedForReviewByUserId = principal.userId ?? null;
        nextPayload.reviewReturnNotes = null;
        nextPayload.reviewReturnedAt = null;
        nextPayload.reviewReturnedByUserId = null;
        nextPayload.reviewReturnedByName = null;
      } else if (approveActions.has(actionKey)) {
        nextPayload.approvedAt = now.toISOString();
        nextPayload.approvedByUserId = principal.userId ?? null;
        nextPayload.approvedByName = actorName;
        nextPayload.activatedAt = now.toISOString();
        nextPayload.reviewReturnNotes = null;
        nextPayload.reviewReturnedAt = null;
        nextPayload.reviewReturnedByUserId = null;
        nextPayload.reviewReturnedByName = null;
      } else if (returnActions.has(actionKey)) {
        const history = Array.isArray(prevPayload.reviewReturnHistory)
          ? [...(prevPayload.reviewReturnHistory as unknown[])]
          : [];
        history.push({
          notes: returnNotes,
          returnedAt: now.toISOString(),
          returnedByUserId: principal.userId ?? null,
          returnedByName: actorName,
        });
        nextPayload.reviewReturnHistory = history;
        nextPayload.reviewReturnNotes = returnNotes;
        nextPayload.reviewReturnedAt = now.toISOString();
        nextPayload.reviewReturnedByUserId = principal.userId ?? null;
        nextPayload.reviewReturnedByName = actorName;
      }

      const [row] = await tx
        .update(industrialLotoProcedures)
        .set({
          status: nextStatus,
          updatedAt: now,
          sourcePayload: nextPayload,
        })
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");
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

  async getObservationsSettings(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, OBSERVATIONS_SETTINGS_NAMESPACE),
            eq(tenantSettings.settingKey, OBSERVATIONS_SETTINGS_KEY),
          ),
        });
        return parseObservationsSettings(existing?.valueJson);
      },
      principal.userId,
    );
  }

  async patchObservationsSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    if (!Array.isArray(body.categories)) {
      throw new ForgeError("VALIDATION_FAILED", "categories must be a list of names");
    }
    const next = { categories: normalizeObservationCategories(body.categories) };
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, OBSERVATIONS_SETTINGS_NAMESPACE),
            eq(tenantSettings.settingKey, OBSERVATIONS_SETTINGS_KEY),
          ),
        });
        const now = new Date();
        if (existing) {
          await tx
            .update(tenantSettings)
            .set({
              valueJson: next,
              recordVersion: sql`${tenantSettings.recordVersion} + 1`,
              updatedAt: now,
              updatedByUserId: principal.userId,
            })
            .where(eq(tenantSettings.id, existing.id));
        } else {
          await tx.insert(tenantSettings).values({
            id: createId(),
            tenantId: principal.tenantId,
            namespace: OBSERVATIONS_SETTINGS_NAMESPACE,
            settingKey: OBSERVATIONS_SETTINGS_KEY,
            valueJson: next,
            schemaVersion: 1,
            isSensitive: false,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: principal.userId,
          });
        }
        return next;
      },
      principal.userId,
    );
  }

  async createObservation(principal: ForgePrincipal, body: Record<string, unknown>) {
    const payload: Record<string, unknown> = {
      ...body,
      ...observationFieldsFromBody(body),
      createdByUserId: principal.userId ?? null,
    };
    const status = normalizeObservationStatus(body.status);
    payload.status = status;
    payload.title = buildObservationTitle(payload);
    if (!payload.reportedBy && principal.userId) {
      payload.reportedBy = await this.principalDisplayName(principal);
    }
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.resolveObservationAssignee(tx, principal.tenantId, payload, true);
      },
      principal.userId,
    );
    if (payload.assignedToPersonnelId || payload.assignedToName) {
      payload.assignedAt = new Date().toISOString();
      payload.assignedByUserId = principal.userId ?? null;
    }
    return this.createModule(principal, "observations", payload);
  }

  /**
   * Fills the assignee's name/email from their employee record. When
   * `defaultFromDepartment` is set and nobody is assigned, the department's
   * contact (its supervisor) becomes the assignee.
   */
  private async resolveObservationAssignee(
    tx: DatabaseTransaction,
    tenantId: string,
    payload: Record<string, unknown>,
    defaultFromDepartment: boolean,
  ) {
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    let personnelId = text(payload.assignedToPersonnelId);
    if (!personnelId && !text(payload.assignedToName) && defaultFromDepartment) {
      const departmentId = text(payload.departmentId);
      if (UUID_PATTERN.test(departmentId)) {
        const [dept] = await tx
          .select({
            contactPersonnelId: industrialDepartments.contactPersonnelId,
            contactName: industrialDepartments.contactName,
            contactEmail: industrialDepartments.contactEmail,
          })
          .from(industrialDepartments)
          .where(
            and(
              eq(industrialDepartments.id, departmentId),
              eq(industrialDepartments.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (dept && (dept.contactPersonnelId || dept.contactName)) {
          personnelId = dept.contactPersonnelId ?? "";
          payload.assignedToPersonnelId = dept.contactPersonnelId ?? null;
          payload.assignedToName = dept.contactName ?? "";
          payload.assignedToEmail = normalizeObservationEmail(dept.contactEmail) ?? "";
        }
      }
    }
    if (!UUID_PATTERN.test(personnelId)) return;
    if (text(payload.assignedToName) && text(payload.assignedToEmail)) return;
    const [person] = await tx
      .select({
        displayName: industrialPersonnel.displayName,
        email: industrialPersonnel.email,
        companyEmail: industrialPersonnel.companyEmail,
      })
      .from(industrialPersonnel)
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      )
      .limit(1);
    if (!person) return;
    if (!text(payload.assignedToName)) payload.assignedToName = person.displayName;
    if (!text(payload.assignedToEmail)) {
      payload.assignedToEmail =
        normalizeObservationEmail(person.companyEmail) ??
        normalizeObservationEmail(person.email) ??
        "";
    }
  }

  async emailObservation(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    if (!this.notifications) {
      throw new ForgeError("INTERNAL_ERROR", "Email notifications are not configured");
    }
    const recordId = this.assertRecordId(id);
    const loaded = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(industrialObservations)
          .where(
            and(
              eq(industrialObservations.id, recordId),
              eq(industrialObservations.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Observation not found");
        return {
          row,
          payload: this.unwrapSourcePayload(row.sourcePayload),
          tenantName: await this.tenantDisplayName(tx, principal.tenantId),
        };
      },
      principal.userId,
    );

    const recipients =
      body.to !== undefined
        ? normalizeObservationRecipients(body.to)
        : normalizeObservationRecipients(loaded.payload.assignedToEmail);
    if (recipients.length === 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "There is no email address for the assigned supervisor. Add one and try again.",
      );
    }

    const requestedBase = typeof body.appBaseUrl === "string" ? body.appBaseUrl.trim() : "";
    const baseUrl = this.industrialAppBaseUrl(
      /^https:\/\/[a-z0-9-]+\.forgeindustrialsafety\.com\/?$/i.test(requestedBase)
        ? requestedBase
        : null,
    );
    let timeZone: string | undefined;
    if (typeof body.timeZone === "string" && body.timeZone.trim()) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: body.timeZone.trim() });
        timeZone = body.timeZone.trim();
      } catch {
        timeZone = undefined;
      }
    }
    const senderName = (await this.principalDisplayName(principal)) || "A Forge user";
    const statusNow = normalizeObservationStatus(loaded.row.status);
    const followUpToken =
      statusNow === "CLOSED" || statusNow === "ARCHIVED"
        ? null
        : createObservationFollowUpToken(principal.tenantId);
    const email = buildObservationEmail({
      tenantName: loaded.tenantName,
      status: loaded.row.status,
      payload: loaded.payload,
      link: `${baseUrl}/modules/observations/?id=${loaded.row.id}`,
      ...(followUpToken
        ? {
            followUpLink: `${baseUrl}/observation-followup/?token=${encodeURIComponent(followUpToken.token)}`,
          }
        : {}),
      senderName,
      message: typeof body.message === "string" ? body.message.slice(0, 2000) : "",
      ...(timeZone ? { timeZone } : {}),
    });

    const results: Array<{ to: string; accepted: boolean; detail?: string }> = [];
    for (const to of recipients) {
      try {
        const result = await this.notifications.sendTemplatedEmail({
          to,
          templateKey: "observation_assigned",
          tenantId: principal.tenantId,
          vars: { subject: email.subject, htmlBody: email.htmlBody, textBody: email.textBody },
        });
        results.push({
          to,
          accepted: result.accepted,
          ...(result.detail ? { detail: result.detail } : {}),
        });
      } catch (err) {
        results.push({
          to,
          accepted: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const accepted = results.filter((r) => r.accepted).map((r) => r.to);
    const now = new Date();

    const record = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [current] = await tx
          .select()
          .from(industrialObservations)
          .where(
            and(
              eq(industrialObservations.id, recordId),
              eq(industrialObservations.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!current) throw new ForgeError("NOT_FOUND", "Observation not found");
        const payload = this.unwrapSourcePayload(current.sourcePayload);
        const next: Record<string, unknown> = {
          ...payload,
          emailLog: appendObservationEmailLog(payload, {
            to: recipients,
            sentAt: now.toISOString(),
            sentByUserId: principal.userId ?? null,
            sentByName: senderName,
            accepted: accepted.length > 0,
          }),
        };
        if (accepted.length > 0) {
          next.lastEmailedAt = now.toISOString();
          next.lastEmailedTo = accepted;
          if (followUpToken) {
            next.followUpTokens = addObservationFollowUpToken(payload, followUpToken.hash, now);
          }
        }
        const [row] = await tx
          .update(industrialObservations)
          .set({ sourcePayload: next, updatedAt: now })
          .where(eq(industrialObservations.id, current.id))
          .returning();
        return this.mapListItem({
          id: row!.id,
          title: row!.title,
          status: row!.status,
          createdAt: row!.createdAt,
          updatedAt: row!.updatedAt,
          sourcePayload: row!.sourcePayload,
          extra: { siteId: row!.siteId ?? null },
        });
      },
      principal.userId,
    );

    if (accepted.length === 0) {
      const detail =
        results.map((r) => r.detail).find((d) => typeof d === "string" && d.trim()) ??
        "Email provider did not accept the message";
      throw new ForgeError("INTERNAL_ERROR", `Failed to send the observation email: ${detail}`);
    }
    return { sentTo: accepted, failed: results.filter((r) => !r.accepted), record };
  }

  private async tenantDisplayName(tx: DatabaseTransaction, tenantId: string): Promise<string> {
    const tenantRows = await tx.execute(sql`
      select coalesce(nullif(btrim(display_name), ''), nullif(btrim(legal_name), ''), slug)::text as name
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as { name?: string } | undefined;
    return String(tenantRow?.name ?? "").trim() || "your organization";
  }

  private async findObservationByFollowUpToken(
    tx: DatabaseTransaction,
    tenantId: string,
    hash: string,
  ) {
    const obs = industrialObservations;
    const [row] = await tx
      .select()
      .from(obs)
      .where(
        and(
          eq(obs.tenantId, tenantId),
          isNull(obs.archivedAt),
          sql`${obs.sourcePayload} -> 'followUpTokens' @> ${JSON.stringify([{ hash }])}::jsonb`,
        ),
      )
      .limit(1);
    if (!row) return null;
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    if (!observationFollowUpTokenValid(payload, hash)) return null;
    return { row, payload };
  }

  /** What the supervisor sees on the no-login form: the observation plus its follow-up, no internals. */
  private observationFollowUpView(
    row: typeof industrialObservations.$inferSelect,
    payload: Record<string, unknown>,
    tenantName: string,
  ) {
    const pick = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
    return {
      id: row.id,
      tenantName,
      title: row.title,
      status: normalizeObservationStatus(row.status),
      observationType: pick("observationType"),
      category: pick("category"),
      description: pick("description"),
      riskLevel: pick("riskLevel"),
      observedAt: pick("observedAt") || row.createdAt.toISOString(),
      siteName: pick("siteName") || pick("location"),
      departmentName: pick("departmentName"),
      area: pick("area"),
      peopleObserved: normalizeObservedPeople(payload.peopleObserved).map((p) => ({
        key: observedPersonKey(p),
        name: p.name,
        atFault: observedPersonAtFault(p, payload.observationType),
      })),
      canMarkFault: !isPositiveObservationType(payload.observationType),
      immediateActions: pick("immediateActions"),
      reportedBy: pick("reportedBy"),
      assignedToName: pick("assignedToName"),
      photos: Array.isArray(payload.photos) ? payload.photos : [],
      followUp: normalizeObservationFollowUp(payload.followUp),
      closedAt: pick("closedAt"),
    };
  }

  async getObservationFollowUpByToken(token: string) {
    const parsed = parseObservationFollowUpToken(token);
    if (!parsed)
      throw new ForgeError("NOT_FOUND", "This follow-up link is invalid or has expired.");
    return withTenantTransaction(this.db, parsed.tenantId, async (tx) => {
      const found = await this.findObservationByFollowUpToken(tx, parsed.tenantId, parsed.hash);
      if (!found)
        throw new ForgeError("NOT_FOUND", "This follow-up link is invalid or has expired.");
      return this.observationFollowUpView(
        found.row,
        found.payload,
        await this.tenantDisplayName(tx, parsed.tenantId),
      );
    });
  }

  async submitObservationFollowUpByToken(token: string, body: Record<string, unknown>) {
    const parsed = parseObservationFollowUpToken(token);
    if (!parsed)
      throw new ForgeError("NOT_FOUND", "This follow-up link is invalid or has expired.");
    const complete = String(body.action ?? "").toLowerCase() === "complete";
    return withTenantTransaction(this.db, parsed.tenantId, async (tx) => {
      const found = await this.findObservationByFollowUpToken(tx, parsed.tenantId, parsed.hash);
      if (!found)
        throw new ForgeError("NOT_FOUND", "This follow-up link is invalid or has expired.");
      const { row, payload } = found;
      const status = normalizeObservationStatus(row.status);
      if (status === "CLOSED" || status === "ARCHIVED") {
        throw new ForgeError("VALIDATION_FAILED", "This observation has already been closed out.");
      }
      const now = new Date();
      const followUp = normalizeObservationFollowUp(body.followUp, payload.followUp);
      let nextStatus: string = status === "OPEN" ? "IN_PROGRESS" : status;
      const next: Record<string, unknown> = { ...payload };
      if (body.peopleFault !== undefined) {
        next.peopleObserved = applyObservedPeopleFault(
          normalizeObservedPeople(payload.peopleObserved),
          body.peopleFault,
        );
      }
      if (complete) {
        const missing = observationFollowUpMissing(followUp);
        if (missing) throw new ForgeError("VALIDATION_FAILED", missing);
        followUp.completedAt = now.toISOString();
        followUp.completedVia = "supervisor-link";
        nextStatus = "CLOSED";
        next.closedAt = now.toISOString();
        next.closedByName = followUp.completedByName;
      } else {
        followUp.savedAt = now.toISOString();
      }
      next.followUp = followUp;
      next.status = nextStatus;
      const [updated] = await tx
        .update(industrialObservations)
        .set({ status: nextStatus, sourcePayload: next, updatedAt: now })
        .where(
          and(
            eq(industrialObservations.id, row.id),
            eq(industrialObservations.tenantId, parsed.tenantId),
          ),
        )
        .returning();
      return this.observationFollowUpView(
        updated!,
        next,
        await this.tenantDisplayName(tx, parsed.tenantId),
      );
    });
  }

  private async principalDisplayName(principal: ForgePrincipal): Promise<string> {
    if (!principal.userId) return "";
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select({
            email: users.primaryEmail,
            username: users.username,
            displayName: persons.displayName,
            firstName: persons.firstName,
            lastName: persons.lastName,
          })
          .from(users)
          .leftJoin(persons, eq(persons.id, users.personId))
          .where(and(eq(users.id, principal.userId!), eq(users.tenantId, principal.tenantId)))
          .limit(1);
        if (!row) return "";
        const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
        return (row.displayName ?? "").trim() || full || (row.username ?? "").trim() || row.email;
      },
      principal.userId,
    );
  }

  async updateObservation(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialObservations)
          .where(
            and(
              eq(industrialObservations.id, recordId),
              eq(industrialObservations.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Observation not found");

        const now = new Date();
        const prev = this.unwrapSourcePayload(existing.sourcePayload);
        const fields = observationFieldsFromBody(body);
        const prevStatus = normalizeObservationStatus(existing.status);
        let status =
          body.status !== undefined ? normalizeObservationStatus(body.status) : prevStatus;
        const next: Record<string, unknown> = {
          ...prev,
          ...fields,
          updatedByUserId: principal.userId ?? null,
        };
        if (body.followUp !== undefined || body.completeFollowUp === true) {
          const followUp = normalizeObservationFollowUp(body.followUp, prev.followUp);
          if (body.completeFollowUp === true) {
            const missing = observationFollowUpMissing(followUp);
            if (missing) throw new ForgeError("VALIDATION_FAILED", missing);
            followUp.completedAt = now.toISOString();
            followUp.completedVia = "forge";
            status = "CLOSED";
            next.closedByName = followUp.completedByName;
          } else {
            followUp.savedAt = now.toISOString();
          }
          next.followUp = followUp;
        }
        next.status = status;
        if (status === "CLOSED" && prevStatus !== "CLOSED") {
          next.closedAt = now.toISOString();
          next.closedByUserId = principal.userId ?? null;
        }
        if (fields.assignedToPersonnelId !== undefined && !next.assignedToEmail) {
          await this.resolveObservationAssignee(tx, principal.tenantId, next, false);
        }
        if (observationAssigneeKey(next) !== observationAssigneeKey(prev)) {
          const assigned = Boolean(next.assignedToPersonnelId || next.assignedToName);
          next.assignedAt = assigned ? now.toISOString() : null;
          next.assignedByUserId = assigned ? (principal.userId ?? null) : null;
        }
        // Re-title from the edited fields unless the caller sets one explicitly.
        next.title = buildObservationTitle({ ...next, title: body.title });
        const siteId =
          fields.siteId !== undefined ? (fields.siteId as string | null) : existing.siteId;

        const [row] = await tx
          .update(industrialObservations)
          .set({
            title: next.title as string,
            status,
            siteId: siteId && UUID_PATTERN.test(siteId) ? siteId : null,
            sourcePayload: next,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialObservations.id, recordId),
              eq(industrialObservations.tenantId, principal.tenantId),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Observation not found");
        return this.mapListItem({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: row.sourcePayload,
          extra: { siteId: row.siteId ?? null },
        });
      },
      principal.userId,
    );
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
        "reportedByTitle",
        "reportedByPhone",
        "reportedByDate",
        "dateOccurred",
        "personAffected",
        "personnelId",
        "witnessNames",
        "division",
        "community",
        "departmentId",
        "departmentName",
        "incidentTypeName",
        "locationDetail",
        "siteId",
        "hireDate",
        "dateOfBirth",
        "shiftStartTime",
        "physicianName",
        "treatmentFacility",
        "treatmentStreet",
        "treatmentCity",
        "treatmentState",
        "treatmentZip",
        "treatedInEr",
        "hospitalizedOvernight",
        "completedBy",
        "completedByTitle",
        "completedByPhone",
        "completedByDate",
        "workersCompRelevant",
        "workersCompNotes",
        "medicalRefusalAcknowledgment",
        "reasonableSuspicion",
        "drugAlcohol",
        "drugAlcoholConsents",
        "correctiveActions",
        "workDayDetails",
        "injuriesFront",
        "injuriesBack",
        "InjuriesFront",
        "InjuriesBack",
        "bodyParts",
        "companyName",
      ] as const) {
        if (body[key] !== undefined) nextPayload[key] = body[key];
      }

      const now = new Date();
      const patch: Record<string, unknown> = {
        sourcePayload: nextPayload,
        updatedAt: now,
      };
      if (body.siteId !== undefined) {
        const siteId =
          typeof body.siteId === "string" && body.siteId.trim() ? body.siteId.trim() : null;
        patch.siteId = siteId;
      }
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
          steps.length > 0 &&
          steps.every((s) => String(s.status ?? "").toLowerCase() === "complete");
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
        // Imported tenants often store source_payload as a JSON *string* inside
        // jsonb. Direct ->>'category' returns null on those rows, so injuries
        // (and other tabs) silently under-count. Unwrap string payloads first.
        conditions.push(sql`
          lower(
            coalesce(
              case
                when jsonb_typeof(${industrialIncidents.sourcePayload}) = 'string'
                  then ((${industrialIncidents.sourcePayload} #>> '{}')::jsonb ->> 'category')
                else ${industrialIncidents.sourcePayload} ->> 'category'
              end,
              case
                when jsonb_typeof(${industrialIncidents.sourcePayload}) = 'string'
                  then ((${industrialIncidents.sourcePayload} #>> '{}')::jsonb ->> 'incidentCategory')
                else ${industrialIncidents.sourcePayload} ->> 'incidentCategory'
              end,
              ''
            )
          ) = ${category}
        `);
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

      const incidentIds = items.map((r) => r.id);
      const wcByIncident = new Map<string, string>();
      const oshaByIncident = new Map<string, string>();
      if (incidentIds.length > 0) {
        const wcRows = await tx
          .select({
            id: industrialWorkersCompCases.id,
            incidentId: industrialWorkersCompCases.incidentId,
          })
          .from(industrialWorkersCompCases)
          .where(
            and(
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
              inArray(industrialWorkersCompCases.incidentId, incidentIds),
            ),
          )
          .orderBy(desc(industrialWorkersCompCases.updatedAt));
        for (const row of wcRows) {
          const incidentId = String(row.incidentId ?? "").trim();
          if (!incidentId || wcByIncident.has(incidentId)) continue;
          wcByIncident.set(incidentId, row.id);
        }

        const oshaRows = await tx
          .select({
            id: industrialOshaCases.id,
            sourcePayload: industrialOshaCases.sourcePayload,
            updatedAt: industrialOshaCases.updatedAt,
          })
          .from(industrialOshaCases)
          .where(
            and(
              eq(industrialOshaCases.tenantId, principal.tenantId),
              isNull(industrialOshaCases.archivedAt),
            ),
          )
          .orderBy(desc(industrialOshaCases.updatedAt));
        const incidentIdSet = new Set(incidentIds);
        for (const row of oshaRows) {
          const payload = this.unwrapSourcePayload(row.sourcePayload);
          const incidentId = String(payload.incidentId ?? "").trim();
          if (!incidentId || !incidentIdSet.has(incidentId) || oshaByIncident.has(incidentId)) {
            continue;
          }
          oshaByIncident.set(incidentId, row.id);
        }
      }

      return {
        page,
        pageSize,
        total: totals?.c ?? items.length,
        items: items.map((r) => {
          const linkedCaseId = wcByIncident.get(r.id);
          const linkedOshaCaseId = oshaByIncident.get(r.id);
          return this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: this.unwrapSourcePayload(r.sourcePayload),
            extra: {
              siteId: r.siteId,
              ...(linkedCaseId
                ? { workersCompCaseId: linkedCaseId, workersCompRelevant: true }
                : {}),
              ...(linkedOshaCaseId ? { oshaCaseId: linkedOshaCaseId } : {}),
            },
          });
        }),
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
        drugAlcohol: 0,
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
        else if (category === "drug-alcohol" || category === "drug_alcohol")
          summary.drugAlcohol += 1;
        else if (category === "property-damage" || category === "property_damage")
          summary.propertyDamage += 1;
        else if (category === "automotive" || category === "vehicle") summary.automotive += 1;

        const status = String(row.status ?? "")
          .trim()
          .toLowerCase();
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
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
        const bodyDivision = typeof body.divisionName === "string" ? body.divisionName.trim() : "";
        const title =
          titleRaw ||
          defaultInspectionTitle({
            divisionName: bodyDivision,
            departmentName: departmentName || template.name,
          });
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
      },
      principal.userId,
    );
  }

  getIncident(p: ForgePrincipal, id: string) {
    return this.getIncidentDetailed(p, id);
  }

  async getIncidentDetailed(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
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
        if (!row) throw new ForgeError("NOT_FOUND", "Record not found");

        const [linkedWc] = await tx
          .select({ id: industrialWorkersCompCases.id })
          .from(industrialWorkersCompCases)
          .where(
            and(
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              eq(industrialWorkersCompCases.incidentId, recordId),
              isNull(industrialWorkersCompCases.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompCases.updatedAt))
          .limit(1);

        let linkedOshaCaseId: string | undefined;
        const oshaRows = await tx
          .select({
            id: industrialOshaCases.id,
            sourcePayload: industrialOshaCases.sourcePayload,
          })
          .from(industrialOshaCases)
          .where(
            and(
              eq(industrialOshaCases.tenantId, principal.tenantId),
              isNull(industrialOshaCases.archivedAt),
            ),
          )
          .orderBy(desc(industrialOshaCases.updatedAt));
        for (const osha of oshaRows) {
          const payload = this.unwrapSourcePayload(osha.sourcePayload);
          if (String(payload.incidentId ?? "").trim() === recordId) {
            linkedOshaCaseId = osha.id;
            break;
          }
        }

        return this.mapListItem({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: this.unwrapSourcePayload(row.sourcePayload),
          extra: {
            siteId: row.siteId,
            ...(linkedWc ? { workersCompCaseId: linkedWc.id, workersCompRelevant: true } : {}),
            ...(linkedOshaCaseId ? { oshaCaseId: linkedOshaCaseId } : {}),
          },
        });
      },
      principal.userId,
    );
  }

  getInspection(p: ForgePrincipal, id: string) {
    return this.getModule(p, "inspections", id);
  }

  async listDepartments(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
          divisionName: row.divisionName,
          status: row.status,
          contactPersonnelId: row.contactPersonnelId,
          contactName: row.contactName,
          contactEmail: row.contactEmail,
        }));
      },
      principal.userId,
    );
  }

  async listInspectionTemplates(principal: ForgePrincipal, query: ListQuery = {}) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
        return preferred.length > 0
          ? [...preferred, ...templates.filter((t) => !preferred.includes(t))]
          : templates;
      },
      principal.userId,
    );
  }

  /**
   * Upload Excel/CSV/PDF checklist → digital inspection template
   * (stored as industrial_inspections with sourceCollection inspectionTemplates).
   */
  async importInspectionTemplateFile(
    principal: ForgePrincipal,
    body: Record<string, unknown>,
  ): Promise<{
    template: InspectionTemplateDto;
    created: boolean;
    updated: boolean;
    itemCount: number;
  }> {
    const filename = String(body.filename ?? "").trim();
    const contentBase64 = String(body.contentBase64 ?? "").trim();
    const dryRun = body.dryRun === true || body.preview === true;

    let items: InspectionTemplateItem[] = [];
    let parsedTitle = "Imported inspection";
    let sourceDocumentId =
      typeof body.sourceDocumentId === "string" && body.sourceDocumentId.trim()
        ? body.sourceDocumentId.trim()
        : "";

    if (contentBase64) {
      if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
      const buffer = Buffer.from(contentBase64, "base64");
      if (!buffer.length) throw new ForgeError("VALIDATION_FAILED", "Uploaded file is empty");
      if (buffer.length > 15_000_000) {
        throw new ForgeError("VALIDATION_FAILED", "Uploaded file is too large (15 MB max)");
      }

      let pdfText: string | undefined;
      if (filename.toLowerCase().endsWith(".pdf")) {
        try {
          const { default: pdfParse } = await import("pdf-parse");
          const parsed = await pdfParse(buffer);
          pdfText = parsed.text;
        } catch {
          throw new ForgeError("VALIDATION_FAILED", "Could not read PDF file");
        }
      }

      let parsed;
      try {
        parsed = parseChecklistFile(buffer, filename, pdfText);
      } catch (error) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          error instanceof Error ? error.message : "Could not parse checklist file",
        );
      }
      items = checklistFieldsToInspectionItems(parsed.fields);
      parsedTitle = parsed.title;
      if (!sourceDocumentId) {
        sourceDocumentId = `file-${createHash("sha256").update(buffer).digest("hex").slice(0, 32)}`;
      }
    } else if (Array.isArray(body.items)) {
      items = checklistFieldsToInspectionItems(
        body.items.map((entry) => {
          const row =
            entry && typeof entry === "object" && !Array.isArray(entry)
              ? (entry as Record<string, unknown>)
              : {};
          const id = typeof row.id === "string" ? row.id.trim() : "";
          const section =
            typeof row.section === "string"
              ? row.section
              : typeof row.category === "string"
                ? row.category
                : "";
          const mapped: { id?: string; label: string; section?: string; required?: boolean } = {
            label: String(row.label ?? row.text ?? row.question ?? ""),
            required: row.required === false ? false : true,
          };
          if (id) mapped.id = id;
          if (section.trim()) mapped.section = section.trim();
          return mapped;
        }),
      );
      parsedTitle =
        String(body.title ?? body.name ?? "").trim() ||
        filename.replace(/\.[^.]+$/, "") ||
        "Imported inspection";
      if (!sourceDocumentId) {
        sourceDocumentId = `manual-${createHash("sha256")
          .update(JSON.stringify(items))
          .digest("hex")
          .slice(0, 32)}`;
      }
    } else {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Provide contentBase64 + filename, or an items array",
      );
    }

    if (items.length === 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "No checklist items found. Use one question per row (Excel/CSV) or numbered lines (PDF).",
      );
    }

    const title =
      cleanInspectionTemplateName(String(body.title ?? body.name ?? "").trim() || parsedTitle) ||
      "Imported inspection";
    const departmentHint =
      typeof body.departmentHint === "string" && body.departmentHint.trim()
        ? body.departmentHint.trim()
        : null;

    const previewTemplate: InspectionTemplateDto = {
      id: "preview",
      name: title,
      source: "imported",
      departmentHint,
      items,
    };
    if (dryRun) {
      return { template: previewTemplate, created: false, updated: false, itemCount: items.length };
    }

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [existing] = await tx
          .select()
          .from(industrialInspections)
          .where(
            and(
              eq(industrialInspections.tenantId, principal.tenantId),
              eq(industrialInspections.sourceCollection, "inspectionTemplates"),
              eq(industrialInspections.sourceDocumentId, sourceDocumentId),
              isNull(industrialInspections.archivedAt),
            ),
          )
          .limit(1);

        const sourcePayload = {
          isTemplate: true,
          title,
          name: title,
          templateName: title,
          departmentHint,
          items,
          importedFrom: filename || null,
          importedAt: now.toISOString(),
        };

        if (existing) {
          const [row] = await tx
            .update(industrialInspections)
            .set({
              title,
              status: "TEMPLATE",
              inspectionType: "TEMPLATE",
              sourcePayload,
              sourcePath: filename || existing.sourcePath,
              updatedAt: now,
            } as never)
            .where(eq(industrialInspections.id, existing.id))
            .returning();
          const template = templateFromLegacyRow({
            id: row!.id,
            title: row!.title,
            source: "imported",
            sourcePayload: row!.sourcePayload,
            departmentHint,
          });
          if (!template) {
            throw new ForgeError("VALIDATION_FAILED", "Imported template had no usable items");
          }
          return { template, created: false, updated: true, itemCount: template.items.length };
        }

        const id = createId();
        const [row] = await tx
          .insert(industrialInspections)
          .values({
            id,
            tenantId: principal.tenantId,
            title,
            status: "TEMPLATE",
            inspectionType: "TEMPLATE",
            sourceSystem: "FORGE",
            sourceCollection: "inspectionTemplates",
            sourceDocumentId,
            sourcePath: filename || null,
            sourcePayload,
            createdAt: now,
            updatedAt: now,
          } as never)
          .returning();
        const template = templateFromLegacyRow({
          id: row!.id,
          title: row!.title,
          source: "imported",
          sourcePayload: row!.sourcePayload,
          departmentHint,
        });
        if (!template) {
          throw new ForgeError("VALIDATION_FAILED", "Imported template had no usable items");
        }
        return { template, created: true, updated: false, itemCount: template.items.length };
      },
      principal.userId,
    );
  }

  async renameInspectionTemplate(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown>,
  ): Promise<InspectionTemplateDto> {
    const recordId = this.assertRecordId(id);
    if (recordId === FALLBACK_INSPECTION_TEMPLATE.id) {
      throw new ForgeError("VALIDATION_FAILED", "The built-in template name cannot be changed");
    }
    const name = cleanInspectionTemplateName(String(body.name ?? body.title ?? "").trim());
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Template name is required");
    if (name.length > 500) {
      throw new ForgeError("VALIDATION_FAILED", "Template name is too long (500 characters max)");
    }

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();

        const [insp] = await tx
          .select()
          .from(industrialInspections)
          .where(
            and(
              eq(industrialInspections.id, recordId),
              eq(industrialInspections.tenantId, principal.tenantId),
              isNull(industrialInspections.archivedAt),
              or(
                eq(industrialInspections.sourceCollection, "inspectionTemplates"),
                eq(industrialInspections.inspectionType, "TEMPLATE"),
                sql`coalesce(${industrialInspections.sourcePayload}->>'isTemplate','') = 'true'`,
              ),
            ),
          )
          .limit(1);
        if (insp) {
          const payload = this.unwrapSourcePayload(insp.sourcePayload);
          const sourcePayload = {
            ...payload,
            isTemplate: true,
            title: name,
            name,
            templateName: name,
          };
          const [row] = await tx
            .update(industrialInspections)
            .set({
              title: name,
              sourcePayload,
              updatedAt: now,
            } as never)
            .where(eq(industrialInspections.id, insp.id))
            .returning();
          const template = templateFromLegacyRow({
            id: row!.id,
            title: row!.title,
            source: "imported",
            sourcePayload: row!.sourcePayload,
          });
          if (!template)
            throw new ForgeError("VALIDATION_FAILED", "Template has no checklist items");
          return template;
        }

        const [form] = await tx
          .select()
          .from(industrialFormDefinitions)
          .where(
            and(
              eq(industrialFormDefinitions.id, recordId),
              eq(industrialFormDefinitions.tenantId, principal.tenantId),
              isNull(industrialFormDefinitions.archivedAt),
            ),
          )
          .limit(1);
        if (form) {
          const payload = this.unwrapSourcePayload(form.sourcePayload);
          const [row] = await tx
            .update(industrialFormDefinitions)
            .set({
              title: name,
              sourcePayload: { ...payload, title: name, name },
              updatedAt: now,
            } as never)
            .where(eq(industrialFormDefinitions.id, form.id))
            .returning();
          const template = templateFromLegacyRow({
            id: row!.id,
            title: row!.title,
            name: row!.title,
            source: "imported",
            schemaJson: row!.schemaJson,
            sourcePayload: row!.sourcePayload,
          });
          if (!template)
            throw new ForgeError("VALIDATION_FAILED", "Template has no checklist items");
          return template;
        }

        const [ehs] = await tx
          .select()
          .from(platformEhsAuditTemplates)
          .where(
            and(
              eq(platformEhsAuditTemplates.id, recordId),
              eq(platformEhsAuditTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (ehs) {
          const [row] = await tx
            .update(platformEhsAuditTemplates)
            .set({
              name,
              updatedAt: now,
            } as never)
            .where(eq(platformEhsAuditTemplates.id, ehs.id))
            .returning();
          const template = templateFromLegacyRow({
            id: row!.id,
            name: row!.name,
            source: "ehs",
            templateJson: row!.templateJson,
            sourcePayload: row!.sourcePayload,
          });
          if (!template)
            throw new ForgeError("VALIDATION_FAILED", "Template has no checklist items");
          return template;
        }

        throw new ForgeError(
          "NOT_FOUND",
          "Template not found, or this template cannot be renamed for your company",
        );
      },
      principal.userId,
    );
  }

  async updateInspection(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
          "signature",
          "signatureName",
          "divisionName",
          "locationName",
          "locationId",
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
      },
      principal.userId,
    );
  }

  /**
   * Soft-delete an inspection. Restricted to Tenant Admin / Forge Creator.
   * Writes an audit_events row so the deletion remains traceable.
   */
  async deleteInspection(principal: ForgePrincipal, id: string) {
    this.assertCanDeleteInspections(principal);
    const recordId = this.assertRecordId(id);
    if (!this.audit) {
      throw new ForgeError("INTERNAL_ERROR", "Audit service is not configured");
    }

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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

        const before = this.mapInspectionRow(existing);
        const now = new Date();
        const [row] = await tx
          .update(industrialInspections)
          .set({
            archivedAt: now,
            status: "DELETED",
            updatedAt: now,
          })
          .where(eq(industrialInspections.id, recordId))
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to delete inspection");

        const after = this.mapInspectionRow(row);
        await this.audit!.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "industrial.inspections.delete",
          resourceType: "industrial_inspections",
          resourceId: recordId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: "",
          requestId: "",
          before,
          after,
          metadata: {
            module: "INSPECTIONS",
            reason: "admin_delete",
            title: String(existing.title ?? ""),
            previousStatus: String(existing.status ?? ""),
          },
        });
        return after;
      },
      principal.userId,
    );
  }

  async completeInspection(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = this.assertRecordId(id);
    const appBase =
      (typeof body.appBaseUrl === "string" && body.appBaseUrl.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgeindustrialsafety.com";

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
          throw new ForgeError(
            "VALIDATION_FAILED",
            e instanceof Error ? e.message : "Cannot complete",
          );
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

        const targetType = String(payload.targetType ?? "")
          .trim()
          .toUpperCase();
        const targetId = String(payload.targetId ?? "").trim();
        const qrLinkId = String(payload.qrLinkId ?? "").trim();
        const failedItems = nextItems.filter((item) => item.answer === "NO");
        let assetOutOfService = false;
        let outOfServiceReason: string | null = null;
        if (failedItems.length > 0 && targetType && targetId && isQrAssetTargetType(targetType)) {
          outOfServiceReason =
            failedItems.length === 1
              ? `Failed inspection: ${failedItems[0]?.label ?? existing.title}`
              : `Failed inspection (${failedItems.length} findings): ${existing.title}`;
          await markQrAssetOutOfService(tx, {
            tenantId: principal.tenantId,
            targetType,
            targetId,
            reason: outOfServiceReason.slice(0, 500),
            personnelId: responsiblePersonnelId,
            personnelName: responsibleName || null,
            qrLinkId: qrLinkId || null,
            source: payload.qrScanSource ? "QR_INSPECTION" : "INSPECTION",
          });
          assetOutOfService = true;
        }

        const nextPayload = {
          ...payload,
          items: nextItems,
          completedAt: now.toISOString(),
          assetOutOfService,
          outOfServiceReason,
          signature: typeof body.signature === "string" ? body.signature : payload.signature,
          signatureName:
            typeof body.signatureName === "string" ? body.signatureName : payload.signatureName,
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

        return {
          ...this.mapInspectionRow(row!),
          assetOutOfService,
          outOfServiceReason,
        };
      },
      principal.userId,
    );
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
      if (
        existing.closeoutTokenExpiresAt &&
        existing.closeoutTokenExpiresAt.getTime() < Date.now()
      ) {
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

  private async resolveDvirTenantId(tokenHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_dvir_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  private unwrapDotPayload(sourcePayload: unknown): Record<string, unknown> {
    return this.unwrapSourcePayload(sourcePayload);
  }

  private async resolveDvirVehicleByToken(token: string) {
    const raw = String(token ?? "").trim();
    if (raw.length < 16) throw new ForgeError("NOT_FOUND", "DVIR link not found");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const tenantId = await this.resolveDvirTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "DVIR link not found");
    return { raw, tokenHash, tenantId };
  }

  private async resolveTenantBrandingSummary(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<{
    tenantKey: string | null;
    companyName: string | null;
    logoUrl: string | null;
  }> {
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key,
        display_name::text as display_name,
        legal_name::text as legal_name
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;

    const brandingRows = await tx.execute(sql`
      select cv.payload_json as payload
      from config_objects co
      join config_versions cv on cv.id = co.current_published_version_id
      where co.tenant_id = ${tenantId}::uuid
        and co.namespace = 'branding'
        and co.object_key = 'default'
      limit 1
    `);
    const brandingPayloadRaw = (
      Array.isArray(brandingRows)
        ? brandingRows[0]
        : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]
    ) as { payload?: unknown } | undefined;
    const brandingPayload = unwrapJsonRecord(brandingPayloadRaw?.payload);

    const tenantKey = String(tenantRow?.tenant_key ?? "").trim() || null;
    const companyName =
      String(
        brandingPayload.productDisplayName ??
          tenantRow?.display_name ??
          tenantRow?.legal_name ??
          "",
      ).trim() || null;
    const logoUrl =
      String(brandingPayload.logoUrl ?? "").trim() ||
      (tenantKey === "producers-rice-mill" ? "/branding/producers-rice-mill.png" : null);

    return { tenantKey, companyName, logoUrl };
  }

  async listDvirsForVehicle(principal: ForgePrincipal, vehicleId: string, query: ListQuery) {
    const id = this.assertRecordId(vehicleId);
    const { page, pageSize, offset } = this.page(query);
    const cutoffDate = dvirRetentionCutoffDate();
    const cutoffTs = dvirRetentionCutoffTimestamp();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      await this.purgeExpiredDvirs(tx, principal.tenantId);

      const [vehicle] = await tx
        .select({
          id: industrialFleetVehicles.id,
          assetNumber: industrialFleetVehicles.assetNumber,
          licensePlate: industrialFleetVehicles.licensePlate,
          year: industrialFleetVehicles.year,
          make: industrialFleetVehicles.make,
          model: industrialFleetVehicles.model,
        })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, id),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "Vehicle not found");

      const items = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${id}`,
            or(
              gte(industrialDotComplianceRecords.recordDate, cutoffDate),
              and(
                isNull(industrialDotComplianceRecords.recordDate),
                gte(industrialDotComplianceRecords.createdAt, cutoffTs),
              ),
            ),
          ),
        )
        .orderBy(
          desc(industrialDotComplianceRecords.recordDate),
          desc(industrialDotComplianceRecords.updatedAt),
        )
        .limit(pageSize)
        .offset(offset);

      return {
        page,
        pageSize,
        retentionDays: 91,
        items: items.map((row) =>
          this.mapListItem({
            id: row.id,
            title: row.title,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            sourcePayload: row.sourcePayload,
            extra: { recordDate: row.recordDate },
          }),
        ),
      };
    });
  }

  async dvirPrintable(principal: ForgePrincipal, recordId: string) {
    const id = this.assertRecordId(recordId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, id),
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "DVIR not found");
      const branding = await this.resolveTenantBrandingSummary(tx, principal.tenantId);
      const mapped = this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
        extra: { recordDate: row.recordDate },
      });
      return {
        html: buildDvirPrintableHtml(mapped as Record<string, unknown>, branding),
      };
    });
  }

  async dvirDayPrintable(principal: ForgePrincipal, vehicleId: string, inspectionDate: string) {
    const id = this.assertRecordId(vehicleId);
    const date = String(inspectionDate ?? "")
      .trim()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ForgeError("VALIDATION_FAILED", "Inspection date must be YYYY-MM-DD.");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [vehicle] = await tx
        .select({
          assetNumber: industrialFleetVehicles.assetNumber,
          licensePlate: industrialFleetVehicles.licensePlate,
          year: industrialFleetVehicles.year,
          make: industrialFleetVehicles.make,
          model: industrialFleetVehicles.model,
        })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, id),
            eq(industrialFleetVehicles.tenantId, principal.tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "Vehicle not found");

      const rows = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${id}`,
            or(
              eq(industrialDotComplianceRecords.recordDate, date),
              sql`coalesce(${industrialDotComplianceRecords.sourcePayload}->>'inspectionDate', '') like ${`${date}%`}`,
            ),
          ),
        )
        .orderBy(desc(industrialDotComplianceRecords.updatedAt));

      const branding = await this.resolveTenantBrandingSummary(tx, principal.tenantId);
      const vehicleLabel =
        vehicle.assetNumber?.trim() ||
        [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        vehicle.licensePlate?.trim() ||
        id;
      const mapped = rows.map((row) =>
        this.mapListItem({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: row.sourcePayload,
          extra: { recordDate: row.recordDate },
        }),
      ) as Array<Record<string, unknown>>;

      return {
        html: buildDvirDayPrintableHtml(date, vehicleLabel, mapped, branding),
      };
    });
  }

  async listDvirsByToken(token: string) {
    const { tokenHash, tenantId } = await this.resolveDvirVehicleByToken(token);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.purgeExpiredDvirs(tx, tenantId);

      const [vehicle] = await tx
        .select({ id: industrialFleetVehicles.id })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const cutoffDate = dvirRetentionCutoffDate();
      const cutoffTs = dvirRetentionCutoffTimestamp();
      const items = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
            or(
              gte(industrialDotComplianceRecords.recordDate, cutoffDate),
              and(
                isNull(industrialDotComplianceRecords.recordDate),
                gte(industrialDotComplianceRecords.createdAt, cutoffTs),
              ),
            ),
          ),
        )
        .orderBy(
          desc(industrialDotComplianceRecords.recordDate),
          desc(industrialDotComplianceRecords.updatedAt),
        )
        .limit(100);

      return {
        retentionDays: DVIR_RETENTION_DAYS,
        items: items.map((row) =>
          this.mapListItem({
            id: row.id,
            title: row.title,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            sourcePayload: row.sourcePayload,
            extra: { recordDate: row.recordDate },
          }),
        ),
      };
    });
  }

  async dvirPrintableByToken(token: string, recordId: string) {
    const { tokenHash, tenantId } = await this.resolveDvirVehicleByToken(token);
    const id = this.assertRecordId(recordId);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vehicle] = await tx
        .select({ id: industrialFleetVehicles.id })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const [row] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, id),
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "DVIR not found");

      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);
      const mapped = this.mapListItem({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourcePayload: row.sourcePayload,
        extra: { recordDate: row.recordDate },
      });
      return {
        html: buildDvirPrintableHtml(mapped as Record<string, unknown>, branding),
      };
    });
  }

  async dvirDayPrintableByToken(token: string, inspectionDate: string) {
    const { tokenHash, tenantId } = await this.resolveDvirVehicleByToken(token);
    const date = String(inspectionDate ?? "")
      .trim()
      .slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ForgeError("VALIDATION_FAILED", "Inspection date must be YYYY-MM-DD.");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vehicle] = await tx
        .select({
          id: industrialFleetVehicles.id,
          assetNumber: industrialFleetVehicles.assetNumber,
          licensePlate: industrialFleetVehicles.licensePlate,
          year: industrialFleetVehicles.year,
          make: industrialFleetVehicles.make,
          model: industrialFleetVehicles.model,
        })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const rows = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            this.dvirSourceFilter(),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
            or(
              eq(industrialDotComplianceRecords.recordDate, date),
              sql`coalesce(${industrialDotComplianceRecords.sourcePayload}->>'inspectionDate', '') like ${`${date}%`}`,
            ),
          ),
        )
        .orderBy(desc(industrialDotComplianceRecords.updatedAt));

      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);
      const vehicleLabel =
        vehicle.assetNumber?.trim() ||
        [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        vehicle.licensePlate?.trim() ||
        vehicle.id;
      const mapped = rows.map((row) =>
        this.mapListItem({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: row.sourcePayload,
          extra: { recordDate: row.recordDate },
        }),
      ) as Array<Record<string, unknown>>;

      return {
        html: buildDvirDayPrintableHtml(date, vehicleLabel, mapped, branding),
      };
    });
  }

  private dvirSourceFilter() {
    return or(
      eq(industrialDotComplianceRecords.sourceCollection, "dvirs"),
      sql`${industrialDotComplianceRecords.sourcePayload}->>'recordType' = 'DVIR'`,
    );
  }

  private async purgeExpiredDvirs(tx: DatabaseTransaction, tenantId: string) {
    const cutoffDate = dvirRetentionCutoffDate();
    const cutoffTs = dvirRetentionCutoffTimestamp();
    await tx
      .delete(industrialDotComplianceRecords)
      .where(
        and(
          eq(industrialDotComplianceRecords.tenantId, tenantId),
          this.dvirSourceFilter(),
          or(
            lt(industrialDotComplianceRecords.recordDate, cutoffDate),
            and(
              isNull(industrialDotComplianceRecords.recordDate),
              lt(industrialDotComplianceRecords.createdAt, cutoffTs),
            ),
          ),
        ),
      );
  }

  async getDvirContextByToken(token: string) {
    const { tokenHash, tenantId } = await this.resolveDvirVehicleByToken(token);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vehicle] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);

      let siteName: string | null = null;
      if (vehicle.siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name })
          .from(industrialSites)
          .where(eq(industrialSites.id, vehicle.siteId))
          .limit(1);
        siteName = site?.name ?? null;
      }

      const truckNumber =
        vehicle.assetNumber ||
        [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        vehicle.licensePlate ||
        "Unit";

      const dvirRows = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            or(
              eq(industrialDotComplianceRecords.sourceCollection, "dvirs"),
              sql`${industrialDotComplianceRecords.sourcePayload}->>'recordType' = 'DVIR'`,
            ),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
          ),
        )
        .orderBy(desc(industrialDotComplianceRecords.updatedAt))
        .limit(25);

      const pendingDriverReviews: Array<Record<string, unknown>> = [];
      let pendingMechanicCount = 0;
      for (const row of dvirRows) {
        const payload = this.unwrapDotPayload(row.sourcePayload);
        if (payloadNeedsMechanic(payload)) pendingMechanicCount += 1;
        if (payloadNeedsDriverReview(payload)) {
          pendingDriverReviews.push({
            id: row.id,
            title: row.title,
            tripType: payload.tripType,
            inspectionDate: payload.inspectionDate ?? row.recordDate,
            mechanicName: payload.mechanicName,
            defectsCorrected: payload.defectsCorrected,
            defectsNeedNotBeCorrected: payload.defectsNeedNotBeCorrected,
            mechanicSignedAt: payload.mechanicSignedAt,
          });
        }
      }

      return {
        vehicleId: vehicle.id,
        truckNumber,
        assetNumber: vehicle.assetNumber,
        licensePlate: vehicle.licensePlate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        siteName,
        assignedDriverName: vehicle.assignedDriverName,
        outOfService: Boolean(vehicle.outOfService),
        pendingMechanicCount,
        pendingDriverReviews,
        tenantKey: branding.tenantKey,
        companyName: branding.companyName,
        logoUrl: branding.logoUrl,
      };
    });
  }

  async certifyDvirDriverReviewByToken(token: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveDvirVehicleByToken(token);
    const driverReviewSignatureDataUrl = String(body.driverReviewSignatureDataUrl ?? "").trim();
    if (!driverReviewSignatureDataUrl.startsWith("data:image/")) {
      throw new ForgeError("VALIDATION_FAILED", "Driver review signature is required.");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vehicle] = await tx
        .select({ id: industrialFleetVehicles.id })
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const requestedId = String(body.dvirId ?? "").trim();
      let recordId = requestedId;
      if (!UUID_PATTERN.test(recordId)) {
        const dvirRows = await tx
          .select()
          .from(industrialDotComplianceRecords)
          .where(
            and(
              eq(industrialDotComplianceRecords.tenantId, tenantId),
              isNull(industrialDotComplianceRecords.archivedAt),
              or(
                eq(industrialDotComplianceRecords.sourceCollection, "dvirs"),
                sql`${industrialDotComplianceRecords.sourcePayload}->>'recordType' = 'DVIR'`,
              ),
              sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
            ),
          )
          .orderBy(desc(industrialDotComplianceRecords.updatedAt))
          .limit(25);
        const pending = dvirRows.find((row) =>
          payloadNeedsDriverReview(this.unwrapDotPayload(row.sourcePayload)),
        );
        if (!pending) {
          throw new ForgeError("NOT_FOUND", "No DVIR is waiting for driver review on this unit.");
        }
        recordId = pending.id;
      }

      const [existing] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, recordId),
            eq(industrialDotComplianceRecords.tenantId, tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
            sql`${industrialDotComplianceRecords.sourcePayload}->>'vehicleId' = ${vehicle.id}`,
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "DVIR not found");

      const payload = this.unwrapDotPayload(existing.sourcePayload);
      if (!payloadNeedsDriverReview(payload)) {
        throw new ForgeError("VALIDATION_FAILED", "This DVIR is not waiting for driver review.");
      }

      const now = new Date();
      const nextPayload = {
        ...payload,
        driverReviewSignatureDataUrl,
        driverReviewSignedAt:
          parseOptionalSignedAt(body, "driverReviewSignedAt") ?? now.toISOString(),
      };

      const [row] = await tx
        .update(industrialDotComplianceRecords)
        .set({
          sourcePayload: nextPayload,
          status: "CLOSED",
          updatedAt: now,
        } as never)
        .where(eq(industrialDotComplianceRecords.id, recordId))
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

  async updateDot(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    await assertDemoAllowsDotExternal(this.db, principal.tenantId, body);
    const recordId = this.assertRecordId(id);
    this.assertNoInlineDocumentPayload(body);
    const reserved = new Set([
      "id",
      "tenantId",
      "createdAt",
      "updatedAt",
      "archivedAt",
      "sourcePayload",
      "sourceSystem",
      "sourceCollection",
      "sourceDocumentId",
      "sourcePath",
      "sensitiveJson",
      "schemaJson",
      "driverSignatureDataUrl",
      "mechanicSignatureDataUrl",
      "driverReviewSignatureDataUrl",
      "items",
      "truckDefects",
      "trailerDefects",
    ]);

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, recordId),
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "DOT record not found");

      if (isDvirDotRecord(existing.sourcePayload, existing.sourceCollection)) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Submitted DVIRs cannot be edited. Print the report or certify follow-up signatures instead.",
        );
      }

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const nextPayload: Record<string, unknown> = { ...payload };

      for (const [key, value] of Object.entries(body)) {
        if (reserved.has(key) || value === undefined) continue;
        if (key === "details" && value && typeof value === "object" && !Array.isArray(value)) {
          const existingDetails =
            nextPayload.details &&
            typeof nextPayload.details === "object" &&
            !Array.isArray(nextPayload.details)
              ? (nextPayload.details as Record<string, unknown>)
              : {};
          nextPayload.details = {
            ...existingDetails,
            ...(value as Record<string, unknown>),
          };
          continue;
        }
        nextPayload[key] = value;
      }

      const workerName = String(
        nextPayload.workerName ?? nextPayload.driverName ?? nextPayload.personnelName ?? "",
      ).trim();
      const firstName = String(nextPayload.firstName ?? "").trim();
      const lastName = String(nextPayload.lastName ?? "").trim();
      const explicitTitle = String(body.title ?? nextPayload.title ?? "").trim();
      const resolvedTitle =
        explicitTitle ||
        workerName ||
        [firstName, lastName].filter(Boolean).join(" ") ||
        String(existing.title ?? "").trim();
      if (!resolvedTitle) {
        throw new ForgeError("VALIDATION_FAILED", "A record title or worker name is required.");
      }

      nextPayload.title = resolvedTitle;
      if (workerName) {
        nextPayload.workerName = workerName;
        nextPayload.driverName = workerName;
        nextPayload.personnelName = workerName;
      }

      const recordDateRaw =
        typeof body.recordDate === "string"
          ? body.recordDate.trim().slice(0, 10)
          : typeof nextPayload.recordDate === "string"
            ? nextPayload.recordDate.trim().slice(0, 10)
            : typeof nextPayload.inspectionDate === "string"
              ? nextPayload.inspectionDate.trim().slice(0, 10)
              : null;

      const now = new Date();
      const patch: Record<string, unknown> = {
        title: resolvedTitle,
        sourcePayload: nextPayload,
        updatedAt: now,
      };
      if (typeof body.status === "string" && body.status.trim()) {
        patch.status = body.status.trim();
      }
      if (recordDateRaw) patch.recordDate = recordDateRaw;
      if (body.personnelId !== undefined) {
        patch.personnelId = body.personnelId ? String(body.personnelId) : null;
      } else if (!existing.personnelId) {
        for (const raw of this.employeeNumberCandidatesFromPayload(nextPayload)) {
          const match = await findPersonnelByEmployeeNumber(tx, principal.tenantId, raw);
          if (match) {
            patch.personnelId = match.id;
            nextPayload.personnelId = match.id;
            patch.sourcePayload = nextPayload;
            break;
          }
        }
      }

      const [row] = await tx
        .update(industrialDotComplianceRecords)
        .set(patch as never)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, recordId),
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "DOT record not found");

      const linkedPersonnelId =
        typeof row.personnelId === "string" && row.personnelId.trim()
          ? row.personnelId.trim()
          : null;
      if (
        linkedPersonnelId &&
        this.isDotDqfDriverRecord(
          {
            sourceCollection: row.sourceCollection,
            sourcePath: row.sourcePath,
            sourceDocumentId: row.sourceDocumentId,
            title: row.title,
          },
          this.unwrapSourcePayload(row.sourcePayload),
        )
      ) {
        await this.markPersonnelDotDriverFromDqf(tx, principal.tenantId, linkedPersonnelId);
      }

      // Mirror DQF license uploads onto the linked personnel file (documentId refs).
      if (linkedPersonnelId) {
        const licenseTouched =
          Object.prototype.hasOwnProperty.call(body, "driversLicenseCopy") ||
          Object.prototype.hasOwnProperty.call(body, "licenseFrontUpload") ||
          Object.prototype.hasOwnProperty.call(body, "licenseBackUpload") ||
          Object.prototype.hasOwnProperty.call(body, "driversLicenseBack") ||
          (body.details &&
            typeof body.details === "object" &&
            !Array.isArray(body.details) &&
            (Object.prototype.hasOwnProperty.call(body.details, "driversLicenseCopy") ||
              Object.prototype.hasOwnProperty.call(body.details, "driversLicenseBack")));
        if (licenseTouched) {
          await this.syncPersonnelLicenseFromDotPayload(
            tx,
            principal.tenantId,
            linkedPersonnelId,
            this.unwrapSourcePayload(row.sourcePayload),
          );
        }
      }

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

  async submitDvirByToken(token: string, body: Record<string, unknown>) {
    const raw = String(token ?? "").trim();
    if (raw.length < 16) throw new ForgeError("NOT_FOUND", "DVIR link not found");
    let parsed;
    try {
      parsed = assertDvirDriverBody(body);
    } catch (e) {
      throw new ForgeError("VALIDATION_FAILED", e instanceof Error ? e.message : "Invalid DVIR");
    }

    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const tenantId = await this.resolveDvirTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "DVIR link not found");

    const now = new Date();
    const signedAt = parseOptionalSignedAt(body, "driverSignedAt") ?? now.toISOString();
    const defectCount = parsed.truckDefects.length + parsed.trailerDefects.length;
    const status = dvirStatusForDefects(defectCount);
    const title = dvirTitle(parsed.tripType, parsed.truckNumber);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vehicle] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.dvirPublicTokenHash, tokenHash),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!vehicle) throw new ForgeError("NOT_FOUND", "DVIR link not found");

      const payload = {
        category: "dvirs",
        recordType: "DVIR",
        tripType: parsed.tripType,
        inspectionDate: parsed.inspectionDate,
        truckNumber: parsed.truckNumber,
        trailerNumbers: parsed.trailerNumbers,
        vehicleId: vehicle.id,
        workerName: parsed.workerName,
        driverName: parsed.workerName,
        items: parsed.items,
        truckDefects: parsed.truckDefects,
        trailerDefects: parsed.trailerDefects,
        remarks: parsed.remarks,
        conditionSatisfactory: parsed.conditionSatisfactory,
        driverSignatureDataUrl: parsed.driverSignatureDataUrl,
        driverSignedAt: signedAt,
        submittedVia: "public-qr",
      };

      const [row] = await tx
        .insert(industrialDotComplianceRecords)
        .values({
          id: createId(),
          tenantId,
          siteId: vehicle.siteId,
          title,
          status,
          recordDate: parsed.inspectionDate,
          sourceSystem: "FORGE",
          sourceCollection: "dvirs",
          sourcePayload: payload,
          createdAt: now,
          updatedAt: now,
        } as never)
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

  async certifyDvir(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    const action = String(body.action ?? "mechanic")
      .trim()
      .toLowerCase();

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialDotComplianceRecords)
        .where(
          and(
            eq(industrialDotComplianceRecords.id, recordId),
            eq(industrialDotComplianceRecords.tenantId, principal.tenantId),
            isNull(industrialDotComplianceRecords.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "DVIR not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const defectCount = Array.isArray(payload.items)
        ? (payload.items as Array<Record<string, unknown>>).filter(
            (item) => String(item.answer ?? "").toUpperCase() === "NO",
          ).length
        : (Array.isArray(payload.truckDefects) ? payload.truckDefects.length : 0) +
          (Array.isArray(payload.trailerDefects) ? payload.trailerDefects.length : 0);
      if (defectCount === 0) {
        throw new ForgeError("VALIDATION_FAILED", "This DVIR has no defects to certify.");
      }

      const now = new Date();
      const nextPayload = { ...payload };

      if (action === "mechanic") {
        const corrected = body.defectsCorrected === true;
        const needNot = body.defectsNeedNotBeCorrected === true;
        if (corrected === needNot) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Select either “defects corrected” or “need not be corrected for safe operation”.",
          );
        }
        const mechanicName = String(body.mechanicName ?? "").trim();
        const mechanicSignatureDataUrl = String(body.mechanicSignatureDataUrl ?? "").trim();
        if (!mechanicName) {
          throw new ForgeError("VALIDATION_FAILED", "Mechanic name is required.");
        }
        if (!mechanicSignatureDataUrl.startsWith("data:image/")) {
          throw new ForgeError("VALIDATION_FAILED", "Mechanic signature is required.");
        }
        nextPayload.defectsCorrected = corrected;
        nextPayload.defectsNeedNotBeCorrected = needNot;
        nextPayload.mechanicName = mechanicName;
        nextPayload.mechanicSignatureDataUrl = mechanicSignatureDataUrl;
        nextPayload.mechanicSignedAt =
          parseOptionalSignedAt(body, "mechanicSignedAt") ?? now.toISOString();
      } else if (action === "driver-review") {
        if (!payload.mechanicSignedAt && !payload.mechanicSignatureDataUrl) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Mechanic certification is required before driver review.",
          );
        }
        const driverReviewSignatureDataUrl = String(body.driverReviewSignatureDataUrl ?? "").trim();
        if (!driverReviewSignatureDataUrl.startsWith("data:image/")) {
          throw new ForgeError("VALIDATION_FAILED", "Driver review signature is required.");
        }
        nextPayload.driverReviewSignatureDataUrl = driverReviewSignatureDataUrl;
        nextPayload.driverReviewSignedAt =
          parseOptionalSignedAt(body, "driverReviewSignedAt") ?? now.toISOString();
      } else {
        throw new ForgeError("VALIDATION_FAILED", "Unknown DVIR certify action.");
      }

      const status =
        nextPayload.driverReviewSignedAt || nextPayload.driverReviewSignatureDataUrl
          ? "CLOSED"
          : "OPEN";

      const [row] = await tx
        .update(industrialDotComplianceRecords)
        .set({
          sourcePayload: nextPayload,
          status,
          updatedAt: now,
        } as never)
        .where(eq(industrialDotComplianceRecords.id, recordId))
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

  async completeCorrectiveAction(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
      },
      principal.userId,
    );
  }

  async updateDepartmentContact(
    principal: ForgePrincipal,
    departmentId: string,
    body: Record<string, unknown>,
  ) {
    const id = this.assertRecordId(departmentId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const contactPersonnelId = body.contactPersonnelId ? String(body.contactPersonnelId) : null;
        let contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
        let contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
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
      },
      principal.userId,
    );
  }

  async createInspectionAttachment(principal: ForgePrincipal, body: Record<string, unknown>) {
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
    return dedupeInspectionTemplates(out);
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
    const { page, pageSize, offset } = this.page(query, 2000);
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
      query.ppeTracked === "true" || query.ppeTracked === "1" || query.scope === "ppe-allowance";
    const firstAidTrackedOnly =
      query.firstAidTracked === "true" ||
      query.firstAidTracked === "1" ||
      query.scope === "first-aid";
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
      if (firstAidTrackedOnly) {
        conditions.push(
          or(
            eq(industrialPersonnel.tracksFirstAid, true),
            sql`${industrialPersonnel.cprCertificationExpiresDate} is not null`,
            sql`${industrialPersonnel.firstAidCertificationExpiresDate} is not null`,
          )!,
        );
      }
      if (status) conditions.push(personnelStatusMatches(status));
      if (siteId) conditions.push(eq(industrialPersonnel.siteId, siteId));
      if (q) {
        conditions.push(
          or(
            ilike(industrialPersonnel.displayName, `%${q}%`),
            ilike(industrialPersonnel.employeeNumber, `%${q}%`),
            ilike(industrialPersonnel.email, `%${q}%`),
            ilike(industrialPersonnel.lastName, `%${q}%`),
            ilike(industrialPersonnel.firstName, `%${q}%`),
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
      const personnelIds = items.map((r) => r.id);
      const driverDobRows =
        personnelIds.length > 0
          ? await tx
              .select({
                personnelId: industrialFleetDrivers.personnelId,
                dateOfBirth: industrialFleetDrivers.dateOfBirth,
              })
              .from(industrialFleetDrivers)
              .where(
                and(
                  eq(industrialFleetDrivers.tenantId, principal.tenantId),
                  inArray(industrialFleetDrivers.personnelId, personnelIds),
                  isNull(industrialFleetDrivers.archivedAt),
                ),
              )
          : [];
      const driverDobByPersonnel = new Map<string, string>();
      for (const row of driverDobRows) {
        const pid = row.personnelId?.trim();
        const dob = row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : "";
        if (pid && dob && !driverDobByPersonnel.has(pid)) driverDobByPersonnel.set(pid, dob);
      }
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
        items: items.map((r) => {
          const readValues = this.personnelReadValues(r as unknown as Record<string, unknown>);
          const columnDob =
            typeof readValues.dateOfBirth === "string" ? readValues.dateOfBirth.trim() : "";
          if (!columnDob) {
            const fromDriver = driverDobByPersonnel.get(r.id);
            if (fromDriver) readValues.dateOfBirth = fromDriver;
          }
          return this.mapListItem({
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
              ...readValues,
            },
          });
        }),
      };
    });
  }

  private async resolvePersonnelCertCopy(
    tx: DatabaseTransaction,
    tenantId: string,
    documentId: string | null | undefined,
  ): Promise<{
    documentId: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
  } | null> {
    const id = typeof documentId === "string" ? documentId.trim() : "";
    if (!id || !UUID_PATTERN.test(id)) return null;
    const [document] = await tx
      .select({
        id: forgeDocuments.id,
        originalFilename: forgeDocuments.originalFilename,
        mimeType: forgeDocuments.mimeType,
        fileSizeBytes: forgeDocuments.fileSizeBytes,
        uploadStatus: forgeDocuments.uploadStatus,
      })
      .from(forgeDocuments)
      .where(and(eq(forgeDocuments.id, id), eq(forgeDocuments.tenantId, tenantId)))
      .limit(1);
    if (!document || document.uploadStatus !== "COMPLETE") return null;
    return {
      documentId: document.id,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
    };
  }

  private async assertPersonnelCertDocument(
    tx: DatabaseTransaction,
    tenantId: string,
    documentId: string,
  ): Promise<string> {
    const meta = await this.resolvePersonnelCertCopy(tx, tenantId, documentId);
    if (!meta) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Certification document was not found or the upload is incomplete",
      );
    }
    return meta.documentId;
  }

  /** Optional UUID from a create/update body; empty string clears on update. */
  private optionalPersonnelDocumentId(raw: unknown): string | null | undefined {
    if (raw === undefined) return undefined;
    if (raw == null) return null;
    const text = String(raw).trim();
    if (text === "") return null;
    if (!UUID_PATTERN.test(text)) {
      throw new ForgeError("VALIDATION_FAILED", "Certification document id must be a UUID");
    }
    return text;
  }

  async getPersonnel(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const recordId = await this.resolvePersonnelRecordId(principal, id, tx);
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

      // Persist FKs for DQF / company-driver rows that share this employee #.
      await this.linkMatchingRecordsByEmployeeNumber(tx, principal.tenantId, recordId);

      const training = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(
          and(
            eq(industrialTrainingRecords.tenantId, principal.tenantId),
            eq(industrialTrainingRecords.personnelId, recordId),
            isNull(industrialTrainingRecords.archivedAt),
          ),
        )
        .orderBy(desc(industrialTrainingRecords.updatedAt))
        .limit(25);

      const normalizedPayload = this.normalizePersonnelPayload(
        this.unwrapSourcePayload(row.sourcePayload),
      );
      const readValues = this.personnelReadValues(row as unknown as Record<string, unknown>);
      const departmentName = await this.resolvePersonnelDepartmentName(
        tx,
        principal.tenantId,
        row.departmentId,
        typeof readValues.departmentName === "string" ? readValues.departmentName : null,
      );
      if (departmentName) readValues.departmentName = departmentName;
      const isDotDriver =
        readValues.isDotDriver === true ||
        normalizedPayload.isDotDriver === true ||
        normalizedPayload.isDotDriver === "true";

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

      const columnDob =
        typeof readValues.dateOfBirth === "string" ? readValues.dateOfBirth.trim() : "";
      if (!columnDob && linkedDriver?.dateOfBirth) {
        readValues.dateOfBirth = String(linkedDriver.dateOfBirth).slice(0, 10);
      }

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
      const dotPayload = linkedDot ? this.unwrapSourcePayload(linkedDot.sourcePayload) : null;
      const licenseProjection = await this.resolveLicenseDownloadUrls(
        tx,
        principal.tenantId,
        this.projectLicenseCopies({
          personnelPayload: { ...normalizedPayload, ...readValues },
          driverPayload,
          dotPayload,
          isDotDriver: !!isDotDriver || !!linkedDot,
        }),
      );
      // Audits are written on the company-driver row; also mirrored to personnel
      // when personnelId is set. Always merge both so the file shows history
      // even when only the driver payload was updated.
      const mvrAuditHistory = mergeMvrAuditHistories(
        normalizedPayload.mvrAuditHistory,
        driverPayload?.mvrAuditHistory,
      );
      const mvrUploads = driverPayload ? this.uploadList(driverPayload.mvrUploads) : [];
      const mvrReleaseUploads = driverPayload
        ? this.uploadList(driverPayload.mvrReleaseUploads)
        : [];
      const slimMvrFiles = (rows: Record<string, unknown>[]) =>
        rows
          .map((row) => {
            const documentId = String(row.documentId ?? "").trim();
            const name = String(
              row.name ?? row.fileName ?? row.originalFilename ?? "Document",
            ).trim();
            const uploadedAt = String(row.uploadedAt ?? "").trim();
            const contentType = String(row.contentType ?? row.mimeType ?? "").trim();
            if (!documentId && !name) return null;
            return {
              name: name || "Document",
              ...(documentId ? { documentId } : {}),
              ...(uploadedAt ? { uploadedAt } : {}),
              ...(contentType ? { contentType } : {}),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row != null);
      const companyDriverMvr = driverPayload
        ? {
            status: String(driverPayload.status ?? linkedDriver?.status ?? "").trim(),
            initialMvrDate: String(
              driverPayload.initialMvrDate ?? linkedDriver?.initialMvrDate ?? "",
            ).trim(),
            lastMvrDate: String(
              driverPayload.lastMvrDate ?? linkedDriver?.lastMvrDate ?? "",
            ).trim(),
            mvrReleaseDate: String(driverPayload.mvrReleaseDate ?? "").trim(),
            mvrUploadCount: mvrUploads.length,
            mvrReleaseUploadCount: mvrReleaseUploads.length,
            mvrFiles: slimMvrFiles(mvrUploads),
            mvrConsentFiles: slimMvrFiles(mvrReleaseUploads),
          }
        : null;

      const cprCertificationCopy = await this.resolvePersonnelCertCopy(
        tx,
        principal.tenantId,
        row.cprCertificationDocumentId,
      );
      const firstAidCertificationCopy = await this.resolvePersonnelCertCopy(
        tx,
        principal.tenantId,
        row.firstAidCertificationDocumentId,
      );

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
            mvrAuditHistory,
            companyDriverId: linkedDriver?.id ?? null,
            companyDriverMvr,
            dotRecordId: linkedDot?.id ?? null,
            cprCertificationDocumentId: row.cprCertificationDocumentId ?? null,
            firstAidCertificationDocumentId: row.firstAidCertificationDocumentId ?? null,
            cprCertificationCopy,
            firstAidCertificationCopy,
            archivedAt: row.archivedAt?.toISOString() ?? null,
          },
        }),
        archivedAt: row.archivedAt?.toISOString() ?? null,
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
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const recordId = await this.resolvePersonnelRecordId(principal, id, tx);
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
          ...(employeeNumber ? [sql`${sourcePayload}::text ilike ${`%${employeeNumber}%`}`] : []),
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

      const [
        incidents,
        observations,
        training,
        trainingAssignments,
        submissions,
        templates,
        workersComp,
        fleetDrivers,
        dot,
        forklifts,
        confined,
      ] = await Promise.all([
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
          .select({
            id: industrialObservations.id,
            title: industrialObservations.title,
            status: industrialObservations.status,
            createdAt: industrialObservations.createdAt,
            updatedAt: industrialObservations.updatedAt,
            sourcePayload: sql<unknown>`case when jsonb_typeof(${industrialObservations.sourcePayload}) = 'object'
                then ${industrialObservations.sourcePayload} - 'photos' - 'followUp' - 'followUpTokens' - 'emailLog'
                else ${industrialObservations.sourcePayload} end`,
          })
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
          .select({
            id: industrialTrainingAssignmentAssignees.id,
            status: industrialTrainingAssignmentAssignees.status,
            bestPercent: industrialTrainingAssignmentAssignees.bestPercent,
            completedAt: industrialTrainingAssignmentAssignees.completedAt,
            updatedAt: industrialTrainingAssignmentAssignees.updatedAt,
            assignmentId: industrialTrainingAssignmentAssignees.assignmentId,
            title: industrialTrainingAssignments.title,
            dueAt: industrialTrainingAssignments.dueAt,
          })
          .from(industrialTrainingAssignmentAssignees)
          .innerJoin(
            industrialTrainingAssignments,
            eq(
              industrialTrainingAssignmentAssignees.assignmentId,
              industrialTrainingAssignments.id,
            ),
          )
          .where(
            and(
              eq(industrialTrainingAssignmentAssignees.tenantId, principal.tenantId),
              eq(industrialTrainingAssignmentAssignees.personnelId, recordId),
              isNull(industrialTrainingAssignments.archivedAt),
              eq(industrialTrainingAssignments.status, "ACTIVE"),
            ),
          )
          .orderBy(desc(industrialTrainingAssignmentAssignees.updatedAt))
          .limit(50),
        tx
          .select()
          .from(industrialFormSubmissions)
          .where(
            and(
              eq(industrialFormSubmissions.tenantId, principal.tenantId),
              isNull(industrialFormSubmissions.archivedAt),
            ),
          )
          .orderBy(desc(industrialFormSubmissions.updatedAt))
          .limit(200),
        Promise.resolve(
          [] as Array<{
            id: string;
            title: string | null;
            status: string;
            updatedAt: Date;
          }>,
        ),
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
        const categoryRaw = String(
          payload.category ?? payload.incidentCategory ?? "injuries",
        ).toLowerCase();
        const tab =
          categoryRaw === "near-misses" ||
          categoryRaw === "medical-refusals" ||
          categoryRaw === "drug-alcohol" ||
          categoryRaw === "property-damage" ||
          categoryRaw === "automotive"
            ? categoryRaw
            : "injuries";
        const params = new URLSearchParams({ tab, incident: r.id });
        return {
          id: r.id,
          module: "incidents",
          label: (r.title && r.title.trim()) || "Incident",
          date:
            typeof payload.dateOccurred === "string"
              ? payload.dateOccurred
              : typeof payload.IncidentDateTime === "string"
                ? payload.IncidentDateTime
                : r.updatedAt.toISOString(),
          status: r.status,
          href: `/modules/incidents/?${params.toString()}`,
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

      // Score: unsafe observations where this person is marked at fault, plus
      // credit for positive observations of them and observations they reported.
      const nameKey = displayName.toLowerCase();
      const unsafeAtFault: Array<{ riskLevel: unknown; status: unknown; at: string }> = [];
      let positiveObservationCount = 0;
      for (const r of observations) {
        const payload = this.unwrapSourcePayload(r.sourcePayload);
        const me = normalizeObservedPeople(payload.peopleObserved).find((p) =>
          p.personnelId
            ? p.personnelId === recordId
            : Boolean(nameKey) && p.name.toLowerCase() === nameKey,
        );
        const at =
          (typeof payload.observedAt === "string" && payload.observedAt) ||
          r.createdAt.toISOString();
        if (isPositiveObservationType(payload.observationType)) {
          if (me) positiveObservationCount += 1;
        } else if (me && observedPersonAtFault(me, payload.observationType)) {
          unsafeAtFault.push({ riskLevel: payload.riskLevel, status: r.status, at });
        }
        const reporter =
          typeof payload.reportedBy === "string" ? payload.reportedBy.trim().toLowerCase() : "";
        if (nameKey && reporter === nameKey && !me) positiveObservationCount += 1;
      }

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

      const trainingAssignmentItems = trainingAssignments.map((row) => ({
        id: row.assignmentId,
        module: "training",
        label: `Assignment · ${(row.title && row.title.trim()) || "Training assignment"}`,
        date: row.completedAt?.toISOString() ?? row.updatedAt.toISOString(),
        status: row.status,
        href: `/modules/training/?q=${encodeURIComponent((row.title && row.title.trim()) || row.assignmentId)}`,
      }));

      const combinedTrainingItems = [...trainingAssignmentItems, ...trainingItems].sort((a, b) =>
        b.date.localeCompare(a.date),
      );

      // Only forms that identify this person as the subject — not ones they
      // signed, submitted, or are mentioned on as supervisor/witness.
      const subjectPerson = {
        id: recordId,
        employeeNumber,
        displayName,
      };
      const ownedSubmissions = submissions.filter((r) =>
        formSubmissionBelongsToPerson(
          { answers: r.answers, sourcePayload: r.sourcePayload },
          subjectPerson,
        ),
      );

      const submissionItems = ownedSubmissions.map((r) => {
        const formId = (r.formDefinitionId ?? "").trim();
        const params = new URLSearchParams({ tab: "fill", submission: r.id });
        if (formId) params.set("form", formId);
        return {
          id: r.id,
          module: "forms",
          label: (r.title && r.title.trim()) || "Form submission",
          date: r.submittedAt?.toISOString() ?? r.updatedAt.toISOString(),
          status: r.status,
          href: `/modules/forms/?${params.toString()}`,
        };
      });

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

      const workersCompItems = workersComp.map((r) => ({
        id: r.id,
        module: "workers-comp",
        label: (r.caseNumber && r.caseNumber.trim()) || "Workers' comp case",
        date: r.reportedAt?.toISOString() ?? r.updatedAt.toISOString(),
        status: r.status,
        href: `/modules/workers-comp/?view=cases&id=${encodeURIComponent(r.id)}`,
      }));

      const completedTraining = training.filter((t) => {
        const s = t.status.toLowerCase();
        return s.includes("complete") || Boolean(t.completedAt);
      });
      const completedAssignments = trainingAssignments.filter((t) => t.status === "PASSED");
      const inProgressTraining = training.filter((t) => {
        const s = t.status.toLowerCase();
        return s.includes("progress") || s === "active" || s === "enrolled";
      });
      const openAssignments = trainingAssignments.filter(
        (t) => t.status === "NOT_STARTED" || t.status === "IN_PROGRESS" || t.status === "FAILED",
      );
      const inProgressAssignments = trainingAssignments.filter(
        (t) => t.status === "IN_PROGRESS" || t.status === "NOT_STARTED",
      );
      const overdueTraining = training.filter(
        (t) =>
          inProgressTraining.some((p) => p.id === t.id) &&
          isPast(t.expiresAt?.toISOString() ?? null),
      );
      const overdueAssignments = openAssignments.filter((t) =>
        isPast(t.dueAt?.toISOString() ?? null),
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
        ...trainingAssignmentItems,
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
            return (
              s.includes("submit") ||
              s === "complete" ||
              s === "completed" ||
              s === "pending_signature"
            );
          }).length,
          drafts: submissionItems.filter((i) => i.status.toLowerCase().includes("draft")).length,
          lastDate: latest(submissionItems.map((i) => i.date)),
          templates: templateItems,
          submissions: submissionItems,
        },
        training: {
          enrollments: combinedTrainingItems.length,
          completed: completedTraining.length + completedAssignments.length,
          inProgress: inProgressTraining.length + inProgressAssignments.length,
          overdue: overdueTraining.length + overdueAssignments.length,
          openAssignments: openAssignments.length,
          certificates: certificates.length,
          expiringCertificates: expiringCertificates.length,
          lastActivityDate: latest(combinedTrainingItems.map((i) => i.date)),
          items: combinedTrainingItems,
        },
        qualifications: {
          total: qualificationItems.length,
          active: qualificationItems.filter((i) => !i.status.toLowerCase().includes("expir"))
            .length,
          expiringSoon: qualificationItems.filter((i) => i.status.toLowerCase().includes("expir"))
            .length,
          expired: qualificationItems.filter((i) => i.status.toLowerCase() === "expired").length,
          items: qualificationItems,
        },
        workersComp: {
          total: workersCompItems.length,
          open: workersCompItems.filter((i) => isOpenWcStatus(i.status)).length,
          lastDate: latest(workersCompItems.map((i) => i.date)),
          items: workersCompItems,
        },
        scanActivity: {
          completions: 0,
          lastDate: null as string | null,
          items: [] as typeof trainingItems,
        },
        recentActivity,
      };

      const observationImpact = computeObservationScoreImpact({
        unsafe: unsafeAtFault,
        positiveCount: positiveObservationCount,
        incidentDates: incidentItems.filter((i) => i.role === "subject").map((i) => i.date),
      });

      const disciplineRows = await tx
        .select({
          actionType: industrialPersonnelDisciplinaryActions.actionType,
          status: industrialPersonnelDisciplinaryActions.status,
          points: industrialPersonnelDisciplinaryActions.points,
          actionDate: industrialPersonnelDisciplinaryActions.actionDate,
        })
        .from(industrialPersonnelDisciplinaryActions)
        .where(
          and(
            eq(industrialPersonnelDisciplinaryActions.tenantId, principal.tenantId),
            eq(industrialPersonnelDisciplinaryActions.personnelId, recordId),
            isNull(industrialPersonnelDisciplinaryActions.archivedAt),
          ),
        );
      const disciplineImpact = computeDisciplineScoreImpact(disciplineRows);

      let safetyScore = 100;
      safetyScore -= body.incidents.open * 12;
      safetyScore -= body.incidents.recordable * 8;
      safetyScore -= body.training.overdue * 6;
      safetyScore -= body.qualifications.expired * 5;
      safetyScore -= body.qualifications.expiringSoon * 2;
      safetyScore -= body.workersComp.open * 4;
      safetyScore += Math.min(body.training.completed * 2, 10);
      safetyScore += observationImpact.credit - observationImpact.deduction;
      safetyScore -= disciplineImpact.deduction;
      safetyScore = Math.max(0, Math.min(100, Math.round(safetyScore)));

      return {
        personId: recordId,
        safetyScore,
        searchHint,
        ...body,
        observations: { ...body.observations, scoreImpact: observationImpact },
        ...(this.canViewDiscipline(principal) ? { discipline: disciplineImpact } : {}),
      };
    });
  }

  private canViewDiscipline(principal: ForgePrincipal) {
    return (
      principal.permissions.has("industrial.personnel.discipline.view") ||
      principal.permissions.has("industrial.personnel.discipline.manage") ||
      principal.permissions.has("industrial.admin")
    );
  }

  private mapDisciplinaryAction(row: typeof industrialPersonnelDisciplinaryActions.$inferSelect) {
    return {
      id: row.id,
      personnelId: row.personnelId,
      actionType: row.actionType,
      actionTypeLabel: disciplinaryActionType(row.actionType)?.label ?? row.actionType,
      category: row.category,
      actionDate: row.actionDate,
      reason: row.reason,
      details: row.details,
      issuedByName: row.issuedByName,
      points: disciplinePoints(row),
      countsUntil: disciplineCountsUntil(row.actionDate),
      status: row.status,
      countingAgainstScore: isDisciplineCounting(row),
      attachments: readDisciplineAttachments(row.attachments),
      rescindedAt: row.rescindedAt?.toISOString() ?? null,
      rescindedReason: row.rescindedReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private disciplinaryActionAsInput(
    row: typeof industrialPersonnelDisciplinaryActions.$inferSelect,
  ): DisciplinaryActionInput {
    return normalizeDisciplinaryActionInput({
      actionType: row.actionType,
      category: row.category,
      actionDate: row.actionDate,
      reason: row.reason,
      details: row.details ?? "",
      issuedByName: row.issuedByName ?? "",
    });
  }

  private async loadDisciplinaryAction(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
  ) {
    const [row] = await tx
      .select()
      .from(industrialPersonnelDisciplinaryActions)
      .where(
        and(
          eq(industrialPersonnelDisciplinaryActions.id, this.assertRecordId(actionId)),
          eq(industrialPersonnelDisciplinaryActions.tenantId, principal.tenantId),
          eq(industrialPersonnelDisciplinaryActions.personnelId, personnelId),
          isNull(industrialPersonnelDisciplinaryActions.archivedAt),
        ),
      )
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "Disciplinary action not found");
    return row;
  }

  private async auditDiscipline(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    action: string,
    resourceId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    if (!this.audit) return;
    await this.audit.writeInTransaction(tx, {
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      actorPersonId: principal.personId,
      actorType: "USER",
      action,
      resourceType: "industrial_personnel_disciplinary_actions",
      resourceId,
      result: "SUCCESS",
      riskLevel: "HIGH",
      correlationId: "",
      requestId: "",
      before,
      after,
    });
  }

  async listPersonnelDisciplinaryActions(principal: ForgePrincipal, personnelId: string) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const recordId = await this.resolvePersonnelRecordId(principal, personnelId, tx);
      const rows = await tx
        .select()
        .from(industrialPersonnelDisciplinaryActions)
        .where(
          and(
            eq(industrialPersonnelDisciplinaryActions.tenantId, principal.tenantId),
            eq(industrialPersonnelDisciplinaryActions.personnelId, recordId),
            isNull(industrialPersonnelDisciplinaryActions.archivedAt),
          ),
        )
        .orderBy(
          desc(industrialPersonnelDisciplinaryActions.actionDate),
          desc(industrialPersonnelDisciplinaryActions.createdAt),
        );
      return {
        personnelId: recordId,
        impact: computeDisciplineScoreImpact(rows),
        items: rows.map((row) => this.mapDisciplinaryAction(row)),
      };
    });
  }

  async createPersonnelDisciplinaryAction(
    principal: ForgePrincipal,
    personnelId: string,
    body: Record<string, unknown>,
  ) {
    const input = normalizeDisciplinaryActionInput(body);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const recordId = await this.resolvePersonnelRecordId(principal, personnelId, tx);
        const now = new Date();
        const [row] = await tx
          .insert(industrialPersonnelDisciplinaryActions)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            personnelId: recordId,
            ...input,
            status: "ACTIVE",
            createdByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const mapped = this.mapDisciplinaryAction(row!);
        await this.auditDiscipline(
          tx,
          principal,
          "industrial.personnel.discipline.create",
          row!.id,
          null,
          mapped,
        );
        return mapped;
      },
      principal.userId,
    );
  }

  async updatePersonnelDisciplinaryAction(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    body: Record<string, unknown>,
  ) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const recordId = await this.resolvePersonnelRecordId(principal, personnelId, tx);
        const existing = await this.loadDisciplinaryAction(tx, principal, recordId, actionId);
        if (existing.status !== "ACTIVE") {
          throw new ForgeError("VALIDATION_FAILED", "Rescinded actions cannot be edited");
        }
        const input = normalizeDisciplinaryActionInput(
          body,
          this.disciplinaryActionAsInput(existing),
        );
        const [row] = await tx
          .update(industrialPersonnelDisciplinaryActions)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(industrialPersonnelDisciplinaryActions.id, existing.id))
          .returning();
        const mapped = this.mapDisciplinaryAction(row!);
        await this.auditDiscipline(
          tx,
          principal,
          "industrial.personnel.discipline.update",
          existing.id,
          this.mapDisciplinaryAction(existing),
          mapped,
        );
        return mapped;
      },
      principal.userId,
    );
  }

  async rescindPersonnelDisciplinaryAction(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    body: Record<string, unknown>,
  ) {
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      throw new ForgeError("VALIDATION_FAILED", "A reason for rescinding is required");
    }
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const recordId = await this.resolvePersonnelRecordId(principal, personnelId, tx);
        const existing = await this.loadDisciplinaryAction(tx, principal, recordId, actionId);
        if (existing.status === "RESCINDED") {
          return this.mapDisciplinaryAction(existing);
        }
        const now = new Date();
        const [row] = await tx
          .update(industrialPersonnelDisciplinaryActions)
          .set({
            status: "RESCINDED",
            rescindedAt: now,
            rescindedReason: reason.slice(0, 4000),
            rescindedByUserId: principal.userId,
            updatedAt: now,
          })
          .where(eq(industrialPersonnelDisciplinaryActions.id, existing.id))
          .returning();
        const mapped = this.mapDisciplinaryAction(row!);
        await this.auditDiscipline(
          tx,
          principal,
          "industrial.personnel.discipline.rescind",
          existing.id,
          this.mapDisciplinaryAction(existing),
          mapped,
        );
        return mapped;
      },
      principal.userId,
    );
  }

  async createPersonnel(principal: ForgePrincipal, body: Record<string, unknown>) {
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    if (!firstName || !lastName) {
      throw new ForgeError("VALIDATION_FAILED", "First name and last name are required.");
    }
    const displayName = String(body.displayName ?? "").trim() || `${firstName} ${lastName}`.trim();
    const status = normalizePersonnelStatus(String(body.status ?? "ACTIVE"));
    const mapped = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const now = new Date();
      const departmentId = body.departmentId ? String(body.departmentId) : null;
      const insertValues = this.personnelInsertValues(body);
      await this.applyProducersDotDriverCompanyRule(tx, principal.tenantId, insertValues);
      const departmentName = await this.resolvePersonnelDepartmentName(
        tx,
        principal.tenantId,
        departmentId,
        typeof insertValues.departmentName === "string" ? insertValues.departmentName : null,
      );
      const cprDocId = this.optionalPersonnelDocumentId(body.cprCertificationDocumentId);
      const firstAidDocId = this.optionalPersonnelDocumentId(body.firstAidCertificationDocumentId);
      if (cprDocId) {
        await this.assertPersonnelCertDocument(tx, principal.tenantId, cprDocId);
      }
      if (firstAidDocId) {
        await this.assertPersonnelCertDocument(tx, principal.tenantId, firstAidDocId);
      }
      const [row] = await tx
        .insert(industrialPersonnel)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          firstName,
          lastName,
          displayName,
          email: body.email ? String(body.email) : null,
          employeeNumber: this.normalizeEmployeeNumberInput(body.employeeNumber),
          siteId: body.siteId ? String(body.siteId) : null,
          departmentId,
          positionId: body.positionId ? String(body.positionId) : null,
          ...insertValues,
          departmentName,
          ...(cprDocId ? { cprCertificationDocumentId: cprDocId } : {}),
          ...(firstAidDocId ? { firstAidCertificationDocumentId: firstAidDocId } : {}),
          status,
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        } as never)
        .returning();
      if (insertValues.isCompanyDriver) {
        await ensureCompanyDriverRosterEntry(tx, principal.tenantId, {
          personnelId: row!.id,
          driverName: displayName,
          siteId: row!.siteId,
          employeeNumber: row!.employeeNumber,
          seededFrom: "personnel_is_company_driver",
        });
      }
      await this.linkMatchingRecordsByEmployeeNumber(tx, principal.tenantId, String(row!.id));
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
    await this.notifyCompanyDriverMvrConsentIfNeeded(principal, String(mapped.id));
    return mapped;
  }

  async updatePersonnel(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    const mapped = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
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
      const departmentId = optionalUuid(body.departmentId, existing.departmentId);
      const updateValues = this.personnelUpdateValues(
        body,
        existing as unknown as Record<string, unknown>,
      );
      await this.applyProducersDotDriverCompanyRule(tx, principal.tenantId, updateValues);
      updateValues.departmentName = await this.resolvePersonnelDepartmentName(
        tx,
        principal.tenantId,
        departmentId,
        typeof updateValues.departmentName === "string" ? updateValues.departmentName : null,
      );
      const cprDocId = this.optionalPersonnelDocumentId(body.cprCertificationDocumentId);
      const firstAidDocId = this.optionalPersonnelDocumentId(body.firstAidCertificationDocumentId);
      if (cprDocId) {
        await this.assertPersonnelCertDocument(tx, principal.tenantId, cprDocId);
      }
      if (firstAidDocId) {
        await this.assertPersonnelCertDocument(tx, principal.tenantId, firstAidDocId);
      }
      const nextStatusRaw =
        body.status != null ? String(body.status) : String(existing.status ?? "");
      const nextStatusNormalized = normalizePersonnelStatus(nextStatusRaw);
      const nextStatusLower = nextStatusNormalized.toLowerCase();
      const nextArchivedAt = (() => {
        if (
          nextStatusLower === "inactive" ||
          nextStatusLower === "terminated" ||
          nextStatusLower === "archived"
        ) {
          return existing.archivedAt ?? now;
        }
        if (nextStatusNormalized.startsWith("ACTIVE") || nextStatusLower === "leave") {
          return null;
        }
        return existing.archivedAt;
      })();
      const personInactiveForDqf =
        nextArchivedAt != null ||
        nextStatusLower === "inactive" ||
        nextStatusLower === "terminated" ||
        nextStatusLower === "archived";
      if (personInactiveForDqf) {
        updateValues.isDotDriver = false;
      }
      const [row] = await tx
        .update(industrialPersonnel)
        .set({
          firstName,
          lastName,
          displayName,
          email: body.email != null ? String(body.email) : existing.email,
          employeeNumber:
            body.employeeNumber != null
              ? this.normalizeEmployeeNumberInput(body.employeeNumber)
              : existing.employeeNumber,
          status:
            body.status != null ? normalizePersonnelStatus(String(body.status)) : existing.status,
          siteId: optionalUuid(body.siteId, existing.siteId),
          departmentId,
          positionId: optionalUuid(body.positionId, existing.positionId),
          ...updateValues,
          ...(cprDocId !== undefined ? { cprCertificationDocumentId: cprDocId } : {}),
          ...(firstAidDocId !== undefined
            ? { firstAidCertificationDocumentId: firstAidDocId }
            : {}),
          // Unwrap first — imported tenants often store source_payload as a
          // JSON string; spreading a string would destroy mvrAuditHistory.
          sourcePayload: { ...this.unwrapSourcePayload(existing.sourcePayload), ...body },
          updatedAt: now,
          archivedAt: nextArchivedAt,
        })
        .where(eq(industrialPersonnel.id, recordId))
        .returning();

      if (updateValues.isCompanyDriver) {
        await ensureCompanyDriverRosterEntry(tx, principal.tenantId, {
          personnelId: recordId,
          driverName: displayName,
          siteId: row!.siteId,
          employeeNumber: row!.employeeNumber,
          seededFrom: "personnel_is_company_driver",
        });
      } else {
        await this.syncCompanyDriverRosterForPersonnel(tx, principal.tenantId, recordId, false);
      }

      const nextIsDotDriver = Boolean(updateValues.isDotDriver);
      const wasDotDriver = Boolean((existing as { isDotDriver?: boolean | null }).isDotDriver);
      if (personInactiveForDqf) {
        await this.syncLinkedDotDqfArchiveForPersonnel(
          tx,
          principal.tenantId,
          recordId,
          false,
          "personnel_terminated_or_archived",
        );
      } else if (nextIsDotDriver !== wasDotDriver) {
        await this.syncLinkedDotDqfArchiveForPersonnel(
          tx,
          principal.tenantId,
          recordId,
          nextIsDotDriver,
        );
      }

      await this.linkMatchingRecordsByEmployeeNumber(tx, principal.tenantId, recordId);

      // Keep company-driver roster + linked DQF license copies in sync.
      const licenseTouched =
        Object.prototype.hasOwnProperty.call(body, "licenseFrontUrl") ||
        Object.prototype.hasOwnProperty.call(body, "licenseBackUrl") ||
        Object.prototype.hasOwnProperty.call(body, "licenseFrontUpload") ||
        Object.prototype.hasOwnProperty.call(body, "licenseBackUpload");
      if (licenseTouched) {
        const personPayload = this.unwrapSourcePayload(row!.sourcePayload);
        const frontUpload = body.licenseFrontUpload ?? personPayload.licenseFrontUpload;
        const backUpload = body.licenseBackUpload ?? personPayload.licenseBackUpload;

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
            nextPayload.licenseFrontUrl = "";
          } else if (typeof body.licenseFrontUrl === "string") {
            const front = String(body.licenseFrontUrl).trim();
            if (UUID_PATTERN.test(front)) {
              nextPayload.licenseFrontUpload = {
                documentId: front,
                fileName: "drivers-license-front.jpg",
                contentType: "image/jpeg",
                uploadedAt: now.toISOString(),
              };
              nextPayload.licenseFrontUrl = "";
            } else {
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
          }
          if (Object.prototype.hasOwnProperty.call(body, "licenseBackUpload")) {
            nextPayload.licenseBackUpload = body.licenseBackUpload;
            nextPayload.licenseBackUrl = "";
          } else if (typeof body.licenseBackUrl === "string") {
            const back = String(body.licenseBackUrl).trim();
            if (UUID_PATTERN.test(back)) {
              nextPayload.licenseBackUpload = {
                documentId: back,
                fileName: "drivers-license-back.jpg",
                contentType: "image/jpeg",
                uploadedAt: now.toISOString(),
              };
              nextPayload.licenseBackUrl = "";
            } else {
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
          }
          await tx
            .update(industrialFleetDrivers)
            .set({ sourcePayload: nextPayload, updatedAt: now })
            .where(eq(industrialFleetDrivers.id, linkedDriver.id));
        }

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
        if (linkedDot) {
          const dotPayload = this.unwrapSourcePayload(linkedDot.sourcePayload);
          const details =
            dotPayload.details &&
            typeof dotPayload.details === "object" &&
            !Array.isArray(dotPayload.details)
              ? { ...(dotPayload.details as Record<string, unknown>) }
              : {};
          const nextDot: Record<string, unknown> = { ...dotPayload };
          const asMeta = (raw: unknown, side: "front" | "back") => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
            const entry = raw as Record<string, unknown>;
            const documentId = String(entry.documentId ?? "").trim();
            if (!UUID_PATTERN.test(documentId)) return null;
            return {
              name: String(entry.name ?? entry.fileName ?? `drivers-license-${side}.jpg`),
              documentId,
              contentType: String(entry.contentType ?? entry.mimeType ?? "image/jpeg"),
              uploadedAt: String(entry.uploadedAt ?? now.toISOString()),
            };
          };
          const frontMeta = asMeta(frontUpload, "front");
          const backMeta = asMeta(backUpload, "back");
          if (frontMeta) {
            nextDot.licenseFrontUpload = frontMeta;
            nextDot.driversLicenseCopy = [frontMeta];
            details.driversLicenseCopy = JSON.stringify([frontMeta]);
            nextDot.licenseFrontUrl = "";
          }
          if (backMeta) {
            nextDot.licenseBackUpload = backMeta;
            nextDot.driversLicenseBack = backMeta;
            details.driversLicenseBack = JSON.stringify([backMeta]);
            nextDot.licenseBackUrl = "";
          }
          if (frontMeta || backMeta) {
            nextDot.details = details;
            await tx
              .update(industrialDotComplianceRecords)
              .set({ sourcePayload: nextDot, updatedAt: now })
              .where(eq(industrialDotComplianceRecords.id, linkedDot.id));
          }
        }
      }

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
    await this.notifyCompanyDriverMvrConsentIfNeeded(principal, String(mapped.id));
    return mapped;
  }

  /**
   * Record explicit Emergency Alerts SMS opt-in on the personnel file.
   * SMS Notification number is the personnel `phone` column.
   */
  async authorizePersonnelSms(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
        const phone = String(existing.phone ?? "").trim();
        if (!phone) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Add a phone number on the personnel file before authorizing SMS. That phone is the SMS Notification number.",
          );
        }
        const digits = phone.replace(/\D/g, "");
        const normalized =
          digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
        if (normalized.length < 10) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "The personnel phone number is not a valid SMS Notification number.",
          );
        }
        const now = new Date();
        const [row] = await tx
          .update(industrialPersonnel)
          .set({
            smsAuthorizedAt: now,
            smsAuthorizedByUserId: principal.userId,
            smsOptedOutAt: null,
            updatedAt: now,
          })
          .where(eq(industrialPersonnel.id, recordId))
          .returning();
        await tx.insert(industrialPersonnelSmsConsents).values({
          id: createId(),
          tenantId: principal.tenantId,
          personnelId: recordId,
          action: "AUTHORIZED",
          method: "ADMIN",
          phoneNumber: phone,
          consentText: EMERGENCY_SMS_CONSENT_TEXT,
          consentVersion: EMERGENCY_SMS_CONSENT_VERSION,
          employeeNumber: existing.employeeNumber ?? null,
          actorUserId: principal.userId,
          createdAt: now,
        });
        return this.mapListItem({
          id: row!.id,
          displayName: row!.displayName,
          status: row!.status,
          createdAt: row!.createdAt,
          updatedAt: row!.updatedAt,
          sourcePayload: row!.sourcePayload,
          extra: this.personnelReadValues(row as unknown as Record<string, unknown>),
        });
      },
      principal.userId,
    );
  }

  /** Clear SMS authorization (admin revoke). Does not change the phone number. */
  async revokePersonnelSmsAuthorization(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
        const [row] = await tx
          .update(industrialPersonnel)
          .set({
            smsAuthorizedAt: null,
            smsAuthorizedByUserId: null,
            updatedAt: now,
          })
          .where(eq(industrialPersonnel.id, recordId))
          .returning();
        await tx.insert(industrialPersonnelSmsConsents).values({
          id: createId(),
          tenantId: principal.tenantId,
          personnelId: recordId,
          action: "REVOKED",
          method: "ADMIN",
          phoneNumber: String(existing.phone ?? "").trim() || null,
          employeeNumber: existing.employeeNumber ?? null,
          actorUserId: principal.userId,
          createdAt: now,
        });
        return this.mapListItem({
          id: row!.id,
          displayName: row!.displayName,
          status: row!.status,
          createdAt: row!.createdAt,
          updatedAt: row!.updatedAt,
          sourcePayload: row!.sourcePayload,
          extra: this.personnelReadValues(row as unknown as Record<string, unknown>),
        });
      },
      principal.userId,
    );
  }

  /** Signed Emergency Alerts SMS consent history for one personnel file, newest first. */
  async listPersonnelSmsConsents(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select({
            id: industrialPersonnelSmsConsents.id,
            action: industrialPersonnelSmsConsents.action,
            method: industrialPersonnelSmsConsents.method,
            phoneNumber: industrialPersonnelSmsConsents.phoneNumber,
            previousPhoneNumber: industrialPersonnelSmsConsents.previousPhoneNumber,
            consentText: industrialPersonnelSmsConsents.consentText,
            consentVersion: industrialPersonnelSmsConsents.consentVersion,
            signatureName: industrialPersonnelSmsConsents.signatureName,
            employeeNumber: industrialPersonnelSmsConsents.employeeNumber,
            qrLinkId: industrialPersonnelSmsConsents.qrLinkId,
            ipAddress: industrialPersonnelSmsConsents.ipAddress,
            userAgent: industrialPersonnelSmsConsents.userAgent,
            createdAt: industrialPersonnelSmsConsents.createdAt,
            actorEmail: users.primaryEmail,
          })
          .from(industrialPersonnelSmsConsents)
          .leftJoin(users, eq(users.id, industrialPersonnelSmsConsents.actorUserId))
          .where(
            and(
              eq(industrialPersonnelSmsConsents.tenantId, principal.tenantId),
              eq(industrialPersonnelSmsConsents.personnelId, recordId),
            ),
          )
          .orderBy(desc(industrialPersonnelSmsConsents.createdAt))
          .limit(200);
        return {
          items: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          })),
        };
      },
      principal.userId,
    );
  }

  async archivePersonnel(principal: ForgePrincipal, id: string) {
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
      if (existing.archivedAt) {
        return this.mapListItem({
          id: existing.id,
          displayName: existing.displayName,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          sourcePayload: existing.sourcePayload,
          extra: this.personnelReadValues(existing as unknown as Record<string, unknown>),
        });
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialPersonnel)
        .set({
          status: "INACTIVE",
          isDotDriver: false,
          archivedAt: now,
          updatedAt: now,
          sourcePayload: {
            ...this.unwrapSourcePayload(existing.sourcePayload),
            archivedReason: "manual_archive",
            archivedAt: now.toISOString(),
          },
        })
        .where(eq(industrialPersonnel.id, recordId))
        .returning();
      await this.syncLinkedDotDqfArchiveForPersonnel(
        tx,
        principal.tenantId,
        recordId,
        false,
        "personnel_terminated_or_archived",
      );
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

  async unarchivePersonnel(principal: ForgePrincipal, id: string) {
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
      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const nextPayload = { ...payload };
      delete nextPayload.archivedReason;
      delete nextPayload.archivedAt;
      const [row] = await tx
        .update(industrialPersonnel)
        .set({
          status: "ACTIVE",
          archivedAt: null,
          updatedAt: now,
          sourcePayload: nextPayload,
        })
        .where(eq(industrialPersonnel.id, recordId))
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

  private mapCompanyVehicleDriverListItem(
    row: {
      id: string;
      personnelId?: string | null;
      personnelName?: string | null;
      employeeNumber?: string | null;
      licenseNumber?: string | null;
      licenseState?: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      sourcePayload?: unknown;
    },
    personnelLinkIndex: { byLegacyId: Map<string, string>; byEmployee: Map<string, string> },
  ) {
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const licenseExpiryDate = String(
      payload.licenseExpiryDate ?? payload.licenseExpiry ?? payload.license_expiry_date ?? "",
    ).trim();
    const personnelName = String(row.personnelName ?? payload.personnelName ?? "").trim();
    const employeeNumber = String(row.employeeNumber ?? payload.employeeNumber ?? "").trim();
    const driverStatus = String(payload.status ?? row.status ?? "").trim();
    const mvrUploads = this.uploadList(payload.mvrUploads);
    const mvrReleaseUploads = this.uploadList(payload.mvrReleaseUploads);
    const sampleYear = Number(payload.sampleYear);
    const resolvedPersonnelId = this.resolvePersonnelIdFromDriverRow(
      {
        personnelId: row.personnelId ?? null,
        employeeNumber: row.employeeNumber ?? null,
      },
      payload,
      personnelLinkIndex,
    );
    return {
      id: row.id,
      personnelId: resolvedPersonnelId,
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
  }

  private companyVehicleDriverSummaryFromMapped(
    mapped: Array<{
      status: string;
      licenseExpiryDate: string;
      mvrUploadCount: number;
      mvrReleaseDate: string;
      mvrReleaseUploadCount: number;
      sampleYear: number | null;
      sampleCompletedAt: string;
    }>,
  ) {
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
      missingMvrConsent: notRemoved.filter(
        (item) => item.mvrReleaseDate === "" && item.mvrReleaseUploadCount === 0,
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
    return summary;
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
      const baseConditions = [
        eq(industrialFleetDrivers.tenantId, principal.tenantId),
        isNull(industrialFleetDrivers.archivedAt),
      ];
      const payloadStatusExpr = sql`lower(coalesce(
        nullif(btrim(
          case
            when jsonb_typeof(${industrialFleetDrivers.sourcePayload}) = 'string'
              then ((${industrialFleetDrivers.sourcePayload} #>> '{}')::jsonb ->> 'status')
            else ${industrialFleetDrivers.sourcePayload} ->> 'status'
          end
        ), ''),
        ${industrialFleetDrivers.status}
      ))`;
      const listConditions = [...baseConditions];
      if (status) {
        listConditions.push(sql`${payloadStatusExpr} = ${status}`);
      }
      if (q) {
        const like = `%${q}%`;
        listConditions.push(
          or(
            sql`lower(coalesce(${industrialFleetDrivers.personnelName}, '')) like ${like}`,
            sql`lower(coalesce(${industrialFleetDrivers.employeeNumber}, '')) like ${like}`,
            sql`lower(coalesce(${industrialFleetDrivers.licenseNumber}, '')) like ${like}`,
          )!,
        );
      }

      const countRows = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(industrialFleetDrivers)
        .where(and(...listConditions));
      const total = countRows[0]?.total ?? 0;

      const pageRows = await tx
        .select({
          id: industrialFleetDrivers.id,
          personnelId: industrialFleetDrivers.personnelId,
          personnelName: industrialFleetDrivers.personnelName,
          employeeNumber: industrialFleetDrivers.employeeNumber,
          licenseNumber: industrialFleetDrivers.licenseNumber,
          licenseState: industrialFleetDrivers.licenseState,
          status: industrialFleetDrivers.status,
          createdAt: industrialFleetDrivers.createdAt,
          updatedAt: industrialFleetDrivers.updatedAt,
          sourcePayload: this.slimJsonbPayloadExpr(industrialFleetDrivers.sourcePayload),
        })
        .from(industrialFleetDrivers)
        .where(and(...listConditions))
        .orderBy(desc(industrialFleetDrivers.updatedAt))
        .limit(pageSize)
        .offset(offset);

      const personnelLinkIndex = await this.loadPersonnelLinkIndex(tx, principal.tenantId);
      const items = pageRows.map((row) =>
        this.mapCompanyVehicleDriverListItem(row, personnelLinkIndex),
      );

      // Summary needs the full roster, but only on page 1 — and never pull license photo blobs.
      let summary: ReturnType<typeof this.companyVehicleDriverSummaryFromMapped> | undefined;
      if (page === 1) {
        const summaryRows = await tx
          .select({
            id: industrialFleetDrivers.id,
            personnelId: industrialFleetDrivers.personnelId,
            personnelName: industrialFleetDrivers.personnelName,
            employeeNumber: industrialFleetDrivers.employeeNumber,
            licenseNumber: industrialFleetDrivers.licenseNumber,
            licenseState: industrialFleetDrivers.licenseState,
            status: industrialFleetDrivers.status,
            createdAt: industrialFleetDrivers.createdAt,
            updatedAt: industrialFleetDrivers.updatedAt,
            sourcePayload: this.slimJsonbPayloadExpr(industrialFleetDrivers.sourcePayload),
          })
          .from(industrialFleetDrivers)
          .where(and(...baseConditions))
          .orderBy(desc(industrialFleetDrivers.updatedAt));
        const mapped = summaryRows.map((row) =>
          this.mapCompanyVehicleDriverListItem(row, personnelLinkIndex),
        );
        summary = this.companyVehicleDriverSummaryFromMapped(mapped);
      }

      return {
        page,
        pageSize,
        total,
        items,
        ...(summary ? { summary } : {}),
      };
    });
  }

  /**
   * Start (or return) the annual 10% MVR sample for a calendar year.
   * Idempotent for the year unless forceRedraw is true.
   */
  async startCompanyDriverMvrSample(principal: ForgePrincipal, body: Record<string, unknown> = {}) {
    const yearRaw = Number(body.year);
    const year =
      Number.isFinite(yearRaw) && yearRaw >= 2000
        ? Math.trunc(yearRaw)
        : new Date().getUTCFullYear();
    const forceRedraw = body.force === true || body.forceRedraw === true;
    const selectedAt = new Date().toISOString();

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
      },
      principal.userId,
    );
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

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
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
                  lastMvrDate: auditedAt.slice(0, 10),
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
      },
      principal.userId,
    );
  }

  /**
   * Distinct division catalog names and supervisor frequency keyed by
   * Division + Location + Department. Used by Add Person to populate the
   * division dropdown and auto-fill supervisor.
   *
   * Division options = tenant catalog only (tenant_settings industrial /
   * personnel.divisions). Roster free-text values are not merged in.
   */
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

      const divisionEntries = normalizePersonnelDivisionCatalog(catalogRow?.valueJson);
      const divisions = new Set<string>();
      for (const entry of divisionEntries) {
        divisions.add(entry.name);
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
        divisionEntries,
        supervisors: [...counts.values()],
      };
    });
  }

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

  async personnelFirstAidSummary(principal: ForgePrincipal) {
    const warningDays = 30;
    const today = new Date();
    const startOfDay = (value: Date) =>
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    const asDay = (value: unknown): string | null => {
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, 10);
      return null;
    };
    const expiryStatus = (expiresValue: unknown): "none" | "ok" | "expiring_soon" | "expired" => {
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
          tracksFirstAid: industrialPersonnel.tracksFirstAid,
          cprCertificationExpiresDate: industrialPersonnel.cprCertificationExpiresDate,
          firstAidCertificationExpiresDate: industrialPersonnel.firstAidCertificationExpiresDate,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, principal.tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        );

      let trackedCount = 0;
      let cprExpiringSoon = 0;
      let firstAidExpiringSoon = 0;
      let cprExpired = 0;
      let firstAidExpired = 0;

      for (const row of rows) {
        const hasCpr = Boolean(asDay(row.cprCertificationExpiresDate));
        const hasFirstAid = Boolean(asDay(row.firstAidCertificationExpiresDate));
        if (!row.tracksFirstAid && !hasCpr && !hasFirstAid) continue;
        trackedCount += 1;
        const cprStatus = expiryStatus(row.cprCertificationExpiresDate);
        const faStatus = expiryStatus(row.firstAidCertificationExpiresDate);
        if (cprStatus === "expiring_soon") cprExpiringSoon += 1;
        if (cprStatus === "expired") cprExpired += 1;
        if (faStatus === "expiring_soon") firstAidExpiringSoon += 1;
        if (faStatus === "expired") firstAidExpired += 1;
      }

      return {
        trackedCount,
        cprExpiringSoon,
        firstAidExpiringSoon,
        cprExpired,
        firstAidExpired,
        expiringWithinDays: warningDays,
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
    const siteId = (query.siteId ?? query.locationId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialEquipment.tenantId, principal.tenantId),
        isNull(industrialEquipment.archivedAt),
      ];
      if (siteId) {
        conditions.push(eq(industrialEquipment.siteId, siteId));
      }
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
        items: items.map((r) => this.mapEquipmentItem(r)),
      };
    });
  }

  async getEquipment(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialEquipment)
        .where(
          and(
            eq(industrialEquipment.id, recordId),
            eq(industrialEquipment.tenantId, principal.tenantId),
            isNull(industrialEquipment.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Equipment not found");
      return this.mapEquipmentItem(row);
    });
  }

  /**
   * Firebase assetRecords used equipmentName / assetTag / category / locationId.
   * Model A only stores a thin typed slice; keep UI keys from unwrapped payload
   * and only overlay non-empty typed columns so placeholder names do not wipe
   * the imported equipmentName.
   */
  private mapEquipmentItem(row: {
    id: string;
    name: string;
    status: string;
    siteId?: string | null;
    equipmentNumber?: string | null;
    equipmentType?: string | null;
    createdAt: Date;
    updatedAt: Date;
    sourcePayload?: unknown;
  }) {
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const equipmentName =
      (typeof row.name === "string" &&
        row.name.trim() &&
        !/^imported-/i.test(row.name.trim()) &&
        row.name.trim()) ||
      (typeof payload.equipmentName === "string" && payload.equipmentName.trim()) ||
      (typeof payload.name === "string" && payload.name.trim()) ||
      row.name;
    const filled = this.preferFilled(
      {
        siteId: row.siteId,
        equipmentNumber: row.equipmentNumber,
        equipmentType: row.equipmentType,
        assetTag: row.equipmentNumber,
        equipmentName,
        divisionName:
          (typeof payload.divisionName === "string" && payload.divisionName.trim()) ||
          (typeof payload.division === "string" && payload.division.trim()) ||
          (typeof payload.site === "string" && payload.site.trim()) ||
          null,
        departmentId:
          (typeof payload.departmentId === "string" && payload.departmentId.trim()) || null,
        departmentName:
          (typeof payload.departmentName === "string" && payload.departmentName.trim()) ||
          (typeof payload.department === "string" && payload.department.trim()) ||
          null,
        siteName:
          (typeof payload.siteName === "string" && payload.siteName.trim()) ||
          (typeof payload.locationName === "string" && payload.locationName.trim()) ||
          null,
        areaName:
          (typeof payload.areaName === "string" && payload.areaName.trim()) ||
          (typeof payload.locationDetail === "string" && payload.locationDetail.trim()) ||
          null,
        locationDetail:
          (typeof payload.locationDetail === "string" && payload.locationDetail.trim()) ||
          (typeof payload.areaName === "string" && payload.areaName.trim()) ||
          null,
      },
      payload,
    );
    return this.mapListItem({
      id: row.id,
      name: equipmentName,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourcePayload: filled,
      extra: {
        siteId: row.siteId,
        equipmentNumber: row.equipmentNumber ?? filled.equipmentNumber ?? filled.assetTag ?? null,
        equipmentType: row.equipmentType ?? filled.equipmentType ?? filled.category ?? null,
        equipmentName,
        assetTag: row.equipmentNumber ?? filled.assetTag ?? null,
        siteName: filled.siteName ?? null,
        divisionName: filled.divisionName ?? null,
        departmentId: filled.departmentId ?? null,
        departmentName: filled.departmentName ?? null,
        areaName: filled.areaName ?? filled.locationDetail ?? null,
        externalEquipmentId: filled.externalEquipmentId ?? null,
        manufacturer: filled.manufacturer ?? null,
        model: filled.model ?? null,
        serialNumber: filled.serialNumber ?? null,
        locationDetail: filled.locationDetail ?? filled.areaName ?? null,
        notes: filled.notes ?? null,
      },
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
          equipmentNumber: body.equipmentNumber
            ? String(body.equipmentNumber)
            : body.assetTag
              ? String(body.assetTag)
              : null,
          equipmentType: body.equipmentType
            ? String(body.equipmentType)
            : body.category
              ? String(body.category)
              : null,
          siteId: body.siteId ? String(body.siteId) : null,
          status: String(body.status ?? "ACTIVE"),
          sourceSystem: "FORGE",
          sourcePayload: body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapEquipmentItem(row!);
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
      return this.mapEquipmentItem(row);
    });
  }

  async getLotoDetail(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [joined] = await tx
        .select({
          procedure: industrialLotoProcedures,
          siteName: industrialSites.name,
        })
        .from(industrialLotoProcedures)
        .leftJoin(industrialSites, eq(industrialSites.id, industrialLotoProcedures.siteId))
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!joined?.procedure) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");
      const proc = joined.procedure;
      const [energySources, isolationPoints, steps, lockouts] = await Promise.all([
        tx
          .select()
          .from(industrialLotoEnergySources)
          .where(
            and(
              eq(industrialLotoEnergySources.tenantId, principal.tenantId),
              eq(industrialLotoEnergySources.procedureId, recordId),
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
              eq(industrialLotoIsolationPoints.procedureId, recordId),
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
              eq(industrialLotoSteps.procedureId, recordId),
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
              eq(industrialLotoRecords.procedureId, recordId),
              isNull(industrialLotoRecords.archivedAt),
            ),
          )
          .orderBy(desc(industrialLotoRecords.updatedAt)),
      ]);
      const payload = this.unwrapSourcePayload(proc.sourcePayload);
      const display = this.normalizeLotoProcedureDisplay(payload, {
        siteName: joined.siteName,
        procedureNumber: proc.procedureNumber,
        equipmentId: proc.equipmentId,
        revision: proc.revision,
        siteId: proc.siteId,
      });
      const mapped = this.mapListItem({
        id: proc.id,
        title: proc.title,
        status: proc.status,
        createdAt: proc.createdAt,
        updatedAt: proc.updatedAt,
        sourcePayload: proc.sourcePayload,
        extra: display,
      });
      const hasChildren =
        energySources.length > 0 || isolationPoints.length > 0 || steps.length > 0;
      const derived = hasChildren ? null : this.deriveLotoProcedureChildrenFromPayload(payload);
      return {
        ...mapped,
        energySources: hasChildren ? energySources : derived!.energySources,
        isolationPoints: hasChildren ? isolationPoints : derived!.isolationPoints,
        steps: hasChildren ? steps : derived!.steps,
        restorationChecks: display.restorationChecks,
        notes: display.notes,
        attachments: display.attachments,
        tags: display.tags,
        lockouts: lockouts.map((r) => this.mapLotoLockout(r)),
        procedure: mapped,
      };
    });
  }

  async listLotoProceduresDetailed(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const equipmentIdRaw = (query.equipmentId ?? "").trim();
    const equipmentId = UUID_PATTERN.test(equipmentIdRaw) ? equipmentIdRaw : "";
    const siteIdRaw = (query.siteId ?? query.facilityId ?? "").trim();
    const siteId = UUID_PATTERN.test(siteIdRaw) ? siteIdRaw : "";
    const siteName = (query.siteName ?? "").trim();
    const departmentIdRaw = (query.departmentId ?? "").trim();
    const departmentId = UUID_PATTERN.test(departmentIdRaw) ? departmentIdRaw : "";
    const departmentName = (query.departmentName ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialLotoProcedures.tenantId, principal.tenantId),
        isNull(industrialLotoProcedures.archivedAt),
      ];
      if (status) conditions.push(eq(industrialLotoProcedures.status, status));
      if (equipmentId) {
        conditions.push(eq(industrialLotoProcedures.equipmentId, equipmentId));
      }
      if (siteId || siteName) {
        const siteNameLower = siteName.toLowerCase();
        const payloadSiteName = sql<string>`lower(btrim(coalesce(
          case
            when jsonb_typeof(${industrialLotoProcedures.sourcePayload}) = 'string'
              then coalesce(
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'siteName'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'siteNameSnapshot'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'site')
              )
            else coalesce(
              ${industrialLotoProcedures.sourcePayload} ->> 'siteName',
              ${industrialLotoProcedures.sourcePayload} ->> 'siteNameSnapshot',
              ${industrialLotoProcedures.sourcePayload} ->> 'site'
            )
          end,
          ''
        )))`;
        // Include unassigned site_id rows — migrated LOTO often has null FK but still
        // belongs tenant-wide; strict siteId-only filters were hiding every procedure.
        const siteParts = [
          siteId ? eq(industrialLotoProcedures.siteId, siteId) : undefined,
          siteNameLower
            ? or(
                sql`lower(btrim(coalesce(${industrialSites.name}, ''))) = ${siteNameLower}`,
                sql`lower(btrim(coalesce(${industrialSites.name}, ''))) like ${`%${siteNameLower}%`}`,
                sql`${payloadSiteName} = ${siteNameLower}`,
                sql`${payloadSiteName} like ${`%${siteNameLower}%`}`,
              )
            : undefined,
          isNull(industrialLotoProcedures.siteId),
        ].filter(Boolean);
        if (siteParts.length === 1) conditions.push(siteParts[0]!);
        else if (siteParts.length > 1) conditions.push(or(...siteParts)!);
      }
      if (departmentId || departmentName) {
        const departmentNameLower = departmentName.toLowerCase();
        const payloadDepartmentId = sql<string>`nullif(btrim(coalesce(
          case
            when jsonb_typeof(${industrialLotoProcedures.sourcePayload}) = 'string'
              then ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'departmentId')
            else ${industrialLotoProcedures.sourcePayload} ->> 'departmentId'
          end,
          ''
        )), '')`;
        const payloadDepartmentName = sql<string>`lower(btrim(coalesce(
          case
            when jsonb_typeof(${industrialLotoProcedures.sourcePayload}) = 'string'
              then coalesce(
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'departmentName'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'departmentNameSnapshot'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'department')
              )
            else coalesce(
              ${industrialLotoProcedures.sourcePayload} ->> 'departmentName',
              ${industrialLotoProcedures.sourcePayload} ->> 'departmentNameSnapshot',
              ${industrialLotoProcedures.sourcePayload} ->> 'department'
            )
          end,
          ''
        )))`;
        const deptParts = [
          departmentId ? sql`${payloadDepartmentId} = ${departmentId}` : undefined,
          departmentNameLower
            ? or(
                sql`${payloadDepartmentName} = ${departmentNameLower}`,
                sql`${payloadDepartmentName} like ${`%${departmentNameLower}%`}`,
              )
            : undefined,
          // Unscoped department in payload — do not hide when a department chip is active.
          sql`coalesce(${payloadDepartmentId}, '') = '' and coalesce(${payloadDepartmentName}, '') = ''`,
        ].filter(Boolean);
        if (deptParts.length === 1) conditions.push(deptParts[0]!);
        else if (deptParts.length > 1) conditions.push(or(...deptParts)!);
      }
      if (q) {
        const qLower = `%${q.toLowerCase()}%`;
        const payloadEquipmentName = sql<string>`lower(btrim(coalesce(
          case
            when jsonb_typeof(${industrialLotoProcedures.sourcePayload}) = 'string'
              then coalesce(
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'equipmentName'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'equipmentUnit'),
                ((${industrialLotoProcedures.sourcePayload} #>> '{}')::jsonb ->> 'equipment')
              )
            else coalesce(
              ${industrialLotoProcedures.sourcePayload} ->> 'equipmentName',
              ${industrialLotoProcedures.sourcePayload} ->> 'equipmentUnit',
              ${industrialLotoProcedures.sourcePayload} ->> 'equipment'
            )
          end,
          ''
        )))`;
        conditions.push(
          or(
            ilike(industrialLotoProcedures.title, `%${q}%`),
            ilike(industrialLotoProcedures.procedureNumber, `%${q}%`),
            sql`${payloadEquipmentName} like ${qLower}`,
          )!,
        );
      }
      const items = await tx
        .select({
          procedure: industrialLotoProcedures,
          siteName: industrialSites.name,
        })
        .from(industrialLotoProcedures)
        .leftJoin(industrialSites, eq(industrialSites.id, industrialLotoProcedures.siteId))
        .where(and(...conditions))
        .orderBy(desc(industrialLotoProcedures.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const [countRow] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(industrialLotoProcedures)
        .leftJoin(industrialSites, eq(industrialSites.id, industrialLotoProcedures.siteId))
        .where(and(...conditions));
      return {
        page,
        pageSize,
        total: Number(countRow?.value ?? items.length),
        items: items.map(({ procedure: r, siteName }) => {
          const payload = this.unwrapSourcePayload(r.sourcePayload);
          const display = this.normalizeLotoProcedureDisplay(payload, {
            siteName,
            procedureNumber: r.procedureNumber,
            equipmentId: r.equipmentId,
            revision: r.revision,
            siteId: r.siteId,
          });
          // Slim heavy data-URL photos on list responses — detail endpoint keeps full images.
          return this.mapListItem({
            id: r.id,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: this.slimPayloadForList(payload),
            extra: {
              ...display,
              equipmentImageUrl: null,
              equipmentImages: undefined,
            },
          });
        }),
      };
    });
  }

  async listLotoLockouts(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const status = (query.status ?? "").trim();
    const siteIdRaw = (query.siteId ?? query.facilityId ?? "").trim();
    const siteId = UUID_PATTERN.test(siteIdRaw) ? siteIdRaw : "";
    const dateFrom = (query.dateFrom ?? "").trim();
    const dateTo = (query.dateTo ?? "").trim();
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialLotoRecords.tenantId, principal.tenantId),
        isNull(industrialLotoRecords.archivedAt),
      ];
      if (status) conditions.push(eq(industrialLotoRecords.status, status));
      if (siteId) conditions.push(eq(industrialLotoRecords.siteId, siteId));
      if (fromDate && !Number.isNaN(fromDate.getTime())) {
        conditions.push(gte(industrialLotoRecords.updatedAt, fromDate));
      }
      if (toDate && !Number.isNaN(toDate.getTime())) {
        conditions.push(lte(industrialLotoRecords.updatedAt, toDate));
      }
      const items = await tx
        .select()
        .from(industrialLotoRecords)
        .where(and(...conditions))
        .orderBy(desc(industrialLotoRecords.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const [countRow] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(industrialLotoRecords)
        .where(and(...conditions));
      return {
        page,
        pageSize,
        total: Number(countRow?.value ?? items.length),
        items: items.map((r) => this.mapLotoLockout(r)),
      };
    });
  }

  async getLotoLockoutDetail(principal: ForgePrincipal, lockoutId: string) {
    const recordId = this.assertRecordId(lockoutId);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialLotoRecords)
        .where(
          and(
            eq(industrialLotoRecords.id, recordId),
            eq(industrialLotoRecords.tenantId, principal.tenantId),
            isNull(industrialLotoRecords.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Lockout record not found");
      const mapped = this.mapLotoLockout(row);
      if (!row.procedureId) return mapped;

      const [energySources, isolationPoints, steps] = await Promise.all([
        tx
          .select()
          .from(industrialLotoEnergySources)
          .where(
            and(
              eq(industrialLotoEnergySources.tenantId, principal.tenantId),
              eq(industrialLotoEnergySources.procedureId, row.procedureId),
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
              eq(industrialLotoIsolationPoints.procedureId, row.procedureId),
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
              eq(industrialLotoSteps.procedureId, row.procedureId),
              isNull(industrialLotoSteps.archivedAt),
            ),
          )
          .orderBy(industrialLotoSteps.stepNumber),
      ]);

      const payload = this.unwrapSourcePayload(row.sourcePayload);
      const hasEmbedded =
        (Array.isArray(payload.energySources) && payload.energySources.length > 0) ||
        (Array.isArray(payload.isolationPoints) && payload.isolationPoints.length > 0) ||
        (Array.isArray(payload.steps) && payload.steps.length > 0);

      if (hasEmbedded) return mapped;

      return {
        ...mapped,
        energySources,
        isolationPoints,
        steps,
      };
    });
  }

  private normalizeLotoProcedureDisplay(
    payload: Record<string, unknown>,
    columns: {
      siteName?: string | null;
      procedureNumber?: string | null;
      equipmentId?: string | null;
      revision?: string | null;
      siteId?: string | null;
    },
  ) {
    const textOf = (value: unknown) =>
      typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    // Scope/description must stay plain text. Migrated payloads often store
    // `description` as an object array; String(array) becomes "[object Object],...".
    const plainText = (value: unknown) => {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      if (!trimmed || trimmed.includes("[object Object]")) return "";
      return trimmed;
    };
    const equipmentTypeName =
      textOf(payload.equipmentTypeName) ||
      textOf(payload.equipmentTypeNameSnapshot) ||
      textOf(payload.equipmentType) ||
      null;
    const pickLabel = (...candidates: Array<string | null>) => {
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (equipmentTypeName && candidate.toLowerCase() === equipmentTypeName.toLowerCase()) {
          continue;
        }
        return candidate;
      }
      return null;
    };
    // Prefer site/area snapshots — do not use generic `location` (often a step
    // location or equipment type in migrated Firebase payloads).
    const siteName = pickLabel(
      textOf(columns.siteName) || null,
      textOf(payload.siteName) || null,
      textOf(payload.siteNameSnapshot) || null,
      textOf(payload.site) || null,
      textOf(payload.leftFooter) || null,
    );
    const areaName = pickLabel(
      textOf(payload.areaName) || null,
      textOf(payload.areaNameSnapshot) || null,
      textOf(payload.area) || null,
      textOf(payload.processLine) || null,
    );
    const departmentId = textOf(payload.departmentId) || null;
    const departmentName =
      textOf(payload.departmentName) ||
      textOf(payload.departmentNameSnapshot) ||
      textOf(payload.department) ||
      null;
    const equipmentName =
      textOf(payload.equipmentName) ||
      textOf(payload.equipmentUnit) ||
      textOf(payload.equipment) ||
      null;
    const equipmentExternalId =
      textOf(payload.equipmentExternalId) ||
      textOf(payload.equipmentNumber) ||
      textOf(payload.assetTag) ||
      null;
    const scope =
      plainText(payload.scope) ||
      plainText(payload.description) ||
      plainText(payload.workDescription) ||
      null;
    const notes = this.normalizeLotoNotes(payload.notes);
    const restorationChecks = this.normalizeLotoRestorationChecks(payload.restorationChecks);
    const attachments = this.normalizeLotoAttachments(payload.attachments);
    const tags = Array.isArray(payload.tags)
      ? payload.tags.map((tag) => textOf(tag)).filter(Boolean)
      : textOf(payload.tags)
        ? [textOf(payload.tags)]
        : [];
    return {
      procedureNumber: textOf(columns.procedureNumber) || textOf(payload.procedureNumber) || null,
      equipmentId: columns.equipmentId ?? null,
      revision: textOf(columns.revision) || textOf(payload.revision) || "1",
      siteId: columns.siteId ?? null,
      siteName,
      siteNameSnapshot: textOf(payload.siteNameSnapshot) || siteName,
      departmentId,
      departmentName,
      departmentNameSnapshot: textOf(payload.departmentNameSnapshot) || departmentName,
      divisionName:
        textOf(payload.divisionName) ||
        textOf(payload.divisionNameSnapshot) ||
        textOf(payload.division) ||
        null,
      divisionNameSnapshot:
        textOf(payload.divisionNameSnapshot) ||
        textOf(payload.divisionName) ||
        textOf(payload.division) ||
        null,
      areaName,
      areaNameSnapshot: textOf(payload.areaNameSnapshot) || areaName,
      processLine: textOf(payload.processLine) || areaName,
      equipmentName,
      equipmentTypeName,
      equipmentTypeNameSnapshot: textOf(payload.equipmentTypeNameSnapshot) || equipmentTypeName,
      equipmentExternalId,
      scope,
      notes,
      restorationChecks,
      attachments,
      tags,
      equipmentImageUrl:
        textOf(payload.equipmentImageUrl) || textOf(payload.equipmentImageStorageKey) || null,
      equipmentImageCaption: textOf(payload.equipmentImageCaption) || null,
      equipmentImageFileName: textOf(payload.equipmentImageFileName) || null,
      equipmentImageAnnotations: Array.isArray(payload.equipmentImageAnnotations)
        ? payload.equipmentImageAnnotations
        : [],
      equipmentImages: Array.isArray(payload.equipmentImages) ? payload.equipmentImages : undefined,
      approvedAt: payload.approvedAt ?? null,
      effectiveAt: payload.effectiveAt ?? null,
      reviewDueAt: payload.reviewDueAt ?? payload.reviewDue ?? null,
    };
  }

  private normalizeLotoNotes(raw: unknown): Array<{ id: string; label: string; text: string }> {
    if (typeof raw === "string" && raw.trim()) {
      return [{ id: "note-0", label: "Note", text: raw.trim() }];
    }
    if (!Array.isArray(raw)) return [];
    const notes: Array<{ id: string; label: string; text: string }> = [];
    for (const [i, item] of raw.entries()) {
      if (typeof item === "string" && item.trim()) {
        notes.push({ id: `note-${i}`, label: "Note", text: item.trim() });
        continue;
      }
      const row = asRecord(item);
      const text =
        String(row.text ?? row.body ?? row.note ?? row.content ?? "").trim() ||
        String(row.shortName ?? "").trim();
      if (!text) continue;
      notes.push({
        id: String(row.id ?? `note-${i}`),
        label: String(row.shortName ?? row.category ?? row.title ?? "Note").trim() || "Note",
        text,
      });
    }
    return notes;
  }

  private normalizeLotoRestorationChecks(
    raw: unknown,
  ): Array<{ id: string; label: string; completed: boolean }> {
    if (!Array.isArray(raw)) return [];
    const checks: Array<{ id: string; label: string; completed: boolean }> = [];
    for (const [i, item] of raw.entries()) {
      if (typeof item === "string" && item.trim()) {
        checks.push({ id: `restore-${i}`, label: item.trim(), completed: false });
        continue;
      }
      const row = asRecord(item);
      const label = String(
        row.label ?? row.text ?? row.instruction ?? row.checkLabel ?? row.name ?? "",
      ).trim();
      if (!label) continue;
      checks.push({
        id: String(row.id ?? row.checkKey ?? `restore-${i}`),
        label,
        completed: Boolean(row.completed ?? row.done ?? row.checked),
      });
    }
    return checks;
  }

  private normalizeLotoAttachments(
    raw: unknown,
  ): Array<{ id: string; filename: string; url: string; contentType: string }> {
    if (!Array.isArray(raw)) return [];
    const attachments: Array<{
      id: string;
      filename: string;
      url: string;
      contentType: string;
    }> = [];
    for (const [i, item] of raw.entries()) {
      const row = asRecord(item);
      const filename = String(row.filename ?? row.name ?? row.title ?? "").trim();
      const url = String(row.url ?? row.storageKey ?? row.downloadUrl ?? "").trim();
      if (!filename && !url) continue;
      attachments.push({
        id: String(row.id ?? `attachment-${i}`),
        filename: filename || `Attachment ${i + 1}`,
        url,
        contentType: String(row.contentType ?? row.mimeType ?? "").trim(),
      });
    }
    return attachments;
  }

  /**
   * When child tables were never backfilled, rebuild energy / isolation / steps
   * from the Firebase procedure payload so detail + printable still show data.
   */
  private deriveLotoProcedureChildrenFromPayload(payload: Record<string, unknown>) {
    const energySources: Array<Record<string, unknown>> = [];
    const isolationPoints: Array<Record<string, unknown>> = [];
    const steps: Array<Record<string, unknown>> = [];
    const rawSteps = Array.isArray(payload.steps) ? payload.steps : [];

    for (const [index, raw] of rawSteps.entries()) {
      const row = asRecord(raw);
      const nested = asRecord(row.energySource ?? row.energy);
      const isolation = asRecord(row.isolation ?? row.isolationPoint);
      const verification = asRecord(row.verification ?? row.verificationMethod);
      const printed = String(
        row.printedProcedureDescription ?? row.printedDescription ?? "",
      ).trim();
      const descriptionCode = String(row.descriptionCode ?? row.code ?? "").trim();
      const customDescription = String(row.customDescription ?? row.customText ?? "").trim();
      const energyType = String(
        row.energySourceName ??
          row.energyType ??
          row.energySource ??
          nested.name ??
          nested.energySourceName ??
          nested.type ??
          descriptionCode ??
          "",
      ).trim();
      const magnitude = String(
        row.energyMagnitude ??
          row.magnitude ??
          nested.magnitude ??
          nested.energyMagnitude ??
          (descriptionCode && descriptionCode !== energyType ? descriptionCode : "") ??
          "",
      ).trim();
      const description = String(
        row.energyNotes ??
          row.description ??
          nested.description ??
          nested.notes ??
          customDescription ??
          "",
      ).trim();
      const locationDescription = String(
        row.isolationLocationText ??
          row.locationDescription ??
          row.location ??
          isolation.locationText ??
          isolation.locationDescription ??
          customDescription ??
          "",
      ).trim();
      const isolationMethod = String(
        row.isolationAction ??
          row.isolationMethod ??
          row.method ??
          isolation.action ??
          isolation.method ??
          "",
      ).trim();
      const label =
        String(
          row.lockoutDeviceName ??
            row.label ??
            row.deviceName ??
            isolation.lockoutDeviceName ??
            isolation.label ??
            energyType ??
            `Point ${index + 1}`,
        ).trim() || `Point ${index + 1}`;
      const verificationMethod = String(
        row.verificationMethodName ??
          row.verificationMethod ??
          (typeof row.verification === "string" ? row.verification : "") ??
          verification.name ??
          verification.label ??
          verification.method ??
          "",
      ).trim();
      const instruction =
        String(row.instruction ?? row.text ?? row.stepText ?? "").trim() ||
        printed ||
        [
          energyType && `Isolate ${energyType}`,
          magnitude && `(${magnitude})`,
          locationDescription && `at ${locationDescription}`,
          isolationMethod && `by ${isolationMethod}`,
          label && label !== energyType && `using ${label}`,
        ]
          .filter(Boolean)
          .join(" ");
      const stepPhase = String(row.stepPhase ?? row.phase ?? "ISOLATION").trim() || "ISOLATION";
      const stepNumber =
        Number(row.stepNumber ?? row.order ?? row.sortOrder ?? index + 1) || index + 1;
      const usable =
        energyType || instruction || label || locationDescription || verificationMethod;
      if (!usable) continue;

      const energyId = `payload-energy-${index}`;
      const isolationId = `payload-iso-${index}`;
      if (energyType) {
        energySources.push({
          id: energyId,
          energyType,
          description: description || null,
          magnitude: magnitude || null,
          sortOrder: index,
          sourcePayload: row,
        });
      }
      isolationPoints.push({
        id: isolationId,
        energySourceId: energyType ? energyId : null,
        label,
        locationDescription: locationDescription || null,
        isolationMethod: isolationMethod || null,
        sortOrder: index,
        sourcePayload: row,
      });
      steps.push({
        id: `payload-step-${index}`,
        stepPhase,
        stepNumber,
        instruction: instruction || `Isolation step ${index + 1}`,
        isolationPointId: isolationId,
        isVerification: false,
        sourcePayload: row,
      });
      if (verificationMethod) {
        steps.push({
          id: `payload-verify-${index}`,
          stepPhase: "VERIFICATION",
          stepNumber: stepNumber + 0.5,
          instruction: `Verify zero energy: ${verificationMethod}`,
          isolationPointId: isolationId,
          isVerification: true,
          sourcePayload: { ...row, verification: verificationMethod },
        });
      }
    }

    steps.sort((a, b) => Number(a.stepNumber ?? 0) - Number(b.stepNumber ?? 0));
    steps.forEach((step, i) => {
      step.stepNumber = i + 1;
    });

    return { energySources, isolationPoints, steps };
  }

  private mapLotoLockout(r: {
    id: string;
    title: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    sourcePayload: unknown;
    procedureId: string | null;
    siteId: string | null;
    dueDate: string | Date | null;
  }) {
    const payload = this.unwrapSourcePayload(r.sourcePayload);
    const details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? (payload.details as Record<string, unknown>)
        : {};
    const items = this.deriveLotoLockoutItems(payload);
    return {
      ...this.mapListItem({
        id: r.id,
        title: r.title,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        sourcePayload: r.sourcePayload,
        extra: {
          procedureId: r.procedureId,
          siteId: r.siteId,
          dueDate: r.dueDate,
          authorizedEmployee:
            String(payload.authorizedEmployee ?? payload.workerName ?? "").trim() || null,
          affectedEmployees:
            String(payload.affectedEmployees ?? payload.affectedEmployeeNames ?? "").trim() || null,
          equipmentName:
            String(
              payload.equipmentName ?? payload.equipmentUnit ?? details.equipmentName ?? "",
            ).trim() || null,
          lockTagId: String(payload.lockTagId ?? "").trim() || null,
          tryStartRequired: payload.tryStartRequired ?? details.tryStartRequired ?? null,
          zeroEnergyConfirmed: payload.zeroEnergyConfirmed ?? details.zeroEnergyConfirmed ?? null,
          tryStartCompleted: payload.tryStartCompleted ?? details.tryStartCompleted ?? null,
          restorationComplete: payload.restorationComplete ?? details.restorationComplete ?? null,
        },
      }),
      energySources: items.energySources,
      isolationPoints: items.isolationPoints,
      steps: items.steps,
      details,
    };
  }

  private deriveLotoLockoutItems(payload: Record<string, unknown>) {
    const details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? (payload.details as Record<string, unknown>)
        : {};

    const energySources: Array<Record<string, unknown>> = [];
    if (Array.isArray(payload.energySources) && payload.energySources.length > 0) {
      for (const [i, raw] of payload.energySources.entries()) {
        const item =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        energySources.push({
          id: String(item.id ?? `energy-${i}`),
          energyType: String(item.energyType ?? item.type ?? "Energy"),
          magnitude: String(item.magnitude ?? item.description ?? ""),
          sortOrder: i,
        });
      }
    } else {
      const listed = String(details.energySources ?? details.energyTypes ?? "").trim();
      const primary = String(details.primaryEnergyType ?? "").trim();
      const types = listed
        ? listed
            .split(/[,/|]/)
            .map((part) => part.trim())
            .filter(Boolean)
        : primary
          ? [primary]
          : [];
      for (const [i, energyType] of types.entries()) {
        energySources.push({
          id: `energy-${i}`,
          energyType,
          magnitude: primary && energyType.toLowerCase() === primary.toLowerCase() ? "Primary" : "",
          sortOrder: i,
        });
      }
    }

    const isolationPoints: Array<Record<string, unknown>> = [];
    if (Array.isArray(payload.isolationPoints) && payload.isolationPoints.length > 0) {
      for (const [i, raw] of payload.isolationPoints.entries()) {
        const item =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        isolationPoints.push({
          id: String(item.id ?? `iso-${i}`),
          label: String(item.label ?? item.name ?? `Isolation point ${i + 1}`),
          locationDescription: String(
            item.locationDescription ?? item.location ?? item.deviceType ?? "",
          ),
          sortOrder: i,
        });
      }
    } else {
      const controlPoints = String(details.energyControlPoints ?? "").trim();
      if (controlPoints) {
        for (const [i, line] of controlPoints
          .split(/\r?\n/)
          .map((part) => part.trim())
          .filter(Boolean)
          .entries()) {
          const parts = line
            .split("|")
            .map((part) => part.trim())
            .filter(Boolean);
          isolationPoints.push({
            id: `iso-${i}`,
            label: parts[0] || `Isolation point ${i + 1}`,
            locationDescription: parts.slice(1).join(" · "),
            sortOrder: i,
          });
        }
      } else {
        const device = String(details.isolationDeviceType ?? "").trim();
        const placement = String(details.lockTagPlacement ?? "").trim();
        if (device || placement) {
          isolationPoints.push({
            id: "iso-0",
            label: device || "Isolation device",
            locationDescription: placement,
            sortOrder: 0,
          });
        }
      }
    }

    const steps: Array<Record<string, unknown>> = [];
    if (Array.isArray(payload.steps) && payload.steps.length > 0) {
      for (const [i, raw] of payload.steps.entries()) {
        const item =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        steps.push({
          id: String(item.id ?? `step-${i}`),
          stepNumber: Number(item.stepNumber ?? i + 1) || i + 1,
          stepPhase: String(item.stepPhase ?? "STEP"),
          instruction: String(item.instruction ?? item.description ?? ""),
          isVerification: Boolean(item.isVerification),
        });
      }
    } else {
      const blocks: Array<{ phase: string; text: string; verification?: boolean }> = [
        { phase: "SHUTDOWN", text: String(details.shutdownSteps ?? "").trim() },
        { phase: "ISOLATION", text: String(details.isolationSteps ?? "").trim() },
        {
          phase: "VERIFICATION",
          text: String(details.verificationMethod ?? details.verificationMethodSelect ?? "").trim(),
          verification: true,
        },
        { phase: "RESTART", text: String(details.startupSteps ?? "").trim() },
      ];
      let n = 1;
      for (const block of blocks) {
        if (!block.text) continue;
        const lines =
          block.phase === "VERIFICATION" && !block.text.includes("\n")
            ? [`Verify zero energy: ${block.text}`]
            : block.text
                .split(/\r?\n|;/)
                .map((line) => line.replace(/^\s*\d+[).:\s-]+/, "").trim())
                .filter(Boolean);
        for (const instruction of lines) {
          steps.push({
            id: `step-${n}`,
            stepNumber: n,
            stepPhase: block.phase,
            instruction,
            isVerification: Boolean(block.verification),
          });
          n += 1;
        }
      }
    }

    return { energySources, isolationPoints, steps };
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
    const siteIdRaw = String(body.siteId ?? "").trim();
    const siteId = UUID_PATTERN.test(siteIdRaw) ? siteIdRaw : null;
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
          String(
            row.lockoutDeviceName ?? row.isolationLocationText ?? row.label ?? energyType,
          ).trim() || `Point ${index + 1}`;
        const isolationId = createId();
        await tx.insert(industrialLotoIsolationPoints).values({
          id: isolationId,
          tenantId: principal.tenantId,
          procedureId,
          energySourceId: energyId,
          label: isolationLabel,
          locationDescription:
            String(row.isolationLocationText ?? row.locationDescription ?? "").trim() || null,
          isolationMethod: String(row.isolationAction ?? row.isolationMethod ?? "").trim() || null,
          sortOrder: index,
          sourceSystem: "FORGE",
          sourcePayload: row,
          createdAt: now,
          updatedAt: now,
        });
        const instruction =
          String(
            row.printedProcedureDescription ?? row.printedDescription ?? row.instruction ?? "",
          ).trim() ||
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

  private async archiveLotoProcedureChildren(
    tx: DatabaseTransaction,
    tenantId: string,
    procedureId: string,
    now: Date,
  ) {
    await tx
      .update(industrialLotoEnergySources)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(industrialLotoEnergySources.tenantId, tenantId),
          eq(industrialLotoEnergySources.procedureId, procedureId),
          isNull(industrialLotoEnergySources.archivedAt),
        ),
      );
    await tx
      .update(industrialLotoIsolationPoints)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(industrialLotoIsolationPoints.tenantId, tenantId),
          eq(industrialLotoIsolationPoints.procedureId, procedureId),
          isNull(industrialLotoIsolationPoints.archivedAt),
        ),
      );
    await tx
      .update(industrialLotoSteps)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(industrialLotoSteps.tenantId, tenantId),
          eq(industrialLotoSteps.procedureId, procedureId),
          isNull(industrialLotoSteps.archivedAt),
        ),
      );
  }

  private async insertLotoProcedureChildren(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    procedureId: string,
    body: Record<string, unknown>,
    now: Date,
  ) {
    const incomingSteps = Array.isArray(body.steps) ? body.steps : [];
    const incomingEnergy = Array.isArray(body.energySources) ? body.energySources : [];
    const incomingPoints = Array.isArray(body.isolationPoints) ? body.isolationPoints : [];
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
        String(
          row.lockoutDeviceName ?? row.isolationLocationText ?? row.label ?? energyType,
        ).trim() || `Point ${index + 1}`;
      const isolationId = createId();
      await tx.insert(industrialLotoIsolationPoints).values({
        id: isolationId,
        tenantId: principal.tenantId,
        procedureId,
        energySourceId: energyId,
        label: isolationLabel,
        locationDescription:
          String(row.isolationLocationText ?? row.locationDescription ?? "").trim() || null,
        isolationMethod: String(row.isolationAction ?? row.isolationMethod ?? "").trim() || null,
        sortOrder: index,
        sourceSystem: "FORGE",
        sourcePayload: row,
        createdAt: now,
        updatedAt: now,
      });
      const instruction =
        String(
          row.printedProcedureDescription ?? row.printedDescription ?? row.instruction ?? "",
        ).trim() ||
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
  }

  async updateLoto(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
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
      if (!existing) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      // Merge the full form body (equipment/step photos, steps, department, etc.).
      // Create stores `body` wholesale; updates previously only copied a few fields
      // and silently dropped equipmentImage* / steps from source_payload.
      const nextPayload: Record<string, unknown> = { ...payload, ...body };
      const equipmentName =
        body.equipmentName !== undefined ? String(body.equipmentName).trim() : undefined;
      if (equipmentName !== undefined) {
        nextPayload.equipmentName = equipmentName;
        nextPayload.equipment = equipmentName;
        if (equipmentName) nextPayload.equipmentUnit = equipmentName;
      }
      if (body.scope !== undefined) {
        nextPayload.scope = typeof body.scope === "string" ? body.scope.trim() : "";
      }
      if (body.areaName !== undefined) {
        const areaName = String(body.areaName ?? "").trim();
        nextPayload.areaName = areaName;
        nextPayload.areaNameSnapshot = areaName;
        nextPayload.area = areaName;
      }
      if (body.notes !== undefined) nextPayload.notes = body.notes;

      const now = new Date();
      const patch: Record<string, unknown> = {
        sourcePayload: nextPayload,
        updatedAt: now,
      };
      if (body.title !== undefined) {
        const title = String(body.title ?? "").trim();
        if (!title) throw new ForgeError("VALIDATION_FAILED", "Title cannot be empty.");
        patch.title = title;
      } else if (equipmentName) {
        patch.title = equipmentName ? `${equipmentName} LOTO` : existing.title;
      }
      if (body.procedureNumber !== undefined) {
        patch.procedureNumber =
          String(body.procedureNumber ?? "").trim() || existing.procedureNumber;
      }
      if (body.revision !== undefined) {
        patch.revision = String(body.revision ?? "").trim() || existing.revision;
      }
      if (body.siteId !== undefined) {
        const siteId = String(body.siteId ?? "").trim();
        patch.siteId = UUID_PATTERN.test(siteId) ? siteId : null;
      }
      if (body.equipmentId !== undefined) {
        const equipmentId = String(body.equipmentId ?? "").trim();
        patch.equipmentId = UUID_PATTERN.test(equipmentId) ? equipmentId : null;
      }

      const [row] = await tx
        .update(industrialLotoProcedures)
        .set(patch as never)
        .where(
          and(
            eq(industrialLotoProcedures.id, recordId),
            eq(industrialLotoProcedures.tenantId, principal.tenantId),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "LOTO procedure not found");

      if (Array.isArray(body.steps)) {
        await this.archiveLotoProcedureChildren(tx, principal.tenantId, recordId, now);
        await this.insertLotoProcedureChildren(tx, principal, recordId, body, now);
      }
    });
    return this.getLotoDetail(principal, recordId);
  }

  async issueLotoLockout(
    principal: ForgePrincipal,
    procedureId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(procedureId);
    const authorizedEmployee = String(body.authorizedEmployee ?? body.workerName ?? "").trim();
    if (!authorizedEmployee) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Authorized employee is required to issue a lockout.",
      );
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
          "Approve the procedure (EHS Director) before issuing a lockout.",
        );
      }
      const now = new Date();
      const lockoutId = createId();
      const [energySources, isolationPoints, steps] = await Promise.all([
        tx
          .select()
          .from(industrialLotoEnergySources)
          .where(
            and(
              eq(industrialLotoEnergySources.tenantId, principal.tenantId),
              eq(industrialLotoEnergySources.procedureId, proc.id),
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
              eq(industrialLotoIsolationPoints.procedureId, proc.id),
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
              eq(industrialLotoSteps.procedureId, proc.id),
              isNull(industrialLotoSteps.archivedAt),
            ),
          )
          .orderBy(industrialLotoSteps.stepNumber),
      ]);
      const procPayload = this.unwrapSourcePayload(proc.sourcePayload);
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
            equipmentName:
              String(procPayload.equipmentName ?? "").trim() ||
              String(body.equipmentName ?? "").trim() ||
              null,
            energySources: energySources.map((e, i) => ({
              id: e.id,
              energyType: e.energyType,
              magnitude: e.magnitude,
              sortOrder: e.sortOrder ?? i,
            })),
            isolationPoints: isolationPoints.map((p, i) => ({
              id: p.id,
              label: p.label,
              locationDescription: p.locationDescription,
              isolationMethod: p.isolationMethod,
              sortOrder: p.sortOrder ?? i,
            })),
            steps: steps.map((s) => ({
              id: s.id,
              stepNumber: s.stepNumber,
              stepPhase: s.stepPhase,
              instruction: s.instruction,
              isVerification: s.isVerification,
            })),
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapLotoLockout(row!);
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
      action === "verify"
        ? "VERIFIED"
        : action === "close"
          ? "CLOSED"
          : String(body.status ?? "").trim();
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
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Confirm zero-energy verification before continuing.",
          );
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
                  tryStartCompleted:
                    body.tryStartCompleted === true || body.tryStartCompleted === "true",
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
      return this.mapLotoLockout(row!);
    });
  }

  async lotoPrintable(principal: ForgePrincipal, id: string) {
    const detail = await this.getLotoDetail(principal, id);
    const procedure = (detail as Record<string, unknown>).procedure as
      Record<string, unknown> | undefined;
    const equipmentLabel =
      String(
        (detail as Record<string, unknown>).equipmentName ??
          procedure?.equipmentName ??
          (detail as Record<string, unknown>).title ??
          "",
      ).trim() || "LOTO procedure";

    let qrImageDataUrl: string | null = null;
    if (this.qr) {
      try {
        const qr = await this.qr.resolveLotoProcedureQrPng(principal, id, {
          label: equipmentLabel,
          appBaseUrl:
            process.env.FORGE_INDUSTRIAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || null,
        });
        qrImageDataUrl = qr?.dataUrl ?? null;
      } catch {
        qrImageDataUrl = null;
      }
    }

    return {
      html: buildLotoPrintableHtml({
        detail: detail as Record<string, unknown>,
        qrImageDataUrl,
      }),
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

  private canViewWcMedical(principal: ForgePrincipal): boolean {
    return canViewWorkersCompMedical({
      isPlatformAdmin: principal.isPlatformAdmin,
      permissions: principal.permissions,
    });
  }

  private canManageWcMedical(principal: ForgePrincipal): boolean {
    return canManageWorkersCompMedical({
      isPlatformAdmin: principal.isPlatformAdmin,
      permissions: principal.permissions,
    });
  }

  private async enableWcMedicalAccess(tx: DatabaseTransaction): Promise<void> {
    await tx.execute(sql`select set_config('app.industrial_wc_medical_access', 'on', true)`);
  }

  private mapWorkersCompCase(
    row: typeof industrialWorkersCompCases.$inferSelect,
    extras: Record<string, unknown> = {},
  ) {
    const hydrated = hydrateWorkersCompFromSource({
      caseNumber: row.caseNumber,
      status: row.status,
      severity: row.severity,
      workflowStage: row.workflowStage,
      daysAway: row.daysAway,
      restrictedDays: row.restrictedDays,
      claimSummary: row.claimSummary,
      sourcePayload: row.sourcePayload,
      reportedAt: row.reportedAt,
    });
    const claimSummary = syncWorkersCompClaimNumber(hydrated.caseNumber, hydrated.claimSummary);
    const osha = parseWorkersCompOshaLinkage(hydrated.sourcePayload);
    const extrasWorker =
      typeof extras.workerName === "string" && extras.workerName.trim()
        ? extras.workerName.trim()
        : "";
    return {
      id: row.id,
      title: hydrated.caseNumber || extrasWorker || row.id,
      caseNumber: hydrated.caseNumber || row.caseNumber,
      status: hydrated.status || row.status,
      severity: hydrated.severity || row.severity,
      workflowStage: hydrated.workflowStage || row.workflowStage,
      personnelId: row.personnelId,
      incidentId: row.incidentId,
      siteId: row.siteId,
      departmentId: row.departmentId,
      reportedAt: hydrated.reportedAt
        ? new Date(`${hydrated.reportedAt}T12:00:00.000Z`).toISOString()
        : (row.reportedAt?.toISOString() ?? null),
      daysAway: hydrated.daysAway ?? row.daysAway,
      restrictedDays: hydrated.restrictedDays ?? row.restrictedDays,
      claimSummary,
      locationText: hydrated.locationText,
      notes: hydrated.notes,
      dateOfBirth: hydrated.dateOfBirth || "",
      street: hydrated.street || "",
      city: hydrated.city || "",
      state: hydrated.state || "",
      zip: hydrated.zip || "",
      gender: hydrated.gender || "",
      nextAction: hydrated.nextAction,
      oshaRecordable: osha.oshaRecordable,
      oshaPrivacyCase: osha.oshaPrivacyCase,
      oshaCaseId: osha.oshaCaseId || null,
      oshaJobTitle: osha.oshaJobTitle,
      oshaIllnessCategory: osha.oshaIllnessCategory,
      oshaCaseOutcome: osha.oshaCaseOutcome,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      ...extras,
      // Prefer linked personnel display name, else hydrated Firebase employee name.
      workerName: extrasWorker || hydrated.workerName,
    };
  }

  async listWorkersComp(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const status = (query.status ?? "").trim();
    const q = (query.q ?? "").trim();
    const personnelId = (query.personnelId ?? "").trim();
    const incidentId = (query.incidentId ?? "").trim();
    const canMedical = this.canViewWcMedical(principal);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const conditions = [
          eq(industrialWorkersCompCases.tenantId, principal.tenantId),
          isNull(industrialWorkersCompCases.archivedAt),
        ];
        if (status) conditions.push(eq(industrialWorkersCompCases.status, status));
        if (personnelId && UUID_PATTERN.test(personnelId)) {
          conditions.push(eq(industrialWorkersCompCases.personnelId, personnelId));
        }
        if (incidentId && UUID_PATTERN.test(incidentId)) {
          conditions.push(eq(industrialWorkersCompCases.incidentId, incidentId));
        }
        if (q) {
          const pattern = `%${q}%`;
          conditions.push(
            or(
              ilike(industrialWorkersCompCases.caseNumber, pattern),
              ilike(industrialWorkersCompCases.status, pattern),
              ilike(industrialPersonnel.displayName, pattern),
              sql`coalesce(${industrialWorkersCompCases.claimSummary}->>'claimNumber','') ILIKE ${pattern}`,
              sql`coalesce(${industrialWorkersCompCases.sourcePayload}->>'workerName','') ILIKE ${pattern}`,
              sql`coalesce(${industrialWorkersCompCases.sourcePayload}->>'notes','') ILIKE ${pattern}`,
              sql`coalesce(${industrialWorkersCompCases.claimSummary}->>'notes','') ILIKE ${pattern}`,
            )!,
          );
        }
        const items = await tx
          .select({
            case: industrialWorkersCompCases,
            personnelName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(and(...conditions))
          .orderBy(
            sql`case when upper(${industrialWorkersCompCases.status}) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT') then 0 else 1 end`,
            desc(industrialWorkersCompCases.updatedAt),
          )
          .limit(pageSize)
          .offset(offset);

        const mapped = items.map(({ case: row, personnelName }) =>
          this.mapWorkersCompCase(row, {
            workerName: personnelName ?? "",
            medicalAllowed: canMedical,
          }),
        );

        const allOpen = mapped.filter((item) => isOpenWcStatus(item.status));
        return {
          page,
          pageSize,
          summary: {
            total: mapped.length,
            open: allOpen.length,
            restricted: allOpen.filter((i) => wcSeverityKey(i.severity) === "restricted").length,
            lostTime: allOpen.filter(
              (i) => wcSeverityKey(i.severity) === "lost_time" || (i.daysAway ?? 0) > 0,
            ).length,
            closed: mapped.filter((i) => i.status.toUpperCase() === "CLOSED").length,
          },
          items: mapped,
        };
      },
      principal.userId,
    );
  }

  async getWorkersComp(principal: ForgePrincipal, id: string) {
    const canMedical = this.canViewWcMedical(principal);
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        if (canMedical) await this.enableWcMedicalAccess(tx);
        const [joined] = await tx
          .select({
            case: industrialWorkersCompCases,
            personnelName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!joined) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");

        const workStatus = await tx
          .select()
          .from(industrialWorkersCompWorkStatusPeriods)
          .where(
            and(
              eq(industrialWorkersCompWorkStatusPeriods.tenantId, principal.tenantId),
              eq(industrialWorkersCompWorkStatusPeriods.caseId, recordId),
              isNull(industrialWorkersCompWorkStatusPeriods.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompWorkStatusPeriods.updatedAt))
          .limit(100);

        const restrictions = await tx
          .select()
          .from(industrialWorkersCompRestrictions)
          .where(
            and(
              eq(industrialWorkersCompRestrictions.tenantId, principal.tenantId),
              eq(industrialWorkersCompRestrictions.caseId, recordId),
              isNull(industrialWorkersCompRestrictions.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompRestrictions.updatedAt))
          .limit(100);

        let medical: unknown[] = [];
        if (canMedical) {
          const medicalRows = await tx
            .select()
            .from(industrialWorkersCompMedicalEncounters)
            .where(
              and(
                eq(industrialWorkersCompMedicalEncounters.tenantId, principal.tenantId),
                eq(industrialWorkersCompMedicalEncounters.caseId, recordId),
                isNull(industrialWorkersCompMedicalEncounters.archivedAt),
              ),
            )
            .orderBy(desc(industrialWorkersCompMedicalEncounters.createdAt))
            .limit(200);
          medical = medicalRows.map((row) => this.mapMedicalEncounter(row, principal));
        }

        return this.mapWorkersCompCase(joined.case, {
          workerName: joined.personnelName ?? "",
          medicalAllowed: canMedical,
          medical: canMedical ? medical : undefined,
          medicalDeniedReason: canMedical
            ? undefined
            : "You don't have permission to view medical details for this case.",
          workStatus: workStatus.map((r) => {
            const createdByUserId =
              r.createdByUserId ??
              (() => {
                const payload = this.unwrapSourcePayload(r.sourcePayload);
                return typeof payload.createdByUserId === "string" ? payload.createdByUserId : null;
              })();
            return {
              id: r.id,
              status: r.status,
              startDate: r.startDate,
              endDate: r.endDate,
              notes: r.notes,
              createdByUserId,
              canEditNotes: canEditWorkersCompAuthoredNote({
                isPlatformAdmin: principal.isPlatformAdmin,
                permissions: principal.permissions,
                userId: principal.userId,
                createdByUserId,
                canManageResource:
                  principal.isPlatformAdmin ||
                  principal.permissions.has("industrial.admin") ||
                  principal.permissions.has("industrial.workers_comp.manage"),
              }),
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            };
          }),
          restrictions: restrictions.map((r) => {
            const accommodations = readAccommodationsFromSourcePayload(r.sourcePayload);
            return {
              id: r.id,
              description: r.description,
              startDate: r.startDate,
              endDate: r.endDate,
              status: r.status,
              ...(accommodationsPayloadHasContent(accommodations) ? { accommodations } : {}),
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            };
          }),
        });
      },
      principal.userId,
    );
  }

  /** Printable HTML packet: WC claim + linked incident + status / restrictions / medical. */
  async workersCompPrintable(principal: ForgePrincipal, id: string) {
    const workersComp = (await this.getWorkersComp(principal, id)) as Record<string, unknown>;
    const incidentId =
      typeof workersComp.incidentId === "string" && UUID_PATTERN.test(workersComp.incidentId)
        ? workersComp.incidentId
        : null;

    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      let incident: Record<string, unknown> | null = null;
      if (incidentId) {
        const [row] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, incidentId),
              eq(industrialIncidents.tenantId, principal.tenantId),
              isNull(industrialIncidents.archivedAt),
            ),
          )
          .limit(1);
        if (row) {
          incident = this.mapListItem({
            id: row.id,
            title: row.title,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            sourcePayload: this.unwrapSourcePayload(row.sourcePayload),
            extra: { siteId: row.siteId },
          }) as Record<string, unknown>;
        }
      }
      const branding = await this.loadFormPrintBranding(tx, principal.tenantId);
      const html = buildWorkersCompPrintableHtml({
        workersComp,
        incident,
        branding,
      });
      return { html, title: workersCompPrintTitle(workersComp) };
    });
  }

  async createWorkersComp(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        let personnelId =
          typeof body.personnelId === "string" && UUID_PATTERN.test(body.personnelId)
            ? body.personnelId
            : null;
        const incidentId =
          typeof body.incidentId === "string" && UUID_PATTERN.test(body.incidentId)
            ? body.incidentId
            : null;
        const siteId =
          typeof body.siteId === "string" && UUID_PATTERN.test(body.siteId) ? body.siteId : null;
        const departmentId =
          typeof body.departmentId === "string" && UUID_PATTERN.test(body.departmentId)
            ? body.departmentId
            : null;

        // Serialize case creation per tenant so concurrent submits cannot both insert.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`industrial-wc-create:${principal.tenantId}`}))`,
        );

        // Opening from an incident should reuse the existing case when present.
        if (incidentId) {
          const [existing] = await tx
            .select()
            .from(industrialWorkersCompCases)
            .where(
              and(
                eq(industrialWorkersCompCases.tenantId, principal.tenantId),
                eq(industrialWorkersCompCases.incidentId, incidentId),
                isNull(industrialWorkersCompCases.archivedAt),
              ),
            )
            .orderBy(desc(industrialWorkersCompCases.updatedAt))
            .limit(1);
          if (existing) {
            await this.linkWorkersCompCaseToIncident(
              tx,
              principal.tenantId,
              incidentId,
              existing.id,
              now,
            );
            return this.mapWorkersCompCase(existing);
          }
        }

        const workerNameHint = String(body.workerName ?? body.personnelName ?? "").trim();
        if (!personnelId && workerNameHint) {
          const [match] = await tx
            .select({ id: industrialPersonnel.id })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.tenantId, principal.tenantId),
                isNull(industrialPersonnel.archivedAt),
                ilike(industrialPersonnel.displayName, workerNameHint),
              ),
            )
            .limit(1);
          if (match) personnelId = match.id;
        }

        const claimSummaryRaw = parseWorkersCompClaimSummary(body.claimSummary ?? body);
        // Claim # stays empty until entered manually (insurance assignment). Do not auto-generate.
        const caseNumber = resolveWorkersCompCaseNumber(body);
        const claimSummary = syncWorkersCompClaimNumber(caseNumber, claimSummaryRaw);
        const reportedAtRaw = body.reportedAt ?? body.dateOfInjury ?? claimSummary.dateOfInjury;
        const reportedAt =
          typeof reportedAtRaw === "string" && reportedAtRaw.trim() ? new Date(reportedAtRaw) : now;

        // Same worker + same date of injury is the same claim: reuse the open case instead of inserting.
        const injuryDateKey = workersCompInjuryDateKey(
          claimSummary.dateOfInjury,
          Number.isNaN(reportedAt.getTime()) ? now : reportedAt,
        );
        let workerKey = normalizeWorkersCompWorkerKey(workerNameHint);
        if (!workerKey && personnelId) {
          const [person] = await tx
            .select({ displayName: industrialPersonnel.displayName })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, personnelId),
                eq(industrialPersonnel.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          workerKey = normalizeWorkersCompWorkerKey(person?.displayName);
        }
        if (injuryDateKey && (workerKey || personnelId)) {
          const injuryDateExpr = sql`left(coalesce(
          nullif(trim(${industrialWorkersCompCases.claimSummary}->>'dateOfInjury'), ''),
          nullif(trim(${industrialWorkersCompCases.sourcePayload}->'intake'->>'incidentDate'), ''),
          nullif(trim(${industrialWorkersCompCases.sourcePayload}->'claim'->>'dateOfInjury'), ''),
          to_char((${industrialWorkersCompCases.reportedAt} at time zone 'UTC')::date, 'YYYY-MM-DD')
        ), 10)`;
          const workerExpr = sql`lower(regexp_replace(trim(coalesce(
          nullif(trim(${industrialPersonnel.displayName}), ''),
          nullif(trim(${industrialWorkersCompCases.sourcePayload}->>'workerName'), ''),
          ''
        )), '[[:space:]]+', ' ', 'g'))`;
          const workerMatches = [
            ...(personnelId ? [eq(industrialWorkersCompCases.personnelId, personnelId)] : []),
            ...(workerKey ? [sql`${workerExpr} = ${workerKey}`] : []),
          ];
          const [duplicate] = await tx
            .select({
              case: industrialWorkersCompCases,
              personnelName: industrialPersonnel.displayName,
            })
            .from(industrialWorkersCompCases)
            .leftJoin(
              industrialPersonnel,
              eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
            )
            .where(
              and(
                eq(industrialWorkersCompCases.tenantId, principal.tenantId),
                isNull(industrialWorkersCompCases.archivedAt),
                sql`${injuryDateExpr} = ${injuryDateKey}`,
                or(...workerMatches)!,
              ),
            )
            .orderBy(
              sql`case when upper(${industrialWorkersCompCases.status}) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT') then 0 else 1 end`,
              industrialWorkersCompCases.createdAt,
            )
            .limit(1);
          if (duplicate) {
            let existing = duplicate.case;
            if (incidentId) {
              if (!existing.incidentId) {
                const [relinked] = await tx
                  .update(industrialWorkersCompCases)
                  .set({ incidentId, updatedAt: now })
                  .where(eq(industrialWorkersCompCases.id, existing.id))
                  .returning();
                if (relinked) existing = relinked;
              }
              await this.linkWorkersCompCaseToIncident(
                tx,
                principal.tenantId,
                incidentId,
                existing.id,
                now,
              );
            }
            return this.mapWorkersCompCase(existing, { workerName: duplicate.personnelName ?? "" });
          }
        }

        let dateOfBirth = optionalDate(body.dateOfBirth) ?? "";
        let street = String(body.street ?? "").trim();
        let city = String(body.city ?? "").trim();
        let state = String(body.state ?? "").trim();
        let zip = String(body.zip ?? body.zipCode ?? "").trim();
        let gender = normalizeWorkersCompGender(body.gender ?? body.sex);
        if (personnelId) {
          const [person] = await tx
            .select({
              dateOfBirth: industrialPersonnel.dateOfBirth,
              street: industrialPersonnel.street,
              city: industrialPersonnel.city,
              state: industrialPersonnel.state,
              zip: industrialPersonnel.zip,
              gender: industrialPersonnel.gender,
            })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, personnelId),
                eq(industrialPersonnel.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!dateOfBirth) {
            dateOfBirth = person?.dateOfBirth ? String(person.dateOfBirth).slice(0, 10) : "";
            if (!dateOfBirth) {
              const [driver] = await tx
                .select({ dateOfBirth: industrialFleetDrivers.dateOfBirth })
                .from(industrialFleetDrivers)
                .where(
                  and(
                    eq(industrialFleetDrivers.tenantId, principal.tenantId),
                    eq(industrialFleetDrivers.personnelId, personnelId),
                    isNull(industrialFleetDrivers.archivedAt),
                  ),
                )
                .limit(1);
              dateOfBirth = driver?.dateOfBirth ? String(driver.dateOfBirth).slice(0, 10) : "";
            }
          }
          if (!street) street = person?.street?.trim() || "";
          if (!city) city = person?.city?.trim() || "";
          if (!state) state = person?.state?.trim() || "";
          if (!zip) zip = person?.zip?.trim() || "";
          if (!gender) gender = normalizeWorkersCompGender(person?.gender);
        }
        const [row] = await tx
          .insert(industrialWorkersCompCases)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            caseNumber,
            personnelId,
            incidentId,
            siteId,
            departmentId,
            status: normalizeWcCaseStatus(body.status),
            severity: body.severity ? String(body.severity) : null,
            workflowStage: body.workflowStage ? String(body.workflowStage) : "INTAKE",
            reportedAt: Number.isNaN(reportedAt.getTime()) ? now : reportedAt,
            daysAway: body.daysAway != null ? Number(body.daysAway) || 0 : null,
            restrictedDays: body.restrictedDays != null ? Number(body.restrictedDays) || 0 : null,
            claimSummary,
            sourceSystem: "FORGE",
            sourcePayload: {
              workerName: body.workerName ?? body.personnelName ?? "",
              locationText: body.locationText ?? "",
              notes: body.notes ?? "",
              category: body.category ?? "cases",
              ...(dateOfBirth ? { dateOfBirth } : {}),
              ...(street ? { street } : {}),
              ...(city ? { city } : {}),
              ...(state ? { state } : {}),
              ...(zip ? { zip } : {}),
              ...(gender ? { gender } : {}),
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (incidentId && row) {
          await this.linkWorkersCompCaseToIncident(tx, principal.tenantId, incidentId, row.id, now);
        }
        return this.mapWorkersCompCase(row!);
      },
      principal.userId,
    );
  }

  /**
   * Keep the incident → WC reverse pointer in source_payload so the incident UI
   * can open the linked case without an extra lookup.
   */
  private async linkWorkersCompCaseToIncident(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
    caseId: string,
    now: Date,
  ) {
    const [incident] = await tx
      .select()
      .from(industrialIncidents)
      .where(
        and(
          eq(industrialIncidents.id, incidentId),
          eq(industrialIncidents.tenantId, tenantId),
          isNull(industrialIncidents.archivedAt),
        ),
      )
      .limit(1);
    if (!incident) return;
    const payload = this.unwrapSourcePayload(incident.sourcePayload);
    if (
      String(payload.workersCompCaseId ?? "").trim() === caseId &&
      payload.workersCompRelevant === true
    ) {
      return;
    }
    await tx
      .update(industrialIncidents)
      .set({
        sourcePayload: {
          ...payload,
          workersCompCaseId: caseId,
          workersCompRelevant: true,
        },
        updatedAt: now,
      })
      .where(eq(industrialIncidents.id, incidentId));
  }

  async listWorkersCompMedical(principal: ForgePrincipal, caseId: string) {
    if (!this.canViewWcMedical(principal)) {
      throw new ForgeError("FORBIDDEN", "Missing industrial.workers_comp.medical.view");
    }
    const recordId = this.assertRecordId(caseId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.enableWcMedicalAccess(tx);
        await this.assertWcCase(tx, principal.tenantId, recordId);
        const rows = await tx
          .select()
          .from(industrialWorkersCompMedicalEncounters)
          .where(
            and(
              eq(industrialWorkersCompMedicalEncounters.tenantId, principal.tenantId),
              eq(industrialWorkersCompMedicalEncounters.caseId, recordId),
              isNull(industrialWorkersCompMedicalEncounters.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompMedicalEncounters.createdAt))
          .limit(100);
        return { items: rows.map((row) => this.mapMedicalEncounter(row, principal)) };
      },
      principal.userId,
    );
  }

  async updateWorkersComp(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialWorkersCompCases)
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");

        const payload = this.unwrapSourcePayload(existing.sourcePayload);
        const priorOsha = parseWorkersCompOshaLinkage(payload);
        const claimSummaryMerged = mergeWorkersCompClaimSummary(
          existing.claimSummary,
          body.claimSummary ?? body,
        );
        const caseNumber =
          resolveWorkersCompCaseNumber(body, existing.caseNumber) ?? existing.caseNumber;
        const claimSummary = syncWorkersCompClaimNumber(caseNumber, claimSummaryMerged);
        const existingClaim = asRecord(payload.claim) ?? {};

        const oshaRecordable =
          body.oshaRecordable !== undefined
            ? body.oshaRecordable === true ||
              body.oshaRecordable === "true" ||
              body.oshaRecordable === 1 ||
              body.oshaRecordable === "1"
            : priorOsha.oshaRecordable;
        const oshaPrivacyCase =
          body.oshaPrivacyCase !== undefined
            ? body.oshaPrivacyCase === true ||
              body.oshaPrivacyCase === "true" ||
              body.oshaPrivacyCase === 1 ||
              body.oshaPrivacyCase === "1"
            : priorOsha.oshaPrivacyCase;
        const oshaJobTitle =
          body.oshaJobTitle !== undefined
            ? String(body.oshaJobTitle ?? "").trim()
            : priorOsha.oshaJobTitle;
        const oshaIllnessCategory =
          body.oshaIllnessCategory !== undefined
            ? String(body.oshaIllnessCategory ?? "").trim() || "1"
            : priorOsha.oshaIllnessCategory;
        const oshaCaseOutcome =
          body.oshaCaseOutcome !== undefined
            ? String(body.oshaCaseOutcome ?? "").trim()
            : priorOsha.oshaCaseOutcome;

        const nextPayload: Record<string, unknown> = {
          ...payload,
          ...(body.workerName != null ? { workerName: String(body.workerName) } : {}),
          ...(body.locationText != null ? { locationText: String(body.locationText) } : {}),
          ...(body.notes != null ? { notes: String(body.notes) } : {}),
          // Hydrate reads source workflowStage before the column; keep them in sync so saves stick.
          ...(body.workflowStage != null && String(body.workflowStage).trim()
            ? { workflowStage: String(body.workflowStage).trim() }
            : {}),
          ...(body.dateOfBirth !== undefined
            ? { dateOfBirth: optionalDate(body.dateOfBirth) ?? "" }
            : {}),
          ...(body.street !== undefined ? { street: String(body.street ?? "").trim() } : {}),
          ...(body.city !== undefined ? { city: String(body.city ?? "").trim() } : {}),
          ...(body.state !== undefined ? { state: String(body.state ?? "").trim() } : {}),
          ...(body.zip !== undefined || body.zipCode !== undefined
            ? { zip: String(body.zip ?? body.zipCode ?? "").trim() }
            : {}),
          ...(body.gender !== undefined || body.sex !== undefined
            ? { gender: normalizeWorkersCompGender(body.gender ?? body.sex) }
            : {}),
          // Keep source claim in sync with claim_summary so hydrate cannot revert saves.
          claim: {
            ...existingClaim,
            ...claimSummary,
          },
          oshaRecordable,
          oshaPrivacyCase,
          oshaJobTitle,
          oshaIllnessCategory,
          oshaCaseOutcome,
          oshaCaseId: priorOsha.oshaCaseId,
        };

        const nextPersonnelId =
          body.personnelId !== undefined
            ? typeof body.personnelId === "string" && UUID_PATTERN.test(body.personnelId)
              ? body.personnelId
              : null
            : existing.personnelId;
        if (nextPersonnelId) {
          const needsDob = !String(nextPayload.dateOfBirth ?? "").trim();
          const needsStreet = !String(nextPayload.street ?? "").trim();
          const needsCity = !String(nextPayload.city ?? "").trim();
          const needsState = !String(nextPayload.state ?? "").trim();
          const needsZip = !String(nextPayload.zip ?? "").trim();
          const needsGender = !String(nextPayload.gender ?? "").trim();
          if (needsDob || needsStreet || needsCity || needsState || needsZip || needsGender) {
            const [person] = await tx
              .select({
                dateOfBirth: industrialPersonnel.dateOfBirth,
                street: industrialPersonnel.street,
                city: industrialPersonnel.city,
                state: industrialPersonnel.state,
                zip: industrialPersonnel.zip,
                gender: industrialPersonnel.gender,
              })
              .from(industrialPersonnel)
              .where(
                and(
                  eq(industrialPersonnel.id, nextPersonnelId),
                  eq(industrialPersonnel.tenantId, principal.tenantId),
                ),
              )
              .limit(1);
            if (person) {
              if (needsDob && person.dateOfBirth) {
                nextPayload.dateOfBirth = String(person.dateOfBirth).slice(0, 10);
              }
              if (needsStreet && person.street?.trim()) nextPayload.street = person.street.trim();
              if (needsCity && person.city?.trim()) nextPayload.city = person.city.trim();
              if (needsState && person.state?.trim()) nextPayload.state = person.state.trim();
              if (needsZip && person.zip?.trim()) nextPayload.zip = person.zip.trim();
              if (needsGender) {
                const fromPerson = normalizeWorkersCompGender(person.gender);
                if (fromPerson) nextPayload.gender = fromPerson;
              }
            }
          }
        }

        const reportedAt =
          body.reportedAt != null && String(body.reportedAt).trim()
            ? new Date(String(body.reportedAt))
            : existing.reportedAt;

        const [row] = await tx
          .update(industrialWorkersCompCases)
          .set({
            caseNumber,
            status: normalizeWcCaseStatus(body.status != null ? body.status : existing.status),
            severity: body.severity != null ? String(body.severity) || null : existing.severity,
            workflowStage:
              body.workflowStage != null
                ? String(body.workflowStage) || null
                : existing.workflowStage,
            personnelId:
              body.personnelId !== undefined
                ? typeof body.personnelId === "string" && UUID_PATTERN.test(body.personnelId)
                  ? body.personnelId
                  : null
                : existing.personnelId,
            incidentId:
              body.incidentId !== undefined
                ? typeof body.incidentId === "string" && UUID_PATTERN.test(body.incidentId)
                  ? body.incidentId
                  : null
                : existing.incidentId,
            siteId:
              body.siteId !== undefined
                ? typeof body.siteId === "string" && UUID_PATTERN.test(body.siteId)
                  ? body.siteId
                  : null
                : existing.siteId,
            departmentId:
              body.departmentId !== undefined
                ? typeof body.departmentId === "string" && UUID_PATTERN.test(body.departmentId)
                  ? body.departmentId
                  : null
                : existing.departmentId,
            reportedAt:
              reportedAt && !Number.isNaN(reportedAt.getTime()) ? reportedAt : existing.reportedAt,
            daysAway: body.daysAway !== undefined ? Number(body.daysAway) || 0 : existing.daysAway,
            restrictedDays:
              body.restrictedDays !== undefined
                ? Number(body.restrictedDays) || 0
                : existing.restrictedDays,
            claimSummary,
            sourcePayload: nextPayload,
            updatedAt: new Date(),
          } as never)
          .where(eq(industrialWorkersCompCases.id, recordId))
          .returning();

        const mapped = this.mapWorkersCompCase(row!);
        const nextIncidentId = mapped.incidentId?.trim() || "";
        const prevIncidentId = existing.incidentId?.trim() || "";
        if (nextIncidentId && UUID_PATTERN.test(nextIncidentId)) {
          await this.linkWorkersCompCaseToIncident(
            tx,
            principal.tenantId,
            nextIncidentId,
            recordId,
            new Date(),
          );
        }
        if (
          prevIncidentId &&
          UUID_PATTERN.test(prevIncidentId) &&
          prevIncidentId !== nextIncidentId
        ) {
          const [prevIncident] = await tx
            .select()
            .from(industrialIncidents)
            .where(
              and(
                eq(industrialIncidents.id, prevIncidentId),
                eq(industrialIncidents.tenantId, principal.tenantId),
                isNull(industrialIncidents.archivedAt),
              ),
            )
            .limit(1);
          if (prevIncident) {
            const prevPayload = this.unwrapSourcePayload(prevIncident.sourcePayload);
            if (String(prevPayload.workersCompCaseId ?? "").trim() === recordId) {
              const { workersCompCaseId: _removed, ...rest } = prevPayload;
              await tx
                .update(industrialIncidents)
                .set({
                  sourcePayload: rest,
                  updatedAt: new Date(),
                })
                .where(eq(industrialIncidents.id, prevIncidentId));
            }
          }
        }

        const synced = await this.syncOshaFromWorkersCompCase(tx, principal, {
          caseId: recordId,
          mapped,
          sourcePayload: this.unwrapSourcePayload(row!.sourcePayload),
        });
        return synced;
      },
      principal.userId,
    );
  }

  /**
   * When a WC case is marked OSHA-recordable, create/update the linked OSHA Form 300
   * case from WC inputs. Clearing the flag marks the OSHA case not-recordable.
   */
  private async syncOshaFromWorkersCompCase(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    input: {
      caseId: string;
      mapped: ReturnType<IndustrialDomainService["mapWorkersCompCase"]>;
      sourcePayload: Record<string, unknown>;
    },
  ) {
    const linkage = parseWorkersCompOshaLinkage(input.sourcePayload);
    const incidentId = String(input.mapped.incidentId ?? "").trim();
    let oshaCaseId = linkage.oshaCaseId;
    const now = new Date();

    if (!linkage.oshaRecordable && !oshaCaseId) {
      return input.mapped;
    }

    if (linkage.oshaRecordable && !incidentId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Link an injury incident before marking this workers' compensation case as OSHA recordable.",
      );
    }

    let siteName = "";
    if (input.mapped.siteId && UUID_PATTERN.test(input.mapped.siteId)) {
      const [site] = await tx
        .select({ name: industrialSites.name })
        .from(industrialSites)
        .where(
          and(
            eq(industrialSites.id, input.mapped.siteId),
            eq(industrialSites.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      siteName = site?.name?.trim() || "";
    }

    const recordability = (
      linkage.oshaRecordable
        ? linkage.oshaPrivacyCase
          ? "PRIVACY_CASE"
          : "RECORDABLE"
        : "NOT_RECORDABLE"
    ) as OshaRecordability;
    const flags = oshaFlagsFromRecordability(recordability);
    let formFields = oshaPayloadFromWorkersComp({
      workerName: String(input.mapped.workerName ?? ""),
      locationText: String(input.mapped.locationText ?? ""),
      notes: String(input.mapped.notes ?? ""),
      daysAway: input.mapped.daysAway ?? null,
      restrictedDays: input.mapped.restrictedDays ?? null,
      severity: String(input.mapped.severity ?? ""),
      claimSummary: input.mapped.claimSummary,
      siteName,
      osha: linkage,
      dateOfBirth: String(input.mapped.dateOfBirth ?? ""),
      street: String(input.mapped.street ?? ""),
      city: String(input.mapped.city ?? ""),
      state: String(input.mapped.state ?? ""),
      zip: String(input.mapped.zip ?? ""),
      gender: String(input.mapped.gender ?? ""),
    });

    // Prefer WC claim fields, then fill Form 301 blanks from the linked incident
    // (Date occurred → line 11 date + line 13 time, physician block, etc.).
    if (incidentId && UUID_PATTERN.test(incidentId)) {
      const [incident] = await tx
        .select()
        .from(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.id, incidentId),
            eq(industrialIncidents.tenantId, principal.tenantId),
            isNull(industrialIncidents.archivedAt),
          ),
        )
        .limit(1);
      if (incident) {
        const incidentPayload = this.unwrapSourcePayload(incident.sourcePayload);
        const personnelId =
          String(input.mapped.personnelId ?? "").trim() ||
          String(incidentPayload.personnelId ?? "").trim();
        const personnel = await this.loadPersonnelRecordForOsha(
          tx,
          principal.tenantId,
          personnelId,
        );
        const incidentSeed = this.incidentFieldsForOsha(incident, personnel).form301Seed;
        formFields = mergeOshaSeedPreferExisting(formFields, incidentSeed);
      }
    }

    if (oshaCaseId && UUID_PATTERN.test(oshaCaseId)) {
      const [existingOsha] = await tx
        .select()
        .from(industrialOshaCases)
        .where(
          and(
            eq(industrialOshaCases.id, oshaCaseId),
            eq(industrialOshaCases.tenantId, principal.tenantId),
            isNull(industrialOshaCases.archivedAt),
          ),
        )
        .limit(1);
      if (existingOsha) {
        const payload = this.unwrapSourcePayload(existingOsha.sourcePayload);
        const nextPayload = {
          ...mergeOshaCasePayloadFields(payload, formFields),
          recordabilityStatus: recordability,
          oshaRecordable: flags.oshaRecordable,
          privacyCase: flags.privacyCase,
          workersCompCaseId: input.caseId,
          incidentId: incidentId || payload.incidentId,
        };
        await tx
          .update(industrialOshaCases)
          .set({
            siteId: input.mapped.siteId || existingOsha.siteId,
            recordDate:
              typeof formFields.injuryDate === "string" && formFields.injuryDate
                ? formFields.injuryDate
                : existingOsha.recordDate,
            sourcePayload: nextPayload,
            updatedAt: now,
          } as never)
          .where(eq(industrialOshaCases.id, oshaCaseId));
      } else {
        oshaCaseId = "";
      }
    }

    if (linkage.oshaRecordable && !oshaCaseId) {
      // Prefer existing OSHA case for the same incident.
      if (incidentId) {
        const existing = await tx
          .select({ id: industrialOshaCases.id, sourcePayload: industrialOshaCases.sourcePayload })
          .from(industrialOshaCases)
          .where(
            and(
              eq(industrialOshaCases.tenantId, principal.tenantId),
              isNull(industrialOshaCases.archivedAt),
            ),
          );
        for (const row of existing) {
          const payload = this.unwrapSourcePayload(row.sourcePayload);
          if (String(payload.incidentId ?? "").trim() === incidentId) {
            oshaCaseId = row.id;
            const nextPayload = {
              ...mergeOshaCasePayloadFields(payload, formFields),
              recordabilityStatus: recordability,
              oshaRecordable: flags.oshaRecordable,
              privacyCase: flags.privacyCase,
              workersCompCaseId: input.caseId,
              incidentId,
            };
            await tx
              .update(industrialOshaCases)
              .set({
                siteId: input.mapped.siteId || null,
                recordDate:
                  typeof formFields.injuryDate === "string" && formFields.injuryDate
                    ? formFields.injuryDate
                    : null,
                sourcePayload: nextPayload,
                updatedAt: now,
              } as never)
              .where(eq(industrialOshaCases.id, oshaCaseId));
            break;
          }
        }
      }

      if (!oshaCaseId) {
        const caseCount = (
          await tx
            .select({ id: industrialOshaCases.id })
            .from(industrialOshaCases)
            .where(
              and(
                eq(industrialOshaCases.tenantId, principal.tenantId),
                isNull(industrialOshaCases.archivedAt),
              ),
            )
        ).length;
        oshaCaseId = createId();
        const title =
          String(formFields.employeeName ?? "").trim() ||
          String(input.mapped.caseNumber ?? "").trim() ||
          "OSHA case";
        await tx.insert(industrialOshaCases).values({
          id: oshaCaseId,
          tenantId: principal.tenantId,
          siteId: input.mapped.siteId || null,
          title,
          status: "OPEN",
          recordDate:
            typeof formFields.injuryDate === "string" && formFields.injuryDate
              ? formFields.injuryDate
              : null,
          personnelId: input.mapped.personnelId || null,
          sourceSystem: "FORGE",
          sourcePayload: {
            ...mergeOshaCasePayloadFields({}, formFields),
            incidentId,
            title,
            caseNumber: String(caseCount + 1),
            recordabilityStatus: recordability,
            oshaRecordable: flags.oshaRecordable,
            privacyCase: flags.privacyCase,
            workersCompCaseId: input.caseId,
            reviewer: "",
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (oshaCaseId !== linkage.oshaCaseId) {
      const nextPayload = {
        ...input.sourcePayload,
        oshaCaseId,
        oshaRecordable: linkage.oshaRecordable,
        oshaPrivacyCase: linkage.oshaPrivacyCase,
        oshaJobTitle: linkage.oshaJobTitle,
        oshaIllnessCategory: linkage.oshaIllnessCategory,
        oshaCaseOutcome: linkage.oshaCaseOutcome,
      };
      await tx
        .update(industrialWorkersCompCases)
        .set({ sourcePayload: nextPayload, updatedAt: now })
        .where(eq(industrialWorkersCompCases.id, input.caseId));
      const [refreshed] = await tx
        .select()
        .from(industrialWorkersCompCases)
        .where(eq(industrialWorkersCompCases.id, input.caseId))
        .limit(1);
      if (refreshed) {
        return this.mapWorkersCompCase(refreshed, {
          workerName: input.mapped.workerName,
        });
      }
    }

    return {
      ...input.mapped,
      oshaCaseId: oshaCaseId || null,
      oshaRecordable: linkage.oshaRecordable,
      oshaPrivacyCase: linkage.oshaPrivacyCase,
      oshaJobTitle: linkage.oshaJobTitle,
      oshaIllnessCategory: linkage.oshaIllnessCategory,
      oshaCaseOutcome: linkage.oshaCaseOutcome,
    };
  }

  async archiveWorkersComp(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(industrialWorkersCompCases)
          .set({
            status: "ARCHIVED",
            archivedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");
        return this.mapWorkersCompCase(row);
      },
      principal.userId,
    );
  }

  async listWorkersCompCarriers(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(industrialWorkersCompCarriers)
          .where(
            and(
              eq(industrialWorkersCompCarriers.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCarriers.archivedAt),
            ),
          )
          .orderBy(industrialWorkersCompCarriers.name)
          .limit(200);
        return {
          items: rows.map((r) => this.mapWorkersCompCarrier(r)),
        };
      },
      principal.userId,
    );
  }

  async createWorkersCompCarrier(principal: ForgePrincipal, body: Record<string, unknown>) {
    if (!principal.permissions.has("industrial.admin")) {
      throw new ForgeError("FORBIDDEN", "Only Industrial admins can manage the carrier catalog");
    }
    const name = String(body.name ?? "").trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Carrier name is required");
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const contact =
          body.contact && typeof body.contact === "object" && !Array.isArray(body.contact)
            ? body.contact
            : {
                phone: body.phone ?? "",
                email: body.email ?? "",
                adjuster: body.adjuster ?? "",
              };
        const [row] = await tx
          .insert(industrialWorkersCompCarriers)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            name,
            status: String(body.status ?? "ACTIVE"),
            contact,
            sourceSystem: "FORGE",
            sourcePayload: body,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return this.mapWorkersCompCarrier(row!);
      },
      principal.userId,
    );
  }

  async updateWorkersCompCarrier(
    principal: ForgePrincipal,
    carrierId: string,
    body: Record<string, unknown>,
  ) {
    if (!principal.permissions.has("industrial.admin")) {
      throw new ForgeError("FORBIDDEN", "Only Industrial admins can manage the carrier catalog");
    }
    const recordId = this.assertRecordId(carrierId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialWorkersCompCarriers)
          .where(
            and(
              eq(industrialWorkersCompCarriers.id, recordId),
              eq(industrialWorkersCompCarriers.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCarriers.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Carrier not found");

        const existingContact =
          existing.contact &&
          typeof existing.contact === "object" &&
          !Array.isArray(existing.contact)
            ? (existing.contact as Record<string, unknown>)
            : {};
        const nextContact =
          body.contact && typeof body.contact === "object" && !Array.isArray(body.contact)
            ? (body.contact as Record<string, unknown>)
            : {
                ...existingContact,
                ...(body.phone !== undefined ? { phone: String(body.phone ?? "") } : {}),
                ...(body.email !== undefined ? { email: String(body.email ?? "") } : {}),
                ...(body.adjuster !== undefined ? { adjuster: String(body.adjuster ?? "") } : {}),
              };

        const name = body.name !== undefined ? String(body.name ?? "").trim() : existing.name;
        if (!name) throw new ForgeError("VALIDATION_FAILED", "Carrier name is required");

        let status = existing.status;
        if (body.status !== undefined) {
          const raw = String(body.status ?? "")
            .trim()
            .toUpperCase();
          if (raw !== "ACTIVE" && raw !== "INACTIVE") {
            throw new ForgeError("VALIDATION_FAILED", "Carrier status must be ACTIVE or INACTIVE");
          }
          status = raw;
        }

        const now = new Date();
        const [row] = await tx
          .update(industrialWorkersCompCarriers)
          .set({
            name,
            status,
            contact: nextContact,
            updatedAt: now,
          })
          .where(eq(industrialWorkersCompCarriers.id, recordId))
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Carrier not found");
        return this.mapWorkersCompCarrier(row);
      },
      principal.userId,
    );
  }

  async archiveWorkersCompCarrier(principal: ForgePrincipal, carrierId: string) {
    if (!principal.permissions.has("industrial.admin")) {
      throw new ForgeError("FORBIDDEN", "Only Industrial admins can manage the carrier catalog");
    }
    const recordId = this.assertRecordId(carrierId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(industrialWorkersCompCarriers)
          .set({
            status: "INACTIVE",
            archivedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialWorkersCompCarriers.id, recordId),
              eq(industrialWorkersCompCarriers.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCarriers.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Carrier not found");
        return this.mapWorkersCompCarrier(row);
      },
      principal.userId,
    );
  }

  private mapWorkersCompCarrier(row: typeof industrialWorkersCompCarriers.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      contact: row.contact,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getWorkersCompSettings(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, WC_WEEKLY_STATUS_NAMESPACE),
            eq(tenantSettings.settingKey, WC_WEEKLY_STATUS_SETTING_KEY),
          ),
        });
        return parseWorkersCompWeeklyStatusSettings(existing?.valueJson);
      },
      principal.userId,
    );
  }

  async patchWorkersCompSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, WC_WEEKLY_STATUS_NAMESPACE),
            eq(tenantSettings.settingKey, WC_WEEKLY_STATUS_SETTING_KEY),
          ),
        });
        const prev = parseWorkersCompWeeklyStatusSettings(existing?.valueJson);
        const next: WorkersCompWeeklyStatusSettings = {
          enabled:
            body.enabled !== undefined
              ? body.enabled === true || body.enabled === "true" || body.enabled === 1
              : prev.enabled,
          recipients:
            body.recipients !== undefined
              ? normalizeEmailRecipients(body.recipients)
              : prev.recipients,
          lastSentAt: prev.lastSentAt,
        };

        if (body.addRecipient !== undefined) {
          const added = normalizeEmailAddress(body.addRecipient);
          if (!added) {
            throw new ForgeError("VALIDATION_FAILED", "Enter a valid email address");
          }
          if (!next.recipients.includes(added)) next.recipients = [...next.recipients, added];
        }
        if (body.removeRecipient !== undefined) {
          const removed = normalizeEmailAddress(body.removeRecipient);
          if (removed) {
            next.recipients = next.recipients.filter((email) => email !== removed);
          }
        }

        const now = new Date();
        if (existing) {
          await tx
            .update(tenantSettings)
            .set({
              valueJson: next,
              recordVersion: sql`${tenantSettings.recordVersion} + 1`,
              updatedAt: now,
              updatedByUserId: principal.userId,
            })
            .where(eq(tenantSettings.id, existing.id));
        } else {
          await tx.insert(tenantSettings).values({
            id: createId(),
            tenantId: principal.tenantId,
            namespace: WC_WEEKLY_STATUS_NAMESPACE,
            settingKey: WC_WEEKLY_STATUS_SETTING_KEY,
            valueJson: next,
            schemaVersion: 1,
            isSensitive: false,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: principal.userId,
          });
        }
        return next;
      },
      principal.userId,
    );
  }

  /**
   * Open cases needing Thursday status notes for the given weekOf (defaults to current Thursday).
   */
  async listWorkersCompWeeklyUpdates(principal: ForgePrincipal, query: ListQuery = {}) {
    const weekOf = normalizeThursdayWeekOf(query.weekOf);
    const now = new Date();
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const caseRows = await tx
          .select({
            case: industrialWorkersCompCases,
            personnelName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(
            and(
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
              inArray(industrialWorkersCompCases.status, [
                "OPEN",
                "ACTIVE",
                "RESTRICTED",
                "LOST_TIME",
                "DRAFT",
              ]),
            ),
          )
          .orderBy(desc(industrialWorkersCompCases.updatedAt))
          .limit(2000);

        const openMapped = caseRows
          .map(({ case: row, personnelName }) =>
            this.mapWorkersCompCase(row, { workerName: personnelName ?? "" }),
          )
          .filter((item) => isOpenWcStatus(String(item.status ?? "")));

        const caseIds = openMapped.map((item) => item.id);
        const updateRows =
          caseIds.length > 0
            ? await tx
                .select()
                .from(industrialWorkersCompWeeklyUpdates)
                .where(
                  and(
                    eq(industrialWorkersCompWeeklyUpdates.tenantId, principal.tenantId),
                    isNull(industrialWorkersCompWeeklyUpdates.archivedAt),
                    inArray(industrialWorkersCompWeeklyUpdates.caseId, caseIds),
                  ),
                )
            : [];

        const thisWeekByCase = new Map<string, (typeof updateRows)[number]>();
        const latestByCase = new Map<string, (typeof updateRows)[number]>();
        for (const row of updateRows) {
          const week = String(row.weekOf ?? "").slice(0, 10);
          if (week === weekOf) thisWeekByCase.set(row.caseId, row);
          const prev = latestByCase.get(row.caseId);
          if (!prev || String(row.weekOf) > String(prev.weekOf)) {
            latestByCase.set(row.caseId, row);
          }
        }

        const items = openMapped.map((item) => {
          const thisWeek = thisWeekByCase.get(item.id);
          const latest = latestByCase.get(item.id);
          const hasUpdate = Boolean(thisWeek?.notes?.trim());
          const status = weeklyUpdateRowStatus(weekOf, hasUpdate, now);
          const claim =
            item.caseNumber ||
            (item.claimSummary && typeof item.claimSummary === "object"
              ? String((item.claimSummary as { claimNumber?: string }).claimNumber ?? "")
              : "") ||
            "Pending";
          return {
            caseId: item.id,
            workerName: String(item.workerName ?? item.title ?? "").trim() || "Unknown",
            caseNumber: item.caseNumber ?? null,
            claimNumber: claim,
            caseStatus: item.status,
            weekOf,
            notes: thisWeek?.notes?.trim() ?? "",
            updateId: thisWeek?.id ?? null,
            updatedAt: thisWeek?.updatedAt?.toISOString() ?? null,
            priorNotes: latest && latest.weekOf !== weekOf ? (latest.notes?.trim() ?? "") : "",
            priorWeekOf:
              latest && String(latest.weekOf).slice(0, 10) !== weekOf
                ? String(latest.weekOf).slice(0, 10)
                : null,
            needsUpdate: !hasUpdate,
            status,
          };
        });

        const complete = items.filter((i) => i.status === "complete").length;
        const due = items.filter((i) => i.status === "due").length;
        const overdue = items.filter((i) => i.status === "overdue").length;

        return {
          weekOf,
          summary: {
            total: items.length,
            complete,
            due,
            overdue,
            remaining: due + overdue,
          },
          items,
        };
      },
      principal.userId,
    );
  }

  /** Upsert Thursday status note for one open case; syncs case sourcePayload.notes. */
  async upsertWorkersCompWeeklyUpdate(
    principal: ForgePrincipal,
    caseId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(caseId);
    const weekOf = normalizeThursdayWeekOf(body.weekOf);
    const notes = String(body.notes ?? "").trim();
    if (!notes) {
      throw new ForgeError("VALIDATION_FAILED", "Status notes are required");
    }
    const now = new Date();

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existingCase] = await tx
          .select()
          .from(industrialWorkersCompCases)
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
            ),
          )
          .limit(1);
        if (!existingCase) {
          throw new ForgeError("NOT_FOUND", "Workers compensation case not found");
        }
        if (!isOpenWcStatus(existingCase.status)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Weekly updates are only required for open cases",
          );
        }

        const [existingUpdate] = await tx
          .select()
          .from(industrialWorkersCompWeeklyUpdates)
          .where(
            and(
              eq(industrialWorkersCompWeeklyUpdates.tenantId, principal.tenantId),
              eq(industrialWorkersCompWeeklyUpdates.caseId, recordId),
              eq(industrialWorkersCompWeeklyUpdates.weekOf, weekOf),
              isNull(industrialWorkersCompWeeklyUpdates.archivedAt),
            ),
          )
          .limit(1);

        let updateRow: typeof industrialWorkersCompWeeklyUpdates.$inferSelect;
        if (existingUpdate) {
          const [row] = await tx
            .update(industrialWorkersCompWeeklyUpdates)
            .set({
              notes,
              updatedAt: now,
              sourcePayload: {
                ...this.unwrapSourcePayload(existingUpdate.sourcePayload),
                weekOf,
              },
            })
            .where(eq(industrialWorkersCompWeeklyUpdates.id, existingUpdate.id))
            .returning();
          updateRow = row!;
        } else {
          const [row] = await tx
            .insert(industrialWorkersCompWeeklyUpdates)
            .values({
              id: createId(),
              tenantId: principal.tenantId,
              caseId: recordId,
              weekOf,
              notes,
              createdByUserId: principal.userId,
              sourceSystem: "FORGE",
              sourcePayload: { weekOf },
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          updateRow = row!;
        }

        const payload = this.unwrapSourcePayload(existingCase.sourcePayload);
        await tx
          .update(industrialWorkersCompCases)
          .set({
            sourcePayload: { ...payload, notes },
            updatedAt: now,
          })
          .where(eq(industrialWorkersCompCases.id, recordId));

        const status = weeklyUpdateRowStatus(weekOf, true, now);
        return {
          id: updateRow.id,
          caseId: recordId,
          weekOf,
          notes: updateRow.notes,
          updatedAt: updateRow.updatedAt.toISOString(),
          status,
          needsUpdate: false,
        };
      },
      principal.userId,
    );
  }

  /**
   * Send weekly open-case status email to configured recipients.
   * Manual "Send now" from Settings; same payload will back a scheduled job.
   */
  async sendWorkersCompWeeklyStatus(principal: ForgePrincipal, body: Record<string, unknown> = {}) {
    if (!this.notifications) {
      throw new ForgeError("INTERNAL_ERROR", "Email notifications are not configured");
    }

    const overrideRecipients =
      body.recipients !== undefined ? normalizeEmailRecipients(body.recipients) : null;

    const { settings, tenantName, cases, weekOf } = await this.loadWorkersCompWeeklyStatus(
      principal,
      body,
    );
    const recipients = overrideRecipients ?? settings.recipients;
    if (recipients.length === 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Add at least one email recipient before sending the weekly status",
      );
    }
    const email = buildWorkersCompWeeklyStatusEmail({ tenantName, cases, weekOf });

    const results: Array<{ to: string; accepted: boolean; detail?: string }> = [];
    for (const to of recipients) {
      try {
        const result = await this.notifications.sendTemplatedEmail({
          to,
          templateKey: "workers_comp_weekly_status",
          tenantId: principal.tenantId,
          vars: {
            subject: email.subject,
            htmlBody: email.htmlBody,
            textBody: email.textBody,
            tenantName,
            openCount: String(email.openCount),
          },
        });
        results.push({
          to,
          accepted: result.accepted,
          ...(result.detail ? { detail: result.detail } : {}),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        results.push({ to, accepted: false, detail });
      }
    }

    const acceptedCount = results.filter((r) => r.accepted).length;
    if (acceptedCount === 0) {
      const firstDetail =
        results.map((r) => r.detail).find((d) => typeof d === "string" && d.trim()) ??
        "Email provider did not accept any messages";
      throw new ForgeError("INTERNAL_ERROR", `Failed to send weekly status email: ${firstDetail}`);
    }

    const now = new Date();
    const next: WorkersCompWeeklyStatusSettings = {
      ...settings,
      lastSentAt: now.toISOString(),
    };
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, WC_WEEKLY_STATUS_NAMESPACE),
            eq(tenantSettings.settingKey, WC_WEEKLY_STATUS_SETTING_KEY),
          ),
        });
        if (existing) {
          await tx
            .update(tenantSettings)
            .set({
              valueJson: next,
              recordVersion: sql`${tenantSettings.recordVersion} + 1`,
              updatedAt: now,
              updatedByUserId: principal.userId,
            })
            .where(eq(tenantSettings.id, existing.id));
        } else {
          await tx.insert(tenantSettings).values({
            id: createId(),
            tenantId: principal.tenantId,
            namespace: WC_WEEKLY_STATUS_NAMESPACE,
            settingKey: WC_WEEKLY_STATUS_SETTING_KEY,
            valueJson: next,
            schemaVersion: 1,
            isSensitive: false,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: principal.userId,
          });
        }
      },
      principal.userId,
    );
    settings.lastSentAt = next.lastSentAt;

    return {
      openCount: email.openCount,
      recipientCount: recipients.length,
      acceptedCount,
      settings,
      results,
      subject: email.subject,
    };
  }

  /** Weekly status email exactly as "Send now" would build it right now, without sending. */
  async previewWorkersCompWeeklyStatus(
    principal: ForgePrincipal,
    body: Record<string, unknown> = {},
  ) {
    const { tenantName, cases, weekOf } = await this.loadWorkersCompWeeklyStatus(principal, body);
    const email = buildWorkersCompWeeklyStatusEmail({ tenantName, cases, weekOf });
    return {
      weekOf,
      subject: email.subject,
      htmlBody: email.htmlBody,
      openCount: email.openCount,
    };
  }

  /** Rows for the Reporting `workers_comp.weekly_status` report (same data as the digest email). */
  async getWorkersCompWeeklyStatusReport(
    principal: ForgePrincipal,
    body: Record<string, unknown> = {},
  ) {
    const { tenantName, cases, weekOf } = await this.loadWorkersCompWeeklyStatus(principal, body);
    return {
      tenantName,
      weekOf,
      columns: WC_WEEKLY_STATUS_REPORT_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      rows: workersCompWeeklyStatusReportRows(cases),
    };
  }

  private async loadWorkersCompWeeklyStatus(
    principal: ForgePrincipal,
    body: Record<string, unknown>,
  ) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await tx.query.tenantSettings.findFirst({
          where: and(
            eq(tenantSettings.tenantId, principal.tenantId),
            eq(tenantSettings.namespace, WC_WEEKLY_STATUS_NAMESPACE),
            eq(tenantSettings.settingKey, WC_WEEKLY_STATUS_SETTING_KEY),
          ),
        });
        const settings = parseWorkersCompWeeklyStatusSettings(existing?.valueJson);

        const tenantRows = await tx.execute(sql`
          select coalesce(nullif(btrim(display_name), ''), nullif(btrim(legal_name), ''), slug)::text as name
          from tenants
          where id = ${principal.tenantId}::uuid
          limit 1
        `);
        const tenantRow = (
          Array.isArray(tenantRows)
            ? tenantRows[0]
            : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
        ) as { name?: string } | undefined;
        const tenantName =
          String(tenantRow?.name ?? "your organization").trim() || "your organization";

        const rows = await tx
          .select({
            case: industrialWorkersCompCases,
            personnelName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(
            and(
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
              isNull(industrialWorkersCompCases.archivedAt),
            ),
          )
          .orderBy(desc(industrialWorkersCompCases.updatedAt))
          .limit(500);

        const casesMapped = rows
          .map(({ case: row, personnelName }) =>
            this.mapWorkersCompCase(row, { workerName: personnelName ?? "" }),
          )
          .filter((item) => isOpenWcStatus(String(item.status ?? "")));

        const weekOf = normalizeThursdayWeekOf(body.weekOf);
        const caseIds = casesMapped.map((item) => item.id);
        const weeklyRows =
          caseIds.length > 0
            ? await tx
                .select({
                  caseId: industrialWorkersCompWeeklyUpdates.caseId,
                  notes: industrialWorkersCompWeeklyUpdates.notes,
                })
                .from(industrialWorkersCompWeeklyUpdates)
                .where(
                  and(
                    eq(industrialWorkersCompWeeklyUpdates.tenantId, principal.tenantId),
                    eq(industrialWorkersCompWeeklyUpdates.weekOf, weekOf),
                    isNull(industrialWorkersCompWeeklyUpdates.archivedAt),
                    inArray(industrialWorkersCompWeeklyUpdates.caseId, caseIds),
                    sql`btrim(coalesce(${industrialWorkersCompWeeklyUpdates.notes}, '')) <> ''`,
                  ),
                )
            : [];
        const weeklyByCase = new Map(
          weeklyRows.map((row) => [row.caseId, String(row.notes ?? "").trim()] as const),
        );

        const caseRowById = new Map(rows.map(({ case: row }) => [row.id, row] as const));
        const linkedIncidentIds = [
          ...new Set(
            casesMapped
              .map((item) => caseRowById.get(item.id)?.incidentId)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        ];
        const incidentRows =
          linkedIncidentIds.length > 0
            ? await tx
                .select({
                  id: industrialIncidents.id,
                  title: industrialIncidents.title,
                  sourcePayload: industrialIncidents.sourcePayload,
                })
                .from(industrialIncidents)
                .where(
                  and(
                    eq(industrialIncidents.tenantId, principal.tenantId),
                    inArray(industrialIncidents.id, linkedIncidentIds),
                  ),
                )
            : [];
        const narrativeByIncident = new Map(
          incidentRows.map(
            (row) => [row.id, incidentNarrativeFromPayload(row.sourcePayload)] as const,
          ),
        );
        const incidentById = new Map(incidentRows.map((row) => [row.id, row] as const));

        const cases = sortWorkersCompWeeklyStatusCases(
          casesMapped.map((item) => {
            const weeklyNotes = weeklyByCase.get(item.id) ?? "";
            const caseRow = caseRowById.get(item.id);
            const incidentNarrative =
              (caseRow?.incidentId ? narrativeByIncident.get(caseRow.incidentId) : "") ||
              incidentNarrativeFromPayload(caseRow?.sourcePayload);
            const linkedIncident = caseRow?.incidentId
              ? incidentById.get(caseRow.incidentId)
              : undefined;
            return {
              ...item,
              locationText: resolveWorkersCompReportLocation({
                locationText: item.locationText,
                claimBodyParts: item.claimSummary?.bodyParts,
                incidentPayload: linkedIncident?.sourcePayload,
                incidentTitle: linkedIncident?.title,
                casePayload: caseRow?.sourcePayload,
              }),
              weekOf,
              weeklyNotes,
              notes: weeklyNotes || String(item.notes ?? "").trim(),
              weeklyUpdateStatus: weeklyUpdateRowStatus(weekOf, Boolean(weeklyNotes)),
              incidentNarrative,
            };
          }),
        );

        return { settings, tenantName, cases, weekOf };
      },
      principal.userId,
    );
  }

  async createWorkersCompWorkStatus(
    principal: ForgePrincipal,
    caseId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(caseId);
    const status = String(body.status ?? "").trim();
    if (!status) throw new ForgeError("VALIDATION_FAILED", "Work status is required");
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.assertWcCase(tx, principal.tenantId, recordId);
        const now = new Date();
        const sourcePayload = {
          ...body,
          createdByUserId: principal.userId,
        };
        const [row] = await tx
          .insert(industrialWorkersCompWorkStatusPeriods)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            caseId: recordId,
            status,
            startDate: body.startDate ? String(body.startDate).slice(0, 10) : null,
            endDate: body.endDate ? String(body.endDate).slice(0, 10) : null,
            notes: body.notes ? String(body.notes) : null,
            createdByUserId: principal.userId,
            sourceSystem: "FORGE",
            sourcePayload,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return {
          id: row!.id,
          status: row!.status,
          startDate: row!.startDate,
          endDate: row!.endDate,
          notes: row!.notes,
          createdByUserId: row!.createdByUserId,
          canEditNotes: true,
          createdAt: row!.createdAt.toISOString(),
          updatedAt: row!.updatedAt.toISOString(),
        };
      },
      principal.userId,
    );
  }

  async updateWorkersCompWorkStatus(
    principal: ForgePrincipal,
    caseId: string,
    periodId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(caseId);
    const id = this.assertRecordId(periodId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialWorkersCompWorkStatusPeriods)
          .where(
            and(
              eq(industrialWorkersCompWorkStatusPeriods.id, id),
              eq(industrialWorkersCompWorkStatusPeriods.caseId, recordId),
              eq(industrialWorkersCompWorkStatusPeriods.tenantId, principal.tenantId),
              isNull(industrialWorkersCompWorkStatusPeriods.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Work status period not found");

        const createdByUserId =
          existing.createdByUserId ??
          (() => {
            const payload = this.unwrapSourcePayload(existing.sourcePayload);
            return typeof payload.createdByUserId === "string" ? payload.createdByUserId : null;
          })();
        const canManageResource =
          principal.isPlatformAdmin ||
          principal.permissions.has("industrial.admin") ||
          principal.permissions.has("industrial.workers_comp.manage");
        if (
          !canEditWorkersCompAuthoredNote({
            isPlatformAdmin: principal.isPlatformAdmin,
            permissions: principal.permissions,
            userId: principal.userId,
            createdByUserId,
            canManageResource,
          })
        ) {
          throw new ForgeError("FORBIDDEN", "Only the user who wrote this note can edit it");
        }

        const [row] = await tx
          .update(industrialWorkersCompWorkStatusPeriods)
          .set({
            ...(body.status != null ? { status: String(body.status) } : {}),
            ...(body.startDate !== undefined
              ? { startDate: body.startDate ? String(body.startDate).slice(0, 10) : null }
              : {}),
            ...(body.endDate !== undefined
              ? { endDate: body.endDate ? String(body.endDate).slice(0, 10) : null }
              : {}),
            ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
            updatedAt: new Date(),
          } as never)
          .where(eq(industrialWorkersCompWorkStatusPeriods.id, id))
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Work status period not found");
        return {
          id: row.id,
          status: row.status,
          startDate: row.startDate,
          endDate: row.endDate,
          notes: row.notes,
          createdByUserId: row.createdByUserId ?? createdByUserId,
          canEditNotes: true,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      },
      principal.userId,
    );
  }

  async archiveWorkersCompWorkStatus(principal: ForgePrincipal, caseId: string, periodId: string) {
    const recordId = this.assertRecordId(caseId);
    const id = this.assertRecordId(periodId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(industrialWorkersCompWorkStatusPeriods)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialWorkersCompWorkStatusPeriods.id, id),
              eq(industrialWorkersCompWorkStatusPeriods.caseId, recordId),
              eq(industrialWorkersCompWorkStatusPeriods.tenantId, principal.tenantId),
              isNull(industrialWorkersCompWorkStatusPeriods.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Work status period not found");
        return { id: row.id, archived: true };
      },
      principal.userId,
    );
  }

  async createWorkersCompRestriction(
    principal: ForgePrincipal,
    caseId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(caseId);
    const accommodations = parseWorkersCompAccommodationsPayload(body.accommodations ?? body);
    const description =
      String(body.description ?? "").trim() ||
      (accommodationsPayloadHasContent(accommodations)
        ? summarizeWorkersCompAccommodationsPayload(accommodations)
        : "");
    if (!description) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Enter work accommodations or a restriction description",
      );
    }
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.assertWcCase(tx, principal.tenantId, recordId);
        const now = new Date();
        const [row] = await tx
          .insert(industrialWorkersCompRestrictions)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            caseId: recordId,
            description,
            startDate: body.startDate ? String(body.startDate).slice(0, 10) : null,
            endDate: body.endDate ? String(body.endDate).slice(0, 10) : null,
            status: String(body.status ?? "ACTIVE"),
            sourceSystem: "FORGE",
            sourcePayload: {
              accommodations,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return {
          id: row!.id,
          description: row!.description,
          startDate: row!.startDate,
          endDate: row!.endDate,
          status: row!.status,
          accommodations,
          createdAt: row!.createdAt.toISOString(),
          updatedAt: row!.updatedAt.toISOString(),
        };
      },
      principal.userId,
    );
  }

  async updateWorkersCompRestriction(
    principal: ForgePrincipal,
    caseId: string,
    restrictionId: string,
    body: Record<string, unknown>,
  ) {
    const recordId = this.assertRecordId(caseId);
    const id = this.assertRecordId(restrictionId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialWorkersCompRestrictions)
          .where(
            and(
              eq(industrialWorkersCompRestrictions.id, id),
              eq(industrialWorkersCompRestrictions.caseId, recordId),
              eq(industrialWorkersCompRestrictions.tenantId, principal.tenantId),
              isNull(industrialWorkersCompRestrictions.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Restriction not found");

        const prevPayload =
          existing.sourcePayload &&
          typeof existing.sourcePayload === "object" &&
          !Array.isArray(existing.sourcePayload)
            ? (existing.sourcePayload as Record<string, unknown>)
            : {};
        const accommodations =
          body.accommodations !== undefined
            ? parseWorkersCompAccommodationsPayload(body.accommodations)
            : readAccommodationsFromSourcePayload(existing.sourcePayload);
        const nextDescription =
          body.description !== undefined
            ? body.description
              ? String(body.description)
              : null
            : body.accommodations !== undefined && accommodationsPayloadHasContent(accommodations)
              ? summarizeWorkersCompAccommodationsPayload(accommodations)
              : existing.description;

        const [row] = await tx
          .update(industrialWorkersCompRestrictions)
          .set({
            description: nextDescription,
            ...(body.startDate !== undefined
              ? { startDate: body.startDate ? String(body.startDate).slice(0, 10) : null }
              : {}),
            ...(body.endDate !== undefined
              ? { endDate: body.endDate ? String(body.endDate).slice(0, 10) : null }
              : {}),
            ...(body.status != null ? { status: String(body.status) } : {}),
            sourcePayload: {
              ...prevPayload,
              accommodations,
            },
            updatedAt: new Date(),
          } as never)
          .where(
            and(
              eq(industrialWorkersCompRestrictions.id, id),
              eq(industrialWorkersCompRestrictions.caseId, recordId),
              eq(industrialWorkersCompRestrictions.tenantId, principal.tenantId),
              isNull(industrialWorkersCompRestrictions.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Restriction not found");
        return {
          id: row.id,
          description: row.description,
          startDate: row.startDate,
          endDate: row.endDate,
          status: row.status,
          accommodations,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      },
      principal.userId,
    );
  }

  async archiveWorkersCompRestriction(
    principal: ForgePrincipal,
    caseId: string,
    restrictionId: string,
  ) {
    const recordId = this.assertRecordId(caseId);
    const id = this.assertRecordId(restrictionId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(industrialWorkersCompRestrictions)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(industrialWorkersCompRestrictions.id, id),
              eq(industrialWorkersCompRestrictions.caseId, recordId),
              eq(industrialWorkersCompRestrictions.tenantId, principal.tenantId),
              isNull(industrialWorkersCompRestrictions.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Restriction not found");
        return { id: row.id, archived: true };
      },
      principal.userId,
    );
  }

  async createWorkersCompMedical(
    principal: ForgePrincipal,
    caseId: string,
    body: Record<string, unknown>,
  ) {
    if (!this.canManageWcMedical(principal)) {
      throw new ForgeError("FORBIDDEN", "Missing industrial.workers_comp.medical.manage");
    }
    const recordId = this.assertRecordId(caseId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.enableWcMedicalAccess(tx);
        await this.assertWcCase(tx, principal.tenantId, recordId);
        const now = new Date();
        const appointmentDate = body.appointmentDate
          ? String(body.appointmentDate).slice(0, 10)
          : null;
        const accommodations = parseWorkersCompAccommodationsPayload(body.accommodations);
        const hasAccommodations = accommodationsPayloadHasContent(accommodations);
        const workStatusRaw =
          body.workStatus && typeof body.workStatus === "object" && !Array.isArray(body.workStatus)
            ? (body.workStatus as Record<string, unknown>)
            : null;
        const workStatusStatus = workStatusRaw ? String(workStatusRaw.status ?? "").trim() : "";
        const workStatusStart = workStatusRaw?.startDate
          ? String(workStatusRaw.startDate).slice(0, 10)
          : appointmentDate;
        const workStatusEnd = workStatusRaw?.endDate
          ? String(workStatusRaw.endDate).slice(0, 10)
          : body.endDate
            ? String(body.endDate).slice(0, 10)
            : null;
        const workStatusNotes = workStatusRaw?.notes ? String(workStatusRaw.notes) : null;
        const restrictionStart = body.startDate
          ? String(body.startDate).slice(0, 10)
          : appointmentDate;
        const restrictionEnd = body.endDate ? String(body.endDate).slice(0, 10) : workStatusEnd;

        const medicalId = createId();
        let restrictionId: string | null = null;
        let workStatusPeriodId: string | null = null;

        if (hasAccommodations) {
          restrictionId = createId();
          const description = summarizeWorkersCompAccommodationsPayload(accommodations);
          await tx.insert(industrialWorkersCompRestrictions).values({
            id: restrictionId,
            tenantId: principal.tenantId,
            caseId: recordId,
            description,
            startDate: restrictionStart,
            endDate: restrictionEnd,
            status: "ACTIVE",
            sourceSystem: "FORGE",
            sourcePayload: {
              accommodations,
              medicalEncounterId: medicalId,
            },
            createdAt: now,
            updatedAt: now,
          });
        }

        if (workStatusStatus) {
          workStatusPeriodId = createId();
          await tx.insert(industrialWorkersCompWorkStatusPeriods).values({
            id: workStatusPeriodId,
            tenantId: principal.tenantId,
            caseId: recordId,
            status: workStatusStatus,
            startDate: workStatusStart,
            endDate: workStatusEnd,
            notes: workStatusNotes,
            createdByUserId: principal.userId,
            sourceSystem: "FORGE",
            sourcePayload: {
              status: workStatusStatus,
              startDate: workStatusStart,
              endDate: workStatusEnd,
              notes: workStatusNotes,
              medicalEncounterId: medicalId,
              createdByUserId: principal.userId,
            },
            createdAt: now,
            updatedAt: now,
          });
        }

        const visitWorkStatus = workStatusStatus
          ? {
              status: workStatusStatus,
              startDate: workStatusStart,
              endDate: workStatusEnd,
              notes: workStatusNotes,
            }
          : null;

        const sourcePayload = {
          appointmentDate,
          provider: body.provider ? String(body.provider) : null,
          providerSpecialty: body.providerSpecialty ? String(body.providerSpecialty) : null,
          diagnosis: body.diagnosis ? String(body.diagnosis) : null,
          treatment: body.treatment ? String(body.treatment) : null,
          medication: body.medication ? String(body.medication) : null,
          examFindings: body.examFindings ? String(body.examFindings) : null,
          assessment: body.assessment ? String(body.assessment) : null,
          symptoms: body.symptoms ? String(body.symptoms) : null,
          notes: body.notes ? String(body.notes) : null,
          ...(hasAccommodations ? { accommodations } : {}),
          ...(visitWorkStatus ? { workStatus: visitWorkStatus } : {}),
          ...(restrictionId ? { restrictionId } : {}),
          ...(workStatusPeriodId ? { workStatusPeriodId } : {}),
          startDate: restrictionStart,
          endDate: restrictionEnd,
          createdByUserId: principal.userId,
        };

        const [row] = await tx
          .insert(industrialWorkersCompMedicalEncounters)
          .values({
            id: medicalId,
            tenantId: principal.tenantId,
            caseId: recordId,
            appointmentDate,
            provider: body.provider ? String(body.provider) : null,
            providerSpecialty: body.providerSpecialty ? String(body.providerSpecialty) : null,
            diagnosis: body.diagnosis ? String(body.diagnosis) : null,
            treatment: body.treatment ? String(body.treatment) : null,
            medication: body.medication ? String(body.medication) : null,
            examFindings: body.examFindings ? String(body.examFindings) : null,
            assessment: body.assessment ? String(body.assessment) : null,
            symptoms: body.symptoms ? String(body.symptoms) : null,
            notes: body.notes ? String(body.notes) : null,
            restrictedPayload: {},
            createdByUserId: principal.userId,
            sourceSystem: "FORGE",
            sourcePayload,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx
          .update(industrialWorkersCompCases)
          .set({ updatedAt: now } as never)
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
            ),
          );
        return this.mapMedicalEncounter(row!, principal);
      },
      principal.userId,
    );
  }

  async updateWorkersCompMedical(
    principal: ForgePrincipal,
    caseId: string,
    encounterId: string,
    body: Record<string, unknown>,
  ) {
    if (!this.canViewWcMedical(principal)) {
      throw new ForgeError("FORBIDDEN", "Missing industrial.workers_comp.medical.view");
    }
    const recordId = this.assertRecordId(caseId);
    const id = this.assertRecordId(encounterId);
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await this.enableWcMedicalAccess(tx);
        const [existing] = await tx
          .select()
          .from(industrialWorkersCompMedicalEncounters)
          .where(
            and(
              eq(industrialWorkersCompMedicalEncounters.id, id),
              eq(industrialWorkersCompMedicalEncounters.caseId, recordId),
              eq(industrialWorkersCompMedicalEncounters.tenantId, principal.tenantId),
              isNull(industrialWorkersCompMedicalEncounters.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Medical encounter not found");

        const createdByUserId =
          existing.createdByUserId ??
          (() => {
            const payload = this.unwrapSourcePayload(existing.sourcePayload);
            return typeof payload.createdByUserId === "string" ? payload.createdByUserId : null;
          })();
        if (
          !canEditWorkersCompAuthoredNote({
            isPlatformAdmin: principal.isPlatformAdmin,
            permissions: principal.permissions,
            userId: principal.userId,
            createdByUserId,
            canManageResource: this.canManageWcMedical(principal),
          })
        ) {
          throw new ForgeError("FORBIDDEN", "Only the user who wrote this note can edit it");
        }

        const prevPayload = this.unwrapSourcePayload(existing.sourcePayload);
        const accommodations =
          body.accommodations !== undefined
            ? parseWorkersCompAccommodationsPayload(body.accommodations)
            : readAccommodationsFromSourcePayload(prevPayload);
        const hasAccommodations = accommodationsPayloadHasContent(accommodations);
        const workStatusRaw =
          body.workStatus !== undefined
            ? body.workStatus &&
              typeof body.workStatus === "object" &&
              !Array.isArray(body.workStatus)
              ? (body.workStatus as Record<string, unknown>)
              : null
            : prevPayload.workStatus &&
                typeof prevPayload.workStatus === "object" &&
                !Array.isArray(prevPayload.workStatus)
              ? (prevPayload.workStatus as Record<string, unknown>)
              : null;
        const visitWorkStatus =
          workStatusRaw && String(workStatusRaw.status ?? "").trim()
            ? {
                status: String(workStatusRaw.status).trim(),
                startDate: workStatusRaw.startDate
                  ? String(workStatusRaw.startDate).slice(0, 10)
                  : null,
                endDate: workStatusRaw.endDate ? String(workStatusRaw.endDate).slice(0, 10) : null,
                notes: workStatusRaw.notes ? String(workStatusRaw.notes) : null,
              }
            : null;

        const nextAppointmentDate =
          body.appointmentDate !== undefined
            ? body.appointmentDate
              ? String(body.appointmentDate).slice(0, 10)
              : null
            : existing.appointmentDate;
        const nextProvider =
          body.provider !== undefined
            ? body.provider
              ? String(body.provider)
              : null
            : existing.provider;
        const nextSpecialty =
          body.providerSpecialty !== undefined
            ? body.providerSpecialty
              ? String(body.providerSpecialty)
              : null
            : existing.providerSpecialty;
        const nextDiagnosis =
          body.diagnosis !== undefined
            ? body.diagnosis
              ? String(body.diagnosis)
              : null
            : existing.diagnosis;
        const nextTreatment =
          body.treatment !== undefined
            ? body.treatment
              ? String(body.treatment)
              : null
            : existing.treatment;
        const nextMedication =
          body.medication !== undefined
            ? body.medication
              ? String(body.medication)
              : null
            : existing.medication;
        const nextNotes =
          body.notes !== undefined ? (body.notes ? String(body.notes) : null) : existing.notes;

        const nextPayload: Record<string, unknown> = {
          ...prevPayload,
          appointmentDate: nextAppointmentDate,
          provider: nextProvider,
          providerSpecialty: nextSpecialty,
          diagnosis: nextDiagnosis,
          treatment: nextTreatment,
          medication: nextMedication,
          notes: nextNotes,
          createdByUserId: createdByUserId ?? prevPayload.createdByUserId,
        };
        if (body.accommodations !== undefined) {
          if (hasAccommodations) nextPayload.accommodations = accommodations;
          else delete nextPayload.accommodations;
        }
        if (body.workStatus !== undefined) {
          if (visitWorkStatus) nextPayload.workStatus = visitWorkStatus;
          else delete nextPayload.workStatus;
        }

        let restrictionId =
          typeof prevPayload.restrictionId === "string" ? prevPayload.restrictionId : null;
        let workStatusPeriodId =
          typeof prevPayload.workStatusPeriodId === "string"
            ? prevPayload.workStatusPeriodId
            : null;
        const now = new Date();
        const visitStartDate =
          (typeof body.startDate === "string" && body.startDate
            ? String(body.startDate).slice(0, 10)
            : null) ??
          nextAppointmentDate ??
          visitWorkStatus?.startDate ??
          null;
        const visitEndDate =
          (typeof body.endDate === "string" && body.endDate
            ? String(body.endDate).slice(0, 10)
            : null) ??
          visitWorkStatus?.endDate ??
          null;

        if (body.accommodations !== undefined && hasAccommodations) {
          const description = summarizeWorkersCompAccommodationsPayload(accommodations);
          if (restrictionId) {
            await tx
              .update(industrialWorkersCompRestrictions)
              .set({
                description,
                startDate: visitStartDate,
                endDate: visitEndDate,
                sourcePayload: {
                  accommodations,
                  medicalEncounterId: id,
                },
                updatedAt: now,
              } as never)
              .where(
                and(
                  eq(industrialWorkersCompRestrictions.id, restrictionId),
                  eq(industrialWorkersCompRestrictions.caseId, recordId),
                  eq(industrialWorkersCompRestrictions.tenantId, principal.tenantId),
                  isNull(industrialWorkersCompRestrictions.archivedAt),
                ),
              );
          } else {
            restrictionId = createId();
            await tx.insert(industrialWorkersCompRestrictions).values({
              id: restrictionId,
              tenantId: principal.tenantId,
              caseId: recordId,
              description,
              startDate: visitStartDate,
              endDate: visitEndDate,
              status: "ACTIVE",
              sourceSystem: "FORGE",
              sourcePayload: {
                accommodations,
                medicalEncounterId: id,
              },
              createdAt: now,
              updatedAt: now,
            });
            nextPayload.restrictionId = restrictionId;
          }
        }

        if (visitWorkStatus && body.workStatus !== undefined) {
          if (workStatusPeriodId) {
            await tx
              .update(industrialWorkersCompWorkStatusPeriods)
              .set({
                status: visitWorkStatus.status,
                startDate: visitWorkStatus.startDate,
                endDate: visitWorkStatus.endDate,
                notes: visitWorkStatus.notes,
                sourcePayload: {
                  ...visitWorkStatus,
                  medicalEncounterId: id,
                  createdByUserId,
                },
                updatedAt: now,
              } as never)
              .where(
                and(
                  eq(industrialWorkersCompWorkStatusPeriods.id, workStatusPeriodId),
                  eq(industrialWorkersCompWorkStatusPeriods.caseId, recordId),
                  eq(industrialWorkersCompWorkStatusPeriods.tenantId, principal.tenantId),
                  isNull(industrialWorkersCompWorkStatusPeriods.archivedAt),
                ),
              );
          } else {
            workStatusPeriodId = createId();
            await tx.insert(industrialWorkersCompWorkStatusPeriods).values({
              id: workStatusPeriodId,
              tenantId: principal.tenantId,
              caseId: recordId,
              status: visitWorkStatus.status,
              startDate: visitWorkStatus.startDate,
              endDate: visitWorkStatus.endDate,
              notes: visitWorkStatus.notes,
              createdByUserId: principal.userId,
              sourceSystem: "FORGE",
              sourcePayload: {
                ...visitWorkStatus,
                medicalEncounterId: id,
                createdByUserId: principal.userId,
              },
              createdAt: now,
              updatedAt: now,
            });
            nextPayload.workStatusPeriodId = workStatusPeriodId;
          }
        }

        const [row] = await tx
          .update(industrialWorkersCompMedicalEncounters)
          .set({
            appointmentDate: nextAppointmentDate,
            provider: nextProvider,
            providerSpecialty: nextSpecialty,
            diagnosis: nextDiagnosis,
            treatment: nextTreatment,
            medication: nextMedication,
            ...(body.examFindings !== undefined
              ? { examFindings: body.examFindings ? String(body.examFindings) : null }
              : {}),
            ...(body.assessment !== undefined
              ? { assessment: body.assessment ? String(body.assessment) : null }
              : {}),
            ...(body.symptoms !== undefined
              ? { symptoms: body.symptoms ? String(body.symptoms) : null }
              : {}),
            notes: nextNotes,
            sourcePayload: nextPayload,
            updatedAt: now,
          } as never)
          .where(eq(industrialWorkersCompMedicalEncounters.id, id))
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Medical encounter not found");
        await tx
          .update(industrialWorkersCompCases)
          .set({ updatedAt: now } as never)
          .where(
            and(
              eq(industrialWorkersCompCases.id, recordId),
              eq(industrialWorkersCompCases.tenantId, principal.tenantId),
            ),
          );
        return this.mapMedicalEncounter(row, principal);
      },
      principal.userId,
    );
  }

  private mapMedicalEncounter(
    row: typeof industrialWorkersCompMedicalEncounters.$inferSelect,
    principal?: ForgePrincipal,
  ) {
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const createdByUserId =
      row.createdByUserId ??
      (typeof payload.createdByUserId === "string" ? payload.createdByUserId : null);
    const canEditNotes = principal
      ? canEditWorkersCompAuthoredNote({
          isPlatformAdmin: principal.isPlatformAdmin,
          permissions: principal.permissions,
          userId: principal.userId,
          createdByUserId,
          canManageResource: this.canManageWcMedical(principal),
        })
      : false;
    const accommodations = readAccommodationsFromSourcePayload(payload);
    const hasAccommodations = accommodationsPayloadHasContent(accommodations);
    const workStatusRaw =
      payload.workStatus &&
      typeof payload.workStatus === "object" &&
      !Array.isArray(payload.workStatus)
        ? (payload.workStatus as Record<string, unknown>)
        : null;
    const workStatus =
      workStatusRaw && String(workStatusRaw.status ?? "").trim()
        ? {
            status: String(workStatusRaw.status).trim(),
            startDate:
              typeof workStatusRaw.startDate === "string"
                ? workStatusRaw.startDate.slice(0, 10)
                : null,
            endDate:
              typeof workStatusRaw.endDate === "string" ? workStatusRaw.endDate.slice(0, 10) : null,
            notes: typeof workStatusRaw.notes === "string" ? workStatusRaw.notes : null,
          }
        : null;
    return {
      id: row.id,
      appointmentDate: row.appointmentDate,
      provider: row.provider,
      providerSpecialty: row.providerSpecialty,
      diagnosis: row.diagnosis,
      treatment: row.treatment,
      medication: row.medication,
      examFindings: row.examFindings,
      assessment: row.assessment,
      symptoms: row.symptoms,
      notes: row.notes,
      ...(hasAccommodations ? { accommodations } : {}),
      ...(workStatus ? { workStatus } : {}),
      restrictionId: typeof payload.restrictionId === "string" ? payload.restrictionId : null,
      workStatusPeriodId:
        typeof payload.workStatusPeriodId === "string" ? payload.workStatusPeriodId : null,
      createdByUserId,
      canEditNotes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async assertWcCase(tx: DatabaseTransaction, tenantId: string, caseId: string) {
    const [row] = await tx
      .select({ id: industrialWorkersCompCases.id })
      .from(industrialWorkersCompCases)
      .where(
        and(
          eq(industrialWorkersCompCases.id, caseId),
          eq(industrialWorkersCompCases.tenantId, tenantId),
          isNull(industrialWorkersCompCases.archivedAt),
        ),
      )
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "Workers compensation case not found");
  }

  async taskAction(principal: ForgePrincipal, id: string, action: string) {
    return this.transitionModule(principal, "tasks", id, action);
  }

  async createTask(principal: ForgePrincipal, body: Record<string, unknown>) {
    const created = await this.createModule(principal, "tasks", {
      ...body,
      status: body.status ?? "assigned",
    });
    const assigneePersonnelId = String(
      (created as { assigneePersonnelId?: string | null }).assigneePersonnelId ??
        body.assigneePersonnelId ??
        body.assigneeId ??
        "",
    ).trim();
    if (assigneePersonnelId) {
      await this.notifyTaskAssigned(principal, {
        taskId: String((created as { id: string }).id),
        title: String((created as { title?: string }).title ?? body.title ?? "Task"),
        assigneePersonnelId,
      });
    }
    return created;
  }

  /**
   * Soft-delete a task. Allowed for Tenant Admin, Forge Creator, or the user
   * who created the task.
   */
  async archiveTask(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialTasks)
        .where(
          and(
            eq(industrialTasks.id, recordId),
            eq(industrialTasks.tenantId, principal.tenantId),
            isNull(industrialTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Task not found");

      const payload =
        existing.sourcePayload &&
        typeof existing.sourcePayload === "object" &&
        !Array.isArray(existing.sourcePayload)
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};
      const createdByUserId = taskCreatedByUserId(payload);
      if (
        !canDeleteTask({
          isPlatformAdmin: principal.isPlatformAdmin,
          activeProducts: principal.activeProducts,
          permissions: principal.permissions,
          actorUserId: principal.userId,
          createdByUserId,
        })
      ) {
        throw new ForgeError(
          "FORBIDDEN",
          "Only an Admin, Creator, or the user who created this task can delete it.",
        );
      }

      const now = new Date();
      const [row] = await tx
        .update(industrialTasks)
        .set({ archivedAt: now, status: "ARCHIVED", updatedAt: now })
        .where(
          and(eq(industrialTasks.id, recordId), eq(industrialTasks.tenantId, principal.tenantId)),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Task not found");
      const title = row.title?.trim() ? row.title : row.id;
      return {
        id: row.id,
        title,
        displayName: title,
        name: title,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  async updateTask(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    const result = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialTasks)
        .where(
          and(
            eq(industrialTasks.id, recordId),
            eq(industrialTasks.tenantId, principal.tenantId),
            isNull(industrialTasks.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Task not found");

      const prevPayload =
        existing.sourcePayload &&
        typeof existing.sourcePayload === "object" &&
        !Array.isArray(existing.sourcePayload)
          ? (existing.sourcePayload as Record<string, unknown>)
          : {};

      const title =
        body.title !== undefined ? String(body.title ?? "").trim() : (existing.title?.trim() ?? "");
      if (!title) {
        throw new ForgeError("VALIDATION_FAILED", "Please provide a title for this task.");
      }

      const status =
        body.status !== undefined
          ? String(body.status ?? "").trim() || existing.status
          : existing.status;

      const dueRaw =
        body.dueDate !== undefined || body.deadlineDate !== undefined
          ? String(body.dueDate ?? body.deadlineDate ?? "").trim()
          : String(existing.dueDate ?? prevPayload.deadlineDate ?? "").trim();
      const dueDate = /^\d{4}-\d{2}-\d{2}/.test(dueRaw) ? dueRaw.slice(0, 10) : null;

      let assigneePersonnelId =
        body.assigneePersonnelId !== undefined || body.assigneeId !== undefined
          ? String(body.assigneePersonnelId ?? body.assigneeId ?? "").trim() || null
          : (existing.assigneePersonnelId ?? null);
      let assigneeName =
        typeof body.assigneeName === "string"
          ? body.assigneeName.trim()
          : typeof prevPayload.assigneeName === "string"
            ? String(prevPayload.assigneeName).trim()
            : "";

      if (assigneePersonnelId) {
        const [person] = await tx
          .select({
            id: industrialPersonnel.id,
            displayName: industrialPersonnel.displayName,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, assigneePersonnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
              isNull(industrialPersonnel.archivedAt),
            ),
          )
          .limit(1);
        if (!person) {
          throw new ForgeError("VALIDATION_FAILED", "Assignee not found.");
        }
        assigneePersonnelId = person.id;
        assigneeName = person.displayName?.trim() || assigneeName;
      } else {
        assigneeName = "";
      }

      const priority =
        body.priority !== undefined
          ? String(body.priority ?? "").trim()
          : typeof prevPayload.priority === "string"
            ? prevPayload.priority
            : undefined;

      const now = new Date();
      const nextPayload: Record<string, unknown> = {
        ...prevPayload,
        ...body,
        title,
        status,
        ...(priority ? { priority } : {}),
        ...(assigneePersonnelId
          ? { assigneePersonnelId, assigneeName }
          : { assigneePersonnelId: null, assigneeName: null }),
        ...(dueDate ? { deadlineDate: dueDate, dueDate } : { deadlineDate: null, dueDate: null }),
      };

      const [row] = await tx
        .update(industrialTasks)
        .set({
          title,
          status,
          assigneePersonnelId,
          dueDate,
          sourcePayload: nextPayload,
          updatedAt: now,
        })
        .where(
          and(eq(industrialTasks.id, recordId), eq(industrialTasks.tenantId, principal.tenantId)),
        )
        .returning();

      const previousAssigneeId = existing.assigneePersonnelId ?? null;
      return {
        mapped: this.mapListItem({
          id: row!.id,
          title: row!.title,
          status: row!.status,
          createdAt: row!.createdAt,
          updatedAt: row!.updatedAt,
          sourcePayload: row!.sourcePayload,
          extra: {
            assigneePersonnelId: row!.assigneePersonnelId ?? null,
            assigneeName: assigneeName || null,
            dueDate: row!.dueDate ?? null,
            deadlineDate: row!.dueDate ?? null,
          },
        }),
        previousAssigneeId,
        nextAssigneeId: assigneePersonnelId,
      };
    });

    if (result.nextAssigneeId && result.nextAssigneeId !== result.previousAssigneeId) {
      await this.notifyTaskAssigned(principal, {
        taskId: recordId,
        title: String((result.mapped as { title?: string }).title ?? "Task"),
        assigneePersonnelId: result.nextAssigneeId,
      });
    }

    return result.mapped;
  }

  private async notifyTaskAssigned(
    principal: ForgePrincipal,
    input: { taskId: string; title: string; assigneePersonnelId: string },
  ) {
    if (!this.notifications) return;
    const recipient = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [person] = await tx
        .select({
          userAuthId: industrialPersonnel.userAuthId,
          email: industrialPersonnel.email,
          companyEmail: industrialPersonnel.companyEmail,
          displayName: industrialPersonnel.displayName,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.id, input.assigneePersonnelId),
            eq(industrialPersonnel.tenantId, principal.tenantId),
            isNull(industrialPersonnel.archivedAt),
          ),
        )
        .limit(1);
      return person ?? null;
    });

    const userId = String(recipient?.userAuthId ?? "").trim();
    if (!userId) return;

    const email = String(recipient?.companyEmail || recipient?.email || "")
      .trim()
      .toLowerCase();
    const title = "New task assigned to you";
    const body = `"${input.title}" was assigned to you. Open Tasks to review and complete it.`;

    try {
      await this.notifications.create(
        principal.tenantId,
        {
          userId,
          type: "industrial.task.assigned",
          title,
          body,
          priority: "HIGH",
          destination: email ? "BOTH" : "IN_APP",
          ...(email ? { emailTo: email, emailTemplateKey: "system_notification" as const } : {}),
          href: `/modules/tasks/`,
          metadataJson: {
            taskId: input.taskId,
            assigneePersonnelId: input.assigneePersonnelId,
          },
        },
        principal,
      );
    } catch {
      // Best-effort: assignment still succeeds if notify fails.
    }
  }

  private async countMissingCompanyDriverMvrConsent(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<number> {
    const rows = await tx
      .select({
        status: industrialFleetDrivers.status,
        sourcePayload: industrialFleetDrivers.sourcePayload,
      })
      .from(industrialFleetDrivers)
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          isNull(industrialFleetDrivers.archivedAt),
        ),
      );
    let count = 0;
    for (const row of rows) {
      if (
        fleetDriverMissingMvrConsent({
          status: row.status,
          payload: this.unwrapSourcePayload(row.sourcePayload),
        })
      ) {
        count += 1;
      }
    }
    return count;
  }

  private async notifyCompanyDriverMvrConsentIfNeeded(
    principal: ForgePrincipal,
    personnelId: string,
  ): Promise<void> {
    if (!this.notifications || !personnelId) return;
    const notifications = this.notifications;
    try {
      const prepared = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
        const [person] = await tx
          .select({
            id: industrialPersonnel.id,
            status: industrialPersonnel.status,
            archivedAt: industrialPersonnel.archivedAt,
            isCompanyDriver: industrialPersonnel.isCompanyDriver,
            userAuthId: industrialPersonnel.userAuthId,
            email: industrialPersonnel.email,
            companyEmail: industrialPersonnel.companyEmail,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!person?.isCompanyDriver || person.archivedAt) return null;
        const status = normalizePersonnelStatus(String(person.status ?? "")).toLowerCase();
        if (status === "inactive" || status === "terminated") return null;

        const [driver] = await tx
          .select({
            status: industrialFleetDrivers.status,
            sourcePayload: industrialFleetDrivers.sourcePayload,
          })
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.tenantId, principal.tenantId),
              eq(industrialFleetDrivers.personnelId, personnelId),
              isNull(industrialFleetDrivers.archivedAt),
            ),
          )
          .limit(1);
        const payload = driver ? this.unwrapSourcePayload(driver.sourcePayload) : {};
        if (
          !fleetDriverMissingMvrConsent({
            status: driver?.status ?? "on_insurance",
            payload,
          })
        ) {
          return null;
        }

        const login = await this.resolvePersonnelLoginUser(tx, principal.tenantId, {
          userAuthId: person.userAuthId,
          email: person.email,
          companyEmail: person.companyEmail,
        });
        if (!login) return null;

        const [existing] = await tx
          .select({ id: userNotifications.id })
          .from(userNotifications)
          .where(
            and(
              eq(userNotifications.tenantId, principal.tenantId),
              eq(userNotifications.userId, login.userId),
              eq(userNotifications.type, COMPANY_DRIVER_MVR_CONSENT_NOTIFICATION_TYPE),
              isNull(userNotifications.readAt),
            ),
          )
          .limit(1);
        if (existing) return null;

        const formHref = await this.resolveMvrConsentFormFillHref(
          tx,
          principal.tenantId,
          personnelId,
        );
        return { login, href: formHref };
      });
      if (!prepared) return;

      await notifications.create(
        principal.tenantId,
        {
          userId: prepared.login.userId,
          type: COMPANY_DRIVER_MVR_CONSENT_NOTIFICATION_TYPE,
          title: "MVR Consent form required",
          body: "Company drivers must have a signed MVR Consent form on file. Open this notification to complete it. Your employee record was saved.",
          priority: "HIGH",
          destination: prepared.login.email ? "BOTH" : "IN_APP",
          ...(prepared.login.email
            ? { emailTo: prepared.login.email, emailTemplateKey: "system_notification" as const }
            : {}),
          href: prepared.href,
          metadataJson: { personnelId },
        },
        principal,
      );
    } catch {
      // Best-effort: personnel save must not fail if notify fails.
    }
  }

  private async resolvePersonnelLoginUser(
    tx: DatabaseTransaction,
    tenantId: string,
    person: {
      userAuthId?: string | null;
      email?: string | null;
      companyEmail?: string | null;
    },
  ): Promise<{ userId: string; email: string } | null> {
    const usable = (row: {
      id: string;
      email: string | null;
      status: string;
      disabledAt: Date | null;
    }) => {
      if (row.disabledAt) return false;
      return (
        String(row.status ?? "")
          .trim()
          .toUpperCase() !== "DISABLED"
      );
    };
    const authId = String(person.userAuthId ?? "").trim();
    if (authId && UUID_PATTERN.test(authId)) {
      const [byId] = await tx
        .select({
          id: users.id,
          email: users.primaryEmail,
          status: users.status,
          disabledAt: users.disabledAt,
        })
        .from(users)
        .where(and(eq(users.id, authId), eq(users.tenantId, tenantId)))
        .limit(1);
      if (byId && usable(byId)) {
        return {
          userId: byId.id,
          email: String(byId.email ?? "")
            .trim()
            .toLowerCase(),
        };
      }
    }
    const emails = [person.companyEmail, person.email]
      .map((value) =>
        String(value ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    for (const email of emails) {
      const [byEmail] = await tx
        .select({
          id: users.id,
          email: users.primaryEmail,
          status: users.status,
          disabledAt: users.disabledAt,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), sql`lower(${users.primaryEmail}) = ${email}`))
        .limit(1);
      if (byEmail && usable(byEmail)) {
        return {
          userId: byEmail.id,
          email: String(byEmail.email ?? "")
            .trim()
            .toLowerCase(),
        };
      }
    }
    return null;
  }

  private async resolveMvrConsentFormFillHref(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
  ): Promise<string> {
    const definitions = await tx
      .select({
        id: industrialFormDefinitions.id,
        title: industrialFormDefinitions.title,
        formKey: industrialFormDefinitions.formKey,
        sourceDocumentId: industrialFormDefinitions.sourceDocumentId,
      })
      .from(industrialFormDefinitions)
      .where(
        and(
          eq(industrialFormDefinitions.tenantId, tenantId),
          isNull(industrialFormDefinitions.archivedAt),
        ),
      );
    const match = definitions.find((definition) => isProducersMvrConsentForm(definition));
    if (match?.id) {
      const params = new URLSearchParams({
        tab: "fill",
        form: match.id,
        personnel: personnelId,
      });
      return `/modules/forms/?${params.toString()}`;
    }
    return `/modules/personnel/person/?id=${encodeURIComponent(personnelId)}`;
  }

  async listEmergencyCategory(principal: ForgePrincipal, category: string, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const siteId = (query.siteId ?? query.locationId ?? "").trim();
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
      let mapped = items.map((r) =>
        this.mapListItem({
          id: r.id,
          title: r.title,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          sourcePayload: r.sourcePayload,
          extra: { responseType: r.responseType, category },
        }),
      );
      if (siteId) {
        mapped = mapped.filter((row) => {
          const payload =
            row && typeof row === "object"
              ? ((row as { sourcePayload?: Record<string, unknown>; siteId?: string | null })
                  .sourcePayload ?? row)
              : {};
          const rowSite = String(
            (row as { siteId?: string | null }).siteId ??
              (payload as { siteId?: unknown; locationId?: unknown }).siteId ??
              (payload as { locationId?: unknown }).locationId ??
              "",
          ).trim();
          return !rowSite || rowSite === siteId;
        });
      }
      return {
        page,
        pageSize,
        items: mapped,
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
    const attentionAllowed = (moduleCode: string) =>
      industrialDashboardAttentionAllowed({
        moduleCode,
        permissions: principal.permissions,
        activeModules: principal.activeModules,
        isPlatformAdmin: principal.isPlatformAdmin,
      });

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

      const zero = Promise.resolve(0);
      const [
        openIncidents,
        openCorrectiveActions,
        inspectionsOpen,
        trainingExpiring,
        observationsOpen,
        lotoActive,
        wcOpen,
        wcWeeklyUpdatesDue,
        tasksOpen,
        missingMvrConsent,
      ] = await Promise.all([
        attentionAllowed("INCIDENTS")
          ? countOpen(industrialIncidents, ["OPEN", "INVESTIGATING", "ACTIVE"])
          : zero,
        attentionAllowed("CORRECTIVE_ACTIONS")
          ? countOpen(industrialCorrectiveActions, ["OPEN", "IN_PROGRESS", "ACTIVE"])
          : zero,
        attentionAllowed("INSPECTIONS")
          ? countOpen(industrialInspections, ["OPEN", "IN_PROGRESS", "DUE", "ACTIVE"])
          : zero,
        attentionAllowed("TRAINING")
          ? (async () => {
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
            })()
          : zero,
        attentionAllowed("OBSERVATIONS")
          ? countOpen(industrialObservations, ["OPEN", "IN_PROGRESS", "ACTIVE", "AT_RISK"])
          : zero,
        attentionAllowed("LOCKOUT_TAGOUT")
          ? countOpen(industrialLotoProcedures, ["ACTIVE", "REVIEW_DUE", "OPEN"])
          : zero,
        attentionAllowed("WORKERS_COMP")
          ? (async () => {
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
            })()
          : zero,
        attentionAllowed("WORKERS_COMP") &&
        modulePagePermissionOk("WORKERS_COMP", "weekly-updates", principal.permissions)
          ? (async () => {
              const weekOf = normalizeThursdayWeekOf(undefined);
              const openCases = await tx
                .select({
                  id: industrialWorkersCompCases.id,
                  status: industrialWorkersCompCases.status,
                })
                .from(industrialWorkersCompCases)
                .where(
                  and(
                    eq(industrialWorkersCompCases.tenantId, principal.tenantId),
                    isNull(industrialWorkersCompCases.archivedAt),
                    inArray(industrialWorkersCompCases.status, [
                      "OPEN",
                      "ACTIVE",
                      "RESTRICTED",
                      "LOST_TIME",
                      "DRAFT",
                    ]),
                  ),
                );
              const openIds = openCases
                .filter((row) => isOpenWcStatus(row.status))
                .map((row) => row.id);
              if (openIds.length === 0) return 0;
              const done = await tx
                .select({ caseId: industrialWorkersCompWeeklyUpdates.caseId })
                .from(industrialWorkersCompWeeklyUpdates)
                .where(
                  and(
                    eq(industrialWorkersCompWeeklyUpdates.tenantId, principal.tenantId),
                    eq(industrialWorkersCompWeeklyUpdates.weekOf, weekOf),
                    isNull(industrialWorkersCompWeeklyUpdates.archivedAt),
                    inArray(industrialWorkersCompWeeklyUpdates.caseId, openIds),
                    sql`btrim(coalesce(${industrialWorkersCompWeeklyUpdates.notes}, '')) <> ''`,
                  ),
                );
              const doneSet = new Set(done.map((row) => row.caseId));
              return openIds.filter((id) => !doneSet.has(id)).length;
            })()
          : zero,
        attentionAllowed("TASKS")
          ? countOpen(industrialTasks, ["OPEN", "ACTIVE", "IN_PROGRESS"])
          : zero,
        attentionAllowed("PERSONNEL")
          ? this.countMissingCompanyDriverMvrConsent(tx, principal.tenantId)
          : zero,
      ]);

      const countsByKey: Record<string, number> = {
        openIncidents,
        openCorrectiveActions,
        inspectionsDue: inspectionsOpen,
        trainingExpiring,
        observations: observationsOpen,
        lotoReviews: lotoActive,
        workersComp: wcOpen,
        workersCompWeeklyUpdates: wcWeeklyUpdatesDue,
        tasks: tasksOpen,
        missingMvrConsent,
      };

      const attention = INDUSTRIAL_DASHBOARD_ATTENTION_SOURCES.filter((source) => {
        if (!attentionAllowed(source.moduleCode)) return false;
        if (source.key === "workersCompWeeklyUpdates") {
          return modulePagePermissionOk("WORKERS_COMP", "weekly-updates", principal.permissions);
        }
        return true;
      }).map((source) => ({
        key: source.key,
        label: source.label,
        count: countsByKey[source.key] ?? 0,
        href: source.href,
      }));

      const quickActions = [
        { label: "Report incident", href: "/modules/incidents", moduleCode: "INCIDENTS" },
        { label: "New observation", href: "/modules/observations", moduleCode: "OBSERVATIONS" },
        { label: "Start inspection", href: "/modules/inspections", moduleCode: "INSPECTIONS" },
        { label: "Record training", href: "/modules/training", moduleCode: "TRAINING" },
      ]
        .filter((action) => attentionAllowed(action.moduleCode))
        .map(({ label, href }) => ({ label, href }));

      return {
        generatedAt: new Date().toISOString(),
        facilityId: siteId || null,
        attention,
        quickActions,
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

      const buildWindow = async (
        days: number,
        id: "threeMonth" | "sixMonth" | "oneYear",
        label: string,
      ) => {
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
          dateRange: {
            start: since.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10),
          },
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

      const active = rangeDays === 90 ? threeMonth : rangeDays === 365 ? oneYear : sixMonth;

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
        {
          label: "Incidents",
          key: "incidents",
          count: active.incidents,
          href: "/modules/incidents/",
        },
        {
          label: "Inspections",
          key: "inspections",
          count: active.inspections,
          href: "/modules/inspections/",
        },
        {
          label: "Observations",
          key: "observations",
          count: active.observations,
          href: "/modules/observations/",
        },
        { label: "Forms", key: "forms", count: active.formSubmissions, href: "/modules/forms/" },
        {
          label: "Training",
          key: "training",
          count: active.trainingCompletions,
          href: "/modules/training/",
        },
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

      const departmentScores = await this.buildDepartmentSafetyScores(tx, principal.tenantId, {
        since: new Date(active.dateRange.start + "T00:00:00.000Z"),
        siteId: siteId || null,
      });

      const insights: string[] = [];
      if (active.openIncidents === 0) insights.push("No open incidents in this period.");
      else
        insights.push(
          `${active.openIncidents} open incident${active.openIncidents === 1 ? "" : "s"} need attention.`,
        );
      if (active.enterpriseActivity > 0) {
        insights.push(
          `${active.enterpriseActivity} enterprise program records across ${enterpriseKeys.length} modules.`,
        );
      }
      if (mostActive && mostActive.count > 0) {
        insights.push(`Most active module: ${mostActive.label} (${mostActive.count}).`);
      }
      if (active.observations === 0) insights.push("No observations recorded in this period.");
      if (dotTotal > 0)
        insights.push(`DOT compliance score ${dotCompliance}% (${dotOpen} open items).`);
      if (departmentScores.length > 0) {
        const weakest =
          departmentScores.find((d) => d.departmentId !== null) ?? departmentScores[0];
        if (weakest && weakest.safetyScore < active.safetyScore) {
          insights.push(
            `Lowest department score: ${weakest.departmentName} (${weakest.safetyScore}, grade ${weakest.safetyGrade}).`,
          );
        }
      }

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
        departmentScores,
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

  /**
   * Safety Index broken out by department for the active analytics window.
   * Inspections/training use departmentId columns; incidents use source_payload.departmentId
   * (with departmentLabel / departmentName fallback).
   */
  private async buildDepartmentSafetyScores(
    tx: DatabaseTransaction,
    tenantId: string,
    input: { since: Date; siteId: string | null },
  ) {
    type Bucket = {
      departmentId: string | null;
      departmentName: string;
      openIncidents: number;
      totalIncidents: number;
      inspectionCount: number;
      trainingCount: number;
      personnelCount: number;
      unsafeObservations: Array<{ riskLevel: unknown; status: unknown; at: string }>;
      positiveObservations: number;
      incidentDates: string[];
    };
    const emptyCounts = () => ({
      openIncidents: 0,
      totalIncidents: 0,
      inspectionCount: 0,
      trainingCount: 0,
      personnelCount: 0,
      unsafeObservations: [],
      positiveObservations: 0,
      incidentDates: [],
    });

    const deptConditions = [
      eq(industrialDepartments.tenantId, tenantId),
      isNull(industrialDepartments.archivedAt),
    ];
    if (input.siteId) {
      deptConditions.push(eq(industrialDepartments.siteId, input.siteId));
    }
    const departments = await tx
      .select({
        id: industrialDepartments.id,
        name: industrialDepartments.name,
      })
      .from(industrialDepartments)
      .where(and(...deptConditions))
      .orderBy(industrialDepartments.name);

    const buckets = new Map<string, Bucket>();
    const nameToId = new Map<string, string>();
    for (const dept of departments) {
      buckets.set(dept.id, {
        departmentId: dept.id,
        departmentName: dept.name,
        ...emptyCounts(),
      });
      nameToId.set(dept.name.trim().toLowerCase(), dept.id);
    }
    const unassignedKey = "__unassigned__";
    const ensureUnassigned = () => {
      if (!buckets.has(unassignedKey)) {
        buckets.set(unassignedKey, {
          departmentId: null,
          departmentName: "Unassigned",
          ...emptyCounts(),
        });
      }
      return buckets.get(unassignedKey)!;
    };

    const resolveDeptKey = (
      departmentId: string | null | undefined,
      departmentName: string | null | undefined,
    ) => {
      const id = String(departmentId ?? "").trim();
      if (id && buckets.has(id)) return id;
      const name = String(departmentName ?? "")
        .trim()
        .toLowerCase();
      if (name && nameToId.has(name)) return nameToId.get(name)!;
      return unassignedKey;
    };

    const personnelConditions = [
      eq(industrialPersonnel.tenantId, tenantId),
      isNull(industrialPersonnel.archivedAt),
    ];
    if (input.siteId) {
      personnelConditions.push(eq(industrialPersonnel.siteId, input.siteId));
    }
    const personnelRows = await tx
      .select({
        departmentId: industrialPersonnel.departmentId,
        count: sql<number>`count(*)::int`,
      })
      .from(industrialPersonnel)
      .where(and(...personnelConditions))
      .groupBy(industrialPersonnel.departmentId);
    for (const row of personnelRows) {
      const key = resolveDeptKey(row.departmentId, null);
      const bucket = key === unassignedKey ? ensureUnassigned() : buckets.get(key)!;
      bucket.personnelCount += Number(row.count ?? 0);
    }

    const inspectionConditions = [
      eq(industrialInspections.tenantId, tenantId),
      isNull(industrialInspections.archivedAt),
      gte(industrialInspections.createdAt, input.since),
    ];
    if (input.siteId) {
      inspectionConditions.push(eq(industrialInspections.siteId, input.siteId));
    }
    const inspectionRows = await tx
      .select({
        departmentId: industrialInspections.departmentId,
        count: sql<number>`count(*)::int`,
      })
      .from(industrialInspections)
      .where(and(...inspectionConditions))
      .groupBy(industrialInspections.departmentId);
    for (const row of inspectionRows) {
      const key = resolveDeptKey(row.departmentId, null);
      const bucket = key === unassignedKey ? ensureUnassigned() : buckets.get(key)!;
      bucket.inspectionCount += Number(row.count ?? 0);
    }

    const trainingConditions = [
      eq(industrialTrainingRecords.tenantId, tenantId),
      isNull(industrialTrainingRecords.archivedAt),
      gte(industrialTrainingRecords.createdAt, input.since),
    ];
    if (input.siteId) {
      trainingConditions.push(eq(industrialTrainingRecords.siteId, input.siteId));
    }
    const trainingRows = await tx
      .select({
        departmentId: industrialTrainingRecords.departmentId,
        count: sql<number>`count(*)::int`,
      })
      .from(industrialTrainingRecords)
      .where(and(...trainingConditions))
      .groupBy(industrialTrainingRecords.departmentId);
    for (const row of trainingRows) {
      const key = resolveDeptKey(row.departmentId, null);
      const bucket = key === unassignedKey ? ensureUnassigned() : buckets.get(key)!;
      bucket.trainingCount += Number(row.count ?? 0);
    }

    const incidentDeptIdSql = sql<string>`coalesce(
      nullif(btrim(
        case
          when jsonb_typeof(${industrialIncidents.sourcePayload}) = 'string'
            then ((${industrialIncidents.sourcePayload} #>> '{}')::jsonb ->> 'departmentId')
          else ${industrialIncidents.sourcePayload} ->> 'departmentId'
        end
      ), ''),
      ''
    )`;
    const incidentDeptNameSql = sql<string>`coalesce(
      nullif(btrim(
        case
          when jsonb_typeof(${industrialIncidents.sourcePayload}) = 'string'
            then coalesce(
              ((${industrialIncidents.sourcePayload} #>> '{}')::jsonb ->> 'departmentLabel'),
              ((${industrialIncidents.sourcePayload} #>> '{}')::jsonb ->> 'departmentName')
            )
          else coalesce(
            ${industrialIncidents.sourcePayload} ->> 'departmentLabel',
            ${industrialIncidents.sourcePayload} ->> 'departmentName'
          )
        end
      ), ''),
      ''
    )`;
    const incidentConditions = [
      eq(industrialIncidents.tenantId, tenantId),
      isNull(industrialIncidents.archivedAt),
      gte(industrialIncidents.createdAt, input.since),
    ];
    if (input.siteId) {
      incidentConditions.push(eq(industrialIncidents.siteId, input.siteId));
    }
    const incidentRows = await tx
      .select({
        departmentId: incidentDeptIdSql,
        departmentName: incidentDeptNameSql,
        status: industrialIncidents.status,
        count: sql<number>`count(*)::int`,
        lastAt: sql<string>`max(${industrialIncidents.createdAt})::text`,
      })
      .from(industrialIncidents)
      .where(and(...incidentConditions))
      .groupBy(incidentDeptIdSql, incidentDeptNameSql, industrialIncidents.status);
    for (const row of incidentRows) {
      const key = resolveDeptKey(row.departmentId, row.departmentName);
      const bucket = key === unassignedKey ? ensureUnassigned() : buckets.get(key)!;
      const count = Number(row.count ?? 0);
      bucket.totalIncidents += count;
      if (row.lastAt) bucket.incidentDates.push(row.lastAt);
      const status = String(row.status ?? "").toLowerCase();
      const closed =
        status.includes("closed") ||
        status.includes("resolv") ||
        status.includes("archiv") ||
        status.includes("complet");
      if (!closed) bucket.openIncidents += count;
    }

    const obs = industrialObservations;
    const obsField = (field: string) => sql<string>`coalesce(nullif(btrim(
      case
        when jsonb_typeof(${obs.sourcePayload}) = 'string'
          then ((${obs.sourcePayload} #>> '{}')::jsonb ->> ${field})
        else ${obs.sourcePayload} ->> ${field}
      end
    ), ''), '')`;
    const observationConditions = [
      eq(obs.tenantId, tenantId),
      isNull(obs.archivedAt),
      gte(obs.createdAt, input.since),
    ];
    if (input.siteId) {
      observationConditions.push(eq(obs.siteId, input.siteId));
    }
    const observationRows = await tx
      .select({
        departmentId: obsField("departmentId"),
        departmentName: obsField("departmentName"),
        observationType: obsField("observationType"),
        riskLevel: obsField("riskLevel"),
        observedAt: obsField("observedAt"),
        status: obs.status,
        createdAt: obs.createdAt,
      })
      .from(obs)
      .where(and(...observationConditions));
    for (const row of observationRows) {
      const key = resolveDeptKey(row.departmentId, row.departmentName);
      const bucket = key === unassignedKey ? ensureUnassigned() : buckets.get(key)!;
      if (isPositiveObservationType(row.observationType)) {
        bucket.positiveObservations += 1;
      } else {
        bucket.unsafeObservations.push({
          riskLevel: row.riskLevel,
          status: row.status,
          at: row.observedAt || row.createdAt.toISOString(),
        });
      }
    }

    const scores = [...buckets.values()]
      .filter(
        (bucket) =>
          bucket.departmentId !== null ||
          bucket.totalIncidents > 0 ||
          bucket.inspectionCount > 0 ||
          bucket.trainingCount > 0 ||
          bucket.unsafeObservations.length > 0 ||
          bucket.positiveObservations > 0,
      )
      .map((bucket) => {
        const baseScore = this.computeSafetyIndex({
          openIncidents: bucket.openIncidents,
          totalIncidents: bucket.totalIncidents,
          inspectionCount: bucket.inspectionCount,
          trainingCount: bucket.trainingCount,
          enterpriseOpenHint: 0,
        });
        const observationImpact = computeObservationScoreImpact({
          unsafe: bucket.unsafeObservations,
          positiveCount: bucket.positiveObservations,
          incidentDates: bucket.incidentDates,
        });
        const safetyScore = Math.round(
          Math.min(
            Math.max(baseScore - observationImpact.deduction + observationImpact.credit, 0),
            100,
          ),
        );
        return {
          departmentId: bucket.departmentId,
          departmentName: bucket.departmentName,
          safetyScore,
          safetyGrade: this.safetyGrade(safetyScore),
          openIncidents: bucket.openIncidents,
          totalIncidents: bucket.totalIncidents,
          inspections: bucket.inspectionCount,
          trainingCompletions: bucket.trainingCount,
          personnelCount: bucket.personnelCount,
          observations: observationImpact.unsafeCount + observationImpact.positiveCount,
          unsafeObservations: observationImpact.unsafeCount,
          openUnsafeObservations: observationImpact.unsafeOpen,
          observationPoints:
            Math.round((observationImpact.credit - observationImpact.deduction) * 10) / 10,
          daysClean: observationImpact.daysClean,
        };
      })
      .sort((a, b) => {
        if (a.departmentId === null && b.departmentId !== null) return 1;
        if (b.departmentId === null && a.departmentId !== null) return -1;
        if (a.safetyScore !== b.safetyScore) return a.safetyScore - b.safetyScore;
        return a.departmentName.localeCompare(b.departmentName, undefined, {
          sensitivity: "base",
        });
      });

    return scores;
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

  private incidentFieldsForOsha(
    row: {
      id: string;
      title: string | null;
      siteId: string | null;
      sourcePayload: unknown;
    },
    personnel?: Record<string, unknown> | null,
  ) {
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const seeded = seedForm301FieldsFromIncident({
      incidentId: row.id,
      title: row.title,
      siteId: row.siteId,
      payload,
      personnel: personnel ?? null,
    });
    return {
      id: row.id,
      title: row.title,
      employeeName: typeof seeded.employeeName === "string" ? seeded.employeeName : null,
      dateOccurred: typeof seeded.injuryDate === "string" ? seeded.injuryDate : null,
      establishment: typeof seeded.establishment === "string" ? seeded.establishment : null,
      division: divisionFromPayload(payload) || null,
      /** Used by callers to look up the incident department's division. */
      departmentId: typeof payload.departmentId === "string" ? payload.departmentId : null,
      personnelDivision: personnel
        ? String(personnel.divisionName ?? "").trim() || divisionFromPayload(personnel) || null
        : null,
      sitePath: typeof payload.site === "string" ? payload.site : null,
      oshaRecordable: payload.oshaRecordable ?? payload.recordable,
      reportedBy: typeof payload.reportedBy === "string" ? payload.reportedBy : null,
      jobTitle: typeof seeded.jobTitle === "string" ? seeded.jobTitle : null,
      description: typeof seeded.description === "string" ? seeded.description : null,
      daysAway: seeded.daysAway,
      restrictedDays: seeded.restrictedDays,
      form301Seed: seeded,
    };
  }

  private async loadPersonnelRecordForOsha(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string | null | undefined,
  ): Promise<Record<string, unknown> | null> {
    const id = String(personnelId ?? "").trim();
    if (!id || !UUID_PATTERN.test(id)) return null;
    const [row] = await tx
      .select()
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.id, id),
          eq(industrialPersonnel.tenantId, tenantId),
          isNull(industrialPersonnel.archivedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    const payload = this.unwrapSourcePayload(row.sourcePayload);
    const street =
      (row.street && String(row.street).trim()) ||
      String(payload.street ?? payload.address ?? "").trim();
    const city = (row.city && String(row.city).trim()) || String(payload.city ?? "").trim();
    const state = (row.state && String(row.state).trim()) || String(payload.state ?? "").trim();
    const zip =
      (row.zip && String(row.zip).trim()) || String(payload.zip ?? payload.zipCode ?? "").trim();
    const gender =
      normalizeWorkersCompGender(row.gender) ||
      normalizeWorkersCompGender(payload.gender ?? payload.sex);
    return {
      ...payload,
      id: row.id,
      displayName: row.displayName,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth
        ? String(row.dateOfBirth).slice(0, 10)
        : String(payload.dateOfBirth ?? "")
            .trim()
            .slice(0, 10),
      hireDate: row.hireDate
        ? String(row.hireDate).slice(0, 10)
        : String(payload.hireDate ?? "")
            .trim()
            .slice(0, 10),
      jobTitle: row.jobTitle ?? String(payload.jobTitle ?? "").trim(),
      phone: row.phone ?? String(payload.phone ?? "").trim(),
      companyPhone: row.companyPhone ?? String(payload.companyPhone ?? "").trim(),
      street,
      city,
      state,
      zip,
      gender,
      divisionName:
        row.divisionName ?? String(payload.divisionName ?? payload.division ?? "").trim(),
    };
  }

  /** Department id → division name, for resolving a case's or incident's division. */
  private async loadDepartmentDivisions(
    tx: DatabaseTransaction,
    tenantId: string,
    departmentIds: Iterable<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set([...departmentIds].filter((id): id is string => !!id && UUID_PATTERN.test(id))),
    ];
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const rows = await tx
      .select({ id: industrialDepartments.id, divisionName: industrialDepartments.divisionName })
      .from(industrialDepartments)
      .where(
        and(eq(industrialDepartments.tenantId, tenantId), inArray(industrialDepartments.id, ids)),
      );
    for (const r of rows) {
      const name = r.divisionName?.trim();
      if (name) out.set(r.id, name);
    }
    return out;
  }

  private mapOshaCase(
    row: typeof industrialOshaCases.$inferSelect,
    extras: {
      incident?: ReturnType<IndustrialDomainService["incidentFieldsForOsha"]> | null;
      personnelName?: string | null;
      siteName?: string | null;
      departmentDivision?: string | null;
      personnelDivision?: string | null;
    } = {},
  ) {
    const hydrated = hydrateOshaFromSource({
      title: row.title,
      status: row.status,
      recordDate: row.recordDate,
      personnelId: row.personnelId,
      sourcePayload: row.sourcePayload,
      incident: extras.incident ?? null,
      personnelName: extras.personnelName ?? null,
      siteName: extras.siteName ?? null,
      departmentDivision: extras.departmentDivision ?? null,
      personnelDivision: extras.personnelDivision ?? extras.incident?.personnelDivision ?? null,
    });
    return {
      id: row.id,
      title: hydrated.title,
      status: row.status,
      siteId: row.siteId,
      departmentId: row.departmentId,
      personnelId: row.personnelId,
      recordDate: row.recordDate,
      incidentId: hydrated.incidentId || extras.incident?.id || "",
      sourceIncidentId: hydrated.sourceIncidentId,
      caseNumber: hydrated.caseNumber,
      employeeName: hydrated.employeeName,
      injuryDate: hydrated.injuryDate,
      recordabilityStatus: hydrated.recordabilityStatus,
      oshaRecordable: hydrated.oshaRecordable,
      privacyCase: hydrated.privacyCase,
      reviewer: hydrated.reviewer || "Pending",
      establishment: hydrated.establishment,
      division: hydrated.division,
      calendarYear: hydrated.calendarYear,
      daysAway: hydrated.daysAway,
      restrictedDays: hydrated.restrictedDays,
      jobTitle: hydrated.jobTitle,
      description: hydrated.description,
      eventLocation: hydrated.eventLocation,
      caseOutcome: hydrated.caseOutcome,
      illnessCategory: hydrated.illnessCategory,
      completedBy: hydrated.completedBy,
      completedByTitle: hydrated.completedByTitle,
      completedByPhone: hydrated.completedByPhone,
      completedByDate: hydrated.completedByDate,
      street: hydrated.street,
      city: hydrated.city,
      state: hydrated.state,
      zip: hydrated.zip,
      dateOfBirth: hydrated.dateOfBirth,
      dateHired: hydrated.dateHired,
      gender: hydrated.gender,
      physicianName: hydrated.physicianName,
      treatmentFacility: hydrated.treatmentFacility,
      treatmentStreet: hydrated.treatmentStreet,
      treatmentCity: hydrated.treatmentCity,
      treatmentState: hydrated.treatmentState,
      treatmentZip: hydrated.treatmentZip,
      treatedInEr: hydrated.treatedInEr,
      hospitalizedOvernight: hydrated.hospitalizedOvernight,
      timeBeganWork: hydrated.timeBeganWork,
      timeBeganWorkAmPm: hydrated.timeBeganWorkAmPm,
      timeOfEvent: hydrated.timeOfEvent,
      timeOfEventAmPm: hydrated.timeOfEventAmPm,
      timeCannotBeDetermined: hydrated.timeCannotBeDetermined,
      activityBefore: hydrated.activityBefore,
      whatHappened: hydrated.whatHappened,
      injuryOrIllness: hydrated.injuryOrIllness,
      objectOrSubstance: hydrated.objectOrSubstance,
      dateOfDeath: hydrated.dateOfDeath,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }

  async listOsha(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim().toLowerCase();
    const yearRaw = (query.year ?? query.calendarYear ?? "").trim();
    const year = yearRaw ? Number(yearRaw) : null;
    const establishment = (query.establishment ?? "").trim().toLowerCase();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select({
          case: industrialOshaCases,
          personnelName: industrialPersonnel.displayName,
          personnelDivision: industrialPersonnel.divisionName,
          siteName: industrialSites.name,
        })
        .from(industrialOshaCases)
        .leftJoin(industrialPersonnel, eq(industrialPersonnel.id, industrialOshaCases.personnelId))
        .leftJoin(industrialSites, eq(industrialSites.id, industrialOshaCases.siteId))
        .where(
          and(
            eq(industrialOshaCases.tenantId, principal.tenantId),
            isNull(industrialOshaCases.archivedAt),
          ),
        )
        .orderBy(desc(industrialOshaCases.updatedAt))
        .limit(500)
        .offset(0);

      const firebaseIncidentIds = new Set<string>();
      const incidentIds = new Set<string>();
      for (const { case: row } of rows) {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const id = String(payload.incidentId ?? payload.incident_id ?? "").trim();
        if (UUID_PATTERN.test(id)) incidentIds.add(id);
        else if (id) firebaseIncidentIds.add(id);
        const awsId = String(payload.awsIncidentId ?? "").trim();
        if (UUID_PATTERN.test(awsId)) incidentIds.add(awsId);
      }

      if (firebaseIncidentIds.size > 0) {
        const mapped = await tx
          .select({
            sourceDocumentId: industrialIncidents.sourceDocumentId,
            id: industrialIncidents.id,
          })
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.tenantId, principal.tenantId),
              inArray(industrialIncidents.sourceDocumentId, [...firebaseIncidentIds]),
            ),
          );
        for (const row of mapped) {
          if (row.sourceDocumentId && row.id) {
            incidentIds.add(row.id);
          }
        }
      }

      const incidentsById = new Map<
        string,
        ReturnType<IndustrialDomainService["incidentFieldsForOsha"]>
      >();
      const incidentsBySourceId = new Map<
        string,
        ReturnType<IndustrialDomainService["incidentFieldsForOsha"]>
      >();
      if (incidentIds.size > 0 || firebaseIncidentIds.size > 0) {
        const conditions = [
          eq(industrialIncidents.tenantId, principal.tenantId),
          incidentIds.size > 0
            ? inArray(industrialIncidents.id, [...incidentIds])
            : firebaseIncidentIds.size > 0
              ? inArray(industrialIncidents.sourceDocumentId, [...firebaseIncidentIds])
              : sql`false`,
        ];
        if (incidentIds.size > 0 && firebaseIncidentIds.size > 0) {
          conditions[1] = or(
            inArray(industrialIncidents.id, [...incidentIds]),
            inArray(industrialIncidents.sourceDocumentId, [...firebaseIncidentIds]),
          )!;
        }
        const incidents = await tx
          .select()
          .from(industrialIncidents)
          .where(and(...conditions));
        for (const incident of incidents) {
          const fields = this.incidentFieldsForOsha(incident);
          incidentsById.set(incident.id, fields);
          if (incident.sourceDocumentId) {
            incidentsBySourceId.set(incident.sourceDocumentId, fields);
          }
        }
      }

      const departmentDivisions = await this.loadDepartmentDivisions(tx, principal.tenantId, [
        ...rows.map(({ case: row }) => row.departmentId),
        ...[...incidentsById.values()].map((fields) => fields.departmentId),
      ]);

      let mapped = rows.map(({ case: row, personnelName, personnelDivision, siteName }) => {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        const rawIncidentId = String(payload.incidentId ?? payload.incident_id ?? "").trim();
        const awsIncidentId = String(payload.awsIncidentId ?? "").trim();
        const incident =
          (UUID_PATTERN.test(awsIncidentId) ? incidentsById.get(awsIncidentId) : null) ||
          (UUID_PATTERN.test(rawIncidentId) ? incidentsById.get(rawIncidentId) : null) ||
          (rawIncidentId ? incidentsBySourceId.get(rawIncidentId) : null) ||
          null;
        const incidentDeptDivision = incident?.departmentId
          ? departmentDivisions.get(incident.departmentId)
          : undefined;
        return this.mapOshaCase(row, {
          incident: incident
            ? { ...incident, division: incident.division || incidentDeptDivision || null }
            : null,
          personnelName,
          siteName,
          departmentDivision: row.departmentId
            ? (departmentDivisions.get(row.departmentId) ?? null)
            : null,
          personnelDivision: personnelDivision?.trim() || null,
        });
      });

      if (year != null && Number.isFinite(year)) {
        mapped = mapped.filter((item) => item.calendarYear === year);
      }
      // OSHA establishments are divisions; the query param keeps its old name.
      if (establishment && establishment !== "all") {
        mapped = mapped.filter((item) => item.division.toLowerCase() === establishment);
      }
      if (q) {
        mapped = mapped.filter((item) => {
          const hay =
            `${item.title} ${item.employeeName} ${item.division} ${item.establishment} ${item.recordabilityStatus}`.toLowerCase();
          return hay.includes(q);
        });
      }

      const total = mapped.length;
      const items = mapped.slice(offset, offset + pageSize);
      return { page, pageSize, total, items };
    });
  }

  async getOsha(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [joined] = await tx
        .select({
          case: industrialOshaCases,
          personnelName: industrialPersonnel.displayName,
          siteName: industrialSites.name,
        })
        .from(industrialOshaCases)
        .leftJoin(industrialPersonnel, eq(industrialPersonnel.id, industrialOshaCases.personnelId))
        .leftJoin(industrialSites, eq(industrialSites.id, industrialOshaCases.siteId))
        .where(
          and(
            eq(industrialOshaCases.id, recordId),
            eq(industrialOshaCases.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!joined) throw new ForgeError("NOT_FOUND", "OSHA case not found");
      const payload = this.unwrapSourcePayload(joined.case.sourcePayload);
      const rawIncidentId = String(payload.incidentId ?? payload.incident_id ?? "").trim();
      const awsIncidentId = String(payload.awsIncidentId ?? "").trim();
      let incident: ReturnType<IndustrialDomainService["incidentFieldsForOsha"]> | null = null;
      let incidentRow: typeof industrialIncidents.$inferSelect | null = null;
      if (UUID_PATTERN.test(awsIncidentId) || UUID_PATTERN.test(rawIncidentId)) {
        const id = UUID_PATTERN.test(awsIncidentId) ? awsIncidentId : rawIncidentId;
        const [row] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, id),
              eq(industrialIncidents.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (row) incidentRow = row;
      } else if (rawIncidentId) {
        const [row] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.tenantId, principal.tenantId),
              eq(industrialIncidents.sourceDocumentId, rawIncidentId),
            ),
          )
          .limit(1);
        if (row) incidentRow = row;
      }

      let caseRow = joined.case;
      if (incidentRow) {
        const incidentPayload = this.unwrapSourcePayload(incidentRow.sourcePayload);
        const personnelId =
          String(joined.case.personnelId ?? "").trim() ||
          String(incidentPayload.personnelId ?? "").trim();
        const personnel = await this.loadPersonnelRecordForOsha(
          tx,
          principal.tenantId,
          personnelId,
        );
        incident = this.incidentFieldsForOsha(incidentRow, personnel);
        const mergedPayload = mergeOshaSeedPreferExisting(payload, incident.form301Seed);
        const filledKeys = [
          "injuryDate",
          "timeOfEvent",
          "timeOfEventAmPm",
          "street",
          "city",
          "state",
          "zip",
          "gender",
          "dateOfBirth",
          "dateHired",
          "physicianName",
          "treatmentFacility",
          "treatmentStreet",
          "treatmentCity",
          "treatmentState",
          "treatmentZip",
          "treatedInEr",
          "hospitalizedOvernight",
          "completedBy",
          "completedByTitle",
          "completedByPhone",
          "completedByDate",
        ] as const;
        const changed = filledKeys.some(
          (key) => String(mergedPayload[key] ?? "") !== String(payload[key] ?? ""),
        );
        if (changed) {
          const now = new Date();
          const [updated] = await tx
            .update(industrialOshaCases)
            .set({
              sourcePayload: mergedPayload,
              recordDate:
                typeof mergedPayload.injuryDate === "string" && mergedPayload.injuryDate
                  ? mergedPayload.injuryDate
                  : joined.case.recordDate,
              updatedAt: now,
            } as never)
            .where(eq(industrialOshaCases.id, recordId))
            .returning();
          if (updated) caseRow = updated;
        }
      }

      return this.mapOshaCase(caseRow, {
        incident,
        personnelName: joined.personnelName,
        siteName: joined.siteName,
      });
    });
  }

  async createOsha(principal: ForgePrincipal, body: Record<string, unknown>) {
    const incidentId =
      typeof body.incidentId === "string" && UUID_PATTERN.test(body.incidentId.trim())
        ? body.incidentId.trim()
        : "";
    if (!incidentId) {
      throw new ForgeError("VALIDATION_FAILED", "OSHA cases require a linked injury incident.");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [incident] = await tx
        .select()
        .from(industrialIncidents)
        .where(
          and(
            eq(industrialIncidents.id, incidentId),
            eq(industrialIncidents.tenantId, principal.tenantId),
            isNull(industrialIncidents.archivedAt),
          ),
        )
        .limit(1);
      if (!incident) throw new ForgeError("NOT_FOUND", "Injury incident not found");

      const existing = await tx
        .select({
          case: industrialOshaCases,
          personnelName: industrialPersonnel.displayName,
          siteName: industrialSites.name,
        })
        .from(industrialOshaCases)
        .leftJoin(industrialPersonnel, eq(industrialPersonnel.id, industrialOshaCases.personnelId))
        .leftJoin(industrialSites, eq(industrialSites.id, industrialOshaCases.siteId))
        .where(
          and(
            eq(industrialOshaCases.tenantId, principal.tenantId),
            isNull(industrialOshaCases.archivedAt),
          ),
        );
      for (const joined of existing) {
        const payload = this.unwrapSourcePayload(joined.case.sourcePayload);
        if (String(payload.incidentId ?? "").trim() === incidentId) {
          // Idempotent: reopen the existing OSHA case for this incident
          // (Incidents can enter OSHA without a workers' comp claim).
          const incidentPayload = this.unwrapSourcePayload(incident.sourcePayload);
          const personnelIdRaw = String(incidentPayload.personnelId ?? "").trim();
          const personnel = await this.loadPersonnelRecordForOsha(
            tx,
            principal.tenantId,
            personnelIdRaw,
          );
          const fields = this.incidentFieldsForOsha(incident, personnel);
          return this.mapOshaCase(joined.case, {
            incident: fields,
            personnelName: joined.personnelName,
            siteName: joined.siteName,
          });
        }
      }

      const incidentPayload = this.unwrapSourcePayload(incident.sourcePayload);
      const personnelIdRaw = String(incidentPayload.personnelId ?? "").trim();
      const personnel = await this.loadPersonnelRecordForOsha(
        tx,
        principal.tenantId,
        personnelIdRaw,
      );
      const fields = this.incidentFieldsForOsha(incident, personnel);
      const seed = fields.form301Seed;
      const recordability = normalizeOshaRecordability(
        body.recordabilityStatus ?? incidentPayload.recordabilityStatus ?? "PENDING",
      ) as OshaRecordability;
      const flags = oshaFlagsFromRecordability(recordability);
      const now = new Date();
      const title =
        String(body.title ?? fields.title ?? "").trim() ||
        String(fields.employeeName ?? "").trim() ||
        "OSHA case";
      const injuryDate =
        (typeof seed.injuryDate === "string" && seed.injuryDate) ||
        fields.dateOccurred?.slice(0, 10) ||
        null;
      const caseCount = existing.length + 1;
      const caseNumber =
        typeof body.caseNumber === "string" && body.caseNumber.trim()
          ? body.caseNumber.trim()
          : String(caseCount);
      const personnelId =
        typeof seed.personnelId === "string" && UUID_PATTERN.test(seed.personnelId)
          ? seed.personnelId
          : null;
      const [row] = await tx
        .insert(industrialOshaCases)
        .values({
          id: createId(),
          tenantId: principal.tenantId,
          siteId: incident.siteId,
          title,
          status: String(body.status ?? "OPEN"),
          recordDate: injuryDate,
          personnelId,
          sourceSystem: "FORGE",
          sourcePayload: {
            ...mergeOshaCasePayloadFields(seed, body),
            incidentId,
            title,
            caseNumber,
            recordabilityStatus: recordability,
            oshaRecordable: flags.oshaRecordable,
            privacyCase: flags.privacyCase,
            calendarYear: injuryDate ? Number(injuryDate.slice(0, 4)) : null,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.mapOshaCase(row!, { incident: fields });
    });
  }

  /**
   * Seed Form 301 from an incident (plus linked personnel / existing OSHA case)
   * for printing the official OSHA Form 301 PDF from Incidents.
   */
  async incidentOshaForm301(principal: ForgePrincipal, id: string) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [incident] = await tx
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
      if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

      const incidentPayload = this.unwrapSourcePayload(incident.sourcePayload);
      const personnelIdRaw = String(incidentPayload.personnelId ?? "").trim();
      const personnel = await this.loadPersonnelRecordForOsha(
        tx,
        principal.tenantId,
        personnelIdRaw,
      );
      const fields = this.incidentFieldsForOsha(incident, personnel);
      const seed = { ...fields.form301Seed };

      let existingOsha: typeof industrialOshaCases.$inferSelect | null = null;
      const oshaRows = await tx
        .select()
        .from(industrialOshaCases)
        .where(
          and(
            eq(industrialOshaCases.tenantId, principal.tenantId),
            isNull(industrialOshaCases.archivedAt),
          ),
        );
      for (const row of oshaRows) {
        const payload = this.unwrapSourcePayload(row.sourcePayload);
        if (String(payload.incidentId ?? "").trim() === recordId) {
          existingOsha = row;
          break;
        }
      }

      if (existingOsha) {
        const existingPayload = this.unwrapSourcePayload(existingOsha.sourcePayload);
        const mergedPayload = mergeOshaCasePayloadFields(
          mergeOshaSeedPreferExisting(existingPayload, seed),
          {},
        );
        // Keep case number from Form 300 log when present.
        const existingCaseNo = String(existingPayload.caseNumber ?? "").trim();
        if (existingCaseNo) {
          mergedPayload.caseNumber = existingCaseNo;
        } else if (!String(mergedPayload.caseNumber ?? "").trim()) {
          mergedPayload.caseNumber = String(
            oshaRows.findIndex((r) => r.id === existingOsha!.id) + 1,
          );
        }
        const mapped = this.mapOshaCase(
          {
            ...existingOsha,
            sourcePayload: {
              ...mergedPayload,
              incidentId: recordId,
            },
          },
          { incident: fields, siteName: fields.establishment },
        );
        return {
          incidentId: recordId,
          oshaCaseId: existingOsha.id,
          seededFromIncident: true,
          case: mapped,
        };
      }

      const caseNumber = String(oshaRows.length + 1);
      const syntheticPayload = mergeOshaCasePayloadFields(
        {
          incidentId: recordId,
          caseNumber,
          recordabilityStatus: "PENDING",
          oshaRecordable: null,
          privacyCase: false,
        },
        seed,
      );
      const now = new Date();
      const mapped = this.mapOshaCase(
        {
          id: "",
          tenantId: principal.tenantId,
          siteId: incident.siteId,
          departmentId: null,
          title: String(seed.title ?? incident.title ?? "OSHA case"),
          status: "OPEN",
          recordDate: typeof seed.injuryDate === "string" ? seed.injuryDate : null,
          personnelId:
            typeof seed.personnelId === "string" && UUID_PATTERN.test(seed.personnelId)
              ? seed.personnelId
              : null,
          sourceSystem: "FORGE",
          sourceDocumentId: null,
          sourcePayload: syntheticPayload,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        } as typeof industrialOshaCases.$inferSelect,
        { incident: fields, siteName: fields.establishment },
      );
      return {
        incidentId: recordId,
        oshaCaseId: null,
        seededFromIncident: true,
        case: { ...mapped, caseNumber },
      };
    });
  }

  async updateOsha(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const recordId = this.assertRecordId(id);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialOshaCases)
        .where(
          and(
            eq(industrialOshaCases.id, recordId),
            eq(industrialOshaCases.tenantId, principal.tenantId),
            isNull(industrialOshaCases.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "OSHA case not found");

      const payload = this.unwrapSourcePayload(existing.sourcePayload);
      const recordability = normalizeOshaRecordability(
        body.recordabilityStatus ?? payload.recordabilityStatus ?? "PENDING",
      ) as OshaRecordability;
      const flags = oshaFlagsFromRecordability(recordability);
      const reviewer =
        typeof body.reviewer === "string"
          ? body.reviewer.trim()
          : String(payload.reviewer ?? principal.userId ?? "");
      const nextPayload: Record<string, unknown> = {
        ...mergeOshaCasePayloadFields(payload, body),
        recordabilityStatus: recordability,
        oshaRecordable: flags.oshaRecordable,
        privacyCase: flags.privacyCase,
        reviewer,
        reviewedAt: new Date().toISOString(),
      };

      const now = new Date();
      const [row] = await tx
        .update(industrialOshaCases)
        .set({
          title:
            typeof body.title === "string" && body.title.trim()
              ? body.title.trim()
              : existing.title,
          status:
            typeof body.status === "string" && body.status.trim()
              ? body.status.trim()
              : existing.status,
          recordDate:
            typeof nextPayload.injuryDate === "string"
              ? nextPayload.injuryDate
              : existing.recordDate,
          sourcePayload: nextPayload,
          updatedAt: now,
        })
        .where(eq(industrialOshaCases.id, recordId))
        .returning();

      const incidentId = String(nextPayload.incidentId ?? "").trim();
      if (UUID_PATTERN.test(incidentId) && body.recordabilityStatus != null) {
        const [incident] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, incidentId),
              eq(industrialIncidents.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (incident) {
          const incidentPayload = this.unwrapSourcePayload(incident.sourcePayload);
          await tx
            .update(industrialIncidents)
            .set({
              sourcePayload: {
                ...incidentPayload,
                oshaRecordable: flags.oshaRecordable,
                privacyCase: flags.privacyCase,
                recordabilityStatus: recordability,
              },
              updatedAt: now,
            })
            .where(eq(industrialIncidents.id, incidentId));
        }
      }

      return this.mapOshaCase(row!);
    });
  }

  async getOshaForm300AMeta(
    principal: ForgePrincipal,
    query: { year?: string; siteId?: string; establishment?: string },
  ) {
    const year = Number(query.year);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new ForgeError("VALIDATION_FAILED", "A valid calendar year is required.");
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const division = (query.establishment ?? "").trim();
      // Establishments are divisions: without a siteId, details live per division.
      if (!(query.siteId ?? "").trim()) {
        if (!division || division.toLowerCase() === "all") {
          return emptyOshaForm300AMeta(year, "");
        }
        const setting = await this.findOshaDivisionMetaSetting(tx, principal.tenantId);
        return readOshaForm300AMetaForDivision(setting?.valueJson, division, year);
      }
      const site = await this.resolveOshaForm300ASite(tx, principal.tenantId, query);
      if (!site) {
        return emptyOshaForm300AMeta(year, division);
      }
      return readOshaForm300AMetaFromSitePayload(site.sourcePayload, year, site.name);
    });
  }

  private findOshaDivisionMetaSetting(tx: DatabaseTransaction, tenantId: string) {
    return tx.query.tenantSettings.findFirst({
      where: and(
        eq(tenantSettings.tenantId, tenantId),
        eq(tenantSettings.namespace, "industrial"),
        eq(tenantSettings.settingKey, OSHA_FORM300A_DIVISIONS_KEY),
      ),
    });
  }

  async upsertOshaForm300AMeta(principal: ForgePrincipal, body: Record<string, unknown>) {
    const year = Number(body.year);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new ForgeError("VALIDATION_FAILED", "A valid calendar year is required.");
    }
    const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
    const establishment = typeof body.establishment === "string" ? body.establishment.trim() : "";
    if (!siteId && !establishment) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Form 300A meta requires a siteId or establishment name.",
      );
    }
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      if (!siteId) {
        if (establishment.toLowerCase() === "all") {
          throw new ForgeError("VALIDATION_FAILED", "Select a specific division for Form 300A.");
        }
        const meta = parseOshaForm300AMeta(body, year, establishment);
        const now = new Date();
        // One settings row holds every division/year. Create it if missing, then lock it so
        // concurrent saves for other divisions or years merge in turn instead of overwriting.
        await tx
          .insert(tenantSettings)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            namespace: "industrial",
            settingKey: OSHA_FORM300A_DIVISIONS_KEY,
            valueJson: {},
            schemaVersion: 1,
            isSensitive: false,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: principal.userId,
          })
          .onConflictDoNothing({
            target: [tenantSettings.tenantId, tenantSettings.namespace, tenantSettings.settingKey],
          });
        const [locked] = await tx
          .select()
          .from(tenantSettings)
          .where(
            and(
              eq(tenantSettings.tenantId, principal.tenantId),
              eq(tenantSettings.namespace, "industrial"),
              eq(tenantSettings.settingKey, OSHA_FORM300A_DIVISIONS_KEY),
            ),
          )
          .limit(1)
          .for("update");
        if (!locked) {
          throw new ForgeError("CONFLICT", "Could not save Form 300A details. Try again.");
        }
        await tx
          .update(tenantSettings)
          .set({
            valueJson: writeOshaForm300AMetaForDivision(locked.valueJson, establishment, meta),
            recordVersion: sql`${tenantSettings.recordVersion} + 1`,
            updatedAt: now,
            updatedByUserId: principal.userId,
          })
          .where(eq(tenantSettings.id, locked.id));
        return meta;
      }
      const site = await this.resolveOshaForm300ASite(tx, principal.tenantId, {
        siteId,
        establishment,
      });
      if (!site) {
        throw new ForgeError("NOT_FOUND", "Establishment / site not found for Form 300A meta.");
      }
      const meta = parseOshaForm300AMeta(body, year, site.name);
      const nextPayload = writeOshaForm300AMetaToSitePayload(site.sourcePayload, meta);
      const now = new Date();
      await tx
        .update(industrialSites)
        .set({ sourcePayload: nextPayload, updatedAt: now })
        .where(eq(industrialSites.id, site.id));
      return meta;
    });
  }

  private async resolveOshaForm300ASite(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    query: { siteId?: string; establishment?: string },
  ) {
    const siteId = (query.siteId ?? "").trim();
    if (siteId && UUID_PATTERN.test(siteId)) {
      const [byId] = await tx
        .select()
        .from(industrialSites)
        .where(
          and(
            eq(industrialSites.id, siteId),
            eq(industrialSites.tenantId, tenantId),
            isNull(industrialSites.archivedAt),
          ),
        )
        .limit(1);
      if (byId) return byId;
    }
    const establishment = (query.establishment ?? "").trim().toLowerCase();
    if (!establishment || establishment === "all") return null;
    const sites = await tx
      .select()
      .from(industrialSites)
      .where(and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt)));
    return sites.find((s) => s.name.trim().toLowerCase() === establishment) ?? null;
  }
}
