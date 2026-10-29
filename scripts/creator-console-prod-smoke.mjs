/**
 * Unauthenticated Creator Console production smoke (headless Edge/Chrome dump-dom).
 *
 * Usage:
 *   node scripts/creator-console-prod-smoke.mjs
 *   node scripts/creator-console-prod-smoke.mjs --url https://d204ytvvxvsqgl.cloudfront.net/
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const urlArg = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://d204ytvvxvsqgl.cloudfront.net/";

const browsers = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const browser = browsers.find((candidate) => existsSync(candidate));
if (!browser) {
  console.error("E2E=BLOCKED (no Edge/Chrome binary for headless dump-dom)");
  process.exit(2);
}

const dir = mkdtempSync(path.join(tmpdir(), "forge-cc-smoke-"));
const outFile = path.join(dir, "dom.html");

try {
  const result = spawnSync(
    browser,
    ["--headless=new", "--disable-gpu", "--virtual-time-budget=15000", "--dump-dom", urlArg],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  const dom = result.stdout || "";
  writeFileSync(outFile, dom);

  const checks = {
    noLoadingSession: !dom.includes("Loading session"),
    noCheckingPermissions: !dom.includes("Checking permissions"),
    noFacilityUnavailable: !dom.includes("Facility selector unavailable"),
    showsUnauthenticated: dom.includes("Not signed in") || dom.includes("Sign in required"),
    hasSignInCta: /Sign [Ii]n/.test(dom),
  };

  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  }

  const failed = Object.values(checks).some((ok) => !ok);
  console.log(failed ? "LIVE_SMOKE=FAIL" : "LIVE_SMOKE=PASS");
  process.exit(failed ? 1 : 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
