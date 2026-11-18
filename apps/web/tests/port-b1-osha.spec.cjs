/**
 * Batch 1 parity (OSHA recordkeeping) browser smoke:
 *   - "Open OSHA case" straight from the injury incidents list on /osha;
 *   - "Fix before printing" on /osha and /osha/log, with "Export anyway" before the CSV download;
 *   - the Form 300 CSV is one establishment at a time (29 CFR 1904.30).
 * Seeds its own establishment and incident through the service role and removes them afterwards.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-osha.spec.cjs --reporter=line --workers=1
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
const ORG_A = '20000000-0000-4000-8000-000000000100'
const ADMIN_USER = '20000000-0000-4000-8000-000000000001'
const SEED_PERSON = '20000000-0000-4000-8000-000000000600'
const RUN = Date.now().toString().slice(-6)
const YEAR = new Date().getFullYear()

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

const rest = async (pathname, { method = 'GET', body, prefer = 'return=representation' } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
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

let fixture = null

test.beforeAll(async () => {
  // A fresh establishment per run keeps the log and its print checks to this test's case only.
  const [location] = await rest('/rest/v1/locations', {
    method: 'POST',
    body: { organization_id: ORG_A, name: `OSHA Parity Plant ${RUN}`, code: `OB${RUN}`, city: 'Testville', state_region: 'AR' }
  })

  const incidentNumber = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG_A } })

  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      incident_number: incidentNumber,
      occurred_at: `${YEAR}-01-02T18:00:00Z`,
      location_id: location.id,
      reported_by_personnel_id: SEED_PERSON,
      summary: `Pinch point strain ${RUN}`,
      description: 'Employee strained a wrist at the pinch point.',
      incident_type: 'injury',
      involves_injury: true,
      created_by: ADMIN_USER,
      updated_by: ADMIN_USER
    }
  })

  fixture = { location, incident }
})

test.afterAll(async () => {
  if (!fixture) return
  const { location } = fixture
  const byLocation = `organization_id=eq.${ORG_A}&location_id=eq.${location.id}`

  const cases = await rest(`/rest/v1/forge_osha_cases?${byLocation}&select=id`)
  for (const item of cases || []) await rest(`/rest/v1/forge_osha_case_activity?case_id=eq.${item.id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_osha_cases?${byLocation}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_osha_case_sequences?${byLocation}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_osha_establishment_years?${byLocation}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_incidents?${byLocation}`, { method: 'DELETE' })
  await rest(`/rest/v1/locations?id=eq.${location.id}`, { method: 'DELETE' }).catch(() => {})
})

test('open a case from /osha, fix before printing, and export one establishment at a time', async ({ page }) => {
  const { location, incident } = fixture
  const query = `year=${YEAR}&location=${location.id}`

  await login(page, 'admin@forge2.local')

  // 1. Open an OSHA case straight from the awaiting-review list. The reporter is the default employee.
  await page.goto(`${baseURL}/osha?${query}`)
  const row = page.getByTestId(`osha-awaiting-${incident.id}`)
  await expect(row).toBeVisible({ timeout: 30000 })
  await row.getByRole('button', { name: 'Open OSHA case' }).click()
  await expect(row.locator(`#osha-person-${incident.id}`)).toHaveValue(SEED_PERSON)
  await row.getByRole('button', { name: 'Open case' }).click()
  await page.waitForURL(url => /\/osha\/cases\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  const caseId = new URL(page.url()).pathname.split('/').pop()
  await expect(page.getByRole('heading', { name: `Case ${YEAR}-001` })).toBeVisible({ timeout: 30000 })

  // Make it a recordable case with blank Form 300 columns C and E.
  await rest(`/rest/v1/forge_osha_cases?id=eq.${caseId}`, {
    method: 'PATCH',
    body: {
      recordability: 'recordable',
      case_outcome: 'other_recordable',
      case_type: 'injury',
      job_title: null,
      event_location: null,
      injury_description: 'Wrist strain'
    }
  })

  // 2. "Fix before printing" lists the case on /osha and on the log, linking to it.
  await page.goto(`${baseURL}/osha?${query}`)
  await expect(page.getByTestId('osha-awaiting-review')).toHaveCount(0)
  const dashboardIssues = page.getByTestId('osha-print-issues')
  await expect(dashboardIssues).toContainText('No job title (column C).', { timeout: 30000 })
  await expect(dashboardIssues).toContainText('No location where the event occurred (column E).')
  await expect(dashboardIssues.getByRole('link', { name: new RegExp(`Case ${YEAR}-001`) })).toHaveAttribute('href', `/osha/cases/${caseId}`)

  await page.goto(`${baseURL}/osha/log?${query}`)
  await expect(page.getByTestId(`osha-print-issue-${caseId}`)).toBeVisible({ timeout: 30000 })

  // Export needs an explicit "Export anyway" while issues exist.
  await page.getByTestId('osha-log-csv').click()
  const confirm = page.getByTestId('osha-log-csv-confirm')
  await expect(confirm).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await confirm.getByRole('link', { name: 'Export anyway' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^osha-300-log-\d{4}-.*\.csv$/)

  // 3. One establishment at a time: "All establishments" disables export and the route refuses it.
  await page.goto(`${baseURL}/osha/log?year=${YEAR}`)
  await expect(page.getByTestId('osha-log-csv-disabled')).toBeDisabled({ timeout: 30000 })
  await expect(page.getByTestId('osha-log-csv-hint')).toContainText('Select an establishment')
  const refused = await page.request.get(`${baseURL}/api/osha/log?year=${YEAR}`)
  expect(refused.status()).toBe(400)
  expect((await refused.json()).error).toMatch(/separate Form 300 log for each establishment/)

  // Fixing the fields clears the list, and the CSV downloads without a confirm.
  await rest(`/rest/v1/forge_osha_cases?id=eq.${caseId}`, {
    method: 'PATCH',
    body: { job_title: 'Machine Operator', event_location: 'Press line 4' }
  })
  await page.goto(`${baseURL}/osha/log?${query}`)
  await expect(page.getByTestId('osha-form-300')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('osha-print-issues')).toHaveCount(0)
  const csv = page.getByTestId('osha-log-csv')
  await expect(csv).toHaveAttribute('href', `/api/osha/log?${query}`)
  const ok = await page.request.get(`${baseURL}/api/osha/log?${query}`)
  expect(ok.ok()).toBeTruthy()
  expect(await ok.text()).toContain('Press line 4')
})
