/**
 * Port slice 9 (piece A) browser checks: the form library and the template builder. Build a form with several
 * field types (incl. Yes/No and a supervisor signature), save, publish → version 1; edit and publish → version 2
 * with version 1 unchanged; quick text mode round trip; publishing an empty form is refused; archive hides the
 * form from the library; a user without forms.manage cannot open the builder.
 *
 * Run (from apps/web): npx playwright test tests/port-s9-form-templates.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-6)
const TITLE = `S9 Builder ${RUN}`
const CATEGORY = `S9Cat${RUN}`

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

// Wait for hydration, so client controls react to the first click.
const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const fixture = { templateId: null }

const template = async () => (await rest(`/rest/v1/forge_form_templates?id=eq.${fixture.templateId}&select=*`))[0]
const versions = async () => rest(`/rest/v1/forge_form_template_versions?template_id=eq.${fixture.templateId}&select=*&order=version`)

test.afterAll(async () => {
  // Templates created by this run (versions cascade). The audit log keeps its rows.
  await rest(`/rest/v1/forge_form_templates?organization_id=eq.${ORG}&title=like.*${RUN}*`, { method: 'DELETE' }).catch(() => {})
})

const fieldCard = (page, index) => page.locator(`[data-builder-field="${index}"]`)

const addField = async (page, type, label) => {
  const count = await page.locator('[data-builder-field]').count()

  await page.getByLabel('New field type').selectOption(type)
  await page.getByRole('button', { name: 'Add field' }).click()
  await expect(page.locator('[data-builder-field]')).toHaveCount(count + 1)
  await fieldCard(page, count).getByLabel('Field label').fill(label)

  return fieldCard(page, count)
}

test('build a form, save it, publish version 1, edit and publish version 2', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forms/templates/new')

  await page.locator('input[name="title"]').fill(TITLE)
  await page.locator('input[name="category"]').fill(CATEGORY)

  const name = await addField(page, 'text', 'Inspector name')

  await name.getByLabel('Required').check()

  const guards = await addField(page, 'yesno', 'Guards in place')

  await guards.getByLabel('Required').check()

  const why = await addField(page, 'textarea', 'Why not')

  await why.getByLabel('Show only when').selectOption('guards-in-place')
  await why.getByLabel('Condition value').selectOption('No')

  const shift = await addField(page, 'select', 'Shift')

  await shift.getByLabel('Field options').fill('Day\nNight')

  const sign = await addField(page, 'signature', 'Supervisor sign-off')

  await sign.getByLabel('Signatory').selectOption('supervisor')

  await expect(page.locator('[data-form-preview]')).toContainText('Shown only when "Guards in place" is "No"')

  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/forms\/templates\/[0-9a-f-]{36}$/)
  fixture.templateId = page.url().split('/').pop()
  await page.waitForLoadState('networkidle')

  let row = await template()

  expect(row.status).toBe('draft')
  expect(row.current_version).toBe(0)
  expect(row.category).toBe(CATEGORY)
  expect(row.schema.fields.map(field => field.id)).toEqual(['inspector-name', 'guards-in-place', 'why-not', 'shift', 'supervisor-sign-off'])
  expect(await versions()).toHaveLength(0)

  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.locator('[data-builder-version]')).toHaveAttribute('data-builder-version', '1')

  row = await template()
  expect(row.status).toBe('active')
  expect(row.current_version).toBe(1)

  let list = await versions()

  expect(list).toHaveLength(1)
  expect(list[0].version).toBe(1)
  expect(list[0].title).toBe(TITLE)

  const v1 = list[0].schema.fields

  expect(v1.find(field => field.id === 'guards-in-place')).toMatchObject({ type: 'yesno', required: true })
  expect(v1.find(field => field.id === 'why-not').visibleWhen).toEqual({ fieldId: 'guards-in-place', equals: 'No' })
  expect(v1.find(field => field.id === 'shift').options).toEqual(['Day', 'Night'])
  expect(v1.find(field => field.id === 'supervisor-sign-off')).toMatchObject({ type: 'signature', signatory: 'supervisor' })

  // Edit: a saved field keeps its id when relabelled; publish again.
  await fieldCard(page, 0).getByLabel('Field label').fill('Inspector full name')
  await expect(page.locator('[data-builder-field="0"]')).toHaveAttribute('data-builder-field-id', 'inspector-name')
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.locator('[data-builder-version]')).toHaveAttribute('data-builder-version', '2')

  list = await versions()
  expect(list.map(item => item.version)).toEqual([1, 2])
  expect(list[1].schema.fields[0]).toMatchObject({ id: 'inspector-name', label: 'Inspector full name' })
  expect(list[0].schema.fields[0].label).toBe('Inspector name')
  expect(list[0].schema).toEqual({ fields: v1 })
  expect((await template()).current_version).toBe(2)
})

test('quick text mode converts to fields and back; publishing an empty form is refused', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/templates/${fixture.templateId}`)

  await page.getByRole('tab', { name: 'Quick text' }).click()

  const box = page.getByLabel('Fields as text')

  await expect(box).toHaveValue(/^inspector-name\|Inspector full name\|text\|required\nguards-in-place\|Guards in place\|yesno\|required\n/)
  await expect(box).toHaveValue(/shift\|Shift\|select\|optional\|Day;Night/)

  await box.fill((await box.inputValue()) + '\nppe|PPE worn|multiselect|required|Hard hat;Gloves')
  await page.getByRole('tab', { name: 'Field list' }).click()
  await expect(page.locator('[data-builder-field]')).toHaveCount(6)
  await expect(fieldCard(page, 5).getByLabel('Field type')).toHaveValue('multiselect')
  await expect(fieldCard(page, 5).getByLabel('Field options')).toHaveValue('Hard hat\nGloves')
  // The condition and signatory survive the text round trip.
  await expect(fieldCard(page, 2).getByLabel('Condition value')).toHaveValue('No')
  await expect(fieldCard(page, 4).getByLabel('Signatory')).toHaveValue('supervisor')

  await page.getByRole('tab', { name: 'Quick text' }).click()
  await expect(box).toHaveValue(/\nppe\|PPE worn\|multiselect\|required\|Hard hat;Gloves$/)

  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(async () => (await template()).schema.fields.length).toBe(6)

  const saved = await template()

  expect(saved.schema.fields[5]).toEqual({ id: 'ppe', label: 'PPE worn', type: 'multiselect', required: true, options: ['Hard hat', 'Gloves'] })
  expect(saved.current_version).toBe(2)
  expect(await versions()).toHaveLength(2)

  // A new form with no fields cannot be published.
  await open(page, '/forms/templates/new')
  await page.locator('input[name="title"]').fill(`S9 Empty ${RUN}`)
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Add at least one question before publishing.').first()).toBeVisible()
  expect(await rest(`/rest/v1/forge_form_templates?organization_id=eq.${ORG}&title=eq.${encodeURIComponent(`S9 Empty ${RUN}`)}&select=id`)).toHaveLength(0)
})

test('the library lists the form; archiving hides it; restore brings it back', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forms')

  await page.getByLabel('Search forms').fill(`Builder ${RUN}`)

  const row = page.locator(`[data-form-template-row="${fixture.templateId}"]`)

  await expect(row).toContainText(TITLE)
  await expect(row).toContainText('v2')
  await expect(row.getByRole('link', { name: 'Fill out' })).toHaveAttribute('href', `/forms/fill/${fixture.templateId}`)
  await expect(row.getByRole('link', { name: 'Print blank' })).toHaveAttribute('href', `/forms/templates/${fixture.templateId}/print`)
  await page.getByLabel('Category').selectOption(CATEGORY)
  await expect(page.locator('[data-form-template-row]')).toHaveCount(1)

  await page.getByRole('link', { name: 'Manage templates' }).click()
  await page.waitForURL(/view=manage/)
  await page.waitForLoadState('networkidle')
  page.once('dialog', dialog => dialog.accept())
  await page.locator(`[data-form-template-row="${fixture.templateId}"]`).getByRole('button', { name: 'Archive' }).click()
  await expect(page.locator(`[data-form-template-row="${fixture.templateId}"]`)).toContainText('Archived')
  expect((await template()).status).toBe('archived')

  await open(page, '/forms')
  await expect(page.locator(`[data-form-template-row="${fixture.templateId}"]`)).toHaveCount(0)

  await open(page, '/forms?view=manage')
  await page.locator(`[data-form-template-row="${fixture.templateId}"]`).getByRole('button', { name: 'Restore' }).click()
  await expect.poll(async () => (await template()).status).toBe('active')
})

test('duplicate creates a draft copy', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forms/templates/${fixture.templateId}`)
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await page.waitForURL(url => /\/forms\/templates\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(fixture.templateId))

  const copyId = page.url().split('/').pop()
  const [copy] = await rest(`/rest/v1/forge_form_templates?id=eq.${copyId}&select=*`)

  expect(copy.title).toBe(`Copy of ${TITLE}`)
  expect(copy.status).toBe('draft')
  expect(copy.current_version).toBe(0)
  expect(copy.schema.fields).toHaveLength(6)
})

test('a user without forms.manage cannot open the builder', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await page.goto(baseURL + `/forms/templates/${fixture.templateId}`)
  await page.waitForURL(url => url.pathname === '/dashboard')
  await page.goto(baseURL + '/forms/templates/new')
  await page.waitForURL(url => url.pathname === '/dashboard')
})
