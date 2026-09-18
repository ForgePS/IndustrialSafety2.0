import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName, uniqueBucketName } from "../utils/naming.js";
import {
  buildContentSecurityPolicy,
  buildLegacyHostRedirectSnippet,
  type LegacyHostRedirect,
} from "./forge-static-hosting-csp.js";

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
  /**
   * Permissions-Policy header value. Default disables camera/mic/geo.
   * Field App needs camera=(self) for QR scanning.
   */
  permissionsPolicy?: string;
  /**
   * Extra CloudFront Function rewrite statements inserted before the
   * directory-index rewrite (viewer-request). Use for SPA placeholder shells.
   */
  viewerRequestExtraRewrites?: string;
  /**
   * Allow embedding in iframes (device preview tools). Dev-only; production keeps DENY.
   */
  allowIframeEmbedding?: boolean;
  /**
   * API origin hostname (no scheme) for /api/* and /health CloudFront behaviors
   * and for connect-src allowlisting (FIS-M01).
   */
  apiProxyOriginHostname?: string;
  /**
   * Extra connect-src entries (Cognito hosted UI, cognito-idp, media, etc.).
   * Prefer explicit domains from environment config over wildcards.
   */
  cspConnectSrcExtras?: string[];
  /**
   * Permanent viewer-request redirects for legacy vanity hosts (FIS-L02).
   * Does not remove DNS/CloudFront aliases — see scripts/cf-alias-producersrice.mjs.
   */
  legacyRedirects?: LegacyHostRedirect[];
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

    const contentSecurityPolicy = buildContentSecurityPolicy({
      allowIframeEmbedding: props.allowIframeEmbedding,
      apiProxyOriginHostname: props.apiProxyOriginHostname,
      cspConnectSrcExtras: props.cspConnectSrcExtras,
    });

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecureHeaders", {
      responseHeadersPolicyName: resourceName(config, "cfrhp", appKeyLower),
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        ...(props.allowIframeEmbedding
          ? {}
          : {
              frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            }),
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
          contentSecurityPolicy,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value:
              props.permissionsPolicy ?? "camera=(), microphone=(), geolocation=()",
            override: true,
          },
          {
            header: "Cross-Origin-Opener-Policy",
            value: "same-origin",
            override: true,
          },
          {
            header: "Cross-Origin-Resource-Policy",
            value: "same-origin",
            override: true,
          },
        ],
      },
    });

    const legacyRedirectSnippet = buildLegacyHostRedirectSnippet(props.legacyRedirects);

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
  var headers = request.headers;
${legacyRedirectSnippet}  // Next.js static export stores RSC payloads as *.txt. Soft navigations fetch
  // them with RSC headers. When the client router fails, it does a full document
  // navigation to *.txt and the browser shows the raw flight payload — often in
  // a loop. Redirect those navigations to the clean HTML route.
  var isRsc =
    (headers['rsc'] && headers['rsc'].value) ||
    (headers['next-router-state-tree'] && headers['next-router-state-tree'].value) ||
    (headers['next-router-prefetch'] && headers['next-router-prefetch'].value);
  if (!isRsc && uri.endsWith('.txt')) {
    var location = uri.endsWith('/index.txt')
      ? uri.slice(0, -'index.txt'.length)
      : uri.slice(0, -4) + '.html';
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        location: { value: location },
        'cache-control': { value: 'no-store' },
      },
    };
  }
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
  var dvirMatch = uri.match(/^\\/dvir\\/([^/]+)\\/?$/);
  if (dvirMatch) {
    var dvirSegment = dvirMatch[1];
    if (dvirSegment !== 'placeholder') {
      request.uri = '/dvir/placeholder/index.html';
      return request;
    }
  }
  var trainingMatch = uri.match(/^\\/training\\/([^/]+)\\/?$/);
  if (trainingMatch) {
    var trainingSegment = trainingMatch[1];
    if (trainingSegment !== 'placeholder' && trainingSegment !== 'portal' && trainingSegment !== 'access') {
      request.uri = '/training/placeholder/index.html';
      return request;
    }
  }
  var trainingAccessMatch = uri.match(/^\\/training\\/access\\/([^/]+)\\/?$/);
  if (trainingAccessMatch) {
    var accessSegment = trainingAccessMatch[1];
    if (accessSegment !== 'placeholder') {
      request.uri = '/training/access/placeholder/index.html';
      return request;
    }
  }
  var supplyRequestMatch = uri.match(/^\\/safety-supplies\\/request\\/q\\/([^/]+)\\/?$/);
  if (supplyRequestMatch) {
    var supplyRequestSegment = supplyRequestMatch[1];
    if (supplyRequestSegment !== 'placeholder') {
      request.uri = '/safety-supplies/request/q/placeholder/index.html';
      return request;
    }
  }
  var supplyStatusMatch = uri.match(/^\\/safety-supplies\\/request\\/status\\/([^/]+)\\/?$/);
  if (supplyStatusMatch) {
    var supplyStatusSegment = supplyStatusMatch[1];
    if (supplyStatusSegment !== 'placeholder') {
      request.uri = '/safety-supplies/request/status/placeholder/index.html';
      return request;
    }
  }
  var industrialScanMatch = uri.match(/^\\/scan\\/([^/]+)\\/?$/);
  if (industrialScanMatch) {
    var industrialScanSegment = industrialScanMatch[1];
    if (industrialScanSegment !== 'placeholder' && industrialScanSegment !== 'equipment') {
      request.uri = '/scan/placeholder/index.html';
      return request;
    }
  }
${props.viewerRequestExtraRewrites ? `${props.viewerRequestExtraRewrites}\n` : ""}  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.length > 1 && uri.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Shared origin + viewer settings for default HTML and hashed Next assets.
    // compress:true enables gzip/brotli at the edge (transfer size << object size).
    const origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket);
    const functionAssociations: cloudfront.FunctionAssociation[] = [
      {
        function: directoryIndexFn,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      },
    ];

    const apiProxyHost = props.apiProxyOriginHostname?.trim().replace(/^https?:\/\//i, "");
    const apiProxyBehaviors: Record<string, cloudfront.BehaviorOptions> = {};
    if (apiProxyHost) {
      const apiOrigin = new origins.HttpOrigin(apiProxyHost, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });
      const apiBehavior: cloudfront.BehaviorOptions = {
        origin: apiOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: responseHeaders,
        compress: true,
        // No directory-index function — proxy path must reach the API unchanged.
      };
      apiProxyBehaviors["/api/*"] = apiBehavior;
      apiProxyBehaviors["/health"] = apiBehavior;
    }

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
      // HTML / RSC shells change every deploy and must not be sticky at the edge.
      // Hashed /_next/static/* uses a long-lived behavior below (immutable URLs).
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: responseHeaders,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: responseHeaders,
          compress: true,
          // Honors S3 Cache-Control (sync sets max-age=31536000, immutable).
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations,
        },
        ...apiProxyBehaviors,
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
