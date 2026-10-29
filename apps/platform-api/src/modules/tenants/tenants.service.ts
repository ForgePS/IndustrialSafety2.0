import { Inject, Injectable } from "@nestjs/common";
import {
  assertTenantStatusTransition,
  createTenantInputSchema,
  type CreateTenantInput,
  type TenantStatus,
} from "@forge/contracts";
import {
  createId,
  customerOnboardingSessions,
  tenants,
  type Database,
  withBypassRlsTransaction,
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

const patchTenantSchema = z.object({
  legalName: z.string().min(1).max(300).optional(),
  displayName: z.string().min(1).max(300).optional(),
  timezone: z.string().min(1).max(64).optional(),
  defaultLocale: z.string().min(2).max(16).optional(),
});

const suspendSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type ExpectedVersion = number | "*";

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Guards an optimistic update. Returns the version that must appear in the
   * UPDATE's WHERE clause so a concurrent writer cannot slip in between the
   * read and the write.
   */
  private assertVersion(tenantId: string, current: number, expected: ExpectedVersion): number {
    if (expected !== "*" && current !== expected) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "tenant",
        resourceId: tenantId,
        expectedVersion: expected,
        actualVersion: current,
      });
    }
    return current;
  }

  private assertTransition(from: string, to: TenantStatus): void {
    try {
      assertTenantStatusTransition(from, to);
    } catch (error) {
      throw new ForgeError(
        "CONFLICT",
        error instanceof Error ? error.message : "Invalid tenant status transition",
      );
    }
  }

  async create(input: unknown, principal: ForgePrincipal) {
    const data = createTenantInputSchema.parse(input) as CreateTenantInput;
    const id = createId();
    const now = new Date();

    // New tenant id is not yet the session tenant. Set RLS context to the new
    // id before insert so FORCE RLS WITH CHECK on tenants / outbox / audit
    // succeeds under forge_app (see tenants_tenant_isolation).
    await withTenantTransaction(
      this.db,
      id,
      async (tx) => {
        await tx.insert(tenants).values({
          id,
          tenantKey: data.tenantKey,
          slug: data.slug,
          legalName: data.legalName,
          displayName: data.displayName,
          tenantType: data.tenantType ?? "CUSTOMER",
          status: "PROVISIONING",
          timezone: data.timezone ?? "America/Chicago",
          defaultLocale: data.defaultLocale ?? "en-US",
          dataRegion: data.dataRegion ?? "us-east-1",
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        await this.outbox.write(tx, {
          tenantId: id,
          aggregateType: "tenant",
          aggregateId: id,
          eventType: DOMAIN_EVENT_TYPES.TENANT_CREATED,
          payload: {
            tenantId: id,
            tenantKey: data.tenantKey,
            slug: data.slug,
            status: "PROVISIONING",
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId: id,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "tenant.create",
          resourceType: "tenant",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { id, status: "PROVISIONING", tenantKey: data.tenantKey },
        });
      },
      principal.userId,
    );

    return this.getById(id);
  }

  async list() {
    // Platform catalog requires cross-tenant SELECT; policies honor bypass_rls.
    return withBypassRlsTransaction(this.db, async (tx) =>
      tx.query.tenants.findMany({
        orderBy: (t, { asc }) => [asc(t.displayName)],
      }),
    );
  }

  async getById(tenantId: string) {
    const row = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      }),
    );
    if (!row) {
      throw new ForgeError("NOT_FOUND", "Tenant not found");
    }
    return row;
  }

  async patch(
    tenantId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchTenantSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Tenant not found");
        }
        const version = this.assertVersion(tenantId, before.recordVersion, expectedVersion);
        const [updated] = await tx
          .update(tenants)
          .set({
            ...data,
            recordVersion: version + 1,
            updatedAt: new Date(),
            updatedByUserId: principal.userId,
          })
          .where(and(eq(tenants.id, tenantId), eq(tenants.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "tenant",
            resourceId: tenantId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "tenant.update",
          resourceType: "tenant",
          resourceId: tenantId,
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

  private async transition(
    tenantId: string,
    nextStatus: TenantStatus,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    options: {
      auditAction: string;
      eventType: string;
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      extras?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Tenant not found");
        }
        this.assertTransition(before.status, nextStatus);
        const version = this.assertVersion(tenantId, before.recordVersion, expectedVersion);
        const now = new Date();
        const [updated] = await tx
          .update(tenants)
          .set({
            status: nextStatus,
            recordVersion: version + 1,
            updatedAt: now,
            updatedByUserId: principal.userId,
            ...(options.extras ?? {}),
          })
          .where(and(eq(tenants.id, tenantId), eq(tenants.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "tenant",
            resourceId: tenantId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "tenant",
          aggregateId: tenantId,
          eventType: options.eventType,
          payload: {
            tenantId,
            previousStatus: before.status,
            status: nextStatus,
            ...(options.metadata ?? {}),
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: options.auditAction,
          resourceType: "tenant",
          resourceId: tenantId,
          result: "SUCCESS",
          riskLevel: options.riskLevel,
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before,
          after: updated,
          ...(options.metadata ? { metadata: options.metadata } : {}),
        });
        return updated;
      },
      principal.userId,
    );
  }

  async activate(
    tenantId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    options?: { fromOnboarding?: boolean },
  ) {
    if (!options?.fromOnboarding) {
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        const open = await tx.query.customerOnboardingSessions.findFirst({
          where: and(
            eq(customerOnboardingSessions.tenantId, tenantId),
            eq(customerOnboardingSessions.status, "IN_PROGRESS"),
          ),
        });
        if (open) {
          throw new ForgeError(
            "CONFLICT",
            "Tenant has an in-progress onboarding session; complete onboarding activation instead",
          );
        }
      });
    }
    return this.transition(tenantId, "ACTIVE", principal, expectedVersion, {
      auditAction: "tenant.activate",
      eventType: DOMAIN_EVENT_TYPES.TENANT_ACTIVATED,
      riskLevel: "HIGH",
      extras: {
        suspensionReason: null,
        suspendedAt: null,
      },
    });
  }

  async startTrial(tenantId: string, principal: ForgePrincipal, expectedVersion: ExpectedVersion) {
    return this.transition(tenantId, "TRIAL", principal, expectedVersion, {
      auditAction: "tenant.start_trial",
      eventType: DOMAIN_EVENT_TYPES.TENANT_STATUS_CHANGED,
      riskLevel: "MEDIUM",
      extras: {
        suspensionReason: null,
        suspendedAt: null,
      },
    });
  }

  async suspend(
    tenantId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const { reason } = suspendSchema.parse(input);
    const now = new Date();
    return this.transition(tenantId, "SUSPENDED", principal, expectedVersion, {
      auditAction: "tenant.suspend",
      eventType: DOMAIN_EVENT_TYPES.TENANT_SUSPENDED,
      riskLevel: "CRITICAL",
      extras: {
        suspensionReason: reason,
        suspendedAt: now,
      },
      metadata: { reason },
    });
  }

  async archive(tenantId: string, principal: ForgePrincipal, expectedVersion: ExpectedVersion) {
    const now = new Date();
    return this.transition(tenantId, "ARCHIVED", principal, expectedVersion, {
      auditAction: "tenant.archive",
      eventType: DOMAIN_EVENT_TYPES.TENANT_ARCHIVED,
      riskLevel: "HIGH",
      extras: {
        archivedAt: now,
      },
    });
  }

  async cancel(tenantId: string, principal: ForgePrincipal, expectedVersion: ExpectedVersion) {
    return this.transition(tenantId, "CANCELED", principal, expectedVersion, {
      auditAction: "tenant.cancel",
      eventType: DOMAIN_EVENT_TYPES.TENANT_STATUS_CHANGED,
      riskLevel: "HIGH",
    });
  }
}
