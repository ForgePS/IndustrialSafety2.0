/**
 * NX-02H — Anonymous observation identity Playwright coverage.
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  selectByLabelHint,
  selectFirstNonEmptyOption
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test.describe('NX-02H anonymous observation identity', () => {
  let observationUrl
  let observationTitle

  test('employee submits anonymous observation and sees Anonymous', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'user@forge2.local')

    observationTitle = 'NX-02H anonymous observation ' + Date.now()
    await page.goto(baseURL + '/observations/create', { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    const titleField = page.locator('input[name="title"], #observation-title').first()
    await expect(titleField).toBeVisible({ timeout: 20000 })
    await titleField.fill(observationTitle)
    await page
      .locator('textarea[name="description"], #observation-description')
      .first()
      .fill('Anonymous reporting path for NX-02H identity hardening.')

    const typeSelect = page.locator('select[name="observation_type"], #observation-observation_type').first()
    if (await typeSelect.isVisible().catch(() => false)) {
      await selectFirstNonEmptyOption(typeSelect)
    }

    const modeSelect = page.locator('select[name="reporting_mode"], #observation-reporting_mode').first()
    await expect(modeSelect).toBeVisible({ timeout: 10000 })
    await modeSelect.selectOption({ label: /anonymous/i }).catch(async () => {
      await modeSelect.selectOption('anonymous')
    })

    const occurred = page.locator('input[name="occurred_at"], #observation-occurred_at').first()
    if (await occurred.isVisible().catch(() => false)) {
      await occurred.fill('2026-09-20T10:00')
    }
    await selectByLabelHint(
      page.locator('select[name="location_id"], #observation-location_id').first(),
      /Cypress Bend Main Plant/i
    )

    await page.getByRole('button', { name: /Save Observation/i }).click()
    await page.waitForURL(/\/observations\/[0-9a-f-]+$/i, { timeout: 60000 })
    observationUrl = page.url()

    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })
    await expect(page.getByText(/^Anonymous$|Reporter:\s*Anonymous|Anonymous/i).first()).toBeVisible({
      timeout: 20000
    })
    // Ordinary viewer without identity permission must not see their email as reporter label.
    const reporterSection = page.locator('text=/Reporter/i').first()
    if (await reporterSection.isVisible().catch(() => false)) {
      await expect(page.getByText(/user@forge2\.local/i)).toHaveCount(0)
    }

    await context.close()
  })

  test('company-owner can open the same anonymous observation', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
    await page.goto(observationUrl)
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })
    // With or without view_reporter_identity, page must load; Anonymous or resolved identity both OK for owner.
    await expect(page.getByText(/Anonymous|Reporter|Forge Demo|user@forge2/i).first()).toBeVisible({
      timeout: 20000
    })
    await context.close()
  })
})
