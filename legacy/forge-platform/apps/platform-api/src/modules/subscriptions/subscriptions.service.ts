import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  subscriptionEvents,
  subscriptionPlans,
  subscriptions,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

type SubscriptionPlanSummary = {
  id: string;
  code: string;
  name: string;
  billingInterval: string;
};

function enrichSubscription(
  row: {
    id: string;
    tenantId: string;
    planId: string;
    status: string;
    billingProvider: string;
    billingType: string;
    externalSubscriptionId: string | null;
    cancelAtPeriodEnd: boolean;
    recordVersion: number;
    startsAt: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  },
  plan: SubscriptionPlanSummary | undefined,
) {
  return {
    ...row,
    planCode: plan?.code ?? null,
    planName: plan?.name ?? null,
    billingInterval: plan?.billingInterval ?? null,
    billingCycle: plan?.billingInterval ?? null,
    renewsAt: row.currentPeriodEnd.toISOString(),
    endsAt: row.currentPeriodEnd.toISOString(),
    startedAt: row.startsAt.toISOString(),
  };
}

const createSchema = z.object({
  planCode: z.string().min(1).max(64),
  status: z.enum(["TRIAL", "ACTIVE", "GRACE"]).default("TRIAL"),
  billingProvider: z.string().max(64).default("NONE"),
  periodDays: z.number().int().positive().default(30),
});

const patchSchema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "GRACE", "SUSPENDED", "CANCELED"]).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  externalSubscriptionId: z.string().max(255).optional().nullable(),
});

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const plan = await tx.query.subscriptionPlans.findFirst({
          where: eq(subscriptionPlans.code, data.planCode),
        });
        if (!plan) {
          throw new ForgeError("NOT_FOUND", "Subscription plan not found");
        }
        const now = new Date();
        const periodEnd = new Date(now.getTime() + data.periodDays * 86400_000);
        const id = createId();
        const [row] = await tx
          .insert(subscriptions)
          .values({
            id,
            tenantId,
            planId: plan.id,
            status: data.status,
            billingProvider: data.billingProvider,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to create subscription");
        }

        await tx.insert(subscriptionEvents).values({
          id: createId(),
          tenantId,
          subscriptionId: id,
          eventType: "subscription.created",
          payloadJson: { planCode: data.planCode, status: data.status },
          occurredAt: now,
          createdAt: now,
        });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "subscription",
          aggregateId: id,
          eventType: DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
          payload: { subscriptionId: id, tenantId, status: data.status, planCode: data.planCode },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "subscription.create",
          resourceType: "subscription",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return enrichSubscription(row, plan);
      },
      principal.userId,
    );
  }

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.subscriptions.findMany({
        where: eq(subscriptions.tenantId, tenantId),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });
      const planIds = [...new Set(rows.map((row) => row.planId))];
      const plans =
        planIds.length > 0
          ? await tx.query.subscriptionPlans.findMany({
              where: inArray(subscriptionPlans.id, planIds),
            })
          : [];
      const planById = new Map(plans.map((plan) => [plan.id, plan]));
      return rows.map((row) => enrichSubscription(row, planById.get(row.planId)));
    });
  }

  async current(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.tenantId, tenantId),
          inArray(subscriptions.status, ["ACTIVE", "TRIAL", "GRACE", "SUSPENDED"]),
        ),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });
      if (!row) {
        throw new ForgeError("NOT_FOUND", "No current subscription");
      }
      const plan = await tx.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, row.planId),
      });
      return enrichSubscription(row, plan ?? undefined);
    });
  }

  async patch(
    tenantId: string,
    subscriptionId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.subscriptions.findFirst({
          where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Subscription not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const [updated] = await tx
          .update(subscriptions)
          .set({ ...data, recordVersion: version + 1, updatedAt: new Date() })
          .where(
            and(eq(subscriptions.id, subscriptionId), eq(subscriptions.recordVersion, version)),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: null,
          });
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "subscription",
          aggregateId: subscriptionId,
          eventType: DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
          payload: { subscriptionId, tenantId, status: updated.status },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        return updated;
      },
      principal.userId,
    );
  }

  async suspend(
    tenantId: string,
    subscriptionId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.subscriptions.findFirst({
          where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Subscription not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const now = new Date();
        const [updated] = await tx
          .update(subscriptions)
          .set({
            status: "SUSPENDED",
            suspendedAt: now,
            recordVersion: version + 1,
            updatedAt: now,
          })
          .where(
            and(eq(subscriptions.id, subscriptionId), eq(subscriptions.recordVersion, version)),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: null,
          });
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "subscription",
          aggregateId: subscriptionId,
          eventType: DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
          payload: { subscriptionId, tenantId, status: "SUSPENDED" },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        return updated;
      },
      principal.userId,
    );
  }

  async reactivate(
    tenantId: string,
    subscriptionId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.subscriptions.findFirst({
          where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Subscription not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const [updated] = await tx
          .update(subscriptions)
          .set({
            status: "ACTIVE",
            suspendedAt: null,
            recordVersion: version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(subscriptions.id, subscriptionId), eq(subscriptions.recordVersion, version)),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "subscription",
            resourceId: subscriptionId,
            expectedVersion,
            actualVersion: null,
          });
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "subscription",
          aggregateId: subscriptionId,
          eventType: DOMAIN_EVENT_TYPES.SUBSCRIPTION_CHANGED,
          payload: { subscriptionId, tenantId, status: "ACTIVE" },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        return updated;
      },
      principal.userId,
    );
  }
}
