#!/usr/bin/env node
/**
 * Deploy industrial-web only: poll TRAINING materials until PROCESSING clears.
 */
import { execSync } from "node:child_process";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

sh("node scripts/sync-static-site.mjs --app industrial --environment production --full-invalidate");
console.log(JSON.stringify({ ok: true, app: "industrial-web" }, null, 2));
