#!/usr/bin/env node
/**
 * Apply img-src https: CSP fix to one or more CloudFront response-headers policies.
 *
 *   node scripts/hotfix-prod-csp-img-https.mjs
 *   node scripts/hotfix-prod-csp-img-https.mjs --policy 8b41a67d-294d-4e19-b2fb-6befd0062950
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const DEFAULT_POLICIES = [
  "879e0836-ba6e-4ae1-b854-4e276d41a8bd", // industrial
  "8b41a67d-294d-4e19-b2fb-6befd0062950", // console
  "805d1195-e7b0-443b-a1f4-7857dcbbcef8", // tenantadmin
  "d1a2eee1-b2ed-4e8b-9d9e-2728279a95a9", // rms
];

function upsertImgSrcHttps(csp) {
  const match = csp.match(/img-src[^;]*/);
  if (!match) {
    const trimmed = csp.replace(/;\s*$/, "");
    return `${trimmed}; img-src 'self' data: blob: https:`;
  }
  const current = match[0];
  if (/\bhttps:/.test(current) || /https:\/\//.test(current)) {
    const cleaned = current.replace(/(\s+https:)+/g, " https:");
    return cleaned === current ? csp : csp.replace(current, cleaned);
  }
  return csp.replace(current, `${current} https:`);
}

const args = process.argv.slice(2);
const explicit = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--policy" && args[i + 1]) {
    explicit.push(args[++i]);
  }
}
const policies = explicit.length ? explicit : DEFAULT_POLICIES;
const results = [];

for (const policyId of policies) {
  const full = JSON.parse(
    execSync(`aws cloudfront get-response-headers-policy --id ${policyId} --output json`, {
      encoding: "utf8",
    }),
  );
  const etag = full.ETag;
  const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
  const csp = cfg.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";
  const updatedCsp = upsertImgSrcHttps(csp);

  if (updatedCsp === csp) {
    results.push({ policyId, name: cfg.Name, status: "unchanged", csp });
    continue;
  }

  const out = {
    Name: cfg.Name,
    SecurityHeadersConfig: {
      ...cfg.SecurityHeadersConfig,
      ContentSecurityPolicy: {
        ...cfg.SecurityHeadersConfig.ContentSecurityPolicy,
        ContentSecurityPolicy: updatedCsp,
        Override: true,
      },
    },
  };
  if (cfg.Comment) out.Comment = cfg.Comment;
  if (cfg.CorsConfig) out.CorsConfig = cfg.CorsConfig;
  if (cfg.CustomHeadersConfig) out.CustomHeadersConfig = cfg.CustomHeadersConfig;

  const outFile = `.forge-cf-rhp-img-https-${policyId}.json`;
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  const updated = JSON.parse(
    execSync(
      `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://${outFile} --output json`,
      { encoding: "utf8" },
    ),
  );

  results.push({
    policyId,
    name: cfg.Name,
    status: "updated",
    etagPrior: etag,
    etagNew: updated.ETag,
    csp: updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.SecurityHeadersConfig
      .ContentSecurityPolicy.ContentSecurityPolicy,
  });
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
