/**
 * Read-only production diagnostic: loads the Industrial SPA login page in a real
 * browser and records every network failure, cross-origin request target, and
 * console error. Answers "which fetch fails at login, and why" without guessing.
 *
 * Usage: node scripts/diag-industrial-login-fetch.mjs [url]
 */
import { chromium } from "@playwright/test";

const target = process.argv[2] ?? "https://industrial.forgepublicsafety.com/";

const failures = [];
const consoleErrors = [];
const pageErrors = [];
const apiRequests = [];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("requestfailed", (req) => {
  failures.push({
    url: req.url(),
    method: req.method(),
    resourceType: req.resourceType(),
    failure: req.failure()?.errorText ?? null,
  });
});

page.on("response", (res) => {
  const url = res.url();
  if (!url.startsWith(target)) {
    apiRequests.push({ url, status: res.status() });
  }
});

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

page.on("pageerror", (err) => {
  pageErrors.push(err.message);
});

await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });
// Give client-side effects (branding + auth bootstrap) time to fire.
await page.waitForTimeout(5_000);

const apiBase = await page.evaluate(() => {
  const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.src);
  return { scripts, origin: window.location.origin };
});

await page.screenshot({ path: "diag-industrial-login.png", fullPage: true });

console.log(
  JSON.stringify(
    {
      target,
      origin: apiBase.origin,
      requestFailures: failures,
      crossOriginResponses: apiRequests,
      consoleErrors,
      pageErrors,
      visibleText: (await page.locator("body").innerText()).slice(0, 1200),
    },
    null,
    2,
  ),
);

await browser.close();
