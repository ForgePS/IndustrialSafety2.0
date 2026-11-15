/**
 * Unauthenticated smoke for Creator onboarding routes.
 * Full authenticated E2E requires a secure Creator test principal (not committed).
 *
 * Usage: node scripts/creator-onboarding-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.env.CREATOR_URL ?? "https://d204ytvvxvsqgl.cloudfront.net";
const browsers = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter((p) => existsSync(p));

const browser = browsers[0];
if (!browser) {
  console.error("E2E=BLOCKED (no browser)");
  process.exit(2);
}

const routes = ["/", "/onboarding/", "/onboarding/new/", "/customers/", "/imports/"];
let failed = false;
for (const route of routes) {
  const url = `${base.replace(/\/$/, "")}${route}`;
  const result = spawnSync(
    browser,
    ["--headless=new", "--disable-gpu", "--virtual-time-budget=12000", "--dump-dom", url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const dom = result.stdout || "";
  const hang =
    dom.includes("Loading session…") ||
    (dom.includes("Checking permissions…") && !dom.includes("Sign in"));
  const ok = result.status === 0 && !hang && dom.length > 500;
  console.log(`${ok ? "PASS" : "FAIL"} ${route}`);
  if (!ok) failed = true;
}

console.log(failed ? "ONBOARDING_ROUTE_SMOKE=FAIL" : "ONBOARDING_ROUTE_SMOKE=PASS");
console.log(
  "FULL_E2E_ONBOARDING=CONDITION (authenticated logo/import/activate flow requires secured test user)",
);
process.exit(failed ? 1 : 0);
