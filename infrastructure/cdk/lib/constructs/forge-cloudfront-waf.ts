import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as logs from "aws-cdk-lib/aws-logs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";
import { ForgeWafLogging } from "./forge-waf-logging.js";

export interface ForgeCloudFrontWafProps {
  config: ForgeEnvironmentConfig;
  /**
   * CloudFront distributions owned by this stack.
   * Associated via Distribution.webAclId (not WAFv2 WebACLAssociation).
   */
  distributions?: cloudfront.Distribution[];
  /**
   * Optional WAF log group (must already allow WAF delivery).
   */
  logGroup?: logs.ILogGroup;
}

/**
 * CLOUDFRONT-scope WebACL for SPA/API edges. Must be created in us-east-1.
 *
 * Do not use AWS::WAFv2::WebACLAssociation for CloudFront — that API rejects
 * CloudFront ARNs. Attach via Distribution.attachWebAclId / webAclId.
 *
 * Cross-stack API distributions (owned by Compute) are associated after Frontend
 * deploy via CloudFront AssociateDistributionWebACL using the exported ARN.
 */
export class ForgeCloudFrontWaf extends Construct {
  readonly webAcl: wafv2.CfnWebACL;
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: ForgeCloudFrontWafProps) {
    super(scope, id);
    const { config } = props;
    const distributions = props.distributions ?? [];

    this.webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: resourceName(config, "waf", "cloudfront"),
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: resourceName(config, "waf", "cloudfront"),
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedRulesAmazonIpReputationList",
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CfIpReputation",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
              // Signatures and other JSON bodies exceed the managed 8 KB body
              // inspection window; blocking those POSTs returns a raw 403.
              ruleActionOverrides: [
                { name: "SizeRestrictions_BODY", actionToUse: { count: {} } },
                { name: "CrossSiteScripting_BODY", actionToUse: { count: {} } },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CfCommonRuleSet",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedRulesKnownBadInputsRuleSet",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CfKnownBadInputs",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimitPerIp",
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "CfRateLimitPerIp",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = this.webAcl.attrArn;

    for (const distribution of distributions) {
      distribution.attachWebAclId(this.webAclArn);
    }

    new ForgeWafLogging(this, "CloudFrontWafLogging", {
      config,
      webAcl: this.webAcl,
      destinationSuffix: "cloudfront",
    });

    new cdk.CfnOutput(this, "CloudFrontWebAclArn", {
      value: this.webAclArn,
      description: "CLOUDFRONT-scope WebACL ARN (attach via Distribution webAclId / AssociateDistributionWebACL)",
    });
  }
}
