import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  IMPORT_EXECUTE_MESSAGE_TYPE,
  IMPORT_MALWARE_SCAN_MESSAGE_TYPE,
  IMPORT_UPLOAD_DETECT_MESSAGE_TYPE,
  type ImportUploadDetectMessage,
} from "@forge/imports";
import { createLogger } from "@forge/observability";
import { processImportExecuteJob } from "./import-execute-processor.js";
import { processImportMalwareScanJob } from "./import-malware-processor.js";
import { processImportUploadDetectJob } from "./import-upload-processor.js";

export class ImportSqsConsumer {
  private readonly client: SQSClient;
  private readonly logger;

  constructor(
    private readonly props: {
      queueUrl: string;
      region: string;
      databaseUrl: string;
      environment: string;
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
        const parsed = JSON.parse(message.Body) as Record<string, unknown>;
        const type =
          (parsed.messageType as string | undefined) ?? (parsed.type as string | undefined);

        if (type === IMPORT_MALWARE_SCAN_MESSAGE_TYPE) {
          const outcome = await processImportMalwareScanJob({
            raw: parsed,
            databaseUrl: this.props.databaseUrl,
            region: this.props.region,
            queueUrl: this.props.queueUrl,
          });
          if (outcome === "completed" || outcome === "rejected") {
            await this.client.send(
              new DeleteMessageCommand({
                QueueUrl: this.props.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
            processed += 1;
          } else if (outcome === "retry") {
            await this.client.send(
              new ChangeMessageVisibilityCommand({
                QueueUrl: this.props.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
                VisibilityTimeout: 30,
              }),
            );
          }
          continue;
        }

        if (type === IMPORT_UPLOAD_DETECT_MESSAGE_TYPE) {
          const outcome = await processImportUploadDetectJob({
            job: parsed as unknown as ImportUploadDetectMessage,
            databaseUrl: this.props.databaseUrl,
            region: this.props.region,
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
          continue;
        }

        if (type === IMPORT_EXECUTE_MESSAGE_TYPE) {
          const outcome = await processImportExecuteJob({
            raw: parsed,
            databaseUrl: this.props.databaseUrl,
          });
          if (outcome === "completed" || outcome === "rejected") {
            await this.client.send(
              new DeleteMessageCommand({
                QueueUrl: this.props.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
            processed += 1;
          } else if (outcome === "retry") {
            await this.client.send(
              new ChangeMessageVisibilityCommand({
                QueueUrl: this.props.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
                VisibilityTimeout: 30,
              }),
            );
          }
          continue;
        }

        this.logger.warn("unknown import queue message type", { type });
        await this.client.send(
          new DeleteMessageCommand({
            QueueUrl: this.props.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      } catch (error) {
        this.logger.error("import queue message failed", { error });
      }
    }
    return processed;
  }
}

/** @deprecated Use ImportSqsConsumer */
export { ImportSqsConsumer as ImportUploadSqsConsumer };
