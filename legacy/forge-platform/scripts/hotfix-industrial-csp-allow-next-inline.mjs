#!/usr/bin/env node
/**
 * Unblock Next.js App Router static export under CSP.
 *
 * Next embeds unique RSC flight payloads as inline <script> on every HTML page.
 * Hashing all of them exceeds CloudFront's CSP header size limit. Until we have
 * per-response CSP (SSR/edge) or externalized flight, allow 'unsafe-inline' for
 * scripts only — still forbid 'unsafe-eval'. Theme boot remains /theme-boot.js.
 *
 * Usage:
 *   node scripts/hotfix-industrial-csp-allow-next-inline.mjs
 *   node scripts/hotfix-industrial-csp-allow-next-inline.mjs --env development
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

const envArg = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : "production";

const targets =
  envArg === "development"
    ? {
        policyId: "31dfc752-0145-4d64-81c7-29903892b76b",
        connectSrc:
          "'self' https://api-dev.forgepublicsafety.com https://industrial-dev.forgepublicsafety.com https://forge-development-547817.auth.us-east-1.amazoncognito.com https://cognito-idp.us-east-1.amazonaws.com https://view.officeapps.live.com https://*.officeapps.live.com https://*.s3.us-east-1.amazonaws.com https://*.s3.amazonaws.com https://s3.us-east-1.amazonaws.com https://s3.amazonaws.com blob:",
      }
    : {
        policyId: process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd",
        connectSrc:
          "'self' https://api.forgepublicsafety.com https://industrial.forgepublicsafety.com https://forge-production-547817.auth.us-east-1.amazoncognito.com https://cognito-idp.us-east-1.amazonaws.com https://view.officeapps.live.com https://*.officeapps.live.com https://*.s3.us-east-1.amazonaws.com https://*.s3.amazonaws.com https://s3.us-east-1.amazonaws.com https://s3.amazonaws.com blob:",
      };

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
  // Next static RSC flight requires inline scripts; no unsafe-eval.
  "script-src 'self' 'unsafe-inline'",
  `connect-src ${targets.connectSrc}`,
  "form-action 'self' https:",
].join("; ");

const full = JSON.parse(
  execFileSync(
    "aws",
    ["cloudfront", "get-response-headers-policy", "--id", targets.policyId, "--output", "json"],
    { encoding: "utf8" },
  ),
);
const etag = full.ETag;
const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
const out = {
  Name: cfg.Name,
  SecurityHeadersConfig: {
    ...cfg.SecurityHeadersConfig,
    ContentSecurityPolicy: {
      ContentSecurityPolicy: csp,
      Override: true,
    },
  },
};
if (cfg.Comment) out.Comment = cfg.Comment;
if (cfg.CorsConfig) out.CorsConfig = cfg.CorsConfig;
if (cfg.CustomHeadersConfig) out.CustomHeadersConfig = cfg.CustomHeadersConfig;

const tmp = path.join(process.cwd(), `.forge-csp-next-inline-${Date.now()}.json`);
writeFileSync(tmp, JSON.stringify(out, null, 2));
try {
  const updated = JSON.parse(
    execFileSync(
      "aws",
      [
        "cloudfront",
        "update-response-headers-policy",
        "--id",
        targets.policyId,
        "--if-match",
        etag,
        "--response-headers-policy-config",
        `file://${tmp.replace(/\\/g, "/")}`,
        "--output",
        "json",
      ],
      { encoding: "utf8" },
    ),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        env: envArg,
        policyId: targets.policyId,
        etagNew: updated.ETag,
        scriptSrc: "script-src 'self' 'unsafe-inline'",
      },
      null,
      2,
    ),
  );
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}
