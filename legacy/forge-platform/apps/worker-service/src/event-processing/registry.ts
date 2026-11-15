import { createDatabase, type Database } from "@forge/database";
import type { Logger } from "@forge/observability";
import type { InboundDomainEvent } from "../domain-event.js";
import { emitEmfMetric } from "../metrics.js";
import {
  claimEventProcessing,
  completeEventProcessing,
  failEventProcessing,
  type ClaimResult,
} from "./idempotency.js";

export interface EventHandlerContext {
  db: Database;
  event: InboundDomainEvent;
  logger: Logger;
}

export type DomainEventHandler = (ctx: EventHandlerContext) => Promise<void>;

interface RegisteredHandler {
  handlerName: string;
  handle: DomainEventHandler;
}

const handlers = new Map<string, RegisteredHandler>();

export function registerDomainEventHandler(
  eventType: string,
  handlerName: string,
  handle: DomainEventHandler,
): void {
  handlers.set(eventType, { handlerName, handle });
}

export function getRegisteredEventTypes(): string[] {
  return [...handlers.keys()];
}

export interface ProcessDomainEventOptions {
  db: Database;
  event: InboundDomainEvent;
  logger: Logger;
  environment: string;
}

export interface ProcessDomainEventResult {
  outcome: "completed" | "already_completed" | "in_progress" | "failed";
  handlerName?: string;
  durationMs?: number;
}

export async function processDomainEvent(
  options: ProcessDomainEventOptions,
): Promise<ProcessDomainEventResult> {
  const { db, event, logger, environment } = options;
  const registration = handlers.get(event.type);

  if (!registration) {
    logger.warn("no handler registered for event type", {
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      tenantId: event.tenantId ?? undefined,
    });
    emitEmfMetric({
      dimensions: {
        Service: "worker-service",
        Environment: environment,
        EventType: event.type,
      },
      metrics: { EventProcessingSkipped: 1 },
    });
    return { outcome: "completed" };
  }

  const { handlerName, handle } = registration;
  const started = Date.now();
  const claim = await claimEventProcessing(db, event, handlerName);

  if (claim.status === "already_completed") {
    logger.info("event already processed", {
      eventId: event.id,
      eventType: event.type,
      handlerName,
      correlationId: event.correlationId,
      tenantId: event.tenantId ?? undefined,
    });
    return { outcome: "already_completed", handlerName };
  }

  if (claim.status === "in_progress") {
    logger.info("event processing in progress elsewhere", {
      eventId: event.id,
      eventType: event.type,
      handlerName,
      correlationId: event.correlationId,
      tenantId: event.tenantId ?? undefined,
    });
    return { outcome: "in_progress", handlerName };
  }

  const recordId = resolveRecordId(claim);
  const childLogger = logger.child({
    correlationId: event.correlationId,
    ...(event.tenantId ? { tenantId: event.tenantId } : {}),
    eventType: event.type,
  });

  try {
    await handle({ db, event, logger: childLogger });
    const durationMs = Date.now() - started;
    await completeEventProcessing(db, event, recordId, durationMs);

    childLogger.info("domain event processed", {
      eventId: event.id,
      handlerName,
      durationMs,
    });

    emitEmfMetric({
      dimensions: {
        Service: "worker-service",
        Environment: environment,
        EventType: event.type,
        HandlerName: handlerName,
      },
      metrics: {
        EventProcessingSuccess: 1,
        EventProcessingDurationMs: durationMs,
      },
      units: { EventProcessingDurationMs: "Milliseconds" },
    });

    return { outcome: "completed", handlerName, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    await failEventProcessing(db, event, recordId, durationMs, message);

    childLogger.error("domain event handler failed", {
      eventId: event.id,
      handlerName,
      durationMs,
      error: message,
    });

    emitEmfMetric({
      dimensions: {
        Service: "worker-service",
        Environment: environment,
        EventType: event.type,
        HandlerName: handlerName,
      },
      metrics: {
        EventProcessingFailure: 1,
        EventProcessingDurationMs: durationMs,
      },
      units: { EventProcessingDurationMs: "Milliseconds" },
    });

    return { outcome: "failed", handlerName, durationMs };
  }
}

function resolveRecordId(claim: ClaimResult): string {
  if (claim.status === "claimed" || claim.status === "retry") {
    return claim.recordId;
  }
  throw new Error("resolveRecordId called with non-actionable claim");
}

export function createWorkerDatabase(databaseUrl: string): Database {
  return createDatabase(databaseUrl);
}
