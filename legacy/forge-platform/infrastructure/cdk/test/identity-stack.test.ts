import { describe, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { IdentityStack } from "../lib/stacks/identity-stack.js";

describe("IdentityStack", () => {
  const app = new cdk.App();
  const stack = new IdentityStack(app, "TestIdentity", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
  });
  const template = Template.fromStack(stack);

  it("creates a Cognito user pool with email sign-in", () => {
    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AutoVerifiedAttributes: ["email"],
    });
  });

  it("creates separate app clients", () => {
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 6);
  });

  it("enables admin user password auth for controlled UAT token issuance", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      ExplicitAuthFlows: Match.arrayWith(["ALLOW_ADMIN_USER_PASSWORD_AUTH"]),
    });
  });
});
