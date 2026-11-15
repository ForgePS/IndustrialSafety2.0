#!/usr/bin/env node
/**
 * Post-deploy smoke checks against ALB DNS (HTTP).
 * Usage: FORGE_ALB_DNS=xxxx.elb.amazonaws.com node scripts/smoke-development.mjs
 */
const dns = process.env.FORGE_ALB_DNS;
if (!dns) {
  console.error("Set FORGE_ALB_DNS to the ALB DNS name from stack outputs.");
  process.exit(1);
}

const url = `http://${dns}/health`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`Health check failed: ${res.status} ${url}`);
  process.exit(1);
}
const body = await res.json();
console.log("Smoke OK:", body);
