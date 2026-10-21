#!/usr/bin/env node
/**
 * Hotfix production API CloudFront response-headers CORS allowlist
 * to include the Field SPA origin (OriginOverride:true on this policy).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? "forge-dev";
const POLICY_ID = process.env.FORGE_API_RHP_ID || "94d1cf3f-045e-466e-a471-0053d8d7012b";
const FIELD_ORIGIN = process.env.FORGE_FIELD_ORIGIN || "https://d2qv0f0hojgvqo.cloudfront.net";

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const raw = JSON.parse(
  shOut(`aws cloudfront get-response-headers-policy --id ${POLICY_ID} --output json`),
);
const etag = raw.ETag;
const cfg = raw.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const items = [...(cfg.CorsConfig?.AccessControlAllowOrigins?.Items ?? [])];
if (!items.includes(FIELD_ORIGIN)) {
  items.push(FIELD_ORIGIN);
  console.log(`Adding ${FIELD_ORIGIN}`);
} else {
  console.log(`${FIELD_ORIGIN} already present`);
}
cfg.CorsConfig.AccessControlAllowOrigins.Items = items;
cfg.CorsConfig.AccessControlAllowOrigins.Quantity = items.length;

const tmp = path.join(os.tmpdir(), `forge-api-rhp-${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify(cfg));
console.log(`Writing ${tmp}`);
const updated = JSON.parse(
  shOut(
    `aws cloudfront update-response-headers-policy --id ${POLICY_ID} --if-match ${etag} --response-headers-policy-config file://${tmp.replace(/\\/g, "/")} --output json`,
  ),
);
console.log(
  JSON.stringify(
    updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.CorsConfig.AccessControlAllowOrigins,
    null,
    2,
  ),
);
