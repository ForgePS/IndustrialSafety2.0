import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  nerisFields,
  nerisSchemaVersions,
  tenantNerisConfiguration,
  tenantNerisFieldOverlays,
  tenantNerisValueOverlays,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

const upsertConfigSchema = z.object({
  schemaVersionId: z.string().uuid().optional().nullable(),
  operatingMode: z.enum(["MANUAL_ONLY", "CAD_ENABLED", "HYBRID"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const fieldOverlaySchema = z.object({
  fieldId: z.string().uuid(),
  displayLabel: z.string().max(300).optional().nullable(),
  helpText: z.string().max(4000).optional().nullable(),
  localAlias: z.string().max(300).optional().nullable(),
  displayOrder: z.number().int().optional().nullable(),
  favorite: z.boolean().optional(),
  optionalVisible: z.boolean().optional().nullable(),
  safeDefaultJson: z.unknown().optional().nullable(),
  localValidationJson: z.unknown().optional().nullable(),
});

const valueOverlaySchema = z.object({
  valueOptionId: z.string().uuid(),
  localAlias: z.string().max(300).optional().nullable(),
  displayOrder: z.number().int().optional().nullable(),
  favorite: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

@Injectable()
export class NerisConfigurationOverlayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async getConfiguration(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(tenantNerisConfiguration)
        .where(eq(tenantNerisConfiguration.tenantId, tenantId))
        .limit(1);
      return row ?? null;
    });
  }

  async upsertConfiguration(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = upsertConfigSchema.parse(input);
    if (data.schemaVersionId) {
      const [version] = await this.db
        .select()
        .from(nerisSchemaVersions)
        .where(eq(nerisSchemaVersions.id, data.schemaVersionId))
        .limit(1);
      if (!version) throw new ForgeError("NOT_FOUND", "Schema version not found");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(tenantNerisConfiguration)
          .where(eq(tenantNerisConfiguration.tenantId, tenantId))
          .limit(1);
        const now = new Date();
        let row;
        if (existing) {
          [row] = await tx
            .update(tenantNerisConfiguration)
            .set({
              schemaVersionId:
                data.schemaVersionId === undefined
                  ? existing.schemaVersionId
                  : data.schemaVersionId,
              operatingMode: data.operatingMode ?? existing.operatingMode,
              status: data.status ?? existing.status,
              recordVersion: existing.recordVersion + 1,
              updatedByUserId: principal.userId,
              updatedAt: now,
            })
            .where(eq(tenantNerisConfiguration.id, existing.id))
            .returning();
        } else {
          [row] = await tx
            .insert(tenantNerisConfiguration)
            .values({
              id: createId(),
              tenantId,
              schemaVersionId: data.schemaVersionId ?? null,
              operatingMode: data.operatingMode ?? "MANUAL_ONLY",
              status: data.status ?? "ACTIVE",
              createdByUserId: principal.userId,
              updatedByUserId: principal.userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "tenant_neris_configuration",
          aggregateId: row!.id,
          eventType: DOMAIN_EVENT_TYPES.NERIS_OVERLAY_UPDATED,
          payload: { tenantId, configurationId: row!.id, kind: "configuration" },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "neris.overlay.configuration.upsert",
          resourceType: "tenant_neris_configuration",
          resourceId: row!.id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return row!;
      },
      principal.userId,
    );
  }

  async listFieldOverlays(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select()
        .from(tenantNerisFieldOverlays)
        .where(eq(tenantNerisFieldOverlays.tenantId, tenantId)),
    );
  }

  async upsertFieldOverlay(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = fieldOverlaySchema.parse(input);
    // Reject attempts to mutate official field keys via overlay payload extras.
    if (
      input &&
      typeof input === "object" &&
      ("fieldKey" in input || "officialCode" in input || "payloadPath" in input)
    ) {
      throw new ForgeError(
        "BAD_REQUEST",
        "Official NERIS field keys, codes, and mappings cannot be changed via overlay",
      );
    }

    const [field] = await this.db
      .select()
      .from(nerisFields)
      .where(eq(nerisFields.id, data.fieldId))
      .limit(1);
    if (!field) throw new ForgeError("NOT_FOUND", "NERIS field not found");

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const config = await this.ensureConfiguration(tx, tenantId, principal);
        const [existing] = await tx
          .select()
          .from(tenantNerisFieldOverlays)
          .where(
            and(
              eq(tenantNerisFieldOverlays.tenantId, tenantId),
              eq(tenantNerisFieldOverlays.fieldId, data.fieldId),
            ),
          )
          .limit(1);
        const now = new Date();
        let row;
        if (existing) {
          [row] = await tx
            .update(tenantNerisFieldOverlays)
            .set({
              displayLabel:
                data.displayLabel === undefined ? existing.displayLabel : data.displayLabel,
              helpText: data.helpText === undefined ? existing.helpText : data.helpText,
              localAlias: data.localAlias === undefined ? existing.localAlias : data.localAlias,
              displayOrder:
                data.displayOrder === undefined ? existing.displayOrder : data.displayOrder,
              favorite: data.favorite ?? existing.favorite,
              optionalVisible:
                data.optionalVisible === undefined
                  ? existing.optionalVisible
                  : data.optionalVisible,
              safeDefaultJson:
                data.safeDefaultJson === undefined
                  ? existing.safeDefaultJson
                  : data.safeDefaultJson,
              localValidationJson:
                data.localValidationJson === undefined
                  ? existing.localValidationJson
                  : data.localValidationJson,
              recordVersion: existing.recordVersion + 1,
              updatedAt: now,
            })
            .where(eq(tenantNerisFieldOverlays.id, existing.id))
            .returning();
        } else {
          [row] = await tx
            .insert(tenantNerisFieldOverlays)
            .values({
              id: createId(),
              tenantId,
              configurationId: config.id,
              fieldId: data.fieldId,
              displayLabel: data.displayLabel ?? null,
              helpText: data.helpText ?? null,
              localAlias: data.localAlias ?? null,
              displayOrder: data.displayOrder ?? null,
              favorite: data.favorite ?? false,
              optionalVisible: data.optionalVisible ?? null,
              safeDefaultJson: data.safeDefaultJson ?? null,
              localValidationJson: data.localValidationJson ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "tenant_neris_field_overlay",
          aggregateId: row!.id,
          eventType: DOMAIN_EVENT_TYPES.NERIS_OVERLAY_UPDATED,
          payload: { tenantId, fieldId: data.fieldId, kind: "field_overlay" },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "neris.overlay.field.upsert",
          resourceType: "tenant_neris_field_overlay",
          resourceId: row!.id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return row!;
      },
      principal.userId,
    );
  }

  async upsertValueOverlay(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = valueOverlaySchema.parse(input);
    if (input && typeof input === "object" && ("code" in input || "officialCode" in input)) {
      throw new ForgeError(
        "BAD_REQUEST",
        "Official NERIS option codes cannot be changed via overlay",
      );
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const config = await this.ensureConfiguration(tx, tenantId, principal);
        const [existing] = await tx
          .select()
          .from(tenantNerisValueOverlays)
          .where(
            and(
              eq(tenantNerisValueOverlays.tenantId, tenantId),
              eq(tenantNerisValueOverlays.valueOptionId, data.valueOptionId),
            ),
          )
          .limit(1);
        const now = new Date();
        let row;
        if (existing) {
          [row] = await tx
            .update(tenantNerisValueOverlays)
            .set({
              localAlias: data.localAlias === undefined ? existing.localAlias : data.localAlias,
              displayOrder:
                data.displayOrder === undefined ? existing.displayOrder : data.displayOrder,
              favorite: data.favorite ?? existing.favorite,
              notes: data.notes === undefined ? existing.notes : data.notes,
              recordVersion: existing.recordVersion + 1,
              updatedAt: now,
            })
            .where(eq(tenantNerisValueOverlays.id, existing.id))
            .returning();
        } else {
          [row] = await tx
            .insert(tenantNerisValueOverlays)
            .values({
              id: createId(),
              tenantId,
              configurationId: config.id,
              valueOptionId: data.valueOptionId,
              localAlias: data.localAlias ?? null,
              displayOrder: data.displayOrder ?? null,
              favorite: data.favorite ?? false,
              notes: data.notes ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "tenant_neris_value_overlay",
          aggregateId: row!.id,
          eventType: DOMAIN_EVENT_TYPES.NERIS_OVERLAY_UPDATED,
          payload: { tenantId, valueOptionId: data.valueOptionId, kind: "value_overlay" },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        return row!;
      },
      principal.userId,
    );
  }

  private async ensureConfiguration(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    principal: ForgePrincipal,
  ) {
    const [existing] = await tx
      .select()
      .from(tenantNerisConfiguration)
      .where(eq(tenantNerisConfiguration.tenantId, tenantId))
      .limit(1);
    if (existing) return existing;
    const now = new Date();
    const [created] = await tx
      .insert(tenantNerisConfiguration)
      .values({
        id: createId(),
        tenantId,
        operatingMode: "MANUAL_ONLY",
        status: "ACTIVE",
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created!;
  }
}
