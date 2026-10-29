import type {
  CadAdapterManifest,
  CadAuthenticationResult,
  CadConnectionContext,
  CadHealthResult,
  CadInboundRequest,
  CadNormalizationContext,
  CadNormalizationResult,
  CadNormalizedEvent,
  CadParsedPayload,
  CadRawMessage,
} from "@forge/cad-contracts";
import {
  BaseCadAdapter,
  evaluateCadWebhookTimestamp,
  FORGE_CAD_HEADERS,
  verifyCadWebhookSignature,
} from "@forge/cad-core";
import { createHash } from "node:crypto";
import { z } from "zod";

const syntheticPayloadSchema = z.object({
  eventType: z.string().min(1),
  sourceMessageId: z.string().optional(),
  sourceEventId: z.string().optional(),
  sourceIncidentId: z.string().optional(),
  sourceIncidentNumber: z.string().optional(),
  sourceSequence: z.number().int().optional(),
  timestamp: z.string().min(1),
  callType: z.string().optional(),
  priority: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  units: z
    .array(
      z.object({
        sourceUnitId: z.string(),
        sourceUnitCallsign: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
  comments: z
    .array(
      z.object({
        sourceCommentId: z.string().optional(),
        text: z.string(),
        restricted: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const FORGE_SYNTHETIC_ADAPTER_KEY = "forge.synthetic";

export class ForgeSyntheticCadAdapter extends BaseCadAdapter {
  readonly manifest: CadAdapterManifest = {
    adapterKey: FORGE_SYNTHETIC_ADAPTER_KEY,
    adapterVersion: "1.0.0",
    vendorName: "Forge Public Safety",
    productName: "Synthetic CAD Simulator",
    supportedSourceVersions: ["1.0"],
    supportedTransports: ["HTTPS_WEBHOOK", "POLLING", "SYNTHETIC_SIMULATOR"],
    supportedEventTypes: [
      "INCIDENT_CREATED",
      "INCIDENT_UPDATED",
      "INCIDENT_CANCELLED",
      "UNIT_DISPATCHED",
      "UNIT_EN_ROUTE",
      "UNIT_ARRIVED",
      "UNIT_CLEARED",
      "COMMENT_ADDED",
      "LOCATION_UPDATED",
      "PRIORITY_UPDATED",
      "DISPOSITION_UPDATED",
      "INCIDENT_CLOSED",
      "HEARTBEAT",
      "CONNECTION_TEST",
      "UNKNOWN_EVENT",
    ],
    authenticationTypes: ["HMAC_SHA256"],
    acknowledgementBehavior: "ACCEPTED_AFTER_PERSIST",
    orderingGuarantee: "PER_INCIDENT_SEQUENCE",
    sourceIdStrategy: "sourceIncidentId+sourceSequence",
    configurationSchemaVersion: "1",
    mappingTemplateVersion: "1",
    documentationReference: "docs/neris/architecture/cad-adapter-contract.md",
  };

  override validateConfiguration(configuration: unknown) {
    const base = super.validateConfiguration(configuration);
    if (!base.valid) return base;
    return base;
  }

  async authenticateMessage(
    request: CadInboundRequest,
    context: CadConnectionContext,
  ): Promise<CadAuthenticationResult> {
    const headers = normalizeHeaders(request.headers);
    const keyId = headers[FORGE_CAD_HEADERS.KEY_ID];
    const timestamp = headers[FORGE_CAD_HEADERS.TIMESTAMP];
    const nonce = headers[FORGE_CAD_HEADERS.NONCE];
    const signature = headers[FORGE_CAD_HEADERS.SIGNATURE];
    const messageId = headers[FORGE_CAD_HEADERS.MESSAGE_ID];

    if (!keyId) {
      return { status: "MISSING", reasonCode: "MISSING_KEY_ID", reasonSummary: "Missing key id" };
    }
    if (!timestamp) {
      return {
        status: "MISSING",
        reasonCode: "MISSING_TIMESTAMP",
        reasonSummary: "Missing timestamp",
      };
    }
    if (!nonce) {
      return { status: "MISSING", reasonCode: "MISSING_NONCE", reasonSummary: "Missing nonce" };
    }
    if (!messageId) {
      return {
        status: "MISSING",
        reasonCode: "MISSING_MESSAGE_ID",
        reasonSummary: "Missing message id",
      };
    }
    if (!signature) {
      return {
        status: "MISSING",
        reasonCode: "MISSING_SIGNATURE",
        reasonSummary: "Missing signature",
      };
    }

    const skew = evaluateCadWebhookTimestamp({ timestampHeader: timestamp });
    if (!skew.ok) {
      return {
        status: skew.code === "FUTURE_TIMESTAMP" ? "INVALID" : "EXPIRED",
        keyId,
        reasonCode: skew.code,
        reasonSummary: skew.summary,
      };
    }

    const secret = resolveSecretFromContext(context, keyId);
    if (!secret) {
      return {
        status: "ERROR",
        keyId,
        reasonCode: "INVALID_KEY_ID",
        reasonSummary: "Webhook secret not available for key id",
      };
    }

    const bodyBytes =
      typeof request.body === "string"
        ? Buffer.from(request.body, "utf8")
        : Buffer.from(request.body);
    const bodySha256Hex = createHash("sha256").update(bodyBytes).digest("hex");
    const valid = verifyCadWebhookSignature({
      secret,
      timestamp,
      nonce,
      messageId,
      bodySha256Hex,
      providedSignatureHex: signature,
    });

    if (!valid) {
      return {
        status: "INVALID",
        keyId,
        reasonCode: "INVALID_SIGNATURE",
        reasonSummary: "Signature mismatch",
      };
    }

    return { status: "VALID", keyId };
  }

  async parseRawMessage(
    message: CadRawMessage,
    payloadBytes: Uint8Array,
  ): Promise<CadParsedPayload> {
    const text = Buffer.from(payloadBytes).toString("utf8");
    const json = JSON.parse(text) as unknown;
    const parsed = syntheticPayloadSchema.parse(json);
    const result: CadParsedPayload = {
      rawMessageId: message.id,
      sourceVersion: "1.0",
      sourceEventType: parsed.eventType,
      vendorPayload: parsed,
    };
    const sourceMessageId = parsed.sourceMessageId ?? message.sourceMessageId;
    if (sourceMessageId) result.sourceMessageId = sourceMessageId;
    if (parsed.sourceIncidentId) result.sourceIncidentId = parsed.sourceIncidentId;
    if (parsed.sourceEventId) result.sourceEventId = parsed.sourceEventId;
    if (parsed.sourceSequence != null) result.sourceSequence = parsed.sourceSequence;
    return result;
  }

  async normalize(
    parsed: CadParsedPayload,
    context: CadNormalizationContext,
  ): Promise<CadNormalizationResult> {
    const payload = syntheticPayloadSchema.parse(parsed.vendorPayload);
    const known = this.manifest.supportedEventTypes.includes(
      payload.eventType as (typeof this.manifest.supportedEventTypes)[number],
    );
    const eventType = known
      ? (payload.eventType as CadNormalizedEvent["eventType"])
      : "UNKNOWN_EVENT";

    const source: CadNormalizedEvent["source"] = {
      vendor: this.manifest.vendorName,
      adapterKey: this.manifest.adapterKey,
      adapterVersion: this.manifest.adapterVersion,
      timestamp: payload.timestamp,
    };
    if (parsed.sourceMessageId) source.messageId = parsed.sourceMessageId;
    if (parsed.sourceEventId) source.eventId = parsed.sourceEventId;
    if (parsed.sourceIncidentId) source.incidentId = parsed.sourceIncidentId;
    if (payload.sourceIncidentNumber) source.incidentNumber = payload.sourceIncidentNumber;
    if (parsed.sourceVersion) source.sourceVersion = parsed.sourceVersion;
    if (parsed.sourceSequence != null) source.sequence = parsed.sourceSequence;

    const incident: CadNormalizedEvent["incident"] = {};
    if (payload.callType) incident.callType = payload.callType;
    if (payload.priority) incident.priority = payload.priority;

    const event: CadNormalizedEvent = {
      eventId: parsed.sourceEventId ?? parsed.rawMessageId,
      tenantId: context.tenantId,
      connectionId: context.connectionId,
      rawMessageId: parsed.rawMessageId,
      source,
      eventType,
      incident,
      provenance: [
        {
          fieldIdentifier: "incident.callType",
          sourcePath: "callType",
        },
      ],
    };

    if (payload.address) {
      event.location = { fullAddress: payload.address };
      if (payload.city) event.location.city = payload.city;
      if (payload.state) event.location.state = payload.state;
      if (payload.postalCode) event.location.postalCode = payload.postalCode;
      if (payload.latitude != null) event.location.latitude = payload.latitude;
      if (payload.longitude != null) event.location.longitude = payload.longitude;
    }

    if (payload.units) {
      event.units = payload.units.map((unit) => {
        const mapped: NonNullable<CadNormalizedEvent["units"]>[number] = {
          sourceUnitId: unit.sourceUnitId,
        };
        if (unit.sourceUnitCallsign) mapped.sourceUnitCallsign = unit.sourceUnitCallsign;
        if (unit.status) mapped.status = unit.status;
        return mapped;
      });
    }

    if (payload.comments) {
      event.comments = payload.comments.map((c) => {
        const comment: NonNullable<CadNormalizedEvent["comments"]>[number] = {
          text: c.text,
          restricted: c.restricted ?? false,
        };
        if (c.sourceCommentId) comment.sourceCommentId = c.sourceCommentId;
        return comment;
      });
    }

    return {
      ok: true,
      event,
      warnings: known
        ? []
        : [{ code: "UNKNOWN_EVENT", message: `Unknown event type ${payload.eventType}` }],
      errors: [],
    };
  }

  override async testConnection(_context: CadConnectionContext): Promise<CadHealthResult> {
    return {
      healthy: true,
      status: "HEALTHY",
      checkedAt: new Date().toISOString(),
      detail: "Synthetic adapter always healthy",
    };
  }

  async pollMessages(
    context: CadConnectionContext,
    cursor: { cursor?: string | null; watermark?: string | null },
  ): Promise<{
    messages: Array<{
      sourceMessageId: string;
      payload: Record<string, unknown>;
      receivedAt?: string;
      contentType?: string;
    }>;
    nextCursor?: string | null;
    nextWatermark?: string | null;
    healthy: boolean;
    detail?: string;
  }> {
    const now = new Date();
    const seq = Number(cursor.cursor ?? "0") + 1;
    const sourceMessageId = `poll_${context.connectionId.slice(0, 8)}_${seq}`;
    const payload: Record<string, unknown> = {
      eventType: seq % 5 === 0 ? "HEARTBEAT" : "INCIDENT_CREATED",
      sourceMessageId,
      sourceEventId: `evt_poll_${seq}`,
      sourceIncidentId: `POLL-${context.publicId.slice(-6).toUpperCase()}-${seq}`,
      sourceIncidentNumber: `POLL-${seq}`,
      sourceSequence: 1,
      timestamp: now.toISOString(),
      callType: "EMS",
      priority: "3",
      address: `${100 + seq} Synthetic Ave`,
      city: "Springfield",
      state: "IL",
    };

    return {
      messages: [
        {
          sourceMessageId,
          payload,
          receivedAt: now.toISOString(),
          contentType: "application/json",
        },
      ],
      nextCursor: String(seq),
      nextWatermark: now.toISOString(),
      healthy: true,
      detail: "Synthetic poll generated 1 message",
    };
  }
}

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

/**
 * Secrets are injected onto connection context at runtime by the intake service
 * (Secrets Manager / local override). Never read secret values from configuration_json.
 */
function resolveSecretFromContext(context: CadConnectionContext, keyId: string): string | null {
  const runtime = context.configuration.__runtimeWebhookSecrets;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    return null;
  }
  const map = runtime as Record<string, unknown>;
  const value = map[keyId];
  return typeof value === "string" && value.length > 0 ? value : null;
}
