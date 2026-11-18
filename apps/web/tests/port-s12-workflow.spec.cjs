/**
 * Port slice 12 (agent B) browser checks: the document version workflow, acknowledgments and reviews.
 * Seeds by REST: a document (12-month review, needs acknowledging, no distribution = everyone) with a draft
 * version 1, and a published document whose review is 2 days overdue. user@forge2.local (employee:
 * documents.view only) gets a documents.approve allow override for the approval steps, removed afterwards.
 *
 * - admin submits version 1; admin can't approve their own version (document page and approvals queue)
 * - user (approver) sends it back: a reason is required; it returns to draft and admin is told the reason
 * - admin resubmits, user is told; user approves: published, review date = effective + 12 months, admin told
 * - user (view-only again) sees it in To read, acknowledges it, it drops off and shows in history
 * - a new version is approved: the document is back in To read; the old acknowledgment is "no longer current"
 * - approvals queue lists only versions in review; view-only users can't open it
 * - reviews page lists the overdue document; Confirm review moves the date on by the interval
 * - acknowledgments CSV (admin yes, view-only 403); the dashboard shows "Documents to read"
 *
 * Run (from apps/web): playwright test tests/port-s12-workflow.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { test, expect } = require('@playwright/test')

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-7)
const DAY = 86_400_000
const iso = offsetDays => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)

  return text ? JSON.parse(text) : null
}

const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args })

const psql = sql => execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString()

/** yyyy-mm-dd plus whole months, clamped to the month's last day (Postgres date + interval). */
const addMonths = (value, months) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(day, lastDay))

  return target.toISOString().slice(0, 10)
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const createDocument = async (label, patch = {}) => {
  const number = await rpc('next_forge_document_number', { p_organization_id: ORG })
  const [doc] = await rest('forge_documents', {
    method: 'POST',
    body: {
      organization_id: ORG,
      document_number: number,
      name: `Workflow test ${label} ${RUN}`,
      review_interval_months: 12,
      requires_acknowledgment: true,
      owner_user_id: ADMIN,
      created_by: ADMIN,
      ...patch
    }
  })

  return doc
}

const addVersion = async (doc, versionNumber, summary = null) => {
  const [version] = await rest('forge_document_versions', {
    method: 'POST',
    body: {
      organization_id: ORG,
      document_id: doc.id,
      version_number: versionNumber,
      file_name: `workflow-${versionNumber}.pdf`,
      content_type: 'application/pdf',
      size_bytes: 1234,
      storage_path: `${ORG}/${doc.id}/workflow-test-${RUN}-${versionNumber}.pdf`,
      change_summary: summary,
      created_by: ADMIN
    }
  })

  return version
}

const versionRow = async id => (await rest(`forge_document_versions?id=eq.${id}&select=status,submitted_by,rejection_reason,effective_on,approved_by`))[0]
const documentRow = async id => (await rest(`forge_documents?id=eq.${id}&select=status,current_version_id,review_due_on,last_reviewed_on`))[0]
const noticesFor = async (documentId, eventType) =>
  rest(`forge_notification_events?source_module=eq.documents&resource_id=eq.${documentId}&event_type=eq.${eventType}&select=id,title,body,payload&order=created_at`)

const state = {}

/** Clicks an action button until the database shows its effect (a click before hydration does nothing). */
const actUntil = async (button, done) => {
  await expect(async () => {
    if (await done()) return
    if (await button.isVisible()) await button.click()
    await expect.poll(done, { timeout: 4000 }).toBe(true)
  }).toPass({ timeout: 60000 })
}

const versionIs = (id, status) => async () => (await versionRow(id)).status === status

/** Clicks until the opened form shows (a click before the page has hydrated does nothing). */
const openForm = async (button, form) => {
  await expect(async () => {
    if (!(await form.isVisible())) await button.click()
    await expect(form).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 60000 })
}

test.beforeAll(async () => {
  const [permission] = await rest('forge_permission_registry?permission_key=eq.documents.approve&select=id')

  state.approvePermissionId = permission.id

  // Self-approval must be off for this run (restored afterwards).
  const settings = await rest(`forge_document_settings?organization_id=eq.${ORG}&select=allow_self_approval`)

  state.selfApproval = settings[0]?.allow_self_approval ?? null
  if (state.selfApproval) await rest(`forge_document_settings?organization_id=eq.${ORG}`, { method: 'PATCH', body: { allow_self_approval: false } })

  state.doc = await createDocument('policy')
  state.v1 = await addVersion(state.doc, 1, 'First issue')

  state.overdue = await createDocument('overdue review')
  const overdueVersion = await addVersion(state.overdue, 1)

  await rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: overdueVersion.id, p_actor_user_id: ADMIN })
  await rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: overdueVersion.id, p_actor_user_id: USER, p_effective_on: null, p_note: null })
  await rest(`forge_documents?id=eq.${state.overdue.id}`, { method: 'PATCH', body: { review_due_on: iso(-2) } })
})

