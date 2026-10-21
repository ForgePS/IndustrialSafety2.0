import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { createLogger } from "@forge/observability";
import {
  processReportingSchedulesRunDue,
  type ReportingSchedulesJob,
} from "./reporting-schedules-processor.js";

export class ReportingSchedulesSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      environment: string;
      publicApiUrl: string;
      sweepToken: string;
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
        const job = JSON.parse(message.Body) as ReportingSchedulesJob;
        if (job.type !== "reporting.schedules.run_due.v1") {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.props.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }

        await processReportingSchedulesRunDue({
          job,
          publicApiUrl: this.props.publicApiUrl,
          sweepToken: this.props.sweepToken,
        });

        await this.client.send(
          new DeleteMessageCommand({
            QueueUrl: this.props.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
        processed += 1;
      } catch (error) {
        this.logger.error("reporting schedules message failed", { error });
      }
    }
    return processed;
  }
}
