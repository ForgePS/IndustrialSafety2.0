/**
 * Port slice 15 browser checks: Contractor Safety.
 *
 * As admin@forge2.local:
 * - adds a company for the main plant (pending, not cleared) and a worker with no orientation
 * - signing the worker in is refused, then allowed with an override reason that shows on the on-site list
 * - uploads the general liability certificate (PDF) and records workers' comp, approves the company, records the
 *   orientation: company and worker are cleared, the file opens, and sign-in goes through without an override
 * As user@forge2.local (employee, no contractor permissions): the Contractor Safety pages are closed.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s15-contractors.spec.cjs --reporter=line --workers=1
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { test, expect: baseExpect } = require('@playwright/test')

const expect = baseExpect.configure({ timeout: 30000 })

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')
const COMPANY = `S15 Delta Electric ${RUN}`
const BADGE = `S15-${RUN}`.toUpperCase()
const TODAY = new Date().toISOString().slice(0, 10)
const fixture = {}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)
  return text ? JSON.parse(text) : null
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  const response = await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
  return response
}

test.afterAll(async () => {
  if (!fixture.companyId) return
  const documents = await rest(`/rest/v1/forge_contractor_documents?company_id=eq.${fixture.companyId}&select=storage_path`).catch(() => [])
  for (const document of documents || []) {
    if (document.storage_path) await fetch(`${API_URL}/storage/v1/object/forge-contractors/${document.storage_path}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } }).catch(() => {})
  }
  await rest(`/rest/v1/forge_contractor_companies?id=eq.${fixture.companyId}`, { method: 'DELETE' }).catch(() => {})
})

test('admin adds a pending company and a worker who is not cleared', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/contractors/new')
  const form = page.locator('[data-contractor-company-form]')
  await form.locator('input[name="name"]').fill(COMPANY)
  await form.locator('input[name="trade"]').fill('Electrical')
  await form.locator('input[name="contactEmail"]').fill('ops@delta.example')
  await form.getByLabel('Cypress Bend Main Plant').check()
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/contractors\/[0-9a-f-]{36}$/)
  fixture.companyId = page.url().split('/').pop()

  await expect(page.locator('[data-company-status]')).toHaveText('Pending approval')
  await expect(page.locator('[data-standing]').first()).toHaveText(/Not cleared/)
  await expect(page.locator('[data-standing-problems]')).toContainText('General liability insurance missing')

  await page.getByRole('link', { name: 'Add worker' }).click()
  const worker = page.locator('[data-contractor-worker-form]')
  await worker.locator('input[name="firstName"]').fill('Sam')
  await worker.locator('input[name="lastName"]').fill(`Ortiz ${RUN}`)
  await worker.locator('input[name="badgeNumber"]').fill(BADGE.toLowerCase())
  await worker.getByRole('button', { name: 'Save worker' }).click()
  await page.waitForURL(/\/contractors\/workers\/[0-9a-f-]{36}$/)
  fixture.workerId = page.url().split('/').pop()

  await expect(page.locator('[data-standing]').first()).toHaveText(/Not cleared/)
  await expect(page.locator('[data-standing-problems]')).toContainText(/orientation/i)
  await expect(page.locator('input[name="badgeNumber"]')).toHaveValue(BADGE)
})

test('sign-in is refused, then allowed with an override reason', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/contractors/on-site')
  const form = page.locator('[data-contractor-sign-in-form]')
  await form.locator('select[name="workerId"]').selectOption(fixture.workerId)
  await form.locator('input[name="hostName"]').fill('Pat Host')
  await form.getByRole('button', { name: 'Sign in' }).click()
  await expect(form.locator('[data-sign-in-refusal]')).toContainText('Give a reason')

  await form.locator('textarea[name="overrideReason"]').fill('Emergency switchgear repair')
  await form.getByRole('button', { name: 'Sign in' }).click()
  const row = page.locator(`[data-on-site="Sam Ortiz ${RUN}"]`)
  await expect(row).toBeVisible()
  await expect(row.locator('[data-override]')).toContainText('Emergency switchgear repair')

  const [visit] = await rest(`/rest/v1/forge_contractor_visits?worker_id=eq.${fixture.workerId}&select=override_reason,override_problems`)
  expect(visit.override_problems.map(problem => problem.code)).toEqual(expect.arrayContaining(['orientation_missing', 'company_status_pending']))

  await row.getByRole('button', { name: 'Sign out' }).click()
  await expect(row).toHaveCount(0)
})

test('documents, approval and orientation clear the worker to sign in', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await login(page, 'admin@forge2.local')
  await open(page, '/contractors/' + fixture.companyId)

  const documents = page.locator('[data-contractor-document-form]')
  await documents.locator('select[name="docType"]').selectOption('general_liability')
  await documents.locator('input[name="coverageAmount"]').fill('2,000,000')
  await documents.locator('input[name="expiresOn"]').fill('2030-01-01')
  await documents.locator('input[name="file"]').setInputFiles({ name: 'delta-coi.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% S15 certificate\n%%EOF\n') })
  await documents.getByRole('button', { name: 'Add document' }).click()
  await expect(page.locator('[data-contractor-document="general_liability"]')).toContainText('$2,000,000')

  await documents.locator('select[name="docType"]').selectOption('workers_comp')
  await documents.locator('input[name="expiresOn"]').fill('2030-01-01')
  await documents.getByRole('button', { name: 'Add document' }).click()
  await expect(page.locator('[data-contractor-document="workers_comp"]')).toContainText('No file')

  const link = page.locator('[data-contractor-document="general_liability"] a')
  const file = await page.request.get(baseURL + (await link.getAttribute('href')))
  expect(file.status()).toBe(200)
  expect((await file.body()).toString()).toContain('S15 certificate')

  const status = page.locator('[data-contractor-status-form]')
  await status.locator('select[name="status"]').selectOption('approved')
  await status.getByRole('button', { name: 'Update status' }).click()
  await expect(page.locator('[data-company-status]')).toHaveText('Approved')
  await expect(page.locator('[data-standing]').first()).toHaveText('Cleared')

  await open(page, '/contractors/workers/' + fixture.workerId)
  await page.locator('input[name="orientationCompletedOn"]').fill(TODAY)
  await page.getByRole('button', { name: 'Save worker' }).click()
  await expect(page.locator('[data-standing]').first()).toHaveText('Cleared')

  await open(page, '/contractors/on-site')
  const form = page.locator('[data-contractor-sign-in-form]')
  await form.locator('select[name="workerId"]').selectOption(fixture.workerId)
  await form.getByRole('button', { name: 'Sign in' }).click()
  const row = page.locator(`[data-on-site="Sam Ortiz ${RUN}"]`)
  await expect(row).toBeVisible()
  await expect(row.locator('[data-override]')).toHaveCount(0)
  await row.getByRole('button', { name: 'Sign out' }).click()
  await expect(row).toHaveCount(0)

  await open(page, '/contractors')
  await expect(page.locator(`[data-contractor-company="${COMPANY}"] [data-standing]`)).toHaveText('Cleared')
})

test('an employee without contractor permissions is kept out', async ({ page }) => {
  await login(page, 'user@forge2.local')
  for (const url of ['/contractors', '/contractors/on-site', '/contractors/' + fixture.companyId]) {
    await open(page, url)
    await expect(page).not.toHaveURL(new RegExp('/contractors'))
  }
  const file = await page.request.get(`${baseURL}/contractors/${fixture.companyId}/documents/00000000-0000-4000-8000-000000000000`, { maxRedirects: 0 })
  expect(file.status()).toBe(404)
})