const grantApprove = () =>
  rest('forge_user_permission_overrides', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { organization_id: ORG, user_id: USER, permission_id: state.approvePermissionId, override_state: 'allow', scope: 'organization' }
  })

const removeApprove = () => rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${state.approvePermissionId}`, { method: 'DELETE' })

test.afterAll(async () => {
  await removeApprove().catch(() => {})
  if (state.selfApproval) await rest(`forge_document_settings?organization_id=eq.${ORG}`, { method: 'PATCH', body: { allow_self_approval: true } }).catch(() => {})

  const ids = [state.doc?.id, state.overdue?.id].filter(Boolean)

  if (!ids.length) return

  const list = ids.map(id => `'${id}'`).join(',')

  // Submitted versions can't be deleted (guard trigger), so the test data goes with triggers off; that also
  // turns off the cascades, so each child table is cleared by hand.
  psql(`delete from public.forge_notification_events where source_module = 'documents' and resource_id in (${list});
    set session_replication_role = replica;
    delete from public.forge_document_notice_log where document_id in (${list});
    delete from public.forge_document_activity where document_id in (${list});
    delete from public.forge_document_acknowledgments where document_id in (${list});
    delete from public.forge_document_distributions where document_id in (${list});
    delete from public.forge_document_versions where document_id in (${list});
    delete from public.forge_documents where id in (${list});`)
})

test('admin submits a version and cannot approve it', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/documents/${state.doc.id}`)

  const workflow = page.locator('[data-testid="version-workflow"][data-version="1"]')

  await actUntil(workflow.getByTestId('submit-version'), versionIs(state.v1.id, 'in_review'))
  await expect(workflow.getByTestId('self-approval-blocked')).toBeVisible()
  await expect(workflow.getByTestId('approve-version')).toHaveCount(0)
  expect((await versionRow(state.v1.id)).status).toBe('in_review')
  expect((await versionRow(state.v1.id)).submitted_by).toBe(ADMIN)
  expect((await documentRow(state.doc.id)).status).toBe('in_review')

  await page.goto(`${baseURL}/documents/approvals`)

  const row = page.locator(`[data-approval="${state.doc.document_number}"]`)

  await expect(row).toBeVisible()
  await expect(row.getByTestId('self-approval-blocked')).toBeVisible()
  await expect(row.getByTestId('approve-version')).toHaveCount(0)
  await expect(page.locator(`[data-approval="${state.overdue.document_number}"]`)).toHaveCount(0)
  await context.close()
})

test('an approver sends it back: a reason is required and the submitter is told', async ({ browser }) => {
  await grantApprove()

  const context = await browser.newContext()
  const page = await context.newPage()

  await login(page, 'user@forge2.local')
  await page.goto(`${baseURL}/documents/approvals`)

  const row = page.locator(`[data-approval="${state.doc.document_number}"]`)

  await openForm(row.getByTestId('reject-version'), row.getByTestId('reject-form'))
  await row.getByTestId('confirm-reject').click()
  await expect(row.getByTestId('workflow-error')).toHaveText('Give a reason for sending the version back.')
  expect((await versionRow(state.v1.id)).status).toBe('in_review')

  await row.getByLabel('Reason for sending it back').fill('Section 3 still names the old supervisor.')
  await row.getByTestId('confirm-reject').click()
  await expect(page.locator(`[data-approval="${state.doc.document_number}"]`)).toHaveCount(0)

  const version = await versionRow(state.v1.id)

  expect(version.status).toBe('draft')
  expect(version.rejection_reason).toBe('Section 3 still names the old supervisor.')
  expect((await documentRow(state.doc.id)).status).toBe('draft')

  const notices = await noticesFor(state.doc.id, 'version_sent_back')

  expect(notices.map(notice => notice.payload.recipient_user_id)).toEqual([ADMIN])
  expect(notices[0].body).toContain('Section 3 still names the old supervisor.')
  await context.close()
})

