/**
 * NX-02R §27–28 — Incident → Risk and Inspection Finding → Risk.
 */
const { test, expect } = require('@playwright/test')
const { login, waitForPost, clickUntilPost } = require('./nx02h-playwright-helpers.cjs')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

async function selectFirstNonEmpty(selectLocator) {
  if (!(await selectLocator.isVisible().catch(() => false))) return false
  const options = await selectLocator.locator('option').evaluateAll(nodes =>
    nodes
      .map(node => ({ value: node.value, label: (node.textContent || '').trim() }))
      .filter(item => item.value)
  )
  if (!options.length) return false
  await selectLocator.selectOption(options[0].value)
  return true
}

async function createDraftIncident(page, summary) {
  await page.goto(baseURL + '/incidents/create', { waitUntil: 'networkidle', timeout: 90000 })
  await expect(page.getByRole('button', { name: /Save Incident/i })).toBeVisible({ timeout: 20000 })

  await page.getByLabel('Incident Type').selectOption({ label: 'Near Miss' })
  await page.getByLabel('Severity').selectOption({ label: 'Moderate' })
  const locationSelect = page.getByLabel('Location')
  const locationValue = await locationSelect
    .locator('option')
    .filter({ hasText: /Demo Location/i })
    .first()
    .getAttribute('value')
  expect(locationValue).toBeTruthy()
  await locationSelect.selectOption(locationValue)
  await page.getByLabel('Date & Time').fill('2026-09-20T10:30')
  await page.getByLabel('Summary').fill(summary)

  const description = page.getByLabel('Description')
  if (await description.isVisible().catch(() => false)) {
    await description.fill(
      'NX-02R incident context for risk creation: unguarded pinch point near conveyor.'
    )
  }

  const createPost = waitForPost(page, /\/incidents(\/|$)/i, 30000)
  await page.getByRole('button', { name: /Save Incident/i }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/incidents\/[0-9a-f-]+$/i, { timeout: 60000 })
}

async function createInspectionWithFinding(page, findingTitle) {
  await page.goto(baseURL + '/inspections/create', { waitUntil: 'networkidle', timeout: 90000 })
  await expect(page.getByRole('button', { name: /Save|Create/i }).first()).toBeVisible({
    timeout: 20000
  })

  // Inspection Creator form selects are unlabeled; target them by their option content.
  const main = page.locator('main')
  const templateSelect = main
    .locator('select')
    .filter({ has: page.locator('option', { hasText: /Select inspection template/i }) })
    .first()
  await expect(templateSelect).toBeVisible({ timeout: 20000 })
  await selectFirstNonEmpty(templateSelect)

  const locationSelect = main
    .locator('select')
    .filter({ has: page.locator('option', { hasText: /Demo Location/i }) })
    .first()
  await expect(locationSelect).toBeVisible({ timeout: 20000 })
  const demoValue = await locationSelect
    .locator('option')
    .filter({ hasText: /Demo Location/i })
    .first()
    .getAttribute('value')
  expect(demoValue).toBeTruthy()
  await locationSelect.selectOption(demoValue)

  const dateInput = main.locator('input[type="date"]').first()
  await expect(dateInput).toBeVisible({ timeout: 20000 })
  await dateInput.fill('2026-09-20')

  const saveButton = page.getByRole('button', { name: /Save Inspection|Create Inspection|Save/i }).first()
  const createResponse = await clickUntilPost(page, saveButton, /\/inspections(\/|$)/i)
  expect(createResponse.ok()).toBeTruthy()
  await page.waitForURL(/\/inspections\/[0-9a-f-]+$/i, { timeout: 60000 })

  // Checklist "Finding" opens the inline create form for an item.
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
  const findingTrigger = page.getByRole('button', { name: /^Finding$/i }).first()
  await expect(findingTrigger).toBeVisible({ timeout: 20000 })

  const findingForm = page
    .locator('div.rounded-lg.border')
    .filter({ has: page.getByRole('button', { name: /^Create Finding$/i }) })
    .last()
  // Opening the inline form is client-only state; retry if the click landed before hydration.
  let formOpen = false
  for (let attempt = 0; attempt < 4 && !formOpen; attempt++) {
    await page.waitForTimeout(300)
    await findingTrigger.click()
    formOpen = await findingForm
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false)
  }
  expect(formOpen, 'Create Finding form must open').toBeTruthy()
  const titleInput = findingForm.locator('input:not([type="date"])').first()
  await titleInput.fill(findingTitle)

  const description = findingForm.locator('textarea').first()
  if (await description.isVisible().catch(() => false)) {
    await description.fill('NX-02R finding hazard: missing guard on rotating shaft.')
  }

  const createFindingButton = findingForm.getByRole('button', { name: /^Create Finding$/i })
  await expect(createFindingButton).toBeEnabled({ timeout: 10000 })
  const createFindingPost = waitForPost(page, /\/inspections(\/|$)/i, 30000)
  await createFindingButton.click()
  expect((await createFindingPost).ok()).toBeTruthy()
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(findingTitle, { exact: true }).first()).toBeVisible({ timeout: 20000 })
}

test.describe('NX-02R Incident and Finding → Risk', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('Incident detail Create Risk prefills and links to risk register', async () => {
    const summary = 'NX-02R incident risk ' + Date.now()
    await createDraftIncident(page, summary)

    const createRisk = page.getByRole('button', { name: /^Create Risk$/i })
    await expect(createRisk).toBeVisible({ timeout: 20000 })

    const riskResponse = await clickUntilPost(page, createRisk, /\/incidents(\/|$)/i)
    expect(riskResponse.ok()).toBeTruthy()
    await page.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 30000 })

    await expect(page.getByRole('heading', { name: summary })).toBeVisible({ timeout: 20000 })
    await expect(page.getByLabel('Source Type')).toHaveValue('incident', { timeout: 15000 })
    await expect(page.getByLabel('Source Reference')).toHaveValue(/\S+/)
  })

  test('Inspection finding Create Risk from Finding links to risk register', async () => {
    const findingTitle = 'NX-02R finding risk ' + Date.now()
    await createInspectionWithFinding(page, findingTitle)

    const createRisk = page.getByRole('button', { name: /Create Risk from Finding/i })
    await expect(createRisk).toBeVisible({ timeout: 20000 })

    const riskResponse = await clickUntilPost(page, createRisk, /\/inspections(\/|$)/i)
    expect(riskResponse.ok()).toBeTruthy()
    await page.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 30000 })

    await expect(page.getByRole('heading', { name: findingTitle })).toBeVisible({ timeout: 20000 })
    await expect(page.getByLabel('Source Type')).toHaveValue('inspection', { timeout: 15000 })
    await expect(page.getByLabel('Source Reference')).toHaveValue(/\S+/)
  })
})
