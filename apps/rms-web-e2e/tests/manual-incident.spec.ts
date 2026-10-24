import { test, expect } from "../src/fixtures/index.js";
import { getBaseUrl } from "../src/env.js";
import {
  assignUnitIfPresent,
  createManualIncident,
  fillClassificationIfPresent,
  fillOverviewIfPresent,
  openIncidentSection,
} from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";

test.describe("Manual incident intake", () => {
  test("creates incident and fills overview assignments @smoke", async ({
    authenticatedPage: page,
  }) => {
    const runId = e2eRunId();
    const description = syntheticDispatchDescription(runId);

    const incidentId = await createManualIncident(page, description);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/draft|in progress|open/i).first()).toBeVisible();

    await fillOverviewIfPresent(page);

    const dispatchField = page.getByLabel(/dispatch description/i);
    if (await dispatchField.isVisible().catch(() => false)) {
      await expect(dispatchField).toHaveValue(
        new RegExp(runId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }

    await assignUnitIfPresent(page, incidentId);
    await fillClassificationIfPresent(page, incidentId);

    await openIncidentSection(page, incidentId, "OVERVIEW");
    await expect(page.getByRole("navigation", { name: /incident sections/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^overview$/i })).toBeVisible();

    await page.goto(`${getBaseUrl()}/incidents/`);
    await expect(page.getByRole("heading", { name: /^incidents$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /open/i }).first()).toBeVisible();
  });
});
