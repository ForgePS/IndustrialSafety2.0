#!/usr/bin/env node
/**
 * Open the local training portal UAT in your default browser.
 * Seeds UAT data first when .local-training-uat.json is missing.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");
const artifactPath = join(repoRoot, ".local-training-uat.json");
const appBase = (process.env.FORGE_TRAINING_UAT_APP_BASE_URL ?? "http://localhost:3004").replace(
  /\/$/,
  "",
);

function loadArtifact() {
  if (!existsSync(artifactPath)) return null;
  return JSON.parse(readFileSync(artifactPath, "utf8"));
}

function extractToken(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("token")?.trim();
    if (fromQuery) return fromQuery;
    const match = parsed.pathname.match(/\/training\/(?:access\/)?([^/]+)/i);
    const fromPath = match?.[1]?.trim();
    return fromPath && fromPath !== "placeholder" ? fromPath : null;
  } catch {
    return null;
  }
}

function buildViewUrl(token) {
  return `${appBase}/training/portal?token=${encodeURIComponent(token)}`;
}

function openBrowser(url) {
  if (process.env.FORGE_TRAINING_VIEW_NO_OPEN === "1") return;
  const platform = process.platform;
  if (platform === "win32") {
    spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore", shell: true });
    return;
  }
  if (platform === "darwin") {
    spawnSync("open", [url], { stdio: "ignore" });
    return;
  }
  spawnSync("xdg-open", [url], { stdio: "ignore" });
}

function printBanner(viewUrl, artifact) {
  const line = "─".repeat(Math.min(72, viewUrl.length + 4));
  console.log(`\n${line}`);
  console.log("  Training portal UAT");
  console.log(line);
  console.log(`\n  ${viewUrl}\n`);
  console.log(`  Employee: ${artifact?.employeeNumber ?? "10452"} (John Smith)`);
  console.log("  Course:   Annual Lockout/Tagout Training (pass at 80%)");
  console.log(`\n${line}\n`);
}

function main() {
  let artifact = loadArtifact();
  if (!artifact?.viewUrl && !artifact?.portalUrl) {
    console.log("No UAT artifact found — seeding local training data…");
    const seed = spawnSync("node", ["scripts/run-local-training-uat.mjs"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        FORGE_TRAINING_UAT_APP_BASE_URL: appBase,
      },
    });
    if (seed.status !== 0) process.exit(seed.status ?? 1);
    artifact = loadArtifact();
  }

  const token =
    extractToken(artifact?.viewUrl) ??
    extractToken(artifact?.portalUrl) ??
    process.env.FORGE_TRAINING_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error("Could not resolve portal token. Run: pnpm training:uat");
    process.exit(1);
  }

  const viewUrl = artifact?.viewUrl ?? buildViewUrl(token);
  printBanner(viewUrl, artifact);
  openBrowser(viewUrl);
}

main();
