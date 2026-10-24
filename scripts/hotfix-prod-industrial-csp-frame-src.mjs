#!/usr/bin/env node
/**
 * Allow in-app fleet document previews (iframe/img data: and blob:) on Industrial static hosting.
 *
 *   node scripts/hotfix-prod-industrial-csp-frame-src.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const policyId = process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd";
const FRAME_SRC = "frame-src 'self' blob: data:";

const full = JSON.parse(
  execSync(`aws cloudfront get-response-headers-policy --id ${policyId} --output json`, {
    encoding: "utf8",
  }),
);
const etag = full.ETag;
const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const csp = cfg.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy ?? "";

if (csp.includes("frame-src")) {
  console.log(
    JSON.stringify({ ok: true, policyId, message: "frame-src already present", csp }, null, 2),
  );
  process.exit(0);
}

const updatedCsp = `${csp.replace(/;\s*$/, "")}; ${FRAME_SRC}`;

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

fs.writeFileSync(".forge-cf-rhp-industrial-frame-src.json", JSON.stringify(out, null, 2));

const updated = JSON.parse(
  execSync(
    `aws cloudfront update-response-headers-policy --id ${policyId} --if-match ${etag} --response-headers-policy-config file://.forge-cf-rhp-industrial-frame-src.json --output json`,
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
