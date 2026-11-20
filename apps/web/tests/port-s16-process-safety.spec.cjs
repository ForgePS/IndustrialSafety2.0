/**
 * Port slice 16 browser checks: Process Safety.
 *
 * - user@forge2.local (employee, no process safety permissions) is kept out.
 * - admin@forge2.local raises a high-risk change, names the demo user as approver, adds a pre-startup action (a
 *   Corrective Action) and links a document, then submits.
 * - The demo user (given view and approve for this run) must give a reason to reject, rejects, and after the
 *   admin resubmits, approves.
 * - Admin can't implement while the PSSR and the pre-startup action are open; once the action's Corrective Action
 *   is done, signs off the PSSR, implements and closes. The change is then frozen.
 * - Admin records a completed HAZOP linked to the change; revalidation defaults to five years, and a
 *   recommendation opens a Corrective Action.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s16-process-safety.spec.cjs --reporter=line --workers=1
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { test, expect: baseExpect } = require('@playwright/test')

const expect = baseExpect.configure({ timeout: 30000 })

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const USER = '20000000-0000-4000-8000-000000000002'
const OWNER_PERSON = '60000000-0000-4000-8000-000000003002'
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')
const TITLE = `S16 raise R-2 setpoint ${RUN}`
const DUE = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
const fixture = { overrides: [], capas: [] }

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
  await page.context().clearCookies()
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  const response = await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
  return response
}

const status = page => page.locator('[data-moc-page] [data-moc-status]').first()

test.beforeAll(async () => {
  const [document] = await rest('/rest/v1/forge_documents', { method: 'POST', body: { organization_id: ORG, document_number: `S16-${RUN}`, name: 'Reactor R-2 P&ID' } })
  fixture.documentId = document.id
})

test.afterAll(async () => {
  for (const permissionId of fixture.overrides) await rest(`/rest/v1/forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${permissionId}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.mocId) {
    const actions = await rest(`/rest/v1/forge_psm_actions?moc_id=eq.${fixture.mocId}&select=capa_id`).catch(() => [])
    fixture.capas.push(...(actions || []).map(row => row.capa_id))
  }
  if (fixture.phaId) {
    const actions = await rest(`/rest/v1/forge_psm_actions?pha_id=eq.${fixture.phaId}&select=capa_id`).catch(() => [])
    fixture.capas.push(...(actions || []).map(row => row.capa_id))
    await rest(`/rest/v1/forge_pha_studies?id=eq.${fixture.phaId}`, { method: 'DELETE' }).catch(() => {})
  }
  if (fixture.mocId) await rest(`/rest/v1/forge_moc_changes?id=eq.${fixture.mocId}`, { method: 'DELETE' }).catch(() => {})
  for (const id of fixture.capas.filter(Boolean)) await rest(`/rest/v1/forge_corrective_actions?id=eq.${id}`, { method: 'PATCH', body: { archived_at: new Date().toISOString() } }).catch(() => {})
  if (fixture.documentId) await rest(`/rest/v1/forge_documents?id=eq.${fixture.documentId}`, { method: 'DELETE' }).catch(() => {})
})

test('an employee without process safety permissions is kept out', async ({ page }) => {
  await login(page, 'user@forge2.local')
  for (const url of ['/process-safety', '/process-safety/pha', '/process-safety/changes/new']) {
    await open(page, url)
    await expect(page).not.toHaveURL(new RegExp('/process-safety'))
  }
})

test('admin raises a change with an approver, an action and a document, and submits it', async ({ page }) => {
  // For this run, the demo user may view and approve changes.
  const permissions = await rest('/rest/v1/forge_permission_registry?permission_key=in.(process_safety.view,process_safety.approve)&select=id')
  for (const permission of permissions) {
    await rest('/rest/v1/forge_user_permission_overrides', { method: 'POST', body: { organization_id: ORG, user_id: USER, permission_id: permission.id, override_state: 'allow', scope: 'organization' } })
    fixture.overrides.push(permission.id)
  }

  await login(page, 'admin@forge2.local')
  await open(page, '/process-safety/changes/new')
  const form = page.locator('[data-moc-form]')
  await form.locator('input[name="title"]').fill(TITLE)
  await form.locator('select[name="changeType"]').selectOption('process')
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('textarea[name="description"]').fill('Raise the reactor R-2 operating temperature from 165 C to 180 C.')
  await form.locator('textarea[name="reason"]').fill('Throughput')
  await form.locator('select[name="riskLevel"]').selectOption('high')
  await form.locator('input[value="psi"]').check()
  await form.locator('input[value="training"]').check()
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/process-safety\/changes\/[0-9a-f-]{36}$/)
  fixture.mocId = page.url().split('/').pop()
  await expect(status(page)).toHaveText('Draft')

  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Add at least one approver first.')).toBeVisible()

  const approvers = page.locator('[data-approver-form]')
  await approvers.getByLabel('Approver 1', { exact: true }).selectOption(USER)
  await approvers.getByLabel('Approver 1 role').fill('Operations')
  await approvers.getByRole('button', { name: 'Save approvers' }).click()
  await expect(page.locator('[data-moc-approvals] [data-approval]')).toHaveCount(1)

  const action = page.locator('[data-psm-action-form]')
  await action.locator('input[name="title"]').fill('Update the R-2 P&ID')
  await action.locator('select[name="ownerPersonnelId"]').selectOption(OWNER_PERSON)
  await action.locator('input[name="dueOn"]').fill(DUE)
  await action.locator('select[name="phase"]').selectOption('before_startup')
  await action.getByRole('button', { name: 'Add' }).click()
  await expect(page.locator('[data-moc-action="Update the R-2 P&ID"]')).toContainText(/open/)

  await page.locator('[data-document-link-form] select').selectOption(fixture.documentId)
  await page.getByRole('button', { name: 'Link document' }).click()
  await expect(page.locator('[data-moc-documents]')).toContainText('Reactor R-2 P&ID')

  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(status(page)).toHaveText('In review')
  await expect(page.locator('[data-approver-form]')).toHaveCount(0)
})

test('the approver needs a reason to reject, rejects, then approves the resubmitted change', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await open(page, '/process-safety')
  await expect(page.locator('[data-waiting-approvals]')).toContainText(TITLE)
  await open(page, '/process-safety/changes/' + fixture.mocId)

  await page.getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByText(/Say why|reason/i).first()).toBeVisible()
  await page.locator('[data-decision-form] textarea').fill('Needs a HAZOP first')
  await page.getByRole('button', { name: 'Reject' }).click()
  await expect(status(page)).toHaveText('Rejected')

  await login(page, 'admin@forge2.local')
  await open(page, '/process-safety/changes/' + fixture.mocId)
  await expect(page.locator('[data-moc-approvals]')).toContainText('Needs a HAZOP first')
  await page.getByRole('button', { name: 'Resubmit for review' }).click()
  await expect(status(page)).toHaveText('In review')

  await login(page, 'user@forge2.local')
  await open(page, '/process-safety/changes/' + fixture.mocId)
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(status(page)).toHaveText('Approved')
})

test('startup waits for the PSSR and the pre-startup action, then the change is implemented and closed', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/process-safety/changes/' + fixture.mocId)
  await expect(page.locator('[data-moc-blockers]')).toContainText('The pre-startup safety review is not done')
  await expect(page.locator('[data-moc-blockers]')).toContainText('Update the R-2 P&ID')
  await expect(page.locator('[data-pssr-form]')).toHaveCount(0)

  // The action's owner finishes the work in Corrective Actions.
  const [action] = await rest(`/rest/v1/forge_psm_actions?moc_id=eq.${fixture.mocId}&select=capa_id`)
  await rest(`/rest/v1/forge_corrective_actions?id=eq.${action.capa_id}`, { method: 'PATCH', body: { status: 'pending_verification' } })
  await open(page, '/process-safety/changes/' + fixture.mocId)

  const pssr = page.locator('[data-pssr-form]')
  for (const key of ['built_per_design', 'procedures_ready', 'hazard_review_done', 'psi_updated', 'mi_ready']) await pssr.locator(`[data-pssr-item="${key}"] input[value="yes"]`).check()
  await pssr.locator('[data-pssr-item="training_done"] input[value="no"]').check()
  page.once('dialog', dialog => dialog.accept())
  await pssr.getByRole('button', { name: 'Sign off review' }).click()
  await expect(page.getByText(/Not ready for startup/).first()).toBeVisible()

  await pssr.locator('[data-pssr-item="training_done"] input[value="yes"]').check()
  page.once('dialog', dialog => dialog.accept())
  await pssr.getByRole('button', { name: 'Sign off review' }).click()
  await expect(page.locator('[data-pssr-done]')).toBeVisible()

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Mark implemented' }).click()
  await expect(status(page)).toHaveText('Implemented')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Close change' }).click()
  await expect(status(page)).toHaveText('Closed')
  await expect(page.getByRole('button', { name: /Edit|Cancel change|Link document/ })).toHaveCount(0)
  await expect(page.locator('[data-moc-history]')).toContainText('Pre-startup safety review signed off')
})

test('admin records a completed HAZOP with a recommendation', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/process-safety/pha/new?moc=' + fixture.mocId)
  const form = page.locator('[data-pha-form]')
  await form.locator('input[name="title"]').fill(`S16 Unit 2 HAZOP ${RUN}`)
  await form.locator('input[name="processUnit"]').fill('Unit 2 reactor')
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('select[name="method"]').selectOption('hazop')
  await form.locator('select[name="status"]').selectOption('completed')
  await form.locator('input[name="completedOn"]').fill('2026-06-01')
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/process-safety\/pha\/[0-9a-f-]{36}$/)
  fixture.phaId = page.url().split('/').pop()
  await expect(page.locator('[data-revalidation]')).toContainText('Revalidate by 2031-06-01')

  const action = page.locator('[data-psm-action-form]')
  await action.locator('input[name="title"]').fill('Add a high-temperature alarm')
  await action.locator('select[name="ownerPersonnelId"]').selectOption(OWNER_PERSON)
  await action.locator('input[name="dueOn"]').fill(DUE)
  await action.getByRole('button', { name: 'Add' }).click()
  await expect(page.locator('[data-pha-recommendation="Add a high-temperature alarm"]')).toContainText(/open/)

  await open(page, '/process-safety/pha')
  await expect(page.locator('[data-pha-list]')).toContainText(`S16 Unit 2 HAZOP ${RUN}`)
})
