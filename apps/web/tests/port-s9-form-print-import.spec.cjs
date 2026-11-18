/**
 * Port slice 9 (piece D) browser checks: printing forms and the Forge 1.0 import.
 * - A blank print of a published form shows its fields, Yes/No/N/A boxes and signature lines.
 * - A filled print shows the answers, a Yes/No note and a signature image; an own-scope user gets 404 on
 *   someone else's submission.
 * - Importing a small 1.0 JSON file (dry run, then import) creates a published v1 form and submissions with
 *   mapped statuses; importing it again creates nothing new.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s9-form-print-import.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const os = require('os')
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

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
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

const SCHEMA = {
  fields: [
    { id: 'part-a', label: 'Part A', type: 'section' },
    { id: 'intro', label: 'Instructions', type: 'content', content: `Check the press before use ${RUN}.` },
    { id: 'operator', label: 'Operator name', type: 'text', required: true },
    { id: 'shift', label: 'Shift', type: 'radio', options: ['Day', 'Night'] },
    { id: 'guard', label: 'Guard in place?', type: 'yesno', required: true },
    { id: 'ack', label: 'I inspected the press', type: 'checkbox' },
    { id: 'operator-signature', label: 'Operator Signature', type: 'signature', signatory: 'any' },
    { id: 'supervisor-signature', label: 'Supervisor Signature', type: 'signature', signatory: 'supervisor' }
  ]
}

const fixture = { templateId: null, versionId: null, submissionId: null, importFile: null }
const TEMPLATE_TITLE = `S9 Print Press Check ${RUN}`

// The 1.0 import file: one active form, one archived form, three submissions.
const IMPORT = {
  formTemplates: [
    {
      id: `s9-imp-tpl-${RUN}`,
      title: `S9 Imported Forklift ${RUN}`,
      status: 'ACTIVE',
      version: '1',
      schemaJson: {
        fields: [
          { id: 'truck', label: 'Truck', type: 'text', required: true },
          { id: 'horn', label: 'Horn works?', type: 'yes_no_na' },
          { id: 'supervisorSignature', label: 'Supervisor Signature' }
        ]
      }
    },
    { sourceDocumentId: `s9-imp-old-${RUN}`, data: { name: `S9 Imported Old ${RUN}`, status: 'ARCHIVED', fields: [{ id: 'q', label: 'Question' }] } }
  ],
  formSubmissions: [
    {
      id: `s9-imp-sub-1-${RUN}`,
      formDefinitionId: `s9-imp-tpl-${RUN}`,
      title: `S9 Imported Forklift ${RUN}`,
      status: 'PENDING_SIGNATURE',
      submittedAt: '2025-03-04T15:00:00.000Z',
      answers: { truck: 'T-9', horn: 'NO', horn__notes: 'Quiet horn' }
    },
    {
      id: `s9-imp-sub-2-${RUN}`,
      formDefinitionId: `s9-imp-tpl-${RUN}`,
      status: 'SUBMITTED',
      submittedAt: '2025-03-05T15:00:00.000Z',
      answers: { truck: 'T-10', horn: 'YES', supervisorSignature: { image: PNG, signedAt: '2025-03-05T16:00:00.000Z', signedByName: 'Sam Supervisor' } }
    },
    { sourceDocumentId: `s9-imp-sub-3-${RUN}`, data: { templateId: `s9-imp-old-${RUN}`, status: 'DRAFT', responses: { q: 'Draft answer' } } }
  ]
}

const importedTemplates = () =>
  rest(`/rest/v1/forge_form_templates?organization_id=eq.${ORG}&source_system=eq.forge_1x&source_id=like.s9-imp-*-${RUN}&select=id,title,status,current_version,source_id`)

const importedSubmissions = () =>
  rest(`/rest/v1/forge_form_submissions?organization_id=eq.${ORG}&source_system=eq.forge_1x&source_id=like.s9-imp-sub-*-${RUN}&select=id,status,answers,template_version_id,source_id&order=source_id`)

test.beforeAll(async () => {
  const [template] = await rest('/rest/v1/forge_form_templates', {
    method: 'POST',
    body: { organization_id: ORG, title: TEMPLATE_TITLE, status: 'active', schema: SCHEMA, current_version: 1, created_by: ADMIN, updated_by: ADMIN }
  })

  fixture.templateId = template.id

  const [version] = await rest('/rest/v1/forge_form_template_versions', {
    method: 'POST',
    body: { organization_id: ORG, template_id: template.id, version: 1, title: TEMPLATE_TITLE, schema: SCHEMA, published_by: ADMIN }
  })

  fixture.versionId = version.id

  const [submission] = await rest('/rest/v1/forge_form_submissions', {
    method: 'POST',
    body: {
      organization_id: ORG,
      submission_number: `FRM-S9P-${RUN}`,
      template_id: template.id,
      template_version_id: version.id,
      title: TEMPLATE_TITLE,
      status: 'pending_signature',
      answers: {
        operator: `Pat Printer ${RUN}`,
        shift: 'Night',
        guard: 'No',
        guard__notes: `Guard missing on press ${RUN}`,
        ack: true,
        'operator-signature': { image: PNG, signedAt: '2026-11-17T10:00:00.000Z', signedByName: 'Pat Printer', signedByUserId: ADMIN, method: 'in_app' }
      },
      submitted_by: ADMIN,
      submitted_at: '2026-11-17T10:00:00.000Z',
      created_by: ADMIN,
      updated_by: ADMIN
    }
  })

  fixture.submissionId = submission.id

  fixture.importFile = path.join(os.tmpdir(), `s9-forge-1x-forms-${RUN}.json`)
  fs.writeFileSync(fixture.importFile, JSON.stringify(IMPORT))
})

test.afterAll(async () => {
  const imported = await importedTemplates().catch(() => [])
  const templateIds = [fixture.templateId, ...imported.map(row => row.id)].filter(Boolean)

  if (templateIds.length) {
    // Submissions (and their activity, by cascade) first: templates are restricted while submissions exist.
    await rest(`/rest/v1/forge_form_submissions?template_id=in.(${templateIds.join(',')})`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_form_templates?id=in.(${templateIds.join(',')})`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.importFile) fs.rmSync(fixture.importFile, { force: true })
})

test('a blank print shows every field with boxes and signature lines', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/templates/${fixture.templateId}/print`)

  const sheet = page.locator('[data-form-print="blank"]')

  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('form-print-title')).toHaveText(TEMPLATE_TITLE)
  await expect(page.getByTestId('form-print-subtitle')).toHaveText('Version 1')
  await expect(page.getByTestId('form-print-date')).toContainText('Printed')
  await expect(sheet.getByRole('heading', { name: 'Part A' })).toBeVisible()
  await expect(sheet).toContainText(`Check the press before use ${RUN}.`)
  await expect(sheet.locator('[data-print-field="operator"] .form-print-line')).toHaveCount(1)
  await expect(sheet.locator('[data-print-field="shift"]')).toContainText('Mark one')
  await expect(sheet.locator('[data-print-field="guard"]')).toContainText('Notes (required if No)')
  await expect(sheet.locator('[data-print-field="guard"] .form-print-box')).toHaveCount(3)
  await expect(sheet.getByTestId('form-print-signature-line')).toHaveCount(2)
  await expect(sheet.locator('[data-print-field="supervisor-signature"]')).toContainText('(Supervisor)')
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
})

test('a filled print shows answers, the Yes/No note and the signature image', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/submissions/${fixture.submissionId}/print`)

  const sheet = page.locator('[data-form-print="filled"]')

  await expect(sheet).toBeVisible()
  await expect(sheet.locator('[data-print-meta="Submission"]')).toHaveText(`FRM-S9P-${RUN}`)
  await expect(sheet.locator('[data-print-meta="Status"]')).toHaveText('Needs signature')
  await expect(sheet.locator('[data-print-field="operator"]')).toContainText(`Pat Printer ${RUN}`)
  await expect(sheet.locator('[data-print-field="shift"]')).toContainText('Night')
  await expect(sheet.getByTestId('form-print-yesno-note')).toHaveText(`Notes: Guard missing on press ${RUN}`)
  await expect(sheet.locator('[data-print-field="ack"]')).toContainText('Yes')

  const signature = sheet.locator('[data-print-field="operator-signature"]')

  await expect(signature).toHaveAttribute('data-print-signature', 'signed')
  await expect(signature.getByTestId('form-print-signature-image')).toHaveAttribute('src', PNG)
  await expect(signature).toContainText('Signed by Pat Printer')
  await expect(sheet.locator('[data-print-field="supervisor-signature"]')).toContainText('Awaiting Supervisor')
})

test("an own-scope user gets 404 on someone else's submission print", async ({ page }) => {
  await login(page, 'user@forge2.local')

  const response = await page.goto(`${baseURL}/forms/submissions/${fixture.submissionId}/print`)

  expect(response.status()).toBe(404)
  await expect(page.locator('[data-form-print]')).toHaveCount(0)
})

test('importing a 1.0 file: dry run, import, and a second import creates nothing new', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forms/import')

  await page.getByLabel('Forge 1.0 JSON file').setInputFiles(fixture.importFile)
  await page.getByRole('button', { name: 'Dry run' }).click()

  const summary = page.getByTestId('form-import-summary')

  await expect(summary).toHaveAttribute('data-dry-run', 'true', { timeout: 90000 })
  await expect(page.getByTestId('import-templates-created')).toHaveText('2')
  await expect(page.getByTestId('import-submissions-created')).toHaveText('3')
  await expect(page.getByTestId('import-submissions-unlinked')).toHaveText('0')
  expect(await importedTemplates()).toHaveLength(0)

  await page.getByRole('button', { name: 'Import' }).click()
  await expect(summary).toHaveAttribute('data-dry-run', 'false', { timeout: 90000 })
  await expect(page.getByTestId('import-templates-created')).toHaveText('2')
  await expect(page.getByTestId('import-submissions-created')).toHaveText('3')

  const templates = await importedTemplates()
  const active = templates.find(row => row.source_id === `s9-imp-tpl-${RUN}`)
  const old = templates.find(row => row.source_id === `s9-imp-old-${RUN}`)

  expect(active).toMatchObject({ status: 'active', current_version: 1, title: `S9 Imported Forklift ${RUN}` })
  expect(old).toMatchObject({ status: 'archived', current_version: 1 })

  const versions = await rest(`/rest/v1/forge_form_template_versions?template_id=eq.${active.id}&select=id,version,schema`)

  expect(versions).toHaveLength(1)
  expect(versions[0].schema.fields.map(field => field.type)).toEqual(['text', 'yesno', 'signature'])

  const submissions = await importedSubmissions()

  expect(submissions.map(row => row.status)).toEqual(['pending_signature', 'submitted', 'draft'])
  expect(submissions[0].template_version_id).toBe(versions[0].id)
  expect(submissions[0].answers).toMatchObject({ truck: 'T-9', horn: 'No', horn__notes: 'Quiet horn' })
  expect(submissions[1].answers.supervisorsignature).toMatchObject({ image: PNG, signedByName: 'Sam Supervisor', method: 'imported' })

  // The imported signature prints.
  await open(page, `/forms/submissions/${submissions[1].id}/print`)
  await expect(page.locator('[data-print-field="supervisorsignature"]').getByTestId('form-print-signature-image')).toHaveAttribute('src', PNG)

  // Second import: nothing new.
  await open(page, '/forms/import')
  await page.getByLabel('Forge 1.0 JSON file').setInputFiles(fixture.importFile)
  await page.getByRole('button', { name: 'Dry run' }).click()
  await expect(summary).toHaveAttribute('data-dry-run', 'true', { timeout: 90000 })
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(summary).toHaveAttribute('data-dry-run', 'false', { timeout: 90000 })
  await expect(page.getByTestId('import-templates-created')).toHaveText('0')
  await expect(page.getByTestId('import-templates-updated')).toHaveText('0')
  await expect(page.getByTestId('import-templates-skipped')).toHaveText('2')
  await expect(page.getByTestId('import-submissions-created')).toHaveText('0')
  await expect(page.getByTestId('import-submissions-skipped')).toHaveText('3')

  expect(await importedTemplates()).toHaveLength(2)
  expect(await importedSubmissions()).toHaveLength(3)
})
