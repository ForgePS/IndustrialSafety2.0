#!/usr/bin/env node
/**
 * Frontend-only CDK app for Configuration Platform Tenant Admin hosting deploys.
 * Avoids synthesizing Network/Data/Compute (which triggers slow context lookups).
 */
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { resolveConfig } from "../lib/config/environment-config.js";
import { TaggingAspect, createMandatoryTags } from "../lib/aspects/tagging-aspect.js";
import { RemovalPolicyAspect } from "../lib/aspects/removal-policy-aspect.js";
import { FrontendStack } from "../lib/stacks/frontend-stack.js";

const app = new cdk.App();
const config = resolveConfig();
const env = { account: config.account, region: config.region };

Aspects.of(app).add(new TaggingAspect(createMandatoryTags(config.environmentName)));
Aspects.of(app).add(
  new RemovalPolicyAspect(
    config.environmentName.includes("production") || config.environmentName.startsWith("govcloud"),
  ),
);

new FrontendStack(app, "ForgeFrontend", { config, env });
app.synth();
