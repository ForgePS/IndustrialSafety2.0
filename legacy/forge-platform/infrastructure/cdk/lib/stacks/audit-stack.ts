import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeCloudTrail } from "../constructs/forge-cloudtrail.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface AuditStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  storageKey: kms.IKey;
  logsKey: kms.IKey;
  /** Buckets that receive targeted CloudTrail S3 WriteOnly data events. */
  dataEventBuckets?: s3.IBucket[];
  /** Optional shared security alarm topic from AlertingStack. */
  alarmTopic?: sns.ITopic;
}

/**
 * CloudTrail and related security audit telemetry (SOC 2 CC-LOG-01).
 * Instantiate only when config.features.enableCloudTrail is true.
 */
export class AuditStack extends cdk.Stack {
  readonly cloudTrail: ForgeCloudTrail;

  constructor(scope: Construct, id: string, props: AuditStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Audit"),
    });

    this.cloudTrail = new ForgeCloudTrail(this, "CloudTrail", {
      config: props.config,
      storageKey: props.storageKey,
      logsKey: props.logsKey,
      dataEventBuckets: props.dataEventBuckets,
      alarmTopic: props.alarmTopic,
    });

    exportValue(this, `${id}-TrailName`, this.cloudTrail.trailName, "CloudTrail trail name");
    exportValue(
      this,
      `${id}-TrailBucketName`,
      this.cloudTrail.bucket.bucketName,
      "CloudTrail S3 bucket name",
    );
    exportValue(
      this,
      `${id}-TrailLogGroupName`,
      this.cloudTrail.logGroup.logGroupName,
      "CloudTrail CloudWatch log group",
    );
    exportValue(
      this,
      `${id}-SecurityAlarmTopicArn`,
      this.cloudTrail.alarmTopic.topicArn,
      "CloudTrail security alarm SNS topic",
    );
  }
}
