import type { Page } from "@playwright/test";
import type { E2eCredentials } from "../env.js";
import { getBaseUrl } from "../env.js";

export async function loginViaCognitoHostedUi(
  page: Page,
  credentials: E2eCredentials,
): Promise<void> {
  const baseUrl = getBaseUrl();

  await page.goto(`${baseUrl}/login/`);
  await page.getByRole("button", { name: /sign in with cognito/i }).click();

  // Cognito may either show Hosted UI credentials or, with an existing SSO
  // session, bounce straight back to /auth/callback → /select-tenant.
  await page.waitForURL(
    (url) =>
      /amazoncognito\.com|\/oauth2\//.test(url.href) ||
      (url.origin === new URL(baseUrl).origin &&
        (/\/auth\/callback\/?/.test(url.pathname) ||
          /\/select-tenant\/?/.test(url.pathname) ||
          url.pathname === "/" ||
          url.pathname.endsWith("/index.html"))),
    { timeout: 60_000 },
  );

  if (/amazoncognito\.com|\/oauth2\//.test(page.url())) {
    // Cognito Hosted UI renders duplicate username/password fields (visible + hidden).
    const usernameField = page.locator('input[name="username"]:visible').first();
    const passwordField = page.locator('input[name="password"]:visible').first();

    await usernameField.waitFor({ state: "visible", timeout: 30_000 });
    await usernameField.fill(credentials.username);
    await passwordField.fill(credentials.password);

    const submit = page
      .locator(
        'input[name="signInSubmitButton"]:visible, button[type="submit"]:visible, input[type="submit"]:visible',
      )
      .first();
    await submit.click();

    await page.waitForURL(
      (url) =>
        url.origin === new URL(baseUrl).origin &&
        (/\/auth\/callback\/?/.test(url.pathname) ||
          /\/select-tenant\/?/.test(url.pathname) ||
          url.pathname === "/" ||
          url.pathname.endsWith("/index.html")),
      { timeout: 60_000 },
    );
  }

  if (page.url().includes("/auth/callback")) {
    await page.waitForURL(
      (url) =>
        /\/select-tenant\/?/.test(url.pathname) ||
        url.pathname === "/" ||
        url.pathname.endsWith("/index.html"),
      { timeout: 60_000 },
    );
  }
}

export async function selectFirstTenant(page: Page): Promise<void> {
  if (!page.url().includes("/select-tenant")) {
    return;
  }

  await page.getByRole("heading", { name: /select tenant/i }).waitFor({ timeout: 15_000 });

  const selectButton = page.getByRole("button", { name: /^select$/i }).first();
  await selectButton.waitFor({ state: "visible", timeout: 15_000 });
  await selectButton.click();

  await page.waitForURL(
    (url) => !url.pathname.includes("/select-tenant") && !url.pathname.includes("/login"),
    { timeout: 30_000 },
  );
}

export async function ensureAuthenticated(page: Page, credentials: E2eCredentials): Promise<void> {
  // Always perform Cognito Hosted UI login for the provided credentials so
  // isolation tests never inherit another user's session.
  await loginViaCognitoHostedUi(page, credentials);
  await selectFirstTenant(page);
}

export async function createManualIncident(page: Page, description: string): Promise<string> {
  const baseUrl = getBaseUrl();
  await page.goto(`${baseUrl}/incidents/new/`);
  await page.getByRole("heading", { name: /new manual incident/i }).waitFor();

  const descriptionField = page.getByLabel(/initial description/i);
  if (await descriptionField.isVisible().catch(() => false)) {
    await descriptionField.fill(description);
  }

  await page.getByRole("button", { name: /create manual incident/i }).click();
  await page.waitForURL(
    (url) => {
      const match = url.pathname.match(/^\/incidents\/([^/]+)\/?$/);
      return Boolean(match?.[1] && match[1] !== "new" && match[1] !== "placeholder");
    },
    { timeout: 30_000 },
  );

  const match = page.url().match(/\/incidents\/([^/?#]+)/);
  if (!match?.[1] || match[1] === "new" || match[1] === "placeholder") {
    throw new Error(`Could not parse incident id from ${page.url()}`);
  }

  // Hard navigation after create must finish hydrating the workspace before
  // callers issue another goto (avoids aborting auth bootstrap mid-load).
  await page.getByRole("navigation", { name: /incident sections/i }).waitFor({ timeout: 45_000 });
  return match[1];
}

export async function openIncidentSection(
  page: Page,
  incidentId: string,
  section: string,
): Promise<void> {
  const baseUrl = getBaseUrl();
  const targetPath = `/incidents/${incidentId}/`;
  const current = new URL(page.url());
  const alreadyOnIncident =
    current.pathname.replace(/\/?$/, "/") === targetPath &&
    (current.searchParams.get("section") ?? "OVERVIEW") === section;

  if (!alreadyOnIncident) {
    await page.goto(`${baseUrl}${targetPath}?section=${section}`);
  }

  await page
    .getByText(/signed in/i)
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page.getByRole("navigation", { name: /incident sections/i }).waitFor({ timeout: 45_000 });
}

export async function waitForAutosaveSaved(page: Page, timeoutMs = 20_000): Promise<void> {
  await page.getByText(/all changes saved/i).waitFor({ timeout: timeoutMs });
}

export async function searchAndSelectLookup(
  page: Page,
  label: string | RegExp,
  query: string,
): Promise<boolean> {
  const combobox = page.getByRole("combobox", { name: label });
  if (!(await combobox.isVisible().catch(() => false))) {
    return false;
  }

  await combobox.fill(query);
  const listbox = page.getByRole("listbox").first();
  const firstOption = listbox.getByRole("option").first();

  try {
    await firstOption.waitFor({ state: "visible", timeout: 10_000 });
    await firstOption.click();
    return true;
  } catch {
    return false;
  }
}

export async function fillOverviewIfPresent(page: Page): Promise<void> {
  await page
    .getByRole("heading", { name: /^overview$/i })
    .waitFor({ timeout: 15_000 })
    .catch(() => {});

  await searchAndSelectLookup(page, /^station$/i, "st");
  await searchAndSelectLookup(page, /^shift$/i, "sh");
}

export async function assignUnitIfPresent(page: Page, incidentId: string): Promise<void> {
  await openIncidentSection(page, incidentId, "UNITS_PERSONNEL");
  await page
    .getByRole("heading", { name: /units & personnel/i })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});

  const assigned = await searchAndSelectLookup(page, /^unit$/i, "en");
  if (assigned) {
    await page
      .getByRole("heading", { name: /assigned units/i })
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
  }
}

export async function fillClassificationIfPresent(page: Page, incidentId: string): Promise<void> {
  await openIncidentSection(page, incidentId, "CLASSIFICATION");
  const heading = page.getByRole("heading", { name: /^classification$/i });
  if (!(await heading.isVisible().catch(() => false))) {
    return;
  }

  const textInput = page.locator("input[type='text'], textarea").first();
  if (await textInput.isVisible().catch(() => false)) {
    await textInput.fill("E2E synthetic classification note");
    await waitForAutosaveSaved(page).catch(() => {});
  }
}

function incidentIdFromUrl(url: string): string | null {
  const match = url.match(/\/incidents\/([^/]+)\//);
  return match?.[1] ?? null;
}

export { incidentIdFromUrl };
