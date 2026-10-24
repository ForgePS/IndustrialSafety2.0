import { Injectable } from "@nestjs/common";
import {
  nerisIncidentAlarmSystems,
  nerisIncidentCivilianCasualties,
  nerisIncidentExposures,
  nerisIncidentFieldValues,
  nerisIncidentFireServiceCasualties,
  nerisIncidentHazmatContainers,
  nerisIncidentHazmatSubstances,
  nerisIncidentProtectionSystems,
  nerisIncidentSections,
  nerisFields,
  type DatabaseTransaction,
  type nerisIncidents,
} from "@forge/database";
import { and, eq, isNull } from "drizzle-orm";
import type { ValidationFinding } from "./incident-validation.service.js";

/**
 * Progressive specialty validation — plain-language findings with correction paths.
 * Restricted casualty detail is never included in messages.
 */
@Injectable()
export class SpecialtyValidationService {
  async collectSpecialtyFindings(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
    incident: typeof nerisIncidents.$inferSelect,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const sections = await tx.query.nerisIncidentSections.findMany({
      where: eq(nerisIncidentSections.incidentId, incidentId),
    });
    const activeSections = new Set(
      sections.filter((s) => s.status !== "NOT_APPLICABLE").map((s) => s.sectionKey),
    );

    if (activeSections.has("EXPOSURES") || incident.primaryIncidentTypeCode?.includes("FIRE")) {
      findings.push(...(await this.validateExposures(tx, incidentId)));
    }
    if (activeSections.has("CIVILIAN_CASUALTIES")) {
      findings.push(...(await this.validateCivilianCasualties(tx, incidentId)));
    }
    if (activeSections.has("FIRE_SERVICE_CASUALTIES")) {
      findings.push(...(await this.validateFireServiceCasualties(tx, incidentId)));
    }
    if (activeSections.has("HAZMAT")) {
      findings.push(...(await this.validateHazmat(tx, incidentId)));
    }
    if (activeSections.has("ALARM_DETECTION") || activeSections.has("FIRE_PROTECTION")) {
      findings.push(...(await this.validateAlarmProtection(tx, incidentId)));
    }

    void tenantId;
    return findings;
  }

