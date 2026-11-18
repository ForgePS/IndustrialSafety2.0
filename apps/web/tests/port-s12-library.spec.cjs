/**
 * Port slice 12 browser checks: the Document Control library and document record.
 *
 * As admin@forge2.local:
 * - create and rename a folder
 * - create a document in that folder with a location and a 24 month review interval
 * - upload a PDF version (a text file posing as a PDF is refused)
 * - the distribution editor saves a location and a role rule, then back to everyone
 * As user@forge2.local (documents.view only):
 * - the draft document is a 404
 * - after version 1 is approved and version 2 uploaded, the current version opens but version 2 is a 404
 * Then archive / restore (Archived tab) and delete the folder (the document is kept, out of the folder).
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s12-library.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')
const FOLDER = `S12 F${RUN}`
const RENAMED = `S12 G${RUN}`
const NUMBER = `S12L-${RUN}`.toUpperCase()

test.describe.configure({ mode: 'serial' })
test.setTimeout(600000)

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

const rpc = (name, body) => rest('/rest/v1/rpc/' + name, { method: 'POST', body })

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

const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${name} ${RUN}\n%%EOF\n`) })

const poll = async (fn, check, label, tries = 40) => {
  for (let i = 0; i < tries; i += 1) {
    const value = await fn()
    if (check(value)) return value
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('timed out waiting for ' + label)
}

const fixture = { documentId: null, locationId: null, locationName: null, roleId: null, roleName: null, adminId: null, userId: null, v1: null, v2: null }

const documentRow = async () => (await rest(`/rest/v1/forge_documents?id=eq.${fixture.documentId}&select=*`))[0]
const versionRows = async () => rest(`/rest/v1/forge_document_versions?document_id=eq.${fixture.documentId}&select=*&order=version_number`)
const distributionRows = async () => rest(`/rest/v1/forge_document_distributions?document_id=eq.${fixture.documentId}&select=scope_type,scope_id`)

test.beforeAll(async () => {
  const [location] = await rest(`/rest/v1/locations?organization_id=eq.${ORG}&is_active=eq.true&select=id,name&order=name&limit=1`)
  const [role] = await rest(`/rest/v1/forge_tenant_roles?organization_id=eq.${ORG}&role_key=eq.employee&select=id,name`)
  const users = await rest('/auth/v1/admin/users?per_page=200')
  const list = users.users || users

  fixture.locationId = location.id
  fixture.locationName = location.name
  fixture.roleId = role.id
  fixture.roleName = role.name
  fixture.adminId = list.find(user => user.email === 'admin@forge2.local').id
  fixture.userId = list.find(user => user.email === 'user@forge2.local').id
})

test.afterAll(async () => {
  try {
    const docs = await rest(`/rest/v1/forge_documents?organization_id=eq.${ORG}&document_number=eq.${NUMBER}&select=id`)

    for (const doc of docs) {
      const versions = await rest(`/rest/v1/forge_document_versions?document_id=eq.${doc.id}&select=storage_path`)

      if (versions.length) {
        await fetch(API_URL + '/storage/v1/object/forge-documents', {
          method: 'DELETE',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: versions.map(row => row.storage_path) })
        })
      }

      await rest(`/rest/v1/forge_documents?id=eq.${doc.id}`, { method: 'DELETE' })
    }

    await rest(`/rest/v1/forge_document_folders?organization_id=eq.${ORG}&name=in.("${FOLDER}","${RENAMED}")`, { method: 'DELETE' })
  } catch (error) {
    console.warn('cleanup failed:', error.message)
  }
})

test('folders, create a document, upload a version and set its distribution', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await login(page, 'admin@forge2.local')
  await open(page, '/documents')

  // Folder create + rename.
  await page.getByLabel('Folder name').fill(FOLDER)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator(`[data-folder="${FOLDER}"]`)).toBeVisible()
  await page.getByRole('button', { name: `Rename ${FOLDER}` }).click()
  await page.getByLabel('New folder name').fill(RENAMED)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator(`[data-folder="${RENAMED}"]`)).toBeVisible()
  await expect(page.locator(`[data-folder="${FOLDER}"]`)).toHaveCount(0)

  // Create a document.
  await open(page, '/documents/new')
  await page.locator('#document-name').fill(`S12 Library ${RUN}`)
  await page.locator('#document-number').fill(NUMBER.toLowerCase())
  await page.locator('#document-folder').selectOption(RENAMED)
  await page.locator('#document-location').selectOption(fixture.locationId)
  await page.locator('#document-review-interval').selectOption('24')
  await page.locator('#document-description').fill('Library spec document.')
  await page.getByRole('button', { name: 'Add document' }).click()
  await page.waitForURL(url => /^\/documents\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  fixture.documentId = page.url().split('/').pop()

  const created = await documentRow()

  expect(created).toMatchObject({ document_number: NUMBER, category: RENAMED, location_id: fixture.locationId, review_interval_months: 24, status: 'draft', owner_user_id: fixture.adminId })

  // A text file renamed to .pdf is refused by the content check.
  const fake = await page.request.post(baseURL + `/documents/${fixture.documentId}/versions`, {
    headers: { origin: baseURL },
    multipart: { file: { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not really a pdf') } }
  })

  expect(fake.status()).toBe(400)

  // Upload version 1.
  await page.locator('#version-file').setInputFiles(pdf('policy-v1.pdf'))
  await page.locator('#version-summary').fill('First issue')
  await page.getByRole('button', { name: 'Upload version' }).click()
  await expect(page.locator('[data-testid="document-versions"] tr[data-version="1"]')).toBeVisible()

  const [v1] = await versionRows()

  fixture.v1 = v1.id
  expect(v1).toMatchObject({ version_number: 1, status: 'draft', content_type: 'application/pdf', file_name: 'policy-v1.pdf', change_summary: 'First issue' })
  expect(v1.storage_path).toBe(`${ORG}/${fixture.documentId}/${v1.id}`)

  // Distribution: a location and a role, then back to everyone.
  const editor = page.locator('[data-testid="distribution-editor"]')

  await editor.getByLabel('Distribute by').selectOption('location')
  await editor.getByLabel('Location', { exact: true }).selectOption(fixture.locationId)
  await editor.getByRole('button', { name: 'Add', exact: true }).click()
  await editor.getByLabel('Distribute by').selectOption('role')
  await editor.getByLabel('Role', { exact: true }).selectOption(fixture.roleId)
  await editor.getByRole('button', { name: 'Add', exact: true }).click()
  await editor.getByRole('button', { name: 'Save distribution' }).click()

  const saved = await poll(distributionRows, rows => rows.length === 2, 'two distribution rows')

  expect(saved).toEqual(
    expect.arrayContaining([
      { scope_type: 'location', scope_id: fixture.locationId },
      { scope_type: 'role', scope_id: fixture.roleId }
    ])
  )

  await editor.getByRole('button', { name: `Remove ${fixture.locationName}` }).click()
  await editor.getByRole('button', { name: `Remove ${fixture.roleName}` }).click()
  await expect(editor.getByText('Everyone in the company.')).toBeVisible()
  await editor.getByRole('button', { name: 'Save distribution' }).click()
  await poll(distributionRows, rows => rows.length === 0, 'distribution cleared')
  await expect(page.locator('[data-activity="distribution_changed"]')).toHaveCount(2)
})

test('a view-only user cannot open a draft or download a version that is not current', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const userContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const user = await userContext.newPage()

  // port-s12-workflow.spec.cjs grants user@ documents.approve while it runs; wait until user@ is view-only again.
  await poll(
    () => rest(`/rest/v1/forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${fixture.userId}&override_state=eq.allow&select=permission_id,forge_permission_registry(permission_key)`),
    rows => !rows.some(row => String(row.forge_permission_registry?.permission_key || '').startsWith('documents.')),
    'user@forge2.local to have no Document Control permission overrides',
    480
  )
  await login(user, 'user@forge2.local')

  const draft = await open(user, `/documents/${fixture.documentId}`)

  expect(draft.status()).toBe(404)
  expect((await user.request.get(baseURL + `/documents/${fixture.documentId}/versions/${fixture.v1}/file`, { maxRedirects: 0 })).status()).toBe(404)

  // Approve version 1 (submitted by the admin, approved by someone else).
  await rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: fixture.v1, p_actor_user_id: fixture.adminId })
  await rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: fixture.v1, p_actor_user_id: fixture.userId, p_effective_on: null, p_note: null })

  // The admin uploads version 2 (a draft).
  await login(admin, 'admin@forge2.local')
  await open(admin, `/documents/${fixture.documentId}`)
  await admin.locator('#version-file').setInputFiles(pdf('policy-v2.pdf'))
  await admin.getByRole('button', { name: 'Upload version' }).click()
  await expect(admin.locator('[data-testid="document-versions"] tr[data-version="2"]')).toBeVisible()
  fixture.v2 = (await versionRows())[1].id

  // The view-only user now sees the published document and its current version only.
  const published = await open(user, `/documents/${fixture.documentId}`)

  expect(published.status()).toBe(200)
  await expect(user.getByTestId('download-current')).toBeVisible()
  await expect(user.locator('[data-testid="document-versions"]')).toHaveCount(0)

  const current = await user.request.get(baseURL + `/documents/${fixture.documentId}/versions/${fixture.v1}/file?download=1`, { maxRedirects: 0 })

  expect([302, 303, 307]).toContain(current.status())
  expect(current.headers().location).toContain('/storage/v1/object/sign/forge-documents/')

  const notCurrent = await user.request.get(baseURL + `/documents/${fixture.documentId}/versions/${fixture.v2}/file`, { maxRedirects: 0 })

  expect(notCurrent.status()).toBe(404)

  // The admin can still open the draft.
  expect([302, 303, 307]).toContain((await admin.request.get(baseURL + `/documents/${fixture.documentId}/versions/${fixture.v2}/file`, { maxRedirects: 0 })).status())

  await adminContext.close()
  await userContext.close()
})

test('archive and restore, then delete the folder', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await login(page, 'admin@forge2.local')
  await open(page, `/documents/${fixture.documentId}`)
  await page.getByRole('button', { name: 'Archive' }).click()
  await poll(documentRow, row => Boolean(row.archived_at), 'archived')

  await open(page, '/documents')
  await expect(page.locator(`tr[data-document="${NUMBER}"]`)).toHaveCount(0)
  await open(page, '/documents/archived')

  const row = page.locator(`tr[data-document="${NUMBER}"]`)

  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Restore' }).click()
  await poll(documentRow, doc => !doc.archived_at, 'restored')
  await expect(row).toHaveCount(0)
  await open(page, `/documents?folder=${encodeURIComponent(RENAMED)}`)
  await expect(page.locator(`tr[data-document="${NUMBER}"]`)).toBeVisible()

  // Delete the folder: the document stays, out of the folder.
  await page.getByRole('button', { name: `Delete ${RENAMED}` }).click()
  await poll(documentRow, doc => doc.category === null, 'category cleared')
  await expect(page.locator(`[data-folder="${RENAMED}"]`)).toHaveCount(0)
  expect(await rest(`/rest/v1/forge_document_folders?organization_id=eq.${ORG}&name=eq.${encodeURIComponent(RENAMED)}&select=id`)).toEqual([])
  expect((await documentRow()).status).toBe('published')
})
