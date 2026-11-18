/**
 * Port slice 9 (piece B) browser checks: filling forms and the submissions workspace.
 * A template and its published version are seeded by REST. Required and "No needs a note" errors show per
 * field; a draft saves; submitting without the supervisor signature gives "Needs signature"; the list filter
 * finds it; the detail page shows the answers and the subject person found by employee number; editing keeps
 * the status and a supervisor signature cannot be added or replaced through the form; an own-scope user gets 404.
 *
 * Run (from apps/web): playwright test tests/port-s9-form-submissions.spec.cjs --reporter=line --workers=1
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
const TITLE = `S9 Guard Check ${RUN}`
const EMPLOYEE_NUMBER = `S9E${RUN}`

// 1x1 PNGs: the "real" supervisor signature and a forged one.
const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const SCHEMA = {
  fields: [
    { id: 'inspector', label: 'Inspector name', type: 'text', required: true },
    { id: 'guards', label: 'Guards in place', type: 'yesno', required: true },
    { id: 'fix', label: 'What will be fixed', type: 'text', visibleWhen: { fieldId: 'guards', equals: 'No' } },
    { id: 'employee', label: 'Employee number', type: 'employee_number' },
    { id: 'worker-signature', label: 'Worker signature', type: 'signature', signatory: 'any' },
    { id: 'supervisor-signature', label: 'Supervisor signature', type: 'signature', signatory: 'supervisor' }
  ]
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  if (method === 'POST' && Array.isArray(body) && body.length > 1) {
    const rows = []

    for (const row of body) rows.push(...[].concat((await rest(pathname, { method, body: row, prefer })) || []))

    return rows
  }

  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
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
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  const response = await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
  return response
}

const fixture = { templateId: null, versionId: null, personnelId: null, submissionId: null }

const loadSubmission = async () => (await rest(`/rest/v1/forge_form_submissions?id=eq.${fixture.submissionId}&select=*`))[0]

test.beforeAll(async () => {
  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Sienna', last_name: `Ninefield${RUN}`, employee_number: EMPLOYEE_NUMBER, employment_status: 'active' }
  })

  fixture.personnelId = person.id

  const [template] = await rest('/rest/v1/forge_form_templates', {
    method: 'POST',
    body: { organization_id: ORG, title: TITLE, status: 'active', schema: SCHEMA, current_version: 1, created_by: ADMIN }
  })

  fixture.templateId = template.id

  const [version] = await rest('/rest/v1/forge_form_template_versions', {
    method: 'POST',
    body: { organization_id: ORG, template_id: template.id, version: 1, title: TITLE, schema: SCHEMA, published_by: ADMIN }
  })

  fixture.versionId = version.id
})

test.afterAll(async () => {
  if (fixture.templateId) {
    await rest(`/rest/v1/forge_form_submissions?template_id=eq.${fixture.templateId}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_form_template_versions?template_id=eq.${fixture.templateId}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_form_templates?id=eq.${fixture.templateId}`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' }).catch(() => {})
})

const fieldError = (page, id) => page.locator(`[data-field-error="${id}"]`)

const drawSignature = async page => {
  const canvas = page.locator('[data-form-field="worker-signature"] canvas')

  await canvas.scrollIntoViewIfNeeded()

  const box = await canvas.boundingBox()

  await page.mouse.move(box.x + 20, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 })
  await page.mouse.move(box.x + 140, box.y + 40, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-form-field="worker-signature"]')).toContainText('Signed. Clear to redo.')
}

test('fill: required and No-note errors, save a draft, submit to Needs signature', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/fill/${fixture.templateId}`)
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(page.locator('[data-signature-deferred="supervisor"]')).toHaveText('Signed later by a supervisor.')

  // Nothing filled: required errors.
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(fieldError(page, 'inspector')).toHaveText('Inspector name is required.')
  await expect(fieldError(page, 'guards')).toHaveText('Guards in place is required.')

  // "No" shows the notes box and the conditional field; submitting without a note is refused.
  await expect(page.locator('[data-form-field="fix"]')).toHaveCount(0)
  await page.getByLabel('Inspector name').fill('Ivy Inspector')
  await page.locator('[data-form-field="guards"]').getByLabel('No', { exact: true }).check()
  await expect(page.locator('[data-form-field="fix"]')).toBeVisible()
  await page.getByLabel('Employee number').fill(EMPLOYEE_NUMBER)
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(fieldError(page, 'guards')).toHaveText('Add a note for "Guards in place" (answered No).')
  await expect(fieldError(page, 'inspector')).toHaveCount(0)

  // A draft does not need the note.
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/forms\/submissions\/[0-9a-f-]{36}\/edit$/)
  fixture.submissionId = page.url().match(/submissions\/([0-9a-f-]{36})\/edit/)[1]
  await page.waitForLoadState('networkidle')

  let row = await loadSubmission()

  expect(row.status).toBe('draft')
  expect(row.template_version_id).toBe(fixture.versionId)
  expect(row.submission_number).toMatch(/^FRM-\d{4}-\d{6}$/)
  expect(row.subject_personnel_id).toBe(fixture.personnelId)

  // Finish and submit: the supervisor signature is still missing, so it needs a signature.
  await expect(page.getByLabel('Inspector name')).toHaveValue('Ivy Inspector')
  await page.getByLabel('Notes for Guards in place (required for No)').fill('Left guard missing on press 4.')
  await page.getByLabel('What will be fixed').fill('Refit the guard.')
  await drawSignature(page)
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.waitForURL(new RegExp(`/forms/submissions/${fixture.submissionId}$`))
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-submission-status]')).toHaveText('Needs signature')

  row = await loadSubmission()
  expect(row.status).toBe('pending_signature')
  expect(row.submitted_by).toBe(ADMIN)
  expect(row.answers['guards__notes']).toBe('Left guard missing on press 4.')
  expect(row.answers['worker-signature'].method).toBe('in_app')
  expect(row.answers['worker-signature'].signedByUserId).toBe(ADMIN)
  expect(row.answers['supervisor-signature']).toBeUndefined()

  const activity = await rest(`/rest/v1/forge_form_submission_activity?submission_id=eq.${fixture.submissionId}&select=activity_type`)

  expect(activity.map(item => item.activity_type).sort()).toEqual(['created', 'pending_signature'])
})

test('list: the Needs signature filter shows it; detail shows answers and the subject person', async ({ page }) => {
  const row = await loadSubmission()

  await login(page, 'admin@forge2.local')
  await open(page, '/forms/submissions')
  await page.locator('#submission-status').selectOption('pending_signature')
  await page.locator('#submission-q').fill(row.submission_number)
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await page.waitForURL(/status=pending_signature/)
  await page.waitForLoadState('networkidle')

  const listed = page.locator(`[data-submission-row="${row.submission_number}"]`)

  await expect(listed).toBeVisible()
  await expect(listed).toContainText(TITLE)
  await expect(listed).toContainText('Needs signature')
  await expect(listed).toContainText(`Sienna Ninefield${RUN}`)

  // Submitted filter does not show it.
  await open(page, `/forms/submissions?status=submitted&q=${row.submission_number}`)
  await expect(page.locator(`[data-submission-row="${row.submission_number}"]`)).toHaveCount(0)

  await open(page, `/forms/submissions/${fixture.submissionId}`)
  await expect(page.locator('[data-submission-number]')).toHaveText(row.submission_number)
  await expect(page.locator('[data-form-answer="inspector"]')).toHaveText('Ivy Inspector')
  await expect(page.locator('[data-form-field="guards"]')).toContainText('Notes: Left guard missing on press 4.')
  await expect(page.locator('[data-form-field="worker-signature"] [data-signature-signed]')).toBeVisible()
  await expect(page.locator('[data-form-field="supervisor-signature"] [data-signature-missing]')).toBeVisible()

  const subject = page.locator('a[data-submission-subject]')

  await expect(subject).toHaveText(`Sienna Ninefield${RUN}`)
  await expect(subject).toHaveAttribute('href', `/personnel/${fixture.personnelId}`)
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Print' })).toHaveAttribute('href', `/forms/submissions/${fixture.submissionId}/print`)
  await expect(page.locator('[data-submission-activity]')).toContainText('pending signature')
})

// Adds a supervisor signature to the answers the edit page posts to the save action.
const forgeSupervisorSignature = async (page, image) => {
  await page.route('**/forms/submissions/*/edit', async route => {
    const request = route.request()

    if (request.method() !== 'POST' || !request.headers()['next-action']) return route.continue()

    const body = JSON.parse(request.postData())

    body[0].answers['supervisor-signature'] = { image, signedAt: new Date().toISOString(), signedByName: 'Forged Boss', signedByUserId: ADMIN, method: 'in_app' }

    return route.continue({ postData: JSON.stringify(body) })
  })
}

test('edit: re-save keeps the status; a supervisor signature cannot be added or replaced through the form', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/submissions/${fixture.submissionId}/edit`)
  await expect(page.locator('[data-signature-deferred="supervisor"]')).toBeVisible()

  // Re-save with a forged supervisor signature added: the answer changes, the signature is dropped.
  await forgeSupervisorSignature(page, PNG_B)
  await page.getByLabel('Inspector name').fill('Ivy Inspector Jr')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForURL(new RegExp(`/forms/submissions/${fixture.submissionId}$`))
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-form-answer="inspector"]')).toHaveText('Ivy Inspector Jr')
  await expect(page.locator('[data-submission-status]')).toHaveText('Needs signature')

  let row = await loadSubmission()

  expect(row.status).toBe('pending_signature')
  expect(row.answers.inspector).toBe('Ivy Inspector Jr')
  expect(row.answers['supervisor-signature']).toBeUndefined()
  // The worker signature drawn earlier is kept as stored.
  expect(row.answers['worker-signature'].signedByUserId).toBe(ADMIN)

  // A supervisor signed (stored directly); a forged replacement is ignored and the stored one stays.
  const real = { image: PNG_A, signedAt: '2026-01-01T00:00:00.000Z', signedByName: 'Real Supervisor', signedByUserId: null, method: 'remote_link' }

  await rest(`/rest/v1/forge_form_submissions?id=eq.${fixture.submissionId}`, {
    method: 'PATCH',
    body: { answers: { ...row.answers, 'supervisor-signature': real } }
  })

  await open(page, `/forms/submissions/${fixture.submissionId}/edit`)
  await expect(page.locator('[data-form-field="supervisor-signature"] [data-signature-signed]')).toContainText('Real Supervisor')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForURL(new RegExp(`/forms/submissions/${fixture.submissionId}$`))
  await page.waitForLoadState('networkidle')

  row = await loadSubmission()
  expect(row.answers['supervisor-signature']).toEqual(real)
  // With every deferred signature present the re-save resolves to Submitted.
  expect(row.status).toBe('submitted')
})

test('an own-scope user cannot see the admin submission', async ({ page }) => {
  const row = await loadSubmission()

  await login(page, 'user@forge2.local')

  const response = await open(page, `/forms/submissions/${fixture.submissionId}`)

  expect(response.status()).toBe(404)

  const edit = await open(page, `/forms/submissions/${fixture.submissionId}/edit`)

  expect(edit.status()).toBe(404)

  await open(page, `/forms/submissions?q=${row.submission_number}`)
  await expect(page.locator(`[data-submission-row="${row.submission_number}"]`)).toHaveCount(0)
})
