import { Injectable } from "@nestjs/common";
import { assertSafeEventPayload, createDomainEvent, type DomainEventType } from "@forge/events";
import { createId, outboxEvents, type DatabaseTransaction } from "@forge/database";

export interface WriteOutboxInput {
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: DomainEventType | string;
  payload: unknown;
  correlationId: string;
  causationId?: string | null;
  actorUserId?: string | null;
  eventVersion?: number;
}

@Injectable()
export class OutboxService {
  async write(tx: DatabaseTransaction, input: WriteOutboxInput): Promise<string> {
    assertSafeEventPayload(input.payload);
    const id = createId();
    const event = createDomainEvent({
      id,
      type: input.eventType,
      version: input.eventVersion ?? 1,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      payload: input.payload,
    });

    await tx.insert(outboxEvents).values({
      id,
      tenantId: input.tenantId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: event.type,
      eventVersion: event.version,
      payloadJson: event.payload as Record<string, unknown>,
      metadataJson: {
        actorUserId: input.actorUserId ?? null,
        occurredAt: event.occurredAt,
      },
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      status: "PENDING",
      availableAt: new Date(),
      attemptCount: 0,
    });

    return id;
  }
}
