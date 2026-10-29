#!/usr/bin/env node
/**
 * Raise /api origin read timeout on SPA CloudFront distributions (Field, Industrial).
 * Default 30s causes HTML 504 during sync label render → Bluefy "Non-JSON response (HTTP 504)".
 *
 * Usage:
 *   node scripts/hotfix-spa-api-origin-timeout.mjs
 *   node scripts/hotfix-spa-api-origin-timeout.mjs E1GIQJCA7LRVDQ ENAQ982VUMGQ6
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_IDS = [
  "E1GIQJCA7LRVDQ", // production Field
  "ENAQ982VUMGQ6", // development Field
  "E364CHF9M9794T", // production Industrial
  "EXIC8HBMJ4I2Z", // development Industrial
];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
const READ_TIMEOUT = Number(process.env.FORGE_CF_ORIGIN_READ_TIMEOUT || 60);
const KEEPALIVE = Number(process.env.FORGE_CF_ORIGIN_KEEPALIVE || 60);

function shOut(cmd) {
  return execSync(cmd, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
}

for (const id of ids) {
  console.log(`\n=== ${id} ===`);
  const raw = JSON.parse(shOut(`aws cloudfront get-distribution-config --id ${id} --output json`));
  const etag = raw.ETag;
  const cfg = raw.DistributionConfig;
  const behaviors = [
    cfg.DefaultCacheBehavior,
    ...((cfg.CacheBehaviors && cfg.CacheBehaviors.Items) || []),
  ].filter(Boolean);

  const apiOriginIds = new Set();
  for (const b of behaviors) {
    const pathPattern = b.PathPattern || "default";
    if (pathPattern === "/api/*" || pathPattern === "/health") {
      apiOriginIds.add(b.TargetOriginId);
    }
  }
  if (apiOriginIds.size === 0) {
    // Fallback: any custom HTTPS origin that looks like the API host.
    for (const o of cfg.Origins.Items) {
      const domain = String(o.DomainName || "").toLowerCase();
      if (
        o.CustomOriginConfig &&
        (domain.includes("api.") || domain.includes("api-") || domain.includes("forgepublicsafety"))
      ) {
        // Prefer origins targeted by /api/* only; skip S3.
        continue;
      }
    }
    console.warn("No /api/* behavior found — skipping");
    continue;
  }

  let changed = false;
  for (const origin of cfg.Origins.Items) {
    if (!apiOriginIds.has(origin.Id)) continue;
    if (!origin.CustomOriginConfig) {
      console.warn(`Origin ${origin.Id} is not custom — skip`);
      continue;
    }
    const before = {
      read: origin.CustomOriginConfig.OriginReadTimeout,
      keepalive: origin.CustomOriginConfig.OriginKeepaliveTimeout,
    };
    origin.CustomOriginConfig.OriginReadTimeout = READ_TIMEOUT;
    origin.CustomOriginConfig.OriginKeepaliveTimeout = KEEPALIVE;
    console.log(
      `Origin ${origin.Id} (${origin.DomainName}): read ${before.read}→${READ_TIMEOUT}s, keepalive ${before.keepalive}→${KEEPALIVE}s`,
    );
    changed = true;
  }

  if (!changed) {
    console.warn("No origins updated");
    continue;
  }

  const tmp = path.join(os.tmpdir(), `forge-cf-dist-${id}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(cfg));
  const fileUri = `file://${tmp.replace(/\\/g, "/")}`;
  shOut(
    `aws cloudfront update-distribution --id ${id} --if-match ${etag} --distribution-config ${fileUri} --output json`,
  );
  console.log(`Updated distribution ${id}`);
}

console.log("\nDone. CloudFront origin timeout changes deploy in a few minutes.");
