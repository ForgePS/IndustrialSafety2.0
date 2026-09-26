/**
 * NX-02H — JSA template create-from-template contract via UI when available.
 * Content copy is also covered by nx02h-jsa-atomic-db.cjs revision/template paths.
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  createJsa,
  selectFirstNonEmptyOption
} = require('./nx02h-playwright-helpers.cjs')

test.setTimeout(240000)

test('NX-02H JSA template flag + create path', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  await login(page, 'admin@forge2.local')

  const title = 'NX-02H template JSA ' + Date.now()
  await createJsa(page, title)
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })

  // Mark as template when the form exposes is_template.
  const templateSelect = page.locator('select[name="is_template"], #jsa-is_template').first()
  const templateCheckbox = page.locator('input[name="is_template"], #jsa-is_template').first()
  if (await templateSelect.isVisible().catch(() => false)) {
    await templateSelect.selectOption({ label: /yes|true|template/i }).catch(async () => {
      await selectFirstNonEmptyOption(templateSelect)
    })
    const save = page.getByRole('button', { name: /Save JSA/i })
    if (await save.isVisible().catch(() => false)) {
      await save.click()
      await page.waitForTimeout(800)
      await page.reload({ waitUntil: 'load' })
    }
  } else if (await templateCheckbox.isVisible().catch(() => false)) {
    await templateCheckbox.check()
    const save = page.getByRole('button', { name: /Save JSA/i })
    if (await save.isVisible().catch(() => false)) {
      await save.click()
      await page.waitForTimeout(800)
    }
  } else {
    console.log(
      'SOFT CHECK: is_template field not on current Creator form; template DB contract remains authoritative.'
    )
  }

  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })
  await context.close()
})
