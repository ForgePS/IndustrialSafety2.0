import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createDatabase, createId, type Database } from "@forge/database";
import { createLogger } from "@forge/observability";
import { sql } from "drizzle-orm";

export interface OutboxPublisherOptions {
  databaseUrl: string;
  region: string;
  eventBusName: string;
  batchSize?: number;
  environment: string;
}

interface PendingOutboxRow {
  id: string;
  tenant_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload_json: unknown;
  metadata_json: unknown;
  correlation_id: string;
  causation_id: string | null;
  attempt_count: number;
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows ?? []) as T[];
  }
  return [];
}

export class OutboxPublisher {
  private readonly db: Database;
  private readonly eb: EventBridgeClient;
  private readonly busName: string;
  private readonly batchSize: number;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(options: OutboxPublisherOptions) {
    this.db = createDatabase(options.databaseUrl);
    this.eb = new EventBridgeClient({ region: options.region });
    this.busName = options.eventBusName;
    this.batchSize = options.batchSize ?? 25;
    this.logger = createLogger({
      service: "worker-service-outbox",
      environment: options.environment,
    });
  }

  async pollOnce(): Promise<number> {
    const rows = await this.claimPending();
    if (rows.length === 0) {
      return 0;
    }

    let published = 0;
    for (const row of rows) {
      try {
        await this.publish(row);
        await this.markPublished(row.id);
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("outbox publish failed", {
          outboxEventId: row.id,
          eventType: row.event_type,
          error: message,
        });
        await this.markFailed(row.id, row.attempt_count, message);
      }
    }
    return published;
  }

  private async claimPending(): Promise<PendingOutboxRow[]> {
    const result = await this.db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM outbox_events
        WHERE status = 'PENDING'
          AND available_at <= NOW()
        ORDER BY available_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize}
      )
      UPDATE outbox_events o
      SET status = 'PROCESSING',
          last_attempt_at = NOW(),
          attempt_count = o.attempt_count + 1
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING
        o.id,
        o.tenant_id,
        o.aggregate_type,
        o.aggregate_id,
        o.event_type,
        o.event_version,
        o.payload_json,
        o.metadata_json,
        o.correlation_id,
        o.causation_id,
        o.attempt_count
    `);
    return asRows<PendingOutboxRow>(result);
  }

  private async publish(row: PendingOutboxRow): Promise<void> {
    const detail = {
      id: row.id,
      type: row.event_type,
      version: row.event_version,
      tenantId: row.tenant_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      payload: row.payload_json,
      metadata: row.metadata_json,
    };

    const response = await this.eb.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: "forge.platform",
            DetailType: row.event_type,
            Detail: JSON.stringify(detail),
          },
        ],
      }),
    );

    const failed = response.FailedEntryCount ?? 0;
    if (failed > 0) {
      const reason = response.Entries?.[0]?.ErrorMessage ?? "EventBridge PutEvents failed";
      throw new Error(reason);
    }

    const deliveryId = createId();
    const destination = `eventbridge:${this.busName}`;
    await this.db.execute(sql`
      INSERT INTO event_delivery_log (
        id, outbox_event_id, destination, attempt_number, status, response_metadata_json, created_at
      ) VALUES (
        ${deliveryId}::uuid,
        ${row.id}::uuid,
        ${destination},
        ${row.attempt_count},
        'DELIVERED',
        '{}'::jsonb,
        NOW()
      )
    `);
  }

  private async markPublished(id: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE outbox_events
      SET status = 'PUBLISHED',
          published_at = NOW(),
          last_error = NULL
      WHERE id = ${id}::uuid
    `);
  }

  private async markFailed(id: string, attemptCount: number, error: string): Promise<void> {
    const safe = error.slice(0, 2000);
    const terminal = attemptCount >= 10;
    const delaySeconds = Math.min(300, Math.max(5, attemptCount * 5));
    if (terminal) {
      await this.db.execute(sql`
        UPDATE outbox_events
        SET status = 'FAILED',
            last_error = ${safe},
            failed_at = NOW()
        WHERE id = ${id}::uuid
      `);
      return;
    }
    await this.db.execute(sql`
      UPDATE outbox_events
      SET status = 'PENDING',
          last_error = ${safe},
          available_at = NOW() + make_interval(secs => ${delaySeconds})
      WHERE id = ${id}::uuid
    `);
  }
}

export function resolveEventBusName(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVENT_BUS_NAME || env.EVENTBRIDGE_BUS_NAME || "forge-platform";
}
