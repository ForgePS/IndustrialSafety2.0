/**
 * Batch 1 parity (workers' comp) browser checks: case list search, status/stage filters and the Archived view;
 * archived cases open read-only; changing a case's employee, incident and Location, then syncing it to OSHA;
 * and "Send Weekly Status Now" queueing once per week.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-wc.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-6)

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)
  return text ? JSON.parse(text) : null
}

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
const addDays = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

let fixture = null

const newCase = async body => {
  const number = await rest('/rest/v1/rpc/next_forge_wc_case_number', { method: 'POST', body: { p_organization_id: ORG_A, p_year: Number(body.injury_date.slice(0, 4)) } })
  const [row] = await rest('/rest/v1/forge_wc_cases', {
    method: 'POST',
    body: { organization_id: ORG_A, case_number: number, created_by: ADMIN_USER, updated_by: ADMIN_USER, ...body }
  })
  return row
}

test.beforeAll(async () => {
  const today = chicagoToday()
  const injuryDate = addDays(today, -10)

  const [location] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG_A, name: `WC B1 Plant ${RUN}`, code: `WB${RUN}` } })
  const [location2] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG_A, name: `WC B1 Yard ${RUN}`, code: `WY${RUN}` } })
  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: {
      organization_id: ORG_A, first_name: 'Casey', last_name: `Relink ${RUN}`, employee_number: `WB-${RUN}`,
      employment_status: 'active', location_id: location.id, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })
  const incidentNumber = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG_A } })
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG_A, incident_number: incidentNumber, occurred_at: `${injuryDate}T17:00:00Z`, location_id: location.id,
      summary: `Twisted ankle on stairs ${RUN}`, incident_type: 'injury', involves_injury: true, status: 'submitted',
      created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })

  const searchable = await newCase({ employee_name: `Searchable Person ${RUN}`, location_id: location.id, injury_date: injuryDate, claim_number: `CLM-B1-${RUN}`, stage: 'treatment' })
  const archived = await newCase({ employee_name: `Archived Person ${RUN}`, location_id: location.id, injury_date: injuryDate })
  await rest(`/rest/v1/forge_wc_cases?id=eq.${archived.id}`, { method: 'PATCH', body: { status: 'archived' } })
  const unlinked = await newCase({ employee_name: `Typed Name ${RUN}`, location_id: location.id, injury_date: injuryDate })

  const [settings] = await rest(`/rest/v1/forge_wc_settings?organization_id=eq.${ORG_A}&select=*`)

  fixture = { today, injuryDate, location, location2, person, incident, searchable, archived, unlinked, settings: settings || null }
})

test.afterAll(async () => {
  if (!fixture) return
  const { location, location2, person, incident, settings } = fixture

  for (const id of [location.id, location2.id]) await rest(`/rest/v1/forge_wc_cases?location_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_osha_cases?incident_id=eq.${incident.id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_incidents?id=eq.${incident.id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_personnel?id=eq.${person.id}`, { method: 'DELETE' }).catch(() => {})
  for (const id of [location.id, location2.id]) await rest(`/rest/v1/locations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})

  // Remove the notice this run queued and put the settings back the way they were.
  if (fixture.sentWeek) {
    await rest(`/rest/v1/forge_notification_events?organization_id=eq.${ORG_A}&source_module=eq.workers_comp&event_type=eq.weekly_status&payload->>week_of=eq.${fixture.sentWeek}&created_at=gte.${encodeURIComponent(fixture.sendStartedAt)}`, { method: 'DELETE' }).catch(() => {})
  }

  if (settings) {
    await rest(`/rest/v1/forge_wc_settings?organization_id=eq.${ORG_A}`, {
      method: 'PATCH',
      body: {
        weekly_email_enabled: settings.weekly_email_enabled,
        weekly_email_recipient_ids: settings.weekly_email_recipient_ids,
        last_weekly_email_week: settings.last_weekly_email_week
      }
    }).catch(() => {})
  } else {
    await rest(`/rest/v1/forge_wc_settings?organization_id=eq.${ORG_A}`, { method: 'DELETE' }).catch(() => {})
  }
})

test('case list search, status and stage filters, and the Archived view', async ({ page }) => {
  const { searchable, archived, unlinked } = fixture

  await login(page, 'admin@forge2.local')

  await page.goto(`${baseURL}/workers-comp?q=${encodeURIComponent(`CLM-B1-${RUN}`)}`)
  await expect(page.getByTestId(`wc-case-row-${searchable.case_number}`)).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId(`wc-case-row-${unlinked.case_number}`)).toHaveCount(0)
  await expect(page.getByTestId(`wc-case-row-${archived.case_number}`)).toHaveCount(0)

  // Search by employee name through the form, narrowed by stage.
  await page.goto(`${baseURL}/workers-comp`)
  await page.locator('#wc-filter-q').fill(`Person ${RUN}`)
  await page.locator('#wc-filter-stage').selectOption('treatment')
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.waitForURL(url => url.searchParams.get('stage') === 'treatment', { timeout: 30000 })
  await expect(page.getByTestId(`wc-case-row-${searchable.case_number}`)).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId(`wc-case-row-${archived.case_number}`)).toHaveCount(0)

  await page.goto(`${baseURL}/workers-comp?q=${encodeURIComponent(`Person ${RUN}`)}&stage=intake`)
  await expect(page.getByText('No cases match these filters.')).toBeVisible({ timeout: 30000 })

  // Archived view lists archived cases only, and they open read-only.
  await page.goto(`${baseURL}/workers-comp`)
  await page.getByTestId('wc-archived-link').click()
  await page.waitForURL(url => url.searchParams.get('status') === 'archived', { timeout: 30000 })
  const archivedRow = page.getByTestId(`wc-case-row-${archived.case_number}`)
  await expect(archivedRow).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId(`wc-case-row-${searchable.case_number}`)).toHaveCount(0)

  await archivedRow.getByRole('link', { name: 'Open' }).click()
  await page.waitForURL(url => url.pathname === `/workers-comp/${archived.id}`, { timeout: 30000 })
  await expect(page.getByTestId('wc-archived-banner')).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('button', { name: 'Save Case' })).toHaveCount(0)
  await expect(page.getByTestId('wc-links')).toHaveCount(0)
})

test('the employee, incident and Location can be changed, and the newly linked incident syncs to OSHA', async ({ page }) => {
  const { unlinked, person, incident, location2 } = fixture

  await login(page, 'admin@forge2.local')
  const caseUrl = `${baseURL}/workers-comp/${unlinked.id}`

  await page.goto(caseUrl)
  await expect(page.getByTestId('wc-links')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#wc-osha_recordable')).toBeDisabled()
  // Pick only after hydration, or the first choice stays in the DOM and never reaches the form state.
  await page.waitForLoadState('networkidle')

  await page.locator('#wc-personnel_id').selectOption(person.id)
  await page.locator('#wc-incident_id').selectOption(incident.id)
  await page.locator('#wc-location_id').selectOption(location2.id)
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText(/^Case saved\./).first()).toBeVisible({ timeout: 30000 })

  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(`Casey Relink ${RUN} · injured`)).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('link', { name: incident.incident_number })).toBeVisible()
  await expect(page.locator('#wc-location_id')).toHaveValue(location2.id)
  await expect(page.getByTestId('wc-activity')).toContainText(`Linked to incident ${incident.incident_number}`)

  // With the incident now linked, the case can go on the OSHA log.
  await page.locator('#wc-osha_recordable').click()
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText(/^Case saved\. OSHA case \d{4}-\d{3} updated\.$/)).toBeVisible({ timeout: 30000 })

  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('wc-osha-linked')).toContainText('Recordable', { timeout: 30000 })

  // On the OSHA log the employee and incident are fixed.
  await expect(page.locator('#wc-incident_id')).toBeDisabled()
  await expect(page.locator('#wc-personnel_id')).toBeDisabled()

  const [osha] = await rest(`/rest/v1/forge_osha_cases?incident_id=eq.${incident.id}&select=personnel_id,recordability`)
  expect(osha.personnel_id).toBe(person.id)
  expect(osha.recordability).toBe('recordable')
})

test('Send Weekly Status Now queues the week once', async ({ page }) => {
  const body = { weekly_email_enabled: true, weekly_email_recipient_ids: [ADMIN_USER], last_weekly_email_week: null }

  if (fixture.settings) await rest(`/rest/v1/forge_wc_settings?organization_id=eq.${ORG_A}`, { method: 'PATCH', body })
  else await rest('/rest/v1/forge_wc_settings', { method: 'POST', body: { organization_id: ORG_A, ...body } })

  fixture.sendStartedAt = new Date(Date.now() - 1000).toISOString()

  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/workers-comp/settings`)

  const card = page.getByTestId('wc-send-now')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.waitForLoadState('networkidle')
  await card.getByRole('button', { name: 'Send Weekly Status Now' }).click()
  const result = page.getByTestId('wc-send-now-result')
  await expect(result).toContainText(/queued 1, already sent 0\./, { timeout: 30000 })
  fixture.sentWeek = (await result.textContent()).match(/Week of (\d{4}-\d{2}-\d{2})/)[1]

  await card.getByRole('button', { name: 'Send Weekly Status Now' }).click()
  await expect(result).toContainText(/queued 0, already sent 1\./, { timeout: 30000 })

  const events = await rest(`/rest/v1/forge_notification_events?organization_id=eq.${ORG_A}&source_module=eq.workers_comp&event_type=eq.weekly_status&payload->>week_of=eq.${fixture.sentWeek}&created_at=gte.${encodeURIComponent(fixture.sendStartedAt)}&select=id`)
  expect(events.length).toBe(1)
})
