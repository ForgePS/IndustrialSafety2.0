import { Inject, Injectable } from "@nestjs/common";
import {
  createAlarmSystemInputSchema,
  createCivilianCasualtyInputSchema,
  createExposureInputSchema,
  createFireServiceCasualtyInputSchema,
  createHazmatContainerInputSchema,
  createHazmatSubstanceInputSchema,
  createOccupancyLinkInputSchema,
  createProposedMasterUpdateInputSchema,
  createProtectionSystemInputSchema,
  patchAlarmSystemInputSchema,
  patchCivilianCasualtyInputSchema,
  patchExposureInputSchema,
  patchFireServiceCasualtyInputSchema,
  patchHazmatContainerInputSchema,
  patchHazmatSubstanceInputSchema,
  patchProtectionSystemInputSchema,
  returnSpecialtySectionInputSchema,
  reviewProposedMasterUpdateInputSchema,
  sectionApprovalInputSchema,
} from "@forge/contracts";
import {
  createId,
  nerisCasualtyAccessAudit,
  nerisIncidentAlarmSystems,
  nerisIncidentCivilianCasualties,
  nerisIncidentExposureSequences,
  nerisIncidentExposures,
  nerisIncidentFireServiceCasualties,
  nerisIncidentHazmatContainers,
  nerisIncidentHazmatSubstances,
  nerisIncidentOccupancyLinks,
  nerisIncidentProtectionSystems,
  nerisIncidentReviewComments,
  nerisIncidentSectionApprovals,
  nerisIncidentSections,
  nerisIncidents,
  nerisProposedMasterUpdates,
  rmsOccupancies,
  rmsPreplans,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";
import { NerisIncidentsAccessService } from "./neris-incidents-access.service.js";

type ExpectedVersion = number | "*";

@Injectable()
export class SpecialtyRecordsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: NerisIncidentsAccessService,
    private readonly stateMachine: IncidentStateMachineService,
    private readonly audit: AuditService,
  ) {}

  // --- Exposures ---

  async listExposures(
    tenantId: string,
    incidentId: string,
    principal: ForgePrincipal,
    search?: string,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const rows = await tx.query.nerisIncidentExposures.findMany({
        where: and(
          eq(nerisIncidentExposures.incidentId, incidentId),
          isNull(nerisIncidentExposures.archivedAt),
        ),
        orderBy: [asc(nerisIncidentExposures.exposureNumber)],
      });
      if (!search) return rows;
      const q = search.toLowerCase();
      return rows.filter(
        (r) =>
          r.addressLine1?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.propertyUse?.toLowerCase().includes(q) ||
          String(r.exposureNumber).includes(q),
      );
    });
  }

  async createExposure(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createExposureInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireEditableIncident(tx, tenantId, incidentId);
      const exposureNumber = await this.nextExposureNumber(tx, tenantId, incidentId);
      const id = createId();
      const [row] = await tx
        .insert(nerisIncidentExposures)
        .values({
          id,
          tenantId,
          incidentId,
          exposureNumber,
          ...this.mapExposure(data),
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      await this.auditSpecialty(tx, principal, tenantId, "neris.exposure.create", id, {
        incidentId,
        exposureNumber,
        incidentNumber: incident.incidentNumber,
      });
      return row;
    });
  }

  async getExposure(
    tenantId: string,
    incidentId: string,
    exposureId: string,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return this.requireExposure(tx, incidentId, exposureId);
    });
  }

  async patchExposure(
    tenantId: string,
    incidentId: string,
    exposureId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchExposureInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await this.requireExposure(tx, incidentId, exposureId);
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentExposures)
        .set({
          ...this.mapExposure(data),
          ...(data.completionStatus ? { completionStatus: data.completionStatus } : {}),
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentExposures.id, exposureId))
        .returning();
      return row;
    });
  }

  async archiveExposure(
    tenantId: string,
    incidentId: string,
    exposureId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await this.requireExposure(tx, incidentId, exposureId);
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentExposures)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentExposures.id, exposureId))
        .returning();
      await this.auditSpecialty(tx, principal, tenantId, "neris.exposure.archive", exposureId, {
        incidentId,
      });
      return row;
    });
  }

  async restoreExposure(
    tenantId: string,
    incidentId: string,
    exposureId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentExposures.findFirst({
        where: and(
          eq(nerisIncidentExposures.id, exposureId),
          eq(nerisIncidentExposures.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Exposure not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentExposures)
        .set({
          status: "ACTIVE",
          archivedAt: null,
          archivedByUserId: null,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentExposures.id, exposureId))
        .returning();
      return row;
    });
  }

  // --- Civilian casualties ---

  async listCivilianCasualties(
    tenantId: string,
    incidentId: string,
    principal: ForgePrincipal,
    options?: { full?: boolean },
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const rows = await tx.query.nerisIncidentCivilianCasualties.findMany({
        where: and(
          eq(nerisIncidentCivilianCasualties.incidentId, incidentId),
          isNull(nerisIncidentCivilianCasualties.archivedAt),
        ),
      });
      const full = Boolean(options?.full);
      if (full) {
        for (const row of rows) {
          await this.recordCasualtyAccess(
            tx,
            principal,
            tenantId,
            incidentId,
            "CIVILIAN",
            row.id,
            "VIEW",
          );
        }
        return rows;
      }
      return rows.map((row) => this.maskCivilian(row));
    });
  }

  async createCivilianCasualty(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createCivilianCasualtyInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      if (!data.personKnown && !data.unknownPersonHandling) {
        throw new ForgeError(
          "BAD_REQUEST",
          "Unknown-person casualties require unknownPersonHandling",
        );
      }
      const id = createId();
      const [row] = await tx
        .insert(nerisIncidentCivilianCasualties)
        .values({
          id,
          tenantId,
          incidentId,
          ...data,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "CIVILIAN",
        id,
        "CREATE",
      );
      await this.auditSpecialty(tx, principal, tenantId, "neris.civilian_casualty.create", id, {
        incidentId,
        personKnown: data.personKnown,
        fatality: data.fatality ?? false,
      });
      return row;
    });
  }

  async getCivilianCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const row = await tx.query.nerisIncidentCivilianCasualties.findFirst({
        where: and(
          eq(nerisIncidentCivilianCasualties.id, casualtyId),
          eq(nerisIncidentCivilianCasualties.incidentId, incidentId),
        ),
      });
      if (!row || row.archivedAt) throw new ForgeError("NOT_FOUND", "Civilian casualty not found");
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "CIVILIAN",
        row.id,
        "VIEW",
      );
      return row;
    });
  }

  async patchCivilianCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchCivilianCasualtyInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentCivilianCasualties.findFirst({
        where: and(
          eq(nerisIncidentCivilianCasualties.id, casualtyId),
          eq(nerisIncidentCivilianCasualties.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Civilian casualty not found");
      }
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentCivilianCasualties)
        .set({
          ...data,
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentCivilianCasualties.id, casualtyId))
        .returning();
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "CIVILIAN",
        casualtyId,
        "EDIT",
      );
      return row;
    });
  }

  async archiveCivilianCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentCivilianCasualties.findFirst({
        where: and(
          eq(nerisIncidentCivilianCasualties.id, casualtyId),
          eq(nerisIncidentCivilianCasualties.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Civilian casualty not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentCivilianCasualties)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentCivilianCasualties.id, casualtyId))
        .returning();
      return row;
    });
  }

  // --- Fire-service casualties ---

  async listFireServiceCasualties(
    tenantId: string,
    incidentId: string,
    principal: ForgePrincipal,
    options?: { full?: boolean },
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const rows = await tx.query.nerisIncidentFireServiceCasualties.findMany({
        where: and(
          eq(nerisIncidentFireServiceCasualties.incidentId, incidentId),
          isNull(nerisIncidentFireServiceCasualties.archivedAt),
        ),
      });
      if (options?.full) {
        for (const row of rows) {
          await this.recordCasualtyAccess(
            tx,
            principal,
            tenantId,
            incidentId,
            "FIRE_SERVICE",
            row.id,
            "VIEW",
          );
        }
        return rows;
      }
      return rows.map((row) => this.maskFireService(row));
    });
  }

  async createFireServiceCasualty(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createFireServiceCasualtyInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      if (!data.personnelId && !data.personnelUnknownException) {
        throw new ForgeError(
          "BAD_REQUEST",
          "Fire-service casualty requires personnel reference or unknown/external exception",
        );
      }
      if (data.mayday && !data.maydayDetails) {
        throw new ForgeError("BAD_REQUEST", "Mayday selected — provide mayday details");
      }
      const id = createId();
      const [row] = await tx
        .insert(nerisIncidentFireServiceCasualties)
        .values({
          id,
          tenantId,
          incidentId,
          ...data,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "FIRE_SERVICE",
        id,
        "CREATE",
      );
      await this.auditSpecialty(tx, principal, tenantId, "neris.fire_service_casualty.create", id, {
        incidentId,
        mayday: data.mayday ?? false,
      });
      return row;
    });
  }

  async getFireServiceCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const row = await tx.query.nerisIncidentFireServiceCasualties.findFirst({
        where: and(
          eq(nerisIncidentFireServiceCasualties.id, casualtyId),
          eq(nerisIncidentFireServiceCasualties.incidentId, incidentId),
        ),
      });
      if (!row || row.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Fire-service casualty not found");
      }
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "FIRE_SERVICE",
        row.id,
        "VIEW",
      );
      return row;
    });
  }

  async patchFireServiceCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchFireServiceCasualtyInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentFireServiceCasualties.findFirst({
        where: and(
          eq(nerisIncidentFireServiceCasualties.id, casualtyId),
          eq(nerisIncidentFireServiceCasualties.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Fire-service casualty not found");
      }
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentFireServiceCasualties)
        .set({
          ...data,
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentFireServiceCasualties.id, casualtyId))
        .returning();
      await this.recordCasualtyAccess(
        tx,
        principal,
        tenantId,
        incidentId,
        "FIRE_SERVICE",
        casualtyId,
        "EDIT",
      );
      return row;
    });
  }

  async archiveFireServiceCasualty(
    tenantId: string,
    incidentId: string,
    casualtyId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentFireServiceCasualties.findFirst({
        where: and(
          eq(nerisIncidentFireServiceCasualties.id, casualtyId),
          eq(nerisIncidentFireServiceCasualties.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Fire-service casualty not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentFireServiceCasualties)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentFireServiceCasualties.id, casualtyId))
        .returning();
      return row;
    });
  }

  // --- Hazmat ---

  async listHazmatSubstances(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentHazmatSubstances.findMany({
        where: and(
          eq(nerisIncidentHazmatSubstances.incidentId, incidentId),
          isNull(nerisIncidentHazmatSubstances.archivedAt),
        ),
      });
    });
  }

  async createHazmatSubstance(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createHazmatSubstanceInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const id = createId();
      const [row] = await tx
        .insert(nerisIncidentHazmatSubstances)
        .values({
          id,
          tenantId,
          incidentId,
          productName: data.productName,
          unNaNumber: data.unNaNumber,
          casNumber: data.casNumber,
          hazardClass: data.hazardClass,
          physicalState: data.physicalState,
          quantityReleased: this.asNumeric(data.quantityReleased),
          quantityThreatened: this.asNumeric(data.quantityThreatened),
          unitOfMeasure: data.unitOfMeasure,
          releaseStatus: data.releaseStatus,
          exposureRoutes: data.exposureRoutes ?? [],
          environmentalImpact: data.environmentalImpact,
          waterwayImpact: data.waterwayImpact,
          responsibleParty: data.responsibleParty,
          narrative: data.narrative,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async patchHazmatSubstance(
    tenantId: string,
    incidentId: string,
    substanceId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchHazmatSubstanceInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentHazmatSubstances.findFirst({
        where: and(
          eq(nerisIncidentHazmatSubstances.id, substanceId),
          eq(nerisIncidentHazmatSubstances.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt)
        throw new ForgeError("NOT_FOUND", "Substance not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentHazmatSubstances)
        .set({
          ...(data.productName !== undefined ? { productName: data.productName } : {}),
          ...(data.unNaNumber !== undefined ? { unNaNumber: data.unNaNumber } : {}),
          ...(data.casNumber !== undefined ? { casNumber: data.casNumber } : {}),
          ...(data.hazardClass !== undefined ? { hazardClass: data.hazardClass } : {}),
          ...(data.physicalState !== undefined ? { physicalState: data.physicalState } : {}),
          ...(data.quantityReleased !== undefined
            ? { quantityReleased: this.asNumeric(data.quantityReleased) }
            : {}),
          ...(data.quantityThreatened !== undefined
            ? { quantityThreatened: this.asNumeric(data.quantityThreatened) }
            : {}),
          ...(data.unitOfMeasure !== undefined ? { unitOfMeasure: data.unitOfMeasure } : {}),
          ...(data.releaseStatus !== undefined ? { releaseStatus: data.releaseStatus } : {}),
          ...(data.exposureRoutes !== undefined ? { exposureRoutes: data.exposureRoutes } : {}),
          ...(data.environmentalImpact !== undefined
            ? { environmentalImpact: data.environmentalImpact }
            : {}),
          ...(data.waterwayImpact !== undefined ? { waterwayImpact: data.waterwayImpact } : {}),
          ...(data.responsibleParty !== undefined
            ? { responsibleParty: data.responsibleParty }
            : {}),
          ...(data.narrative !== undefined ? { narrative: data.narrative } : {}),
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentHazmatSubstances.id, substanceId))
        .returning();
      return row;
    });
  }

  async archiveHazmatSubstance(
    tenantId: string,
    incidentId: string,
    substanceId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentHazmatSubstances.findFirst({
        where: and(
          eq(nerisIncidentHazmatSubstances.id, substanceId),
          eq(nerisIncidentHazmatSubstances.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Substance not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentHazmatSubstances)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentHazmatSubstances.id, substanceId))
        .returning();
      return row;
    });
  }

  async listHazmatContainers(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentHazmatContainers.findMany({
        where: and(
          eq(nerisIncidentHazmatContainers.incidentId, incidentId),
          isNull(nerisIncidentHazmatContainers.archivedAt),
        ),
      });
    });
  }

  async createHazmatContainer(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createHazmatContainerInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const id = createId();
      const capacity =
        data.capacity === undefined
          ? undefined
          : data.capacity === null
            ? null
            : String(data.capacity);
      const [row] = await tx
        .insert(nerisIncidentHazmatContainers)
        .values({
          id,
          tenantId,
          incidentId,
          containerType: data.containerType,
          ...(data.substanceId !== undefined ? { substanceId: data.substanceId } : {}),
          ...(capacity !== undefined ? { capacity } : {}),
          ...(data.capacityUnit !== undefined ? { capacityUnit: data.capacityUnit } : {}),
          ...(data.productName !== undefined ? { productName: data.productName } : {}),
          ...(data.damage !== undefined ? { damage: data.damage } : {}),
          ...(data.leakLocation !== undefined ? { leakLocation: data.leakLocation } : {}),
          ...(data.pressureStatus !== undefined ? { pressureStatus: data.pressureStatus } : {}),
          ...(data.controlAction !== undefined ? { controlAction: data.controlAction } : {}),
          ...(data.recoveryStatus !== undefined ? { recoveryStatus: data.recoveryStatus } : {}),
          ...(data.disposalStatus !== undefined ? { disposalStatus: data.disposalStatus } : {}),
          ...(data.narrative !== undefined ? { narrative: data.narrative } : {}),
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async patchHazmatContainer(
    tenantId: string,
    incidentId: string,
    containerId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchHazmatContainerInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentHazmatContainers.findFirst({
        where: and(
          eq(nerisIncidentHazmatContainers.id, containerId),
          eq(nerisIncidentHazmatContainers.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt)
        throw new ForgeError("NOT_FOUND", "Container not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const capacity =
        data.capacity === undefined
          ? undefined
          : data.capacity === null
            ? null
            : String(data.capacity);
      const [row] = await tx
        .update(nerisIncidentHazmatContainers)
        .set({
          ...(data.substanceId !== undefined ? { substanceId: data.substanceId } : {}),
          ...(data.containerType !== undefined ? { containerType: data.containerType } : {}),
          ...(capacity !== undefined ? { capacity } : {}),
          ...(data.capacityUnit !== undefined ? { capacityUnit: data.capacityUnit } : {}),
          ...(data.productName !== undefined ? { productName: data.productName } : {}),
          ...(data.damage !== undefined ? { damage: data.damage } : {}),
          ...(data.leakLocation !== undefined ? { leakLocation: data.leakLocation } : {}),
          ...(data.pressureStatus !== undefined ? { pressureStatus: data.pressureStatus } : {}),
          ...(data.controlAction !== undefined ? { controlAction: data.controlAction } : {}),
          ...(data.recoveryStatus !== undefined ? { recoveryStatus: data.recoveryStatus } : {}),
          ...(data.disposalStatus !== undefined ? { disposalStatus: data.disposalStatus } : {}),
          ...(data.narrative !== undefined ? { narrative: data.narrative } : {}),
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentHazmatContainers.id, containerId))
        .returning();
      return row;
    });
  }

  async archiveHazmatContainer(
    tenantId: string,
    incidentId: string,
    containerId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentHazmatContainers.findFirst({
        where: and(
          eq(nerisIncidentHazmatContainers.id, containerId),
          eq(nerisIncidentHazmatContainers.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Container not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentHazmatContainers)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentHazmatContainers.id, containerId))
        .returning();
      return row;
    });
  }

  // --- Alarm / protection ---

  async listAlarmSystems(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentAlarmSystems.findMany({
        where: and(
          eq(nerisIncidentAlarmSystems.incidentId, incidentId),
          isNull(nerisIncidentAlarmSystems.archivedAt),
        ),
      });
    });
  }

  async createAlarmSystem(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createAlarmSystemInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const [row] = await tx
        .insert(nerisIncidentAlarmSystems)
        .values({
          id: createId(),
          tenantId,
          incidentId,
          ...data,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async patchAlarmSystem(
    tenantId: string,
    incidentId: string,
    systemId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchAlarmSystemInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentAlarmSystems.findFirst({
        where: and(
          eq(nerisIncidentAlarmSystems.id, systemId),
          eq(nerisIncidentAlarmSystems.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt)
        throw new ForgeError("NOT_FOUND", "Alarm system not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentAlarmSystems)
        .set({
          ...data,
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentAlarmSystems.id, systemId))
        .returning();
      return row;
    });
  }

  async archiveAlarmSystem(
    tenantId: string,
    incidentId: string,
    systemId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentAlarmSystems.findFirst({
        where: and(
          eq(nerisIncidentAlarmSystems.id, systemId),
          eq(nerisIncidentAlarmSystems.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Alarm system not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentAlarmSystems)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentAlarmSystems.id, systemId))
        .returning();
      return row;
    });
  }

  async listProtectionSystems(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentProtectionSystems.findMany({
        where: and(
          eq(nerisIncidentProtectionSystems.incidentId, incidentId),
          isNull(nerisIncidentProtectionSystems.archivedAt),
        ),
      });
    });
  }

  async createProtectionSystem(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createProtectionSystemInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const [row] = await tx
        .insert(nerisIncidentProtectionSystems)
        .values({
          id: createId(),
          tenantId,
          incidentId,
          ...data,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async patchProtectionSystem(
    tenantId: string,
    incidentId: string,
    systemId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchProtectionSystemInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentProtectionSystems.findFirst({
        where: and(
          eq(nerisIncidentProtectionSystems.id, systemId),
          eq(nerisIncidentProtectionSystems.incidentId, incidentId),
        ),
      });
      if (!existing || existing.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Protection system not found");
      }
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentProtectionSystems)
        .set({
          ...data,
          recordVersion: existing.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentProtectionSystems.id, systemId))
        .returning();
      return row;
    });
  }

  async archiveProtectionSystem(
    tenantId: string,
    incidentId: string,
    systemId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentProtectionSystems.findFirst({
        where: and(
          eq(nerisIncidentProtectionSystems.id, systemId),
          eq(nerisIncidentProtectionSystems.incidentId, incidentId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Protection system not found");
      if (expected !== "*" && existing.recordVersion !== expected) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_specialty_record",
          resourceId: existing.id,
          expectedVersion: expected,
          actualVersion: existing.recordVersion,
        });
      }
      const [row] = await tx
        .update(nerisIncidentProtectionSystems)
        .set({
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: principal.userId,
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentProtectionSystems.id, systemId))
        .returning();
      return row;
    });
  }

  // --- Occupancy / preplan / proposals / section approval ---

  async createOccupancyLink(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createOccupancyLinkInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const occupancy = data.occupancyId
        ? await tx.query.rmsOccupancies.findFirst({
            where: eq(rmsOccupancies.id, data.occupancyId),
          })
        : null;
      const preplan = data.preplanId
        ? await tx.query.rmsPreplans.findFirst({ where: eq(rmsPreplans.id, data.preplanId) })
        : null;
      const snapshotJson = {
        occupancy: occupancy ?? null,
        preplan: preplan
          ? {
              id: preplan.id,
              tacticalSummary: preplan.tacticalSummary,
              approvalStatus: preplan.approvalStatus,
              hazards: preplan.hazards,
              accessNotes: preplan.accessNotes,
              utilityNotes: preplan.utilityNotes,
            }
          : null,
        capturedAt: new Date().toISOString(),
      };
      const [row] = await tx
        .insert(nerisIncidentOccupancyLinks)
        .values({
          id: createId(),
          tenantId,
          incidentId,
          exposureId: data.exposureId ?? null,
          occupancyId: data.occupancyId ?? null,
          preplanId: data.preplanId ?? null,
          prefillSource: data.prefillSource,
          snapshotJson,
          incidentCorrectionsJson: data.incidentCorrectionsJson ?? {},
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async listOccupancyLinks(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx.query.nerisIncidentOccupancyLinks.findMany({
        where: eq(nerisIncidentOccupancyLinks.incidentId, incidentId),
      });
    });
  }

  async createProposedMasterUpdate(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = createProposedMasterUpdateInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireEditableIncident(tx, tenantId, incidentId);
      const [row] = await tx
        .insert(nerisProposedMasterUpdates)
        .values({
          id: createId(),
          tenantId,
          incidentId,
          targetType: data.targetType,
          targetId: data.targetId,
          status: "PROPOSED",
          proposedChangesJson: data.proposedChangesJson,
          createdByUserId: principal.userId,
        })
        .returning();
      return row;
    });
  }

  async reviewProposedMasterUpdate(
    tenantId: string,
    proposalId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = reviewProposedMasterUpdateInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.nerisProposedMasterUpdates.findFirst({
        where: and(
          eq(nerisProposedMasterUpdates.id, proposalId),
          eq(nerisProposedMasterUpdates.tenantId, tenantId),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Proposed update not found");
      if (data.status === "APPLIED") {
        // Applying requires masterdata.manage — enforced by controller permission.
      }
      const [row] = await tx
        .update(nerisProposedMasterUpdates)
        .set({
          status: data.status,
          reviewNote: data.reviewNote ?? null,
          reviewedByUserId: principal.userId,
          reviewedAt: new Date(),
          ...(data.status === "APPLIED"
            ? { appliedAt: new Date(), appliedByUserId: principal.userId }
            : {}),
          recordVersion: existing.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(nerisProposedMasterUpdates.id, proposalId))
        .returning();
      return row;
    });
  }

  async returnSpecialtySection(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = returnSpecialtySectionInputSchema.parse(input);
    const sectionKey = data.sectionKey.trim().toUpperCase();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      this.stateMachine.assertEditable(incident.status as never);
      const existing = await tx.query.nerisIncidentSections.findFirst({
        where: and(
          eq(nerisIncidentSections.incidentId, incidentId),
          eq(nerisIncidentSections.sectionKey, sectionKey),
        ),
      });
      if (existing) {
        await tx
          .update(nerisIncidentSections)
          .set({ status: "RETURNED", updatedAt: new Date() })
          .where(eq(nerisIncidentSections.id, existing.id));
      } else {
        await tx.insert(nerisIncidentSections).values({
          id: createId(),
          tenantId,
          incidentId,
          sectionKey,
          status: "RETURNED",
        });
      }
      await tx.insert(nerisIncidentReviewComments).values({
        id: createId(),
        tenantId,
        incidentId,
        sectionKey,
        specialtyRecordType: data.specialtyRecordType ?? null,
        specialtyRecordId: data.specialtyRecordId ?? null,
        reviewerRole: data.reviewerRole ?? null,
        status: "OPEN",
        body: data.reason,
        authorUserId: principal.userId,
        assignedToUserId: incident.reportOwnerUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.auditSpecialty(
        tx,
        principal,
        tenantId,
        "neris.specialty_section.return",
        incidentId,
        {
          sectionKey,
          specialtyRecordId: data.specialtyRecordId,
        },
      );
      return { incidentId, sectionKey, status: "RETURNED" };
    });
  }

  async approveSection(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = sectionApprovalInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const existing = await tx.query.nerisIncidentSectionApprovals.findFirst({
        where: and(
          eq(nerisIncidentSectionApprovals.incidentId, incidentId),
          eq(nerisIncidentSectionApprovals.sectionKey, data.sectionKey.toUpperCase()),
        ),
      });
      if (existing) {
        const [row] = await tx
          .update(nerisIncidentSectionApprovals)
          .set({
            status: "APPROVED",
            reviewerRole: data.reviewerRole ?? null,
            note: data.note ?? null,
            approvedByUserId: principal.userId,
            approvedAt: new Date(),
            recordVersion: existing.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidentSectionApprovals.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await tx
        .insert(nerisIncidentSectionApprovals)
        .values({
          id: createId(),
          tenantId,
          incidentId,
          sectionKey: data.sectionKey.toUpperCase(),
          status: "APPROVED",
          reviewerRole: data.reviewerRole ?? null,
          note: data.note ?? null,
          approvedByUserId: principal.userId,
          approvedAt: new Date(),
        })
        .returning();
      return row;
    });
  }

  // --- helpers ---

  private mapExposure(data: Record<string, unknown>) {
    const numericKeys = new Set(["propertyLoss", "contentLoss", "propertyValue", "contentValue"]);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || key === "completionStatus") continue;
      out[key] = numericKeys.has(key) && typeof value === "number" ? String(value) : value;
    }
    return out;
  }

  private asNumeric(value: number | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return String(value);
  }

  private maskCivilian(row: typeof nerisIncidentCivilianCasualties.$inferSelect) {
    return {
      id: row.id,
      incidentId: row.incidentId,
      exposureId: row.exposureId,
      status: row.status,
      reviewStatus: row.reviewStatus,
      personKnown: row.personKnown,
      displayName: row.personKnown ? "[Restricted]" : null,
      ageRange: row.ageRange,
      injurySeverity: row.injurySeverity,
      fatality: row.fatality,
      transportStatus: row.transportStatus,
      recordVersion: row.recordVersion,
      restricted: true,
    };
  }

  private maskFireService(row: typeof nerisIncidentFireServiceCasualties.$inferSelect) {
    return {
      id: row.id,
      incidentId: row.incidentId,
      status: row.status,
      safetyReviewStatus: row.safetyReviewStatus,
      personnelDisplayName: "[Restricted]",
      injurySeverity: row.injurySeverity,
      mayday: row.mayday,
      nearMissClassification: row.nearMissClassification,
      recordVersion: row.recordVersion,
      restricted: true,
    };
  }

  private async nextExposureNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
  ): Promise<number> {
    let seq = await tx.query.nerisIncidentExposureSequences.findFirst({
      where: eq(nerisIncidentExposureSequences.incidentId, incidentId),
    });
    if (!seq) {
      await tx.insert(nerisIncidentExposureSequences).values({
        id: createId(),
        tenantId,
        incidentId,
        nextValue: 1,
      });
      seq = await tx.query.nerisIncidentExposureSequences.findFirst({
        where: eq(nerisIncidentExposureSequences.incidentId, incidentId),
      });
    }
    const [updated] = await tx
      .update(nerisIncidentExposureSequences)
      .set({
        nextValue: sql`${nerisIncidentExposureSequences.nextValue} + 1`,
        updatedAt: new Date(),
        recordVersion: sql`${nerisIncidentExposureSequences.recordVersion} + 1`,
      })
      .where(eq(nerisIncidentExposureSequences.incidentId, incidentId))
      .returning();
    return (updated?.nextValue ?? 2) - 1;
  }

  private async requireIncident(tx: DatabaseTransaction, tenantId: string, incidentId: string) {
    const incident = await tx.query.nerisIncidents.findFirst({
      where: and(eq(nerisIncidents.id, incidentId), eq(nerisIncidents.tenantId, tenantId)),
    });
    if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
    return incident;
  }

  private async requireEditableIncident(
    tx: DatabaseTransaction,
    tenantId: string,
    incidentId: string,
  ) {
    const incident = await this.requireIncident(tx, tenantId, incidentId);
    this.stateMachine.assertEditable(incident.status as never);
    return incident;
  }

  private async requireExposure(tx: DatabaseTransaction, incidentId: string, exposureId: string) {
    const row = await tx.query.nerisIncidentExposures.findFirst({
      where: and(
        eq(nerisIncidentExposures.id, exposureId),
        eq(nerisIncidentExposures.incidentId, incidentId),
      ),
    });
    if (!row || row.archivedAt) throw new ForgeError("NOT_FOUND", "Exposure not found");
    return row;
  }

  private async recordCasualtyAccess(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    tenantId: string,
    incidentId: string,
    casualtyType: string,
    casualtyId: string,
    action: string,
  ) {
    await tx.insert(nerisCasualtyAccessAudit).values({
      id: createId(),
      tenantId,
      incidentId,
      casualtyType,
      casualtyId,
      actorUserId: principal.userId,
      action,
      correlationId: principal.correlationId ?? null,
    });
  }

  private async auditSpecialty(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    tenantId: string,
    action: string,
    resourceId: string,
    after: Record<string, unknown>,
  ) {
    await this.audit.writeInTransaction(tx, {
      tenantId,
      actorUserId: principal.userId,
      actorPersonId: principal.personId,
      actorType: "USER",
      action,
      resourceType: "neris_specialty_record",
      resourceId,
      result: "SUCCESS",
      riskLevel: "LOW",
      correlationId: principal.correlationId,
      requestId: principal.requestId,
      after,
    });
  }
}