test('admin resubmits, the approver is told and approves: published with the next review date', async ({ browser }) => {
  const admin = await browser.newContext()
  const adminPage = await admin.newPage()

  await login(adminPage, 'admin@forge2.local')
  await adminPage.goto(`${baseURL}/documents/${state.doc.id}`)
  await actUntil(adminPage.locator('[data-testid="version-workflow"][data-version="1"]').getByTestId('submit-version'), versionIs(state.v1.id, 'in_review'))
  await expect(adminPage.locator('[data-testid="version-workflow"][data-version="1"]').getByTestId('self-approval-blocked')).toBeVisible()
  await admin.close()

  const submitted = await noticesFor(state.doc.id, 'version_submitted')
  const submittedTo = submitted.map(notice => notice.payload.recipient_user_id)

  expect(submittedTo).toContain(USER)
  expect(submittedTo).not.toContain(ADMIN)

  const context = await browser.newContext()
  const page = await context.newPage()

  await login(page, 'user@forge2.local')
  await page.goto(`${baseURL}/documents/${state.doc.id}`)

  const workflow = page.locator('[data-testid="version-workflow"][data-version="1"]')

  await openForm(workflow.getByTestId('approve-version'), workflow.getByTestId('approve-form'))
  await workflow.getByTestId('confirm-approve').click()
  await expect(page.locator('[data-testid="version-workflow"][data-version="1"]')).toHaveCount(0)

  const version = await versionRow(state.v1.id)
  const doc = await documentRow(state.doc.id)

  expect(version.status).toBe('approved')
  expect(version.approved_by).toBe(USER)
  expect(doc.status).toBe('published')
  expect(doc.current_version_id).toBe(state.v1.id)
  expect(doc.review_due_on).toBe(addMonths(version.effective_on, 12))

  const approved = await noticesFor(state.doc.id, 'version_approved')

  expect(approved.map(notice => notice.payload.recipient_user_id)).toEqual([ADMIN])

  const toRead = await noticesFor(state.doc.id, 'document_to_read')

  // The approver is not told to read what they just approved; the submitter's approval notice covers them.
  expect(toRead.map(notice => notice.payload.recipient_user_id)).not.toContain(USER)
  expect(toRead.map(notice => notice.payload.recipient_user_id)).not.toContain(ADMIN)

  await page.goto(`${baseURL}/documents/approvals`)
  await expect(page.locator(`[data-approval="${state.doc.document_number}"]`)).toHaveCount(0)
  await context.close()
  await removeApprove()
})

test('a view-only user acknowledges the document; a new version brings it back', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await login(page, 'user@forge2.local')

  await page.goto(`${baseURL}/documents/approvals`)
  await expect(page).not.toHaveURL(/\/documents\/approvals/)

  await page.goto(`${baseURL}/documents/acknowledgments`)

  const row = page.locator(`[data-to-read="${state.doc.document_number}"]`)

  await expect(row).toBeVisible()
  await expect(row.getByTestId('open-document')).toHaveAttribute('href', `/documents/${state.doc.id}/versions/${state.v1.id}/file`)
  await actUntil(row.getByTestId('acknowledge-document'), async () => (await rest(`forge_document_acknowledgments?document_id=eq.${state.doc.id}&user_id=eq.${USER}&select=id`)).length > 0)
  await expect(page.locator(`[data-to-read="${state.doc.document_number}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-acknowledged="${state.doc.document_number}"][data-current="yes"]`)).toBeVisible()

  const acks = await rest(`forge_document_acknowledgments?document_id=eq.${state.doc.id}&user_id=eq.${USER}&select=version_id`)

  expect(acks.map(ack => ack.version_id)).toEqual([state.v1.id])

  // Version 2 approved (admin submits, user approves, through the RPCs).
  const v2 = await addVersion(state.doc, 2, 'Updated contacts')

  await rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: ADMIN })
  await rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: USER, p_effective_on: null, p_note: null })

  await page.reload()

  const again = page.locator(`[data-to-read="${state.doc.document_number}"]`)

  await expect(again).toBeVisible()
  await expect(again).toContainText('Version 2')
  await expect(page.locator(`[data-acknowledged="${state.doc.document_number}"][data-current="no"]`)).toContainText('No longer current')
  await context.close()
})

test('the reviews page lists the overdue document and confirming moves the date', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/documents/reviews`)

  const row = page.locator(`[data-review-group="overdue"] [data-review="${state.overdue.document_number}"]`)

  await expect(row).toBeVisible()
  await expect(row).toContainText('2 days overdue')
  await expect(page.locator(`[data-review="${state.doc.document_number}"]`)).toHaveCount(0)

  await openForm(row.getByTestId('review-confirm'), row.getByTestId('review-confirm-form'))
  await row.getByTestId('review-confirm-save').click()
  await expect(page.locator(`[data-review="${state.overdue.document_number}"]`)).toHaveCount(0)

  const doc = await documentRow(state.overdue.id)

  expect(doc.last_reviewed_on).toBeTruthy()
  expect(doc.review_due_on).toBe(addMonths(doc.last_reviewed_on, 12))
  expect(doc.review_due_on > iso(300)).toBe(true)

  // Acknowledgment export: everyone in the audience, yes / no for the current version (2, not yet read by user).
  const csv = await page.request.get(`${baseURL}/documents/${state.doc.id}/acknowledgments.csv`)

  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
  const lines = (await csv.text()).split(/\r?\n/)

  expect(lines[0]).toBe('"Name","Email","Version","Acknowledged","Acknowledged on"')
  expect(lines.find(line => line.includes('"user@forge2.local"'))).toContain('"Version 2","No",""')

  // Home dashboard: "Documents to read" in What Needs Your Attention.
  await page.goto(`${baseURL}/dashboard`)
  await expect(page.locator('[data-attention="documents-to-read"]')).toBeVisible({ timeout: 30000 })
  await context.close()

  // A view-only user can't export acknowledgments.
  const viewer = await browser.newContext()
  const viewerPage = await viewer.newPage()

  await login(viewerPage, 'user@forge2.local')
  expect((await viewerPage.request.get(`${baseURL}/documents/${state.doc.id}/acknowledgments.csv`)).status()).toBe(403)
  await viewer.close()
})
