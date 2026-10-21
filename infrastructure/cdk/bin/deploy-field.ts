#!/usr/bin/env node
/**
 * Field-only hosting stack — avoids mutating Development Frontend WAF logging
 * (account-level Logs ResourcePolicy collision with Production Frontend).
 *
 * Usage:
 *   FORGE_ENV=development FORGE_PRODUCTION_ACCOUNT=511343547817 \
 *   pnpm --filter @forge/infrastructure-cdk exec cdk deploy ForgeFieldFrontend \
 *     --app "tsx bin/deploy-field.ts" --require-approval never
 */
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { resolveConfig } from "../lib/config/environment-config.js";
import { TaggingAspect, createMandatoryTags } from "../lib/aspects/tagging-aspect.js";
import { RemovalPolicyAspect } from "../lib/aspects/removal-policy-aspect.js";
import { ForgeFieldHosting } from "../lib/constructs/forge-field-hosting.js";
import { stackName } from "../lib/utils/naming.js";
import { exportValue } from "../lib/utils/outputs.js";

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

class FieldFrontendStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id, {
      env,
      stackName: stackName(config, "FieldFrontend"),
    });

    const field = new ForgeFieldHosting(this, "Field", { config });
    exportValue(this, "ForgeFrontend-FieldDomain", field.distribution.distributionDomainName, "Field Web CloudFront domain");
    exportValue(this, "ForgeFrontend-FieldBucket", field.bucket.bucketName, "Field Web origin bucket");
    exportValue(
      this,
      "ForgeFrontend-FieldDistributionId",
      field.distribution.distributionId,
      "Field Web CloudFront distribution ID",
    );
  }
}

new FieldFrontendStack(app, "ForgeFieldFrontend");
app.synth();
