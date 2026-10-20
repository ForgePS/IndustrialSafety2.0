const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
const outsideOrgId = '30000000-0000-4000-8000-000000000100'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 20000 })
}

async function createDraftIncident(page, summary) {
  await page.goto(baseURL + '/incidents/create')
  await expect(page.getByRole('button', { name: 'Save Incident' })).toBeVisible({ timeout: 20000 })

  await page.getByLabel('Incident Type').selectOption({ label: 'Near Miss' })
  await page.getByLabel('Severity').selectOption({ label: 'Moderate' })
  await page.getByLabel('Location').selectOption({ label: 'Demo Location (DEMO)' })
  await page.getByLabel('Date & Time').fill('2026-09-20T10:30')
  await page.getByLabel('Summary').fill(summary)

  const createPost = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/incidents(\/|$)/i.test(new URL(response.url()).pathname),
    { timeout: 30000 }
  )
  await page.getByRole('button', { name: 'Save Incident' }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/incidents\/[0-9a-f-]+$/i, { timeout: 20000 })
  await expect(page.getByText('Draft', { exact: true })).toBeVisible({ timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('incident equipment link, asset history, and tenant isolation smoke test', async ({
  browser
}) => {
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, 'admin@forge2.local')

  const summary = 'Incident equipment smoke near miss ' + Date.now()
  await createDraftIncident(admin, summary)

  const incidentUrl = admin.url()
  const incidentId = incidentUrl.split('/').pop()

  await expect(admin.getByRole('heading', { name: 'Related Equipment' })).toBeVisible({
    timeout: 20000
  })
  await admin.locator('#incident-asset-number').fill('DEMO-AST-000001')

  const linkPost = admin.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/incidents/' + incidentId,
    { timeout: 30000 }
  )
  await admin.getByRole('button', { name: 'Link Equipment' }).click()
  expect((await linkPost).ok()).toBeTruthy()
  await admin.reload({ waitUntil: 'load' })

  const assetLink = admin.getByRole('link', { name: /DEMO-AST-000001/ })
  await expect(assetLink).toBeVisible({ timeout: 20000 })
  const assetHref = await assetLink.getAttribute('href')
  expect(assetHref).toMatch(/\/assets\/[0-9a-f-]+$/i)

  await admin.goto(baseURL + assetHref)
  await expect(admin.getByRole('heading', { name: 'Related Incidents' })).toBeVisible({
    timeout: 20000
  })
  await expect(admin.getByText(summary)).toBeVisible()
  await expect(admin.getByRole('link', { name: /INC-\d+|DEMO-INC-/i })).toBeVisible()

  await admin.goto(incidentUrl)
  await expect(admin.getByRole('link', { name: /DEMO-AST-000001/ })).toBeVisible()

  // Cross-tenant denial uses the seeded multi-tenant employee membership.
  const employeeContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  await login(employee, 'user@forge2.local')

  await employee.goto(baseURL + '/dashboard')
  const orgSwitchPost = employee.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/(dashboard|$)/.test(new URL(response.url()).pathname),
    { timeout: 20000 }
  )
  await employee.getByRole('combobox', { name: /Active company/i }).selectOption(outsideOrgId)
  expect((await orgSwitchPost).ok()).toBeTruthy()
  await employee.reload({ waitUntil: 'load' })
  await expect(employee.getByRole('combobox', { name: /Active company/i })).toHaveValue(
    outsideOrgId
  )

  await employee.goto(baseURL + '/incidents', { waitUntil: 'domcontentloaded' })
  await expect(employee.getByRole('heading', { name: 'Incidents', exact: true })).toBeVisible({ timeout: 20000 })
  await expect(employee.getByText(summary)).toHaveCount(0)

  const isolatedIncident = await employeeContext.request.get(incidentUrl, { maxRedirects: 0 })
  expect(isolatedIncident.status()).toBe(404)

  const isolatedAsset = await employeeContext.request.get(baseURL + assetHref, { maxRedirects: 0 })
  expect(isolatedAsset.status()).toBe(404)

  await employeeContext.close()
  await adminContext.close()
})
