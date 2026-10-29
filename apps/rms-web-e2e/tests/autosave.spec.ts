import { test, expect } from "../src/fixtures/index.js";
import {
  createManualIncident,
  openIncidentSection,
  waitForAutosaveSaved,
} from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import { getPrimaryCredentials, getStorageStatePath, hasPrimaryCredentials } from "../src/env.js";
import { chromium } from "@playwright/test";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import fs from "node:fs";

test.describe("Incident autosave", () => {
  test("persists edits after refresh @smoke", async ({ authenticatedPage: page }) => {
    const runId = e2eRunId();
    const updatedText = `${syntheticDispatchDescription(runId)} Updated for autosave.`;

    const incidentId = await createManualIncident(page, syntheticDispatchDescription(runId));
    await openIncidentSection(page, incidentId, "OVERVIEW");

    const dispatchField = page.getByLabel(/dispatch description/i);
    await dispatchField.waitFor({ state: "visible" });
    await dispatchField.fill(updatedText);

    await waitForAutosaveSaved(page);

    await page.reload();
    await dispatchField.waitFor({ state: "visible" });
    await expect(dispatchField).toHaveValue(updatedText);
  });

  test("dual-context edit surfaces save conflict @smoke", async () => {
    test.skip(!hasPrimaryCredentials(), "Requires Cognito credentials");

    const storageStatePath = getStorageStatePath();
    const storageState =
      storageStatePath && fs.existsSync(storageStatePath) ? storageStatePath : undefined;

    const browser = await chromium.launch();
    const contextA = await browser.newContext(storageState ? { storageState } : {});
    const contextB = await browser.newContext(storageState ? { storageState } : {});
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const credentials = getPrimaryCredentials();
      await ensureAuthenticated(pageA, credentials);
      await ensureAuthenticated(pageB, credentials);

      const runId = e2eRunId();
      const incidentId = await createManualIncident(pageA, syntheticDispatchDescription(runId));

      await openIncidentSection(pageA, incidentId, "OVERVIEW");
      await openIncidentSection(pageB, incidentId, "OVERVIEW");

      const fieldA = pageA.getByLabel(/dispatch description/i);
      const fieldB = pageB.getByLabel(/dispatch description/i);
      await fieldA.waitFor({ state: "visible" });
      await fieldB.waitFor({ state: "visible" });

      await fieldA.fill(`${runId} context A edit`);
      await waitForAutosaveSaved(pageA);

      await fieldB.fill(`${runId} context B conflicting edit`);

      const conflictDialog = pageB.getByRole("dialog", { name: /edit conflict/i });
      await expect(conflictDialog).toBeVisible({ timeout: 25_000 });
      await expect(pageB.getByText("Save conflict")).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
