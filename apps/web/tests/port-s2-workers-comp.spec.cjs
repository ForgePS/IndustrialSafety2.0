/**
 * Port slice 2 (Industrial 1.0 -> 2.0) browser smoke: incident -> workers' comp case -> work status,
 * restrictions, medical visit, weekly update -> OSHA sync, plus medical-record access control.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s2-workers-comp.spec.cjs --reporter=line --workers=1
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
const DEMO_USER = '20000000-0000-4000-8000-000000000002'
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

// Calendar dates in the establishment time zone (America/Chicago), matching the app.
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

test.beforeAll(async () => {
  const today = chicagoToday()
  const injuryDate = addDays(today, -20)

  const [location] = await rest('/rest/v1/locations', {
    method: 'POST',
    body: { organization_id: ORG_A, name: `WC Smoke Plant ${RUN}`, code: `WS${RUN}` }
  })
  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: {
      organization_id: ORG_A, first_name: 'Robin', last_name: `Claimant ${RUN}`, employee_number: `WC-${RUN}`,
      employment_status: 'active', location_id: location.id, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })
  const incidentNumber = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG_A } })
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG_A, incident_number: incidentNumber, occurred_at: `${injuryDate}T17:00:00Z`, location_id: location.id,
      reported_by_personnel_id: person.id, summary: `Strained back lifting a sack ${RUN}`, incident_type: 'injury',
      involves_injury: true, status: 'submitted', created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })

  // A coordinator who can work cases but has no medical access.
  const [role] = await rest('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    body: { organization_id: ORG_A, role_key: `port-s2-wc-${RUN}`, name: `WC Coordinator ${RUN}`, is_system_role: false, is_active: true, sort_order: 900 }
  })
  const permissions = await rest('/rest/v1/forge_permission_registry?select=id,permission_key&permission_key=in.(workers_comp.view,workers_comp.edit,incidents.view)')
  await rest('/rest/v1/forge_tenant_role_permissions', {
    method: 'POST',
    body: permissions.map(item => ({ role_id: role.id, permission_id: item.id, allowed: true, scope: 'organization' }))
  })
  await rest('/rest/v1/forge_tenant_user_roles', { method: 'POST', body: { organization_id: ORG_A, user_id: DEMO_USER, role_id: role.id } })

  fixture = { today, injuryDate, location, person, incident, role }
})

test.afterAll(async () => {
  if (fixture?.role) await rest(`/rest/v1/forge_tenant_roles?id=eq.${fixture.role.id}`, { method: 'DELETE' })
})

test('case manager runs a claim end to end and syncs it to the OSHA log', async ({ page }) => {
  const { today, injuryDate, person, incident } = fixture

  await login(page, 'admin@forge2.local')

  // Open the case from the incident.
  await page.goto(`${baseURL}/incidents/${incident.id}`)
  const panel = page.getByTestId('incident-wc-panel')
  await expect(panel).toBeVisible({ timeout: 30000 })
  await panel.getByRole('link', { name: 'Open workers\' comp case' }).click()
  await expect(page.locator('#wc-incident')).toHaveValue(incident.id, { timeout: 30000 })
  await expect(page.locator('#wc-employee')).toHaveValue(person.id)
  await page.locator('#wc-severity').selectOption('lost_time')
  await page.getByRole('button', { name: 'Open Case' }).click()
  await page.waitForURL(url => /\/workers-comp\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  const caseUrl = page.url()
  const caseNumber = (await page.getByRole('heading', { level: 1 }).textContent()).trim()
  expect(caseNumber).toMatch(/^WC-\d{4}-\d{4}$/)
  await expect(page.getByText(`injured ${injuryDate}`)).toBeVisible()

  // Work status: 5 days away after the injury day, then restricted through today.
  await page.locator('#wc-period-status').selectOption('off_work')
  await page.locator('#wc-period-start').fill(injuryDate)
  await page.locator('#wc-period-end').fill(addDays(injuryDate, 5))
  await page.getByRole('button', { name: 'Record Status' }).click()
  await expect(page.getByTestId('wc-work-status')).toContainText('5 days away · 0 days restricted', { timeout: 30000 })

  // Reload so the second entry starts from a fresh form (both saves show the same toast text).
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await page.locator('#wc-period-status').selectOption('restricted')
  await page.locator('#wc-period-start').fill(addDays(injuryDate, 6))
  await page.getByRole('button', { name: 'Record Status' }).click()
  await expect(page.getByTestId('wc-work-status')).toContainText('5 days away · 15 days restricted', { timeout: 30000 })
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')

  // Restrictions checklist.
  const restrictions = page.getByTestId('wc-restrictions')
  await page.locator('#wc-r-lifting_level').selectOption('light')
  await restrictions.getByLabel('No ladders').check()
  await page.getByRole('button', { name: 'Record Restrictions' }).click()
  await expect(page.getByText('Restrictions recorded.')).toBeVisible({ timeout: 30000 })
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('wc-restrictions')).toContainText('Lifting: light', { timeout: 30000 })
  await expect(page.getByTestId('wc-restrictions')).toContainText('No ladders')

  // Medical visit (company owner has medical access).
  await page.locator('#wc-m-provider_name').fill('Example Occupational Clinic')
  await page.locator('#wc-m-diagnosis').fill('Lumbar strain')
  await page.getByRole('button', { name: 'Record Visit' }).click()
  await expect(page.getByText('Medical visit recorded.')).toBeVisible({ timeout: 30000 })

  // This week's update.
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await page.locator('#wc-weekly-notes').fill('On light duty; follow-up with clinic next week.')
  await page.getByRole('button', { name: 'Save Weekly Update' }).click()
  await expect(page.getByText('Weekly update saved.')).toBeVisible({ timeout: 30000 })
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('wc-week-status')).toHaveText('Complete', { timeout: 30000 })
  await expect(page.getByTestId('wc-activity')).not.toContainText('Lumbar strain')

  // Claim number and OSHA recordable -> the OSHA log gets a case with the computed days.
  await page.locator('#wc-claim_number').fill(`CLM-${RUN}`)
  await page.locator('#wc-osha_recordable').click()
  await page.locator('#wc-osha_privacy_case').click()
  await page.getByRole('button', { name: 'Save Case' }).click()
  await expect(page.getByText(/^Case saved\. OSHA case \d{4}-\d{3} updated\.$/)).toBeVisible({ timeout: 30000 })
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  const linked = page.getByTestId('wc-osha-linked')
  await expect(linked).toContainText('Recordable', { timeout: 30000 })
  await expect(linked).toContainText('5 days away · 15 restricted on the log')

  await linked.getByRole('link').click()
  await page.waitForURL(url => /\/osha\/cases\//.test(url.pathname), { timeout: 30000 })
  await expect(page.locator('#osha-recordability')).toHaveValue('recordable')
  await expect(page.locator('#osha-case_outcome')).toHaveValue('days_away')
  await expect(page.locator('#osha-days_away')).toHaveValue('5')
  await expect(page.locator('#osha-restricted_days')).toHaveValue('15')
  await expect(page.locator('#osha-is_privacy_case')).toHaveAttribute('data-state', 'checked')

  // Dashboard and weekly list.
  await page.goto(`${baseURL}/workers-comp`)
  await expect(page.getByTestId(`wc-case-row-${caseNumber}`)).toContainText('Restricted / transitional duty', { timeout: 30000 })
  await page.goto(`${baseURL}/workers-comp/weekly`)
  await expect(page.getByTestId(`wc-weekly-row-${caseNumber}`)).toContainText('Complete', { timeout: 30000 })

  // Closing the case ends the open period today.
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Close Case' }).click()
  // The toast and the new activity entry both say it; either means the close went through.
  await expect(page.getByText(/Case closed\./).first()).toBeVisible({ timeout: 30000 })
  await page.goto(caseUrl)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('wc-work-status')).toContainText(`${addDays(injuryDate, 6)} → ${today}`, { timeout: 30000 })

  fixture.caseUrl = caseUrl
})

test('a coordinator without medical access never sees medical visits', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await page.goto(fixture.caseUrl)
  await expect(page.getByTestId('wc-work-status')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('wc-medical')).toHaveCount(0)
  await expect(page.getByText('Lumbar strain')).toHaveCount(0)

  await page.goto(`${baseURL}/workers-comp/carriers`)
  await page.waitForURL(url => !url.pathname.startsWith('/workers-comp/carriers'), { timeout: 30000 })
})
