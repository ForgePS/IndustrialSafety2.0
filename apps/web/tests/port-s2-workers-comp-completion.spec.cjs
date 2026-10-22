/**
 * Port slice 2 completion browser smoke: nightly OSHA refresh (cron), printable report, editing and removing
 * work status periods, case documents, weekly email settings and preview, queues, CSV reports, and
 * medical access control on all of them.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s2-workers-comp-completion.spec.cjs --reporter=line --workers=1
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
const CRON_SECRET = process.env.FORGE_CRON_SECRET
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

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
const addDays = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

const open = async (page, url) => {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

let fx = null

test.beforeAll(async () => {
  const today = chicagoToday()
  const injuryDate = addDays(today, -20)

  const [location] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG_A, name: `WC Completion Plant ${RUN}`, code: `WD${RUN}` } })
  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG_A, first_name: 'Jordan', last_name: `Complete ${RUN}`, employment_status: 'active', location_id: location.id, created_by: ADMIN_USER, updated_by: ADMIN_USER }
  })
  const incidentNumber = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG_A } })
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG_A, incident_number: incidentNumber, occurred_at: `${injuryDate}T17:00:00Z`, location_id: location.id,
      reported_by_personnel_id: person.id, summary: `Shoulder strain ${RUN}`, incident_type: 'injury', involves_injury: true,
      created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })

  const caseNumber = await rest('/rest/v1/rpc/next_forge_wc_case_number', { method: 'POST', body: { p_organization_id: ORG_A, p_year: Number(injuryDate.slice(0, 4)) } })
  const oshaNumber = await rest('/rest/v1/rpc/next_forge_osha_case_number', {
    method: 'POST',
    body: { p_organization_id: ORG_A, p_location_id: location.id, p_year: Number(injuryDate.slice(0, 4)) }
  })

  // A linked OSHA case whose day counts are out of date: the nightly job should correct it.
  const [osha] = await rest('/rest/v1/forge_osha_cases', {
    method: 'POST',
    body: {
      organization_id: ORG_A, case_number: oshaNumber, incident_id: incident.id, personnel_id: person.id, location_id: location.id,
      employee_name: `Jordan Complete ${RUN}`, injury_date: injuryDate, recordability: 'recordable', case_outcome: 'days_away',
      case_type: 'injury', days_away: 1, restricted_days: 0, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })

  const [wc] = await rest('/rest/v1/forge_wc_cases', {
    method: 'POST',
    body: {
      organization_id: ORG_A, case_number: caseNumber, incident_id: incident.id, personnel_id: person.id, employee_name: `Jordan Complete ${RUN}`,
      location_id: location.id, injury_date: injuryDate, reported_date: injuryDate, stage: 'treatment', severity: 'lost_time',
      claim_number: `CLM-${RUN}`, osha_recordable: true, osha_case_type: 'injury', osha_case_id: osha.id, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
  })

  await rest('/rest/v1/forge_wc_work_status_periods', {
    method: 'POST',
    body: [
      { organization_id: ORG_A, case_id: wc.id, work_status: 'off_work', start_date: injuryDate, end_date: addDays(injuryDate, 5), created_by: ADMIN_USER },
      { organization_id: ORG_A, case_id: wc.id, work_status: 'restricted', start_date: addDays(injuryDate, 6), end_date: null, created_by: ADMIN_USER }
    ]
  })
  await rest('/rest/v1/forge_wc_medical_encounters', {
    method: 'POST',
    body: { organization_id: ORG_A, case_id: wc.id, encounter_date: addDays(injuryDate, 1), provider_name: 'Example Clinic', diagnosis: `Rotator cuff strain ${RUN}`, created_by: ADMIN_USER }
  })

  const [role] = await rest('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    body: { organization_id: ORG_A, role_key: `port-s2c-wc-${RUN}`, name: `WC Coordinator C ${RUN}`, is_system_role: false, is_active: true, sort_order: 901 }
  })
  const permissions = await rest('/rest/v1/forge_permission_registry?select=id&permission_key=in.(workers_comp.view,workers_comp.edit,workers_comp.export)')
  await rest('/rest/v1/forge_tenant_role_permissions', {
    method: 'POST',
    body: permissions.map(item => ({ role_id: role.id, permission_id: item.id, allowed: true, scope: 'organization' }))
  })
  await rest('/rest/v1/forge_tenant_user_roles', { method: 'POST', body: { organization_id: ORG_A, user_id: DEMO_USER, role_id: role.id } })

  fx = { today, injuryDate, person, incident, osha, wc, role, caseUrl: `${baseURL}/workers-comp/${wc.id}` }
})

test.afterAll(async () => {
  if (fx?.role) await rest(`/rest/v1/forge_tenant_roles?id=eq.${fx.role.id}`, { method: 'DELETE' })
})

test('the nightly job refreshes stale OSHA day counts once and needs its secret', async ({ request }) => {
  expect(CRON_SECRET, 'FORGE_CRON_SECRET must be set in apps/web/.env.local').toBeTruthy()

  const denied = await request.post(`${baseURL}/api/workers-comp/cron`)
  expect(denied.status()).toBe(401)

  const wrong = await request.post(`${baseURL}/api/workers-comp/cron`, { headers: { Authorization: 'Bearer wrong' } })
  expect(wrong.status()).toBe(401)

  const first = await request.post(`${baseURL}/api/workers-comp/cron`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
  expect(first.ok()).toBeTruthy()
  expect((await first.json()).oshaRefresh.updated).toBeGreaterThanOrEqual(1)

  const [osha] = await rest(`/rest/v1/forge_osha_cases?id=eq.${fx.osha.id}&select=days_away,restricted_days`)
  expect(osha).toEqual({ days_away: 5, restricted_days: 15 })

  // A second run finds nothing new for this case.
  await request.post(`${baseURL}/api/workers-comp/cron`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
  const syncs = await rest(`/rest/v1/forge_osha_case_activity?case_id=eq.${fx.osha.id}&activity_type=eq.synced_from_workers_comp&select=id`)
  expect(syncs.length).toBe(1)

  const wcActivity = await rest(`/rest/v1/forge_wc_case_activity?case_id=eq.${fx.wc.id}&activity_type=eq.osha_synced&select=message,actor_user_id`)
  expect(wcActivity.length).toBe(1)
  expect(wcActivity[0].message).toContain('refreshed overnight')
  expect(wcActivity[0].actor_user_id).toBeNull()
})

test('administrator: printable report, period corrections, documents, settings, queues and reports', async ({ page }) => {
  const { injuryDate, caseUrl, wc, person } = fx
  const caseNumber = wc.case_number

  await login(page, 'admin@forge2.local')

  // Printable report: medical visits only on request.
  await open(page, caseUrl)
  await page.getByRole('link', { name: 'Printable report' }).click()
  await page.waitForLoadState('networkidle')
  const report = page.getByTestId('wc-case-report')
  await expect(report).toContainText('5 days away, 15 restricted', { timeout: 30000 })
  await expect(report).toContainText(`CLM-${RUN}`)
  await expect(report).not.toContainText('Rotator cuff strain')
  await page.getByRole('link', { name: 'Include Medical Visits' }).click()
  await expect(page.getByTestId('wc-case-report')).toContainText(`Rotator cuff strain ${RUN}`, { timeout: 30000 })

  // Correct the restricted period, then remove the off-work period.
  await open(page, caseUrl)
  const workStatus = page.getByTestId('wc-work-status')
  await workStatus.getByRole('button', { name: `Edit ${addDays(injuryDate, 6)} period` }).click()
  await page.locator('#wc-period-end').fill(addDays(injuryDate, 10))
  await page.getByRole('button', { name: 'Save Period' }).click()
  await expect(workStatus).toContainText('5 days away · 5 days restricted', { timeout: 30000 })

  page.once('dialog', dialog => dialog.accept())
  await workStatus.getByRole('button', { name: `Remove ${injuryDate} period` }).click()
  await expect(workStatus).toContainText('0 days away · 5 days restricted', { timeout: 30000 })
  await open(page, caseUrl)
  await expect(page.getByTestId('wc-activity')).toContainText('Removed work status period: Off work (lost time)')

  // Case documents through the shared evidence service.
  const documents = page.getByTestId('wc-documents')
  await documents.locator('input[name="file"]').setInputFiles({ name: `claim-packet-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Synthetic claim packet') })
  await documents.locator('input[name="description"]').fill('First report of injury')
  await documents.getByRole('button', { name: 'Upload' }).click()
  await expect(documents).toContainText(`claim-packet-${RUN}.txt`, { timeout: 30000 })

  // Weekly email settings and preview.
  await open(page, `${baseURL}/workers-comp/settings`)
  await page.locator('#wc-settings-enabled').click()
  await page.locator('#wc-settings-recipients').fill('risk@example.com, not-an-email')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.getByText('Not a valid email address: not-an-email')).toBeVisible({ timeout: 30000 })
  await page.locator('#wc-settings-recipients').fill('Risk@Example.com, hr@example.com')
  await page.locator('#wc-settings-weekday').selectOption('1')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.getByText('Weekly email settings saved.')).toBeVisible({ timeout: 30000 })
  await open(page, `${baseURL}/workers-comp/settings`)
  await expect(page.locator('#wc-settings-recipients')).toHaveValue('risk@example.com, hr@example.com')
  await expect(page.locator('#wc-settings-weekday')).toHaveValue('1')
  await expect(page.getByTestId('wc-email-subject')).toContainText(/Workers' comp weekly status: \d+ open cases?/)
  const preview = page.frameLocator('iframe[title="Weekly status email preview"]')
  await expect(preview.getByText(caseNumber)).toBeVisible()

  // Queues.
  await open(page, `${baseURL}/workers-comp/queues?view=employees`)
  await expect(page.getByTestId('wc-queue-employees')).toContainText(`Jordan Complete ${RUN}`, { timeout: 30000 })
  await expect(page.getByTestId('wc-queue-employees').getByRole('link', { name: 'Personnel File' }).first()).toBeVisible()
  await open(page, `${baseURL}/workers-comp/queues?view=return-to-work`)
  await expect(page.getByTestId('wc-queue-rtw')).toContainText(caseNumber)
  await open(page, `${baseURL}/workers-comp/queues?view=medical`)
  await expect(page.getByTestId('wc-queue-medical')).toContainText(caseNumber)
  await open(page, `${baseURL}/workers-comp/queues?view=osha`)
  await expect(page.getByTestId('wc-queue-osha')).toContainText(fx.osha.case_number)

  // Reports.
  await open(page, `${baseURL}/workers-comp/reports`)
  await expect(page.getByTestId('wc-report-medical_encounters')).toBeVisible({ timeout: 30000 })
  const openCases = await page.request.get(`${baseURL}/api/workers-comp/reports/open_cases`)
  expect(openCases.headers()['content-type']).toContain('text/csv')
  expect(await openCases.text()).toContain(caseNumber)
  const medicalCsv = await page.request.get(`${baseURL}/api/workers-comp/reports/medical_encounters`)
  expect(await medicalCsv.text()).toContain(`Rotator cuff strain ${RUN}`)
  const history = await page.request.get(`${baseURL}/api/workers-comp/reports/work_status_history`)
  expect(await history.text()).toContain('Restricted / transitional duty')

  expect(person.id).toBeTruthy()
})

test('coordinator without medical access sees no medical data anywhere', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await open(page, `${fx.caseUrl}/print`)
  await expect(page.getByTestId('wc-case-report')).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('link', { name: 'Include Medical Visits' })).toHaveCount(0)
  await open(page, `${fx.caseUrl}/print?medical=1`)
  await expect(page.getByTestId('wc-case-report')).not.toContainText('Rotator cuff strain')

  await open(page, `${baseURL}/workers-comp/queues?view=medical`)
  await expect(page.getByRole('link', { name: 'Medical Follow-up' })).toHaveCount(0)
  await expect(page.getByTestId('wc-queue-medical')).toHaveCount(0)

  await open(page, `${baseURL}/workers-comp/reports`)
  await expect(page.getByTestId('wc-report-open_cases')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('wc-report-medical_encounters')).toHaveCount(0)
  const medicalCsv = await page.request.get(`${baseURL}/api/workers-comp/reports/medical_encounters`)
  expect(medicalCsv.status()).toBe(403)

  await open(page, `${baseURL}/workers-comp/settings`)
  expect(new URL(page.url()).pathname).not.toBe('/workers-comp/settings')
})

test('archived cases refuse new documents', async ({ page }) => {
  await rest(`/rest/v1/forge_wc_cases?id=eq.${fx.wc.id}`, { method: 'PATCH', body: { osha_recordable: false, status: 'archived' } })

  await login(page, 'admin@forge2.local')
  // Same-origin header, as the browser sends it; the route rejects cross-site posts.
  const response = await page.request.post(`${baseURL}/api/evidence/upload`, {
    headers: { Origin: baseURL },
    multipart: {
      resourceType: 'workers_comp_case',
      resourceId: fx.wc.id,
      evidenceType: 'document',
      file: { name: 'late.txt', mimeType: 'text/plain', buffer: Buffer.from('late') }
    }
  })
  expect(response.status()).toBe(409)
})
