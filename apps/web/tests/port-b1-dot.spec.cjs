/**
 * Batch 1 DOT parity browser checks: dashboard attention cards filter the driver list, record
 * tiles, related DOT records on a driver's file, record due dates and overdue labels, and the
 * company-driver roster search, sort and license follow-ups filter.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-dot.spec.cjs --reporter=line --workers=1
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

const addDays = (iso, days) => {
  const date = new Date(iso + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)
const us = iso => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`

const seeded = { people: [], fileId: null, fileNumber: null, rosterId: null, records: [] }

const makePerson = async label => {
  const row = (
    await rest('/rest/v1/forge_personnel', {
      method: 'POST',
      body: {
        organization_id: ORG,
        first_name: 'Bone',
        last_name: `${label} ${RUN}`,
        employee_number: `B1UI-${RUN}-${label}`,
        employment_status: 'active',
        employment_type: 'full_time',
        created_by: ADMIN,
        updated_by: ADMIN
      }
    })
  )[0]
  seeded.people.push(row.id)
  return row
}

const makeRecord = async (label, extra) => {
  const row = (
    await rest('/rest/v1/forge_dot_records', {
      method: 'POST',
      body: { organization_id: ORG, record_number: `DOT-B1${label}${RUN}`, category: 'roadside_inspection', title: `B1 ${label} ${RUN}`, created_by: ADMIN, ...extra }
    })
  )[0]
  seeded.records.push(row.id)
  return row
}

test.beforeAll(async () => {
  // A DQF with no license copy or expiry: shows under "Missing license copy".
  const driver = await makePerson('Driver')
  const number = await rest('/rest/v1/rpc/next_forge_dot_number', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'dqf' } })
  const file = (
    await rest('/rest/v1/forge_dot_driver_files', {
      method: 'POST',
      body: { organization_id: ORG, personnel_id: driver.id, file_number: number, created_by: ADMIN, updated_by: ADMIN }
    })
  )[0]
  seeded.fileId = file.id
  seeded.fileNumber = file.file_number
  seeded.driver = driver

  // Records about the driver: one overdue, one closed past due.
  seeded.overdue = await makeRecord('O', { personnel_id: driver.id, record_date: addDays(today(), -10), due_on: addDays(today(), -4) })
  seeded.closed = await makeRecord('C', { personnel_id: driver.id, record_date: addDays(today(), -10), due_on: addDays(today(), -4), status: 'closed', closed_by: ADMIN })

  // A company driver with an expired license and no copy.
  const roster = await makePerson('Roster')
  const existing = await rest('/rest/v1/forge_dot_company_drivers?select=id&personnel_id=eq.' + roster.id)
  const body = {
    license_number: `LIC${RUN}`,
    license_expires_on: addDays(today(), -2),
    status: 'on_insurance',
    next_mvr_due_on: addDays(today(), 5)
  }
  seeded.rosterId = existing.length
    ? (await rest('/rest/v1/forge_dot_company_drivers?id=eq.' + existing[0].id, { method: 'PATCH', body }))[0].id
    : (
        await rest('/rest/v1/forge_dot_company_drivers', {
          method: 'POST',
          body: { organization_id: ORG, personnel_id: roster.id, driver_name: `Bone Roster ${RUN}`, employee_number: roster.employee_number, created_by: ADMIN, ...body }
        })
      )[0].id
  seeded.roster = roster
})

test.afterAll(async () => {
  for (const id of seeded.records) await rest('/rest/v1/forge_dot_records?id=eq.' + id, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_dot_records?organization_id=eq.${ORG}&title=like.*${RUN}*`, { method: 'DELETE' }).catch(() => {})

  for (const id of seeded.people) {
    await rest('/rest/v1/forge_dot_company_drivers?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_dot_driver_files?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_personnel?id=eq.' + id, { method: 'DELETE' }).catch(() => {})
  }
})

test('dashboard attention cards filter the driver list, and record tiles count records', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dot')

  const card = page.locator('[data-attention-card="missingLicenseCopy"]')
  await expect(card).toBeVisible()
  await expect(page.locator('[data-dot-record-tile="open"]')).toBeVisible()
  await expect(page.locator('[data-dot-record-tile="roadside_inspection"]')).toBeVisible()

  await card.click()
  await page.waitForURL(/\/dot\/drivers\?attention=missingLicenseCopy/)
  await expect(page.locator('[data-attention-filter="missingLicenseCopy"]')).toBeVisible()
  await expect(page.locator(`[data-driver-file="${seeded.fileNumber}"]`)).toBeVisible()

  await open(page, '/dot/drivers?attention=expired')
  await expect(page.locator(`[data-driver-file="${seeded.fileNumber}"]`)).toHaveCount(0)

  await open(page, '/dot/company-drivers?attention=missingMvrConsent')
  await expect(page.locator(`[data-company-driver="Bone Roster ${RUN}"]`)).toBeVisible()
})

test("a driver's file lists related DOT records with due and overdue labels", async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dot/drivers/' + seeded.fileId)

  const section = page.locator('[data-related-dot-records]')
  await expect(section.locator(`[data-related-dot-record="${seeded.overdue.record_number}"]`)).toContainText('Overdue 4d')
  await expect(section.locator(`[data-related-dot-record="${seeded.closed.record_number}"]`)).not.toContainText('Overdue')

  await section.locator(`[data-related-dot-record="${seeded.overdue.record_number}"]`).click()
  await page.waitForURL(new RegExp('/dot/records/' + seeded.overdue.id))
  await expect(page.locator('[data-dot-record-due]')).toContainText('Overdue 4d')
})

test('a DOT record takes a due date on create and edit, shown on the list', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dot/records/new?personnel=' + seeded.driver.id)
  await expect(page.locator('#dot-record-driver')).toHaveValue(seeded.driver.id)

  const due = addDays(today(), 7)
  await page.locator('#dot-record-title').fill(`B1 due ${RUN}`)
  await page.locator('#dot-record-due').fill(due)
  await page.getByRole('button', { name: 'Create Record' }).click()
  await page.waitForURL(/\/dot\/records\/[0-9a-f-]{36}$/, { timeout: 30000 })
  const id = page.url().split('/').pop()
  seeded.records.push(id)

  const row = (await rest('/rest/v1/forge_dot_records?select=due_on,record_number&id=eq.' + id))[0]
  expect(row.due_on).toBe(due)
  await expect(page.locator('[data-dot-record-due]')).toContainText('Due ' + us(due))

  const later = addDays(today(), 14)
  await page.locator('#dot-record-due').fill(later)
  await page.getByRole('button', { name: 'Save Record' }).click()
  await expect.poll(async () => (await rest('/rest/v1/forge_dot_records?select=due_on&id=eq.' + id))[0].due_on, { timeout: 30000 }).toBe(later)

  // A due date before the record date is refused.
  await page.locator('#dot-record-due').fill(addDays(today(), -30))
  await page.getByRole('button', { name: 'Save Record' }).click()
  await expect(page.getByText('The due date cannot be before the record date.')).toBeVisible({ timeout: 30000 })

  await open(page, '/dot/records?status=open')
  await expect(page.locator(`[data-dot-record="${row.record_number}"]`)).toContainText('Due ' + us(later))
  await expect(page.locator(`[data-dot-record="${seeded.overdue.record_number}"]`)).toContainText('Overdue 4d')
})

test('company-driver roster: search, sort and license follow-ups', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dot/company-drivers')

  const row = page.locator(`[data-company-driver="Bone Roster ${RUN}"]`)
  await page.getByLabel('Search company drivers').fill(`LIC${RUN}`)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForURL(/q=LIC/)
  await expect(row).toBeVisible()
  await expect(page.locator('[data-company-driver]')).toHaveCount(1)

  await open(page, '/dot/company-drivers?q=' + encodeURIComponent(seeded.roster.employee_number))
  await expect(row).toBeVisible()

  await open(page, '/dot/company-drivers?license=1')
  await expect(row).toBeVisible()
  await expect(row).toContainText('No license copy')

  await page.locator('[data-sort="next_mvr"]').click()
  await page.waitForURL(/sort=next_mvr/)
  expect(page.url()).toContain('license=1')
  await expect(row).toBeVisible()
  await page.locator('[data-sort="next_mvr"]').click()
  await page.waitForURL(/dir=desc/)
  await expect(row).toBeVisible()
})
