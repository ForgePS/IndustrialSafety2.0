import { Inject, Injectable } from "@nestjs/common";
import { resolveFeatureValue } from "@forge/authorization";
import {
  createId,
  featureDefinitions,
  featureOverrides,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

const putSchema = z.object({
  value: z.unknown(),
  reason: z.string().max(2000).optional(),
  organizationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async listDefinitions() {
    return this.db.query.featureDefinitions.findMany({
      where: eq(featureDefinitions.status, "ACTIVE"),
      orderBy: (t, { asc }) => [asc(t.key)],
    });
  }

  async effective(tenantId: string, principal: ForgePrincipal) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const defs = await tx.query.featureDefinitions.findMany({
        where: eq(featureDefinitions.status, "ACTIVE"),
      });
      const overrides = await tx.query.featureOverrides.findMany({
        where: eq(featureOverrides.tenantId, tenantId),
      });

      return defs.map((def) => {
        const userOv = overrides.find(
          (o) => o.featureDefinitionId === def.id && o.userId === principal.userId,
        );
        const orgOv = overrides.find(
          (o) =>
            o.featureDefinitionId === def.id &&
            o.organizationId &&
            principal.organizationIds.includes(o.organizationId) &&
            !o.userId,
        );
        const tenantOv = overrides.find(
          (o) =>
            o.featureDefinitionId === def.id &&
            !o.organizationId &&
            !o.userId &&
            o.tenantId === tenantId,
        );
        const value = resolveFeatureValue({
          user: userOv?.valueJson as unknown,
          organization: orgOv?.valueJson as unknown,
          tenant: tenantOv?.valueJson as unknown,
          defaultValue: def.defaultValueJson as unknown,
        });
        // overridden = an explicit tenant/org/user override exists (vs. definition default).
        // Consumers that treat entitlements as the control plane use this to avoid
        // hiding entitled surfaces just because a definition default is off.
        const overridden = Boolean(userOv || orgOv || tenantOv);
        return { key: def.key, name: def.name, value, valueType: def.valueType, overridden };
      });
    }, principal.userId);
  }

  async put(
    tenantId: string,
    featureKey: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = putSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const def = await tx.query.featureDefinitions.findFirst({
        where: eq(featureDefinitions.key, featureKey),
      });
      if (!def) {
        throw new ForgeError("NOT_FOUND", "Feature definition not found");
      }
      const existing = await tx.query.featureOverrides.findFirst({
        where: and(
          eq(featureOverrides.tenantId, tenantId),
          eq(featureOverrides.featureDefinitionId, def.id),
          data.userId
            ? eq(featureOverrides.userId, data.userId)
            : isNull(featureOverrides.userId),
          data.organizationId
            ? eq(featureOverrides.organizationId, data.organizationId)
            : isNull(featureOverrides.organizationId),
        ),
      });
      const now = new Date();
      let row;
      if (existing) {
        // Upsert update path: bump recordVersion without If-Match.
        [row] = await tx
          .update(featureOverrides)
          .set({
            valueJson: data.value as object,
            reason: data.reason,
            recordVersion: sql`${featureOverrides.recordVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(featureOverrides.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(featureOverrides)
          .values({
            id: createId(),
            tenantId,
            organizationId: data.organizationId,
            userId: data.userId,
            featureDefinitionId: def.id,
            valueJson: data.value as object,
            reason: data.reason,
            createdByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }
      if (!row) {
        throw new Error("Failed to upsert feature override");
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "feature_override",
        aggregateId: row.id,
        eventType: DOMAIN_EVENT_TYPES.FEATURE_CHANGED,
        payload: { tenantId, featureKey, value: data.value },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "feature.put",
        resourceType: "feature_override",
        resourceId: row.id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: row,
      });
      return row;
    }, principal.userId);
  }

  async remove(tenantId: string, featureKey: string, principal: ForgePrincipal) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const def = await tx.query.featureDefinitions.findFirst({
        where: eq(featureDefinitions.key, featureKey),
      });
      if (!def) {
        throw new ForgeError("NOT_FOUND", "Feature definition not found");
      }
      const existing = await tx.query.featureOverrides.findFirst({
        where: and(
          eq(featureOverrides.tenantId, tenantId),
          eq(featureOverrides.featureDefinitionId, def.id),
          isNull(featureOverrides.userId),
          isNull(featureOverrides.organizationId),
        ),
      });
      if (!existing) {
        throw new ForgeError("NOT_FOUND", "Feature override not found");
      }
      await tx.delete(featureOverrides).where(eq(featureOverrides.id, existing.id));
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "feature_override",
        aggregateId: existing.id,
        eventType: DOMAIN_EVENT_TYPES.FEATURE_CHANGED,
        payload: { tenantId, featureKey, deleted: true },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      return { deleted: true, featureKey };
    }, principal.userId);
  }
}
