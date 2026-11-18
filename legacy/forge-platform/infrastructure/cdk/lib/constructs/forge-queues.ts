import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeQueuesProps {
  config: ForgeEnvironmentConfig;
  encryptionKey: kms.IKey;
}

function queuePair(
  scope: Construct,
  config: ForgeEnvironmentConfig,
  key: kms.IKey,
  purpose: string,
) {
  const dlq = new sqs.Queue(scope, `${purpose}Dlq`, {
    queueName: resourceName(config, "sqs", `${purpose}-dlq`),
    encryption: sqs.QueueEncryption.KMS,
    encryptionMasterKey: key,
    retentionPeriod: cdk.Duration.days(14),
  });
  const queue = new sqs.Queue(scope, `${purpose}Queue`, {
    queueName: resourceName(config, "sqs", purpose),
    encryption: sqs.QueueEncryption.KMS,
    encryptionMasterKey: key,
    visibilityTimeout: cdk.Duration.minutes(5),
    retentionPeriod: cdk.Duration.days(4),
    deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
  });
  return { queue, dlq };
}

export class ForgeQueues extends Construct {
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

  constructor(scope: Construct, id: string, props: ForgeQueuesProps) {
    super(scope, id);
    const { config, encryptionKey } = props;

    const imports = queuePair(this, config, encryptionKey, "imports");
    this.imports = imports.queue;
    this.importsDlq = imports.dlq;

    const notifications = queuePair(this, config, encryptionKey, "notifications");
    this.notifications = notifications.queue;
    this.notificationsDlq = notifications.dlq;

    const documents = queuePair(this, config, encryptionKey, "documents");
    this.documents = documents.queue;
    this.documentsDlq = documents.dlq;

    const integration = queuePair(this, config, encryptionKey, "integration-events");
    this.integrationEvents = integration.queue;
    this.integrationEventsDlq = integration.dlq;

    const cadIntake = queuePair(this, config, encryptionKey, "cad-intake");
    this.cadIntake = cadIntake.queue;
    this.cadIntakeDlq = cadIntake.dlq;

    const cadNormalization = queuePair(this, config, encryptionKey, "cad-normalization");
    this.cadNormalization = cadNormalization.queue;
    this.cadNormalizationDlq = cadNormalization.dlq;

    const cadMatching = queuePair(this, config, encryptionKey, "cad-matching");
    this.cadMatching = cadMatching.queue;
    this.cadMatchingDlq = cadMatching.dlq;

    const cadApplication = queuePair(this, config, encryptionKey, "cad-application");
    this.cadApplication = cadApplication.queue;
    this.cadApplicationDlq = cadApplication.dlq;

    const cadPolling = queuePair(this, config, encryptionKey, "cad-polling");
    this.cadPolling = cadPolling.queue;
    this.cadPollingDlq = cadPolling.dlq;

    const cadRetention = queuePair(this, config, encryptionKey, "cad-retention");
    this.cadRetention = cadRetention.queue;
    this.cadRetentionDlq = cadRetention.dlq;

    const reportingSchedules = queuePair(this, config, encryptionKey, "reporting-schedules");
    this.reportingSchedules = reportingSchedules.queue;
    this.reportingSchedulesDlq = reportingSchedules.dlq;

    this.eventBus = new events.EventBus(this, "DomainEvents", {
      eventBusName: resourceName(config, "events", "domain"),
    });

    const domainEventsRule = new events.Rule(this, "DomainEventsToIntegration", {
      eventBus: this.eventBus,
      ruleName: resourceName(config, "events", "domain-to-integration"),
      description: "Route forge.platform domain events to the integration-events queue",
      eventPattern: {
        source: ["forge.platform"],
      },
    });
    domainEventsRule.addTarget(
      new targets.SqsQueue(this.integrationEvents, {
        deadLetterQueue: this.integrationEventsDlq,
      }),
    );

    const cadPollingSchedule = new events.Rule(this, "CadPollingSchedule", {
      ruleName: resourceName(config, "events", "cad-polling"),
      description: "Enqueue CAD polling ticks every minute for worker consumption",
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
    });
    cadPollingSchedule.addTarget(
      new targets.SqsQueue(this.cadPolling, {
        message: events.RuleTargetInput.fromObject({
          type: "cad.polling.tick.v1",
        }),
      }),
    );

    const cadRetentionSchedule = new events.Rule(this, "CadRetentionSchedule", {
      ruleName: resourceName(config, "events", "cad-retention"),
      description: "Enqueue CAD retention runs daily for worker consumption",
      schedule: events.Schedule.cron({ minute: "15", hour: "7" }),
    });
    cadRetentionSchedule.addTarget(
      new targets.SqsQueue(this.cadRetention, {
        message: events.RuleTargetInput.fromObject({
          type: "cad.retention.run.v1",
        }),
      }),
    );

    const reportingSchedulesRule = new events.Rule(this, "ReportingSchedulesRunDue", {
      ruleName: resourceName(config, "events", "reporting-schedules"),
      description: "Enqueue reporting schedule run-due sweeps hourly for worker consumption",
      schedule: events.Schedule.cron({ minute: "5" }),
    });
    reportingSchedulesRule.addTarget(
      new targets.SqsQueue(this.reportingSchedules, {
        message: events.RuleTargetInput.fromObject({
          type: "reporting.schedules.run_due.v1",
        }),
      }),
    );
  }
}
