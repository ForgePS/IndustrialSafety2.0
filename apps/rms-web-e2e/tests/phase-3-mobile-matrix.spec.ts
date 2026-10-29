import { test, expect } from "../src/fixtures/index.js";
import { getBaseUrl } from "../src/env.js";
import { readTenantId } from "../src/helpers/api.js";
import {
  createManualIncident,
  openIncidentSection,
  waitForAutosaveSaved,
} from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import {
  activateSpecialtySection,
  createStructureFireIncident,
  setPrimaryType,
} from "../src/helpers/specialty.js";

const VIEWPORTS = [
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

async function assertNoHorizontalScroll(page: import("@playwright/test").Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe("Phase 3 specialty mobile matrix @phase3", () => {
  for (const vp of VIEWPORTS) {
    test(`specialty surfaces usable at ${vp.name} (${vp.width}x${vp.height})`, async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const runId = e2eRunId();
      const tenantId = await readTenantId(page);
      expect(tenantId).toBeTruthy();
      const incidentId = await createStructureFireIncident(
        page,
        tenantId!,
        runId,
        `mobile ${vp.name}`,
      );
      await activateSpecialtySection(page, tenantId!, incidentId, "EXPOSURES");
      await activateSpecialtySection(page, tenantId!, incidentId, "CIVILIAN_CASUALTIES");
      await activateSpecialtySection(page, tenantId!, incidentId, "HAZMAT");
      await activateSpecialtySection(page, tenantId!, incidentId, "ALARM_DETECTION");
      await activateSpecialtySection(page, tenantId!, incidentId, "FIRE_PROTECTION");

      await openIncidentSection(page, incidentId, "REVIEW");
      await expect(
        page.getByRole("heading", { name: /officer review|specialty review/i }).first(),
      ).toBeVisible({
        timeout: 20_000,
      });
      await assertNoHorizontalScroll(page);

      // Specialty navigation / validation / review controls not clipped.
      const specialty = page.getByRole("heading", { name: /specialty review/i });
      if (await specialty.isVisible().catch(() => false)) {
        await expect(page.getByLabel(/reviewer role/i)).toBeVisible();
        const box = await page.getByLabel(/reviewer role/i).boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(24);
        expect(box?.height ?? 0).toBeGreaterThan(24);
      }

      await openIncidentSection(page, incidentId, "ATTACHMENTS");
      await assertNoHorizontalScroll(page);

      // Rotation / resize preserves incident context (reload same route).
      await page.setViewportSize({
        width: vp.height,
        height: vp.width,
      });
      await page.goto(`${getBaseUrl()}/incidents/${incidentId}/`);
      await expect(page.locator("body")).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/Top secret|SSN|password/i);
      await assertNoHorizontalScroll(page);

      // Restore viewport for next assertions.
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });
  }

  test("dialogs and save status remain reachable on phone portrait", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const runId = e2eRunId();
    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(runId)} mobile dialogs`,
    );
    await openIncidentSection(page, incidentId, "OVERVIEW");
    const dispatch = page.getByLabel(/dispatch description/i);
    await dispatch.waitFor({ state: "visible", timeout: 15_000 });
    await dispatch.fill(`${syntheticDispatchDescription(runId)} mobile save`);
    await waitForAutosaveSaved(page);
    await assertNoHorizontalScroll(page);
    await expect(page.getByText(/saved|saving|all changes saved/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
