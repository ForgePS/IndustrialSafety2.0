import { createHash } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getCadAdapter } from "@forge/cad-adapters";
import { CAD_AUDIT_ACTIONS, CAD_FEATURE_FLAGS, type CadTransportType } from "@forge/cad-contracts";
import { buildCadIdempotencyKey } from "@forge/cad-core";
import {
  cadRawMessages,
  cadWebhookReplayCache,
  createId,
  featureDefinitions,
  featureOverrides,
  lookupCadConnection,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { resolveFeatureValue } from "@forge/authorization";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

const INLINE_MAX_BYTES = 8 * 1024;

export type CadWebhookResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

@Injectable()
export class CadWebhookService {
  private readonly s3: S3Client;
  private readonly sqs: SQSClient;
  private readonly secrets: SecretsManagerClient;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly audit: AuditService,
  ) {
    this.s3 = new S3Client({ region: env.AWS_REGION });
    this.sqs = new SQSClient({ region: env.AWS_REGION });
    this.secrets = new SecretsManagerClient({ region: env.AWS_REGION });
  }

  async ingest(input: {
    connectionPublicId: string;
    headers: Record<string, string | undefined>;
    rawBody: Buffer;
    contentType?: string;
    correlationId: string;
    requestId: string;
    remoteAddress?: string;
  }): Promise<CadWebhookResult> {
    const maxBytes = this.env.CAD_WEBHOOK_MAX_BODY_BYTES ?? 262144;
    if (input.rawBody.byteLength > maxBytes) {
      return reject(413, "REJECTED_VALIDATION", input.correlationId, "Payload too large");
    }
    const contentType = (input.contentType ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("application/json") &&
      !contentType.includes("+json")
    ) {
      return reject(415, "REJECTED_VALIDATION", input.correlationId, "Unsupported content type");
    }

    const connection = await lookupCadConnection(this.db, input.connectionPublicId);
    if (!connection) {
      return reject(401, "REJECTED_AUTHENTICATION", input.correlationId, "Unauthorized");
    }

    const flagsOk = await this.assertCadWebhookFlags(connection.tenantId);
    if (!flagsOk) {
      return reject(403, "REJECTED_VALIDATION", input.correlationId, "CAD webhook not enabled");
    }

    if (!["ACTIVE", "TESTING", "DEGRADED"].includes(connection.status)) {
      return reject(401, "REJECTED_AUTHENTICATION", input.correlationId, "Unauthorized");
    }

    if (connection.environment === "PRODUCTION" && this.env.APP_ENV !== "production") {
      return reject(403, "REJECTED_VALIDATION", input.correlationId, "Production CAD disabled");
    }

    const adapter = getCadAdapter(connection.adapterKey);
    if (!adapter) {
      return reject(400, "UNSUPPORTED_VERSION", input.correlationId, "Unsupported adapter");
    }

    const secrets = await this.resolveWebhookSecrets(
      input.connectionPublicId,
      connection.webhookSecretArn,
      connection.webhookKeyId,
    );

    const inbound: Parameters<NonNullable<typeof adapter>["authenticateMessage"]>[0] = {
      method: "POST",
      path: `/api/v1/cad/webhooks/${input.connectionPublicId}`,
      headers: input.headers,
      body: input.rawBody,
      receivedAt: new Date().toISOString(),
      correlationId: input.correlationId,
    };
    if (input.remoteAddress) inbound.remoteAddress = input.remoteAddress;

    const auth = await adapter.authenticateMessage(inbound, {
      tenantId: connection.tenantId,
      connectionId: connection.connectionId,
      publicId: input.connectionPublicId,
      adapterKey: connection.adapterKey,
      adapterVersion: connection.adapterVersion,
      environment: connection.environment,
      transportType: connection.transportType as CadTransportType,
      configuration: {
        ...connection.configurationJson,
        __runtimeWebhookSecrets: secrets,
      },
      credentialsSecretArn: connection.credentialsSecretArn,
      webhookSecretArn: connection.webhookSecretArn,
      webhookKeyId: connection.webhookKeyId,
    });

    if (auth.status !== "VALID") {
      await this.auditRejected(connection.tenantId, connection.connectionId, input, auth.status);
      return reject(401, "REJECTED_AUTHENTICATION", input.correlationId, "Unauthorized");
    }

    const headerMap = lowerHeaders(input.headers);
    const nonce = headerMap["x-forge-cad-nonce"] ?? "";
    const messageId = headerMap["x-forge-cad-message-id"] ?? "";
    const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
    const requestHash = payloadHash;

    const replayBlocked = await this.checkAndStoreReplay({
      tenantId: connection.tenantId,
      connectionId: connection.connectionId,
      nonce,
      messageId,
      requestHash,
    });
    if (replayBlocked) {
      await this.auditRejected(connection.tenantId, connection.connectionId, input, "REPLAYED");
      return reject(401, "REJECTED_AUTHENTICATION", input.correlationId, "Unauthorized");
    }

    const sourceMessageId = messageId || null;
    const idempotencyKey = buildCadIdempotencyKey({
      tenantId: connection.tenantId,
      connectionId: connection.connectionId,
      sourceMessageId,
      payloadHash,
    });

    const rawMessageId = createId();
    const receivedAt = new Date();
    const year = String(receivedAt.getUTCFullYear());
    const month = String(receivedAt.getUTCMonth() + 1).padStart(2, "0");
    const day = String(receivedAt.getUTCDate()).padStart(2, "0");
    const objectKey = `cad/${connection.tenantId}/${connection.connectionId}/${year}/${month}/${day}/${rawMessageId}/payload`;

    let payloadStorageType: "S3" | "INLINE_ENCRYPTED" = "S3";
    let payloadS3Bucket: string | null = this.env.S3_DOCUMENT_BUCKET;
    let payloadS3Key: string | null = objectKey;
    let inlinePayload: Buffer | null = null;

    if (input.rawBody.byteLength <= INLINE_MAX_BYTES && this.env.APP_ENV === "local") {
      payloadStorageType = "INLINE_ENCRYPTED";
      payloadS3Bucket = null;
      payloadS3Key = null;
      inlinePayload = input.rawBody;
    } else {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.S3_DOCUMENT_BUCKET,
          Key: objectKey,
          Body: input.rawBody,
          ContentType: contentType || "application/json",
          ServerSideEncryption: "aws:kms",
          Metadata: {
            tenantId: connection.tenantId,
            connectionId: connection.connectionId,
            rawMessageId,
          },
        }),
      );
    }

    const insertResult = await withTenantTransaction(this.db, connection.tenantId, async (tx) => {
      const existing = await tx.query.cadRawMessages.findFirst({
        where: and(
          eq(cadRawMessages.tenantId, connection.tenantId),
          eq(cadRawMessages.cadConnectionId, connection.connectionId),
          eq(cadRawMessages.idempotencyKey, idempotencyKey),
        ),
      });
      if (existing) {
        return { duplicate: true as const, id: existing.id };
      }

      await tx.insert(cadRawMessages).values({
        id: rawMessageId,
        tenantId: connection.tenantId,
        cadConnectionId: connection.connectionId,
        receivedAt,
        transportType: "HTTPS_WEBHOOK",
        sourceMessageId,
        contentType: contentType || "application/json",
        payloadStorageType,
        payloadS3Bucket,
        payloadS3Key,
        inlinePayloadEncrypted: inlinePayload,
        payloadHash,
        payloadSizeBytes: input.rawBody.byteLength,
        idempotencyKey,
        authenticationStatus: "VALID",
        signatureValid: true,
        processingStatus: "PERSISTED",
        acknowledgementStatus: "ACCEPTED",
        acknowledgedAt: new Date(),
        correlationId: input.correlationId,
      });

      await this.audit.writeInTransaction(tx, {
        id: createId(),
        tenantId: connection.tenantId,
        actorUserId: null,
        actorPersonId: null,
        actorType: "SERVICE",
        action: CAD_AUDIT_ACTIONS.MESSAGE_RECEIVED,
        resourceType: "cad_raw_message",
        resourceId: rawMessageId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: input.correlationId,
        requestId: input.requestId,
        metadata: {
          connectionId: connection.connectionId,
          payloadSizeBytes: input.rawBody.byteLength,
          payloadHash,
          // Never include raw payload
        },
      });

      return { duplicate: false as const, id: rawMessageId };
    });

    if (insertResult.duplicate) {
      return {
        httpStatus: 202,
        body: {
          outcome: "DUPLICATE",
          correlationId: input.correlationId,
          rawMessageId: insertResult.id,
        },
      };
    }

    const queueUrl = this.env.SQS_CAD_INTAKE_QUEUE_URL;
    if (queueUrl) {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: "cad.intake.normalize.v1",
            tenantId: connection.tenantId,
            connectionId: connection.connectionId,
            rawMessageId: insertResult.id,
            correlationId: input.correlationId,
            idempotencyKey,
          }),
          MessageAttributes: {
            tenantId: { DataType: "String", StringValue: connection.tenantId },
            correlationId: { DataType: "String", StringValue: input.correlationId },
          },
        }),
      );

      await withTenantTransaction(this.db, connection.tenantId, async (tx) => {
        await tx
          .update(cadRawMessages)
          .set({ processingStatus: "QUEUED", currentProcessingStage: "INTAKE" })
          .where(eq(cadRawMessages.id, insertResult.id));
      });
    }

    return {
      httpStatus: 202,
      body: {
        outcome: "ACCEPTED",
        correlationId: input.correlationId,
        rawMessageId: insertResult.id,
      },
    };
  }

  private async assertCadWebhookFlags(tenantId: string): Promise<boolean> {
    const enabled = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.ENABLED);
    const webhook = await this.resolveFlag(tenantId, CAD_FEATURE_FLAGS.WEBHOOK);
    return enabled && webhook;
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
      const tenantOv = overrides[0];
      const value = resolveFeatureValue({
        tenant: tenantOv?.valueJson as unknown,
        defaultValue: def.defaultValueJson as unknown,
      });
      return value === true;
    });
  }

  private async resolveWebhookSecrets(
    publicId: string,
    secretArn: string | null,
    primaryKeyId: string | null,
  ): Promise<Record<string, string>> {
    const overrides = parseSecretOverrides(this.env.CAD_WEBHOOK_SECRET_OVERRIDES_JSON ?? "");
    if (overrides[publicId]) {
      const keyId = primaryKeyId ?? "default";
      return { [keyId]: overrides[publicId]! };
    }
    if (!secretArn) {
      return {};
    }
    try {
      const result = await this.secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
      const raw = result.SecretString ?? "";
      const parsed = JSON.parse(raw) as { keys?: Record<string, string> } | string;
      if (typeof parsed === "string") {
        return { [primaryKeyId ?? "default"]: parsed };
      }
      return parsed.keys ?? {};
    } catch {
      return {};
    }
  }

  private async checkAndStoreReplay(input: {
    tenantId: string;
    connectionId: string;
    nonce: string;
    messageId: string;
    requestHash: string;
  }): Promise<boolean> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return withTenantTransaction(this.db, input.tenantId, async (tx) => {
      if (input.nonce) {
        const byNonce = await tx.query.cadWebhookReplayCache.findFirst({
          where: and(
            eq(cadWebhookReplayCache.cadConnectionId, input.connectionId),
            eq(cadWebhookReplayCache.nonce, input.nonce),
            gt(cadWebhookReplayCache.expiresAt, new Date()),
          ),
        });
        if (byNonce) return true;
      }
      if (input.messageId) {
        const byMessage = await tx.query.cadWebhookReplayCache.findFirst({
          where: and(
            eq(cadWebhookReplayCache.cadConnectionId, input.connectionId),
            eq(cadWebhookReplayCache.messageId, input.messageId),
            gt(cadWebhookReplayCache.expiresAt, new Date()),
          ),
        });
        if (byMessage) return true;
      }
      await tx.insert(cadWebhookReplayCache).values({
        id: createId(),
        tenantId: input.tenantId,
        cadConnectionId: input.connectionId,
        nonce: input.nonce || null,
        messageId: input.messageId || null,
        requestHash: input.requestHash,
        expiresAt,
      });
      return false;
    });
  }

  private async auditRejected(
    tenantId: string,
    connectionId: string,
    input: { correlationId: string; requestId: string },
    authStatus: string,
  ): Promise<void> {
    try {
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        await this.audit.writeInTransaction(tx, {
          id: createId(),
          tenantId,
          actorUserId: null,
          actorPersonId: null,
          actorType: "SERVICE",
          action: CAD_AUDIT_ACTIONS.MESSAGE_REJECTED,
          resourceType: "cad_connection",
          resourceId: connectionId,
          result: "DENIED",
          riskLevel: "HIGH",
          correlationId: input.correlationId,
          requestId: input.requestId,
          metadata: { authStatus },
        });
      });
    } catch {
      // Do not fail auth rejection on audit errors
    }
  }
}

function lowerHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function parseSecretOverrides(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function reject(
  httpStatus: number,
  outcome: string,
  correlationId: string,
  summary: string,
): CadWebhookResult {
  return {
    httpStatus,
    body: { outcome, correlationId, summary },
  };
}

/** Used by tests to assert generic unauthorized shape. */
export function assertGenericAuthError(result: CadWebhookResult): void {
  if (result.httpStatus === 401 && result.body.summary !== "Unauthorized") {
    throw new Error("CAD auth errors must remain generic");
  }
}
