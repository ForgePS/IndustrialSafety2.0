#!/usr/bin/env node
/**
 * Allow HTTPS images (S3/CloudFront branding download URLs) in industrial CSP img-src.
 * Live policy had drifted to `img-src 'self' data: blob:` which blocks tenant logos.
 *
 *   node scripts/hotfix-prod-industrial-csp-img-https.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const policyId = process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd";

function upsertImgSrcHttps(csp) {
  const match = csp.match(/img-src[^;]*/);
  if (!match) {
    const trimmed = csp.replace(/;\s*$/, "");
    return `${trimmed}; img-src 'self' data: blob: https:`;
  }
  const current = match[0];
  // `https:` has no word-boundary after the colon — do not use \bhttps:\b.
  if (/\bhttps:/.test(current) || /https:\/\//.test(current)) {
    // Collapse accidental duplicate https: tokens from prior hotfixes.
    const cleaned = current.replace(/(\s+https:)+/g, " https:");
    return cleaned === current ? csp : csp.replace(current, cleaned);
  }
  return csp.replace(current, `${current} https:`);
}

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
  console.log(
    JSON.stringify({ ok: true, policyId, message: "img-src https: already present", csp }, null, 2),
  );
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

const outFile = ".forge-cf-rhp-industrial-img-https.json";
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

const updated = JSON.parse(
  execSync(
    `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://${outFile} --output json`,
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
