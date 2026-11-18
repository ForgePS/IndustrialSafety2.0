/**
 * Forge AI Command Center stage 3, end to end against a running server started with
 * FORGE_AI_CRON_SECRET (and the stage 1 test-provider variables for the agent check):
 * scheduled and event-driven monitoring through the cron endpoint, risk indicators on the
 * seeded plant, permission-safe alert routing and notification dedupe, the Risk Indicators page,
 * the risk agent tool, alert acknowledgement and tenant isolation.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/forge-ai-risk-monitoring.spec.cjs
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
const CRON_SECRET = process.env.FORGE_AI_CRON_SECRET || 'forge-test-cron-secret'
const CYPRESS = '20000000-0000-4000-8000-000000000100'
const NORTHSTAR = '40000000-0000-4000-8000-000000000100'
const MAIN_PLANT = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const EMPLOYEE = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString(36).toUpperCase()
const cleanup = { incidents: [], routes: [], locations: [] }
const STARTED_AT = new Date().toISOString()

const rest = async (pathname, { method = 'GET', body, prefer = 'return=representation' } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(pathname + ' ' + response.status + ' ' + text)

  return text ? JSON.parse(text) : null
}

const cron = (mode, secret = CRON_SECRET) =>
  fetch(baseURL + '/api/forge-ai/watch/cron' + (mode ? '?mode=' + mode : ''), {
    method: 'POST',
    headers: secret ? { authorization: 'Bearer ' + secret } : {}
  })

const forgeAiDeliveries = async userId => {
  const events = await rest(`/rest/v1/forge_notification_events?organization_id=eq.${CYPRESS}&source_module=eq.forge_ai&select=id`)

  if (!events.length) return []

  return rest(`/rest/v1/forge_notification_deliveries?recipient_user_id=eq.${userId}&event_id=in.(${events.map(e => e.id).join(',')})&select=id,event_id,channel,link_path`)
}

async function signIn(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test.afterAll(async () => {
  // Indicators computed during the run cite the test incident; drop them with it.
  await rest(`/rest/v1/forge_ai_risk_assessments?organization_id=eq.${CYPRESS}&computed_at=gte.${encodeURIComponent(STARTED_AT)}`, { method: 'DELETE', prefer: 'return=minimal' })
  for (const id of cleanup.routes) await rest(`/rest/v1/forge_ai_alert_routes?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  for (const id of cleanup.locations) {
    await rest(`/rest/v1/forge_ai_risk_assessments?scope_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    await rest(`/rest/v1/locations?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  }
  for (const id of cleanup.incidents) {
    await rest(`/rest/v1/forge_ai_watch_alerts?target_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    await rest(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    await rest(`/rest/v1/forge_incidents?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  }
})

test('the monitoring endpoint refuses callers without the scheduler secret', async () => {
  expect((await cron(null, null)).status).toBe(401)
  expect((await cron('events', 'wrong-secret')).status).toBe(401)
})

test('a scheduled cycle scores facilities from real records and leaves thin ones unscored', async () => {
  // A new facility with no records yet.
  const [division] = await rest(`/rest/v1/locations?id=eq.${MAIN_PLANT}&select=division_id`)
  const [newSite] = await rest('/rest/v1/locations', {
    method: 'POST',
    body: { organization_id: CYPRESS, division_id: division.division_id, name: 'E2E New Site ' + RUN, code: 'E2E' + RUN.slice(-4), is_active: true }
  })

  cleanup.locations.push(newSite.id)

  const response = await cron(null)

  expect(response.status).toBe(200)
  const body = await response.json()
  const cypress = body.results.find(result => result.organizationId === CYPRESS)

  expect(cypress).toMatchObject({ success: true })
  expect(cypress.riskScopes).toBeGreaterThan(0)
  expect(body.results.some(result => result.organizationId === NORTHSTAR && result.success)).toBe(false)

  const latest = await rest(`/rest/v1/forge_ai_risk_assessments?organization_id=eq.${CYPRESS}&scope_type=eq.location&select=*&order=computed_at.desc`)
  const plant = latest.find(row => row.scope_id === MAIN_PLANT)
  const empty = latest.find(row => row.scope_id === newSite.id)

  expect(plant.score).toBeGreaterThanOrEqual(0)
  expect(['low', 'moderate', 'elevated', 'high']).toContain(plant.band)
  expect(plant.model_key).toBe('facility_risk')
  expect(empty.band).toBe('insufficient_data')
  expect(empty.score).toBeNull()

  const indicators = await rest(`/rest/v1/forge_ai_risk_indicators?assessment_id=eq.${plant.id}&select=factor_key,available,evidence,detail`)

  expect(indicators).toHaveLength(7)
  // The plant files OSHA 300A hours, so its injury rate is computed.
  expect(indicators.find(item => item.factor_key === 'injury_rate').available).toBe(true)

  const severity = indicators.find(item => item.factor_key === 'incident_severity')
  const [cited] = severity.evidence

  expect(cited.type).toBe('incident')
  const [record] = await rest(`/rest/v1/forge_incidents?id=eq.${cited.id}&select=incident_number,organization_id,location_id`)

  expect(record).toEqual({ incident_number: cited.reference, organization_id: CYPRESS, location_id: MAIN_PLANT })
  expect(await rest(`/rest/v1/forge_ai_risk_assessments?organization_id=eq.${NORTHSTAR}&select=id`)).toHaveLength(0)
})

test('new rules raise alerts, each alert is notified once, and only to people who can see it', async () => {
  const failed = await rest(`/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&rule_key=eq.inspection.failed&select=id,status,notified_at,notified_recipients,target_reference`)

  expect(failed.length).toBeGreaterThan(0)
  expect(failed.every(alert => alert.notified_at)).toBe(true)

  const adminDeliveries = await forgeAiDeliveries(ADMIN)

  expect(adminDeliveries.length).toBeGreaterThan(0)
  expect(adminDeliveries.some(delivery => failed.some(alert => delivery.link_path === '/ai/watch?alert=' + alert.id))).toBe(true)
  expect(await forgeAiDeliveries(EMPLOYEE)).toHaveLength(0)

  const again = await cron(null)

  expect(again.status).toBe(200)
  expect(await forgeAiDeliveries(ADMIN)).toHaveLength(adminDeliveries.length)
})

test('overlapping cycles notify a reopened alert once', async () => {
  const startedAt = new Date().toISOString()
  const [alert] = await rest(
    `/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&rule_key=eq.inspection.failed&status=eq.open&select=id&limit=1`
  )

  await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${alert.id}`, {
    method: 'PATCH',
    body: { notified_at: null, notification_event_id: null },
    prefer: 'return=minimal'
  })

  const responses = await Promise.all([cron(null), cron(null), cron('events'), cron(null)])

  expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200])

  const events = await rest(
    `/rest/v1/forge_notification_events?resource_id=eq.${alert.id}&created_at=gte.${encodeURIComponent(startedAt)}&select=id`
  )

  expect(events).toHaveLength(1)
})

test('a submitted incident triggers an event-driven run; routing never reaches people without access', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')
  await page.goto(baseURL + '/ai/watch')

  // Route every warning-or-worse alert to the Employee role. Employees cannot view AI Watch alerts.
  await page.getByLabel('Send to').selectOption('tenant_role')
  await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Employee' })
  await page.getByLabel('Minimum severity').selectOption('warning')
  await page.getByRole('button', { name: 'Add Route' }).click()
  await expect(page.getByTestId('alert-routes')).toContainText('Employee (role)', { timeout: 30000 })

  const routes = await rest(`/rest/v1/forge_ai_alert_routes?organization_id=eq.${CYPRESS}&select=id`)

  cleanup.routes.push(...routes.map(route => route.id))

  // Owners keep receiving alerts through an explicit route now that one route exists.
  const [ownerRole] = await rest(`/rest/v1/forge_tenant_roles?organization_id=eq.${CYPRESS}&role_key=eq.company-owner&select=id`)
  const [ownerRoute] = await rest('/rest/v1/forge_ai_alert_routes', {
    method: 'POST',
    body: { organization_id: CYPRESS, recipient_type: 'tenant_role', tenant_role_id: ownerRole.id, min_severity: 'high', channel: 'in_app' }
  })

  cleanup.routes.push(ownerRoute.id)

  // First events call sets the cursor (or finds nothing new).
  expect((await cron('events')).status).toBe(200)

  const now = new Date().toISOString()
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: CYPRESS,
      incident_number: 'INC-E2E-' + RUN,
      status: 'submitted',
      severity: 'serious',
      incident_type: 'injury',
      involves_injury: true,
      occurred_at: now,
      reported_at: now,
      submitted_at: now,
      summary: 'Hand caught in the conveyor guard during cleanup',
      location_id: MAIN_PLANT
    }
  })

  cleanup.incidents.push(incident.id)

  const response = await cron('events')
  const body = await response.json()
  const cypress = body.results.find(result => result.organizationId === CYPRESS)

  expect(cypress.events).toBeGreaterThan(0)
  expect(cypress.error).toBeUndefined()

  const [alert] = await rest(`/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&rule_key=eq.incident.serious_reported&target_id=eq.${incident.id}&select=id,severity,status,notified_at,notification_event_id`)

  expect(alert).toMatchObject({ severity: 'high', status: 'open' })
  expect(alert.notified_at).not.toBeNull()

  const deliveries = await rest(`/rest/v1/forge_notification_deliveries?event_id=eq.${alert.notification_event_id}&select=recipient_user_id,channel,status`)

  expect(deliveries).toContainEqual({ recipient_user_id: ADMIN, channel: 'in_app', status: 'sent' })
  expect(deliveries.some(delivery => delivery.recipient_user_id === EMPLOYEE)).toBe(false)

  const audit = await rest(`/rest/v1/forge_ai_audit_events?organization_id=eq.${CYPRESS}&event_type=eq.watch.notified&select=detail&order=id.desc&limit=1`)

  expect(audit[0].detail.default_routes).toBe(false)

  const quiet = await (await cron('events')).json()

  expect(quiet.results.find(result => result.organizationId === CYPRESS).events).toBe(0)
})

test('the Risk Indicators page shows facility scores with their evidence, to permitted users only', async ({ page, browser }) => {
  await signIn(page, 'admin@forge2.local')
  await page.goto(baseURL + '/ai/risk')

  const plant = page.getByTestId('risk-assessment').filter({ hasText: 'Cypress Bend Main Plant' }).first()

  await expect(plant).toBeVisible()
  await expect(plant.getByTestId('risk-score')).toHaveText(/^\d+(\.\d)?$/)
  await expect(page.getByText('Not enough data').first()).toBeVisible()

  const employee = await browser.newPage()

  await signIn(employee, 'user@forge2.local')
  await employee.goto(baseURL + '/ai/risk')
  await expect(employee.getByTestId('risk-assessment')).toHaveCount(0)
  await employee.close()

  const northstar = await browser.newPage()

  await signIn(northstar, 'northstar.admin@forge2.local')
  await northstar.goto(baseURL + '/ai/risk')
  await expect(northstar.getByText('Cypress Bend', { exact: false })).toHaveCount(0)
  await northstar.close()
})

test('the risk agent answers from the stored indicators', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const res = await page.request.post(baseURL + '/api/forge-ai/chat', {
    data: { message: 'Which facilities have the highest risk right now? [[forge-test:tool:get_risk_indicators {"scope_type":"location","limit":5}]]', conversationId: null }
  })

  expect(res.status()).toBe(200)
  const body = await res.json()

  expect(body.message.agent.key).toBe('risk')
  expect(body.message.content).toContain('get_risk_indicators')
  expect(body.message.content).toContain('Cypress Bend Main Plant')

  const [run] = await rest(`/rest/v1/forge_ai_agent_runs?conversation_id=eq.${body.conversationId}&select=id`)
  const toolRuns = await rest(`/rest/v1/forge_ai_tool_runs?agent_run_id=eq.${run.id}&select=capability_key,status`)

  expect(toolRuns).toEqual([{ capability_key: 'get_risk_indicators', status: 'completed' }])
})

test('an alert can be acknowledged from AI Watch', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const countAcknowledged = async () =>
    (await rest(`/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&status=eq.acknowledged&acknowledged_by=eq.${ADMIN}&select=id`)).length

  const before = await countAcknowledged()

  await page.goto(baseURL + '/ai/watch')
  await page.getByRole('button', { name: 'Acknowledge' }).first().click()
  await expect.poll(countAcknowledged, { timeout: 30000 }).toBe(before + 1)
})
