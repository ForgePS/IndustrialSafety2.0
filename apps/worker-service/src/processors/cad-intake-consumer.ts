import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { createLogger } from "@forge/observability";
import { processCadIntakeJob, type CadIntakeJob } from "./cad-intake-processor.js";

export class CadIntakeSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      databaseUrl: string;
      environment: string;
      documentBucket?: string;
      normalizationQueueUrl?: string;
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
        VisibilityTimeout: 120,
      }),
    );
    const messages = response.Messages ?? [];
    let processed = 0;
    for (const message of messages) {
      if (!message.Body || !message.ReceiptHandle) continue;
      try {
        const job = JSON.parse(message.Body) as CadIntakeJob;
        if (job.type !== "cad.intake.normalize.v1") {
          this.logger.warn("unknown cad intake job type", {
            type: (job as { type?: string }).type,
          });
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }
        const outcome = await processCadIntakeJob({
          job,
          databaseUrl: this.props.databaseUrl,
          region: this.props.region,
          ...(this.props.documentBucket ? { documentBucket: this.props.documentBucket } : {}),
          ...(this.props.normalizationQueueUrl
            ? { normalizationQueueUrl: this.props.normalizationQueueUrl }
            : {}),
        });
        if (outcome === "completed") {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          processed += 1;
        }
      } catch (error) {
        this.logger.error("cad intake message failed", { error });
      }
    }
    return processed;
  }
}
