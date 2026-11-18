/**
 * Batch 1 training parity browser smoke: filter and drill into assignments, edit and cancel an assignment,
 * edit and archive a training record (personnel card and records report), and archive / reactivate a course.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-training.spec.cjs --reporter=line --workers=1
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
const post = async (table, body) => (await rest('/rest/v1/' + table, { method: 'POST', body }))[0]
const get = async (table, filter) => (await rest(`/rest/v1/${table}?${filter}`))[0]

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

const poll = (fn, message) => expect.poll(fn, { message, timeout: 30000 })
const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const seeded = { course: null, other: null, person: null, overdue: null, upcoming: null, record: null }

test.beforeAll(async () => {
  seeded.course = await post('forge_training_courses', { organization_id: ORG, title: `B1 Ladder ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  seeded.other = await post('forge_training_courses', { organization_id: ORG, title: `B1 Crane ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  seeded.person = await post('forge_personnel', {
    organization_id: ORG, first_name: 'Morgan', last_name: `B1 ${RUN}`, employee_number: `B1UI-${RUN}`, employment_status: 'active', employment_type: 'full_time', created_by: ADMIN, updated_by: ADMIN
  })
  seeded.overdue = await post('forge_training_assignments', {
    organization_id: ORG, course_id: seeded.course.id, personnel_id: seeded.person.id, status: 'assigned', due_date: daysAgo(5), assigned_by: ADMIN
  })
  seeded.upcoming = await post('forge_training_assignments', {
    organization_id: ORG, course_id: seeded.other.id, personnel_id: seeded.person.id, status: 'assigned', due_date: daysAgo(-20), assigned_by: ADMIN
  })
  seeded.record = await post('forge_training_completions', {
    organization_id: ORG, course_id: seeded.other.id, personnel_id: seeded.person.id, completed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    result: 'passed', approval_status: 'approved', source: 'manual', score: 75, created_by: ADMIN
  })
})

test.afterAll(async () => {
  for (const course of [seeded.course, seeded.other]) {
    if (!course) continue
    await rest(`/rest/v1/forge_training_completions?course_id=eq.${course.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_training_assignments?course_id=eq.${course.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_training_courses?id=eq.${course.id}`, { method: 'DELETE' }).catch(() => {})
  }
  if (seeded.person) await rest(`/rest/v1/forge_personnel?id=eq.${seeded.person.id}`, { method: 'DELETE' }).catch(() => {})
})

test('assignment filters, tile drill-down, edit and cancel', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/training?q=' + encodeURIComponent(`B1UI-${RUN}`))

  const rows = page.locator('[data-assignment-row]')
  await expect(rows).toHaveCount(2)

  // The Overdue tile filters the list and the URL.
  await page.getByTestId('tile-overdue').click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(`B1 Ladder ${RUN}`)
  await expect(page).toHaveURL(/status=overdue/)

  // Course filter.
  await page.getByLabel('Status').selectOption('all')
  await page.getByLabel('Course', { exact: true }).selectOption(seeded.other.id)
  await expect(rows).toHaveCount(1)
  await expect(page).toHaveURL(new RegExp('course=' + seeded.other.id))

  // Edit the due date and notes.
  await page.getByRole('button', { name: /^Edit assignment/ }).first().click()
  await page.getByLabel('Due date').fill('2030-01-15')
  await page.getByLabel('Notes').fill(`Bring harness ${RUN}`)
  await page.getByRole('button', { name: 'Save' }).click()
  await poll(async () => (await get('forge_training_assignments', `id=eq.${seeded.upcoming.id}&select=due_date,notes`)).due_date, 'due date saved').toBe('2030-01-15')

  // Cancel it.
  await page.getByRole('button', { name: /^Cancel assignment/ }).first().click()
  await page.getByLabel('Reason (optional)').fill('Moved crews')
  await page.getByRole('button', { name: 'Cancel Assignment' }).click()
  await poll(async () => (await get('forge_training_assignments', `id=eq.${seeded.upcoming.id}&select=status`)).status, 'assignment canceled').toBe('canceled')

  // Canceled assignments leave open work and show under the Canceled tile, with no actions.
  await open(page, '/training?q=' + encodeURIComponent(`B1UI-${RUN}`))
  await expect(rows).toHaveCount(1)
  await page.getByTestId('tile-canceled').click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Canceled')
  await expect(rows.first().getByRole('button', { name: /^Cancel assignment/ })).toHaveCount(0)
  const audit = await get('forge_creator_audit_log', `entity_id=eq.${seeded.upcoming.id}&action=eq.training.assignment_canceled&select=reason`)
  expect(audit?.reason).toBe('Moved crews')
})

test('edit and archive a training record from the personnel card and the records report', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/personnel/' + seeded.person.id)

  const card = page.getByTestId('personnel-training')
  await card.getByRole('button', { name: `Edit record B1 Crane ${RUN}` }).click()
  await page.getByLabel('Score (%)').fill('88')
  await page.getByLabel('Instructor').fill('Pat Instructor')
  await page.getByRole('button', { name: 'Save' }).click()
  await poll(async () => Number((await get('forge_training_completions', `id=eq.${seeded.record.id}&select=score`)).score), 'score saved').toBe(88)

  await open(page, '/training/reports?q=' + encodeURIComponent(`B1UI-${RUN}`))
  await expect(page.locator('[data-training-record]')).toHaveCount(1)
  await page.getByRole('button', { name: new RegExp('^Archive record .*B1 Crane ' + RUN) }).click()
  const archive = page.getByRole('button', { name: 'Archive Record' })
  await expect(archive).toBeDisabled()
  await page.getByLabel('Reason').fill('Recorded for the wrong person')
  await archive.click()
  await poll(async () => (await get('forge_training_completions', `id=eq.${seeded.record.id}&select=archive_reason`)).archive_reason, 'record archived').toBe('Recorded for the wrong person')

  await open(page, '/training/reports?q=' + encodeURIComponent(`B1UI-${RUN}`))
  await expect(page.locator('[data-training-record]')).toHaveCount(0)
  await open(page, '/personnel/' + seeded.person.id)
  await expect(page.getByTestId('personnel-training').locator(`[data-personnel-training="B1 Crane ${RUN}"]`)).toHaveCount(0)
})

test('archive and reactivate a course', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  page.on('dialog', dialog => dialog.accept())
  await open(page, '/training/courses/' + seeded.course.id)
  await page.getByRole('button', { name: 'Archive Course' }).click()
  await expect(page.getByTestId('course-archived')).toBeVisible()
  expect((await get('forge_training_courses', `id=eq.${seeded.course.id}&select=is_active`)).is_active).toBe(false)

  await open(page, '/training')
  await expect(page.locator(`[data-course-row="B1 Ladder ${RUN}"]`)).toHaveCount(0)
  await page.getByRole('button', { name: /^Archived/ }).click()
  await expect(page.locator(`[data-course-row="B1 Ladder ${RUN}"]`)).toHaveCount(1)
  await expect(page).toHaveURL(/courses=archived/)

  // Archived courses are not offered for new assignments.
  await open(page, '/training/assign')
  await expect(page.locator('option', { hasText: `B1 Ladder ${RUN}` })).toHaveCount(0)

  await open(page, '/training/courses/' + seeded.course.id)
  await page.getByRole('button', { name: 'Reactivate Course' }).click()
  await expect(page.getByTestId('course-archived')).toHaveCount(0)
  expect((await get('forge_training_courses', `id=eq.${seeded.course.id}&select=is_active`)).is_active).toBe(true)
})
