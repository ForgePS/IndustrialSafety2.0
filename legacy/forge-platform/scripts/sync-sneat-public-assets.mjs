#!/usr/bin/env node
/**
 * Copy canonical Sneat Pro static assets into app public/ folders.
 * Source: apps/industrial-web/public/sneat (Forge front-end shell bundle).
 *
 * Usage:
 *   node scripts/sync-sneat-public-assets.mjs
 *   node scripts/sync-sneat-public-assets.mjs --app creator-console
 *   node scripts/sync-sneat-public-assets.mjs --app field-web
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const source = path.join(repoRoot, "apps", "industrial-web", "public", "sneat");

const TARGETS = {
  "creator-console": path.join(repoRoot, "apps", "creator-console", "public", "sneat"),
  "field-web": path.join(repoRoot, "apps", "field-web", "public", "sneat"),
};

function parseArgs(argv) {
  const appIndex = argv.indexOf("--app");
  if (appIndex === -1) return Object.keys(TARGETS);
  const app = argv[appIndex + 1];
  if (!app || !TARGETS[app]) {
    console.error(`Unknown --app ${app ?? "(missing)"}. Use: ${Object.keys(TARGETS).join("|")}`);
    process.exit(1);
  }
  return [app];
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(source)) {
  console.error(`Missing Sneat source bundle: ${source}`);
  process.exit(1);
}

for (const app of parseArgs(process.argv.slice(2))) {
  const dest = TARGETS[app];
  copyRecursive(source, dest);
  console.log(`Synced Sneat assets → ${path.relative(repoRoot, dest)}`);
}
