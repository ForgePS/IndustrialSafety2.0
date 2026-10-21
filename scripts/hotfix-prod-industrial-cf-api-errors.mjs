/**
 * Hotfix: stop industrial CloudFront from rewriting API 403/404 JSON into SPA HTML.
 *
 * Custom error responses are distribution-wide, so Nest 404/403 on /api/* became
 * index.html at HTTP 200 — clients show "Non-JSON response (HTTP 200)".
 *
 * SPA deep links still work via the viewer-request directory-index function.
 *
 * Usage: node scripts/hotfix-prod-industrial-cf-api-errors.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST_ID = process.env.FORGE_INDUSTRIAL_DISTRIBUTION_ID || "E364CHF9M9794T";

function awsJson(args) {
  const r = spawnSync("aws", args, { encoding: "utf8", shell: false });
  if (r.status !== 0) {
    throw new Error(`aws ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout);
}

const current = awsJson([
  "cloudfront",
  "get-distribution-config",
  "--id",
  DIST_ID,
  "--output",
  "json",
]);
const etag = current.ETag;
const cfg = current.DistributionConfig;
const before = cfg.CustomErrorResponses;
console.log("Before CustomErrorResponses:", JSON.stringify(before, null, 2));

cfg.CustomErrorResponses = { Quantity: 0 };
// Drop Items if present — Quantity 0 must not include Items for some API versions.
delete cfg.CustomErrorResponses.Items;

const outPath = join(tmpdir(), `forge-ind-cf-no-spa-errors-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(cfg), "utf8");

const updated = awsJson([
  "cloudfront",
  "update-distribution",
  "--id",
  DIST_ID,
  "--if-match",
  etag,
  "--distribution-config",
  `file://${outPath}`,
  "--output",
  "json",
]);

try {
  unlinkSync(outPath);
} catch {
  // ignore
}

console.log("Updated distribution status:", updated.Distribution?.Status);
console.log(
  "After CustomErrorResponses:",
  JSON.stringify(updated.Distribution?.DistributionConfig?.CustomErrorResponses, null, 2),
);

const inv = awsJson([
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  DIST_ID,
  "--paths",
  "/*",
  "--query",
  "Invalidation.{Id:Id,Status:Status}",
  "--output",
  "json",
]);
console.log("Invalidation:", inv);
