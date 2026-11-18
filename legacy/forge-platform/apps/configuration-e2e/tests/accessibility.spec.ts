import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const CREATOR = process.env.CREATOR_BASE_URL ?? "https://ddztl9s33wu40.cloudfront.net";
const TENANT_ADMIN = process.env.TENANT_ADMIN_BASE_URL ?? "https://d1uxdl4szvsixc.cloudfront.net";
const USER_ID = process.env.FORGE_E2E_USER_ID ?? "019f9c33-288e-7171-8d94-b76c4a4658b6";
const HOME_TENANT = process.env.FORGE_E2E_TENANT_ID ?? "019f9c33-2875-75aa-8d0e-e4bec722565e";
const TARGET_TENANT = process.env.FORGE_E2E_TARGET_TENANT ?? "019f9e06-a0b2-75f4-9e0b-5ae9befd8193";

test.describe("WCAG smoke", () => {
  test("creator studio branding axe", async ({ page }) => {
    await page.goto(`${CREATOR}/`);
    await page.evaluate(
      ({ userId, tenantId }) => {
        localStorage.setItem("forge-dev-principal", JSON.stringify({ userId, tenantId }));
      },
      { userId: USER_ID, tenantId: HOME_TENANT },
    );
    await page.goto(`${CREATOR}/studio/branding/?tenantId=${TARGET_TENANT}`);
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    test.info().annotations.push({
      type: "a11y",
      description: JSON.stringify({
        critical: critical.length,
        serious: serious.length,
        total: results.violations.length,
        ids: results.violations.map((v) => v.id),
      }),
    });
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  test("tenant admin studio axe", async ({ page }) => {
    await page.goto(`${TENANT_ADMIN}/`);
    await page.evaluate(
      ({ userId, tenantId }) => {
        localStorage.setItem("forge-dev-principal", JSON.stringify({ userId, tenantId }));
      },
      { userId: USER_ID, tenantId: HOME_TENANT },
    );
    await page.goto(`${TENANT_ADMIN}/studio/branding/?tenantId=${TARGET_TENANT}`);
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
