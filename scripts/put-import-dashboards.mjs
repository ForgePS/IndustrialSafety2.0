#!/usr/bin/env node
/**
 * Puts CloudWatch dashboards for Import Platform S8 observability.
 * Does not use high-cardinality tenant IDs as metric dimensions.
 *
 * Usage: node scripts/put-import-dashboards.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const region = process.env.AWS_REGION || "us-east-1";
const profile = process.env.AWS_PROFILE || "forge-dev";
const envName = "development";
const cluster = "forge-development-ecs-platform";
const apiService = "forge-development-ecs-platform-api";
const workerService = "forge-development-ecs-worker-service";
const importsQ = "forge-development-sqs-imports";
const importsDlq = "forge-development-sqs-imports-dlq";
const auroraCluster = "forge-development-rds-aurora";
const secNs = "ForgePlatform/ImportSecurity";

function metric(ns, name, dims, stat = "Sum") {
  return [ns, name, ...dims.flatMap(([k, v]) => [k, v]), { stat, period: 300 }];
}

function putDashboard(name, widgets) {
  const path = join(tmpdir(), `forge-${name}.json`);
  writeFileSync(path, JSON.stringify({ widgets }));
  const result = spawnSync(
    "aws",
    [
      "cloudwatch",
      "put-dashboard",
      "--dashboard-name",
      name,
      "--dashboard-body",
      `file://${path}`,
      "--profile",
      profile,
      "--region",
      region,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`OK ${name}`);
}

const queueDims = [["QueueName", importsQ]];
const dlqDims = [["QueueName", importsDlq]];
const envDim = [["Environment", envName]];

putDashboard("ForgePlatform-Development-Import-Operations", [
  {
    type: "metric",
    x: 0,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "Imports queue depth",
      region,
      metrics: [
        ["AWS/SQS", "ApproximateNumberOfMessagesVisible", ...queueDims.flatMap(([k, v]) => [k, v])],
        [".", "ApproximateNumberOfMessagesNotVisible", ".", "."],
      ],
      view: "timeSeries",
      period: 60,
      stat: "Average",
    },
  },
  {
    type: "metric",
    x: 12,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "Imports DLQ depth",
      region,
      metrics: [
        ["AWS/SQS", "ApproximateNumberOfMessagesVisible", ...dlqDims.flatMap(([k, v]) => [k, v])],
        [".", "ApproximateAgeOfOldestMessage", ".", "."],
      ],
      view: "timeSeries",
      period: 60,
    },
  },
  {
    type: "metric",
    x: 0,
    y: 6,
    width: 24,
    height: 6,
    properties: {
      title: "Worker CPU / memory",
      region,
      metrics: [
        ["AWS/ECS", "CPUUtilization", "ServiceName", workerService, "ClusterName", cluster],
        [".", "MemoryUtilization", ".", ".", ".", "."],
      ],
      view: "timeSeries",
      period: 60,
      stat: "Average",
    },
  },
]);

putDashboard("ForgePlatform-Development-Import-Security", [
  {
    type: "metric",
    x: 0,
    y: 0,
    width: 24,
    height: 6,
    properties: {
      title: "Import malware / gate EMF",
      region,
      metrics: [
        [secNs, "ImportScanCompleted", "Environment", envName, { stat: "Sum", period: 300 }],
        [".", "ImportScanClean", ".", ".", { stat: "Sum", period: 300 }],
        [".", "ImportFileQuarantined", ".", ".", { stat: "Sum", period: 300 }],
        [".", "ImportSecurityGateDenied", ".", ".", { stat: "Sum", period: 300 }],
        [".", "ImportProductionScannerBlocked", ".", ".", { stat: "Sum", period: 300 }],
      ],
      view: "timeSeries",
    },
  },
]);

putDashboard("ForgePlatform-Development-Import-Queue-Worker", [
  {
    type: "metric",
    x: 0,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "Queue age",
      region,
      metrics: [["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", importsQ]],
      view: "timeSeries",
      period: 60,
      stat: "Maximum",
    },
  },
  {
    type: "metric",
    x: 12,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "API + worker running tasks",
      region,
      metrics: [
        [
          "ECS/ContainerInsights",
          "RunningTaskCount",
          "ServiceName",
          apiService,
          "ClusterName",
          cluster,
        ],
        [".", ".", "ServiceName", workerService, "ClusterName", cluster],
      ],
      view: "timeSeries",
      period: 60,
      stat: "Average",
    },
  },
]);

putDashboard("ForgePlatform-Development-Import-Performance", [
  {
    type: "metric",
    x: 0,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "Aurora CPU / connections",
      region,
      metrics: [
        ["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", "forge-development-rds-aurora"],
        [".", "DatabaseConnections", ".", "."],
      ],
      view: "timeSeries",
      period: 60,
      stat: "Average",
    },
  },
  {
    type: "metric",
    x: 12,
    y: 0,
    width: 12,
    height: 6,
    properties: {
      title: "API target 5xx",
      region,
      metrics: [["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count"]],
      view: "timeSeries",
      period: 60,
      stat: "Sum",
    },
  },
]);

putDashboard("ForgePlatform-Development-Import-Tenant-Access", [
  {
    type: "log",
    x: 0,
    y: 0,
    width: 24,
    height: 6,
    properties: {
      title: "Cross-tenant / auth denials (sanitized search)",
      region,
      query: `SOURCE '/forge/development/platform-api'
| fields @timestamp, @message
| filter @message like /IMPORT_.*DENIED|FORBIDDEN|tenant|cross-tenant|IMPORT_TENANT/
| sort @timestamp desc
| limit 40`,
      view: "table",
    },
  },
]);

console.log("Import dashboards published.");
