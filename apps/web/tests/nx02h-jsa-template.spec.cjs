/**
 * NX-02H — JSA template create-from-template contract via UI.
 * Hard path (is_template checkbox + Create JSA from template). Prefer nx02r-jsa-template.spec.cjs for full §23.
 */
const { test, expect } = require('@playwright/test')
const {
  login,
  createJsa,
  clickUntilPost,
  addJsaStepHazardControl
} = require('./nx02h-playwright-helpers.cjs')

test.setTimeout(300000)

test('NX-02H JSA template flag + create-from-template', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await login(page, 'admin@forge2.local')

  const title = 'NX-02H template JSA ' + Date.now()
  await createJsa(page, title, { isTemplate: true })
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#jsa-is_template')).toBeChecked()

  await addJsaStepHazardControl(page, {
    stepTitle: 'NX-02H template step',
    hazardText: 'NX-02H template hazard',
    controlTitle: 'NX-02H template control'
  })

  const templateId = page.url().match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
  const fromTemplate = page.getByRole('button', { name: /Create JSA from template/i })
  const response = await clickUntilPost(page, fromTemplate, /\/jsas(\/|$)/i)
  expect(response.ok()).toBeTruthy()
  await page.waitForURL(
    url => {
      const m = String(url.pathname).match(/^\/jsas\/([0-9a-f-]+)$/i)
      return Boolean(m && m[1] !== templateId)
    },
    { timeout: 30000 }
  )
  await expect(page.getByText(/NX-02H template step/i).first()).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#jsa-is_template')).not.toBeChecked()

  await context.close()
})
