import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { CAD_AUDIT_ACTIONS, CAD_FEATURE_FLAGS } from "@forge/cad-contracts";
import {
  buildCadSimulatorPayload,
  listCadSimulatorScenarios,
  signCadSimulatorWebhook,
} from "@forge/cad-simulator";
import {
  cadConnectionHealthLogs,
  cadConnectionOutages,
  cadConnections,
  cadRawMessages,
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
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { CadWebhookService } from "./cad-webhook.service.js";

const sendSchema = z.object({
  connectionId: z.string().uuid(),
  scenarioId: z.string().min(1).max(80),
  sourceIncidentId: z.string().min(1).max(200).optional(),
  sourceIncidentNumber: z.string().max(120).optional(),
  sourceSequence: z.number().int().positive().optional(),
  overrides: z.record(z.unknown()).optional(),
  delivery: z.enum(["WEBHOOK", "DIRECT_QUEUE"]).default("WEBHOOK"),
});

const outageSchema = z.object({
  connectionId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

const quarantineSchema = z.object({
  rawMessageId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

@Injectable()
export class CadSimulatorService {
  private readonly sqs: SQSClient;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly audit: AuditService,
    private readonly webhooks: CadWebhookService,
  ) {
    this.sqs = new SQSClient({ region: env.AWS_REGION });
  }

  listScenarios(tenantId: string) {
    return this.withSimulatorEnabled(tenantId, async () => listCadSimulatorScenarios());
  }

  async send(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertSimulatorEnabled(tenantId);
    const data = sendSchema.parse(body);
    const correlationId = principal.correlationId || randomUUID();

    const connection = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.cadConnections.findFirst({
        where: and(eq(cadConnections.tenantId, tenantId), eq(cadConnections.id, data.connectionId)),
      });
    });
    if (!connection || connection.archivedAt) {
      throw new ForgeError("NOT_FOUND", "CAD connection not found");
    }
    if (connection.environment === "PRODUCTION") {
      throw new ForgeError("BAD_REQUEST", "Simulator cannot target PRODUCTION connections");
    }

    const payloadInput: Parameters<typeof buildCadSimulatorPayload>[0] = {
      scenarioId: data.scenarioId,
    };
    if (data.sourceIncidentId) payloadInput.sourceIncidentId = data.sourceIncidentId;
    if (data.sourceIncidentNumber) payloadInput.sourceIncidentNumber = data.sourceIncidentNumber;
    if (data.sourceSequence != null) payloadInput.sourceSequence = data.sourceSequence;
    if (data.overrides) payloadInput.overrides = data.overrides;
    const payload = buildCadSimulatorPayload(payloadInput);

    if (data.delivery === "WEBHOOK") {
      const secret = resolveLocalSecret(
        this.env.CAD_WEBHOOK_SECRET_OVERRIDES_JSON ?? "",
        connection.publicId,
      );
      if (!secret) {
        throw new ForgeError(
          "BAD_REQUEST",
          "No local webhook secret override for connection publicId; use delivery DIRECT_QUEUE or set CAD_WEBHOOK_SECRET_OVERRIDES_JSON",
        );
      }
      const signed = signCadSimulatorWebhook({
        payload,
        secret,
        keyId: connection.webhookKeyId ?? "default",
      });
      const result = await this.webhooks.ingest({
        connectionPublicId: connection.publicId,
        headers: signed.headers,
        rawBody: signed.body,
        contentType: "application/json",
        correlationId,
        requestId: principal.requestId,
      });
      await this.writeHealthLog(
        tenantId,
        connection.id,
        "SIMULATOR",
        "HEALTHY",
        "Simulator webhook send",
      );
      return {
        delivery: "WEBHOOK",
        scenarioId: data.scenarioId,
        payloadPreview: {
          eventType: payload.eventType,
          sourceIncidentId: payload.sourceIncidentId,
          sourceMessageId: payload.sourceMessageId,
        },
        webhookResult: result,
      };
    }

    const rawMessageId = createId();
    const bodyBuf = Buffer.from(JSON.stringify(payload), "utf8");
    const payloadHash = createHash("sha256").update(bodyBuf).digest("hex");
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx.insert(cadRawMessages).values({
          id: rawMessageId,
          tenantId,
          cadConnectionId: connection.id,
          receivedAt: now,
          transportType: "SYNTHETIC_SIMULATOR",
          sourceMessageId:
            typeof payload.sourceMessageId === "string" ? payload.sourceMessageId : null,
          sourceIncidentId:
            typeof payload.sourceIncidentId === "string" ? payload.sourceIncidentId : null,
          contentType: "application/json",
          processingStatus: "PERSISTED",
          authenticationStatus: "VALID",
          signatureValid: true,
          payloadSizeBytes: bodyBuf.byteLength,
          payloadHash,
          payloadStorageType: "INLINE_ENCRYPTED",
          inlinePayloadEncrypted: bodyBuf,
          idempotencyKey: `sim:${rawMessageId}`,
          acknowledgementStatus: "ACCEPTED",
          acknowledgedAt: now,
          correlationId,
          createdAt: now,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.MESSAGE_RECEIVED,
          resourceType: "cad_raw_message",
          resourceId: rawMessageId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId,
          requestId: principal.requestId,
          after: { delivery: "DIRECT_QUEUE", scenarioId: data.scenarioId },
        });
      },
      principal.userId,
    );

    const queueUrl = this.env.SQS_CAD_INTAKE_QUEUE_URL;
    if (queueUrl) {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: "cad.intake.normalize.v1",
            tenantId,
            connectionId: connection.id,
            rawMessageId,
            correlationId,
            idempotencyKey: `sim:${rawMessageId}`,
          }),
        }),
      );
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        await tx
          .update(cadRawMessages)
          .set({ processingStatus: "QUEUED", currentProcessingStage: "INTAKE" })
          .where(eq(cadRawMessages.id, rawMessageId));
      });
    }

    await this.writeHealthLog(
      tenantId,
      connection.id,
      "SIMULATOR",
      "HEALTHY",
      "Simulator direct queue send",
    );
    return {
      delivery: "DIRECT_QUEUE",
      scenarioId: data.scenarioId,
      rawMessageId,
      payloadPreview: {
        eventType: payload.eventType,
        sourceIncidentId: payload.sourceIncidentId,
        sourceMessageId: payload.sourceMessageId,
      },
    };
  }

  async quarantineMessage(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertSimulatorEnabled(tenantId);
    const data = quarantineSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.cadRawMessages.findFirst({
          where: and(
            eq(cadRawMessages.tenantId, tenantId),
            eq(cadRawMessages.id, data.rawMessageId),
          ),
        });
        if (!row) throw new ForgeError("NOT_FOUND", "CAD message not found");

        const [updated] = await tx
          .update(cadRawMessages)
          .set({
            processingStatus: "QUARANTINED",
            currentProcessingStage: "QUARANTINE",
            lastProcessingErrorCode: "SYNTHETIC_QUARANTINE",
            lastProcessingErrorSummary: data.reason,
            quarantinedAt: new Date(),
          })
          .where(eq(cadRawMessages.id, data.rawMessageId))
          .returning({
            id: cadRawMessages.id,
            processingStatus: cadRawMessages.processingStatus,
            processingAttempts: cadRawMessages.processingAttempts,
            payloadHash: cadRawMessages.payloadHash,
            sourceMessageId: cadRawMessages.sourceMessageId,
            correlationId: cadRawMessages.correlationId,
          });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.MESSAGE_QUARANTINED,
          resourceType: "cad_raw_message",
          resourceId: data.rawMessageId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { reason: data.reason, processingStatus: "QUARANTINED" },
        });

        return updated;
      },
      principal.userId,
    );
  }

  async startOutage(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertSimulatorEnabled(tenantId);
    const data = outageSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const connection = await tx.query.cadConnections.findFirst({
          where: and(
            eq(cadConnections.tenantId, tenantId),
            eq(cadConnections.id, data.connectionId),
          ),
        });
        if (!connection || connection.archivedAt) {
          throw new ForgeError("NOT_FOUND", "CAD connection not found");
        }

        const id = createId();
        const now = new Date();
        await tx.insert(cadConnectionOutages).values({
          id,
          tenantId,
          cadConnectionId: connection.id,
          status: "ACTIVE",
          reason: data.reason,
          startedAt: now,
          startedByUserId: principal.userId,
          source: "SIMULATOR",
          createdAt: now,
          updatedAt: now,
        });

        const [updated] = await tx
          .update(cadConnections)
          .set({
            status: "DEGRADED",
            healthStatus: "DEGRADED",
            lastErrorSummary: data.reason,
            updatedByUserId: principal.userId,
            recordVersion: connection.recordVersion + 1,
            updatedAt: now,
          })
          .where(eq(cadConnections.id, connection.id))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.FALLBACK_STARTED,
          resourceType: "cad_connection_outage",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { reason: data.reason },
        });

        return { outageId: id, connection: sanitize(updated!) };
      },
      principal.userId,
    );
  }

  async recoverOutage(tenantId: string, body: unknown, principal: ForgePrincipal) {
    await this.assertSimulatorEnabled(tenantId);
    const data = outageSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const connection = await tx.query.cadConnections.findFirst({
          where: and(
            eq(cadConnections.tenantId, tenantId),
            eq(cadConnections.id, data.connectionId),
          ),
        });
        if (!connection || connection.archivedAt) {
          throw new ForgeError("NOT_FOUND", "CAD connection not found");
        }

        const active = await tx.query.cadConnectionOutages.findFirst({
          where: and(
            eq(cadConnectionOutages.tenantId, tenantId),
            eq(cadConnectionOutages.cadConnectionId, connection.id),
            eq(cadConnectionOutages.status, "ACTIVE"),
          ),
          orderBy: (t, { desc: d }) => [d(t.startedAt)],
        });

        const now = new Date();
        if (active) {
          await tx
            .update(cadConnectionOutages)
            .set({
              status: "ENDED",
              endedAt: now,
              endedByUserId: principal.userId,
              recordVersion: active.recordVersion + 1,
              updatedAt: now,
            })
            .where(eq(cadConnectionOutages.id, active.id));
        }

        const [updated] = await tx
          .update(cadConnections)
          .set({
            status: connection.enabledAt ? "ACTIVE" : "TESTING",
            healthStatus: "HEALTHY",
            lastErrorSummary: null,
            lastSuccessAt: now,
            updatedByUserId: principal.userId,
            recordVersion: connection.recordVersion + 1,
            updatedAt: now,
          })
          .where(eq(cadConnections.id, connection.id))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: CAD_AUDIT_ACTIONS.FALLBACK_ENDED,
          resourceType: "cad_connection_outage",
          resourceId: active?.id ?? connection.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { reason: data.reason },
        });

        return { recovered: true, connection: sanitize(updated!) };
      },
      principal.userId,
    );
  }

  async listOutages(tenantId: string) {
    await this.assertSimulatorEnabled(tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(cadConnectionOutages)
        .where(eq(cadConnectionOutages.tenantId, tenantId))
        .orderBy(desc(cadConnectionOutages.startedAt))
        .limit(100);
    });
  }

  private async writeHealthLog(
    tenantId: string,
    connectionId: string,
    source: string,
    healthStatus: string,
    detail: string,
  ) {
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx.insert(cadConnectionHealthLogs).values({
        id: createId(),
        tenantId,
        cadConnectionId: connectionId,
        checkedAt: new Date(),
        healthStatus,
        detail,
        source,
        createdAt: new Date(),
      });
    });
  }

  private async withSimulatorEnabled<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> {
    await this.assertSimulatorEnabled(tenantId);
    return fn();
  }

  private async assertSimulatorEnabled(tenantId: string): Promise<void> {
    const enabled = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.ENABLED);
    const simulator = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.SIMULATOR);
    if (!enabled || !simulator) {
      throw new ForgeError("FORBIDDEN", "CAD simulator is not enabled for this tenant");
    }
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

function resolveLocalSecret(overridesJson: string, publicId: string): string | null {
  if (!overridesJson.trim()) return null;
  try {
    const parsed = JSON.parse(overridesJson) as Record<string, unknown>;
    const value = parsed[publicId];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function sanitize<T extends Record<string, unknown>>(row: T) {
  const {
    credentialsSecretArn: _c,
    webhookSecretArn: _w,
    ...rest
  } = row as T & {
    credentialsSecretArn?: string | null;
    webhookSecretArn?: string | null;
  };
  return rest;
}
