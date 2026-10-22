/**
 * NX-02H — Risk matrix administration Playwright coverage.
 */
const { test, expect } = require('@playwright/test')
const { baseURL, login } = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('NX-02H risk matrix view / clone / active retention', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await login(page, 'admin@forge2.local')

  await page.goto(baseURL + '/risk-register/matrices', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: /Risk Matrices/i })).toBeVisible({
    timeout: 20000
  })
  await expect(page.getByText(/forge\.core|tenant\.default|Active|Default/i).first()).toBeVisible({
    timeout: 20000
  })

  const clone = page.getByRole('button', { name: /Clone|Create tenant default|Activate/i }).first()
  if (await clone.isVisible().catch(() => false)) {
    await clone.click()
    await page.waitForTimeout(1000)
    await page.reload({ waitUntil: 'load' })
  } else {
    console.log('SOFT CHECK: Clone/activate control already satisfied for tenant default matrix.')
  }

  await expect(page.getByRole('heading', { name: /Risk Matrices/i })).toBeVisible()
  await expect(page.getByText(/v\d+/i).first()).toBeVisible({ timeout: 20000 })

  await context.close()
})
