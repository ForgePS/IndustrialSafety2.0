import { describe, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";

describe("SecurityStack", () => {
  const app = new cdk.App();
  const stack = new SecurityStack(app, "TestSecurity", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
  });
  const template = Template.fromStack(stack);

  it("creates five customer-managed KMS keys with rotation", () => {
    template.resourceCountIs("AWS::KMS::Key", 5);
    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
    });
  });

  it("keeps a dedicated sensitive-data key alias", () => {
    template.hasResourceProperties("AWS::KMS::Alias", {
      AliasName: "alias/forge-development-kms-sensitivedata",
    });
  });
});