  private async validateExposures(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const exposures = await tx.query.nerisIncidentExposures.findMany({
      where: and(
        eq(nerisIncidentExposures.incidentId, incidentId),
        isNull(nerisIncidentExposures.archivedAt),
      ),
    });
    const numbers = exposures.map((e) => e.exposureNumber);
    if (new Set(numbers).size !== numbers.length) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "EXPOSURES",
        message: "Exposure numbers must be unique within this incident.",
        suggestedCorrection: "Archive the duplicate exposure or contact support.",
        technicalReference: "exposure.number.unique",
      });
    }

    const reported = await this.readReportedCount(tx, incidentId, [
      "exposure_count",
      "number_of_exposures",
      "exposures_count",
    ]);
    if (reported != null && reported !== exposures.length) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "EXPOSURES",
        message: `Reported exposure count (${reported}) does not match exposure records (${exposures.length}).`,
        suggestedCorrection: "Add missing exposure cards or correct the reported count.",
        technicalReference: "exposure.count.reconcile",
      });
    }

    for (const exp of exposures) {
      const hasLocation =
        Boolean(exp.addressLine1) ||
        Boolean(exp.locationDescription) ||
        Boolean(exp.locationExceptionNote);
      if (!hasLocation) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "EXPOSURES",
          message: `Exposure ${exp.exposureNumber} needs an address, location description, or documented exception.`,
          suggestedCorrection: "Open the exposure card and complete Location.",
          technicalReference: `exposure.${exp.id}.location`,
        });
      }
      const propLoss = num(exp.propertyLoss);
      const propVal = num(exp.propertyValue);
      if (propLoss != null && propVal != null && propLoss > propVal && !exp.lossExceptionNote) {
        findings.push({
          source: "DATA_INTEGRITY",
          severity: "WARNING",
          sectionKey: "EXPOSURES",
          message: `Exposure ${exp.exposureNumber}: property loss exceeds property value without an explanation.`,
          suggestedCorrection: "Lower the loss, raise the value, or add a loss exception note.",
          technicalReference: `exposure.${exp.id}.loss`,
        });
      }
    }
    return findings;
  }

  private async validateCivilianCasualties(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const rows = await tx.query.nerisIncidentCivilianCasualties.findMany({
      where: and(
        eq(nerisIncidentCivilianCasualties.incidentId, incidentId),
        isNull(nerisIncidentCivilianCasualties.archivedAt),
      ),
    });
    const reportedInjuries = await this.readReportedCount(tx, incidentId, [
      "civilian_injuries",
      "civilian_injury_count",
    ]);
    if (reportedInjuries != null && reportedInjuries !== rows.length) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "CIVILIAN_CASUALTIES",
        message: `Reported civilian injury count (${reportedInjuries}) does not match casualty records (${rows.length}).`,
        suggestedCorrection: "Add casualty cards or correct the reported count.",
        technicalReference: "civilian_casualty.count.reconcile",
      });
    }
    const fatalities = rows.filter((r) => r.fatality);
    const reportedFatalities = await this.readReportedCount(tx, incidentId, [
      "civilian_fatalities",
      "civilian_fatality_count",
    ]);
    if (reportedFatalities != null && reportedFatalities !== fatalities.length) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "CIVILIAN_CASUALTIES",
        message: `Reported civilian fatality count (${reportedFatalities}) does not match fatality records (${fatalities.length}).`,
        suggestedCorrection: "Update fatality flags or the reported fatality count.",
        technicalReference: "civilian_casualty.fatality.reconcile",
      });
    }
    for (const row of rows) {
      if (row.fatality && (!row.injurySeverity || !row.outcome)) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "CIVILIAN_CASUALTIES",
          message: "A fatality record needs injury severity and outcome.",
          suggestedCorrection: "Open the casualty card and complete severity and outcome.",
          technicalReference: `civilian_casualty.${row.id}.fatality`,
        });
      }
      if (!row.personKnown && !row.unknownPersonHandling) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "CIVILIAN_CASUALTIES",
          message: "An unknown-person casualty needs unknown-person handling.",
          suggestedCorrection: "Select the unknown-person handling option on the casualty card.",
          technicalReference: `civilian_casualty.${row.id}.unknown`,
        });
      }
      if (
        row.transportStatus &&
        /transport/i.test(row.transportStatus) &&
        !row.destinationReference &&
        !row.transportExceptionNote
      ) {
        findings.push({
          source: "WORKFLOW",
          severity: "WARNING",
          sectionKey: "CIVILIAN_CASUALTIES",
          message: "A transported casualty needs a destination or exception note.",
          suggestedCorrection: "Add destination reference or document why it is unknown.",
          technicalReference: `civilian_casualty.${row.id}.transport`,
        });
      }
    }
    return findings;
  }

  private async validateFireServiceCasualties(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const rows = await tx.query.nerisIncidentFireServiceCasualties.findMany({
      where: and(
        eq(nerisIncidentFireServiceCasualties.incidentId, incidentId),
        isNull(nerisIncidentFireServiceCasualties.archivedAt),
      ),
    });
    const reported = await this.readReportedCount(tx, incidentId, [
      "firefighter_injuries",
      "ff_injury_count",
    ]);
    if (reported != null && reported !== rows.length) {
      findings.push({
        source: "DATA_INTEGRITY",
        severity: "BLOCKING_ERROR",
        sectionKey: "FIRE_SERVICE_CASUALTIES",
        message: `Reported firefighter injury count (${reported}) does not match records (${rows.length}).`,
        suggestedCorrection: "Add fire-service casualty cards or correct the reported count.",
        technicalReference: "ff_casualty.count.reconcile",
      });
    }
    for (const row of rows) {
      if (!row.personnelId && !row.personnelUnknownException) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "FIRE_SERVICE_CASUALTIES",
          message:
            "Each fire-service casualty needs a personnel reference or documented exception.",
          suggestedCorrection: "Link personnel or document an external/unknown responder.",
          technicalReference: `ff_casualty.${row.id}.personnel`,
        });
      }
      if (row.mayday && !row.maydayDetails) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "FIRE_SERVICE_CASUALTIES",
          message: "Mayday was selected — complete mayday details.",
          suggestedCorrection: "Open the fire-service casualty card and complete Mayday details.",
          technicalReference: `ff_casualty.${row.id}.mayday`,
        });
      }
    }
    return findings;
  }

  private async validateHazmat(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const substances = await tx.query.nerisIncidentHazmatSubstances.findMany({
      where: and(
        eq(nerisIncidentHazmatSubstances.incidentId, incidentId),
        isNull(nerisIncidentHazmatSubstances.archivedAt),
      ),
    });
    const containers = await tx.query.nerisIncidentHazmatContainers.findMany({
      where: and(
        eq(nerisIncidentHazmatContainers.incidentId, incidentId),
        isNull(nerisIncidentHazmatContainers.archivedAt),
      ),
    });
    const releaseActive = substances.some((s) =>
      Boolean(s.releaseStatus && !/none|no.?release/i.test(s.releaseStatus)),
    );
    if (releaseActive && substances.length === 0) {
      findings.push({
        source: "WORKFLOW",
        severity: "BLOCKING_ERROR",
        sectionKey: "HAZMAT",
        message: "A release requires at least one substance record.",
        suggestedCorrection: "Add a hazmat substance card.",
        technicalReference: "hazmat.substance.required",
      });
    }
    for (const s of substances) {
      const qty = num(s.quantityReleased) ?? num(s.quantityThreatened);
      if (qty != null && !s.unitOfMeasure) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey: "HAZMAT",
          message: `Substance “${s.productName}” has a quantity without a unit of measure.`,
          suggestedCorrection: "Select the unit of measure on the substance card.",
          technicalReference: `hazmat.substance.${s.id}.uom`,
        });
      }
    }
    if (containers.length > 0 && substances.length === 0) {
      findings.push({
        source: "GUIDANCE" as never,
        severity: "GUIDANCE",
        sectionKey: "HAZMAT",
        message: "Containers are documented without substances — confirm product identification.",
        suggestedCorrection: "Add substance cards linked to containers when known.",
        technicalReference: "hazmat.container.product",
      });
    }
    // Fix GUIDANCE source - VALIDATION_SOURCES doesn't include GUIDANCE as source
    // Use WORKFLOW for guidance
    for (const f of findings) {
      if ((f.source as string) === "GUIDANCE") f.source = "WORKFLOW";
    }
    return findings;
  }

  private async validateAlarmProtection(
    tx: DatabaseTransaction,
    incidentId: string,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const alarms = await tx.query.nerisIncidentAlarmSystems.findMany({
      where: and(
        eq(nerisIncidentAlarmSystems.incidentId, incidentId),
        isNull(nerisIncidentAlarmSystems.archivedAt),
      ),
    });
    const protection = await tx.query.nerisIncidentProtectionSystems.findMany({
      where: and(
        eq(nerisIncidentProtectionSystems.incidentId, incidentId),
        isNull(nerisIncidentProtectionSystems.archivedAt),
      ),
    });

    for (const sys of [...alarms, ...protection]) {
      const sectionKey =
        "deviceType" in sys || sys.systemType === "ALARM" ? "ALARM_DETECTION" : "FIRE_PROTECTION";
      if (sys.presence === "PRESENT" && !sys.operation) {
        findings.push({
          source: "WORKFLOW",
          severity: "WARNING",
          sectionKey,
          message: "A present system should record how it operated.",
          suggestedCorrection: "Set operation status on the system card.",
          technicalReference: `system.${sys.id}.operation`,
        });
      }
      if (
        /activat/i.test(sys.activation ?? "") &&
        sys.numberActivated == null &&
        !sys.numberActivatedUnknown
      ) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey,
          message: "An activated system needs head/device count or “unknown”.",
          suggestedCorrection: "Enter the number activated or mark unknown.",
          technicalReference: `system.${sys.id}.activated`,
        });
      }
      if (sys.operation === "FAILED" && !sys.failureReason) {
        findings.push({
          source: "WORKFLOW",
          severity: "BLOCKING_ERROR",
          sectionKey,
          message: "System failure requires a failure reason.",
          suggestedCorrection: "Document why the system failed.",
          technicalReference: `system.${sys.id}.failure`,
        });
      }
      if (sys.impairment && !sys.correctiveAction && !sys.inspectionReferral) {
        findings.push({
          source: "WORKFLOW",
          severity: "WARNING",
          sectionKey,
          message: "An impaired system needs corrective action or an inspection referral.",
          suggestedCorrection: "Add corrective action or referral on the system card.",
          technicalReference: `system.${sys.id}.impairment`,
        });
      }
    }
    return findings;
  }

  private async readReportedCount(
    tx: DatabaseTransaction,
    incidentId: string,
    fieldKeyHints: string[],
  ): Promise<number | null> {
    const values = await tx
      .select({
        fieldKey: nerisFields.fieldKey,
        valueNumber: nerisIncidentFieldValues.valueNumber,
        valueText: nerisIncidentFieldValues.valueText,
      })
      .from(nerisIncidentFieldValues)
      .innerJoin(nerisFields, eq(nerisIncidentFieldValues.fieldId, nerisFields.id))
      .where(eq(nerisIncidentFieldValues.incidentId, incidentId));

    for (const hint of fieldKeyHints) {
      const match = values.find((v) => v.fieldKey.toLowerCase().includes(hint.toLowerCase()));
      if (!match) continue;
      if (match.valueNumber != null) return Number(match.valueNumber);
      if (match.valueText && /^\d+$/.test(match.valueText)) return Number(match.valueText);
    }
    return null;
  }
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
