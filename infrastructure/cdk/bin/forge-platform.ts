#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { resolveConfig } from "../lib/config/environment-config.js";
import { TaggingAspect, createMandatoryTags } from "../lib/aspects/tagging-aspect.js";
import { RemovalPolicyAspect } from "../lib/aspects/removal-policy-aspect.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";
import { IdentityStack } from "../lib/stacks/identity-stack.js";
import { MessagingStack } from "../lib/stacks/messaging-stack.js";
import { ObservabilityStack, MonitoringStack } from "../lib/stacks/observability-stack.js";
import { ComputeStack } from "../lib/stacks/compute-stack.js";
import { FrontendStack } from "../lib/stacks/frontend-stack.js";
import { BackupStack } from "../lib/stacks/backup-stack.js";
import { AuditStack } from "../lib/stacks/audit-stack.js";
import { AlertingStack } from "../lib/stacks/alerting-stack.js";
import { PRODUCTION_PRE_CUTOVER_SPA_ORIGINS } from "../lib/config/production-spa-origins.js";

const app = new cdk.App();
const config = resolveConfig();

const env = {
  account: config.account,
  region: config.region,
};

Aspects.of(app).add(new TaggingAspect(createMandatoryTags(config.environmentName)));
Aspects.of(app).add(
  new RemovalPolicyAspect(
    config.environmentName.includes("production") || config.environmentName.startsWith("govcloud"),
  ),
);

const network = new NetworkStack(app, "ForgeNetwork", { config, env });
const security = new SecurityStack(app, "ForgeSecurity", { config, env });
const identity = new IdentityStack(app, "ForgeIdentity", { config, env });
const alerting = new AlertingStack(app, "ForgeAlerting", {
  config,
  env,
  masterKey: security.generalKey,
});

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

function httpsOrigin(hostname: string | undefined, fallback: string): string {
  if (!hostname) return fallback;
  return hostname.startsWith("https://") ? hostname : `https://${hostname}`;
}

const isProduction = config.environmentName === "production";
const publicRmsUrl =
  process.env.FORGE_PUBLIC_RMS_URL ||
  httpsOrigin(config.domains?.rms, "https://rms-dev.forgepublicsafety.com");
const publicCreatorUrl =
  process.env.FORGE_PUBLIC_CREATOR_URL ||
  httpsOrigin(config.domains?.creator, "https://creator-dev.forgepublicsafety.com");
const publicTenantAdminUrl =
  process.env.FORGE_PUBLIC_ADMIN_URL ||
  httpsOrigin(config.domains?.tenantAdmin, "https://admin-dev.forgepublicsafety.com");
/** Industrial Web. Prefer custom domain; CloudFront override via FORGE_PUBLIC_INDUSTRIAL_URL. */
const publicIndustrialUrl =
  process.env.FORGE_PUBLIC_INDUSTRIAL_URL ||
  httpsOrigin(config.domains?.industrial, "https://industrial-dev.forgepublicsafety.com");
/** Producers P2 dark/pre-announce hostname — development/coexistence only (not production cutover). */
const publicProducersIndustrialUrl = isProduction
  ? undefined
  : process.env.FORGE_PUBLIC_PRODUCERS_INDUSTRIAL_URL ||
    "https://producers-rice-mill.forgepublicsafety.com";
/**
 * First-party host zone for per-tenant vanity SPAs. Exact CloudFront default
 * domains stay in browserOrigins; this suffix covers tenant hosts under our zone
 * so each new vanity hostname does not require an API CORS redeploy.
 */
const browserOriginSuffixes = [".forgepublicsafety.com"];
/** CloudFront origins retained until customer DNS cutover (explicit CORS allowlist). */
const legacyCloudFrontOrigins = isProduction
  ? [...PRODUCTION_PRE_CUTOVER_SPA_ORIGINS]
  : [
      "https://d3ud5uzwd9js2z.cloudfront.net",
      "https://ddztl9s33wu40.cloudfront.net",
      "https://d1uxdl4szvsixc.cloudfront.net",
      "https://d2ed3566n8x2gi.cloudfront.net",
    ];
const cognitoDomain = `forge-${config.environmentName}-${config.account.slice(-6)}.auth.${config.region}.amazoncognito.com`;

const compute = new ComputeStack(app, "ForgeCompute", {
  config,
  env,
  vpc: network.vpc,
  albSecurityGroup: network.securityGroups.albSg,
  apiSecurityGroup: network.securityGroups.ecsApiSg,
  workerSecurityGroup: network.securityGroups.workerSg,
  databaseSecret: data.database.secret,
  // GAP-009 Strategy A: Data + Compute both reference forge-*-secrets-database-app
  // by name when importExistingAppSecret=true. Do not pass a created AppDbSecret
  // export (would recreate AlreadyExists). Secret value/ARN remain external.
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
    identity.cognito.industrialClient.userPoolClientId,
  ].join(","),
  cognitoDomain,
  // Explicit allowlist — never wildcard with credentialed browser calls.
  browserOrigins: [
    publicRmsUrl,
    publicCreatorUrl,
    publicTenantAdminUrl,
    publicIndustrialUrl,
    publicProducersIndustrialUrl,
    ...legacyCloudFrontOrigins,
  ].filter((u): u is string => Boolean(u)),
  browserOriginSuffixes,
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
  apiCloudFrontDistributionId: compute.ecs.apiHttps.distribution.distributionId,
  rmsCloudFrontDistributionId: isProduction ? undefined : "E2LZJLH664YX70",
  alarmTopic: alerting.opsTopic,
});

new BackupStack(app, "ForgeBackup", {
  config,
  env,
  backupKey: security.backupKey,
  databaseCluster: data.cluster,
  documentsBucket: data.documentsBucket,
  auditArchiveBucket: data.auditArchiveBucket,
});

const audit = config.features.enableCloudTrail
  ? new AuditStack(app, "ForgeAudit", {
      config,
      env,
      storageKey: security.storageKey,
      logsKey: security.logsKey,
      // Targeted WriteOnly data events for high-value buckets only (cost/volume reviewed).
      dataEventBuckets: [data.documentsBucket, data.exportsBucket, data.auditArchiveBucket],
      alarmTopic: alerting.securityTopic,
    })
  : undefined;

new FrontendStack(app, "ForgeFrontend", {
  config,
  env,
  apiCloudFrontDistributionId: compute.ecs.apiHttps.distribution.distributionId,
});

data.addStackDependency(network);
data.addStackDependency(security);
messaging.addStackDependency(security);
observability.addStackDependency(security);
alerting.addStackDependency(security);
compute.addStackDependency(network);
compute.addStackDependency(data);
compute.addStackDependency(messaging);
compute.addStackDependency(observability);
compute.addStackDependency(identity);
if (audit) {
  audit.addStackDependency(security);
  audit.addStackDependency(data);
  audit.addStackDependency(alerting);
}

app.synth();
