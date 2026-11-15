import { Inject, Injectable } from "@nestjs/common";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { ForgeEnvironment } from "@forge/environment";
import {
  createImportUploadDetectMessage,
  type ImportExecuteMessage,
  type ImportMalwareScanMessage,
  type ImportUploadDetectMessage,
} from "@forge/imports";
import { APP_ENV } from "../../tokens.js";

@Injectable()
export class ImportQueueService {
  private readonly sqs: SQSClient;

  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {
    this.sqs = new SQSClient({ region: this.env.AWS_REGION });
  }

  get queueUrl(): string {
    return this.env.SQS_IMPORT_QUEUE_URL;
  }

  async enqueueDetect(input: Omit<ImportUploadDetectMessage, "type" | "version" | "enqueuedAt">) {
    const body = createImportUploadDetectMessage(input);
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(body),
        MessageAttributes: {
          messageType: {
            DataType: "String",
            StringValue: body.type,
          },
          tenantId: {
            DataType: "String",
            StringValue: body.tenantId,
          },
        },
      }),
    );
    return body;
  }

  async enqueueMalwareScan(message: ImportMalwareScanMessage) {
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          messageType: {
            DataType: "String",
            StringValue: message.messageType,
          },
          tenantId: {
            DataType: "String",
            StringValue: message.tenantId,
          },
          correlationId: {
            DataType: "String",
            StringValue: message.correlationId,
          },
        },
      }),
    );
    return message;
  }

  async enqueueExecute(message: ImportExecuteMessage) {
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          messageType: {
            DataType: "String",
            StringValue: message.messageType,
          },
          tenantId: {
            DataType: "String",
            StringValue: message.tenantId,
          },
          correlationId: {
            DataType: "String",
            StringValue: message.correlationId,
          },
        },
      }),
    );
    return message;
  }
}
