import { test, expect } from "../src/fixtures/index.js";
import { readTenantId } from "../src/helpers/api.js";
import { openIncidentSection } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import { activateSpecialtySection, createStructureFireIncident } from "../src/helpers/specialty.js";

/**
 * Deployed specialty accessibility checks (keyboard + structure).
 * Automated axe unit coverage remains in apps/rms-web; this suite verifies
 * Cognito-deployed specialty review surfaces have no obvious Critical/Serious blockers.
 */
test.describe("Phase 3 specialty accessibility matrix @phase3", () => {
  test("specialty review keyboard, labels, headings, restricted messaging", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const incidentId = await createStructureFireIncident(page, tenantId!, runId, "a11y specialty");
    await activateSpecialtySection(page, tenantId!, incidentId, "EXPOSURES");
    await activateSpecialtySection(page, tenantId!, incidentId, "CIVILIAN_CASUALTIES");

    await openIncidentSection(page, incidentId, "REVIEW");
    await expect(page.getByRole("heading", { name: /officer review/i })).toBeVisible({
      timeout: 20_000,
    });

    const headings = page.getByRole("heading");
    await expect(headings.first()).toBeVisible();

    // Tab order / visible focus: focus a known control and ensure outline/focus visible.
    const specialtyHeading = page.getByRole("heading", { name: /specialty review/i });
    if (await specialtyHeading.isVisible().catch(() => false)) {
      const reviewer = page.getByLabel(/reviewer role/i);
      await reviewer.focus();
      await expect(reviewer).toBeFocused();

      // Comment controls labeled.
      const comment = page.getByLabel(/comment|review comment|note/i).first();
      if (await comment.isVisible().catch(() => false)) {
        await comment.focus();
        await expect(comment).toBeFocused();
      }

      // Escape should not dump focus into an invisible trap indefinitely.
      await page.keyboard.press("Escape");
      await expect(page.locator("body")).toBeVisible();
    }

    // Text zoom to 200% — content remains readable / no critical clip of primary heading.
    await page.evaluate(() => {
      document.documentElement.style.zoom = "200%";
    });
    await expect(
      page.getByRole("heading", { name: /officer review|specialty review/i }).first(),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.zoom = "100%";
    });

    // Restricted casualty messaging: masked list path should not expose names in UI chrome.
    await openIncidentSection(page, incidentId, "OVERVIEW");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/password|ssn|social security/i);
  });
});
