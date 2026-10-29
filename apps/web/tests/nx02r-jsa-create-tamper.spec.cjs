/**
 * NX-02R §P1 — JSA create-status tamper. The create form has no Status control, and a tampered
 * server-action payload carrying status "active"/"approved" must still create a DRAFT JSA.
 */
const { test, expect } = require('@playwright/test')
const { baseURL, login, selectByLabelHint, selectFirstNonEmptyOption } = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

for (const tamperedStatus of ['active', 'approved']) {
  test('tampered create payload status=' + tamperedStatus + ' still creates DRAFT', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')

    await page.goto(baseURL + '/jsas/create', { waitUntil: 'networkidle', timeout: 90000 })
    await page.waitForTimeout(400)

    // No visible Status control on create.
    await expect(page.locator('select[name="status"]:visible, #jsa-status:visible')).toHaveCount(0)

    const title = 'NX-02R tamper ' + tamperedStatus + ' ' + Date.now()
    const titleField = page.locator('input[name="title"], #jsa-title').first()
    await titleField.click()
    await titleField.fill('')
    await titleField.pressSequentially(title, { delay: 10 })
    await selectByLabelHint(page.locator('select[name="location_id"], #jsa-location_id').first(), /Cypress Bend Main Plant/i)
    await selectFirstNonEmptyOption(
      page.locator('select[name="prepared_by_personnel_id"], #jsa-prepared_by_personnel_id').first()
    )

    let tampered = 0
    await page.route(
      url => url.pathname === '/jsas/create',
      async route => {
        const request = route.request()
        const body = request.postData()
        if (request.method() !== 'POST' || !body || !body.includes(title)) {
          await route.continue()
          return
        }
        let next = body
        if (/"status":"[^"]*"/.test(next)) {
          next = next.replace(/"status":"[^"]*"/g, '"status":"' + tamperedStatus + '"')
        } else {
          next = next.replace('{"', '{"status":"' + tamperedStatus + '","')
        }
        if (next !== body) tampered++
        await route.continue({ postData: next })
      }
    )

    await page.getByTestId('jsa-save').or(page.getByRole('button', { name: /Save JSA/i })).click()
    await page.waitForURL(/\/jsas\/[0-9a-f-]+$/i, { timeout: 60000 })
    await page.unrouteAll({ behavior: 'ignoreErrors' })

    expect(tampered, 'Create payload must have been tampered in-flight').toBe(1)
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('jsa-status')).toHaveText(/^Draft$/i, { timeout: 20000 })

    await context.close()
  })
}
