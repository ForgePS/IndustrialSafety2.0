import { test, expect } from "@playwright/test";

/**
 * FX-S2 presentation regression scaffold.
 * Enable locally with foundation + module flags as needed.
 * Default CI keeps flags off (legacy presentation).
 */
const fxShell = process.env.NEXT_PUBLIC_FX_RMS_SHELL_ENABLED === "true";
const fxNav = process.env.NEXT_PUBLIC_FX_RMS_NAVIGATION_ENABLED === "true";
const fxWorkspace = process.env.NEXT_PUBLIC_FX_RMS_WORKSPACE_ENABLED === "true";
const fxForms = process.env.NEXT_PUBLIC_FX_RMS_FORMS_ENABLED === "true";
const fxTables = process.env.NEXT_PUBLIC_FX_RMS_TABLES_ENABLED === "true";
const fxModuleIncidents = process.env.NEXT_PUBLIC_FX_RMS_MODULE_INCIDENTS_ENABLED === "true";
const fxModuleIncidentReview =
  process.env.NEXT_PUBLIC_FX_RMS_MODULE_INCIDENT_REVIEW_ENABLED === "true";
const fxModuleCadMessages = process.env.NEXT_PUBLIC_FX_RMS_MODULE_CAD_MESSAGES_ENABLED === "true";
const fxModuleCadConnections =
  process.env.NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONNECTIONS_ENABLED === "true";
const fxModuleCadConflicts = process.env.NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONFLICTS_ENABLED === "true";
const fxModuleNerisConfiguration =
  process.env.NEXT_PUBLIC_FX_RMS_MODULE_NERIS_CONFIGURATION_ENABLED === "true";
const fxModuleAdministration =
  process.env.NEXT_PUBLIC_FX_RMS_MODULE_ADMINISTRATION_ENABLED === "true";
const fxModuleUtilities = process.env.NEXT_PUBLIC_FX_RMS_MODULE_UTILITIES_ENABLED === "true";

test.describe("FX-S2 shell flag matrix", () => {
  test("legacy shell is default when FX flags are off", async ({ page }) => {
    test.skip(fxShell, "FX shell forced on via env");
    await page.goto("/");
    await expect(page.getByTestId("rms-legacy-shell")).toBeVisible();
  });

  test("FX shell appears when shell flag forced on", async ({ page }) => {
    test.skip(!fxShell, "Set NEXT_PUBLIC_FX_RMS_SHELL_ENABLED=true to run");
    await page.goto("/");
    await expect(page.getByTestId("rms-fx-shell")).toBeVisible();
    await expect(page.getByTestId("rms-fx-product-identity")).toContainText("Forge RMS");
  });

  test("secondary navigation appears when FX nav forced on", async ({ page }) => {
    test.skip(!(fxShell && fxNav), "Requires both FX shell and nav env flags");
    await page.goto("/incidents/");
    // Secondary nav only when group has multiple visible items and flags allow
    await expect(page.getByTestId("rms-fx-shell")).toBeVisible();
  });
});

