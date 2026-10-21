#!/usr/bin/env node
/**
 * Allow Microsoft Office Online embed for training PowerPoint previews.
 *
 *   node scripts/hotfix-prod-industrial-csp-office-embed.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const policyId = process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd";
const OFFICE_FRAME_HOSTS = "https://view.officeapps.live.com https://*.officeapps.live.com";

function upsertOfficeFrameSrc(csp) {
  const match = csp.match(/frame-src[^;]*/);
  if (!match) {
    const trimmed = csp.replace(/;\s*$/, "");
    return `${trimmed}; frame-src 'self' blob: data: ${OFFICE_FRAME_HOSTS}`;
  }
  const current = match[0];
  if (current.includes("officeapps.live.com")) {
    return csp;
  }
  return csp.replace(current, `${current} ${OFFICE_FRAME_HOSTS}`);
}

const full = JSON.parse(
  execSync(`aws cloudfront get-response-headers-policy --id ${policyId} --output json`, {
    encoding: "utf8",
  }),
);
const etag = full.ETag;
const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const csp = cfg.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";
const updatedCsp = upsertOfficeFrameSrc(csp);

if (updatedCsp === csp) {
  console.log(JSON.stringify({ ok: true, policyId, message: "Office frame-src already present", csp }, null, 2));
  process.exit(0);
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

fs.writeFileSync(".forge-cf-rhp-industrial-office-embed.json", JSON.stringify(out, null, 2));

const updated = JSON.parse(
  execSync(
    `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://.forge-cf-rhp-industrial-office-embed.json --output json`,
    { encoding: "utf8" },
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      policyId,
      etagPrior: etag,
      etagNew: updated.ETag,
      csp: updated.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.SecurityHeadersConfig
        .ContentSecurityPolicy.ContentSecurityPolicy,
    },
    null,
    2,
  ),
);
