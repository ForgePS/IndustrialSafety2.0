const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
// Second tenant for the same user, prepared by tests/setup-support-smoke.mjs.
const OUTSIDE_ORG = '30000000-0000-4000-8000-000000000100'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await expect(page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i })).toBeEnabled({ timeout: 20000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

test.describe.configure({ mode: 'serial' })
// CI runs against a cold `next dev` server; first-hit route compiles alone consume ~60s.
test.setTimeout(300000)

test('help desk end-to-end smoke test', async ({ browser }) => {
  const subject = 'Help desk smoke ticket ' + Date.now().toString(36)
  const customerContext = await browser.newContext()
  const customer = await customerContext.newPage()
  await login(customer, 'user@forge2.local')

  await customer.goto(baseURL + '/help-desk/tickets/new')
  await customer.getByRole('radio', { name: /Technical Issue/ }).click()
  await customer.getByRole('button', { name: 'Next' }).click()
  await customer.getByRole('button', { name: 'Next' }).click()
  await customer.getByLabel('Subject').fill(subject)
  await customer.getByLabel('What happened? What did you expect?').fill('Smoke test validating ticket submission, Forge reply, and tenant isolation.')
  await customer.getByRole('button', { name: 'Next' }).click()
  await customer.getByRole('button', { name: 'Submit ticket' }).click()
  await customer.waitForURL(/\/help-desk\/tickets\/[0-9a-f-]{36}\?created=1$/i, { timeout: 60000 })
  const ticketUrl = customer.url().split('?')[0]
  const ticketId = ticketUrl.split('/').pop()
  await expect(customer.getByText(/Ticket SUP-\d{4}-\d{6} submitted\./)).toBeVisible()

  const staffContext = await browser.newContext()
  const staff = await staffContext.newPage()
  await login(staff, 'support@forge2.local')
  await staff.goto(baseURL + '/help-desk/console/tickets/' + ticketId)
  await expect(staff.getByRole('heading', { name: new RegExp(subject) })).toBeVisible()
  await staff.getByLabel('Reply to customer', { exact: true }).fill('Forge smoke reply.')
  await staff.getByRole('button', { name: 'Send reply' }).click()
  await expect(staff.getByRole('status').filter({ hasText: 'Reply sent to the customer.' })).toBeVisible()
  await staffContext.close()

  await customer.goto(ticketUrl)
  await expect(customer.getByText('Forge smoke reply.')).toBeVisible()

  // Same user, other active tenant: the ticket must vanish from lists and direct URLs.
  const isolationContext = await browser.newContext({ storageState: await customerContext.storageState() })
  await isolationContext.addCookies([{ name: 'forge-active-organization', value: OUTSIDE_ORG, domain: new URL(baseURL).hostname, path: '/' }])
  const isolated = await isolationContext.newPage()
  await isolated.goto(baseURL + '/help-desk/tickets')
  await expect(isolated.getByText(subject)).toHaveCount(0)
  const direct = await isolated.goto(ticketUrl)
  expect(direct?.status()).toBe(404)

  await isolationContext.close()
  await customerContext.close()
})
