import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as events from "aws-cdk-lib/aws-events";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeImportExecutionStateMachine } from "../constructs/forge-import-execution-sfn.js";
import { ForgeQueues } from "../constructs/forge-queues.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface MessagingStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  encryptionKey: kms.IKey;
}

export class MessagingStack extends cdk.Stack {
  readonly queues: ForgeQueues;
  readonly imports: sqs.Queue;
  readonly importsDlq: sqs.Queue;
  readonly notifications: sqs.Queue;
  readonly notificationsDlq: sqs.Queue;
  readonly documents: sqs.Queue;
  readonly documentsDlq: sqs.Queue;
  readonly integrationEvents: sqs.Queue;
  readonly integrationEventsDlq: sqs.Queue;
  readonly cadIntake: sqs.Queue;
  readonly cadIntakeDlq: sqs.Queue;
  readonly cadNormalization: sqs.Queue;
  readonly cadNormalizationDlq: sqs.Queue;
  readonly cadMatching: sqs.Queue;
  readonly cadMatchingDlq: sqs.Queue;
  readonly cadApplication: sqs.Queue;
  readonly cadApplicationDlq: sqs.Queue;
  readonly cadPolling: sqs.Queue;
  readonly cadPollingDlq: sqs.Queue;
  readonly cadRetention: sqs.Queue;
  readonly cadRetentionDlq: sqs.Queue;
  readonly reportingSchedules: sqs.Queue;
  readonly reportingSchedulesDlq: sqs.Queue;
  readonly eventBus: events.EventBus;
  readonly importExecutionStateMachine?: ForgeImportExecutionStateMachine;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Messaging"),
    });

    this.queues = new ForgeQueues(this, "Queues", {
      config: props.config,
      encryptionKey: props.encryptionKey,
    });
    this.imports = this.queues.imports;
    this.importsDlq = this.queues.importsDlq;
    this.notifications = this.queues.notifications;
    this.notificationsDlq = this.queues.notificationsDlq;
    this.documents = this.queues.documents;
    this.documentsDlq = this.queues.documentsDlq;
    this.integrationEvents = this.queues.integrationEvents;
    this.integrationEventsDlq = this.queues.integrationEventsDlq;
    this.cadIntake = this.queues.cadIntake;
    this.cadIntakeDlq = this.queues.cadIntakeDlq;
    this.cadNormalization = this.queues.cadNormalization;
    this.cadNormalizationDlq = this.queues.cadNormalizationDlq;
    this.cadMatching = this.queues.cadMatching;
    this.cadMatchingDlq = this.queues.cadMatchingDlq;
    this.cadApplication = this.queues.cadApplication;
    this.cadApplicationDlq = this.queues.cadApplicationDlq;
    this.cadPolling = this.queues.cadPolling;
    this.cadPollingDlq = this.queues.cadPollingDlq;
    this.cadRetention = this.queues.cadRetention;
    this.cadRetentionDlq = this.queues.cadRetentionDlq;
    this.reportingSchedules = this.queues.reportingSchedules;
    this.reportingSchedulesDlq = this.queues.reportingSchedulesDlq;
    this.eventBus = this.queues.eventBus;

    // S5: definition is deployment-ready. Keep inactive until EventBridge Pipe wiring is authorized.
    // Operational execution uses ECS worker polling SQS.
    this.importExecutionStateMachine = new ForgeImportExecutionStateMachine(
      this,
      "ImportExecutionSfn",
      {
        config: props.config,
        importsQueue: this.imports,
        activate: false,
      },
    );

    exportValue(this, `${id}-EventBusName`, this.eventBus.eventBusName, "Domain event bus");
    exportValue(this, `${id}-ImportsQueueUrl`, this.imports.queueUrl, "Imports queue URL");
    exportValue(this, `${id}-CadIntakeQueueUrl`, this.cadIntake.queueUrl, "CAD intake queue URL");
    exportValue(
      this,
      `${id}-ImportExecutionStateMachineArn`,
      this.importExecutionStateMachine.stateMachine.stateMachineArn,
      "Import execution state machine ARN (S5 inactive)",
    );
  }
}
