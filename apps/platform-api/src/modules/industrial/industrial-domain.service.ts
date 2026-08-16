import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialCertificateTemplates,
  industrialChemicalSafetyRecords,
  industrialConfinedSpaceRecords,
  industrialContractorSafetyRecords,
  industrialCorrectiveActions,
  industrialCranesRiggingRecords,
  industrialDotComplianceRecords,
  industrialElectricalSafetyRecords,
  industrialEmergencyResponseRecords,
  industrialEnvironmentalSafetyRecords,
  industrialEquipment,
  industrialForkliftRecords,
  industrialFormDefinitions,
  industrialHotWorkRecords,
  industrialIncidents,
  industrialInspections,
  industrialJsas,
  industrialLotoEnergySources,
  industrialLotoIsolationPoints,
  industrialLotoProcedures,
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
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

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
  "supervisorName",
  "hireDate",
  "notes",
  "signatureUrl",
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
      if (text) values[field] = text;
    }
    if (body.isCompanyDriver !== undefined) {
      values.isCompanyDriver = toBoolean(body.isCompanyDriver);
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
        values[field] = existing[field] ?? null;
        continue;
      }
      const text = raw == null ? "" : String(raw).trim();
      values[field] = text === "" ? null : text;
    }
    values.isCompanyDriver =
      body.isCompanyDriver === undefined
        ? Boolean(existing.isCompanyDriver)
        : toBoolean(body.isCompanyDriver);
    return values;
  }

  /** Template columns echoed back on read so the detail form can round-trip. */
  private personnelReadValues(row: Record<string, unknown>): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of PERSONNEL_TEXT_FIELDS) {
      values[field] = row[field] ?? null;
    }
    values.isCompanyDriver = Boolean(row.isCompanyDriver);
    return values;
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
    const payload =
      row.sourcePayload && typeof row.sourcePayload === "object" && !Array.isArray(row.sourcePayload)
        ? (row.sourcePayload as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      title,
      displayName: title,
      name: title,
      status: row.status,
      ...payload,
      ...(row.extra ?? {}),
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
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            title: "title" in r ? (r as { title?: string | null }).title : null,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
          }),
        ),
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
      const [row] = await tx
        .insert(table)
        .values(values as never)
        .returning();
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
    return this.listModule(p, "incidents", q);
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
    return this.listModule(p, "loto", q);
  }
  createIncident(p: ForgePrincipal, b: Record<string, unknown>) {
    return this.createModule(p, "incidents", { ...b, status: b.status ?? "OPEN" });
  }
  createInspection(p: ForgePrincipal, b: Record<string, unknown>) {
    return this.createModule(p, "inspections", { ...b, status: b.status ?? "OPEN" });
  }
  getIncident(p: ForgePrincipal, id: string) {
    return this.getModule(p, "incidents", id);
  }
  getInspection(p: ForgePrincipal, id: string) {
    return this.getModule(p, "inspections", id);
  }

  async listPersonnel(principal: ForgePrincipal, query: ListQuery) {
    const { page, pageSize, offset } = this.page(query);
    const q = (query.q ?? "").trim();
    const status = (query.status ?? "").trim();
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [
        eq(industrialPersonnel.tenantId, principal.tenantId),
        isNull(industrialPersonnel.archivedAt),
      ];
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
        .orderBy(desc(industrialPersonnel.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return {
        page,
        pageSize,
        items: items.map((r) =>
          this.mapListItem({
            id: r.id,
            displayName: r.displayName,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            sourcePayload: r.sourcePayload,
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
      return {
        ...this.mapListItem({
          id: row.id,
          displayName: row.displayName,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sourcePayload: {
            ...(typeof row.sourcePayload === "object" && row.sourcePayload
              ? (row.sourcePayload as object)
              : {}),
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            employeeNumber: row.employeeNumber,
            siteId: row.siteId,
            departmentId: row.departmentId,
            positionId: row.positionId,
          },
          // Columns win over the legacy sourcePayload copy of the same keys.
          extra: this.personnelReadValues(row as unknown as Record<string, unknown>),
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
          siteId: body.siteId != null ? String(body.siteId) : existing.siteId,
          departmentId:
            body.departmentId != null ? String(body.departmentId) : existing.departmentId,
          positionId: body.positionId != null ? String(body.positionId) : existing.positionId,
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
      const [energySources, isolationPoints, steps] = await Promise.all([
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
      ]);
      return {
        ...this.mapListItem({
          id: proc.id,
          title: proc.title,
          status: proc.status,
          createdAt: proc.createdAt,
          updatedAt: proc.updatedAt,
          sourcePayload: proc.sourcePayload,
        }),
        energySources,
        isolationPoints,
        steps,
        procedure: proc,
      };
    });
  }

  async createLoto(principal: ForgePrincipal, body: Record<string, unknown>) {
    return this.createModule(principal, "loto", body);
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
    return {
      html: `<!doctype html><html><head><title>${title}</title></head><body>
        <h1>${title}</h1>
        <h2>Energy sources</h2><ul>${energy.join("") || "<li>None listed</li>"}</ul>
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

  async analyticsOverview(principal: ForgePrincipal, query: ListQuery) {
    const siteId = (query.siteId ?? query.facilityId ?? "").trim();
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      async function countAny(table: TitledTable | typeof industrialPersonnel): Promise<number> {
        const conditions = [eq(table.tenantId, principal.tenantId), isNull(table.archivedAt)];
        if (siteId && "siteId" in table) {
          conditions.push(eq((table as typeof industrialIncidents).siteId, siteId));
        }
        const [row] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(table)
          .where(and(...conditions));
        return row?.c ?? 0;
      }
      const modules = {
        personnel: await countAny(industrialPersonnel),
        incidents: await countAny(industrialIncidents),
        inspections: await countAny(industrialInspections),
        observations: await countAny(industrialObservations),
        jsas: await countAny(industrialJsas),
        loto: await countAny(industrialLotoProcedures),
        training: await countAny(industrialTrainingRecords),
        forms: await countAny(industrialFormDefinitions),
        correctiveActions: await countAny(industrialCorrectiveActions),
        workersComp: await countAny(industrialWorkersCompCases as unknown as TitledTable),
        dot: await countAny(industrialDotComplianceRecords),
      };
      return {
        model: "MODEL_A",
        generatedAt: new Date().toISOString(),
        facilityId: siteId || null,
        kpis: modules,
        drilldowns: Object.entries(modules).map(([key, count]) => ({
          key,
          count,
          href: `/modules/${
            key === "correctiveActions"
              ? "corrective-actions"
              : key === "workersComp"
                ? "workers-comp"
                : key
          }`,
        })),
      };
    });
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
