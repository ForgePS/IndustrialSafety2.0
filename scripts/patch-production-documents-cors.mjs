#!/usr/bin/env node
/**
 * Patch production documents (and imports/exports) S3 CORS to allow tenant vanity
 * hosts under *.forgepublicsafety.com for browser presigned PUT uploads.
 *
 * Usage: node scripts/patch-production-documents-cors.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const REGION = "us-east-1";
const ACCOUNT = "511343547817";
const BUCKETS = [
  `forge-production-documents-${ACCOUNT}-${REGION}`,
  `forge-production-imports-${ACCOUNT}-${REGION}`,
  `forge-production-exports-${ACCOUNT}-${REGION}`,
];

const VANITY_ORIGIN = "https://*.forgepublicsafety.com";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function patchBucket(bucket) {
  const raw = sh(`aws s3api get-bucket-cors --bucket ${bucket} --region ${REGION} --output json`);
  const cors = JSON.parse(raw);
  const rule = cors.CORSRules?.[0];
  if (!rule) throw new Error(`No CORS rule on ${bucket}`);
  const origins = new Set(rule.AllowedOrigins ?? []);
  if (origins.has(VANITY_ORIGIN)) {
    console.log(`${bucket}: already allows ${VANITY_ORIGIN}`);
    return;
  }
  origins.add(VANITY_ORIGIN);
  rule.AllowedOrigins = [...origins].sort();
  const path = `.forge-cors-${bucket.replace(/[^a-z0-9-]/gi, "-")}.json`;
  fs.writeFileSync(path, JSON.stringify({ CORSRules: cors.CORSRules }, null, 2));
  sh(
    `aws s3api put-bucket-cors --bucket ${bucket} --region ${REGION} --cors-configuration file://${path}`,
  );
  console.log(`${bucket}: added ${VANITY_ORIGIN}`);
}

for (const bucket of BUCKETS) {
  patchBucket(bucket);
}

console.log("Done.");
