import { Inject, Injectable } from "@nestjs/common";
import {
  createFacilityInputSchema,
  facilityBelongsToTenant,
  patchFacilityInputSchema,
  type CreateFacilityInput,
} from "@forge/contracts";
import {
  createId,
  facilities,
  organizations,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

@Injectable()
export class FacilitiesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  private assertVersion(
    tenantId: string,
    resourceId: string,
    current: number,
    expected: ExpectedVersion,
  ): number {
    if (expected !== "*" && current !== expected) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "facility",
        resourceId,
        expectedVersion: expected,
        actualVersion: current,
      });
    }
    return current;
  }

  private assertOwnership(facilityTenantId: string, tenantId: string): void {
    if (!facilityBelongsToTenant(facilityTenantId, tenantId)) {
      throw new ForgeError("FORBIDDEN", "Facility does not belong to the requested tenant");
    }
  }

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createFacilityInputSchema.parse(input) as CreateFacilityInput;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        if (data.organizationId) {
          const org = await tx.query.organizations.findFirst({
            where: and(
              eq(organizations.id, data.organizationId),
              eq(organizations.tenantId, tenantId),
            ),
          });
          if (!org) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              "organizationId must reference an organization in the same tenant",
            );
          }
        }

        const now = new Date();
        const id = createId();
        const [row] = await tx
          .insert(facilities)
          .values({
            id,
            tenantId,
            organizationId: data.organizationId,
            facilityKey: data.facilityKey,
            name: data.name,
            facilityType: data.facilityType,
            status: data.status,
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2,
            city: data.city,
            stateProvince: data.stateProvince,
            postalCode: data.postalCode,
            countryCode: data.countryCode,
            timezone: data.timezone,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) {
          throw new Error("Failed to create facility");
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "facility",
          aggregateId: row.id,
          eventType: DOMAIN_EVENT_TYPES.FACILITY_CREATED,
          payload: {
            tenantId,
            facilityId: row.id,
            facilityKey: row.facilityKey,
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "facility.create",
          resourceType: "facility",
          resourceId: row.id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return row;
      },
      principal.userId,
    );
  }

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.facilities.findMany({
        where: eq(facilities.tenantId, tenantId),
        orderBy: (f, { asc }) => [asc(f.name)],
      });
    });
  }

  async get(tenantId: string, facilityId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.facilities.findFirst({
        where: eq(facilities.id, facilityId),
      });
      if (!row) {
        throw new ForgeError("NOT_FOUND", "Facility not found");
      }
      this.assertOwnership(row.tenantId, tenantId);
      return row;
    });
  }

  async patch(
    tenantId: string,
    facilityId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchFacilityInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.facilities.findFirst({
          where: eq(facilities.id, facilityId),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Facility not found");
        }
        this.assertOwnership(before.tenantId, tenantId);

        if (data.organizationId) {
          const org = await tx.query.organizations.findFirst({
            where: and(
              eq(organizations.id, data.organizationId),
              eq(organizations.tenantId, tenantId),
            ),
          });
          if (!org) {
            throw new ForgeError(
              "VALIDATION_FAILED",
              "organizationId must reference an organization in the same tenant",
            );
          }
        }

        const version = this.assertVersion(
          tenantId,
          facilityId,
          before.recordVersion,
          expectedVersion,
        );
        const now = new Date();
        const [updated] = await tx
          .update(facilities)
          .set({
            ...data,
            archivedAt:
              data.status === "ARCHIVED"
                ? (before.archivedAt ?? now)
                : data.status
                  ? null
                  : before.archivedAt,
            recordVersion: version + 1,
            updatedAt: now,
            updatedByUserId: principal.userId,
          })
          .where(and(eq(facilities.id, facilityId), eq(facilities.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "facility",
            resourceId: facilityId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "facility",
          aggregateId: facilityId,
          eventType: DOMAIN_EVENT_TYPES.FACILITY_UPDATED,
          payload: { tenantId, facilityId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "facility.update",
          resourceType: "facility",
          resourceId: facilityId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before,
          after: updated,
        });
        return updated;
      },
      principal.userId,
    );
  }
}
