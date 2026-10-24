import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { createLogger } from "@forge/observability";
import { processCadRetentionRun, type CadRetentionJob } from "./cad-retention-processor.js";

export class CadRetentionSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      databaseUrl: string;
      environment: string;
      retentionTenantIds?: string[];
    },
  ) {
    this.client = new SQSClient({ region: props.region });
    this.logger = createLogger({
      service: "worker-service",
      environment: props.environment,
    });
  }

  async pollOnce(): Promise<number> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.props.queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 180,
      }),
    );
    const messages = response.Messages ?? [];
    let processed = 0;
    for (const message of messages) {
      if (!message.Body || !message.ReceiptHandle) continue;
      try {
        const job = JSON.parse(message.Body) as CadRetentionJob;
        if (job.type !== "cad.retention.run.v1") {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }

        const tenantIds =
          job.tenantId != null ? [job.tenantId] : (this.props.retentionTenantIds ?? []);

        if (tenantIds.length === 0) {
          const jobPayload: CadRetentionJob = { type: "cad.retention.run.v1" };
          if (job.correlationId) jobPayload.correlationId = job.correlationId;
          await processCadRetentionRun({
            job: jobPayload,
            databaseUrl: this.props.databaseUrl,
          });
        } else {
          for (const tenantId of tenantIds) {
            const jobPayload: CadRetentionJob = {
              type: "cad.retention.run.v1",
              tenantId,
            };
            if (job.correlationId) jobPayload.correlationId = job.correlationId;
            await processCadRetentionRun({
              job: jobPayload,
              databaseUrl: this.props.databaseUrl,
            });
          }
        }

        await this.client.send(
          new DeleteMessageCommand({
            QueueUrl: this.props.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
        processed += 1;
      } catch (error) {
        this.logger.error("cad retention message failed", { error });
      }
    }
    return processed;
  }
}
