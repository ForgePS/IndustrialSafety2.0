/**
 * Forge AI Command Center stage 4, end to end against a running server started with
 * FORGE_AI_CRON_SECRET (and the stage 1 test-provider variables for the agent check):
 * recommendations generated from real alerts and risk factors, a corrective action sent for
 * approval, approved and created through the approval engine, automatic and manual
 * verification, advisory, dismiss and reject paths, the agent tool, and access control.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/forge-ai-recommendations.spec.cjs
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
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString(36).toUpperCase()
const STARTED_AT = new Date().toISOString()
const cleanup = { capas: [], approvals: [], alerts: [] }

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

const cron = () =>
  fetch(baseURL + '/api/forge-ai/watch/cron', { method: 'POST', headers: { authorization: 'Bearer ' + CRON_SECRET } })

const recs = (filter = '') =>
  rest(`/rest/v1/forge_ai_recommendations?organization_id=eq.${CYPRESS}${filter}&select=*&order=generated_at`)

const recById = async id => (await rest(`/rest/v1/forge_ai_recommendations?id=eq.${id}&select=*`))[0]

const eventsFor = async id =>
  (await rest(`/rest/v1/forge_ai_recommendation_events?recommendation_id=eq.${id}&select=event_type,to_status,actor_type&order=id`)).map(
    event => event.event_type
  )

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

// Open a recommendation card by its id and return it.
const openCard = async (page, rec) => {
  await page.goto(baseURL + '/ai/recommendations')
  const card = page.getByTestId('recommendation').filter({ hasText: rec.title }).first()

  await card.getByTestId('recommendation-title').click()

  return card
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test.beforeAll(async () => {
  // Start from a clean recommendation queue for the demo tenant (history goes with it).
  await rest(`/rest/v1/forge_ai_recommendations?organization_id=eq.${CYPRESS}`, { method: 'DELETE', prefer: 'return=minimal' })
})

test.afterAll(async () => {
  await rest(`/rest/v1/forge_ai_recommendations?organization_id=eq.${CYPRESS}&generated_at=gte.${encodeURIComponent(STARTED_AT)}`, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  for (const id of cleanup.approvals) await rest(`/rest/v1/forge_ai_action_approvals?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  for (const id of cleanup.capas) {
    const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${id}&select=linked_task_id`)

    await rest(`/rest/v1/forge_corrective_actions?id=eq.${id}`, { method: 'PATCH', body: { linked_task_id: null }, prefer: 'return=minimal' })
    if (capa?.linked_task_id) await rest(`/rest/v1/forge_tasks?id=eq.${capa.linked_task_id}`, { method: 'DELETE', prefer: 'return=minimal' })
    await rest(`/rest/v1/forge_corrective_actions?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  }
  for (const id of cleanup.alerts) {
    await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${id}`, { method: 'PATCH', body: { status: 'open', resolved_at: null }, prefer: 'return=minimal' })
  }
})

test('a monitoring cycle turns open alerts and elevated risk factors into cited recommendations, once', async () => {
  const response = await cron()

  expect(response.status).toBe(200)
  const cypress = (await response.json()).results.find(result => result.organizationId === CYPRESS)

  expect(cypress).toMatchObject({ success: true })
  expect(cypress.recommendations).toBeGreaterThan(0)

  const proposed = await recs('&status=eq.proposed')

  expect(proposed.length).toBe(cypress.recommendations)
  expect(proposed.every(rec => rec.evidence.length > 0 && rec.rationale.length > 20)).toBe(true)

  const failedInspection = proposed.find(rec => rec.rule_key === 'inspection.failed')

  expect(failedInspection.proposed_action.action_key).toBe('corrective_action.create')
  expect(failedInspection.evidence.map(item => item.type)).toEqual(['watch_alert', 'inspection'])

  // Main Plant's indicator is Elevated, so its leading factors are recommended too.
  const riskRecs = proposed.filter(rec => rec.source_type === 'risk_assessment')

  expect(riskRecs.length).toBeGreaterThan(0)

  const perScope = new Map()

  for (const rec of riskRecs) perScope.set(rec.scope_id, (perScope.get(rec.scope_id) || 0) + 1)
  expect(Math.max(...perScope.values())).toBeLessThanOrEqual(3)
  expect(riskRecs.some(rec => rec.scope_type === 'location' && rec.rationale.startsWith('Cypress Bend Main Plant'))).toBe(true)

  // Nothing unmapped: an overdue training alert alone is not a recommendation.
  expect(proposed.some(rec => rec.rule_key === 'training.overdue')).toBe(false)
  expect(await eventsFor(failedInspection.id)).toEqual(['generated'])

  const again = (await (await cron()).json()).results.find(result => result.organizationId === CYPRESS)

  expect(again.recommendations).toBe(0)
  expect((await recs('&status=eq.proposed')).length).toBe(proposed.length)
})

test('a corrective action is sent for approval, approved and created through the approval engine', async ({ page }) => {
  const [rec] = await recs('&status=eq.proposed&rule_key=eq.inspection.failed&limit=1')
  const title = 'E2E corrective action ' + RUN

  await signIn(page, 'admin@forge2.local')
  const card = await openCard(page, rec)

  await expect(card.getByText('Proposed action: create a corrective action')).toBeVisible()
  await card.getByRole('button', { name: 'Send for Approval' }).click()
  await card.getByLabel('Corrective action title').fill(title)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Send for Approval' }).click()

  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('in_review')

  const submitted = await recById(rec.id)
  const [approval] = await rest(`/rest/v1/forge_ai_action_approvals?id=eq.${submitted.action_approval_id}&select=*`)

  cleanup.approvals.push(approval.id)
  expect(approval).toMatchObject({ status: 'pending', requested_by: ADMIN, action_key: 'corrective_action.create', target_id: CYPRESS })
  expect(approval.request_payload).toMatchObject({ title, recommendation_id: rec.id, severity: 'high', source_type: 'inspection' })
  expect(new Date(approval.approval_expires_at).getTime() - Date.now()).toBeGreaterThan(6 * 86_400_000)

  // Nothing is created before approval.
  expect(await rest(`/rest/v1/forge_corrective_actions?organization_id=eq.${CYPRESS}&title=eq.${encodeURIComponent(title)}&select=id`)).toHaveLength(0)

  page.once('dialog', dialog => dialog.accept())
  const reopened = await openCard(page, rec)

  await expect(reopened.getByTestId('recommendation-status')).toHaveText('Awaiting approval')
  await reopened.getByRole('button', { name: 'Approve and Create' }).click()

  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 60000 }).toBe('executed')

  const executed = await recById(rec.id)
  const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${executed.result_entity_id}&select=*`)

  cleanup.capas.push(capa.id)
  expect(capa).toMatchObject({ title, status: 'open', created_by: ADMIN, severity: 'high', source_type: 'inspection', location_id: rec.location_id })
  expect(capa.linked_task_id).toBeTruthy()
  expect(await eventsFor(rec.id)).toEqual(['generated', 'submitted', 'approval.executing', 'approval.executed'])

  const [audit] = await rest(`/rest/v1/forge_creator_audit_log?entity_id=eq.${approval.id}&action=eq.forge_ai.action_executed&select=id`)

  expect(audit).toBeTruthy()

  const done = await openCard(page, rec)

  await expect(done.getByTestId('recommendation-status')).toHaveText('Awaiting verification')
  await expect(done.getByRole('link', { name: 'Open the corrective action' })).toHaveAttribute('href', '/corrective-actions/' + capa.id)
})

test('verification marks the recommendation verified only once the facts show it worked', async ({ page }) => {
  const [rec] = await recs('&status=eq.executed&rule_key=eq.inspection.failed&limit=1')

  await signIn(page, 'admin@forge2.local')

  // The corrective action is still open: refreshing does not verify.
  await page.goto(baseURL + '/ai/recommendations')
  await page.getByRole('button', { name: 'Refresh Recommendations' }).click()
  await expect(page.getByText(/new recommendation\(s\)/)).toBeVisible({ timeout: 30000 })
  expect((await recById(rec.id)).status).toBe('executed')

  // The corrective action is verified effective and the alert clears.
  await rest(`/rest/v1/forge_corrective_actions?id=eq.${rec.result_entity_id}`, {
    method: 'PATCH',
    body: { status: 'verified', verification_result: 'effective', verified_at: new Date().toISOString() },
    prefer: 'return=minimal'
  })
  await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${rec.watch_alert_id}`, {
    method: 'PATCH',
    body: { status: 'resolved', resolved_at: new Date().toISOString() },
    prefer: 'return=minimal'
  })
  cleanup.alerts.push(rec.watch_alert_id)

  await page.reload()
  await page.getByRole('button', { name: 'Refresh Recommendations' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('verified')

  const verified = await recById(rec.id)

  expect(verified.verification_result).toMatchObject({ outcome: 'effective', method: 'automatic' })
  expect(verified.verification_result.checks.every(check => check.met)).toBe(true)
  expect((await eventsFor(rec.id)).at(-1)).toBe('verification.effective')
})

test('advisory recommendations are accepted, marked done and verified by a person', async ({ page }) => {
  const [rec] = await recs('&status=eq.proposed&proposed_action=is.null&limit=1')

  await signIn(page, 'admin@forge2.local')
  let card = await openCard(page, rec)

  await expect(card.getByText('Proposed action: create a corrective action')).toHaveCount(0)
  await card.getByRole('button', { name: 'Accept' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('approved')

  card = await openCard(page, rec)
  await card.getByRole('button', { name: 'Mark Done' }).click()
  await card.getByLabel('What was done?').fill('Reviewed with the area lead ' + RUN)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Mark Done' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('executed')

  card = await openCard(page, rec)
  await card.getByRole('button', { name: 'Confirm Effective' }).click()
  await card.getByLabel('How was it checked?').fill('Walked the area and checked the records ' + RUN)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Confirm Effective' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('verified')

  const verified = await recById(rec.id)

  expect(verified.verified_by).toBe(ADMIN)
  expect(verified.verification_result).toMatchObject({ outcome: 'effective', method: 'manual' })
  expect(await eventsFor(rec.id)).toEqual(['generated', 'accepted', 'completed', 'verification.effective'])

  await page.goto(baseURL + '/ai/recommendations')
  await page.getByRole('button', { name: /^Closed/ }).click()
  const closed = page.getByTestId('recommendation').filter({ hasText: rec.title })

  await expect(closed.getByTestId('recommendation-status')).toHaveText('Verified')
  await closed.getByTestId('recommendation-title').click()
  await closed.getByText(/History \(4\)/).click()
  await expect(closed.getByTestId('recommendation-history')).toContainText('Walked the area')
})

test('a dismissed recommendation needs a reason and does not come straight back', async ({ page }) => {
  const [rec] = await recs('&status=eq.proposed&limit=1')

  await signIn(page, 'admin@forge2.local')
  const card = await openCard(page, rec)

  await card.getByRole('button', { name: 'Dismiss' }).click()
  await expect(card.getByTestId('recommendation-form').getByRole('button', { name: 'Dismiss' })).toBeDisabled()
  await card.getByLabel('Why is no action needed?').fill('Handled outside Forge ' + RUN)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Dismiss' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('dismissed')

  await page.goto(baseURL + '/ai/recommendations')
  await page.getByRole('button', { name: 'Refresh Recommendations' }).click()
  await expect(page.getByText(/new recommendation\(s\)/)).toBeVisible({ timeout: 30000 })
  expect(await recs(`&recommendation_key=eq.${encodeURIComponent(rec.recommendation_key)}&status=neq.dismissed`)).toHaveLength(0)
})

test('a rejected action closes its recommendation with the reason and creates nothing', async ({ page }) => {
  const [rec] = await recs('&status=eq.proposed&proposed_action=not.is.null&limit=1')

  await signIn(page, 'admin@forge2.local')
  let card = await openCard(page, rec)

  await card.getByRole('button', { name: 'Send for Approval' }).click()
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Send for Approval' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('in_review')
  cleanup.approvals.push((await recById(rec.id)).action_approval_id)

  card = await openCard(page, rec)
  await card.getByRole('button', { name: 'Reject' }).click()
  await card.getByLabel('Why is the action rejected?').fill('Already covered by an open corrective action ' + RUN)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Reject Action' }).click()
  await expect.poll(async () => (await recById(rec.id)).status, { timeout: 30000 }).toBe('rejected')

  const rejected = await recById(rec.id)
  const [approval] = await rest(`/rest/v1/forge_ai_action_approvals?id=eq.${rejected.action_approval_id}&select=status`)

  expect(approval.status).toBe('rejected')
  expect(rejected.review_note).toContain('Already covered')
  expect(rejected.result_entity_id).toBeNull()
  expect(await eventsFor(rec.id)).toEqual(['generated', 'submitted', 'approval.rejected'])
})

test('the monitoring agent reads recommendations through its tool', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')

  const res = await page.request.post(baseURL + '/api/forge-ai/chat', {
    data: {
      message: 'What do you recommend we do next? [[forge-test:tool:get_recommendations {"status":"open","priority":null,"limit":5}]]',
      conversationId: null
    }
  })

  expect(res.status()).toBe(200)
  const body = await res.json()

  expect(body.message.agent.key).toBe('monitoring')
  expect(body.message.content).toContain('get_recommendations')

  const [run] = await rest(`/rest/v1/forge_ai_agent_runs?conversation_id=eq.${body.conversationId}&select=id`)
  const toolRuns = await rest(`/rest/v1/forge_ai_tool_runs?agent_run_id=eq.${run.id}&select=capability_key,status`)

  expect(toolRuns).toEqual([{ capability_key: 'get_recommendations', status: 'completed' }])
})

test('recommendations stay inside the tenant and need their own permission', async ({ page, browser }) => {
  await signIn(page, 'admin@forge2.local')
  await page.goto(baseURL + '/ai')
  await expect(page.getByRole('link', { name: 'Recommendations' })).toBeVisible()

  const employee = await browser.newPage()

  await signIn(employee, 'user@forge2.local')
  await employee.goto(baseURL + '/ai/recommendations')
  await expect(employee.getByTestId('recommendation')).toHaveCount(0)
  await expect(employee.getByRole('heading', { name: 'Recommendations' })).toHaveCount(0)

  const northstar = await browser.newPage()

  await signIn(northstar, 'northstar.admin@forge2.local')
  await northstar.goto(baseURL + '/ai/recommendations')
  await expect(northstar.getByTestId('recommendation')).toHaveCount(0)

  expect(await rest(`/rest/v1/forge_ai_recommendations?organization_id=eq.${NORTHSTAR}&select=id`)).toHaveLength(0)
})
