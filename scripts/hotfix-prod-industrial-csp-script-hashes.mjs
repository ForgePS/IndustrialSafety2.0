#!/usr/bin/env node
/**
 * Rebuild industrial CSP script-src hashes from static export HTML.
 * Next.js App Router embeds RSC flight data as inline <script> tags; with
 * script-src 'self' only, browsers block them and the app white-screens.
 *
 * Usage:
 *   node scripts/hotfix-prod-industrial-csp-script-hashes.mjs
 *   node scripts/hotfix-prod-industrial-csp-script-hashes.mjs --out apps/industrial-web/out
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const POLICY_ID = process.env.FORGE_INDUSTRIAL_CF_RHP_ID || "879e0836-ba6e-4ae1-b854-4e276d41a8bd";
const outIdx = process.argv.indexOf("--out");
const outRoot =
  outIdx === -1
    ? path.join(process.cwd(), "apps/industrial-web/out")
    : path.resolve(process.argv[outIdx + 1]);

function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function extractInlineScripts(html) {
  const bodies = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    bodies.push(m[2] ?? "");
  }
  return bodies;
}

function sha256Csp(body) {
  const hash = createHash("sha256").update(body, "utf8").digest("base64");
  return `'sha256-${hash}'`;
}

if (!existsSync(outRoot)) {
  throw new Error(`Export directory not found: ${outRoot}`);
}

const hashes = new Set();
const files = walkHtml(outRoot);
for (const file of files) {
  const html = readFileSync(file, "utf8");
  for (const body of extractInlineScripts(html)) {
    hashes.add(sha256Csp(body));
  }
}

if (hashes.size === 0) {
  throw new Error(`No inline scripts found under ${outRoot}`);
}

const scriptSrc = ["'self'", ...[...hashes].sort()].join(" ");

const baseCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "frame-src 'self' blob: data: https://view.officeapps.live.com https://*.officeapps.live.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src ${scriptSrc}`,
  "connect-src 'self' https://api.forgepublicsafety.com https://forge-production-547817.auth.us-east-1.amazoncognito.com https://cognito-idp.us-east-1.amazonaws.com https://view.officeapps.live.com https://*.officeapps.live.com https://*.s3.us-east-1.amazonaws.com https://*.s3.amazonaws.com https://s3.us-east-1.amazonaws.com https://s3.amazonaws.com blob:",
  "form-action 'self' https:",
].join("; ");

const full = JSON.parse(
  execFileSync("aws", ["cloudfront", "get-response-headers-policy", "--id", POLICY_ID, "--output", "json"], {
    encoding: "utf8",
  }),
);
const etag = full.ETag;
const cfg = full.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;

const out = {
  Name: cfg.Name,
  SecurityHeadersConfig: {
    ...cfg.SecurityHeadersConfig,
    ContentSecurityPolicy: {
      ContentSecurityPolicy: baseCsp,
      Override: true,
    },
  },
};
if (cfg.Comment) out.Comment = cfg.Comment;
if (cfg.CorsConfig) out.CorsConfig = cfg.CorsConfig;
if (cfg.CustomHeadersConfig) out.CustomHeadersConfig = cfg.CustomHeadersConfig;

const tmp = path.join(process.cwd(), `.forge-csp-hashes-${Date.now()}.json`);
writeFileSync(tmp, JSON.stringify(out, null, 2));
try {
  const updated = JSON.parse(
    execFileSync(
      "aws",
      [
        "cloudfront",
        "update-response-headers-policy",
        "--id",
        POLICY_ID,
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
        policyId: POLICY_ID,
        htmlFiles: files.length,
        hashCount: hashes.size,
        etagNew: updated.ETag,
        scriptSrcPreview: scriptSrc.slice(0, 200) + "...",
      },
      null,
      2,
    ),
  );
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}
