import { Inject, Injectable } from "@nestjs/common";
import {
  industrialConfinedSpaceRecords,
  industrialCorrectiveActions,
  industrialDepartments,
  industrialDotComplianceRecords,
  industrialFleetDrivers,
  industrialFleetVehicles,
  industrialForkliftRecords,
  industrialIncidents,
  industrialInspections,
  industrialJsas,
  industrialLotoProcedures,
  industrialLotoRecords,
  industrialObservations,
  industrialOshaCases,
  industrialPersonnel,
  industrialPersonnelDisciplinaryActions,
  industrialSanitationCleaningTasks,
  industrialSanitationFindings,
  industrialSanitationInspections,
  industrialSanitationZones,
  industrialSites,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingRecords,
  industrialWorkersCompCases,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { DATABASE } from "../../tokens.js";
import {
  computeObservationScoreImpact,
  isPositiveObservationType,
  normalizeObservationRiskLevel,
  normalizeObservationStatus,
  normalizeObservedPeople,
  observedPersonAtFault,
  type ScoredObservation,
} from "./observations-helpers.js";
import {
  hydrateOshaFromSource,
  isOshaFormLogCase,
  readOshaForm300AMetaFromSitePayload,
  unwrapOshaSourcePayload,
} from "./osha-helpers.js";
import {
  buildOrgDirectory,
  buildPerformanceOverview,
  buildPerformanceSections,
  computeEmployeeSafetyScore,
  ESTIMATED_HOURS_PER_EMPLOYEE_YEAR,
  incidentCategoryKey,
  inPeriod,
  isClosedStatus,
  normalizePerformanceRequest,
  orgGroupKey,
  PERFORMANCE_GROUP_LABELS,
  PERFORMANCE_SECTION_TITLES,
  PerformanceAccumulator,
  PerformanceRequestError,
  periodDays,
  rankEmployeesByGroup,
  safetyGrade,
  siteHoursForPeriod,
  toIsoDay,
  type EmployeeRankRow,
  type PerformanceReportRequest,
  type PerformanceSectionId,
  type ResolvedOrgUnit,
} from "./performance-report-helpers.js";
import {
  computeDisciplineScoreImpact,
  disciplinePoints,
  isDisciplineCounting,
  type DisciplineScoreRow,
} from "./personnel-discipline-helpers.js";
import { isOpenWcStatus } from "./workers-comp-helpers.js";

type Payload = Record<string, unknown>;

/** Only the listed keys of a (possibly string-wrapped) source_payload. */
function payloadPick(column: AnyPgColumn, keys: string[]): SQL<Payload | null> {
  const p = sql`(case when jsonb_typeof(${column}) = 'string' then (${column} #>> '{}')::jsonb else ${column} end)`;
  return sql<Payload | null>`case when jsonb_typeof(${p}) = 'object' then jsonb_build_object(${sql.join(
    keys.map((k) => sql`${k}::text, ${p} -> ${k}::text`),
    sql`, `,
  )}) else null end`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const day = (v: unknown) => toIsoDay(v);

const DISCIPLINE_TYPE_KEYS: Record<string, string> = {
  COACHING: "coaching",
  VERBAL_WARNING: "verbal",
  WRITTEN_WARNING: "written",
  FINAL_WARNING: "final",
  SUSPENSION: "suspension",
  TERMINATION: "termination",
};

type PersonStats = {
  openIncidents: number;
  recordableIncidents: number;
  incidentDates: string[];
  completedTraining: number;
  overdueTraining: number;
  expiredQualifications: number;
  expiringQualifications: number;
  openWorkersComp: number;
  unsafe: ScoredObservation[];
  unsafeCount: number;
  positiveCount: number;
  discipline: DisciplineScoreRow[];
};

const emptyStats = (): PersonStats => ({
  openIncidents: 0,
  recordableIncidents: 0,
  incidentDates: [],
  completedTraining: 0,
  overdueTraining: 0,
  expiredQualifications: 0,
  expiringQualifications: 0,
  openWorkersComp: 0,
  unsafe: [],
  unsafeCount: 0,
  positiveCount: 0,
  discipline: [],
});

/** Org-wide safety performance report broken down by location, division, department, or area. */
@Injectable()
export class IndustrialPerformanceReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private canViewDiscipline(principal: ForgePrincipal) {
    return (
      principal.permissions.has("industrial.personnel.discipline.view") ||
      principal.permissions.has("industrial.personnel.discipline.manage") ||
      principal.permissions.has("industrial.admin")
    );
  }

  async generate(principal: ForgePrincipal, body: Record<string, unknown>) {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    let req: PerformanceReportRequest;
    try {
      req = normalizePerformanceRequest(body ?? {});
    } catch (err) {
      if (err instanceof PerformanceRequestError)
        throw new ForgeError("VALIDATION_FAILED", err.message);
      throw err;
    }
    const omitted: Array<{ id: PerformanceSectionId; title: string; reason: string }> = [];
    const canDiscipline = this.canViewDiscipline(principal);
    if (!canDiscipline && req.sections.includes("discipline")) {
      req = { ...req, sections: req.sections.filter((s) => s !== "discipline") };
      omitted.push({
        id: "discipline",
        title: PERFORMANCE_SECTION_TITLES.discipline,
        reason: "Requires discipline view permission",
      });
    }
    const tenantId = principal.tenantId;
    return withTenantTransaction(this.db, tenantId, (tx) =>
      this.build(tx, tenantId, req, canDiscipline, omitted),
    );
  }

  private async build(
    tx: DatabaseTransaction,
    tenantId: string,
    req: PerformanceReportRequest,
    canDiscipline: boolean,
    omitted: Array<{ id: PerformanceSectionId; title: string; reason: string }>,
  ) {
    const has = (id: PerformanceSectionId) => req.sections.includes(id);
    const scoring = has("employees") || has("safety_score");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const period = { from: req.from, to: req.to };
    const notes: Partial<Record<PerformanceSectionId, string[]>> = {};

    const [sites, departments, personnel] = await Promise.all([
      tx
        .select({
          id: industrialSites.id,
          name: industrialSites.name,
          sourcePayload: industrialSites.sourcePayload,
        })
        .from(industrialSites)
        .where(and(eq(industrialSites.tenantId, tenantId), isNull(industrialSites.archivedAt))),
      tx
        .select({
          id: industrialDepartments.id,
          name: industrialDepartments.name,
          siteId: industrialDepartments.siteId,
          divisionName: industrialDepartments.divisionName,
        })
        .from(industrialDepartments)
        .where(
          and(
            eq(industrialDepartments.tenantId, tenantId),
            isNull(industrialDepartments.archivedAt),
          ),
        ),
      tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          jobTitle: industrialPersonnel.jobTitle,
          status: industrialPersonnel.status,
          siteId: industrialPersonnel.siteId,
          departmentId: industrialPersonnel.departmentId,
          departmentName: industrialPersonnel.departmentName,
          divisionName: industrialPersonnel.divisionName,
        })
        .from(industrialPersonnel)
        .where(
          and(eq(industrialPersonnel.tenantId, tenantId), isNull(industrialPersonnel.archivedAt)),
        ),
    ]);

    const dir = buildOrgDirectory({ sites, departments, personnel });
    const acc = new PerformanceAccumulator(dir, req.groupBy, req);
    const active = personnel.filter((p) => p.status.trim().toUpperCase() === "ACTIVE");
    const activeIds = new Set(active.map((p) => p.id));
    const personUnit = new Map<string, ResolvedOrgUnit | null>();
    for (const p of active) {
      const unit = acc.unit({ personnelId: p.id });
      personUnit.set(p.id, unit);
      acc.add("_org", unit, "headcount");
    }

    const nameCounts = new Map<string, number>();
    for (const p of active) {
      const key = p.displayName.trim().toLowerCase();
      if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const idByName = new Map<string, string>();
    for (const p of active) {
      const key = p.displayName.trim().toLowerCase();
      if (key && nameCounts.get(key) === 1) idByName.set(key, p.id);
    }
    const stats = new Map<string, PersonStats>();
    const statsFor = (id: string | null | undefined): PersonStats | null => {
      if (!scoring || !id || !activeIds.has(id)) return null;
      let s = stats.get(id);
      if (!s) {
        s = emptyStats();
        stats.set(id, s);
      }
      return s;
    };

    // ------------------------------------------------------------ incidents
    if (has("incidents") || scoring) {
      const rows = await tx
        .select({
          siteId: industrialIncidents.siteId,
          status: industrialIncidents.status,
          createdAt: industrialIncidents.createdAt,
          p: payloadPick(industrialIncidents.sourcePayload, [
            "category",
            "incidentCategory",
            "dateOccurred",
            "IncidentDateTime",
            "siteId",
            "departmentId",
            "departmentLabel",
            "departmentName",
            "division",
            "community",
            "personnelId",
            "personAffected",
            "oshaRecordable",
            "recordable",
          ]),
        })
        .from(industrialIncidents)
        .where(
          and(eq(industrialIncidents.tenantId, tenantId), isNull(industrialIncidents.archivedAt)),
        );
      for (const row of rows) {
        const p = row.p ?? {};
        const occurred = day(p.dateOccurred) ?? day(p.IncidentDateTime) ?? day(row.createdAt);
        const personnelId =
          str(p.personnelId) || idByName.get(str(p.personAffected).toLowerCase()) || null;
        const open = !isClosedStatus(row.status);
        if (inPeriod(occurred, period)) {
          const unit = acc.unit({
            siteId: str(p.siteId) || row.siteId,
            departmentId: str(p.departmentId),
            departmentName: str(p.departmentLabel) || str(p.departmentName),
            division: str(p.division),
            area: str(p.community),
            personnelId,
          });
          if (has("incidents")) {
            acc.add("incidents", unit, "total");
            const category = incidentCategoryKey(p);
            if (category) acc.add("incidents", unit, category);
            if (open) acc.add("incidents", unit, "open");
          }
          if (has("safety_score")) {
            acc.add("safety_score", unit, "_incTotal");
            if (open) acc.add("safety_score", unit, "_incOpen");
          }
        }
        const s = statsFor(personnelId);
        if (s) {
          const status = row.status.toLowerCase();
          if (
            status.includes("open") ||
            status === "active" ||
            status === "in_progress" ||
            status === "in progress"
          ) {
            s.openIncidents += 1;
          }
          if (p.oshaRecordable || p.recordable) s.recordableIncidents += 1;
          if (occurred) s.incidentDates.push(occurred);
        }
      }
    }

    // ------------------------------------------------------------ OSHA
    if (has("osha")) {
      const rows = await tx
        .select({
          title: industrialOshaCases.title,
          status: industrialOshaCases.status,
          recordDate: industrialOshaCases.recordDate,
          siteId: industrialOshaCases.siteId,
          departmentId: industrialOshaCases.departmentId,
          personnelId: industrialOshaCases.personnelId,
          sourcePayload: industrialOshaCases.sourcePayload,
        })
        .from(industrialOshaCases)
        .where(
          and(eq(industrialOshaCases.tenantId, tenantId), isNull(industrialOshaCases.archivedAt)),
        );
      for (const row of rows) {
        const c = hydrateOshaFromSource({
          title: row.title,
          status: row.status,
          recordDate: row.recordDate,
          personnelId: row.personnelId,
          sourcePayload: row.sourcePayload,
        });
        if (!isOshaFormLogCase(c.recordabilityStatus) || !inPeriod(c.injuryDate, period)) continue;
        const payload = unwrapOshaSourcePayload(row.sourcePayload);
        const unit = acc.unit({
          siteId: row.siteId,
          departmentId: row.departmentId ?? str(payload.departmentId),
          departmentName: str(payload.departmentName),
          personnelId: row.personnelId,
        });
        acc.add("osha", unit, "recordable");
        if (c.caseOutcome === "DAYS_AWAY") acc.add("osha", unit, "daysAwayCases");
        else if (c.caseOutcome === "JOB_TRANSFER_RESTRICTION")
          acc.add("osha", unit, "transferCases");
        else if (c.caseOutcome !== "DEATH") acc.add("osha", unit, "otherCases");
        acc.add("osha", unit, "daysAway", c.daysAway ?? 0);
        acc.add("osha", unit, "restrictedDays", c.restrictedDays ?? 0);
      }
      notes.osha = this.allocateHours(acc, req, sites, active, personUnit);
    }

    // ------------------------------------------------------------ workers' comp
    if (has("workers_comp") || scoring) {
      const rows = await tx
        .select({
          siteId: industrialWorkersCompCases.siteId,
          departmentId: industrialWorkersCompCases.departmentId,
          personnelId: industrialWorkersCompCases.personnelId,
          status: industrialWorkersCompCases.status,
          reportedAt: industrialWorkersCompCases.reportedAt,
          createdAt: industrialWorkersCompCases.createdAt,
          daysAway: industrialWorkersCompCases.daysAway,
          restrictedDays: industrialWorkersCompCases.restrictedDays,
        })
        .from(industrialWorkersCompCases)
        .where(
          and(
            eq(industrialWorkersCompCases.tenantId, tenantId),
            isNull(industrialWorkersCompCases.archivedAt),
          ),
        );
      for (const row of rows) {
        const openNow = isOpenWcStatus(row.status);
        if (has("workers_comp")) {
          const unit = acc.unit({
            siteId: row.siteId,
            departmentId: row.departmentId,
            personnelId: row.personnelId,
          });
          const status = row.status.trim().toUpperCase();
          if (inPeriod(day(row.reportedAt ?? row.createdAt), period)) {
            acc.add("workers_comp", unit, "opened");
            if ((row.daysAway ?? 0) > 0 || status === "LOST_TIME")
              acc.add("workers_comp", unit, "lostTime");
            if ((row.restrictedDays ?? 0) > 0 || status === "RESTRICTED")
              acc.add("workers_comp", unit, "restricted");
            acc.add("workers_comp", unit, "daysAway", row.daysAway ?? 0);
            acc.add("workers_comp", unit, "restrictedDays", row.restrictedDays ?? 0);
          }
          if (openNow) acc.add("workers_comp", unit, "openNow");
        }
        const s = statsFor(row.personnelId);
        if (s && openNow) s.openWorkersComp += 1;
      }
    }

    // ------------------------------------------------------------ observations
    if (has("observations") || scoring) {
      const rows = await tx
        .select({
          siteId: industrialObservations.siteId,
          status: industrialObservations.status,
          createdAt: industrialObservations.createdAt,
          p: payloadPick(industrialObservations.sourcePayload, [
            "observedAt",
            "observationType",
            "riskLevel",
            "departmentId",
            "departmentName",
            "divisionName",
            "area",
            "peopleObserved",
            "reportedBy",
          ]),
        })
        .from(industrialObservations)
        .where(
          and(
            eq(industrialObservations.tenantId, tenantId),
            isNull(industrialObservations.archivedAt),
          ),
        );
      for (const row of rows) {
        const p = row.p ?? {};
        const status = normalizeObservationStatus(row.status);
        if (status === "ARCHIVED") continue;
        const positive = isPositiveObservationType(p.observationType);
        const observedAt = str(p.observedAt) || row.createdAt.toISOString();
        if (has("observations") && inPeriod(day(observedAt), period)) {
          const unit = acc.unit({
            siteId: row.siteId,
            departmentId: str(p.departmentId),
            departmentName: str(p.departmentName),
            division: str(p.divisionName),
            area: str(p.area),
          });
          acc.add("observations", unit, "total");
          acc.add("observations", unit, positive ? "positive" : "unsafe");
          const risk = normalizeObservationRiskLevel(p.riskLevel);
          if (risk === "high" || risk === "critical") acc.add("observations", unit, "highRisk");
          if (status !== "CLOSED") acc.add("observations", unit, "open");
        }
        if (!scoring) continue;
        const observedIds = new Set<string>();
        for (const person of normalizeObservedPeople(p.peopleObserved)) {
          const id = person.personnelId ?? idByName.get(person.name.toLowerCase()) ?? null;
          const s = statsFor(id);
          if (!s || !id) continue;
          observedIds.add(id);
          if (positive) s.positiveCount += 1;
          else if (observedPersonAtFault(person, p.observationType)) {
            s.unsafe.push({ riskLevel: p.riskLevel, status: row.status, at: observedAt });
            s.unsafeCount += 1;
          }
        }
        const reporterId = idByName.get(str(p.reportedBy).toLowerCase());
        if (reporterId && !observedIds.has(reporterId)) {
          const s = statsFor(reporterId);
          if (s) s.positiveCount += 1;
        }
      }
    }

    // ------------------------------------------------------------ inspections
    if (has("inspections") || has("safety_score")) {
      const rows = await tx
        .select({
          siteId: industrialInspections.siteId,
          departmentId: industrialInspections.departmentId,
          status: industrialInspections.status,
          completedAt: industrialInspections.completedAt,
          createdAt: industrialInspections.createdAt,
          p: payloadPick(industrialInspections.sourcePayload, ["departmentName"]),
        })
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.tenantId, tenantId),
            isNull(industrialInspections.archivedAt),
          ),
        );
      for (const row of rows) {
        const unit = acc.unit({
          siteId: row.siteId,
          departmentId: row.departmentId,
          departmentName: str(row.p?.departmentName),
        });
        const completed = Boolean(row.completedAt) || isClosedStatus(row.status);
        if (inPeriod(day(row.createdAt), period)) {
          acc.add("inspections", has("inspections") ? unit : null, "total");
          if (completed) acc.add("inspections", has("inspections") ? unit : null, "completed");
          acc.add("safety_score", has("safety_score") ? unit : null, "_inspections");
        }
        if (!completed && has("inspections")) acc.add("inspections", unit, "openNow");
      }
    }

    // ------------------------------------------------------------ training
    if (has("training") || scoring) {
      const [records, assignees] = await Promise.all([
        tx
          .select({
            id: industrialTrainingRecords.id,
            siteId: industrialTrainingRecords.siteId,
            departmentId: industrialTrainingRecords.departmentId,
            personnelId: industrialTrainingRecords.personnelId,
            status: industrialTrainingRecords.status,
            courseName: industrialTrainingRecords.courseName,
            title: industrialTrainingRecords.title,
            completedAt: industrialTrainingRecords.completedAt,
            expiresAt: industrialTrainingRecords.expiresAt,
          })
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
            ),
          ),
        tx
          .select({
            personnelId: industrialTrainingAssignmentAssignees.personnelId,
            status: industrialTrainingAssignmentAssignees.status,
            completedAt: industrialTrainingAssignmentAssignees.completedAt,
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
              eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
              isNull(industrialTrainingAssignments.archivedAt),
              eq(industrialTrainingAssignments.status, "ACTIVE"),
            ),
          ),
      ]);
      const latestCert = new Map<string, { expiresAt: Date; unit: ResolvedOrgUnit | null }>();
      for (const r of records) {
        if (r.personnelId && !activeIds.has(r.personnelId)) continue;
        const unit = acc.unit({
          siteId: r.siteId,
          departmentId: r.departmentId,
          personnelId: r.personnelId,
        });
        const status = r.status.toLowerCase();
        const completed = status.includes("complete") || Boolean(r.completedAt);
        if (inPeriod(day(r.completedAt), period)) {
          if (has("training")) acc.add("training", unit, "completions");
          if (has("safety_score")) acc.add("safety_score", unit, "_training");
        }
        if (r.expiresAt) {
          const key = `${r.personnelId ?? r.id}|${(r.courseName || r.title || "").trim().toLowerCase()}`;
          const prev = latestCert.get(key);
          if (!prev || prev.expiresAt < r.expiresAt)
            latestCert.set(key, { expiresAt: r.expiresAt, unit });
        }
        const s = statsFor(r.personnelId);
        if (s) {
          if (completed) s.completedTraining += 1;
          const inProgress =
            status.includes("progress") || status === "active" || status === "enrolled";
          if (inProgress && r.expiresAt && r.expiresAt < now) s.overdueTraining += 1;
        }
      }
      if (has("training")) {
        for (const cert of latestCert.values()) {
          if (cert.expiresAt < now) acc.add("training", cert.unit, "expiredCerts");
          else if (cert.expiresAt <= in30) acc.add("training", cert.unit, "expiringCerts");
        }
      }
      for (const a of assignees) {
        if (!a.personnelId || !activeIds.has(a.personnelId)) continue;
        const unit = personUnit.get(a.personnelId) ?? null;
        const passed = a.status === "PASSED";
        const open =
          a.status === "NOT_STARTED" || a.status === "IN_PROGRESS" || a.status === "FAILED";
        const overdue = open && Boolean(a.dueAt && a.dueAt < now);
        if (has("training")) {
          acc.add("training", unit, "_assigneesTotal");
          if (passed) acc.add("training", unit, "_assigneesPassed");
          if (overdue) acc.add("training", unit, "overdue");
          else if (open) acc.add("training", unit, "openAssignments");
          if (passed && inPeriod(day(a.completedAt), period))
            acc.add("training", unit, "completions");
        }
        if (has("safety_score") && passed && inPeriod(day(a.completedAt), period)) {
          acc.add("safety_score", unit, "_training");
        }
        const s = statsFor(a.personnelId);
        if (s) {
          if (passed) s.completedTraining += 1;
          if (overdue) s.overdueTraining += 1;
        }
      }
    }

    // ------------------------------------------------------------ corrective actions
    if (has("corrective_actions")) {
      const rows = await tx
        .select({
          siteId: industrialCorrectiveActions.siteId,
          assignedPersonnelId: industrialCorrectiveActions.assignedPersonnelId,
          status: industrialCorrectiveActions.status,
          dueDate: industrialCorrectiveActions.dueDate,
          completedAt: industrialCorrectiveActions.completedAt,
          createdAt: industrialCorrectiveActions.createdAt,
          p: payloadPick(industrialCorrectiveActions.sourcePayload, [
            "departmentId",
            "departmentName",
          ]),
        })
        .from(industrialCorrectiveActions)
        .where(
          and(
            eq(industrialCorrectiveActions.tenantId, tenantId),
            isNull(industrialCorrectiveActions.archivedAt),
          ),
        );
      for (const row of rows) {
        const unit = acc.unit({
          siteId: row.siteId,
          departmentId: str(row.p?.departmentId),
          departmentName: str(row.p?.departmentName),
          personnelId: row.assignedPersonnelId,
        });
        const closedDay = day(row.completedAt);
        const isClosed = Boolean(row.completedAt) || isClosedStatus(row.status);
        if (inPeriod(day(row.createdAt), period)) acc.add("corrective_actions", unit, "opened");
        if (inPeriod(closedDay, period)) {
          acc.add("corrective_actions", unit, "closed");
          if (row.dueDate) {
            acc.add("corrective_actions", unit, "_closedWithDue");
            if (closedDay! <= row.dueDate) acc.add("corrective_actions", unit, "_closedOnTime");
          }
        }
        if (!isClosed) {
          acc.add("corrective_actions", unit, "openNow");
          if (row.dueDate && row.dueDate < today) acc.add("corrective_actions", unit, "overdueNow");
        }
      }
    }

    // ------------------------------------------------------------ discipline
    if (has("discipline") || scoring) {
      const rows = await tx
        .select({
          personnelId: industrialPersonnelDisciplinaryActions.personnelId,
          actionType: industrialPersonnelDisciplinaryActions.actionType,
          status: industrialPersonnelDisciplinaryActions.status,
          points: industrialPersonnelDisciplinaryActions.points,
          actionDate: industrialPersonnelDisciplinaryActions.actionDate,
        })
        .from(industrialPersonnelDisciplinaryActions)
        .where(
          and(
            eq(industrialPersonnelDisciplinaryActions.tenantId, tenantId),
            isNull(industrialPersonnelDisciplinaryActions.archivedAt),
          ),
        );
      const activePointsByPerson = new Map<string, number>();
      for (const row of rows) {
        const s = statsFor(row.personnelId);
        if (s) s.discipline.push(row);
        if (!has("discipline")) continue;
        const unit = acc.unit({ personnelId: row.personnelId });
        if (row.status === "ACTIVE" && inPeriod(row.actionDate, period)) {
          acc.add("discipline", unit, "actions");
          const typeKey = DISCIPLINE_TYPE_KEYS[row.actionType.toUpperCase()];
          if (typeKey) acc.add("discipline", unit, typeKey);
        }
        if (isDisciplineCounting(row, now)) {
          activePointsByPerson.set(
            row.personnelId,
            (activePointsByPerson.get(row.personnelId) ?? 0) + disciplinePoints(row),
          );
        }
      }
      for (const [personnelId, points] of activePointsByPerson) {
        const unit = acc.unit({ personnelId });
        acc.add("discipline", unit, "employeesActive");
        acc.add("discipline", unit, "activePoints", points);
      }
    }

    // ------------------------------------------------------------ qualifications (scoring only)
    if (scoring) {
      const [dot, forklift, confined, drivers] = await Promise.all([
        tx
          .select({
            personnelId: industrialDotComplianceRecords.personnelId,
            status: industrialDotComplianceRecords.status,
          })
          .from(industrialDotComplianceRecords)
          .where(
            and(
              eq(industrialDotComplianceRecords.tenantId, tenantId),
              isNull(industrialDotComplianceRecords.archivedAt),
            ),
          ),
        tx
          .select({
            personnelId: industrialForkliftRecords.personnelId,
            status: industrialForkliftRecords.status,
          })
          .from(industrialForkliftRecords)
          .where(
            and(
              eq(industrialForkliftRecords.tenantId, tenantId),
              isNull(industrialForkliftRecords.archivedAt),
            ),
          ),
        tx
          .select({
            personnelId: industrialConfinedSpaceRecords.personnelId,
            status: industrialConfinedSpaceRecords.status,
          })
          .from(industrialConfinedSpaceRecords)
          .where(
            and(
              eq(industrialConfinedSpaceRecords.tenantId, tenantId),
              isNull(industrialConfinedSpaceRecords.archivedAt),
            ),
          ),
        tx
          .select({
            personnelId: industrialFleetDrivers.personnelId,
            status: industrialFleetDrivers.status,
          })
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.tenantId, tenantId),
              isNull(industrialFleetDrivers.archivedAt),
            ),
          ),
      ]);
      for (const q of [...dot, ...forklift, ...confined, ...drivers]) {
        const s = statsFor(q.personnelId);
        if (!s) continue;
        const status = q.status.toLowerCase();
        if (status === "expired") s.expiredQualifications += 1;
        if (status.includes("expir")) s.expiringQualifications += 1;
      }
    }

    // ------------------------------------------------------------ LOTO
    if (has("loto")) {
      const [records, procedures] = await Promise.all([
        tx
          .select({
            siteId: industrialLotoRecords.siteId,
            status: industrialLotoRecords.status,
            dueDate: industrialLotoRecords.dueDate,
            createdAt: industrialLotoRecords.createdAt,
          })
          .from(industrialLotoRecords)
          .where(
            and(
              eq(industrialLotoRecords.tenantId, tenantId),
              isNull(industrialLotoRecords.archivedAt),
            ),
          ),
        tx
          .select({
            siteId: industrialLotoProcedures.siteId,
            status: industrialLotoProcedures.status,
          })
          .from(industrialLotoProcedures)
          .where(
            and(
              eq(industrialLotoProcedures.tenantId, tenantId),
              isNull(industrialLotoProcedures.archivedAt),
            ),
          ),
      ]);
      for (const r of records) {
        const unit = acc.unit({ siteId: r.siteId });
        if (inPeriod(day(r.createdAt), period)) acc.add("loto", unit, "lockouts");
        if (!isClosedStatus(r.status)) {
          acc.add("loto", unit, "openNow");
          if (r.dueDate && r.dueDate < today) acc.add("loto", unit, "overdueNow");
        }
      }
      for (const p of procedures) {
        if (/^(active|approved|published)$/i.test(p.status.trim())) {
          acc.add("loto", acc.unit({ siteId: p.siteId }), "procedures");
        }
      }
    }

    // ------------------------------------------------------------ sanitation
    if (has("sanitation")) {
      const [zones, inspections, findings, tasks] = await Promise.all([
        tx
          .select({ id: industrialSanitationZones.id, name: industrialSanitationZones.name })
          .from(industrialSanitationZones)
          .where(eq(industrialSanitationZones.tenantId, tenantId)),
        tx
          .select({
            siteId: industrialSanitationInspections.siteId,
            departmentId: industrialSanitationInspections.departmentId,
            zoneId: industrialSanitationInspections.zoneId,
            completedAt: industrialSanitationInspections.completedAt,
            scorePercent: industrialSanitationInspections.scorePercent,
          })
          .from(industrialSanitationInspections)
          .where(
            and(
              eq(industrialSanitationInspections.tenantId, tenantId),
              isNull(industrialSanitationInspections.archivedAt),
            ),
          ),
        tx
          .select({
            siteId: industrialSanitationFindings.siteId,
            zoneId: industrialSanitationFindings.zoneId,
            severity: industrialSanitationFindings.severity,
            status: industrialSanitationFindings.status,
            createdAt: industrialSanitationFindings.createdAt,
          })
          .from(industrialSanitationFindings)
          .where(
            and(
              eq(industrialSanitationFindings.tenantId, tenantId),
              isNull(industrialSanitationFindings.archivedAt),
            ),
          ),
        tx
          .select({
            siteId: industrialSanitationCleaningTasks.siteId,
            zoneId: industrialSanitationCleaningTasks.zoneId,
            status: industrialSanitationCleaningTasks.status,
            dueAt: industrialSanitationCleaningTasks.dueAt,
          })
          .from(industrialSanitationCleaningTasks)
          .where(
            and(
              eq(industrialSanitationCleaningTasks.tenantId, tenantId),
              isNull(industrialSanitationCleaningTasks.archivedAt),
            ),
          ),
      ]);
      const zoneName = new Map(zones.map((z) => [z.id, z.name]));
      const zone = (id: string | null) => (id ? (zoneName.get(id) ?? "") : "");
      for (const i of inspections) {
        if (!inPeriod(day(i.completedAt), period)) continue;
        const unit = acc.unit({
          siteId: i.siteId,
          departmentId: i.departmentId,
          area: zone(i.zoneId),
        });
        acc.add("sanitation", unit, "inspections");
        if (typeof i.scorePercent === "number" && Number.isFinite(i.scorePercent)) {
          acc.add("sanitation", unit, "_scoreSum", i.scorePercent);
          acc.add("sanitation", unit, "_scoreCount");
        }
      }
      for (const f of findings) {
        const unit = acc.unit({ siteId: f.siteId, area: zone(f.zoneId) });
        if (inPeriod(day(f.createdAt), period)) {
          acc.add("sanitation", unit, "findings");
          if (/critical|major/i.test(f.severity)) acc.add("sanitation", unit, "criticalFindings");
        }
        if (!isClosedStatus(f.status)) acc.add("sanitation", unit, "openFindings");
      }
      for (const t of tasks) {
        if (isClosedStatus(t.status) || /skip/i.test(t.status) || !t.dueAt || t.dueAt >= now)
          continue;
        acc.add(
          "sanitation",
          acc.unit({ siteId: t.siteId, area: zone(t.zoneId) }),
          "overdueCleaning",
        );
      }
    }

    // ------------------------------------------------------------ fleet & DOT
    if (has("fleet_dot")) {
      const [dotRows, vehicles] = await Promise.all([
        tx
          .select({
            siteId: industrialDotComplianceRecords.siteId,
            departmentId: industrialDotComplianceRecords.departmentId,
            personnelId: industrialDotComplianceRecords.personnelId,
            status: industrialDotComplianceRecords.status,
            recordDate: industrialDotComplianceRecords.recordDate,
            createdAt: industrialDotComplianceRecords.createdAt,
          })
          .from(industrialDotComplianceRecords)
          .where(
            and(
              eq(industrialDotComplianceRecords.tenantId, tenantId),
              isNull(industrialDotComplianceRecords.archivedAt),
            ),
          ),
        tx
          .select({
            siteId: industrialFleetVehicles.siteId,
            status: industrialFleetVehicles.status,
            outOfService: industrialFleetVehicles.outOfService,
            dispositionStatus: industrialFleetVehicles.dispositionStatus,
          })
          .from(industrialFleetVehicles)
          .where(
            and(
              eq(industrialFleetVehicles.tenantId, tenantId),
              isNull(industrialFleetVehicles.archivedAt),
            ),
          ),
      ]);
      for (const r of dotRows) {
        const unit = acc.unit({
          siteId: r.siteId,
          departmentId: r.departmentId,
          personnelId: r.personnelId,
        });
        if (inPeriod(day(r.recordDate ?? r.createdAt), period))
          acc.add("fleet_dot", unit, "dotRecords");
        if (/open|pend|expir|overdue|non|fail|violation|due/i.test(r.status))
          acc.add("fleet_dot", unit, "dotOpen");
      }
      for (const v of vehicles) {
        if (v.status.trim().toUpperCase() !== "ACTIVE" || str(v.dispositionStatus)) continue;
        const unit = acc.unit({ siteId: v.siteId });
        acc.add("fleet_dot", unit, "vehicles");
        if (v.outOfService) acc.add("fleet_dot", unit, "outOfService");
      }
    }

    // ------------------------------------------------------------ JSAs
    if (has("jsas")) {
      const rows = await tx
        .select({
          siteId: industrialJsas.siteId,
          status: industrialJsas.status,
          createdAt: industrialJsas.createdAt,
        })
        .from(industrialJsas)
        .where(and(eq(industrialJsas.tenantId, tenantId), isNull(industrialJsas.archivedAt)));
      for (const r of rows) {
        const unit = acc.unit({ siteId: r.siteId });
        if (inPeriod(day(r.createdAt), period)) acc.add("jsas", unit, "created");
        if (/draft|review|pending/i.test(r.status)) acc.add("jsas", unit, "openNow");
      }
    }

    // ------------------------------------------------------------ employee scores
    const rankRows: Array<EmployeeRankRow & { group: { key: string; label: string } }> = [];
    if (scoring) {
      for (const person of active) {
        const unit = personUnit.get(person.id) ?? null;
        if (!unit) continue;
        const s = stats.get(person.id) ?? emptyStats();
        const observation = computeObservationScoreImpact({
          unsafe: s.unsafe,
          positiveCount: s.positiveCount,
          incidentDates: s.incidentDates,
          now,
        });
        const discipline = computeDisciplineScoreImpact(s.discipline, now);
        const score = computeEmployeeSafetyScore({
          openIncidents: s.openIncidents,
          recordableIncidents: s.recordableIncidents,
          overdueTraining: s.overdueTraining,
          expiredQualifications: s.expiredQualifications,
          expiringQualifications: s.expiringQualifications,
          openWorkersComp: s.openWorkersComp,
          completedTraining: s.completedTraining,
          observationCredit: observation.credit,
          observationDeduction: observation.deduction,
          disciplineDeduction: discipline.deduction,
        });
        if (has("safety_score")) {
          acc.add("safety_score", unit, "employeesScored");
          acc.add("safety_score", unit, "_scoreSum", score);
          if (score < 70) acc.add("safety_score", unit, "employeesBelow70");
        }
        rankRows.push({
          personnelId: person.id,
          name: person.displayName.trim() || "Unnamed",
          employeeNumber: str(person.employeeNumber),
          jobTitle: str(person.jobTitle),
          score,
          grade: safetyGrade(score),
          openIncidents: s.openIncidents,
          recordableIncidents: s.recordableIncidents,
          overdueTraining: s.overdueTraining,
          openWorkersComp: s.openWorkersComp,
          positiveObservations: s.positiveCount,
          unsafeObservations: s.unsafeCount,
          activeDisciplinePoints: canDiscipline
            ? s.discipline
                .filter((r) => isDisciplineCounting(r, now))
                .reduce((sum, r) => sum + disciplinePoints(r), 0)
            : null,
          group: orgGroupKey(unit, req.groupBy),
        });
      }
    }

    const sections = buildPerformanceSections(acc, req.sections, notes);
    const overview = buildPerformanceOverview(acc, sections);
    const employees = has("employees")
      ? {
          limit: req.employeeLimit,
          showDiscipline: canDiscipline,
          ...rankEmployeesByGroup(rankRows, req.employeeLimit),
          notes: [
            "Scores use the employee profile safety score formula, based on records linked to the employee or matching their exact name.",
            ...(req.groupBy === "area"
              ? ['Employees are not assigned to areas, so rankings appear under "No area".']
              : []),
          ],
        }
      : null;

    return {
      title: "Safety Performance Report",
      generatedAt: now.toISOString(),
      period: { from: req.from, to: req.to, days: periodDays(req.from, req.to) },
      groupBy: req.groupBy,
      groupByLabel: PERFORMANCE_GROUP_LABELS[req.groupBy],
      filters: {
        sites: req.siteIds.map((id) => dir.sites.get(id)).filter((v): v is string => Boolean(v)),
        divisions: req.divisions,
        departments: req.departmentIds
          .map((id) => dir.departments.get(id)?.name)
          .filter((v): v is string => Boolean(v)),
      },
      sectionsRequested: req.sections,
      overview,
      sections,
      employees,
      omitted,
    };
  }

  /**
   * Hours worked for OSHA rates. Each site's Form 300A hours (or a headcount
   * estimate) are spread evenly across its active employees, then summed per
   * group; a manual total is spread across all employees in scope.
   */
  private allocateHours(
    acc: PerformanceAccumulator,
    req: PerformanceReportRequest,
    sites: Array<{ id: string; name: string; sourcePayload: unknown }>,
    active: Array<{ id: string }>,
    personUnit: Map<string, ResolvedOrgUnit | null>,
  ): string[] {
    const notes: string[] = [];
    const inScope = active.filter((p) => personUnit.get(p.id));
    if (req.hoursWorked !== null) {
      if (inScope.length) {
        const share = req.hoursWorked / inScope.length;
        for (const p of inScope) acc.add("osha", personUnit.get(p.id)!, "hoursWorked", share);
      }
      notes.push(
        `Rates use ${req.hoursWorked.toLocaleString("en-US")} hours worked entered for this report` +
          (req.groupBy === "site" && sites.length <= 1
            ? "."
            : ", allocated to each group by headcount."),
      );
      return notes;
    }

    const siteHeadcount = new Map<string | null, number>();
    for (const p of inScope) {
      const siteId = personUnit.get(p.id)!.siteId;
      siteHeadcount.set(siteId, (siteHeadcount.get(siteId) ?? 0) + 1);
    }
    let estimated = false;
    let fromForm300A = false;
    const perPersonBySite = new Map<string | null, number>();
    for (const site of sites) {
      const headcount = siteHeadcount.get(site.id) ?? 0;
      const result = siteHoursForPeriod({
        from: req.from,
        to: req.to,
        headcount,
        annualHours: (year) =>
          readOshaForm300AMetaFromSitePayload(site.sourcePayload, year, site.name).totalHoursWorked,
      });
      if (result.hours <= 0) continue;
      if (result.estimated) estimated = true;
      else fromForm300A = true;
      if (headcount > 0) {
        perPersonBySite.set(site.id, result.hours / headcount);
      } else if (
        req.groupBy === "site" &&
        !req.divisions.length &&
        !req.departmentIds.length &&
        (!req.siteIds.length || req.siteIds.includes(site.id))
      ) {
        acc.addToGroup(
          "osha",
          { key: site.id, label: site.name.trim() || "Unnamed location" },
          "hoursWorked",
          result.hours,
        );
      }
    }
    const noSiteEstimate = (ESTIMATED_HOURS_PER_EMPLOYEE_YEAR * periodDays(req.from, req.to)) / 365;
    for (const p of inScope) {
      const unit = personUnit.get(p.id)!;
      const share = perPersonBySite.get(unit.siteId) ?? (unit.siteId === null ? noSiteEstimate : 0);
      if (unit.siteId === null) estimated = true;
      acc.add("osha", unit, "hoursWorked", share);
    }
    if (fromForm300A)
      notes.push(
        "Hours worked come from each location's OSHA Form 300A totals, prorated to the period.",
      );
    if (estimated) {
      notes.push(
        "Where Form 300A hours are missing, hours are estimated at 2,000 hours per active employee per year. Enter hours worked when running the report for exact rates.",
      );
    }
    if (req.groupBy !== "site")
      notes.push("Location hours are allocated to each group by headcount.");
    return notes;
  }
}
