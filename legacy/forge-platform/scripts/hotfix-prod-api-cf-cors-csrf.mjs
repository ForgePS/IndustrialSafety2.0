#!/usr/bin/env node
/**
 * Hotfix production API CloudFront CORS allowlist to include X-Forge-Csrf.
 * Without this, Safari/Bluefy preflight fails with "Load failed" on any
 * state-changing request that sends the CSRF header (OriginOverride:true).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const POLICY_ID = process.env.FORGE_API_RHP_ID || "94d1cf3f-045e-466e-a471-0053d8d7012b";
const REQUIRED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "If-Match",
  "X-Correlation-Id",
  "X-Request-Id",
  "X-Forge-Csrf",
  "X-Forge-Dev-Principal",
  "X-Forge-Dev-User",
  "X-Tenant-Id",
];

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const raw = JSON.parse(
  shOut(`aws cloudfront get-response-headers-policy --id ${POLICY_ID} --output json`),
);
const etag = raw.ETag;
const cfg = raw.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
if (!cfg.CorsConfig) {
  throw new Error("API response headers policy has no CorsConfig");
}

const existing = cfg.CorsConfig.AccessControlAllowHeaders?.Items ?? [];
const merged = [...new Set([...existing, ...REQUIRED_HEADERS])];
const added = merged.filter((h) => !existing.includes(h));
if (added.length === 0) {
  console.log("X-Forge-Csrf already present; no update needed");
  console.log(JSON.stringify(existing, null, 2));
  process.exit(0);
}

console.log(`Adding headers: ${added.join(", ")}`);
cfg.CorsConfig.AccessControlAllowHeaders = {
  Quantity: merged.length,
  Items: merged,
};

const tmp = path.join(os.tmpdir(), `forge-api-rhp-csrf-${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify(cfg));
const fileUri = `file://${tmp.replace(/\\/g, "/")}`;
const updated = JSON.parse(
  shOut(
    `aws cloudfront update-response-headers-policy --id ${POLICY_ID} --if-match ${etag} --response-headers-policy-config ${fileUri} --output json`,
  ),
);
console.log(
  JSON.stringify(
    updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.CorsConfig.AccessControlAllowHeaders,
    null,
    2,
  ),
);
console.log("Updated API CloudFront CORS allow headers.");
