import { Inject, Injectable } from "@nestjs/common";
import { createOrganizationInputSchema, type CreateOrganizationInput } from "@forge/contracts";
import {
  createId,
  organizationTypes,
  organizations,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

const patchSchema = z.object({
  legalName: z.string().min(1).max(300).optional(),
  displayName: z.string().min(1).max(300).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
});

type ExpectedVersion = number | "*";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createOrganizationInputSchema.parse(input) as CreateOrganizationInput;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const orgType = await tx.query.organizationTypes.findFirst({
          where: eq(organizationTypes.code, data.organizationTypeCode),
        });
        if (!orgType) {
          throw new ForgeError("BAD_REQUEST", "Unknown organization type code");
        }
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(organizations)
          .values({
            id,
            tenantId,
            organizationTypeId: orgType.id,
            parentOrganizationId: data.parentOrganizationId,
            slug: data.slug,
            legalName: data.legalName,
            displayName: data.displayName,
            email: data.email,
            phone: data.phone,
            timezone: data.timezone,
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to create organization");
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "organization",
          aggregateId: id,
          eventType: DOMAIN_EVENT_TYPES.ORGANIZATION_CREATED,
          payload: { organizationId: id, tenantId, slug: data.slug },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "organization.create",
          resourceType: "organization",
          resourceId: id,
          organizationId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
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
      return tx.query.organizations.findMany({
        where: eq(organizations.tenantId, tenantId),
        orderBy: (t, { asc }) => [asc(t.displayName)],
      });
    });
  }

  async get(tenantId: string, organizationId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.organizations.findFirst({
        where: and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)),
      });
      if (!row) {
        throw new ForgeError("NOT_FOUND", "Organization not found");
      }
      return row;
    });
  }

  async patch(
    tenantId: string,
    organizationId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.organizations.findFirst({
          where: and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Organization not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "organization",
            resourceId: organizationId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const [updated] = await tx
          .update(organizations)
          .set({ ...data, recordVersion: version + 1, updatedAt: new Date() })
          .where(
            and(eq(organizations.id, organizationId), eq(organizations.recordVersion, version)),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "organization",
            resourceId: organizationId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "organization",
          aggregateId: organizationId,
          eventType: DOMAIN_EVENT_TYPES.ORGANIZATION_UPDATED,
          payload: { organizationId, tenantId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "organization.update",
          resourceType: "organization",
          resourceId: organizationId,
          organizationId,
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

  async archive(
    tenantId: string,
    organizationId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.organizations.findFirst({
          where: and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Organization not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "organization",
            resourceId: organizationId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const now = new Date();
        const [updated] = await tx
          .update(organizations)
          .set({
            status: "ARCHIVED",
            archivedAt: now,
            recordVersion: version + 1,
            updatedAt: now,
          })
          .where(
            and(eq(organizations.id, organizationId), eq(organizations.recordVersion, version)),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "organization",
            resourceId: organizationId,
            expectedVersion,
            actualVersion: null,
          });
        }
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "organization.archive",
          resourceType: "organization",
          resourceId: organizationId,
          organizationId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
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
