import { test, expect } from "@playwright/test";

/**
 * AI Narrative foundation — flags remain disabled by default.
 * Full generate→accept→finalize matrix runs only after product-owner enablement
 * on a dedicated non-Phase-4 synthetic tenant. Uses synthetic data only.
 */
test.describe("AI Narrative Assistant foundation @ai-narrative", () => {
  test("AI Narrative panel is not shown when feature flags are off", async ({ page }) => {
    // Smoke: login page loads; AI panel requires flags that default false.
    await page.goto("/login/");
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    // Ensure we do not advertise an enabled AI assistant on the public surface.
    await expect(page.getByText("AI Narrative Assistant")).toHaveCount(0);
  });
});
