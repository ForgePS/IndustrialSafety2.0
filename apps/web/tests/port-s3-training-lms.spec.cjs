/**
 * Port slice 3 (Industrial 1.0 -> 2.0) browser smoke: build and publish a course, groups and bulk
 * assignment, an employee passing online, the employee-number kiosk (failed sign-in, failed then passed
 * quiz, certificate), paper quiz results and the compliance matrix.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s3-training-lms.spec.cjs --reporter=line --workers=1
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
const DEMO_PERSON = '20000000-0000-4000-8000-000000000600'
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

// Picks answers by text so the test does not depend on the random question order.
const answerQuiz = async (page, correct) => {
  const questions = page.locator('[data-testid^="quiz-question-"]')
  const count = await questions.count()

  for (let index = 0; index < count; index += 1) {
    const question = questions.nth(index)
    const stem = await question.locator('legend').textContent()
    const choice = stem.includes('auger') ? (correct ? 'Lock out the auger' : 'Keep it running') : correct ? 'Test the atmosphere' : 'Skip it'

    await question.getByText(choice, { exact: false }).click()
  }
}

let fx = null

test.beforeAll(async () => {
  const [course] = await rest('/rest/v1/forge_training_courses', {
    method: 'POST',
    body: { organization_id: ORG, title: `Grain Bin Entry ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN }
  })
  const [kiosk] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Kiosk', last_name: `Learner ${RUN}`, employee_number: `EMP-00${Number(RUN)}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN }
  })
  const [paper] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Paper', last_name: `Learner ${RUN}`, employee_number: `PAPER-${RUN}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN }
  })

  fx = { course, kiosk, paper }
})

test('trainer builds, publishes and assigns a course', async ({ page }) => {
  const { course, kiosk } = fx

  await login(page, 'admin@forge2.local')
  await open(page, `/training/courses/${course.id}`)
  await page.getByRole('link', { name: 'Content & Quiz' }).click()
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Start Course Content' }).click()
  await expect(page.getByTestId('training-versions')).toContainText('Version 1 · draft', { timeout: 30000 })

  await page.locator('#version-ack').click()
  await page.locator('#version-ack-text').fill('I will never enter a bin without a permit.')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 30000 })
  await page.waitForLoadState('networkidle')

  await page.locator('#material-file').setInputFiles({ name: 'bin-entry-checklist.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic bin entry checklist') })
  await page.locator('#material-title').fill('Bin entry checklist')
  const uploadResponse = page.waitForResponse(response => response.url().includes('/api/training/materials'))
  await page.getByRole('button', { name: 'Upload' }).click()
  const uploaded = await uploadResponse
  expect(uploaded.status(), await uploaded.text()).toBe(200)
  await expect(page.getByTestId('training-materials')).toContainText('Bin entry checklist', { timeout: 30000 })

  await page.locator('#section-title').fill('Before you enter')
  await page.locator('#section-body').fill('Lock out every auger and test the atmosphere before entry.')
  await page.locator('#section-material').selectOption({ label: 'Bin entry checklist' })
  await page.getByRole('button', { name: 'Add Section' }).click()
  await expect(page.getByTestId('training-sections')).toContainText('Before you enter', { timeout: 30000 })

  const addQuestion = async (stem, right, wrong) => {
    await page.locator('#question-stem').fill(stem)
    await page.locator('#question-choice-0').fill(wrong)
    await page.locator('#question-choice-1').fill(right)
    await page.getByLabel('Answer B is correct').check()
    await page.getByRole('button', { name: 'Add Question' }).click()
    await expect(page.getByTestId('training-questions')).toContainText(stem, { timeout: 30000 })
  }

  await addQuestion('What do you do with the auger before entry?', 'Lock out the auger', 'Keep it running')
  await addQuestion('What do you check before entering a bin?', 'Test the atmosphere', 'Skip it')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Publish Version 1' }).click()
  await expect(page.getByTestId('training-versions')).toContainText('Version 1 · published', { timeout: 30000 })
  await expect(page.getByText('Showing published version 1 (read-only).')).toBeVisible()

  // Groups: require the course and assign it to two people.
  await open(page, '/training/groups')
  await page.locator('#group-name').fill(`Bin crew ${RUN}`)
  await page.getByRole('button', { name: 'Create Group' }).click()
  await page.waitForURL(url => url.searchParams.has('group'), { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  fx.groupId = new URL(page.url()).searchParams.get('group')

  await page.locator('#group-course').selectOption({ label: course.title })
  await page.getByRole('button', { name: 'Add Course' }).click()
  await expect(page.getByTestId('group-requirements')).toContainText(course.title, { timeout: 30000 })

  for (const search of [`Kiosk Learner ${RUN}`, 'Forge Demo User']) {
    await page.locator('#group-member-search').fill(search)
    await page.getByTestId('training-group-detail').getByText(search, { exact: false }).first().click()
  }
  await page.getByRole('button', { name: /Add 2 People/ }).click()
  await expect(page.getByTestId('group-members')).toContainText(`Kiosk Learner ${RUN}`, { timeout: 30000 })

  await page.getByRole('button', { name: 'Assign Required Training' }).click()
  await expect(page.getByText(/2 assignments created/)).toBeVisible({ timeout: 30000 })

  const assignments = await rest(`/rest/v1/forge_training_assignments?course_id=eq.${course.id}&select=personnel_id,status`)
  expect(assignments.map(row => row.personnel_id).sort()).toEqual([DEMO_PERSON, kiosk.id].sort())
})

test('employee completes the course online and gets a certificate', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await open(page, '/my-training')
  await page.getByRole('link', { name: fx.course.title }).click()
  await page.waitForLoadState('networkidle')

  const player = page.getByTestId('course-player')
  await expect(player.getByText('Finish the required sections to unlock the quiz.')).toBeVisible({ timeout: 30000 })

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Open material: Bin entry checklist' }).click()])
  await popup.close()

  await page.getByRole('button', { name: 'Mark Section Complete' }).click()
  await expect(page.getByTestId('course-notice')).toContainText('The quiz is open', { timeout: 30000 })

  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await expect(page.getByTestId('quiz-question-2')).toBeVisible({ timeout: 30000 })
  await answerQuiz(page, true)
  await expect(page.getByRole('button', { name: 'Submit Quiz' })).toBeDisabled()
  await page.getByText('I will never enter a bin without a permit.').click()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await expect(page.getByTestId('quiz-review')).toContainText('100% — Passed', { timeout: 30000 })

  await page.getByRole('link', { name: 'View Certificate' }).click()
  await page.waitForLoadState('networkidle')
  const certificate = page.getByTestId('training-certificate')
  await expect(certificate).toContainText('Forge Demo User')
  await expect(certificate).toContainText(fx.course.title)
  await expect(certificate).toContainText(/CERT-\d{4}-\d{5}/)
})

test('kiosk: employee-number sign-in, failed then passed quiz', async ({ page, browser }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/training/portal')
  await page.locator('#portal-title').fill(`Break room ${RUN}`)
  await page.getByRole('button', { name: 'Create Kiosk Link' }).click()
  const url = await page.getByTestId('portal-created-url').inputValue()
  expect(url).toMatch(/\/training-portal\/[a-f0-9]{64}$/)

  const kioskContext = await browser.newContext()
  const kiosk = await kioskContext.newPage()
  const portalUrl = baseURL + new URL(url).pathname

  await open(kiosk, portalUrl)
  await kiosk.locator('#portal-employee-number').fill('NOPE-404')
  await kiosk.getByRole('button', { name: 'Start Training' }).click()
  await expect(kiosk.getByText('That employee number was not recognized for this training kiosk.')).toBeVisible({ timeout: 30000 })

  // Any accepted spelling of the employee number works (slice 0 matching).
  await kiosk.locator('#portal-employee-number').fill(`emp ${Number(RUN)}`)
  await kiosk.getByRole('button', { name: 'Start Training' }).click()
  await expect(kiosk.getByTestId('portal-welcome')).toContainText(`Kiosk Learner ${RUN}`, { timeout: 30000 })

  await kiosk.getByTestId('portal-assignments').getByRole('link', { name: 'Open' }).click()
  await kiosk.waitForLoadState('networkidle')
  await kiosk.getByRole('button', { name: 'Mark Section Complete' }).click()
  await expect(kiosk.getByTestId('course-notice')).toContainText('The quiz is open', { timeout: 30000 })

  await kiosk.getByRole('button', { name: 'Start Quiz' }).click()
  await expect(kiosk.getByTestId('quiz-question-2')).toBeVisible({ timeout: 30000 })
  await answerQuiz(kiosk, false)
  await kiosk.getByText('I will never enter a bin without a permit.').click()
  await kiosk.getByRole('button', { name: 'Submit Quiz' }).click()
  await expect(kiosk.getByTestId('quiz-review')).toContainText('0% — Not passed', { timeout: 30000 })
  await expect(kiosk.getByTestId('quiz-review')).toContainText('Incorrect')

  await kiosk.getByRole('button', { name: 'Retake Quiz' }).click()
  await expect(kiosk.getByTestId('quiz-question-2')).toBeVisible({ timeout: 30000 })
  await answerQuiz(kiosk, true)
  await kiosk.getByText('I will never enter a bin without a permit.').click()
  await kiosk.getByRole('button', { name: 'Submit Quiz' }).click()
  await expect(kiosk.getByTestId('quiz-review')).toContainText('100% — Passed', { timeout: 30000 })

  await kiosk.getByRole('link', { name: 'View Certificate' }).click()
  await kiosk.waitForLoadState('networkidle')
  await expect(kiosk.getByTestId('training-certificate')).toContainText(`Kiosk Learner ${RUN}`)

  // Signing out ends the session; the course page then returns to sign-in.
  await open(kiosk, portalUrl)
  await kiosk.getByRole('button', { name: 'Sign Out' }).click()
  await expect(kiosk.getByTestId('portal-sign-in')).toBeVisible({ timeout: 30000 })

  // Someone terminated after signing in loses the kiosk session on their next request.
  await kiosk.locator('#portal-employee-number').fill(`EMP-00${Number(RUN)}`)
  await kiosk.getByRole('button', { name: 'Start Training' }).click()
  await expect(kiosk.getByTestId('portal-welcome')).toBeVisible({ timeout: 30000 })
  await rest(`/rest/v1/forge_personnel?id=eq.${fx.kiosk.id}`, { method: 'PATCH', body: { employment_status: 'terminated' } })
  try {
    await open(kiosk, portalUrl)
    await expect(kiosk.getByTestId('portal-sign-in')).toBeVisible({ timeout: 30000 })
    await expect(kiosk.getByTestId('portal-welcome')).toHaveCount(0)
  } finally {
    await rest(`/rest/v1/forge_personnel?id=eq.${fx.kiosk.id}`, { method: 'PATCH', body: { employment_status: 'active' } })
  }
  await kioskContext.close()

  const [attempts] = [await rest(`/rest/v1/forge_training_attempts?personnel_id=eq.${fx.kiosk.id}&select=channel,passed&order=attempt_number`)]
  expect(attempts).toEqual([{ channel: 'kiosk', passed: false }, { channel: 'kiosk', passed: true }])
})

test('paper results and the compliance matrix', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, `/training/courses/${fx.course.id}/paper?variant=key`)
  await expect(page.getByTestId('paper-quiz-key')).toContainText('Confidential answer key', { timeout: 30000 })

  await open(page, '/training/paper')
  await page.locator('#paper-course').selectOption({ label: fx.course.title })
  await page.locator('#paper-results').fill(`PAPER-${RUN}, 85\nUNKNOWN-${RUN}, 90`)
  await page.getByRole('button', { name: 'Record Results' }).click()
  const outcomes = page.getByTestId('paper-outcomes')
  await expect(outcomes).toContainText(`Paper Learner ${RUN}) — Passed (85%)`, { timeout: 30000 })
  await expect(outcomes).toContainText('Employee number not found.')

  await open(page, `/training/matrix?group=${fx.groupId}`)
  const matrix = page.getByTestId('training-matrix')
  await expect(matrix.getByTestId(`matrix-row-${fx.kiosk.id}`)).toContainText('Current', { timeout: 30000 })
  await expect(matrix.getByTestId(`matrix-row-${DEMO_PERSON}`)).toContainText('Current')
  await expect(page.getByTestId('matrix-gaps')).toHaveText('0')

  const csv = await page.request.get(`${baseURL}/api/training/matrix?group=${fx.groupId}`)
  expect(await csv.text()).toContain(`Learner ${RUN}`)
})

test('employees cannot reach trainer tools', async ({ page }) => {
  await login(page, 'user@forge2.local')

  for (const route of ['/training/groups', '/training/portal', '/training/paper', `/training/courses/${fx.course.id}/content`]) {
    await page.goto(baseURL + route)
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).pathname, route).not.toBe(route)
  }

  await page.goto(`${baseURL}/training/courses/${fx.course.id}/paper?variant=key`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('paper-quiz-key')).toHaveCount(0)
})
