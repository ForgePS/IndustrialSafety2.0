import { test, expect } from "../src/fixtures/index.js";
import { getBaseUrl } from "../src/env.js";

test.describe("Mobile viewport @smoke", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("home and incidents list are usable on mobile", async ({ authenticatedPage: page }) => {
    const baseUrl = getBaseUrl();

    await page.goto(`${baseUrl}/`);
    await expect(page.getByRole("heading", { name: /records management/i })).toBeVisible();

    const createLink = page
      .getByRole("link", { name: /create manual incident|view incidents/i })
      .first();
    await expect(createLink).toBeVisible();

    await page.goto(`${baseUrl}/incidents/`);
    await expect(page.getByRole("heading", { name: /^incidents$/i })).toBeVisible();

    const newIncident = page.getByRole("link", { name: /new incident/i });
    await expect(newIncident).toBeVisible();
  });
});
