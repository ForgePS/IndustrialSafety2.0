import { Inject, Injectable } from "@nestjs/common";
import {
  createIncidentPersonnelInputSchema,
  createIncidentUnitInputSchema,
  patchIncidentPersonnelInputSchema,
  patchIncidentUnitInputSchema,
  prefillQuerySchema,
} from "@forge/contracts";
import {
  createId,
  nerisIncidentPersonnel,
  nerisIncidentUnits,
  nerisIncidents,
  rmsPersonnel,
  rmsUnits,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { IncidentPrefillService } from "./incident-prefill.service.js";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";

type ExpectedVersion = number | "*";

@Injectable()
export class IncidentAssignmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly stateMachine: IncidentStateMachineService,
    private readonly prefill: IncidentPrefillService,
  ) {}

  async listUnits(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx
        .select()
        .from(nerisIncidentUnits)
        .where(
          and(
            eq(nerisIncidentUnits.tenantId, tenantId),
            eq(nerisIncidentUnits.incidentId, incidentId),
            isNull(nerisIncidentUnits.deletedAt),
          ),
        );
    });
  }

  async createUnit(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = createIncidentUnitInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        await this.requireMasterUnit(tx, tenantId, data.unitId);

        const existing = await tx.query.nerisIncidentUnits.findFirst({
          where: and(
            eq(nerisIncidentUnits.incidentId, incidentId),
            eq(nerisIncidentUnits.unitId, data.unitId),
            isNull(nerisIncidentUnits.deletedAt),
          ),
        });
        if (existing) {
          throw new ForgeError("CONFLICT", "Unit already assigned to incident");
        }

        const now = new Date();
        const [row] = await tx
          .insert(nerisIncidentUnits)
          .values({
            id: createId(),
            tenantId,
            incidentId,
            unitId: data.unitId,
            isPrimary: data.isPrimary,
            unitRole: data.unitRole,
            dispatchedAt: data.dispatchedAt ? new Date(data.dispatchedAt) : null,
            enRouteAt: data.enRouteAt ? new Date(data.enRouteAt) : null,
            arrivedAt: data.arrivedAt ? new Date(data.arrivedAt) : null,
            clearedAt: data.clearedAt ? new Date(data.clearedAt) : null,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to assign unit");
        return row;
      },
      principal.userId,
    );
  }

  async patchUnit(
    tenantId: string,
    incidentId: string,
    assignmentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchIncidentUnitInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        const [before] = await tx
          .select()
          .from(nerisIncidentUnits)
          .where(
            and(
              eq(nerisIncidentUnits.id, assignmentId),
              eq(nerisIncidentUnits.tenantId, tenantId),
              eq(nerisIncidentUnits.incidentId, incidentId),
              isNull(nerisIncidentUnits.deletedAt),
            ),
          )
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", "Incident unit assignment not found");
        if (expected !== "*" && before.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident_unit",
            resourceId: assignmentId,
            expectedVersion: expected,
            actualVersion: before.recordVersion,
          });
        }

        const [updated] = await tx
          .update(nerisIncidentUnits)
          .set({
            ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
            ...(data.unitRole !== undefined ? { unitRole: data.unitRole } : {}),
            ...(data.dispatchedAt !== undefined
              ? { dispatchedAt: data.dispatchedAt ? new Date(data.dispatchedAt) : null }
              : {}),
            ...(data.enRouteAt !== undefined
              ? { enRouteAt: data.enRouteAt ? new Date(data.enRouteAt) : null }
              : {}),
            ...(data.arrivedAt !== undefined
              ? { arrivedAt: data.arrivedAt ? new Date(data.arrivedAt) : null }
              : {}),
            ...(data.clearedAt !== undefined
              ? { clearedAt: data.clearedAt ? new Date(data.clearedAt) : null }
              : {}),
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidentUnits.id, assignmentId))
          .returning();
        return updated!;
      },
      principal.userId,
    );
  }

  async deleteUnit(
    tenantId: string,
    incidentId: string,
    assignmentId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        const [before] = await tx
          .select()
          .from(nerisIncidentUnits)
          .where(
            and(
              eq(nerisIncidentUnits.id, assignmentId),
              eq(nerisIncidentUnits.tenantId, tenantId),
              eq(nerisIncidentUnits.incidentId, incidentId),
              isNull(nerisIncidentUnits.deletedAt),
            ),
          )
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", "Incident unit assignment not found");
        if (expected !== "*" && before.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident_unit",
            resourceId: assignmentId,
            expectedVersion: expected,
            actualVersion: before.recordVersion,
          });
        }

        const now = new Date();
        await tx
          .update(nerisIncidentUnits)
          .set({ deletedAt: now, updatedByUserId: principal.userId, updatedAt: now })
          .where(eq(nerisIncidentUnits.id, assignmentId));
        return { deleted: true, assignmentId };
      },
      principal.userId,
    );
  }

  async listPersonnel(tenantId: string, incidentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      return tx
        .select()
        .from(nerisIncidentPersonnel)
        .where(
          and(
            eq(nerisIncidentPersonnel.tenantId, tenantId),
            eq(nerisIncidentPersonnel.incidentId, incidentId),
            isNull(nerisIncidentPersonnel.deletedAt),
          ),
        );
    });
  }

  async createPersonnel(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = createIncidentPersonnelInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        await this.requireMasterPersonnel(tx, tenantId, data.personnelId);

        if (data.unitAssignmentId) {
          const unitAssignment = await tx.query.nerisIncidentUnits.findFirst({
            where: and(
              eq(nerisIncidentUnits.id, data.unitAssignmentId),
              eq(nerisIncidentUnits.incidentId, incidentId),
              eq(nerisIncidentUnits.tenantId, tenantId),
              isNull(nerisIncidentUnits.deletedAt),
            ),
          });
          if (!unitAssignment) {
            throw new ForgeError(
              "BAD_REQUEST",
              "unitAssignmentId does not belong to this incident",
            );
          }
        }

        const existing = await tx.query.nerisIncidentPersonnel.findFirst({
          where: and(
            eq(nerisIncidentPersonnel.incidentId, incidentId),
            eq(nerisIncidentPersonnel.personnelId, data.personnelId),
            isNull(nerisIncidentPersonnel.deletedAt),
          ),
        });
        if (existing) {
          throw new ForgeError("CONFLICT", "Personnel already assigned to incident");
        }

        const now = new Date();
        const [row] = await tx
          .insert(nerisIncidentPersonnel)
          .values({
            id: createId(),
            tenantId,
            incidentId,
            personnelId: data.personnelId,
            unitAssignmentId: data.unitAssignmentId,
            role: data.role,
            rank: data.rank,
            primaryAction: data.primaryAction,
            exposureInvolved: data.exposureInvolved,
            isIncidentCommander: data.isIncidentCommander,
            isReportingOfficer: data.isReportingOfficer,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to assign personnel");
        return row;
      },
      principal.userId,
    );
  }

  async patchPersonnel(
    tenantId: string,
    incidentId: string,
    assignmentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchIncidentPersonnelInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        const [before] = await tx
          .select()
          .from(nerisIncidentPersonnel)
          .where(
            and(
              eq(nerisIncidentPersonnel.id, assignmentId),
              eq(nerisIncidentPersonnel.tenantId, tenantId),
              eq(nerisIncidentPersonnel.incidentId, incidentId),
              isNull(nerisIncidentPersonnel.deletedAt),
            ),
          )
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", "Incident personnel assignment not found");
        if (expected !== "*" && before.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident_personnel",
            resourceId: assignmentId,
            expectedVersion: expected,
            actualVersion: before.recordVersion,
          });
        }

        if (data.unitAssignmentId) {
          const unitAssignment = await tx.query.nerisIncidentUnits.findFirst({
            where: and(
              eq(nerisIncidentUnits.id, data.unitAssignmentId),
              eq(nerisIncidentUnits.incidentId, incidentId),
              eq(nerisIncidentUnits.tenantId, tenantId),
              isNull(nerisIncidentUnits.deletedAt),
            ),
          });
          if (!unitAssignment) {
            throw new ForgeError(
              "BAD_REQUEST",
              "unitAssignmentId does not belong to this incident",
            );
          }
        }

        const [updated] = await tx
          .update(nerisIncidentPersonnel)
          .set({
            ...(data.unitAssignmentId !== undefined
              ? { unitAssignmentId: data.unitAssignmentId }
              : {}),
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(data.rank !== undefined ? { rank: data.rank } : {}),
            ...(data.primaryAction !== undefined ? { primaryAction: data.primaryAction } : {}),
            ...(data.exposureInvolved !== undefined
              ? { exposureInvolved: data.exposureInvolved }
              : {}),
            ...(data.isIncidentCommander !== undefined
              ? { isIncidentCommander: data.isIncidentCommander }
              : {}),
            ...(data.isReportingOfficer !== undefined
              ? { isReportingOfficer: data.isReportingOfficer }
              : {}),
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(eq(nerisIncidentPersonnel.id, assignmentId))
          .returning();
        return updated!;
      },
      principal.userId,
    );
  }

  async deletePersonnel(
    tenantId: string,
    incidentId: string,
    assignmentId: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.requireEditableIncident(tx, tenantId, incidentId);
        const [before] = await tx
          .select()
          .from(nerisIncidentPersonnel)
          .where(
            and(
              eq(nerisIncidentPersonnel.id, assignmentId),
              eq(nerisIncidentPersonnel.tenantId, tenantId),
              eq(nerisIncidentPersonnel.incidentId, incidentId),
              isNull(nerisIncidentPersonnel.deletedAt),
            ),
          )
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", "Incident personnel assignment not found");
        if (expected !== "*" && before.recordVersion !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "neris_incident_personnel",
            resourceId: assignmentId,
            expectedVersion: expected,
            actualVersion: before.recordVersion,
          });
        }

        const now = new Date();
        await tx
          .update(nerisIncidentPersonnel)
          .set({ deletedAt: now, updatedByUserId: principal.userId, updatedAt: now })
          .where(eq(nerisIncidentPersonnel.id, assignmentId));
        return { deleted: true, assignmentId };
      },
      principal.userId,
    );
  }

  async getPrefill(tenantId: string, incidentId: string, query: unknown) {
    const params = prefillQuerySchema.parse(query ?? {});
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await tx.query.nerisIncidents.findFirst({
        where: and(
          eq(nerisIncidents.id, incidentId),
          eq(nerisIncidents.tenantId, tenantId),
          isNull(nerisIncidents.deletedAt),
        ),
      });
      if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

      return this.prefill.loadCandidates(tx, tenantId, {
        stationId: params.stationId ?? incident.stationId,
        personnelId: params.personnelId ?? incident.incidentCommanderPersonnelId,
        occupancyId: params.occupancyId ?? null,
        preplanId: params.preplanId ?? null,
      });
    });
  }

  private async requireIncident(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
  ) {
    const incident = await tx.query.nerisIncidents.findFirst({
      where: and(
        eq(nerisIncidents.id, incidentId),
        eq(nerisIncidents.tenantId, tenantId),
        isNull(nerisIncidents.deletedAt),
      ),
    });
    if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
    return incident;
  }

  private async requireEditableIncident(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
  ) {
    const incident = await this.requireIncident(tx, tenantId, incidentId);
    this.stateMachine.assertEditable(
      incident.status as Parameters<IncidentStateMachineService["assertEditable"]>[0],
    );
    return incident;
  }

  private async requireMasterUnit(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    unitId: string,
  ) {
    const unit = await tx.query.rmsUnits.findFirst({
      where: and(
        eq(rmsUnits.id, unitId),
        eq(rmsUnits.tenantId, tenantId),
        isNull(rmsUnits.deletedAt),
      ),
    });
    if (!unit) throw new ForgeError("BAD_REQUEST", "unitId not found for tenant");
  }

  private async requireMasterPersonnel(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    personnelId: string,
  ) {
    const personnel = await tx.query.rmsPersonnel.findFirst({
      where: and(
        eq(rmsPersonnel.id, personnelId),
        eq(rmsPersonnel.tenantId, tenantId),
        isNull(rmsPersonnel.deletedAt),
      ),
    });
    if (!personnel) throw new ForgeError("BAD_REQUEST", "personnelId not found for tenant");
  }
}
