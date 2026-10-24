import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from "@aws-sdk/client-sqs";
import { createLogger, type Logger } from "@forge/observability";
import {
  MalformedDomainEventError,
  parseEventBridgeSqsBody,
  RejectedDomainEventError,
} from "../domain-event.js";
import { emitEmfMetric } from "../metrics.js";
import { createWorkerDatabase, processDomainEvent } from "../event-processing/registry.js";

export interface SqsConsumerOptions {
  queueUrl: string;
  region: string;
  databaseUrl: string;
  environment: string;
  batchSize?: number;
  waitTimeSeconds?: number;
}

export class SqsConsumer {
  private readonly sqs: SQSClient;
  private readonly db: ReturnType<typeof createWorkerDatabase>;
  private readonly queueUrl: string;
  private readonly batchSize: number;
  private readonly waitTimeSeconds: number;
  private readonly environment: string;
  private readonly logger: Logger;

  constructor(options: SqsConsumerOptions) {
    this.sqs = new SQSClient({ region: options.region });
    this.db = createWorkerDatabase(options.databaseUrl);
    this.queueUrl = options.queueUrl;
    this.batchSize = options.batchSize ?? 10;
    this.waitTimeSeconds = options.waitTimeSeconds ?? 20;
    this.environment = options.environment;
    this.logger = createLogger({
      service: "worker-service-sqs",
      environment: options.environment,
    });
  }

  async pollOnce(): Promise<number> {
    const response = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.batchSize,
        WaitTimeSeconds: this.waitTimeSeconds,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      }),
    );

    const messages = response.Messages ?? [];
    if (messages.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const message of messages) {
      const handled = await this.handleMessage(message);
      if (handled) {
        processed += 1;
      }
    }
    return processed;
  }

  private async handleMessage(message: Message): Promise<boolean> {
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? "1");

    if (!message.Body || !message.ReceiptHandle) {
      this.logger.error("malformed SQS message envelope", {
        messageId: message.MessageId,
      });
      emitEmfMetric({
        dimensions: {
          Service: "worker-service",
          Environment: this.environment,
          EventType: "unknown",
        },
        metrics: { EventProcessingRejected: 1 },
      });
      return false;
    }

    let event;
    try {
      event = parseEventBridgeSqsBody(message.Body);
    } catch (error) {
      if (error instanceof MalformedDomainEventError || error instanceof RejectedDomainEventError) {
        this.logger.error("rejected domain event", {
          messageId: message.MessageId,
          receiveCount,
          error: error.message,
        });
        emitEmfMetric({
          dimensions: {
            Service: "worker-service",
            Environment: this.environment,
            EventType: "unknown",
          },
          metrics: { EventProcessingRejected: 1 },
        });
        return false;
      }
      throw error;
    }

    const result = await processDomainEvent({
      db: this.db,
      event,
      environment: this.environment,
      logger: this.logger.child({
        correlationId: event.correlationId,
        ...(event.tenantId ? { tenantId: event.tenantId } : {}),
        eventType: event.type,
      }),
    });

    if (result.outcome === "in_progress") {
      return false;
    }

    if (result.outcome === "failed") {
      return false;
    }

    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
    return true;
  }
}

export function resolveIntegrationQueueUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.INTEGRATION_QUEUE_URL || env.SQS_INTEGRATION_QUEUE_URL;
}
