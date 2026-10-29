/**
 * NX-02R §23 — JSA template Playwright (no soft path).
 */
const { test, expect } = require('@playwright/test')
const {
  login,
  createJsa,
  clickUntilPost,
  addJsaStepHazardControl
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(360000)

test.describe('NX-02R JSA template', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let templateTitle
  let templateUrl
  let templateId
  let operationalUrl
  let operationalId
  const stepTitle = 'Template step: lockout verify'
  const hazardText = 'Template hazard: residual energy'
  const controlTitle = 'Template control: verify zero energy'

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('create template with content and save', async () => {
    templateTitle = 'NX-02R template ' + Date.now()
    await createJsa(page, templateTitle, { isTemplate: true })
    templateUrl = page.url()
    templateId = templateUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(templateId).toBeTruthy()

    await expect(page.locator('#jsa-is_template')).toBeChecked()
    await addJsaStepHazardControl(page, { stepTitle, hazardText, controlTitle })
    await expect(page.getByText(stepTitle).first()).toBeVisible({ timeout: 20000 })
  })

  test('create operational JSA from template with copied content', async () => {
    await page.goto(templateUrl, { waitUntil: 'networkidle' })
    const fromTemplate = page.getByRole('button', { name: /Create JSA from template/i })
    const response = await clickUntilPost(page, fromTemplate, /\/jsas(\/|$)/i)
    expect(response.ok()).toBeTruthy()
    await page.waitForURL(
      url => {
        const id = String(url).match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
        return Boolean(id && id !== templateId)
      },
      { timeout: 45000 }
    )

    operationalUrl = page.url()
    operationalId = operationalUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(operationalId).toBeTruthy()
    expect(operationalId).not.toBe(templateId)

    await expect(page.getByText(stepTitle).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(hazardText).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(controlTitle).first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('#jsa-is_template')).not.toBeChecked()
  })

  test('edit template leaves operational unchanged', async () => {
    await page.goto(templateUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const stepField = page.locator('#step-title')
    await expect(stepField).toBeVisible({ timeout: 20000 })
    await stepField.fill('Template step MUTATED')
    const addStep = page.getByRole('button', { name: /^Add step$/i })
    await expect(addStep).toBeEnabled({ timeout: 20000 })
    const stepResponse = await clickUntilPost(page, addStep, /\/jsas(\/|$)/i)
    expect(stepResponse.ok()).toBeTruthy()
    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(/Template step MUTATED/i).first()).toBeVisible({ timeout: 20000 })

    await page.goto(operationalUrl)
    await expect(page.getByText(stepTitle).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/Template step MUTATED/i)).toHaveCount(0)
  })
})
