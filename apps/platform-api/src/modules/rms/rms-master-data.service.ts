import { Inject, Injectable } from "@nestjs/common";
import {
  createApparatusInputSchema,
  createOccupancyInputSchema,
  createPreplanInputSchema,
  createRmsPersonnelInputSchema,
  createShiftInputSchema,
  createStationInputSchema,
  createUnitInputSchema,
  pageQuerySchema,
} from "@forge/contracts";
import {
  createId,
  rmsApparatus,
  rmsDailyRosters,
  rmsOccupancies,
  rmsPersonnel,
  rmsPreplans,
  rmsRosterAssignments,
  rmsShifts,
  rmsStations,
  rmsUnits,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

type RmsResourceTable =
  | typeof rmsStations
  | typeof rmsShifts
  | typeof rmsApparatus
  | typeof rmsUnits
  | typeof rmsPersonnel
  | typeof rmsOccupancies
  | typeof rmsPreplans;

type RmsResourceRow = {
  id: string;
  tenantId: string;
  recordVersion: number;
  deletedAt: Date | null;
};

const rosterCreateSchema = z.object({
  rosterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().uuid(),
  stationId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const rosterAssignmentSchema = z.object({
  personnelId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(),
  assignmentRole: z.string().max(80).default("MEMBER"),
  isOfficer: z.boolean().default(false),
  incidentCommanderEligible: z.boolean().default(false),
});

function patchFromCreate<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.partial();
}

@Injectable()
export class RmsMasterDataService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  // --- stations ---

  async createStation(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createStationInputSchema.parse(input);
    return this.createResource(tenantId, "rms_station", rmsStations, data, principal, {
      stationNumber: data.stationNumber,
      name: data.name,
      status: data.status,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      timezone: data.timezone,
      defaultResponseDistrict: data.defaultResponseDistrict,
    });
  }

  async listStations(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsStations, page, pageSize, search, (q) =>
      or(
        ilike(rmsStations.name, q),
        ilike(rmsStations.stationNumber, q),
        ilike(rmsStations.city, q),
      ),
    );
  }

  async getStation(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsStations, id, "rms_station");
  }

  async patchStation(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createStationInputSchema).parse(input);
    return this.patchResource(tenantId, "rms_station", rmsStations, id, data, principal, expected);
  }

  async deleteStation(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_station", rmsStations, id, principal, expected);
  }

  // --- shifts ---

  async createShift(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createShiftInputSchema.parse(input);
    return this.createResource(tenantId, "rms_shift", rmsShifts, data, principal, {
      name: data.name,
      code: data.code,
      status: data.status,
      scheduleReference: data.scheduleReference,
    });
  }

  async listShifts(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsShifts, page, pageSize, search, (q) =>
      or(ilike(rmsShifts.name, q), ilike(rmsShifts.code, q)),
    );
  }

  async getShift(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsShifts, id, "rms_shift");
  }

  async patchShift(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createShiftInputSchema).parse(input);
    return this.patchResource(tenantId, "rms_shift", rmsShifts, id, data, principal, expected);
  }

  async deleteShift(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_shift", rmsShifts, id, principal, expected);
  }

  // --- apparatus ---

  async createApparatus(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createApparatusInputSchema.parse(input);
    return this.createResource(tenantId, "rms_apparatus", rmsApparatus, data, principal, {
      apparatusNumber: data.apparatusNumber,
      name: data.name,
      apparatusType: data.apparatusType,
      stationId: data.stationId,
      status: data.status,
      nerisClassification: data.nerisClassification,
    });
  }

  async listApparatus(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsApparatus, page, pageSize, search, (q) =>
      or(
        ilike(rmsApparatus.name, q),
        ilike(rmsApparatus.apparatusNumber, q),
        ilike(rmsApparatus.apparatusType, q),
      ),
    );
  }

  async getApparatus(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsApparatus, id, "rms_apparatus");
  }

  async patchApparatus(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createApparatusInputSchema).parse(input);
    return this.patchResource(
      tenantId,
      "rms_apparatus",
      rmsApparatus,
      id,
      data,
      principal,
      expected,
    );
  }

  async deleteApparatus(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_apparatus", rmsApparatus, id, principal, expected);
  }

  // --- units ---

  async createUnit(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createUnitInputSchema.parse(input);
    return this.createResource(tenantId, "rms_unit", rmsUnits, data, principal, {
      unitNumber: data.unitNumber,
      callSign: data.callSign,
      unitType: data.unitType,
      apparatusId: data.apparatusId,
      stationId: data.stationId,
      status: data.status,
    });
  }

  async listUnits(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsUnits, page, pageSize, search, (q) =>
      or(ilike(rmsUnits.unitNumber, q), ilike(rmsUnits.callSign, q), ilike(rmsUnits.unitType, q)),
    );
  }

  async getUnit(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsUnits, id, "rms_unit");
  }

  async patchUnit(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createUnitInputSchema).parse(input);
    return this.patchResource(tenantId, "rms_unit", rmsUnits, id, data, principal, expected);
  }

  async deleteUnit(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_unit", rmsUnits, id, principal, expected);
  }

  // --- personnel ---

  async createPersonnel(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createRmsPersonnelInputSchema.parse(input);
    return this.createResource(tenantId, "rms_personnel", rmsPersonnel, data, principal, {
      personId: data.personId,
      rank: data.rank,
      qualificationSummary: data.qualificationSummary,
      stationId: data.stationId,
      shiftId: data.shiftId,
      status: data.status,
      incidentEligible: data.incidentEligible,
    });
  }

  async listPersonnel(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsPersonnel, page, pageSize, search, (q) =>
      or(ilike(rmsPersonnel.rank, q), ilike(rmsPersonnel.qualificationSummary, q)),
    );
  }

  async getPersonnel(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsPersonnel, id, "rms_personnel");
  }

  async patchPersonnel(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createRmsPersonnelInputSchema).parse(input);
    return this.patchResource(
      tenantId,
      "rms_personnel",
      rmsPersonnel,
      id,
      data,
      principal,
      expected,
    );
  }

  async deletePersonnel(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_personnel", rmsPersonnel, id, principal, expected);
  }

  // --- occupancies ---

  async createOccupancy(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createOccupancyInputSchema.parse(input);
    return this.createResource(tenantId, "rms_occupancy", rmsOccupancies, data, principal, {
      name: data.name,
      addressLine1: data.addressLine1,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      latitude: data.latitude,
      longitude: data.longitude,
      primaryContact: data.primaryContact,
      occupancyType: data.occupancyType,
      status: data.status,
      preplanId: data.preplanId,
    });
  }

  async listOccupancies(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsOccupancies, page, pageSize, search, (q) =>
      or(
        ilike(rmsOccupancies.name, q),
        ilike(rmsOccupancies.addressLine1, q),
        ilike(rmsOccupancies.city, q),
      ),
    );
  }

  async getOccupancy(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsOccupancies, id, "rms_occupancy");
  }

  async patchOccupancy(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createOccupancyInputSchema).parse(input);
    return this.patchResource(
      tenantId,
      "rms_occupancy",
      rmsOccupancies,
      id,
      data,
      principal,
      expected,
    );
  }

  async deleteOccupancy(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_occupancy", rmsOccupancies, id, principal, expected);
  }

  // --- preplans ---

  async createPreplan(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createPreplanInputSchema.parse(input);
    return this.createResource(tenantId, "rms_preplan", rmsPreplans, data, principal, {
      occupancyId: data.occupancyId,
      versionLabel: data.versionLabel,
      approvalStatus: data.approvalStatus,
      tacticalSummary: data.tacticalSummary,
      hazards: data.hazards,
      accessNotes: data.accessNotes,
      utilityNotes: data.utilityNotes,
      primaryStationId: data.primaryStationId,
    });
  }

  async listPreplans(tenantId: string, query: unknown) {
    const { page, pageSize, search } = pageQuerySchema.parse(query ?? {});
    return this.listResource(tenantId, rmsPreplans, page, pageSize, search, (q) =>
      or(
        ilike(rmsPreplans.versionLabel, q),
        ilike(rmsPreplans.tacticalSummary, q),
        ilike(rmsPreplans.hazards, q),
      ),
    );
  }

  async getPreplan(tenantId: string, id: string) {
    return this.getResource(tenantId, rmsPreplans, id, "rms_preplan");
  }

  async patchPreplan(
    tenantId: string,
    id: string,
    input: unknown,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    const data = patchFromCreate(createPreplanInputSchema).parse(input);
    return this.patchResource(tenantId, "rms_preplan", rmsPreplans, id, data, principal, expected);
  }

  async deletePreplan(
    tenantId: string,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return this.softDelete(tenantId, "rms_preplan", rmsPreplans, id, principal, expected);
  }

  // --- rosters ---

  async createRoster(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = rosterCreateSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(rmsDailyRosters)
          .values({
            id,
            tenantId,
            rosterDate: data.rosterDate,
            shiftId: data.shiftId,
            stationId: data.stationId,
            status: data.status,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create roster");
        await this.emitMasterDataUpdated(tx, tenantId, "rms_roster", id, principal, "create");
        return row;
      },
      principal.userId,
    );
  }

  async listRosters(tenantId: string, query: unknown) {
    const { page, pageSize } = pageQuerySchema.parse(query ?? {});
    const offset = (page - 1) * pageSize;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const where = eq(rmsDailyRosters.tenantId, tenantId);
      const items = await tx
        .select()
        .from(rmsDailyRosters)
        .where(where)
        .orderBy(sql`${rmsDailyRosters.rosterDate} desc`)
        .limit(pageSize)
        .offset(offset);
      const totalRows = await tx.select({ total: count() }).from(rmsDailyRosters).where(where);
      return { items, page, pageSize, total: totalRows[0]?.total ?? 0 };
    });
  }

  async getRoster(tenantId: string, id: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.rmsDailyRosters.findFirst({
        where: and(eq(rmsDailyRosters.id, id), eq(rmsDailyRosters.tenantId, tenantId)),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Roster not found");
      const assignments = await tx.query.rmsRosterAssignments.findMany({
        where: eq(rmsRosterAssignments.rosterId, id),
      });
      return { ...row, assignments };
    });
  }

  async addRosterAssignment(
    tenantId: string,
    rosterId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = rosterAssignmentSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const roster = await tx.query.rmsDailyRosters.findFirst({
          where: and(eq(rmsDailyRosters.id, rosterId), eq(rmsDailyRosters.tenantId, tenantId)),
        });
        if (!roster) throw new ForgeError("NOT_FOUND", "Roster not found");
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(rmsRosterAssignments)
          .values({
            id,
            tenantId,
            rosterId,
            personnelId: data.personnelId,
            unitId: data.unitId,
            assignmentRole: data.assignmentRole,
            isOfficer: data.isOfficer,
            incidentCommanderEligible: data.incidentCommanderEligible,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", "Failed to create roster assignment");
        await this.emitMasterDataUpdated(
          tx,
          tenantId,
          "rms_roster_assignment",
          id,
          principal,
          "create",
        );
        return row;
      },
      principal.userId,
    );
  }

  async removeRosterAssignment(
    tenantId: string,
    rosterId: string,
    assignmentId: string,
    principal: ForgePrincipal,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const assignment = await tx.query.rmsRosterAssignments.findFirst({
          where: and(
            eq(rmsRosterAssignments.id, assignmentId),
            eq(rmsRosterAssignments.rosterId, rosterId),
            eq(rmsRosterAssignments.tenantId, tenantId),
          ),
        });
        if (!assignment) throw new ForgeError("NOT_FOUND", "Roster assignment not found");
        await tx.delete(rmsRosterAssignments).where(eq(rmsRosterAssignments.id, assignmentId));
        await this.emitMasterDataUpdated(
          tx,
          tenantId,
          "rms_roster_assignment",
          assignmentId,
          principal,
          "delete",
        );
        return { deleted: true, assignmentId };
      },
      principal.userId,
    );
  }

  // --- shared helpers ---

  private async createResource<T extends Record<string, unknown>>(
    tenantId: string,
    resourceType: string,
    table: RmsResourceTable,
    _parsed: unknown,
    principal: ForgePrincipal,
    values: T,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(table)
          .values({
            id,
            tenantId,
            ...values,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          } as never)
          .returning();
        if (!row) throw new ForgeError("INTERNAL_ERROR", `Failed to create ${resourceType}`);
        await this.emitMasterDataUpdated(tx, tenantId, resourceType, id, principal, "create", row);
        return row;
      },
      principal.userId,
    );
  }

  private async listResource(
    tenantId: string,
    table: RmsResourceTable,
    page: number,
    pageSize: number,
    search: string | undefined,
    searchFilter: (q: string) => ReturnType<typeof or>,
  ) {
    const offset = (page - 1) * pageSize;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters = [eq(table.tenantId, tenantId), isNull(table.deletedAt)];
      if (search?.trim()) {
        filters.push(searchFilter(`%${search.trim()}%`)!);
      }
      const where = and(...filters);
      const items = await tx.select().from(table).where(where).limit(pageSize).offset(offset);
      const totalRows = await tx.select({ total: count() }).from(table).where(where);
      return { items, page, pageSize, total: totalRows[0]?.total ?? 0 };
    });
  }

  private async getResource(
    tenantId: string,
    table: RmsResourceTable,
    id: string,
    resourceType: string,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.tenantId, tenantId), isNull(table.deletedAt)))
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", `${resourceType} not found`);
      return row;
    });
  }

  private async patchResource(
    tenantId: string,
    resourceType: string,
    table: RmsResourceTable,
    id: string,
    data: Record<string, unknown>,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [before] = await tx
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.tenantId, tenantId), isNull(table.deletedAt)))
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", `${resourceType} not found`);
        const version = (before as RmsResourceRow).recordVersion;
        if (expected !== "*" && version !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType,
            resourceId: id,
            expectedVersion: expected,
            actualVersion: version,
          });
        }
        const [updated] = await tx
          .update(table)
          .set({
            ...data,
            recordVersion: version + 1,
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          } as never)
          .where(and(eq(table.id, id), eq(table.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType,
            resourceId: id,
            expectedVersion: expected,
            actualVersion: null,
          });
        }
        await this.emitMasterDataUpdated(
          tx,
          tenantId,
          resourceType,
          id,
          principal,
          "update",
          updated,
          before,
        );
        return updated;
      },
      principal.userId,
    );
  }

  private async softDelete(
    tenantId: string,
    resourceType: string,
    table: RmsResourceTable,
    id: string,
    principal: ForgePrincipal,
    expected: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [before] = await tx
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.tenantId, tenantId), isNull(table.deletedAt)))
          .limit(1);
        if (!before) throw new ForgeError("NOT_FOUND", `${resourceType} not found`);
        const version = (before as RmsResourceRow).recordVersion;
        if (expected !== "*" && version !== expected) {
          throw concurrencyConflict({
            tenantId,
            resourceType,
            resourceId: id,
            expectedVersion: expected,
            actualVersion: version,
          });
        }
        const now = new Date();
        const [updated] = await tx
          .update(table)
          .set({
            deletedAt: now,
            deletedByUserId: principal.userId,
            recordVersion: version + 1,
            updatedByUserId: principal.userId,
            updatedAt: now,
          } as never)
          .where(and(eq(table.id, id), eq(table.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType,
            resourceId: id,
            expectedVersion: expected,
            actualVersion: null,
          });
        }
        await this.emitMasterDataUpdated(
          tx,
          tenantId,
          resourceType,
          id,
          principal,
          "delete",
          updated,
          before,
        );
        return updated;
      },
      principal.userId,
    );
  }

  private async emitMasterDataUpdated(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    resourceType: string,
    resourceId: string,
    principal: ForgePrincipal,
    action: string,
    after?: unknown,
    before?: unknown,
  ) {
    await this.outbox.write(tx, {
      tenantId,
      aggregateType: resourceType,
      aggregateId: resourceId,
      eventType: DOMAIN_EVENT_TYPES.RMS_MASTERDATA_UPDATED,
      payload: { tenantId, resourceType, resourceId, action },
      correlationId: principal.correlationId,
      actorUserId: principal.userId,
    });
    await this.audit.writeInTransaction(tx, {
      tenantId,
      actorUserId: principal.userId,
      actorPersonId: principal.personId,
      actorType: "USER",
      action: `rms.masterdata.${action}`,
      resourceType,
      resourceId,
      result: "SUCCESS",
      riskLevel: "LOW",
      correlationId: principal.correlationId,
      requestId: principal.requestId,
      before,
      after,
    });
  }
}
