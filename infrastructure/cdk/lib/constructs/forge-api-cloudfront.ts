import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeApiCloudFrontProps {
  config: ForgeEnvironmentConfig;
  alb: elbv2.IApplicationLoadBalancer;
  /** Browser origins allowed by CORS (RMS / Console CloudFront HTTPS URLs). */
  allowedBrowserOrigins: string[];
  /**
   * Host suffixes whose https://{host} origins are also trusted.
   * Converted to CloudFront leftmost-subdomain wildcards (*.example.com).
   */
  allowedBrowserOriginSuffixes?: string[];
}

/**
 * HTTPS edge for the Platform API (ADR-036).
 *
 * Viewers terminate TLS on CloudFront. Origin protocol to the ALB may remain
 * HTTP_ONLY for private CF→ALB hops; ALB HTTPS is configured separately via
 * ForgeEdgeTls for direct listener coverage.
 */
export class ForgeApiCloudFront extends Construct {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ForgeApiCloudFrontProps) {
    super(scope, id);
    const { config, alb, allowedBrowserOrigins } = props;
    const suffixes = (props.allowedBrowserOriginSuffixes ?? [])
      .map((suffix) => suffix.trim().toLowerCase())
      .filter(Boolean)
      .map((suffix) => (suffix.startsWith(".") ? suffix.slice(1) : suffix));
    // CloudFront CORS allows a leftmost subdomain wildcard (*.example.com) so
    // per-tenant vanity hosts under our first-party zone do not each need a redeploy.
    const wildcardOrigins = suffixes.map((zone) => `https://*.${zone}`);
    const corsAllowOrigins =
      allowedBrowserOrigins.length > 0 || wildcardOrigins.length > 0
        ? [...allowedBrowserOrigins, ...wildcardOrigins]
        : ["https://localhost"];

    const origin = new origins.LoadBalancerV2Origin(alb, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
      readTimeout: cdk.Duration.seconds(60),
      keepaliveTimeout: cdk.Duration.seconds(60),
    });

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecureHeaders", {
      responseHeadersPolicyName: resourceName(config, "cfrhp", "api"),
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          override: true,
        },
      },
      corsBehavior: {
        accessControlAllowCredentials: true,
        accessControlAllowHeaders: [
          "Authorization",
          "Content-Type",
          "Idempotency-Key",
          "If-Match",
          "X-Correlation-Id",
          "X-Request-Id",
          "X-Forge-Dev-Principal",
          "X-Forge-Dev-User",
          "X-Tenant-Id",
        ],
        accessControlAllowMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        accessControlAllowOrigins: corsAllowOrigins,
        accessControlExposeHeaders: ["ETag", "X-Correlation-Id", "X-Request-Id"],
        accessControlMaxAge: cdk.Duration.hours(1),
        originOverride: true,
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
            override: true,
          },
          {
            header: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
            override: true,
          },
        ],
      },
    });

    const apiDomain = config.domains?.api;
    const certificateArn = config.edge.certificateArn;

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Forge Platform API HTTPS edge (${config.environmentName})`,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      ...(apiDomain && certificateArn
        ? {
            domainNames: [apiDomain],
            certificate: acm.Certificate.fromCertificateArn(this, "ViewerCertificate", certificateArn),
          }
        : {}),
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: responseHeaders,
        compress: true,
      },
    });

    new cdk.CfnOutput(this, "ApiHttpsDomain", {
      value: this.distribution.distributionDomainName,
      description: "HTTPS CloudFront domain for Platform API (browser-facing)",
    });
    new cdk.CfnOutput(this, "ApiHttpsDistributionId", {
      value: this.distribution.distributionId,
      description: "API CloudFront distribution ID",
    });
  }
}
