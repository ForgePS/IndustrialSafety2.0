import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { createProductionConfig } from "../lib/config/production.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";
import { IdentityStack } from "../lib/stacks/identity-stack.js";
import { AlertingStack } from "../lib/stacks/alerting-stack.js";
import { exportValue } from "../lib/utils/outputs.js";

function collectExportNames(template: Template): string[] {
  const outputs = template.findOutputs("*");
  return Object.values(outputs)
    .map((o) => (o as { Export?: { Name?: string } }).Export?.Name)
    .filter((n): n is string => Boolean(n));
}

describe("CloudFormation export names are environment-safe", () => {
  it("prefixes production exports with the CloudFormation stack name", () => {
    process.env.FORGE_PRODUCTION_ACCOUNT = "511343547817";
    const prod = createProductionConfig();
    const app = new cdk.App();
    const network = new NetworkStack(app, "ProdNetwork", {
      config: prod,
      env: { account: prod.account, region: prod.region },
    });
    const names = collectExportNames(Template.fromStack(network));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.startsWith("Forge-Production-Network:")).toBe(true);
    }
  });

  it("keeps development export names unprefixed for legacy consumer stacks", () => {
    const app = new cdk.App();
    const network = new NetworkStack(app, "DevNetwork", {
      config: developmentConfig,
      env: { account: developmentConfig.account, region: developmentConfig.region },
    });
    const names = collectExportNames(Template.fromStack(network));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.includes(":")).toBe(false);
    }
  });

  it("does not collide production vs development Network VPC export names", () => {
    process.env.FORGE_PRODUCTION_ACCOUNT = "511343547817";
    const prod = createProductionConfig();
    const app = new cdk.App();
    const prodNet = new NetworkStack(app, "ProdNetCollision", {
      config: prod,
      env: { account: prod.account, region: prod.region },
    });
    const devNet = new NetworkStack(app, "DevNetCollision", {
      config: developmentConfig,
      env: { account: developmentConfig.account, region: developmentConfig.region },
    });
    const prodNames = new Set(collectExportNames(Template.fromStack(prodNet)));
    const devNames = new Set(collectExportNames(Template.fromStack(devNet)));
    for (const name of prodNames) {
      expect(devNames.has(name)).toBe(false);
    }
  });

  it("prefixes Security, Alerting, and Identity production exports", () => {
    process.env.FORGE_PRODUCTION_ACCOUNT = "511343547817";
    const prod = createProductionConfig();
    const app = new cdk.App();
    const security = new SecurityStack(app, "ProdSec", {
      config: prod,
      env: { account: prod.account, region: prod.region },
    });
    const alerting = new AlertingStack(app, "ProdAlert", {
      config: prod,
      env: { account: prod.account, region: prod.region },
      masterKey: security.generalKey,
    });
    const identity = new IdentityStack(app, "ProdId", {
      config: prod,
      env: { account: prod.account, region: prod.region },
    });
    for (const [stack, prefix] of [
      [security, "Forge-Production-Security:"],
      [alerting, "Forge-Production-Alerting:"],
      [identity, "Forge-Production-Identity:"],
    ] as const) {
      for (const name of collectExportNames(Template.fromStack(stack))) {
        expect(name.startsWith(prefix)).toBe(true);
      }
    }
  });

  it("exportValue helper uses bare name only outside production/staging/govcloud", () => {
    const bareApp = new cdk.App();
    const bare = new cdk.Stack(bareApp, "Forge-Development-Helper", {
      stackName: "Forge-Development-Helper",
    });
    exportValue(bare, "Helper-Id", "value", "desc");
    expect(collectExportNames(Template.fromStack(bare))).toContain("Helper-Id");

    const prodApp = new cdk.App();
    const prod = new cdk.Stack(prodApp, "Forge-Production-Helper", {
      stackName: "Forge-Production-Helper",
    });
    exportValue(prod, "Helper-Id", "value", "desc");
    expect(collectExportNames(Template.fromStack(prod))).toContain(
      "Forge-Production-Helper:Helper-Id",
    );
  });
});
