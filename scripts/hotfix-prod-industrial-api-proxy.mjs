#!/usr/bin/env node
/**
 * Restore Industrial CloudFront /api/* + /health proxy (same-origin session).
 *
 * Without these behaviors, same-origin SPA calls (/api/v1/...) hit S3 and
 * SPA-fallback as text/html 200 → "Non-JSON response (HTTP 200)".
 *
 * Also clears distribution-wide CustomErrorResponses that rewrite 403/404 to
 * index.html (same symptom for Nest JSON errors).
 *
 * Usage:
 *   node scripts/hotfix-prod-industrial-api-proxy.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const DIST_ID = process.env.INDUSTRIAL_CF_DIST_ID || "E364CHF9M9794T";
const API_ORIGIN_ID = "ForgeIndustrialApiOrigin";
const API_DOMAIN = "api.forgepublicsafety.com";
const ACCOUNT = "511343547817";
const TMP = path.join(process.cwd(), `.forge-prod-industrial-api-proxy-${Date.now()}.json`);

function awsJson(args) {
  return JSON.parse(
    execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  );
}

const identity = awsJson(["sts", "get-caller-identity"]);
if (identity.Account !== ACCOUNT) {
  throw new Error(`Refusing: account ${identity.Account} != ${ACCOUNT}`);
}

const raw = awsJson(["cloudfront", "get-distribution-config", "--id", DIST_ID]);
const etag = raw.ETag;
const cfg = raw.DistributionConfig;
const rhpId = cfg.DefaultCacheBehavior.ResponseHeadersPolicyId;
if (!rhpId) throw new Error("Missing ResponseHeadersPolicyId on industrial default behavior");

const origins = cfg.Origins?.Items ?? [];
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
cfg.Origins = { Quantity: origins.length, Items: origins };
const apiOriginId = origins.find((o) => o.DomainName === API_DOMAIN)?.Id ?? API_ORIGIN_ID;

// Ensure /_next/static/* stays if present; replace /api and /health.
const keep = (cfg.CacheBehaviors?.Items ?? []).filter(
  (b) => b.PathPattern !== "/api/*" && b.PathPattern !== "/health",
);

const apiBehavior = {
  PathPattern: "/api/*",
  TargetOriginId: apiOriginId,
  ViewerProtocolPolicy: "redirect-to-https",
  AllowedMethods: {
    Quantity: 7,
    Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
    CachedMethods: { Quantity: 3, Items: ["GET", "HEAD", "OPTIONS"] },
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
};

cfg.CacheBehaviors = {
  Quantity: keep.length + 2,
  Items: [...keep, apiBehavior, healthBehavior],
};

// Nest 403/404 must stay JSON — never SPA-fallback API misses.
cfg.CustomErrorResponses = { Quantity: 0, Items: [] };

writeFileSync(TMP, JSON.stringify(cfg));
try {
  const updated = awsJson([
    "cloudfront",
    "update-distribution",
    "--id",
    DIST_ID,
    "--if-match",
    etag,
    "--distribution-config",
    `file://${TMP.replace(/\\/g, "/")}`,
  ]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        distributionId: DIST_ID,
        status: updated.Distribution?.Status,
        aliases: updated.Distribution?.DistributionConfig?.Aliases?.Items,
        behaviors: (updated.Distribution?.DistributionConfig?.CacheBehaviors?.Items ?? []).map(
          (b) => `${b.PathPattern} -> ${b.TargetOriginId}`,
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
