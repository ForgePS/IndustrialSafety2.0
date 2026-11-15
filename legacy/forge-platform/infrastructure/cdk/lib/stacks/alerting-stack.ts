import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeAlerting } from "../constructs/forge-alerting.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface AlertingStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  masterKey?: kms.IKey;
}

/**
 * SNS operational alerting foundation — no Compute dependency.
 * CloudWatch alarms attach in Monitoring after Compute exists.
 */
export class AlertingStack extends cdk.Stack {
  readonly alerting: ForgeAlerting;
  readonly opsTopic: sns.Topic;
  readonly securityTopic: sns.Topic;
  readonly sesEventsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: AlertingStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Alerting"),
    });

    this.alerting = new ForgeAlerting(this, "Alerting", {
      config: props.config,
      masterKey: props.masterKey,
    });
    this.opsTopic = this.alerting.opsTopic;
    this.securityTopic = this.alerting.securityTopic;
    this.sesEventsTopic = this.alerting.sesEventsTopic;

    exportValue(this, `${id}-OpsTopicArn`, this.opsTopic.topicArn, "Operational SNS topic ARN");
    exportValue(
      this,
      `${id}-SecurityTopicArn`,
      this.securityTopic.topicArn,
      "Security SNS topic ARN",
    );
    exportValue(
      this,
      `${id}-SesEventsTopicArn`,
      this.sesEventsTopic.topicArn,
      "SES bounce/complaint SNS topic ARN",
    );
    exportValue(
      this,
      `${id}-EmailSubscriptionConfigured`,
      this.alerting.emailSubscriptionConfigured ? "true" : "false",
      "Whether FORGE_ALERT_EMAIL created pending email subscriptions",
    );
  }
}
