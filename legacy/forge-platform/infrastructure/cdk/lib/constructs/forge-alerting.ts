import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeAlertingProps {
  config: ForgeEnvironmentConfig;
  /** Prefer Security stack general CMK when available. */
  masterKey?: kms.IKey;
}

/**
 * Operational SNS foundation for alarms/security/SES events.
 * Human email subscription is optional via FORGE_ALERT_EMAIL and requires
 * outbound confirmation before delivery is considered active.
 */
export class ForgeAlerting extends Construct {
  readonly opsTopic: sns.Topic;
  readonly securityTopic: sns.Topic;
  readonly sesEventsTopic: sns.Topic;
  readonly emailSubscriptionConfigured: boolean;

  constructor(scope: Construct, id: string, props: ForgeAlertingProps) {
    super(scope, id);
    const { config, masterKey } = props;

    const topicProps = (purpose: string, displayName: string): sns.TopicProps => ({
      topicName: resourceName(config, "sns", purpose),
      displayName,
      masterKey,
      enforceSSL: true,
    });

    this.opsTopic = new sns.Topic(
      this,
      "OpsAlarms",
      topicProps("alarms", `Forge ${config.environmentName} operational alarms`),
    );
    this.securityTopic = new sns.Topic(
      this,
      "SecurityAlarms",
      topicProps("security-alarms", `Forge ${config.environmentName} security alarms`),
    );
    this.sesEventsTopic = new sns.Topic(
      this,
      "SesEvents",
      topicProps("ses-events", `Forge ${config.environmentName} SES bounce/complaint events`),
    );

    cdk.Tags.of(this.opsTopic).add("AlertChannel", "ops");
    cdk.Tags.of(this.securityTopic).add("AlertChannel", "security");
    cdk.Tags.of(this.sesEventsTopic).add("AlertChannel", "ses");

    const alertEmail = process.env.FORGE_ALERT_EMAIL?.trim();
    this.emailSubscriptionConfigured = Boolean(alertEmail && alertEmail.includes("@"));
    if (this.emailSubscriptionConfigured && alertEmail) {
      // Pending confirmation until the recipient accepts the AWS email.
      this.opsTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
      this.securityTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }
  }
}
