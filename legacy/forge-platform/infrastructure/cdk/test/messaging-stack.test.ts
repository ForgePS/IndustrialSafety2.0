import { describe, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { MessagingStack } from "../lib/stacks/messaging-stack.js";
import { SecurityStack } from "../lib/stacks/security-stack.js";

describe("MessagingStack", () => {
  const app = new cdk.App();
  const env = {
    account: developmentConfig.account,
    region: developmentConfig.region,
  };
  const security = new SecurityStack(app, "TestSecurity", {
    config: developmentConfig,
    env,
  });
  const stack = new MessagingStack(app, "TestMessaging", {
    config: developmentConfig,
    env,
    encryptionKey: security.generalKey,
  });
  const template = Template.fromStack(stack);

  it("routes forge.platform domain events to the integration-events queue", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: {
        source: ["forge.platform"],
      },
      State: "ENABLED",
    });
    template.hasResourceProperties("AWS::Events::Rule", {
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.objectLike({
            "Fn::GetAtt": Match.arrayWith([Match.stringLikeRegexp("integrationeventsQueue")]),
          }),
        }),
      ]),
    });
  });
});
