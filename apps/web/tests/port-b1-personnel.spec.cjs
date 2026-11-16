/**
 * Batch 1 parity (Industrial 1.0 -> 2.0) browser smoke for Personnel: directory filters (search by
 * department and position, Location filter, first/last name sort, linkable URL params), DOT Driver /
 * Company Driver badges, the Archived Personnel view, "Restore to roster", and the profile links to a
 * person's DOT driver file and company driver row.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-personnel.spec.cjs --reporter=line --workers=1
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
const TOKEN = `B1P${RUN}`

test.describe.configure({ mode: 'serial' })
test.setTimeout(180000)

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

const seeded = { location: null, department: null, driver: null, office: null, archived: null, fileId: null, rosterId: null }

const makePerson = async body =>
  (
    await rest('/rest/v1/forge_personnel', {
      method: 'POST',
      body: {
        organization_id: ORG,
        employment_status: 'active',
        employment_type: 'full_time',
        created_by: ADMIN,
        updated_by: ADMIN,
        ...body
      }
    })
  )[0]

test.beforeAll(async () => {
  const locations = await rest(`/rest/v1/locations?select=id,name&organization_id=eq.${ORG}&is_active=eq.true&order=name&limit=1`)
  seeded.location = locations[0] || null

  seeded.department = (
    await rest('/rest/v1/forge_departments', {
      method: 'POST',
      body: { organization_id: ORG, name: `Hauling ${TOKEN}`, created_by: ADMIN, updated_by: ADMIN }
    })
  )[0]

  // Aaron Zulu: a DOT + company driver with a Location. Zack Able: office staff with no Location.
  seeded.driver = await makePerson({
    first_name: 'Aaron',
    last_name: `Zulu ${TOKEN}`,
    employee_number: `${TOKEN}-1`,
    job_title: `Tanker ${TOKEN}`,
    location_id: seeded.location ? seeded.location.id : null,
    is_company_driver: true
  })
  seeded.office = await makePerson({
    first_name: 'Zack',
    last_name: `Able ${TOKEN}`,
    employee_number: `${TOKEN}-2`,
    department_id: seeded.department.id
  })
  seeded.archived = await makePerson({
    first_name: 'Retired',
    last_name: `Person ${TOKEN}`,
    employee_number: `${TOKEN}-3`
  })

  // Opening a DQF marks the driver as a DOT driver (DOT sync trigger).
  seeded.fileId = (
    await rest('/rest/v1/forge_dot_driver_files', {
      method: 'POST',
      body: { organization_id: ORG, personnel_id: seeded.driver.id, file_number: `${TOKEN}-DQF`, created_by: ADMIN }
    })
  )[0].id
  seeded.rosterId = (await rest('/rest/v1/forge_dot_company_drivers?select=id&personnel_id=eq.' + seeded.driver.id))[0].id

  await rest('/rest/v1/forge_personnel?id=eq.' + seeded.archived.id, {
    method: 'PATCH',
    body: { archived_at: new Date().toISOString(), updated_by: ADMIN }
  })
})

test.afterAll(async () => {
  const ids = [seeded.driver?.id, seeded.office?.id, seeded.archived?.id].filter(Boolean)

  for (const id of ids) {
    await rest('/rest/v1/forge_dot_company_drivers?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_dot_driver_files?personnel_id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    await rest('/rest/v1/forge_personnel?id=eq.' + id, { method: 'DELETE' }).catch(() => {})
  }

  if (seeded.department) await rest('/rest/v1/forge_departments?id=eq.' + seeded.department.id, { method: 'DELETE' }).catch(() => {})
})

const rowNames = page => page.getByTestId('personnel-row-name')

test('directory: search, sort, Location filter, driver badges and linkable filters', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  // Search from the URL; the archived person stays off the active roster.
  await open(page, '/personnel?q=' + TOKEN)
  await expect(page.getByLabel('Search personnel')).toHaveValue(TOKEN)
  await expect(page.getByTestId('personnel-row')).toHaveCount(2)

  // Default sort is last name: Able before Zulu.
  await expect(rowNames(page).first()).toContainText(`Able ${TOKEN}`)

  await page.getByLabel('Sort personnel').selectOption('first')
  await expect(rowNames(page).first()).toContainText('Aaron')
  await expect.poll(() => page.url()).toContain('sort=first')

  // Driver badges on the driver row only.
  const driverRow = page.getByTestId('personnel-row').filter({ hasText: `Zulu ${TOKEN}` })
  await expect(driverRow.getByTestId('badge-dot-driver')).toBeVisible()
  await expect(driverRow.getByTestId('badge-company-driver')).toBeVisible()
  const officeRow = page.getByTestId('personnel-row').filter({ hasText: `Able ${TOKEN}` })
  await expect(officeRow.getByTestId('badge-dot-driver')).toHaveCount(0)

  // Search matches department name.
  await page.getByLabel('Search personnel').fill(`Hauling ${TOKEN}`)
  await expect(page.getByTestId('personnel-row')).toHaveCount(1)
  await expect(rowNames(page).first()).toContainText(`Able ${TOKEN}`)

  // Search matches job / position title.
  await page.getByLabel('Search personnel').fill(`Tanker ${TOKEN}`)
  await expect(page.getByTestId('personnel-row')).toHaveCount(1)
  await expect(rowNames(page).first()).toContainText(`Zulu ${TOKEN}`)

  // Location filter.
  await page.getByLabel('Search personnel').fill(TOKEN)

  if (seeded.location) {
    await page.getByLabel('Filter by location').selectOption(seeded.location.id)
    await expect(page.getByTestId('personnel-row')).toHaveCount(1)
    await expect(rowNames(page).first()).toContainText(`Zulu ${TOKEN}`)
    await expect.poll(() => page.url()).toContain('location=' + seeded.location.id)
  }

  await page.getByLabel('Filter by location').selectOption('none')
  await expect(page.getByTestId('personnel-row')).toHaveCount(1)
  await expect(rowNames(page).first()).toContainText(`Able ${TOKEN}`)

  // The filtered URL is linkable: reloading it restores the same view.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Filter by location')).toHaveValue('none')
  await expect(page.getByLabel('Sort personnel')).toHaveValue('first')
  await expect(page.getByTestId('personnel-row')).toHaveCount(1)
})

test('profile links to the DOT driver file and company driver row', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/personnel/' + seeded.driver.id)

  await expect(page.getByTestId('personnel-dot-file-link')).toHaveAttribute('href', '/dot/drivers/' + seeded.fileId)
  await expect(page.getByTestId('personnel-company-driver-link')).toHaveAttribute('href', '/dot/company-drivers/' + seeded.rosterId)

  await open(page, '/personnel/' + seeded.office.id)
  await expect(page.getByTestId('personnel-dot-file-link')).toHaveCount(0)
  await expect(page.getByTestId('personnel-company-driver-link')).toHaveCount(0)
})

test('a member without archive access cannot restore', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await open(page, '/personnel/' + seeded.archived.id)
  await expect(page.getByTestId('personnel-restore')).toHaveCount(0)
})

test('archived view lists only archived people, and Restore to roster puts them back', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, '/personnel')
  await page.getByTestId('personnel-view-archived').click()
  await page.waitForURL(/view=archived/)
  await page.getByLabel('Search personnel').fill(TOKEN)
  await expect(page.getByTestId('personnel-row')).toHaveCount(1)
  await expect(rowNames(page).first()).toContainText(`Person ${TOKEN}`)

  await page.getByTestId('personnel-row').first().getByRole('link', { name: 'Open' }).click()
  await page.waitForURL(new RegExp('/personnel/' + seeded.archived.id))
  await expect(page.getByTestId('personnel-archived-notice')).toBeVisible()

  await page.getByTestId('personnel-restore').click()
  await expect(page.getByTestId('personnel-archived-notice')).toHaveCount(0, { timeout: 30000 })
  await expect(page.getByTestId('personnel-restore')).toHaveCount(0)

  const row = (await rest('/rest/v1/forge_personnel?select=archived_at&id=eq.' + seeded.archived.id))[0]
  expect(row.archived_at).toBeNull()

  const audit = await rest(
    `/rest/v1/forge_creator_audit_log?select=action,actor_user_id&organization_id=eq.${ORG}&entity_id=eq.${seeded.archived.id}&action=eq.personnel.restored`
  )
  expect(audit.length).toBe(1)
  expect(audit[0].actor_user_id).toBe(ADMIN)

  const events = await rest('/rest/v1/forge_personnel_employment_events?select=event_type&personnel_id=eq.' + seeded.archived.id)
  expect(events.map(event => event.event_type)).toContain('restored')

  // Back on the active roster, gone from the archived list.
  await open(page, '/personnel?q=' + TOKEN)
  await expect(page.getByTestId('personnel-row')).toHaveCount(3)
  await open(page, '/personnel?view=archived&q=' + TOKEN)
  await expect(page.getByTestId('personnel-row')).toHaveCount(0)
})
