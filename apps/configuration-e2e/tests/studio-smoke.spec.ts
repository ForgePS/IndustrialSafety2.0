import { expect, test } from "@playwright/test";

const CREATOR = process.env.CREATOR_BASE_URL ?? "https://ddztl9s33wu40.cloudfront.net";
const TENANT_ADMIN = process.env.TENANT_ADMIN_BASE_URL ?? "https://d1uxdl4szvsixc.cloudfront.net";
const USER_ID = process.env.FORGE_E2E_USER_ID ?? "019f9c33-288e-7171-8d94-b76c4a4658b6";
const HOME_TENANT = process.env.FORGE_E2E_TENANT_ID ?? "019f9c33-2875-75aa-8d0e-e4bec722565e";
const TARGET_TENANT = process.env.FORGE_E2E_TARGET_TENANT ?? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193";

async function seedAuth(page: import("@playwright/test").Page, base: string) {
  await page.goto(`${base}/`);
  await page.evaluate(
    ({ userId, tenantId }) => {
      localStorage.setItem("forge-dev-principal", JSON.stringify({ userId, tenantId }));
    },
    { userId: USER_ID, tenantId: HOME_TENANT },
  );
}

test.describe("Creator Configuration Studio", () => {
  test("studio home and branding module load without mock banner", async ({ page }) => {
    await seedAuth(page, CREATOR);
    await page.goto(`${CREATOR}/studio/?tenantId=${TARGET_TENANT}`);
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
    expect(body.toLowerCase()).not.toContain("lorem ipsum");
    expect(body.toLowerCase()).not.toContain("mock-only");
    // Prefer studio chrome / links over a specific heading role (layout varies).
    await expect(
      page.getByRole("link", { name: /studio|branding|terminology/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto(`${CREATOR}/studio/branding/?tenantId=${TARGET_TENANT}`);
    await expect(page.locator("body")).toContainText(/branding|payload|version|draft/i, {
      timeout: 30_000,
    });
  });

  test("terminology and dropdowns routes respond", async ({ page }) => {
    await seedAuth(page, CREATOR);
    for (const route of ["terminology", "dropdowns", "navigation", "roles"]) {
      await page.goto(`${CREATOR}/studio/${route}/?tenantId=${TARGET_TENANT}`);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Cannot GET");
    }
  });
});

test.describe("Tenant Admin", () => {
  test("home and studio modules load", async ({ page }) => {
    await seedAuth(page, TENANT_ADMIN);
    await page.goto(`${TENANT_ADMIN}/`);
    await expect(page.locator("body")).toBeVisible();
    await page.goto(`${TENANT_ADMIN}/studio/?tenantId=${TARGET_TENANT}`);
    await expect(page.locator("body")).toBeVisible();
    for (const route of ["branding", "terminology", "dropdowns", "navigation", "roles"]) {
      const res = await page.goto(`${TENANT_ADMIN}/studio/${route}/?tenantId=${TARGET_TENANT}`);
      expect(res?.ok() || res?.status() === 200).toBeTruthy();
    }
  });
});
