import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { createLogger } from "@forge/observability";
import { processCadMatchJob, type CadMatchJob } from "./cad-match-processor.js";

export class CadMatchSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      databaseUrl: string;
      environment: string;
      applicationQueueUrl?: string;
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
        const job = JSON.parse(message.Body) as CadMatchJob;
        if (job.type !== "cad.normalized.ready.v1") {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }
        const outcome = await processCadMatchJob({
          job,
          databaseUrl: this.props.databaseUrl,
          region: this.props.region,
          ...(this.props.applicationQueueUrl
            ? { applicationQueueUrl: this.props.applicationQueueUrl }
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
        this.logger.error("cad match message failed", { error });
      }
    }
    return processed;
  }
}
