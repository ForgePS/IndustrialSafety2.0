import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { createLogger } from "@forge/observability";
import { processCadPollingTick, type CadPollingJob } from "./cad-polling-processor.js";

export class CadPollingSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      databaseUrl: string;
      environment: string;
      intakeQueueUrl: string;
      pollingTenantIds?: string[];
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
        const job = JSON.parse(message.Body) as CadPollingJob;
        if (job.type !== "cad.polling.tick.v1") {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }
        await processCadPollingTick({
          job,
          databaseUrl: this.props.databaseUrl,
          region: this.props.region,
          intakeQueueUrl: this.props.intakeQueueUrl,
          ...(this.props.pollingTenantIds ? { pollingTenantIds: this.props.pollingTenantIds } : {}),
        });
        await this.client.send(
          new DeleteMessageCommand({
            QueueUrl: this.props.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
        processed += 1;
      } catch (error) {
        this.logger.error("cad polling message failed", { error });
      }
    }
    return processed;
  }
}
