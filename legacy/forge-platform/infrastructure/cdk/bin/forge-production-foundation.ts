#!/usr/bin/env node
/**
 * PROD-S0R production foundation CDK app.
 * Deploys Network, Security, Observability, Data, Backup, Alerting (SNS), Identity
 * — no customer-facing Compute/Frontend/DNS cutover.
 */
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { resolveConfig } from "../lib/config/environment-config.js";
import { TaggingAspect, createMandatoryTags } from "../lib/aspects/tagging-aspect.js";
import { RemovalPolicyAspect } from "../lib/aspects/removal-policy-aspect.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";
import { ObservabilityStack } from "../lib/stacks/observability-stack.js";
import { BackupStack } from "../lib/stacks/backup-stack.js";
import { AlertingStack } from "../lib/stacks/alerting-stack.js";
import { IdentityStack } from "../lib/stacks/identity-stack.js";
import { ImportMalwareStack } from "../lib/stacks/import-malware-stack.js";

const app = new cdk.App();
const config = resolveConfig();

if (config.environmentName !== "production" && config.environmentName !== "govcloud-production") {
  throw new Error(
    `forge-production-foundation.ts requires FORGE_ENV=production (got ${config.environmentName})`,
  );
}

const env = {
  account: config.account,
  region: config.region,
};

Aspects.of(app).add(new TaggingAspect(createMandatoryTags(config.environmentName)));
Aspects.of(app).add(new RemovalPolicyAspect(true));

const network = new NetworkStack(app, "ForgeNetwork", { config, env });
const security = new SecurityStack(app, "ForgeSecurity", { config, env });
const observability = new ObservabilityStack(app, "ForgeObservability", {
  config,
  env,
  logsKey: security.logsKey,
});
const data = new DataStack(app, "ForgeData", {
  config,
  env,
  vpc: network.vpc,
  databaseSecurityGroup: network.securityGroups.databaseSg,
  storageKey: security.storageKey,
});
if (config.features.enableGuardDuty) {
  const importMalware = new ImportMalwareStack(app, "ForgeImportMalware", {
    config,
    env,
    importsBucket: data.importsBucket,
    storageKey: security.storageKey,
  });
  importMalware.addDependency(data);
  importMalware.addDependency(security);
}
new BackupStack(app, "ForgeBackup", {
  config,
  env,
  backupKey: security.backupKey,
  databaseCluster: data.cluster,
  documentsBucket: data.documentsBucket,
  auditArchiveBucket: data.auditArchiveBucket,
});

/** SNS topics (ops/security/SES) — no Compute dependency; email optional via FORGE_ALERT_EMAIL. */
const alerting = new AlertingStack(app, "ForgeAlerting", {
  config,
  env,
  masterKey: security.generalKey,
});

/** Empty production Cognito foundation — no Firebase migration / customer traffic. */
new IdentityStack(app, "ForgeIdentity", { config, env });

data.addStackDependency(network);
data.addStackDependency(security);
observability.addStackDependency(security);
alerting.addStackDependency(security);

app.synth();
