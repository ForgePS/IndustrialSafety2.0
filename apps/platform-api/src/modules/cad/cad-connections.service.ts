import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  CAD_AUDIT_ACTIONS,
  CAD_FEATURE_FLAGS,
  CAD_TRANSPORT_IMPLEMENTATION_STATUS,
  createCadConnectionInputSchema,
  patchCadConnectionInputSchema,
  type CadTransportType,
} from "@forge/cad-contracts";
import {
  cadConnections,
  cadConflicts,
  cadIncidentLinks,
  cadPersonnelMappings,
  cadRawMessages,
  cadUnitMappings,
  cadUnknownPersonnel,
  cadUnknownUnits,
  cadUnmappedValues,
  cadWebhookKeys,
  createId,
  featureDefinitions,
  featureOverrides,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { resolveFeatureValue } from "@forge/authorization";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

function publicConnectionId(): string {
  return `cad_${randomBytes(12).toString("hex")}`;
}

const resolveUnmappedSchema = z.object({
  resolutionReason: z.string().min(1).max(2000),
  recordVersion: z.number().int().positive(),
  status: z.enum(["MAPPED", "IGNORED_WITH_REASON", "ESCALATED"]).default("MAPPED"),
});

const resolveUnknownSchema = z.object({
  resolutionReason: z.string().min(1).max(2000),
  recordVersion: z.number().int().positive(),
  status: z.enum(["MAPPED", "IGNORED_WITH_REASON", "ESCALATED"]),
  forgeApparatusId: z.string().uuid().optional().nullable(),
  forgeUnitId: z.string().uuid().optional().nullable(),
  forgePersonId: z.string().uuid().optional().nullable(),
  forgePersonnelId: z.string().uuid().optional().nullable(),
  mappingType: z.string().min(1).max(40).optional(),
  externalAgency: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const rotateSecretSchema = z.object({
  reason: z.string().min(1).max(2000),
});

@Injectable()
export class CadConnectionsService {
  private readonly sqs: SQSClient;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly audit: AuditService,
  ) {
    this.sqs = new SQSClient({ region: env.AWS_REGION });
  }

  async assertCadEnabled(tenantId: string): Promise<void> {
    const enabled = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.ENABLED);
    if (!enabled) {
      throw new ForgeError("FORBIDDEN", "CAD is not enabled for this tenant");
    }
  }

  async list(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(cadConnections)
        .where(and(eq(cadConnections.tenantId, tenantId), isNull(cadConnections.archivedAt)))
        .orderBy(desc(cadConnections.updatedAt));
      return rows.map(sanitizeConnection);
    });
  }

  async get(tenantId: string, connectionId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.cadConnections.findFirst({
        where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, connectionId)),
      });
      if (!row || row.archivedAt) throw new ForgeError("NOT_FOUND", "CAD connection not found");
      return sanitizeConnection(row);
    });
  }

  async create(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    const data = createCadConnectionInputSchema.parse(body);
    assertTransportImplemented(data.transportType);
    if (data.environment === "PRODUCTION") {
      throw new ForgeError(
        "BAD_REQUEST",
        "PRODUCTION CAD connections cannot be created in Phase 4 development",
      );
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(cadConnections)
          .values({
            id,
            tenantId,
            publicId: publicConnectionId(),
            name: data.name,
            description: data.description ?? null,
            vendor: data.vendor,
            adapterKey: data.adapterKey,
            adapterVersion: data.adapterVersion,
            environment: data.environment,
            transportType: data.transportType,
            status: "DRAFT",
            intakeMode: data.intakeMode ?? "HYBRID",
            configurationJson: data.configurationJson,
            mappingProfileId: data.mappingProfileId ?? null,
            pollingIntervalSeconds: data.pollingIntervalSeconds ?? null,
            expectedOperatingWindowJson: data.expectedOperatingWindowJson ?? null,
            quietHoursJson: data.quietHoursJson ?? null,
            healthStatus: "UNKNOWN",
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.CONNECTION_CREATED,
          resourceType: "cad_connection",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: sanitizeConnection(row!),
        });

        return sanitizeConnection(row!);
      },
      principal.userId,
    );
  }

  async patch(tenantId: string, connectionId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    const data = patchCadConnectionInputSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.cadConnections.findFirst({
          where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, connectionId)),
        });
        if (!existing || existing.archivedAt) {
          throw new ForgeError("NOT_FOUND", "CAD connection not found");
        }
        if (existing.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Connection record version mismatch");
        }
        if (data.environment === "PRODUCTION" || existing.environment === "PRODUCTION") {
          throw new ForgeError(
            "BAD_REQUEST",
            "PRODUCTION CAD connections remain disabled in Phase 4 development",
          );
        }
        if (data.transportType) assertTransportImplemented(data.transportType);

        const [updated] = await tx
          .update(cadConnections)
          .set({
            name: data.name ?? existing.name,
            description: data.description === undefined ? existing.description : data.description,
            vendor: data.vendor ?? existing.vendor,
            adapterKey: data.adapterKey ?? existing.adapterKey,
            adapterVersion: data.adapterVersion ?? existing.adapterVersion,
            environment: data.environment ?? existing.environment,
            transportType: data.transportType ?? existing.transportType,
            intakeMode: data.intakeMode ?? existing.intakeMode,
            configurationJson: data.configurationJson ?? existing.configurationJson,
            mappingProfileId:
              data.mappingProfileId === undefined
                ? existing.mappingProfileId
                : data.mappingProfileId,
            pollingIntervalSeconds:
              data.pollingIntervalSeconds === undefined
                ? existing.pollingIntervalSeconds
                : data.pollingIntervalSeconds,
            expectedOperatingWindowJson:
              data.expectedOperatingWindowJson === undefined
                ? existing.expectedOperatingWindowJson
                : data.expectedOperatingWindowJson,
            quietHoursJson:
              data.quietHoursJson === undefined ? existing.quietHoursJson : data.quietHoursJson,
            status: data.status ?? existing.status,
            updatedByUserId: principal.userId,
            recordVersion: existing.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadConnections.id, connectionId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.CONNECTION_UPDATED,
          resourceType: "cad_connection",
          resourceId: connectionId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before: sanitizeConnection(existing),
          after: sanitizeConnection(updated!),
        });

        return sanitizeConnection(updated!);
      },
      principal.userId,
    );
  }

  async enable(tenantId: string, connectionId: string, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    return this.setEnabled(tenantId, connectionId, principal, true);
  }

  async disable(tenantId: string, connectionId: string, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    return this.setEnabled(tenantId, connectionId, principal, false);
  }

  async test(tenantId: string, connectionId: string, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadConnections.findFirst({
          where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, connectionId)),
        });
        if (!row || row.archivedAt) throw new ForgeError("NOT_FOUND", "CAD connection not found");

        const [updated] = await tx
          .update(cadConnections)
          .set({
            healthStatus: "HEALTHY",
            lastConnectedAt: new Date(),
            lastSuccessAt: new Date(),
            status: row.status === "DRAFT" ? "TESTING" : row.status,
            updatedByUserId: principal.userId,
            recordVersion: row.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadConnections.id, connectionId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.CONNECTION_TESTED,
          resourceType: "cad_connection",
          resourceId: connectionId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { healthStatus: "HEALTHY" },
        });

        return {
          healthy: true,
          status: "HEALTHY",
          checkedAt: new Date().toISOString(),
          connection: sanitizeConnection(updated!),
        };
      },
      principal.userId,
    );
  }

  async rotateSecret(
    tenantId: string,
    connectionId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = rotateSecretSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadConnections.findFirst({
          where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, connectionId)),
        });
        if (!row || row.archivedAt) throw new ForgeError("NOT_FOUND", "CAD connection not found");

        const now = new Date();
        await tx
          .update(cadWebhookKeys)
          .set({
            role: "PREVIOUS",
            activeUntil: now,
          })
          .where(
            and(
              eq(cadWebhookKeys.tenantId, tenantId),
              eq(cadWebhookKeys.cadConnectionId, connectionId),
              eq(cadWebhookKeys.role, "CURRENT"),
            ),
          );

        const keyId = `wk_${randomBytes(8).toString("hex")}`;
        const secretArn = `pending:cad-webhook:${connectionId}:${keyId}`;
        await tx.insert(cadWebhookKeys).values({
          id: createId(),
          tenantId,
          cadConnectionId: connectionId,
          keyId,
          secretArn,
          role: "CURRENT",
          activeFrom: now,
          rotatedByUserId: principal.userId,
          rotationReason: data.reason,
          createdAt: now,
        });

        const [updated] = await tx
          .update(cadConnections)
          .set({
            webhookKeyId: keyId,
            webhookSecretArn: secretArn,
            updatedByUserId: principal.userId,
            recordVersion: row.recordVersion + 1,
            updatedAt: now,
          })
          .where(eq(cadConnections.id, connectionId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.SECRET_ROTATED,
          resourceType: "cad_connection",
          resourceId: connectionId,
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { webhookKeyId: keyId, secretProvisioned: false },
          metadata: {
            note: "Key metadata rotated; secret value must be provisioned outside API responses",
          },
        });

        return {
          webhookKeyId: keyId,
          secretProvisioned: false,
          connection: sanitizeConnection(updated!),
        };
      },
      principal.userId,
    );
  }

  async operationsSummary(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    const operationsEnabled = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.OPERATIONS);
    if (!operationsEnabled) {
      throw new ForgeError("FORBIDDEN", "CAD operations dashboard is not enabled");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const connections = await tx
        .select()
        .from(cadConnections)
        .where(and(eq(cadConnections.tenantId, tenantId), isNull(cadConnections.archivedAt)));

      const messageCounts = await tx
        .select({
          processingStatus: cadRawMessages.processingStatus,
          total: count(),
        })
        .from(cadRawMessages)
        .where(eq(cadRawMessages.tenantId, tenantId))
        .groupBy(cadRawMessages.processingStatus);

      const openConflicts = await tx
        .select({ total: count() })
        .from(cadConflicts)
        .where(and(eq(cadConflicts.tenantId, tenantId), eq(cadConflicts.status, "OPEN")));

      const unmapped = await tx
        .select({ total: count() })
        .from(cadUnmappedValues)
        .where(and(eq(cadUnmappedValues.tenantId, tenantId), eq(cadUnmappedValues.status, "OPEN")));

      const unknownUnits = await tx
        .select({ total: count() })
        .from(cadUnknownUnits)
        .where(and(eq(cadUnknownUnits.tenantId, tenantId), eq(cadUnknownUnits.status, "OPEN")));

      const unknownPersonnel = await tx
        .select({ total: count() })
        .from(cadUnknownPersonnel)
        .where(
          and(eq(cadUnknownPersonnel.tenantId, tenantId), eq(cadUnknownPersonnel.status, "OPEN")),
        );

      const linked = await tx
        .select({ total: count() })
        .from(cadIncidentLinks)
        .where(
          and(eq(cadIncidentLinks.tenantId, tenantId), eq(cadIncidentLinks.linkStatus, "ACTIVE")),
        );

      const byStatus = Object.fromEntries(
        messageCounts.map((row) => [row.processingStatus, Number(row.total)]),
      );

      return {
        connections: connections.map(sanitizeConnection),
        messages: {
          received: sumStatuses(byStatus, [
            "RECEIVED",
            "PERSISTED",
            "QUEUED",
            "NORMALIZING",
            "NORMALIZED",
            "MATCHING",
            "APPLYING",
            "APPLIED",
            "DUPLICATE",
            "REQUIRES_REVIEW",
            "FAILED",
            "DEAD_LETTER",
            "QUARANTINED",
          ]),
          applied: byStatus.APPLIED ?? 0,
          duplicates: byStatus.DUPLICATE ?? 0,
          failed: byStatus.FAILED ?? 0,
          deadLetter: byStatus.DEAD_LETTER ?? 0,
          requiresReview: byStatus.REQUIRES_REVIEW ?? 0,
          byStatus,
        },
        openConflicts: Number(openConflicts[0]?.total ?? 0),
        unmappedValues: Number(unmapped[0]?.total ?? 0),
        unknownUnits: Number(unknownUnits[0]?.total ?? 0),
        unknownPersonnel: Number(unknownPersonnel[0]?.total ?? 0),
        activeLinks: Number(linked[0]?.total ?? 0),
      };
    });
  }

  async listUnmapped(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadUnmappedValues)
        .where(eq(cadUnmappedValues.tenantId, tenantId))
        .orderBy(desc(cadUnmappedValues.lastSeenAt))
        .limit(200);
    });
  }

  async resolveUnmapped(
    tenantId: string,
    unmappedId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = resolveUnmappedSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadUnmappedValues.findFirst({
          where: and(
            eq(cadUnmappedValues.tenantId, tenantId),
            eq(cadUnmappedValues.id, unmappedId),
          ),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "Unmapped value not found");
        if (row.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Unmapped value record version mismatch");
        }

        const [updated] = await tx
          .update(cadUnmappedValues)
          .set({
            status: data.status,
            resolutionReason: data.resolutionReason,
            resolvedAt: new Date(),
            resolvedByUserId: principal.userId,
            recordVersion: row.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadUnmappedValues.id, unmappedId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.UNMAPPED_VALUE_RESOLVED,
          resourceType: "cad_unmapped_value",
          resourceId: unmappedId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: updated,
        });

        return updated;
      },
      principal.userId,
    );
  }

  async listUnknownUnits(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadUnknownUnits)
        .where(eq(cadUnknownUnits.tenantId, tenantId))
        .orderBy(desc(cadUnknownUnits.lastSeenAt))
        .limit(200);
    });
  }

  async listUnknownPersonnel(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadUnknownPersonnel)
        .where(eq(cadUnknownPersonnel.tenantId, tenantId))
        .orderBy(desc(cadUnknownPersonnel.lastSeenAt))
        .limit(200);
    });
  }

  async resolveUnknownUnit(
    tenantId: string,
    unknownId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = resolveUnknownSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadUnknownUnits.findFirst({
          where: and(eq(cadUnknownUnits.tenantId, tenantId), eq(cadUnknownUnits.id, unknownId)),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "Unknown unit not found");
        if (row.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Unknown unit record version mismatch");
        }

        let mappingId: string | null = null;
        if (data.status === "MAPPED") {
          mappingId = createId();
          await tx.insert(cadUnitMappings).values({
            id: mappingId,
            tenantId,
            cadConnectionId: row.cadConnectionId,
            sourceUnitId: row.sourceUnitId,
            sourceUnitCallsign: row.sourceUnitCallsign,
            forgeApparatusId: data.forgeApparatusId ?? null,
            forgeUnitId: data.forgeUnitId ?? null,
            mappingType: data.mappingType ?? "APPARATUS",
            externalAgency: data.externalAgency ?? false,
            notes: data.notes ?? null,
            status: "ACTIVE",
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        const [updated] = await tx
          .update(cadUnknownUnits)
          .set({
            status: data.status,
            resolutionReason: data.resolutionReason,
            resolvedMappingId: mappingId,
            assignedReviewerUserId: principal.userId,
            recordVersion: row.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadUnknownUnits.id, unknownId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.UNIT_MAPPED,
          resourceType: "cad_unknown_unit",
          resourceId: unknownId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: updated,
        });

        return updated;
      },
      principal.userId,
    );
  }

  async resolveUnknownPersonnel(
    tenantId: string,
    unknownId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = resolveUnknownSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadUnknownPersonnel.findFirst({
          where: and(
            eq(cadUnknownPersonnel.tenantId, tenantId),
            eq(cadUnknownPersonnel.id, unknownId),
          ),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "Unknown personnel not found");
        if (row.recordVersion !== data.recordVersion) {
          throw new ForgeError("CONFLICT", "Unknown personnel record version mismatch");
        }

        let mappingId: string | null = null;
        if (data.status === "MAPPED") {
          mappingId = createId();
          await tx.insert(cadPersonnelMappings).values({
            id: mappingId,
            tenantId,
            cadConnectionId: row.cadConnectionId,
            sourcePersonnelId: row.sourcePersonnelId,
            sourceName: row.sourceName,
            forgePersonId: data.forgePersonId ?? null,
            forgePersonnelId: data.forgePersonnelId ?? null,
            mappingType: data.mappingType ?? "PERSONNEL",
            externalAgency: data.externalAgency ?? false,
            notes: data.notes ?? null,
            status: "ACTIVE",
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        const [updated] = await tx
          .update(cadUnknownPersonnel)
          .set({
            status: data.status,
            resolutionReason: data.resolutionReason,
            resolvedMappingId: mappingId,
            assignedReviewerUserId: principal.userId,
            recordVersion: row.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadUnknownPersonnel.id, unknownId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.PERSONNEL_MAPPED,
          resourceType: "cad_unknown_personnel",
          resourceId: unknownId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: updated,
        });

        return updated;
      },
      principal.userId,
    );
  }

  async listUnitMappings(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadUnitMappings)
        .where(eq(cadUnitMappings.tenantId, tenantId))
        .orderBy(desc(cadUnitMappings.updatedAt))
        .limit(200);
    });
  }

  async listPersonnelMappings(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadPersonnelMappings)
        .where(eq(cadPersonnelMappings.tenantId, tenantId))
        .orderBy(desc(cadPersonnelMappings.updatedAt))
        .limit(200);
    });
  }

  async listMessages(tenantId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select({
          id: cadRawMessages.id,
          receivedAt: cadRawMessages.receivedAt,
          transportType: cadRawMessages.transportType,
          sourceMessageId: cadRawMessages.sourceMessageId,
          sourceIncidentId: cadRawMessages.sourceIncidentId,
          processingStatus: cadRawMessages.processingStatus,
          authenticationStatus: cadRawMessages.authenticationStatus,
          payloadSizeBytes: cadRawMessages.payloadSizeBytes,
          payloadHash: cadRawMessages.payloadHash,
          processingAttempts: cadRawMessages.processingAttempts,
          correlationId: cadRawMessages.correlationId,
          cadConnectionId: cadRawMessages.cadConnectionId,
        })
        .from(cadRawMessages)
        .where(eq(cadRawMessages.tenantId, tenantId))
        .orderBy(desc(cadRawMessages.receivedAt))
        .limit(100);
    });
  }

  async incidentCadStatus(tenantId: string, incidentId: string) {
    await this.assertCadEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const links = await tx.query.cadIncidentLinks.findMany({
        where: and(
          eq(cadIncidentLinks.tenantId, tenantId),
          eq(cadIncidentLinks.incidentId, incidentId),
        ),
        orderBy: (t, { desc: d }) => [d(t.updatedAt)],
        limit: 20,
      });
      const conflicts = await tx
        .select()
        .from(cadConflicts)
        .where(
          and(
            eq(cadConflicts.tenantId, tenantId),
            eq(cadConflicts.incidentId, incidentId),
            eq(cadConflicts.status, "OPEN"),
          ),
        )
        .orderBy(desc(cadConflicts.createdAt))
        .limit(50);

      return {
        links,
        openConflicts: conflicts,
        operatingHints: {
          linked: links.some((link) => link.linkStatus === "ACTIVE"),
          conflictCount: conflicts.length,
        },
      };
    });
  }

  async reprocessMessage(
    tenantId: string,
    rawMessageId: string,
    body: unknown,
    principal: ForgePrincipal,
  ) {
    await this.assertCadEnabled(tenantId);
    const data = z
      .object({
        reason: z.string().min(1).max(2000),
      })
      .parse(body);

    const queueUrl = this.env.SQS_CAD_INTAKE_QUEUE_URL;
    if (!queueUrl) {
      throw new ForgeError("BAD_REQUEST", "CAD intake queue is not configured");
    }

    const message = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadRawMessages.findFirst({
          where: and(eq(cadRawMessages.tenantId, tenantId), eq(cadRawMessages.id, rawMessageId)),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "CAD message not found");

        await tx
          .update(cadRawMessages)
          .set({
            processingStatus: "QUEUED",
            currentProcessingStage: "INTAKE",
            processingAttempts: row.processingAttempts + 1,
            lastProcessingErrorCode: null,
            lastProcessingErrorSummary: null,
          })
          .where(eq(cadRawMessages.id, rawMessageId));

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.MESSAGE_REPROCESSED,
          resourceType: "cad_raw_message",
          resourceId: rawMessageId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { reason: data.reason },
        });

        return row;
      },
      principal.userId,
    );

    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          type: "cad.intake.normalize.v1",
          tenantId,
          connectionId: message.cadConnectionId,
          rawMessageId,
          correlationId: principal.correlationId,
          idempotencyKey: `${message.idempotencyKey}:reprocess:${message.processingAttempts + 1}`,
        }),
      }),
    );

    return {
      accepted: true,
      rawMessageId,
      processingAttempts: message.processingAttempts + 1,
      payloadHash: message.payloadHash,
      sourceMessageId: message.sourceMessageId,
      correlationId: principal.correlationId,
    };
  }

  async replayMessages(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertCadEnabled(tenantId);
    const data = z
      .object({
        rawMessageIds: z.array(z.string().uuid()).min(1).max(50),
        reason: z.string().min(1).max(2000),
      })
      .parse(body);

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.REPLAY_STARTED,
          resourceType: "cad_replay",
          resourceId: createId(),
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { count: data.rawMessageIds.length, reason: data.reason },
        });
      },
      principal.userId,
    );

    let replayedCount = 0;
    let skippedCount = 0;
    for (const id of data.rawMessageIds) {
      try {
        await this.reprocessMessage(tenantId, id, { reason: data.reason }, principal);
        replayedCount += 1;
      } catch {
        skippedCount += 1;
      }
    }

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.REPLAY_COMPLETED,
          resourceType: "cad_replay",
          resourceId: createId(),
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { replayedCount, skippedCount },
        });
      },
      principal.userId,
    );

    return {
      accepted: true,
      replayedCount,
      skippedCount,
      correlationId: principal.correlationId,
    };
  }

  private async setEnabled(
    tenantId: string,
    connectionId: string,
    principal: ForgePrincipal,
    enable: boolean,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const existing = await tx.query.cadConnections.findFirst({
          where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, connectionId)),
        });
        if (!existing || existing.archivedAt) {
          throw new ForgeError("NOT_FOUND", "CAD connection not found");
        }
        if (existing.environment === "PRODUCTION") {
          throw new ForgeError(
            "BAD_REQUEST",
            "PRODUCTION CAD connections cannot be enabled in Phase 4 development",
          );
        }

        const [updated] = await tx
          .update(cadConnections)
          .set({
            status: enable ? "ACTIVE" : "DISABLED",
            enabledAt: enable ? new Date() : existing.enabledAt,
            disabledAt: enable ? null : new Date(),
            updatedByUserId: principal.userId,
            recordVersion: existing.recordVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(cadConnections.id, connectionId))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: enable
            ? CAD_AUDIT_ACTIONS.CONNECTION_ENABLED
            : CAD_AUDIT_ACTIONS.CONNECTION_DISABLED,
          resourceType: "cad_connection",
          resourceId: connectionId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: sanitizeConnection(updated!),
        });

        return sanitizeConnection(updated!);
      },
      principal.userId,
    );
  }

  private async resolveFlag(tenantId: string, key: string): Promise<boolean> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const def = await tx.query.featureDefinitions.findFirst({
        where: eq(featureDefinitions.key, key),
      });
      if (!def) return false;
      const overrides = await tx.query.featureOverrides.findMany({
        where: and(
          eq(featureOverrides.tenantId, tenantId),
          eq(featureOverrides.featureDefinitionId, def.id),
          isNull(featureOverrides.organizationId),
          isNull(featureOverrides.userId),
        ),
      });
      return (
        resolveFeatureValue({
          tenant: overrides[0]?.valueJson as unknown,
          defaultValue: def.defaultValueJson as unknown,
        }) === true
      );
    });
  }
}

function assertTransportImplemented(transport: CadTransportType): void {
  if (CAD_TRANSPORT_IMPLEMENTATION_STATUS[transport] === "NOT_IMPLEMENTED") {
    throw new ForgeError("BAD_REQUEST", `Transport ${transport} is not implemented in Phase 4`);
  }
}

function sanitizeConnection<T extends Record<string, unknown>>(row: T) {
  const {
    credentialsSecretArn: _c,
    webhookSecretArn: _w,
    configurationJson,
    ...rest
  } = row as T & {
    credentialsSecretArn?: string | null;
    webhookSecretArn?: string | null;
    configurationJson?: Record<string, unknown>;
  };
  return {
    ...rest,
    configurationJson: configurationJson ?? {},
    hasCredentialsSecret: Boolean(_c),
    hasWebhookSecret: Boolean(_w),
  };
}

function sumStatuses(byStatus: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (byStatus[key] ?? 0), 0);
}
