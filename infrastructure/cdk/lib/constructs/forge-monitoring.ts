import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeMonitoringProps {
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
  /** Optional CloudFront distribution IDs for edge error alarms. */
  apiCloudFrontDistributionId?: string;
  rmsCloudFrontDistributionId?: string;
  /**
   * Prefer the Alerting stack ops topic when provided so Monitoring does not
   * recreate forge-*-sns-alarms (name collision / dual-subscription risk).
   */
  alarmTopic?: sns.ITopic;
}

export class ForgeMonitoring extends Construct {
  readonly alarmTopic: sns.ITopic;
  readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ForgeMonitoringProps) {
    super(scope, id);
    const { config } = props;

    this.alarmTopic =
      props.alarmTopic ??
      new sns.Topic(this, "AlarmTopic", {
        topicName: resourceName(config, "sns", "alarms"),
        displayName: `Forge ${config.environmentName} operational alarms`,
      });

    // Email subscription lives on AlertingStack when shared topics are used.
    if (!props.alarmTopic) {
      const alertEmail = process.env.FORGE_ALERT_EMAIL?.trim();
      if (alertEmail && alertEmail.includes("@") && this.alarmTopic instanceof sns.Topic) {
        new sns.Subscription(this, "AlarmEmailSubscription", {
          topic: this.alarmTopic,
          protocol: sns.SubscriptionProtocol.EMAIL,
          endpoint: alertEmail,
        });
      }
    }

    const envLabel = config.environmentName
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");

    this.dashboard = new cloudwatch.Dashboard(this, "Overview", {
      dashboardName: `ForgePlatform-${envLabel}-Overview`,
    });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API CPU / memory",
        left: [props.apiService.metricCpuUtilization()],
        right: [props.apiService.metricMemoryUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: "Worker CPU / memory",
        left: [props.workerService.metricCpuUtilization()],
        right: [props.workerService.metricMemoryUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: "ALB requests / errors",
        left: [props.alb.metrics.requestCount()],
        right: [
          props.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_4XX_COUNT),
          props.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Target response time",
        left: [props.alb.metrics.targetResponseTime()],
      }),
      new cloudwatch.GraphWidget({
        title: "Database CPU / connections",
        left: [props.databaseCluster.metricCPUUtilization()],
        right: [props.databaseCluster.metricDatabaseConnections()],
      }),
      new cloudwatch.GraphWidget({
        title: "Queue depth / DLQ",
        left: [props.importsQueue.metricApproximateNumberOfMessagesVisible()],
        right: [
          props.importsDlq.metricApproximateNumberOfMessagesVisible(),
          props.notificationsDlq.metricApproximateNumberOfMessagesVisible(),
          props.documentsDlq.metricApproximateNumberOfMessagesVisible(),
          props.integrationDlq.metricApproximateNumberOfMessagesVisible(),
          ...(props.cadIntakeDlq
            ? [props.cadIntakeDlq.metricApproximateNumberOfMessagesVisible()]
            : []),
        ],
      }),
    );

    const snsAction = new cloudwatch_actions.SnsAction(this.alarmTopic);

    new cloudwatch.Alarm(this, "UnhealthyTargets", {
      alarmName: resourceName(config, "alarm", "api-unhealthy"),
      metric: props.apiTargetGroup.metrics.unhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "Api5xx", {
      alarmName: resourceName(config, "alarm", "api-5xx"),
      metric: props.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "DbHighCpu", {
      alarmName: resourceName(config, "alarm", "db-cpu"),
      metric: props.databaseCluster.metricCPUUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(snsAction);

    const dlqAlarms: Array<[string, sqs.IQueue]> = [
      ["ImportsDlq", props.importsDlq],
      ["NotificationsDlq", props.notificationsDlq],
      ["DocumentsDlq", props.documentsDlq],
      ["IntegrationDlq", props.integrationDlq],
    ];
    if (props.cadIntakeDlq) dlqAlarms.push(["CadIntakeDlq", props.cadIntakeDlq]);
    if (props.cadNormalizationDlq) {
      dlqAlarms.push(["CadNormalizationDlq", props.cadNormalizationDlq]);
    }
    if (props.cadMatchingDlq) dlqAlarms.push(["CadMatchingDlq", props.cadMatchingDlq]);
    if (props.cadApplicationDlq) dlqAlarms.push(["CadApplicationDlq", props.cadApplicationDlq]);
    if (props.cadPollingDlq) dlqAlarms.push(["CadPollingDlq", props.cadPollingDlq]);
    if (props.cadRetentionDlq) dlqAlarms.push(["CadRetentionDlq", props.cadRetentionDlq]);
    if (props.reportingSchedulesDlq) {
      dlqAlarms.push(["ReportingSchedulesDlq", props.reportingSchedulesDlq]);
    }

    for (const [idSuffix, queue] of dlqAlarms) {
      new cloudwatch.Alarm(this, `${idSuffix}Alarm`, {
        alarmName: resourceName(config, "alarm", idSuffix.toLowerCase()),
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(snsAction);
    }

    new cloudwatch.Alarm(this, "ImportsBacklog", {
      alarmName: resourceName(config, "alarm", "imports-backlog"),
      metric: props.importsQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 100,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "ImportsQueueAge", {
      alarmName: resourceName(config, "alarm", "imports-queue-age"),
      metric: props.importsQueue.metricApproximateAgeOfOldestMessage(),
      threshold: 900,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "WorkerRunningTasks", {
      alarmName: resourceName(config, "alarm", "worker-running-tasks"),
      metric: new cloudwatch.Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ClusterName: props.workerService.cluster.clusterName,
          ServiceName: props.workerService.serviceName,
        },
        statistic: "Average",
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }).addAlarmAction(snsAction);

    const importSecurityNs = "ForgePlatform/ImportSecurity";
    const importEnvDim = { Environment: config.environmentName };
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Import security scans",
        left: [
          new cloudwatch.Metric({
            namespace: importSecurityNs,
            metricName: "ImportScanCompleted",
            dimensionsMap: importEnvDim,
            statistic: "Sum",
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: importSecurityNs,
            metricName: "ImportFileQuarantined",
            dimensionsMap: importEnvDim,
            statistic: "Sum",
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: importSecurityNs,
            metricName: "ImportProductionScannerBlocked",
            dimensionsMap: importEnvDim,
            statistic: "Sum",
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Imports queue age / depth",
        left: [
          props.importsQueue.metricApproximateNumberOfMessagesVisible(),
          props.importsQueue.metricApproximateAgeOfOldestMessage(),
        ],
        right: [props.importsDlq.metricApproximateNumberOfMessagesVisible()],
      }),
    );

    new cloudwatch.Alarm(this, "ImportProductionScannerBlocked", {
      alarmName: resourceName(config, "alarm", "import-scanner-blocked"),
      metric: new cloudwatch.Metric({
        namespace: importSecurityNs,
        metricName: "ImportProductionScannerBlocked",
        dimensionsMap: importEnvDim,
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "ApiRunningTasks", {
      alarmName: resourceName(config, "alarm", "api-running-tasks"),
      metric: new cloudwatch.Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ClusterName: props.apiService.cluster.clusterName,
          ServiceName: props.apiService.serviceName,
        },
        statistic: "Average",
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "DbConnections", {
      alarmName: resourceName(config, "alarm", "db-connections"),
      metric: props.databaseCluster.metricDatabaseConnections(),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(snsAction);

    if (props.apiCloudFrontDistributionId) {
      const apiCf5xx = new cloudwatch.Metric({
        namespace: "AWS/CloudFront",
        metricName: "5xxErrorRate",
        dimensionsMap: {
          DistributionId: props.apiCloudFrontDistributionId,
          Region: "Global",
        },
        statistic: "Average",
        period: cdk.Duration.minutes(5),
      });
      this.dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: "API CloudFront 5xx error rate",
          left: [apiCf5xx],
        }),
      );
      new cloudwatch.Alarm(this, "ApiCloudFront5xx", {
        alarmName: resourceName(config, "alarm", "api-cf-5xx"),
        metric: apiCf5xx,
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(snsAction);
    }

    if (props.rmsCloudFrontDistributionId) {
      const rmsCf5xx = new cloudwatch.Metric({
        namespace: "AWS/CloudFront",
        metricName: "5xxErrorRate",
        dimensionsMap: {
          DistributionId: props.rmsCloudFrontDistributionId,
          Region: "Global",
        },
        statistic: "Average",
        period: cdk.Duration.minutes(5),
      });
      this.dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: "RMS CloudFront 5xx error rate",
          left: [rmsCf5xx],
        }),
      );
      new cloudwatch.Alarm(this, "RmsCloudFront5xx", {
        alarmName: resourceName(config, "alarm", "rms-cf-5xx"),
        metric: rmsCf5xx,
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(snsAction);
    }

    if (config.features.enableBudget && config.features.monthlyBudgetUsd) {
      cdk.Tags.of(this).add("BudgetUsd", String(config.features.monthlyBudgetUsd));
    }
  }
}
