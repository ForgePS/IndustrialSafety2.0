import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName, uniqueBucketName } from "../utils/naming.js";

export interface ForgeStaticHostingProps {
  config: ForgeEnvironmentConfig;
  /** Short app key used in bucket and resource naming (e.g. console, rms). */
  appKey: string;
  /** Human-readable label for comments and stack outputs. */
  displayName: string;
  /**
   * Optional custom hostname (e.g. creator.forgepublicsafety.com).
   * Requires a us-east-1 ACM certificate ARN. Does not create Route53 records.
   */
  domainName?: string;
  /** ACM certificate ARN in us-east-1 covering domainName (wildcard/apex). */
  certificateArn?: string;
}

/**
 * Reusable static SPA hosting: private S3 origin, CloudFront with OAC,
 * secure response headers, and SPA error rewrites to index.html (ADR-026 pattern).
 */
export class ForgeStaticHosting extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ForgeStaticHostingProps) {
    super(scope, id);
    const { config, appKey, displayName } = props;
    const appKeyLower = appKey.toLowerCase();
    const retain =
      config.environmentName.includes("production") ||
      config.environmentName.startsWith("govcloud");

    this.bucket = new s3.Bucket(this, "Origin", {
      bucketName: uniqueBucketName(config, appKeyLower),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: retain ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !retain,
    });

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecureHeaders", {
      responseHeadersPolicyName: resourceName(config, "cfrhp", appKeyLower),
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
          contentSecurityPolicy: [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            "connect-src 'self' https:",
            "form-action 'self' https:",
          ].join("; "),
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
            override: true,
          },
        ],
      },
    });

    // S3 OAC does not apply website-style directory indexes. Next.js static export
    // with trailingSlash writes /login/index.html; without this rewrite, /login/
    // 404s and the SPA errorResponses below incorrectly serve the home page.
    // Dynamic /incidents/<id>/ routes also need the placeholder shell HTML while
    // keeping the browser URL so client useParams can resolve the real id.
    const directoryIndexFn = new cloudfront.Function(this, "DirectoryIndex", {
      functionName: resourceName(config, "cffn", `${appKeyLower}-idx`),
      comment: `Rewrite directory URIs to index.html for ${displayName}`,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var incidentMatch = uri.match(/^\\/incidents\\/([^/]+)\\/?$/);
  if (incidentMatch) {
    var segment = incidentMatch[1];
    if (segment !== 'new' && segment !== 'placeholder') {
      request.uri = '/incidents/placeholder/index.html';
      return request;
    }
  }
  var closeoutMatch = uri.match(/^\\/closeout\\/([^/]+)\\/?$/);
  if (closeoutMatch) {
    var closeoutSegment = closeoutMatch[1];
    if (closeoutSegment !== 'placeholder') {
      request.uri = '/closeout/placeholder/index.html';
      return request;
    }
  }
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.length > 1 && uri.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Forge ${displayName} (${config.environmentName})`,
      defaultRootObject: "index.html",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      ...(props.domainName && props.certificateArn
        ? {
            domainNames: [props.domainName],
            certificate: acm.Certificate.fromCertificateArn(
              this,
              "ViewerCertificate",
              props.certificateArn,
            ),
          }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: responseHeaders,
        compress: true,
        functionAssociations: [
          {
            function: directoryIndexFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    const outputPrefix = appKey.charAt(0).toUpperCase() + appKey.slice(1);

    new cdk.CfnOutput(this, `${outputPrefix}BucketName`, {
      value: this.bucket.bucketName,
      description: `${displayName} static origin bucket`,
    });
    new cdk.CfnOutput(this, `${outputPrefix}DistributionDomain`, {
      value: this.distribution.distributionDomainName,
      description: `${displayName} CloudFront domain`,
    });
    new cdk.CfnOutput(this, `${outputPrefix}DistributionId`, {
      value: this.distribution.distributionId,
      description: `${displayName} CloudFront distribution ID (cache invalidation)`,
    });
  }
}
