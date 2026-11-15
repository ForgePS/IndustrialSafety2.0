import { assertSafeEventPayload } from "@forge/events";

export interface InboundDomainEvent {
  id: string;
  type: string;
  version: number;
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | null;
  payload: unknown;
  metadata?: unknown;
}

export class MalformedDomainEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedDomainEventError";
  }
}

export class RejectedDomainEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RejectedDomainEventError";
  }
}

const PLATFORM_SCOPED_EVENT_TYPES = new Set<string>();

export function allowsNullTenantId(eventType: string): boolean {
  return PLATFORM_SCOPED_EVENT_TYPES.has(eventType);
}

export function parseEventBridgeSqsBody(body: string): InboundDomainEvent {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new MalformedDomainEventError("SQS message body is not valid JSON");
  }

  if (envelope.source !== "forge.platform") {
    throw new RejectedDomainEventError(`Unexpected event source: ${String(envelope.source)}`);
  }

  const rawDetail = envelope.detail;
  let detail: Record<string, unknown>;
  if (typeof rawDetail === "string") {
    try {
      detail = JSON.parse(rawDetail) as Record<string, unknown>;
    } catch {
      throw new MalformedDomainEventError("Event detail is not valid JSON");
    }
  } else if (rawDetail && typeof rawDetail === "object") {
    detail = rawDetail as Record<string, unknown>;
  } else {
    throw new MalformedDomainEventError("Event detail is missing");
  }

  const id = asNonEmptyString(detail.id);
  const type = asNonEmptyString(detail.type) ?? asNonEmptyString(envelope["detail-type"]);
  const correlationId = asNonEmptyString(detail.correlationId);
  const aggregateType = asNonEmptyString(detail.aggregateType);
  const aggregateId = asNonEmptyString(detail.aggregateId);

  if (!id || !type || !correlationId || !aggregateType || !aggregateId) {
    throw new MalformedDomainEventError("Event is missing required envelope fields");
  }

  const tenantId: string | null =
    detail.tenantId === null || detail.tenantId === undefined
      ? null
      : (asNonEmptyString(detail.tenantId) ?? null);

  if (!tenantId && !allowsNullTenantId(type)) {
    throw new RejectedDomainEventError(`Event type ${type} requires tenantId`);
  }

  const version = typeof detail.version === "number" ? detail.version : 1;
  const causationId =
    detail.causationId === null || detail.causationId === undefined
      ? null
      : (asNonEmptyString(detail.causationId) ?? null);

  const event: InboundDomainEvent = {
    id,
    type,
    version,
    tenantId,
    aggregateType,
    aggregateId,
    correlationId,
    causationId,
    payload: detail.payload ?? {},
    metadata: detail.metadata,
  };

  assertSafeEventPayload(event.payload);
  return event;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
