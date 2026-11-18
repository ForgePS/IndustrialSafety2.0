import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";

describe("DataStack", () => {
  const app = new cdk.App();
  const network = new NetworkStack(app, "TestNetwork", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
  });
  const security = new SecurityStack(app, "TestSecurity", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
  });
  const stack = new DataStack(app, "TestData", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
    vpc: network.vpc,
    databaseSecurityGroup: network.securityGroups.databaseSg,
    storageKey: security.storageKey,
  });
  const template = Template.fromStack(stack);

  it("creates required S3 buckets with public access blocked", () => {
    template.resourceCountIs("AWS::S3::Bucket", 5);
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates an Aurora PostgreSQL cluster named forge_platform", () => {
    template.hasResourceProperties("AWS::RDS::DBCluster", {
      Engine: "aurora-postgresql",
      DatabaseName: "forge_platform",
      StorageEncrypted: true,
    });
  });

  it("enables Aurora auto-pause at 0 ACU for development cost control", () => {
    template.hasResourceProperties("AWS::RDS::DBCluster", {
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: developmentConfig.database.serverlessMaxCapacity,
        SecondsUntilAutoPause: 3600,
      },
    });
  });

  it("does not output database credentials", () => {
    const outputs = template.findOutputs("*");
    for (const [, output] of Object.entries(outputs)) {
      expect(JSON.stringify(output).toLowerCase()).not.toMatch(/password|secretstring/);
    }
  });

  it("enforces TLS deny on buckets", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "DenyInsecureTransport",
            Effect: "Deny",
          }),
        ]),
      },
    });
  });

  it("does not create the protected application database secret when importing (GAP-009)", () => {
    const appSecretName = `forge-${developmentConfig.environmentName}-secrets-database-app`;
    const secrets = template.findResources("AWS::SecretsManager::Secret");
    for (const [, resource] of Object.entries(secrets)) {
      expect(JSON.stringify(resource)).not.toContain(appSecretName);
    }
  });
});
