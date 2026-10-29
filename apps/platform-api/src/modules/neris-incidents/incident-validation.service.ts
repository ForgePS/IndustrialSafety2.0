import { Injectable } from "@nestjs/common";
import {
  createId,
  nerisIncidentValidationResults,
  nerisIncidentValidationRuns,
  nerisIncidents,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, ilike, ne } from "drizzle-orm";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";
import { SpecialtyValidationService } from "./specialty-validation.service.js";

export interface ValidationFinding {
  source:
    | "NERIS_SCHEMA"
    | "NERIS_CONDITION"
    | "TENANT_CONFIGURATION"
    | "WORKFLOW"
    | "DATA_INTEGRITY"
    | "TIME_SEQUENCE"
    | "DUPLICATE_DETECTION";
  severity: "GUIDANCE" | "WARNING" | "BLOCKING_ERROR";
  message: string;
  sectionKey?: string | null;
  fieldId?: string | null;
  moduleKey?: string | null;
  technicalReference?: string | null;
  suggestedCorrection?: string | null;
}

@Injectable()
export class IncidentValidationService {
  constructor(
    private readonly stateMachine: IncidentStateMachineService,
    private readonly specialtyValidation: SpecialtyValidationService,
  ) {}

  async runValidation(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
    incident: typeof nerisIncidents.$inferSelect,
    trigger: string,
    principal: ForgePrincipal,
  ) {
    const findings = [
      ...this.collectFindings(incident),
      ...(await this.specialtyValidation.collectSpecialtyFindings(
        tx,
        tenantId,
        incidentId,
        incident,
      )),
    ];
    const runId = createId();
    const blockingErrorCount = findings.filter((f) => f.severity === "BLOCKING_ERROR").length;
    const warningCount = findings.filter((f) => f.severity === "WARNING").length;
    const guidanceCount = findings.filter((f) => f.severity === "GUIDANCE").length;

    await tx.insert(nerisIncidentValidationRuns).values({
      id: runId,
      tenantId,
      incidentId,
      trigger,
      blockingErrorCount,
      warningCount,
      guidanceCount,
      createdByUserId: principal.userId,
      createdAt: new Date(),
    });

    if (findings.length > 0) {
      await tx.insert(nerisIncidentValidationResults).values(
        findings.map((f) => ({
          id: createId(),
          tenantId,
          incidentId,
          runId,
          source: f.source,
          severity: f.severity,
          moduleKey: f.moduleKey,
          sectionKey: f.sectionKey,
          fieldId: f.fieldId,
          message: f.message,
          technicalReference: f.technicalReference,
          suggestedCorrection: f.suggestedCorrection,
          correctionPath: f.technicalReference
            ? `/incidents/${incidentId}/?section=${f.sectionKey ?? "REVIEW"}&ref=${f.technicalReference}`
            : null,
          isBlocking: f.severity === "BLOCKING_ERROR",
          createdAt: new Date(),
        })),
      );
    }

    return {
      runId,
      blockingErrorCount,
      warningCount,
      guidanceCount,
      findings,
      ok: blockingErrorCount === 0,
    };
  }

  async assertNoBlockingErrors(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
    incident: typeof nerisIncidents.$inferSelect,
    trigger: string,
    principal: ForgePrincipal,
  ) {
    const result = await this.runValidation(tx, tenantId, incidentId, incident, trigger, principal);
    if (!result.ok) {
      throw new ForgeError("VALIDATION_FAILED", "Incident has blocking validation errors", {
        details: result.findings.filter((f) => f.severity === "BLOCKING_ERROR"),
      });
    }
    return result;
  }

  collectFindings(incident: typeof nerisIncidents.$inferSelect): ValidationFinding[] {
    const findings: ValidationFinding[] = [];

    if (!incident.incidentDate) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "OVERVIEW",
        message: "Incident date is required",
      });
    }

    if (!incident.primaryIncidentTypeCode) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "WARNING",
        sectionKey: "CLASSIFICATION",
        message: "Primary incident type is not set",
      });
    }

    if (incident.alarmAt && incident.incidentDate) {
      const alarmDay = incident.alarmAt.toISOString().slice(0, 10);
      if (alarmDay !== incident.incidentDate) {
        findings.push({
          source: "TIME_SEQUENCE",
          severity: "WARNING",
          sectionKey: "DISPATCH",
          message: "Alarm timestamp date differs from incident date",
          suggestedCorrection: "Align alarm time with incident date or update incident date",
        });
      }
    }

    if (incident.status === "READY_FOR_REVIEW" || incident.status === "SUBMITTED_FOR_REVIEW") {
      if (!incident.dispatchDescription?.trim()) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "DISPATCH",
          message: "Dispatch description is required before review submission",
        });
      }
    }

    return findings;
  }

  async checkDuplicates(
    tx: DatabaseTransaction,
    tenantId: string,
    input: {
      incidentNumber?: string;
      incidentDate?: string;
      dispatchDescription?: string;
      excludeIncidentId?: string;
    },
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const filters = [eq(nerisIncidents.tenantId, tenantId)];
    if (input.excludeIncidentId) {
      filters.push(ne(nerisIncidents.id, input.excludeIncidentId));
    }

    if (input.incidentNumber) {
      const matches = await tx
        .select({ id: nerisIncidents.id, incidentNumber: nerisIncidents.incidentNumber })
        .from(nerisIncidents)
        .where(and(...filters, eq(nerisIncidents.incidentNumber, input.incidentNumber)))
        .limit(5);
      for (const match of matches) {
        findings.push({
          source: "DUPLICATE_DETECTION",
          severity: "BLOCKING_ERROR",
          message: `Duplicate incident number: ${match.incidentNumber}`,
          technicalReference: match.id,
        });
      }
    }

    if (input.incidentDate && input.dispatchDescription?.trim()) {
      const matches = await tx
        .select({ id: nerisIncidents.id })
        .from(nerisIncidents)
        .where(
          and(
            ...filters,
            eq(nerisIncidents.incidentDate, input.incidentDate),
            ilike(nerisIncidents.dispatchDescription, input.dispatchDescription.trim()),
          ),
        )
        .limit(5);
      for (const match of matches) {
        findings.push({
          source: "DUPLICATE_DETECTION",
          severity: "WARNING",
          message: "Potential duplicate incident with same date and dispatch description",
          technicalReference: match.id,
        });
      }
    }

    return findings;
  }
}
