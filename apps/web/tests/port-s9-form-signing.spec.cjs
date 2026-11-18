/**
 * Port slice 9, piece C browser checks: form signatures.
 *
 * - The EHS Director gate: user@forge2.local (no Sign as EHS Director permission) sees no Sign button on the
 *   EHS Director field, and an EHS Director sign link sent to them is refused (page and POST).
 * - admin@forge2.local signs the EHS Director field in the app (signature panel on the submission page).
 * - A supervisor sign link is signed with no sign-in; once both signatures are in the form is submitted.
 * - Used, revoked, expired and unknown links each show their own message; cross-origin posts are refused.
 * - An EHS Director link sends a signed-out visitor to sign-in and back to the link.
 * - "Send link to sign" in the panel issues a link once and Revoke cancels it.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s9-form-signing.spec.cjs --reporter=line --workers=1
 */
const crypto = require('crypto')
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
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-6)
const SUPERVISOR = 'supervisor-signature'
const EHS = 'ehs-director-signature'

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

const fillLogin = async (page, email) => {
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await fillLogin(page, email)
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const hash = token => crypto.createHash('sha256').update(token).digest('hex')
const newToken = () => crypto.randomBytes(24).toString('base64url')

const draw = async (page, scope) => {
  const pad = scope.getByTestId('signature-pad')

  await pad.scrollIntoViewIfNeeded()
  const box = await pad.boundingBox()

  await page.mouse.move(box.x + 20, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 90, { steps: 6 })
  await page.mouse.move(box.x + 160, box.y + 30, { steps: 6 })
  await page.mouse.up()
}

const schema = {
  fields: [
    { id: 'task', label: 'Task performed', type: 'text', required: true },
    { id: 'ppe', label: 'PPE worn', type: 'yesno' },
    { id: SUPERVISOR, label: 'Supervisor Signature', type: 'signature', signatory: 'supervisor' },
    { id: EHS, label: 'EHS Director Signature', type: 'signature', signatory: 'ehs_director' }
  ]
}

const fixture = { templateId: null, versionId: null, submissionIds: [], tokens: {} }

const submission = async id => (await rest(`/rest/v1/forge_form_submissions?id=eq.${id}&select=status,answers,row_version`))[0]

const seedRequest = async (key, { submissionId, fieldId, userId = null, name, expiresIn = 86_400_000, usedAt = null, revokedAt = null }) => {
  const token = newToken()

  await rest('/rest/v1/forge_form_sign_requests', {
    method: 'POST',
    body: {
      organization_id: ORG,
      submission_id: submissionId,
      field_id: fieldId,
      token_hash: hash(token),
      requested_for_user_id: userId,
      requested_for_name: name,
      requested_by: ADMIN,
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
      used_at: usedAt,
      revoked_at: revokedAt
    }
  })
  fixture.tokens[key] = token
}

test.beforeAll(async () => {
  const [template] = await rest('/rest/v1/forge_form_templates', {
    method: 'POST',
    body: { organization_id: ORG, title: `S9 Signing Form ${RUN}`, status: 'active', schema, current_version: 1, created_by: ADMIN }
  })
  fixture.templateId = template.id

  const [version] = await rest('/rest/v1/forge_form_template_versions', {
    method: 'POST',
    body: { organization_id: ORG, template_id: template.id, version: 1, title: template.title, schema, published_by: ADMIN }
  })
  fixture.versionId = version.id

  const base = {
    organization_id: ORG,
    template_id: template.id,
    template_version_id: version.id,
    title: template.title,
    status: 'pending_signature',
    answers: { task: `Guard replacement ${RUN}`, ppe: 'Yes' },
    created_by: USER,
    submitted_by: USER,
    submitted_at: new Date().toISOString()
  }

  const rows = await rest('/rest/v1/forge_form_submissions', {
    method: 'POST',
    body: [
      { ...base, submission_number: `FRM-S9SIG-${RUN}-1` },
      { ...base, submission_number: `FRM-S9SIG-${RUN}-2` }
    ]
  })
  fixture.submissionIds = rows.map(row => row.id)

  const [first, second] = fixture.submissionIds

  await seedRequest('ehsForUser', { submissionId: first, fieldId: EHS, userId: USER, name: 'Forge 2.0 Demo User' })
  await seedRequest('supervisor', { submissionId: first, fieldId: SUPERVISOR, name: 'Sam Supervisor' })
  await seedRequest('revoked', { submissionId: second, fieldId: SUPERVISOR, name: 'Revoked Person', revokedAt: new Date().toISOString() })
  await seedRequest('expired', { submissionId: second, fieldId: SUPERVISOR, name: 'Late Person', expiresIn: -60_000 })
  await seedRequest('ehsForAdmin', { submissionId: second, fieldId: EHS, userId: ADMIN, name: 'Forge 2.0 Local Admin' })
})

test.afterAll(async () => {
  const ids = fixture.submissionIds.join(',')

  if (ids) {
    await rest(`/rest/v1/forge_notification_events?resource_type=eq.form_submission&resource_id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_creator_audit_log?entity_type=eq.form_submission&entity_id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_form_submissions?id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.templateId) await rest(`/rest/v1/forge_form_templates?id=eq.${fixture.templateId}`, { method: 'DELETE' }).catch(() => {})
})

test('a user without Sign as EHS Director cannot sign the EHS Director field', async ({ page }) => {
  const [first] = fixture.submissionIds

  await login(page, 'user@forge2.local')
  await open(page, `/forms/submissions/${first}`)

  const panel = page.getByTestId('form-signature-panel')

  await expect(panel).toBeVisible({ timeout: 60000 })
  const ehsRow = panel.locator(`[data-field-id="${EHS}"]`)

  await expect(ehsRow.getByTestId('signature-status')).toHaveText(/Waiting for the EHS Director/)
  await expect(ehsRow.getByTestId('sign-field')).toHaveCount(0)

  // An EHS Director link sent to this user is refused on the page and by the endpoint.
  await open(page, `/sign/${fixture.tokens.ehsForUser}`)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'not_director')

  const response = await page.request.post(`${baseURL}/api/forms/sign/${fixture.tokens.ehsForUser}`, {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { name: 'Demo User', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }
  })

  expect(response.status()).toBe(403)
  expect((await response.json()).error).toMatch(/EHS Director/)

  const row = await submission(first)

  expect(row.answers[EHS]).toBeUndefined()
  expect(row.status).toBe('pending_signature')

  // The refused attempt did not use up the link.
  const [request] = await rest(`/rest/v1/forge_form_sign_requests?token_hash=eq.${hash(fixture.tokens.ehsForUser)}&select=used_at`)

  expect(request.used_at).toBeNull()
})

test('admin signs the EHS Director field in the app', async ({ page }) => {
  const [first] = fixture.submissionIds

  await login(page, 'admin@forge2.local')
  await open(page, `/forms/submissions/${first}`)

  const ehsRow = page.getByTestId('form-signature-panel').locator(`[data-field-id="${EHS}"]`)

  await expect(ehsRow).toBeVisible({ timeout: 60000 })
  await ehsRow.getByTestId('sign-field').click()
  await draw(page, ehsRow)
  await ehsRow.getByTestId('save-signature').click()
  await expect(ehsRow).toHaveAttribute('data-signed', 'true', { timeout: 30000 })
  await expect(ehsRow.getByTestId('signature-status')).toContainText('Forge 2.0 Local Admin')

  const row = await submission(first)

  expect(row.answers[EHS].method).toBe('in_app')
  expect(row.answers[EHS].signedByUserId).toBe(ADMIN)
  expect(row.answers[EHS].image).toMatch(/^data:image\/png;base64,/)
  expect(row.status).toBe('pending_signature')

  // Signing the field cancelled the open EHS Director link sent to the demo user.
  const [request] = await rest(`/rest/v1/forge_form_sign_requests?token_hash=eq.${hash(fixture.tokens.ehsForUser)}&select=revoked_at`)

  expect(request.revoked_at).not.toBeNull()

  const activity = await rest(`/rest/v1/forge_form_submission_activity?submission_id=eq.${first}&activity_type=eq.signed&select=message,metadata`)

  expect(activity.some(item => item.metadata.field_id === EHS && item.metadata.method === 'in_app')).toBe(true)
})

test('a supervisor link is signed without sign-in and completes the form', async ({ browser }) => {
  const [first] = fixture.submissionIds
  const context = await browser.newContext()
  const page = await context.newPage()

  await open(page, `/sign/${fixture.tokens.supervisor}`)
  await expect(page.getByTestId('sign-summary')).toContainText(`FRM-S9SIG-${RUN}-1`)
  await expect(page.getByTestId('sign-answers')).toContainText(`Guard replacement ${RUN}`)
  await expect(page.getByTestId('sign-answers')).toContainText('Signed by Forge 2.0 Local Admin')
  await expect(page.locator('#sign-name')).toHaveValue('Sam Supervisor')

  // Cross-origin posts are refused.
  const crossOrigin = await page.request.post(`${baseURL}/api/forms/sign/${fixture.tokens.supervisor}`, {
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    data: { name: 'x', image: 'x' }
  })

  expect(crossOrigin.status()).toBe(403)

  await page.locator('#sign-name').fill('Sam Q. Supervisor')
  await draw(page, page.getByTestId('sign-form'))
  await page.getByTestId('sign-submit').click()
  await expect(page.getByTestId('sign-done')).toContainText('submitted', { timeout: 30000 })

  const row = await submission(first)

  expect(row.status).toBe('submitted')
  expect(row.answers[SUPERVISOR].method).toBe('remote_link')
  expect(row.answers[SUPERVISOR].signedByName).toBe('Sam Q. Supervisor')
  expect(row.answers[SUPERVISOR].signedByUserId).toBeNull()

  const [request] = await rest(`/rest/v1/forge_form_sign_requests?token_hash=eq.${hash(fixture.tokens.supervisor)}&select=used_at`)

  expect(request.used_at).not.toBeNull()

  // Single use.
  await open(page, `/sign/${fixture.tokens.supervisor}`)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'used')
  await expect(page.getByTestId('sign-unavailable')).toHaveText(/already been used/)
  await context.close()
})

test('revoked, expired and unknown links each get their own message', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await open(page, `/sign/${fixture.tokens.revoked}`)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'revoked')
  await expect(page.getByTestId('sign-unavailable')).toHaveText(/cancelled/)

  await open(page, `/sign/${fixture.tokens.expired}`)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'expired')
  await expect(page.getByTestId('sign-unavailable')).toHaveText(/expired/)

  await open(page, `/sign/${newToken()}`)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'invalid')
  await expect(page.getByTestId('sign-unavailable')).toHaveText(/not valid/)

  const expired = await page.request.post(`${baseURL}/api/forms/sign/${fixture.tokens.expired}`, {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { name: 'Late Person', image: 'data:image/png;base64,AAAA' }
  })

  expect(expired.status()).toBe(410)
  await context.close()
})

test('an EHS Director link sends a signed-out visitor to sign-in and back', async ({ browser }) => {
  const [, second] = fixture.submissionIds
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${baseURL}/sign/${fixture.tokens.ehsForAdmin}`)
  await page.waitForURL(url => url.pathname.startsWith('/auth/login'), { timeout: 60000 })
  expect(new URL(page.url()).searchParams.get('next')).toBe(`/sign/${fixture.tokens.ehsForAdmin}`)

  // Signed out, the endpoint refuses too.
  const signedOut = await page.request.post(`${baseURL}/api/forms/sign/${fixture.tokens.ehsForAdmin}`, {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { name: 'Someone', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }
  })

  expect(signedOut.status()).toBe(401)

  await page.waitForLoadState('networkidle')
  await fillLogin(page, 'admin@forge2.local')
  await page.waitForURL(url => url.pathname === `/sign/${fixture.tokens.ehsForAdmin}`, { timeout: 60000 })
  await page.waitForLoadState('networkidle')

  await expect(page.locator('#sign-name')).toHaveValue('Forge 2.0 Local Admin')
  await expect(page.locator('#sign-name')).toHaveAttribute('readonly', '')
  await draw(page, page.getByTestId('sign-form'))
  await page.getByTestId('sign-submit').click()
  await expect(page.getByTestId('sign-done')).toBeVisible({ timeout: 30000 })

  const row = await submission(second)

  expect(row.answers[EHS].method).toBe('remote_link')
  expect(row.answers[EHS].signedByUserId).toBe(ADMIN)
  expect(row.status).toBe('pending_signature')
  await context.close()
})

test('send link to sign issues a link once and revoke cancels it', async ({ page }) => {
  const [, second] = fixture.submissionIds

  await login(page, 'admin@forge2.local')
  await open(page, `/forms/submissions/${second}`)

  const row = page.getByTestId('form-signature-panel').locator(`[data-field-id="${SUPERVISOR}"]`)

  await expect(row).toBeVisible({ timeout: 60000 })
  await row.getByTestId('request-signature').click()
  await expect(row.getByTestId('signer-select')).toBeVisible({ timeout: 30000 })
  await row.getByTestId('signer-select').selectOption(`user:${ADMIN}`)
  await row.getByTestId('send-sign-request').click()

  const input = row.getByTestId('sign-link-url')

  await expect(input).toBeVisible({ timeout: 30000 })
  const url = new URL(await input.inputValue())

  expect(url.pathname).toMatch(/^\/sign\/[A-Za-z0-9_-]{32}$/)
  const token = url.pathname.split('/').pop()

  const [stored] = await rest(`/rest/v1/forge_form_sign_requests?token_hash=eq.${hash(token)}&select=id,requested_for_user_id,expires_at,revoked_at`)

  expect(stored.requested_for_user_id).toBe(ADMIN)
  expect(Date.parse(stored.expires_at) - Date.now()).toBeGreaterThan(13 * 86_400_000)

  // The signer was notified in the app and by email (the email carries the link).
  const deliveries = await rest(
    `/rest/v1/forge_notification_deliveries?select=channel,link_path,forge_notification_events!inner(resource_id,event_type)&forge_notification_events.resource_id=eq.${second}&forge_notification_events.event_type=eq.sign_request`
  )

  expect(deliveries.find(item => item.channel === 'in_app').link_path).toBe(`/forms/submissions/${second}`)
  expect(deliveries.find(item => item.channel === 'email').link_path).toBe(`/sign/${token}`)

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(row.getByTestId('open-sign-requests')).toContainText('Forge 2.0 Local Admin')
  await expect(row.getByTestId('sign-link-url')).toHaveCount(0)
  await row.getByTestId('revoke-sign-request').click()
  await expect(row.getByTestId('open-sign-requests')).toHaveCount(0, { timeout: 30000 })

  const [after] = await rest(`/rest/v1/forge_form_sign_requests?id=eq.${stored.id}&select=revoked_at`)

  expect(after.revoked_at).not.toBeNull()

  await open(page, url.pathname)
  await expect(page.getByTestId('sign-unavailable')).toHaveAttribute('data-state', 'revoked')
})
