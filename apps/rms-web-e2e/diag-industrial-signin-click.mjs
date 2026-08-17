/**
 * Read-only production diagnostic: clicks "Sign in" on the Industrial SPA and
 * records the resulting navigations, network failures, and any Cognito error so
 * the "failed to fetch at login" surface is identified precisely.
 */
import { chromium } from "@playwright/test";

const target = process.argv[2] ?? "https://industrial.forgepublicsafety.com/";

const navigations = [];
const failures = [];
const responses = [];
const consoleErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) navigations.push(frame.url());
});
page.on("requestfailed", (req) => {
  failures.push({ url: req.url(), failure: req.failure()?.errorText ?? null });
});
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("cognito") || url.includes("/api/v1/") || url.includes("oauth2")) {
    responses.push({ url, status: res.status() });
  }
});
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });

const signIn = page.getByRole("button", { name: /sign in/i }).first();
const linkFallback = page.getByRole("link", { name: /sign in/i }).first();
let clicked = "none";
if (await signIn.count()) {
  await signIn.click();
  clicked = "button";
} else if (await linkFallback.count()) {
  await linkFallback.click();
  clicked = "link";
}

await page.waitForTimeout(8_000);
await page.screenshot({ path: "diag-industrial-signin.png", fullPage: true });

console.log(
  JSON.stringify(
    {
      clicked,
      finalUrl: page.url(),
      navigations,
      requestFailures: failures,
      authResponses: responses,
      consoleErrors,
      visibleText: (await page.locator("body").innerText()).slice(0, 1500),
    },
    null,
    2,
  ),
);

await browser.close();