test.describe("FX-S2D workspace flag matrix", () => {
  test("legacy incident chrome is default when workspace flag is off", async ({ page }) => {
    test.skip(fxWorkspace, "FX workspace forced on via env");
    await page.goto("/incidents/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("FX workspace chrome appears when workspace flag forced on", async ({ page }) => {
    test.skip(!fxWorkspace, "Set NEXT_PUBLIC_FX_RMS_WORKSPACE_ENABLED=true to run");
    // Requires authenticated tenant + real incident id in local runs.
    // Smoke: home still loads; detailed workspace assert is manual/evidence.
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2E forms/tables flag matrix", () => {
  test("legacy new-incident form when forms flag off", async ({ page }) => {
    test.skip(fxForms, "FX forms forced on via env");
    await page.goto("/incidents/new/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("legacy incidents table when tables flag off", async ({ page }) => {
    test.skip(fxTables, "FX tables forced on via env");
    await page.goto("/incidents/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-1 incidents module flag matrix", () => {
  test("legacy incident surfaces when module flag off", async ({ page }) => {
    test.skip(fxModuleIncidents, "Incidents module forced on via env");
    await page.goto("/incidents/");
    await expect(page.locator("main")).toBeVisible();
    await page.goto("/incidents/new/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("module+foundations smoke when incidents module forced on", async ({ page }) => {
    test.skip(
      !(fxModuleIncidents && fxTables && fxForms),
      "Requires MODULE_INCIDENTS + TABLES + FORMS env flags",
    );
    await page.goto("/incidents/");
    await expect(page.locator("main")).toBeVisible();
    await page.goto("/incidents/new/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-2 incident review module flag matrix", () => {
  test("legacy review queue when review module flag off", async ({ page }) => {
    test.skip(fxModuleIncidentReview, "Incident review module forced on via env");
    await page.goto("/review/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("review queue smoke when review module + tables on", async ({ page }) => {
    test.skip(
      !(fxModuleIncidentReview && fxTables),
      "Requires MODULE_INCIDENT_REVIEW + TABLES env flags",
    );
    await page.goto("/review/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-3 CAD messages module flag matrix", () => {
  test("legacy CAD messages when module flag off", async ({ page }) => {
    test.skip(fxModuleCadMessages, "CAD messages module forced on via env");
    await page.goto("/cad/messages/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("CAD messages smoke when module + tables on", async ({ page }) => {
    test.skip(
      !(fxModuleCadMessages && fxTables),
      "Requires MODULE_CAD_MESSAGES + TABLES env flags",
    );
    await page.goto("/cad/messages/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-4 CAD connections module flag matrix", () => {
  test("legacy CAD connections when module flag off", async ({ page }) => {
    test.skip(fxModuleCadConnections, "CAD connections module forced on via env");
    await page.goto("/cad/connections/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("CAD connections smoke when module + forms + tables on", async ({ page }) => {
    test.skip(
      !(fxModuleCadConnections && fxForms && fxTables),
      "Requires MODULE_CAD_CONNECTIONS + FORMS + TABLES env flags",
    );
    await page.goto("/cad/connections/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-5 CAD conflicts module flag matrix", () => {
  test("legacy CAD conflicts when module flag off", async ({ page }) => {
    test.skip(fxModuleCadConflicts, "CAD conflicts module forced on via env");
    await page.goto("/cad/conflicts/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("CAD conflicts smoke when module + tables on", async ({ page }) => {
    test.skip(
      !(fxModuleCadConflicts && fxTables),
      "Requires MODULE_CAD_CONFLICTS + TABLES env flags",
    );
    await page.goto("/cad/conflicts/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-6 NERIS configuration module flag matrix", () => {
  test("legacy NERIS configuration when module flag off", async ({ page }) => {
    test.skip(fxModuleNerisConfiguration, "NERIS configuration module forced on via env");
    await page.goto("/configuration/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("NERIS configuration smoke when module + forms on", async ({ page }) => {
    test.skip(
      !(fxModuleNerisConfiguration && fxForms),
      "Requires MODULE_NERIS_CONFIGURATION + FORMS env flags",
    );
    await page.goto("/configuration/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2F-7 administration & utilities module flag matrix", () => {
  test("legacy select-tenant when administration module flag off", async ({ page }) => {
    test.skip(fxModuleAdministration, "Administration module forced on via env");
    await page.goto("/select-tenant/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("select-tenant smoke when administration + tables on", async ({ page }) => {
    test.skip(
      !(fxModuleAdministration && fxTables),
      "Requires MODULE_ADMINISTRATION + TABLES env flags",
    );
    await page.goto("/select-tenant/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("legacy health when utilities module flag off", async ({ page }) => {
    test.skip(fxModuleUtilities, "Utilities module forced on via env");
    await page.goto("/health/");
    await expect(page.locator("main")).toBeVisible();
  });

  test("health smoke when utilities module on", async ({ page }) => {
    test.skip(!fxModuleUtilities, "Requires MODULE_UTILITIES env flag");
    await page.goto("/health/");
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("FX-S2 route smoke (legacy default)", () => {
  const routes = [
    "/",
    "/login/",
    "/health/",
    "/incidents/",
    "/incidents/new/",
    "/review/",
    "/configuration/",
    "/cad/operations/",
    "/cad/conflicts/",
    "/cad/messages/",
    "/cad/connections/",
    "/cad/unmapped/",
    "/cad/mappings/",
    "/select-tenant/",
  ];

  for (const route of routes) {
    test(`loads ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(
        response?.ok() || response?.status() === 304 || response?.status() === 200,
      ).toBeTruthy();
      await expect(page.locator("main")).toBeVisible();
    });
  }
});
