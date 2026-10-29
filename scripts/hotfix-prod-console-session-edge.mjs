#!/usr/bin/env node
/**
 * Production Creator Console edge hotfix for HttpOnly session cookies.
 *
 * Full Forge-Production-Frontend CDK deploy is blocked by a Console DNS alias
 * conflict. This script updates only distribution E1Y0J755DHRIXP:
 *   - /api/* and /health → api.forgepublicsafety.com
 *   - Clear SPA 403/404 → index.html rewrites (they break API JSON)
 *   - CSP connect-src includes Cognito (API is same-origin via proxy)
 *
 * Usage:
 *   node scripts/hotfix-prod-console-session-edge.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const DIST_ID = "E1Y0J755DHRIXP";
const API_ORIGIN_ID = "ForgeConsoleApiOrigin";
const API_DOMAIN = "api.forgepublicsafety.com";
const ACCOUNT = "511343547817";
const TMP = path.join(process.cwd(), `.forge-prod-console-cf-${Date.now()}.json`);

function awsJson(args) {
  return JSON.parse(execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8" }));
}

function awsText(args) {
  return execFileSync("aws", [...args, "--output", "text"], { encoding: "utf8" }).trim();
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing: account ${identity.Account} != ${ACCOUNT}`);
}

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "frame-src 'self' blob: data: https://view.officeapps.live.com https://*.officeapps.live.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self'",
  "connect-src 'self' https://api.forgepublicsafety.com https://forge-production-547817.auth.us-east-1.amazoncognito.com https://cognito-idp.us-east-1.amazonaws.com https://view.officeapps.live.com https://*.officeapps.live.com blob:",
  "form-action 'self' https:",
].join("; ");

const raw = awsJson(["cloudfront", "get-distribution-config", "--id", DIST_ID]);
const etag = raw.ETag;
const cfg = raw.DistributionConfig;

const rhpId = cfg.DefaultCacheBehavior.ResponseHeadersPolicyId;
if (!rhpId) throw new Error("Missing ResponseHeadersPolicyId on console default behavior");

const rhpRaw = awsJson(["cloudfront", "get-response-headers-policy", "--id", rhpId]);
const rhpEtag = rhpRaw.ETag;
const rhpCfg = structuredClone(rhpRaw.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
delete rhpCfg.ResponseHeadersPolicyId;
if (!rhpCfg.SecurityHeadersConfig) rhpCfg.SecurityHeadersConfig = {};
rhpCfg.SecurityHeadersConfig.ContentSecurityPolicy = {
  Override: true,
  ContentSecurityPolicy: csp,
};

const rhpTmp = path.join(process.cwd(), `.forge-prod-console-rhp-${Date.now()}.json`);
writeFileSync(rhpTmp, JSON.stringify(rhpCfg, null, 2));
try {
  awsText([
    "cloudfront",
    "update-response-headers-policy",
    "--id",
    rhpId,
    "--if-match",
    rhpEtag,
    "--response-headers-policy-config",
    `file://${rhpTmp.replace(/\\/g, "/")}`,
  ]);
  console.log(`Updated response headers policy ${rhpId}`);
} finally {
  if (existsSync(rhpTmp)) unlinkSync(rhpTmp);
}

const apiBehavior = {
  PathPattern: "/api/*",
  TargetOriginId: API_ORIGIN_ID,
  ViewerProtocolPolicy: "redirect-to-https",
  AllowedMethods: {
    Quantity: 7,
    Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
    CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
  },
  Compress: true,
  CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
  OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac", // AllViewerExceptHostHeader
  ResponseHeadersPolicyId: rhpId,
  SmoothStreaming: false,
  FieldLevelEncryptionId: "",
  LambdaFunctionAssociations: { Quantity: 0, Items: [] },
  FunctionAssociations: { Quantity: 0, Items: [] },
  TrustedKeyGroups: { Enabled: false, Quantity: 0, Items: [] },
  TrustedSigners: { Enabled: false, Quantity: 0, Items: [] },
  GrpcConfig: { Enabled: false },
};

const healthBehavior = {
  ...apiBehavior,
  PathPattern: "/health",
  AllowedMethods: {
    Quantity: 2,
    Items: ["GET", "HEAD"],
    CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
  },
};

function applyProxy(config) {
  const origins = config.Origins?.Items ?? [];
  if (!origins.some((o) => o.Id === API_ORIGIN_ID || o.DomainName === API_DOMAIN)) {
    origins.push({
      Id: API_ORIGIN_ID,
      DomainName: API_DOMAIN,
      OriginPath: "",
      CustomHeaders: { Quantity: 0, Items: [] },
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
        OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
        OriginReadTimeout: 60,
        OriginKeepaliveTimeout: 5,
      },
      ConnectionAttempts: 3,
      ConnectionTimeout: 10,
      OriginShield: { Enabled: false },
    });
  }
  config.Origins = { Quantity: origins.length, Items: origins };
  const apiOriginId = origins.find((o) => o.DomainName === API_DOMAIN)?.Id ?? API_ORIGIN_ID;
  const keep = (config.CacheBehaviors?.Items ?? []).filter(
    (b) => b.PathPattern !== "/api/*" && b.PathPattern !== "/health",
  );
  const behaviors = [
    ...keep,
    { ...apiBehavior, TargetOriginId: apiOriginId },
    { ...healthBehavior, TargetOriginId: apiOriginId },
  ];
  config.CacheBehaviors = { Quantity: behaviors.length, Items: behaviors };
  config.DefaultCacheBehavior.ResponseHeadersPolicyId = rhpId;
  // SPA deep links use viewer-request directory-index; distribution-wide
  // 403/404 → index.html turns Nest API errors into HTML 200.
  config.CustomErrorResponses = { Quantity: 0 };
  delete config.CustomErrorResponses.Items;
  return config;
}

void etag;
void cfg;

const fresh = awsJson(["cloudfront", "get-distribution-config", "--id", DIST_ID]);
const freshEtag = fresh.ETag;
const freshCfg = applyProxy(fresh.DistributionConfig);

writeFileSync(TMP, JSON.stringify(freshCfg, null, 2));
try {
  const updated = awsJson([
    "cloudfront",
    "update-distribution",
    "--id",
    DIST_ID,
    "--if-match",
    freshEtag,
    "--distribution-config",
    `file://${TMP.replace(/\\/g, "/")}`,
  ]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        distributionId: DIST_ID,
        status: updated.Distribution?.Status,
        behaviors: (updated.Distribution?.DistributionConfig?.CacheBehaviors?.Items ?? []).map(
          (b) => b.PathPattern,
        ),
        customErrorResponses:
          updated.Distribution?.DistributionConfig?.CustomErrorResponses?.Quantity ?? 0,
      },
      null,
      2,
    ),
  );
} finally {
  if (existsSync(TMP)) unlinkSync(TMP);
}

const inv = awsJson([
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  DIST_ID,
  "--paths",
  "/*",
]);
console.log(`Invalidation ${inv.Invalidation?.Id} status=${inv.Invalidation?.Status}`);
