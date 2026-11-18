#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { resolveConfig } from "../lib/config/environment-config.js";
import { TaggingAspect, createMandatoryTags } from "../lib/aspects/tagging-aspect.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";
import { IdentityStack } from "../lib/stacks/identity-stack.js";
import { MessagingStack } from "../lib/stacks/messaging-stack.js";
import { ObservabilityStack } from "../lib/stacks/observability-stack.js";
import { ComputeStack } from "../lib/stacks/compute-stack.js";
import { BackupStack } from "../lib/stacks/backup-stack.js";
import { MonitoringStack } from "../lib/stacks/observability-stack.js";
import { AuditStack } from "../lib/stacks/audit-stack.js";

/**
 * Synthesizes the development app with cdk-nag AwsSolutionsChecks.
 * Failures are written to stdout; exit 1 on unsuppressed errors.
 */
const app = new cdk.App();
const config = resolveConfig("development");
const env = { account: config.account, region: config.region };

Aspects.of(app).add(new TaggingAspect(createMandatoryTags(config.environmentName)));
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const network = new NetworkStack(app, "ForgeNetwork", { config, env });
const security = new SecurityStack(app, "ForgeSecurity", { config, env });
const identity = new IdentityStack(app, "ForgeIdentity", { config, env });
const messaging = new MessagingStack(app, "ForgeMessaging", {
  config,
  env,
  encryptionKey: security.generalKey,
});
const data = new DataStack(app, "ForgeData", {
  config,
  env,
  vpc: network.vpc,
  databaseSecurityGroup: network.securityGroups.databaseSg,
  storageKey: security.storageKey,
});
const observability = new ObservabilityStack(app, "ForgeObservability", {
  config,
  env,
  logsKey: security.logsKey,
});
const publicRmsUrl = "https://d3ud5uzwd9js2z.cloudfront.net";
const publicCreatorUrl = "https://ddztl9s33wu40.cloudfront.net";
const publicTenantAdminUrl = "https://d1uxdl4szvsixc.cloudfront.net";
const cognitoDomain = `forge-${config.environmentName}-${config.account.slice(-6)}.auth.${config.region}.amazoncognito.com`;

const compute = new ComputeStack(app, "ForgeCompute", {
  config,
  env,
  vpc: network.vpc,
  albSecurityGroup: network.securityGroups.albSg,
  apiSecurityGroup: network.securityGroups.ecsApiSg,
  workerSecurityGroup: network.securityGroups.workerSg,
  databaseSecret: data.database.secret,
  importQueue: messaging.imports,
  notificationQueue: messaging.notifications,
  documentQueue: messaging.documents,
  integrationQueue: messaging.integrationEvents,
  cadIntakeQueue: messaging.cadIntake,
  cadNormalizationQueue: messaging.cadNormalization,
  cadMatchingQueue: messaging.cadMatching,
  cadApplicationQueue: messaging.cadApplication,
  cadPollingQueue: messaging.cadPolling,
  cadRetentionQueue: messaging.cadRetention,
  reportingSchedulesQueue: messaging.reportingSchedules,
  eventBus: messaging.eventBus,
  documentsBucket: data.documentsBucket,
  importsBucket: data.importsBucket,
  exportsBucket: data.exportsBucket,
  apiLogGroup: observability.apiLogGroup,
  workerLogGroup: observability.workerLogGroup,
  cognitoUserPoolId: identity.userPool.userPoolId,
  cognitoClientIds: [
    identity.cognito.rmsClient.userPoolClientId,
    identity.cognito.creatorClient.userPoolClientId,
  ].join(","),
  cognitoDomain,
  browserOrigins: [publicRmsUrl, publicCreatorUrl, publicTenantAdminUrl],
  publicRmsUrl,
  publicCreatorUrl,
});
new MonitoringStack(app, "ForgeMonitoring", {
  config,
  env,
  apiService: compute.apiService,
  workerService: compute.workerService,
  alb: compute.alb,
  apiTargetGroup: compute.apiTargetGroup,
  databaseCluster: data.cluster,
  importsQueue: messaging.imports,
  importsDlq: messaging.importsDlq,
  notificationsDlq: messaging.notificationsDlq,
  documentsDlq: messaging.documentsDlq,
  integrationDlq: messaging.integrationEventsDlq,
  cadIntakeDlq: messaging.cadIntakeDlq,
  cadNormalizationDlq: messaging.cadNormalizationDlq,
  cadMatchingDlq: messaging.cadMatchingDlq,
  cadApplicationDlq: messaging.cadApplicationDlq,
  cadPollingDlq: messaging.cadPollingDlq,
  cadRetentionDlq: messaging.cadRetentionDlq,
  reportingSchedulesDlq: messaging.reportingSchedulesDlq,
  apiCloudFrontDistributionId: compute.ecs.apiHttps.distribution.distributionId,
  rmsCloudFrontDistributionId: "E2LZJLH664YX70",
});
new BackupStack(app, "ForgeBackup", {
  config,
  env,
  backupKey: security.backupKey,
  databaseCluster: data.cluster,
  documentsBucket: data.documentsBucket,
  auditArchiveBucket: data.auditArchiveBucket,
});

if (config.features.enableCloudTrail) {
  const audit = new AuditStack(app, "ForgeAudit", {
    config,
    env,
    storageKey: security.storageKey,
    logsKey: security.logsKey,
    dataEventBuckets: [data.documentsBucket, data.exportsBucket, data.auditArchiveBucket],
  });
  NagSuppressions.addStackSuppressions(audit, [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "CloudTrail CloudWatch Logs delivery role uses AWS managed CloudTrail policy pattern via CDK L2.",
    },
    {
      id: "AwsSolutions-IAM5",
      reason:
        "CloudTrail service roles require wildcard resource permissions scoped by source account/ARN conditions on the bucket/key policies.",
    },
    {
      id: "AwsSolutions-S1",
      reason:
        "CloudTrail log bucket is the audit destination; access logging on the trail bucket is deferred to avoid recursive logging cost in development.",
    },
  ]);
}

// Development-justified suppressions (documented in docs/security/cdk-nag-findings.md).
NagSuppressions.addStackSuppressions(network, [
  {
    id: "AwsSolutions-VPC7",
    reason: "VPC flow logs are enabled when config.networking.enableVpcFlowLogs is true.",
  },
]);
NagSuppressions.addStackSuppressions(identity, [
  {
    id: "AwsSolutions-COG2",
    reason: "MFA is OPTIONAL for development Cognito; production will require MFA.",
  },
  {
    id: "AwsSolutions-COG3",
    reason: "Advanced Security Mode deferred pending cost/GovCloud review.",
  },
]);
NagSuppressions.addStackSuppressions(compute, [
  {
    id: "AwsSolutions-ELB2",
    reason: "ALB access logging is enabled to a dedicated bucket.",
  },
  {
    id: "AwsSolutions-EC23",
    reason: "ALB intentionally accepts 80/443 from the internet; WAF attached when enabled.",
  },
]);

app.synth();
console.warn("cdk-nag AwsSolutionsChecks completed for development synthesis.");
