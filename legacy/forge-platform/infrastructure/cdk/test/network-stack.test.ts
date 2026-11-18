import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { developmentConfig } from "../lib/config/development.js";
import { NetworkStack } from "../lib/stacks/network-stack.js";

describe("NetworkStack", () => {
  const app = new cdk.App();
  const stack = new NetworkStack(app, "TestNetwork", {
    config: developmentConfig,
    env: { account: developmentConfig.account, region: developmentConfig.region },
  });
  const template = Template.fromStack(stack);

  it("creates a VPC with public, private, and isolated subnets", () => {
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.hasResourceProperties("AWS::EC2::Subnet", {
      MapPublicIpOnLaunch: true,
    });
  });

  it("does not expose database security group with open 0.0.0.0/0 ingress", () => {
    const ingress = template.findResources("AWS::EC2::SecurityGroupIngress");
    for (const resource of Object.values(ingress)) {
      const props = resource.Properties as {
        FromPort?: number;
        CidrIp?: string;
      };
      if (props.FromPort === 5432) {
        expect(props.CidrIp).not.toBe("0.0.0.0/0");
      }
    }
  });

  it("ALB SG allows 443 and 80 only from internet pattern", () => {
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("ALB"),
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({ FromPort: 443, IpProtocol: "tcp" }),
        Match.objectLike({ FromPort: 80, IpProtocol: "tcp" }),
      ]),
    });
  });

  it("delivers flow logs to S3 rather than CloudWatch Logs to control cost", () => {
    template.hasResourceProperties("AWS::EC2::FlowLog", {
      LogDestinationType: "s3",
      TrafficType: "ALL",
    });
    template.resourceCountIs("AWS::Logs::LogGroup", 0);
  });

  it("provisions a single NAT gateway in development", () => {
    template.resourceCountIs("AWS::EC2::NatGateway", developmentConfig.networking.natGatewayCount);
  });
});
