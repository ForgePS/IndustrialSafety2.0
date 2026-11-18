/**
 * Port slice 1 (Industrial 1.0 -> 2.0) browser smoke: incident -> OSHA case -> Form 300 log -> Form 300A
 * certification, with privacy masking, Form 301 seeding and access checks.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s1-osha.spec.cjs --reporter=line --workers=1
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
  // A fresh establishment per run keeps totals and rates deterministic.
  const [location] = await rest('/rest/v1/locations', {
    method: 'POST',
    body: { organization_id: ORG_A, name: `OSHA Smoke Plant ${RUN}`, code: `OS${RUN}`, city: 'Testville', state_region: 'AR' }
  })

  await rest('/rest/v1/forge_personnel_sensitive?on_conflict=personnel_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { personnel_id: SEED_PERSON, organization_id: ORG_A, date_of_birth: '1988-05-06', sex: 'female', city: 'Testville', state_region: 'AR' }
  })

  const incidentNumber = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG_A } })

  // 04:30 UTC on March 3 is the evening of March 2 in the establishment's time zone.
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      incident_number: incidentNumber,
      occurred_at: `${YEAR}-03-03T04:30:00Z`,
      location_id: location.id,
      reported_by_personnel_id: SEED_PERSON,
      summary: `Laceration from belt guard ${RUN}`,
      description: 'Employee reached past the guard to clear a jam.',
      incident_type: 'injury',
      involves_injury: true,
      status: 'submitted',
      created_by: ADMIN_USER,
      updated_by: ADMIN_USER
    }
  })

  fixture = { location, incident }
})

test('recordkeeper opens, classifies and certifies an OSHA case', async ({ page }) => {
  const { location, incident } = fixture
  const query = `year=${YEAR}&location=${location.id}`

  await login(page, 'admin@forge2.local')

  // The injury incident is waiting for an OSHA decision.
  await page.goto(`${baseURL}/osha?${query}`)
  await expect(page.getByTestId('osha-awaiting-review').getByText(incident.incident_number, { exact: false })).toBeVisible({ timeout: 30000 })

  // Open a case from the incident.
  await page.goto(`${baseURL}/incidents/${incident.id}`)
  const panel = page.getByTestId('incident-osha-panel')
  await expect(panel).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#osha-injured-person')).toHaveValue(SEED_PERSON)
  await panel.getByRole('button', { name: 'Open OSHA Case' }).click()
  await page.waitForURL(url => /\/osha\/cases\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  const caseUrl = page.url()

  await expect(page.getByRole('heading', { name: `Case ${YEAR}-001` })).toBeVisible()

  // Form 300/301 fields were filled from the incident and the personnel record.
  await expect(page.locator('#osha-injury_date')).toHaveValue(`${YEAR}-03-02`)
  await expect(page.locator('#osha-time_of_event')).toHaveValue('22:30')
  await expect(page.locator('#osha-employee_date_of_birth')).toHaveValue('1988-05-06')
  await expect(page.locator('#osha-employee_sex')).toHaveValue('female')
  await expect(page.locator('#osha-what_happened')).toHaveValue('Employee reached past the guard to clear a jam.')
  await expect(page.locator('#osha-job_title')).toHaveValue('Mill Operator')

  // Server-side validation: a days-away case needs days away.
  await page.locator('#osha-recordability').selectOption('recordable')
  await page.locator('#osha-case_outcome').selectOption('days_away')
  await page.locator('#osha-case_type').selectOption('injury')
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText('A days-away case needs at least one day away from work.')).toBeVisible({ timeout: 30000 })

  await page.locator('#osha-days_away').fill('3')
  await page.locator('#osha-is_privacy_case').click()
  await page.locator('#osha-injury_description').fill('Laceration to left hand from belt guard')
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText('OSHA case saved.')).toBeVisible({ timeout: 30000 })

  await page.goto(caseUrl)
  await expect(page.getByTestId('osha-case-activity').getByText(/Recordability: Recordable/)).toBeVisible({ timeout: 30000 })

  // The Form 300 log masks the name of a privacy case.
  await page.goto(`${baseURL}/osha/log?${query}`)
  const logRow = page.getByTestId(`osha-log-row-${YEAR}-001`)
  await expect(logRow).toBeVisible({ timeout: 30000 })
  await expect(logRow).toContainText('Privacy Case')
  await expect(logRow).not.toContainText('Forge Demo User')

  const csv = await page.request.get(`${baseURL}/api/osha/log?${query}`)
  expect(csv.ok()).toBeTruthy()
  const csvText = await csv.text()
  expect(csvText).toContain('Privacy Case')
  expect(csvText).not.toContain('Forge Demo User')

  // Form 300A: enter hours, check rates, certify.
  await page.goto(`${baseURL}/osha/summary?${query}`)
  await expect(page.getByTestId('osha-300a-daysAwayCases')).toHaveText('1', { timeout: 30000 })
  await expect(page.getByTestId('osha-300a-daysAway')).toHaveText('3')
  await page.locator('#summary-annual_average_employees').fill('100')
  await page.locator('#summary-total_hours_worked').fill('200,000')
  await page.locator('#summary-naics_code').fill('311212')
  await page.getByRole('button', { name: 'Save Summary' }).click()
  await expect(page.getByText('Summary saved.')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('osha-summary-trir')).toHaveText('1.00', { timeout: 30000 })
  await expect(page.getByTestId('osha-summary-dart')).toHaveText('1.00')

  await page.locator('#certify-certifier_name').fill('Casey Example')
  await page.locator('#certify-certifier_title').fill('Plant Manager')
  await page.getByRole('button', { name: `Certify ${YEAR} Summary` }).click()
  await expect(page.getByTestId('osha-summary-status')).toHaveText('Certified', { timeout: 30000 })
  await expect(page.getByTestId('osha-summary-stale')).toHaveCount(0)

  // Changing the log after certification flags the posted summary as stale.
  await page.goto(caseUrl)
  await page.locator('#osha-days_away').fill('5')
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText('OSHA case saved.')).toBeVisible({ timeout: 30000 })
  await page.goto(`${baseURL}/osha/summary?${query}`)
  await expect(page.getByTestId('osha-summary-stale')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('osha-300a-daysAway')).toHaveText('3')

  // The incident shows the linked case, and dashboard rates use the hours from the summary.
  await page.goto(`${baseURL}/incidents/${incident.id}`)
  await expect(page.getByTestId('incident-osha-panel').getByRole('link', { name: `Case ${YEAR}-001` })).toBeVisible({ timeout: 30000 })
  await page.goto(`${baseURL}/osha?${query}`)
  await expect(page.getByTestId('osha-trir')).toHaveText('1.00', { timeout: 30000 })
  await expect(page.getByTestId('osha-awaiting-review')).toHaveCount(0)
})

test('employees cannot reach OSHA records', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await page.goto(`${baseURL}/osha`)
  await page.waitForURL(url => !url.pathname.startsWith('/osha'), { timeout: 30000 })
  expect(new URL(page.url()).pathname.startsWith('/osha')).toBeFalsy()

  const csv = await page.request.get(`${baseURL}/api/osha/log?year=${YEAR}`, { maxRedirects: 0 })
  expect(csv.headers()['content-type'] || '').not.toContain('text/csv')
})
