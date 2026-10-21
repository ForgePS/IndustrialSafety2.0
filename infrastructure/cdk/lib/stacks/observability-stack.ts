import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { ForgeLogging } from "../constructs/forge-logging.js";
import { ForgeMonitoring } from "../constructs/forge-monitoring.js";
import { stackName } from "../utils/naming.js";
import { exportValue } from "../utils/outputs.js";

export interface ObservabilityStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  logsKey: kms.IKey;
}

/**
 * Logging is created here first so Compute can depend on it without a cycle.
 * Dashboards/alarms live in {@link MonitoringStack}, which depends on Compute.
 */
export class ObservabilityStack extends cdk.Stack {
  readonly logging: ForgeLogging;
  readonly apiLogGroup: logs.LogGroup;
  readonly workerLogGroup: logs.LogGroup;
  readonly databaseLogGroup: logs.LogGroup;
  readonly wafLogGroup: logs.LogGroup;
  readonly migrationLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Observability"),
    });

    this.logging = new ForgeLogging(this, "Logging", {
      config: props.config,
      logsKey: props.logsKey,
    });
    this.apiLogGroup = this.logging.platformApi;
    this.workerLogGroup = this.logging.workerService;
    this.databaseLogGroup = this.logging.database;
    this.wafLogGroup = this.logging.waf;
    this.migrationLogGroup = this.logging.migration;

    exportValue(this, `${id}-ApiLogGroup`, this.apiLogGroup.logGroupName, "platform-api log group");
  }
}

export interface MonitoringStackProps extends cdk.StackProps {
  config: ForgeEnvironmentConfig;
  apiService: ecs.FargateService;
  workerService: ecs.FargateService;
  alb: elbv2.ApplicationLoadBalancer;
  apiTargetGroup: elbv2.ApplicationTargetGroup;
  databaseCluster: rds.DatabaseCluster;
  importsQueue: sqs.IQueue;
  importsDlq: sqs.IQueue;
  notificationsDlq: sqs.IQueue;
  documentsDlq: sqs.IQueue;
  integrationDlq: sqs.IQueue;
  cadIntakeDlq?: sqs.IQueue;
  cadNormalizationDlq?: sqs.IQueue;
  cadMatchingDlq?: sqs.IQueue;
  cadApplicationDlq?: sqs.IQueue;
  cadPollingDlq?: sqs.IQueue;
  cadRetentionDlq?: sqs.IQueue;
  reportingSchedulesDlq?: sqs.IQueue;
  apiCloudFrontDistributionId?: string;
  rmsCloudFrontDistributionId?: string;
  /** Shared ops topic from AlertingStack when available. */
  alarmTopic?: sns.ITopic;
}

/** Dashboards and alarms — depends on Compute/Data/Messaging (no cycle with logging). */
export class MonitoringStack extends cdk.Stack {
  readonly monitoring: ForgeMonitoring;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, {
      ...props,
      stackName: stackName(props.config, "Monitoring"),
    });

    this.monitoring = new ForgeMonitoring(this, "Monitoring", {
      config: props.config,
      apiService: props.apiService,
      workerService: props.workerService,
      alb: props.alb,
      apiTargetGroup: props.apiTargetGroup,
      databaseCluster: props.databaseCluster,
      importsQueue: props.importsQueue,
      importsDlq: props.importsDlq,
      notificationsDlq: props.notificationsDlq,
      documentsDlq: props.documentsDlq,
      integrationDlq: props.integrationDlq,
      cadIntakeDlq: props.cadIntakeDlq,
      cadNormalizationDlq: props.cadNormalizationDlq,
      cadMatchingDlq: props.cadMatchingDlq,
      cadApplicationDlq: props.cadApplicationDlq,
      cadPollingDlq: props.cadPollingDlq,
      cadRetentionDlq: props.cadRetentionDlq,
      reportingSchedulesDlq: props.reportingSchedulesDlq,
      apiCloudFrontDistributionId: props.apiCloudFrontDistributionId,
      rmsCloudFrontDistributionId: props.rmsCloudFrontDistributionId,
      alarmTopic: props.alarmTopic,
    });

    exportValue(
      this,
      `${id}-DashboardName`,
      this.monitoring.dashboard.dashboardName ?? "overview",
      "CloudWatch dashboard name",
    );
  }
}
