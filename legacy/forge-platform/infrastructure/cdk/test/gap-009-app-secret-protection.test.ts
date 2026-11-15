import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import type { ForgeEnvironmentConfig } from "../lib/config/environment-schema.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { DataStack } from "../lib/stacks/data-stack.js";
import { resourceName } from "../lib/utils/naming.js";

function synthData(config: ForgeEnvironmentConfig): Template {
  const app = new cdk.App();
  const network = new NetworkStack(app, "TestNetwork", {
    config,
    env: { account: config.account, region: config.region },
  });
  const security = new SecurityStack(app, "TestSecurity", {
    config,
    env: { account: config.account, region: config.region },
  });
  const stack = new DataStack(app, "TestData", {
    config,
    env: { account: config.account, region: config.region },
    vpc: network.vpc,
    databaseSecurityGroup: network.securityGroups.databaseSg,
    storageKey: security.storageKey,
  });
  return Template.fromStack(stack);
}

describe("DataStack GAP-009 app secret protection", () => {
  const appSecretName = resourceName(developmentConfig, "secrets", "database-app");
  const adminSecretName = resourceName(developmentConfig, "secrets", "database");

  it("development config imports existing app secret (importExistingAppSecret=true)", () => {
    expect(developmentConfig.database.importExistingAppSecret).toBe(true);
  });

  it("does not create AWS::SecretsManager::Secret for the protected app secret name", () => {
    const template = synthData(developmentConfig);
    const secrets = template.findResources("AWS::SecretsManager::Secret");
    for (const [logicalId, resource] of Object.entries(secrets)) {
      const name = (resource as { Properties?: { Name?: string } }).Properties?.Name;
      expect(name, `${logicalId} must not create protected app secret ${appSecretName}`).not.toBe(
        appSecretName,
      );
      expect(JSON.stringify(resource)).not.toContain(appSecretName);
    }
  });

  it("still creates the Aurora admin/migration secret", () => {
    const template = synthData(developmentConfig);
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: adminSecretName,
    });
  });

  it("does not emit GenerateSecretString for forge_app when importing", () => {
    const template = synthData(developmentConfig);
    const secrets = template.findResources("AWS::SecretsManager::Secret");
    const serialized = JSON.stringify(secrets);
    expect(serialized).not.toMatch(/forge_app/);
    expect(serialized).not.toContain(appSecretName);
  });

  it("greenfield mode still creates AppDbSecret when importExistingAppSecret=false", () => {
    const greenfield: ForgeEnvironmentConfig = {
      ...developmentConfig,
      database: {
        ...developmentConfig.database,
        importExistingAppSecret: false,
      },
    };
    const template = synthData(greenfield);
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: appSecretName,
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: Match.stringLikeRegexp("forge_app"),
      }),
    });
  });

  it("does not output secret values", () => {
    const template = synthData(developmentConfig);
    const outputs = template.findOutputs("*");
    for (const [, output] of Object.entries(outputs)) {
      expect(JSON.stringify(output).toLowerCase()).not.toMatch(/password|secretstring/);
    }
  });
});
