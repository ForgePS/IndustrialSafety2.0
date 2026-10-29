#!/usr/bin/env node
/**
 * Allow Web Bluetooth on Industrial and Field CloudFront response-headers policies.
 *
 * Chromium disables navigator.bluetooth when Permissions-Policy omits bluetooth.
 * COOP same-origin also blocks the Bluetooth device chooser popup.
 *
 *   node scripts/hotfix-prod-web-bluetooth-headers.mjs
 *   APPS=industrial node scripts/hotfix-prod-web-bluetooth-headers.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const POLICIES = {
  industrial: process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd",
  field: process.env.FORGE_FIELD_CF_RHP_ID || "",
};

const apps = (process.env.APPS || "industrial,field")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function awsJson(cmd) {
  return JSON.parse(execSync(cmd, { encoding: "utf8" }));
}

function resolveFieldPolicyId() {
  if (POLICIES.field) return POLICIES.field;
  const listed = awsJson(
    "aws cloudfront list-response-headers-policies --type custom --output json",
  );
  const items = listed.ResponseHeadersPolicyList?.Items ?? [];
  const match = items.find((item) =>
    /cfrhp-field/i.test(item.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name ?? ""),
  );
  return match?.ResponseHeadersPolicy?.Id ?? "";
}

function policyConfigForUpdate(cfg) {
  const security = cfg.SecurityHeadersConfig ?? {};
  const securityOut = {};
  for (const [key, value] of Object.entries(security)) {
    if (value && typeof value === "object" && Object.keys(value).length > 0) {
      securityOut[key] = value;
    }
  }
  const out = {
    Name: cfg.Name,
    SecurityHeadersConfig: securityOut,
  };
  if (cfg.Comment) out.Comment = cfg.Comment;
  if (cfg.CorsConfig) out.CorsConfig = cfg.CorsConfig;
  if (cfg.CustomHeadersConfig) out.CustomHeadersConfig = cfg.CustomHeadersConfig;
  if (cfg.ServerTimingHeadersConfig) out.ServerTimingHeadersConfig = cfg.ServerTimingHeadersConfig;
  return out;
}

function withBluetooth(value) {
  const current = String(value ?? "").trim();
  if (/\bbluetooth\s*=/.test(current)) return current;
  const base = current || "camera=(), microphone=(), geolocation=()";
  return `${base.replace(/,\s*$/, "")}, bluetooth=(self)`;
}

function patchPolicy(policyId) {
  const full = awsJson(`aws cloudfront get-response-headers-policy --id ${policyId} --output json`);
  const etag = full.ETag;
  const cfg = structuredClone(full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
  delete cfg.ResponseHeadersPolicyId;

  const headers = cfg.CustomHeadersConfig?.Items ?? [];
  const perms = headers.find((h) => h.Header.toLowerCase() === "permissions-policy");
  if (!perms) {
    throw new Error(`Permissions-Policy missing on ${policyId}`);
  }
  const nextPerms = withBluetooth(perms.Value);
  const coop = headers.find((h) => h.Header.toLowerCase() === "cross-origin-opener-policy");
  const nextCoop = coop?.Value === "same-origin" ? "same-origin-allow-popups" : coop?.Value;
  if (perms.Value === nextPerms && (!coop || coop.Value === nextCoop)) {
    return { policyId, name: cfg.Name, changed: false, permissionsPolicy: nextPerms };
  }
  perms.Value = nextPerms;
  if (coop && nextCoop) coop.Value = nextCoop;

  const file = `.forge-cf-rhp-bluetooth-${policyId}.json`;
  fs.writeFileSync(file, JSON.stringify(policyConfigForUpdate(cfg)));
  const updated = awsJson(
    `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://${file} --output json`,
  );
  return {
    policyId,
    name: cfg.Name,
    changed: true,
    etagPrior: etag,
    etagNew: updated.ETag,
    permissionsPolicy: nextPerms,
    coop: nextCoop ?? null,
  };
}

const results = [];
for (const app of apps) {
  const policyId = app === "field" ? resolveFieldPolicyId() : POLICIES[app];
  if (!policyId) {
    results.push({ app, ok: false, error: "policy_id_not_found" });
    continue;
  }
  results.push({ app, ok: true, ...patchPolicy(policyId) });
}

console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
if (results.some((r) => !r.ok)) process.exit(1);
