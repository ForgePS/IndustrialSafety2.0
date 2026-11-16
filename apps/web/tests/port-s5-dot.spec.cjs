/**
 * Port slice 5 (Industrial 1.0 -> 2.0) browser smoke for DOT Compliance: open a driver
 * qualification file, fill its credentials, upload a license copy, place a document, see it on
 * the dashboard and the compliance report (and its CSV), add a company driver and upload an MVR,
 * and open and close a DOT record.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s5-dot.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-6)
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

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
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

const open = async (page, url) => {
  await page.goto(url.startsWith('http') ? url : baseURL + url)
  await page.waitForLoadState('networkidle')
}

const poll = (fn, message) => expect.poll(fn, { message, timeout: 30000 })
const today = () => new Date().toISOString().slice(0, 10)
const plusYear = iso => String(Number(iso.slice(0, 4)) + 1) + iso.slice(4)

const seeded = { driver: null, company: null, fileId: null, rosterId: null, recordId: null }

const makePerson = async label =>
  (
    await rest('/rest/v1/forge_personnel', {
      method: 'POST',
      body: {
        organization_id: ORG,
        first_name: 'Dot',
        last_name: `${label} ${RUN}`,
        employee_number: `S5UI-${RUN}-${label}`,
        employment_status: 'active',
        employment_type: 'full_time',
        created_by: ADMIN,
        updated_by: ADMIN
      }
    })
  )[0]

test.beforeAll(async () => {
  seeded.driver = await makePerson('Driver')
  seeded.company = await makePerson('Roster')
})

test.afterAll(async () => {
  const ids = [seeded.driver?.id, seeded.company?.id].filter(Boolean)
  const parents = [
    seeded.fileId && 'driver_file_id=eq.' + seeded.fileId,
    seeded.rosterId && 'company_driver_id=eq.' + seeded.rosterId,
    seeded.recordId && 'record_id=eq.' + seeded.recordId
  ].filter(Boolean)
  const paths = []

  for (const filter of parents) {
    const rows = await rest('/rest/v1/forge_dot_files?select=storage_path&' + filter).catch(() => [])
    paths.push(...rows.map(row => row.storage_path))
  }

  if (paths.length) await rest('/storage/v1/object/forge-dot', { method: 'DELETE', body: { prefixes: paths } }).catch(() => {})
  if (seeded.recordId) await rest('/rest/v1/forge_dot_records?id=eq.' + seeded.recordId, { method: 'DELETE' }).catch(() => {})

  for (const id of ids) {
    await rest('/rest/v1/forge_dot_company_drivers?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_dot_driver_files?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_personnel?id=eq.' + id, { method: 'DELETE' }).catch(() => {})
  }
})

test('a driver qualification file: open, credentials, license copy, a document, dashboard and report', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  const name = `Dot Driver ${RUN}`

  await open(page, '/dot/drivers/new')
  await page.locator('#dqf-driver').selectOption(seeded.driver.id)
  await page.locator('#dqf-class').selectOption('cdl')
  await page.getByRole('button', { name: 'Create Driver File' }).click()
  await page.waitForURL(/\/dot\/drivers\/[0-9a-f-]{36}$/, { timeout: 30000 })
  seeded.fileId = page.url().split('/').pop()

  const person = (await rest('/rest/v1/forge_personnel?select=is_dot_driver&id=eq.' + seeded.driver.id))[0]
  expect(person.is_dot_driver).toBe(true)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)

  // Credentials.
  await page.locator('#dqf-license-number').fill('D' + RUN)
  await page.locator('#dqf-license-state').fill('ar')
  await page.locator('#dqf-license-expires').fill('2029-06-30')
  await page.locator('#dqf-mec-expires').fill('2027-06-30')
  await page.getByRole('button', { name: 'Save Credentials' }).click()
  await poll(
    async () => (await rest('/rest/v1/forge_dot_driver_files?select=license_expires_on,license_state&id=eq.' + seeded.fileId))[0],
    'credentials saved'
  ).toEqual({ license_expires_on: '2029-06-30', license_state: 'AR' })

  // License copy through /api/dot/files.
  await page.getByLabel("Upload Driver's License").setInputFiles({ name: 'license.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.locator('[data-dot-slot="license"]').getByRole('link', { name: 'license.pdf' })).toBeVisible({ timeout: 30000 })

  // A renamed file is refused by the magic-byte check.
  const rejected = await page.evaluate(async fileId => {
    const body = new FormData()
    body.set('file', new File(['<html>'], 'fake.pdf', { type: 'application/pdf' }))
    body.set('parentType', 'dqf')
    body.set('parentId', fileId)
    body.set('slot', 'mvr')
    return (await fetch('/api/dot/files', { method: 'POST', body })).status
  }, seeded.fileId)
  expect(rejected).toBe(400)

  // Place the application.
  const application = page.locator('[data-worksheet-item="application"]')
  await application.getByLabel(/date placed/).fill('2026-01-05')
  await application.getByRole('button', { name: 'Save' }).click()
  await expect(application).toContainText('Placed 01/05/2026', { timeout: 30000 })

  // The signed download link opens the stored copy.
  const href = await page.locator('[data-dot-slot="license"]').getByRole('link', { name: 'license.pdf' }).getAttribute('href')
  const download = await page.request.get(baseURL + href, { maxRedirects: 0 })
  expect([302, 303, 307]).toContain(download.status())

  // Dashboard and driver list.
  await open(page, '/dot')
  await expect(page.locator('[data-attention]').filter({ hasText: name }).first()).toBeVisible()
  await open(page, '/dot/drivers?q=' + RUN)
  await expect(page.locator('[data-driver-file]')).toHaveCount(1)

  // Compliance report and CSV.
  await open(page, '/dot/reports')
  const row = page.locator(`[data-report-row="${name}"]`)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Expires 06/30/2029')
  const csv = await page.request.get(baseURL + '/api/dot/compliance-report')
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-disposition']).toMatch(/dqf-compliance-\d{4}-\d{2}-\d{2}\.csv/)
  expect(await csv.text()).toContain(name)
})

test('a company driver with an MVR upload, and a DOT record opened and closed', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, '/dot/company-drivers')
  await page.getByLabel('Company driver').selectOption(seeded.company.id)
  await page.getByRole('button', { name: 'Add Driver' }).click()
  await page.waitForURL(/\/dot\/company-drivers\/[0-9a-f-]{36}$/, { timeout: 30000 })
  seeded.rosterId = page.url().split('/').pop()

  const flagged = (await rest('/rest/v1/forge_personnel?select=is_company_driver&id=eq.' + seeded.company.id))[0]
  expect(flagged.is_company_driver).toBe(true)
  await expect(page.getByText('Pending initial MVR')).toBeVisible()

  await page.getByLabel('Upload MVR consent form').setInputFiles({ name: 'consent.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.locator('[data-dot-slot="mvr_consent"]').getByRole('link', { name: 'consent.pdf' })).toBeVisible({ timeout: 30000 })
  await page.getByLabel('Upload MVR report').setInputFiles({ name: 'mvr.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.locator('[data-dot-slot="mvr_report"]').getByRole('link', { name: 'mvr.pdf' })).toBeVisible({ timeout: 30000 })

  await poll(
    async () =>
      (await rest('/rest/v1/forge_dot_company_drivers?select=mvr_consent_on,last_mvr_on,next_mvr_due_on&id=eq.' + seeded.rosterId))[0],
    'uploads date the roster row'
  ).toEqual({ mvr_consent_on: today(), last_mvr_on: today(), next_mvr_due_on: plusYear(today()) })
  await expect(page.getByText('MVR received')).toBeVisible()

  await page.locator('#cd-status').selectOption('on_insurance')
  await page.getByRole('button', { name: 'Save Driver' }).click()
  await poll(
    async () => (await rest('/rest/v1/forge_dot_company_drivers?select=status,insurance_effective_on&id=eq.' + seeded.rosterId))[0],
    'status saved'
  ).toEqual({ status: 'on_insurance', insurance_effective_on: today() })

  // A DOT record.
  await open(page, '/dot/records/new?category=accident')
  await expect(page.locator('#dot-record-category')).toHaveValue('accident')
  await page.locator('#dot-record-title').fill(`S5 fender bender ${RUN}`)
  await page.locator('#dot-record-description').fill('Backed into a post in the yard.')
  await page.getByRole('button', { name: 'Create Record' }).click()
  await page.waitForURL(/\/dot\/records\/[0-9a-f-]{36}$/, { timeout: 30000 })
  seeded.recordId = page.url().split('/').pop()
  await page.getByLabel('Upload Attachment').setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(page.locator('[data-dot-slot="attachment"]').getByRole('link', { name: 'report.pdf' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Close Record' }).click()
  await expect(page.getByRole('button', { name: 'Reopen Record' })).toBeVisible({ timeout: 30000 })
  const record = (await rest('/rest/v1/forge_dot_records?select=status,closed_at,record_number&id=eq.' + seeded.recordId))[0]
  expect(record.status).toBe('closed')
  expect(record.closed_at).toBeTruthy()

  await open(page, '/dot/records?status=closed')
  await expect(page.locator(`[data-dot-record="${record.record_number}"]`)).toBeVisible()
})

test('a member without DOT export cannot download the compliance report', async ({ page }) => {
  await login(page, 'user@forge2.local')
  const response = await page.request.get(baseURL + '/api/dot/compliance-report')
  expect(response.status()).toBe(404)
})
