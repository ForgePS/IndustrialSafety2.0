/**
 * Port slice 6 (Industrial 1.0 -> 2.0) browser smoke for the training gaps: import quiz questions into a
 * draft, file a material in a folder with a topic, attach a certificate on the personnel profile, and see
 * the records search, overdue, team activity and quiz QC reports (and a CSV), save notice settings and run
 * the reminder job.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s6-training.spec.cjs --reporter=line --workers=1
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
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

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

const seeded = { course: null, draft: null, person: null, completion: null, assignment: null, question: null, material: null, settings: undefined }

test.beforeAll(async () => {
  seeded.course = await post('forge_training_courses', { organization_id: ORG, title: `S6 Hearing ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  seeded.person = await post('forge_personnel', {
    organization_id: ORG, first_name: 'Quinn', last_name: `S6 ${RUN}`, employee_number: `S6UI-${RUN}`, employment_status: 'active', employment_type: 'full_time', created_by: ADMIN, updated_by: ADMIN
  })
  seeded.draft = await post('forge_training_course_versions', { organization_id: ORG, course_id: seeded.course.id, version_number: 1, created_by: ADMIN, updated_by: ADMIN })
  seeded.question = await post('forge_training_questions', { organization_id: ORG, version_id: seeded.draft.id, stem: `Seeded hard question ${RUN}`, choices: ['Wrong', 'Right'], correct_index: 1 })
  seeded.material = await post('forge_training_materials', {
    organization_id: ORG, course_id: seeded.course.id, title: `Ear protection ${RUN}`, file_name: 'ears.pdf', storage_path: `${ORG}/test/${RUN}/ears.pdf`, content_type: 'application/pdf', size_bytes: 2048
  })
  seeded.completion = await post('forge_training_completions', {
    organization_id: ORG, course_id: seeded.course.id, personnel_id: seeded.person.id, completed_at: new Date().toISOString(), result: 'passed', approval_status: 'approved', source: 'manual', created_by: ADMIN
  })
  // An overdue assignment and a failed quiz attempt on the seeded question.
  seeded.assignment = await post('forge_training_assignments', {
    organization_id: ORG, course_id: seeded.course.id, personnel_id: seeded.person.id, status: 'assigned', due_date: daysAgo(6), assigned_by: ADMIN
  })
  await post('forge_training_attempts', {
    organization_id: ORG, assignment_id: seeded.assignment.id, course_id: seeded.course.id, version_id: seeded.draft.id, personnel_id: seeded.person.id,
    attempt_number: 1, channel: 'online', status: 'submitted', question_ids: [seeded.question.id], answers: [0], score_correct: 0, score_total: 1,
    score_percent: 0, passing_percent: 70, passed: false, submitted_at: new Date().toISOString(), started_by: ADMIN
  })
  seeded.settings = (await rest(`/rest/v1/forge_training_settings?organization_id=eq.${ORG}&select=*`))[0] || null
})

test.afterAll(async () => {
  if (!seeded.course) return
  const logs = await rest(`/rest/v1/forge_training_notice_log?subject_id=in.(${seeded.assignment?.id || ADMIN},${seeded.completion?.id || ADMIN})&select=event_id`).catch(() => [])
  await rest(`/rest/v1/forge_training_notice_log?subject_id=in.(${seeded.assignment?.id || ADMIN},${seeded.completion?.id || ADMIN})`, { method: 'DELETE' }).catch(() => {})
  for (const row of logs) if (row.event_id) await rest('/rest/v1/forge_notification_events?id=eq.' + row.event_id, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_training_completion_files?completion_id=eq.${seeded.completion?.id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_training_courses?id=eq.${seeded.course.id}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_personnel?id=eq.${seeded.person.id}`, { method: 'DELETE' }).catch(() => {})
  if (seeded.settings === null) await rest(`/rest/v1/forge_training_settings?organization_id=eq.${ORG}`, { method: 'DELETE' }).catch(() => {})
  else if (seeded.settings) {
    const { organization_id, created_at, updated_at, ...rest_ } = seeded.settings
    await rest(`/rest/v1/forge_training_settings?organization_id=eq.${ORG}`, { method: 'PATCH', body: rest_ }).catch(() => {})
  }
})

test('question import previews, then adds every question to the draft', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/training/courses/${seeded.course.id}/content`)
  const panel = page.getByTestId('training-question-import')
  await expect(panel).toBeVisible()
  await panel.getByLabel('Questions to import').fill('1. Broken question?\nA) One\nB) Two')
  await panel.getByRole('button', { name: 'Preview' }).click()
  await expect(panel.locator('[data-import-errors]')).toContainText('Question 1')
  await expect(panel.getByRole('button', { name: 'Import Questions', exact: true })).toBeDisabled()

  await panel.getByLabel('Questions to import').fill(`1. When is hearing protection required?
A) Above 85 dBA
B) Never
Answer: A

2) Which plugs fit best?
A) Any
B) The ones you were fitted for
Answer: 2
Explanation: Fit testing matters.`)
  await panel.getByRole('button', { name: 'Preview' }).click()
  await expect(panel.locator('[data-import-preview]')).toContainText('Above 85 dBA')
  await panel.getByRole('button', { name: 'Import 2 Questions' }).click()
  await poll(async () => (await rest(`/rest/v1/forge_training_questions?version_id=eq.${seeded.draft.id}&select=id`)).length, 'the two questions land in the draft').toBe(3)
  const [plugs] = await rest(`/rest/v1/forge_training_questions?version_id=eq.${seeded.draft.id}&stem=eq.Which%20plugs%20fit%20best%3F&select=correct_index,explanation`)
  expect(plugs).toEqual({ correct_index: 1, explanation: 'Fit testing matters.' })
})

test('materials go in folders with topics, and show in the library', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/training/courses/${seeded.course.id}/content`)
  const library = page.getByTestId('training-library')
  await library.getByLabel('New folder name').fill('Handouts')
  await library.getByRole('button', { name: /Add Folder/i }).click()
  await expect(library.locator('[data-folder="Handouts"]')).toBeVisible()
  const title = `Ear protection ${RUN}`
  await library.getByLabel(`Folder for ${title}`).selectOption({ label: 'Handouts' })
  await poll(async () => (await rest(`/rest/v1/forge_training_materials?id=eq.${seeded.material.id}&select=folder_id`))[0].folder_id !== null, 'the folder is saved').toBe(true)
  await library.getByLabel(`Topic for ${title}`).selectOption('ppe')
  await poll(async () => (await rest(`/rest/v1/forge_training_materials?id=eq.${seeded.material.id}&select=topic`))[0].topic, 'the topic is saved').toBe('ppe')

  await open(page, '/training/library?topic=ppe')
  const row = page.locator(`[data-library-row="${title}"]`)
  await expect(row).toContainText('Handouts')
  await expect(row).toContainText(`S6 Hearing ${RUN}`)
  await open(page, '/training/library?q=nothing-matches-' + RUN)
  await expect(page.getByText('No materials match.')).toBeVisible()
})

test('a certificate attaches to the training record on the personnel profile', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/personnel/${seeded.person.id}`)
  const card = page.getByTestId('personnel-training')
  const record = card.locator(`[data-personnel-training="S6 Hearing ${RUN}"]`)
  await expect(record).toContainText('Current')
  await expect(card).toContainText('Overdue, was due')
  await record.getByLabel(`Attach to S6 Hearing ${RUN}`).setInputFiles({ name: 'card.pdf', mimeType: 'application/pdf', buffer: PDF })
  await expect(record.getByRole('link', { name: 'card.pdf' })).toBeVisible({ timeout: 30000 })
  const href = await record.getByRole('link', { name: 'card.pdf' }).getAttribute('href')
  const download = await page.request.get(baseURL + href, { maxRedirects: 0 })
  expect([302, 303, 307]).toContain(download.status())

  const fake = await page.request.post(`${baseURL}/api/training/completions/${seeded.completion.id}/files`, {
    headers: { Origin: baseURL },
    multipart: { file: { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf') } }
  })
  expect(fake.status(), 'bytes that are not a PDF are refused').toBe(400)
})

test('records search, overdue, activity and QC reports show the training', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/training/reports?q=${encodeURIComponent('S6 ' + RUN)}`)
  const record = page.locator(`[data-training-record="S6 Hearing ${RUN}"]`)
  await expect(record).toContainText('card.pdf')
  await expect(record).toContainText(`Quinn`)

  const csv = await page.request.get(`${baseURL}/api/training/reports/records?q=${encodeURIComponent('S6 ' + RUN)}`)
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-disposition']).toMatch(/training-records-\d{4}-\d{2}-\d{2}\.csv/)
  expect(await csv.text()).toContain(`S6 Hearing ${RUN}`)

  await open(page, `/training/reports/overdue?q=${encodeURIComponent('S6 ' + RUN)}`)
  const late = page.locator('[data-overdue-person]').filter({ hasText: `S6 Hearing ${RUN}` })
  await expect(late).toContainText('6')

  await open(page, '/training/reports/activity')
  await expect(page.locator(`[data-activity-course="S6 Hearing ${RUN}"]`)).toBeVisible()

  await open(page, `/training/reports/qc?course=${seeded.course.id}&days=30`)
  await expect(page.locator('[data-qc-question]').filter({ hasText: `Seeded hard question ${RUN}` })).toContainText('0%')
})

test('a learner without report access is turned away from the reports', async ({ page }) => {
  await login(page, 'user@forge2.local')
  const response = await page.goto(baseURL + '/training/reports')
  await page.waitForLoadState('networkidle')
  const blocked = response.status() >= 400 || !new URL(page.url()).pathname.startsWith('/training/reports') || (await page.getByText(/not (allowed|authorized)|permission|access/i).count()) > 0
  expect(blocked).toBe(true)
  const csv = await page.request.get(baseURL + '/api/training/reports/records')
  expect(csv.status()).toBeGreaterThanOrEqual(400)
})

test('notice settings save and the reminder job sends the overdue notice once', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/training/notices')
  await page.locator('#notice-due-days').fill('5')
  await page.locator('#notice-auto-retrain').uncheck()
  await page.getByRole('button', { name: 'Save Notice Settings' }).click()
  await poll(async () => (await rest(`/rest/v1/forge_training_settings?organization_id=eq.${ORG}&select=due_reminder_days`))[0]?.due_reminder_days, 'the settings are saved').toBe(5)

  test.skip(!process.env.FORGE_CRON_SECRET, 'FORGE_CRON_SECRET is not set')
  const denied = await page.request.post(baseURL + '/api/training/cron', { headers: { Authorization: 'Bearer wrong' } })
  expect(denied.status()).toBe(401)

  // Notices go to the person's login; link the seeded person to the admin user for this run.
  await rest(`/rest/v1/forge_personnel?id=eq.${seeded.person.id}`, { method: 'PATCH', body: { auth_user_id: ADMIN } }).catch(() => null)
  const run = async () => {
    const response = await page.request.post(baseURL + '/api/training/cron', { headers: { Authorization: 'Bearer ' + process.env.FORGE_CRON_SECRET } })
    expect(response.status()).toBe(200)
  }
  await run()
  const logs = async () => (await rest(`/rest/v1/forge_training_notice_log?subject_id=eq.${seeded.assignment.id}&kind=eq.overdue&select=id`)).length
  const linked = (await rest(`/rest/v1/forge_personnel?id=eq.${seeded.person.id}&select=auth_user_id`))[0].auth_user_id === ADMIN
  test.skip(!linked, 'personnel cannot be linked to a login in this seed')
  await poll(logs, 'the overdue notice is queued').toBe(1)
  await run()
  expect(await logs(), 'a second run does not resend it').toBe(1)
  await rest(`/rest/v1/forge_personnel?id=eq.${seeded.person.id}`, { method: 'PATCH', body: { auth_user_id: null } }).catch(() => null)
})
