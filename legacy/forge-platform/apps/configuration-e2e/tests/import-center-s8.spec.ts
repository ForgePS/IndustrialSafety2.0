import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const CREATOR = process.env.CREATOR_BASE_URL ?? "https://ddztl9s33wu40.cloudfront.net";
const TENANT_ADMIN = process.env.TENANT_ADMIN_BASE_URL ?? "https://d1uxdl4szvsixc.cloudfront.net";
const USER_ID = process.env.FORGE_E2E_USER_ID ?? "c6d951ba-f79a-4d4d-97ab-0bc6a5fda697";
const OPERATOR_ID = process.env.FORGE_E2E_OPERATOR_ID ?? "c6d951ba-f79a-4d4d-97ab-0bc6a5fda697";
const UNAUTHORIZED_ID =
  process.env.FORGE_E2E_UNAUTHORIZED_ID ?? "384092f1-a829-4005-b74f-37e8ce321b5a";
const TENANT_A =
  process.env.IMPORT_ACCEPTANCE_TENANT_A_ID ??
  process.env.FORGE_E2E_TENANT_ID ??
  "019faa15-e558-70b6-adcd-a510c3c995f4";
const TENANT_B =
  process.env.IMPORT_ACCEPTANCE_TENANT_B_ID ?? "019faa15-e578-76bd-b269-038d23c03b5e";

const CANARIES = [
  "S8-TEST-SSN-999-88-7777",
  "S8-TEST-FEMA-123456",
  "S8-TEST-CREDENTIAL-DO-NOT-EXPOSE",
  "S8-TEST-BANK-00001111",
  "S8-TEST-MEDICAL-CANARY",
];

async function seedAuth(
  page: import("@playwright/test").Page,
  base: string,
  tenantId: string,
  userId: string = USER_ID,
) {
  await page.goto(`${base}/`);
  await page.evaluate(
    ({ userId: uid, tenantId: tid }) => {
      localStorage.setItem("forge-dev-principal", JSON.stringify({ userId: uid, tenantId: tid }));
    },
    { userId, tenantId },
  );
}

async function readBrowserPersistence(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const ls: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) ls[k] = localStorage.getItem(k) ?? "";
    }
    const ss: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k) ss[k] = sessionStorage.getItem(k) ?? "";
    }
    return {
      localStorage: ls,
      sessionStorage: ss,
      href: location.href,
      cookies: document.cookie,
    };
  });
}

test.describe("Import Center S8 closeout — Creator Console", () => {
  test("opens /imports/ and fail-closes without import.view", async ({ page }) => {
    await seedAuth(page, CREATOR, TENANT_A, UNAUTHORIZED_ID);
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_A}`);
    await expect(
      page.getByText(/Import Center is unavailable|requires import\.view/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toContain("mock-only");
  });

  test("authorized operator can open Import Center dashboard", async ({ page }) => {
    await seedAuth(page, CREATOR, TENANT_A, OPERATOR_ID);
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center is unavailable/i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Import Center/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test("axe critical/serious on authorized Import Center dashboard", async ({ page }) => {
    await seedAuth(page, CREATOR, TENANT_A, OPERATOR_ID);
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Import Center is unavailable/i)).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blockers = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );
    expect(blockers, blockers.map((v) => `${v.id}:${v.impact}:${v.help}`).join(" | ")).toEqual([]);
  });

  test("browser persistence has no canary values or raw row dumps", async ({ page }) => {
    await seedAuth(page, CREATOR, TENANT_A, OPERATOR_ID);
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center/i).first()).toBeVisible({ timeout: 30_000 });
    const snap = await readBrowserPersistence(page);
    const blob = JSON.stringify(snap);
    for (const c of CANARIES) {
      expect(blob).not.toContain(c);
    }
    expect(blob.toLowerCase()).not.toContain("presigned");
    expect(blob).not.toMatch(/s3:\/\//i);
    expect(snap.href).not.toMatch(/S8-TEST-/);
  });

  test("tenant switch does not leave canary values in storage", async ({ page }) => {
    await seedAuth(page, CREATOR, TENANT_A, OPERATOR_ID);
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center/i).first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${CREATOR}/imports/?tenantId=${TENANT_B}`);
    const snap = await readBrowserPersistence(page);
    const blob = JSON.stringify(snap);
    for (const c of CANARIES) {
      expect(blob).not.toContain(c);
    }
  });
});

test.describe("Import Center S8 closeout — Tenant Admin", () => {
  test("denies Import Center without import.view", async ({ page }) => {
    await seedAuth(page, TENANT_ADMIN, TENANT_A, UNAUTHORIZED_ID);
    await page.goto(`${TENANT_ADMIN}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center is unavailable/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/import\.view/i)).toBeVisible();
  });

  test("authorized operator can open Tenant Admin Import Center", async ({ page }) => {
    await seedAuth(page, TENANT_ADMIN, TENANT_A, OPERATOR_ID);
    await page.goto(`${TENANT_ADMIN}/imports/?tenantId=${TENANT_A}`);
    await expect(page.getByText(/Import Center is unavailable/i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/Import Center/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
