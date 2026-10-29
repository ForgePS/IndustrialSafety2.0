#!/usr/bin/env node
/**
 * Deploy session logout fix (web-kit):
 * - Shared refresh must not take per-request AbortSignals
 * - Transient refresh failures must not clear a still-usable session
 *
 * Syncs industrial + field production static sites (both bundle @forge/web-kit).
 */
import { execSync } from "node:child_process";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

const identity = JSON.parse(
  execSync("aws sts get-caller-identity --output json", { encoding: "utf8" }),
);
if (identity.Account !== "511343547817") {
  throw new Error(`Refusing deploy: account ${identity.Account} != 511343547817`);
}

process.env.NODE_ENV = "production";
process.env.FORGE_SAME_ORIGIN_API = process.env.FORGE_SAME_ORIGIN_API ?? "1";

sh(`node scripts/sync-static-site.mjs --app industrial --environment production`);
sh(`node scripts/sync-static-site.mjs --app field --environment production`);

console.log(JSON.stringify({ ok: true, apps: ["industrial", "field"] }, null, 2));
