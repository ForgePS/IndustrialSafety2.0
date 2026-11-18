#!/usr/bin/env node
/**
 * S8 evidence closure: widen API CloudFront CORS for authenticated browser E2E (DEF-S8-021).
 * Development only — adds X-Forge-Dev-* headers and Tenant Admin origin.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const policyId = process.env.FORGE_API_CF_RHP_ID || "8814d56a-bf8e-4f64-8fd1-042526fe2c7a";
const tenantAdminOrigin = "https://d1uxdl4szvsixc.cloudfront.net";

const full = JSON.parse(
  execSync(`aws cloudfront get-response-headers-policy --id ${policyId} --output json`, {
    encoding: "utf8",
  }),
);
const etag = full.ETag;
const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;

const origins = new Set(cfg.CorsConfig?.AccessControlAllowOrigins?.Items ?? []);
origins.add("https://d3ud5uzwd9js2z.cloudfront.net");
origins.add("https://ddztl9s33wu40.cloudfront.net");
origins.add(tenantAdminOrigin);

const headers = new Set(cfg.CorsConfig?.AccessControlAllowHeaders?.Items ?? []);
for (const h of [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "If-Match",
  "X-Correlation-Id",
  "X-Request-Id",
  "X-Forge-Dev-Principal",
  "X-Forge-Dev-User",
  "X-Tenant-Id",
]) {
  headers.add(h);
}

const originItems = [...origins];
const headerItems = [...headers];

const out = {
  Name: cfg.Name,
  CorsConfig: {
    AccessControlAllowOrigins: { Quantity: originItems.length, Items: originItems },
    AccessControlAllowHeaders: { Quantity: headerItems.length, Items: headerItems },
    AccessControlAllowMethods: {
      Quantity: 7,
      Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
    },
    AccessControlAllowCredentials: true,
    AccessControlExposeHeaders: {
      Quantity: 3,
      Items: ["ETag", "X-Correlation-Id", "X-Request-Id"],
    },
    AccessControlMaxAgeSec: 600,
    // false: keep Nest enableCors on OPTIONS; true previously dropped ACAO on 204 preflight.
    OriginOverride: false,
  },
  SecurityHeadersConfig: cfg.SecurityHeadersConfig,
  CustomHeadersConfig: cfg.CustomHeadersConfig,
};
if (cfg.Comment) out.Comment = cfg.Comment;

fs.writeFileSync(".forge-cf-rhp.json", JSON.stringify(out));
const updated = JSON.parse(
  execSync(
    `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://.forge-cf-rhp.json --output json`,
    { encoding: "utf8" },
  ),
);

const cors = updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.CorsConfig;
fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
fs.writeFileSync(
  "docs/testing/evidence/import-platform/s8-cf-cors-update.json",
  JSON.stringify(
    {
      policyId,
      etagPrior: etag,
      etagNew: updated.ETag,
      cors,
      defect: "DEF-S8-021",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: true, policyId, cors }, null, 2));
