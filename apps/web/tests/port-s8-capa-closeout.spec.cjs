/**
 * Port slice 8, piece B browser checks: public CAPA closeout links. An admin generates a link on the
 * CAPA page; someone with no sign-in opens it, sees only the CAPA summary and submits notes, name and a
 * photo; the CAPA moves to pending verification with the photo as evidence and the linked task
 * completed. Used, expired, revoked and unknown links show an error page; the submit endpoint rejects
 * bad input.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s8-capa-closeout.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-6)
const SITE = `S8 Closeout Site ${RUN}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  // PostgREST rejects a bulk insert whose rows have different columns; post those one at a time.
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

// Wait for hydration, so client controls react to the first click.
const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const hash = token => crypto.createHash('sha256').update(token).digest('hex')
const fixture = { locationId: null, taskId: null, capaIds: [], ownerName: null }

const generateLink = async page => {
  const panel = page.getByTestId('closeout-link-panel')

  await expect(panel).toBeVisible({ timeout: 60000 })
  await panel.getByRole('button', { name: /Generate (Closeout|New) Link/ }).click()
  const input = page.getByTestId('closeout-link-url')

  await expect(input).toBeVisible({ timeout: 30000 })
  const url = new URL(await input.inputValue())

  expect(url.pathname).toMatch(/^\/closeout\/[A-Za-z0-9_-]{32}$/)
  return url.pathname
}

test.beforeAll(async () => {
  const [location] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG, name: SITE, code: `S8C${RUN}` } })
  fixture.locationId = location.id

  const [owner] = await rest(`/rest/v1/forge_personnel?organization_id=eq.${ORG}&select=id,first_name,last_name&limit=1`)
  fixture.ownerName = owner.last_name

  const [task] = await rest('/rest/v1/forge_tasks', {
    method: 'POST',
    body: { organization_id: ORG, task_number: `TSK-S8C-${RUN}`, title: `S8 closeout task ${RUN}`, status: 'open', priority: 'high', assigned_user_id: ADMIN, created_by: ADMIN }
  })
  fixture.taskId = task.id

  const base = {
    organization_id: ORG,
    location_id: location.id,
    assigned_personnel_id: owner.id,
    source_type: 'manual',
    action_type: 'corrective',
    severity: 'high',
    status: 'open',
    root_cause_required: true,
    root_cause: `Secret root cause ${RUN}`,
    action_plan: 'Replace the guard',
    due_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    created_by: ADMIN
  }
  const rows = await rest('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: [
      { ...base, action_number: `CA-S8C-${RUN}-1`, title: `S8 closeout guard ${RUN}`, description: 'Missing guard on press 4', linked_task_id: task.id },
      { ...base, action_number: `CA-S8C-${RUN}-2`, title: `S8 closeout revoke ${RUN}`, description: 'Second CAPA' }
    ]
  })
  fixture.capaIds = rows.map(row => row.id)
})

test.afterAll(async () => {
  const ids = fixture.capaIds.join(',')

  if (ids) {
    const evidence = await rest(`/rest/v1/forge_record_evidence?resource_type=eq.corrective_action&resource_id=in.(${ids})&select=id,storage_path`).catch(() => [])

    if (evidence.length) {
      await fetch(API_URL + '/storage/v1/object/forge-evidence', {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: evidence.map(item => item.storage_path) })
      }).catch(() => {})
      await rest(`/rest/v1/forge_record_evidence?id=in.(${evidence.map(item => item.id).join(',')})`, { method: 'DELETE' }).catch(() => {})
    }

    await rest(`/rest/v1/forge_record_activity?resource_type=eq.corrective_action&resource_id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_workflow_instances?resource_type=eq.corrective_action&resource_id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_corrective_actions?id=in.(${ids})`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.taskId) await rest(`/rest/v1/forge_tasks?id=eq.${fixture.taskId}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.locationId) await rest(`/rest/v1/locations?id=eq.${fixture.locationId}`, { method: 'DELETE' }).catch(() => {})
})

test('a closeout link lets someone with no sign-in close out the CAPA for verification', async ({ page, browser }) => {
  const [capaId] = fixture.capaIds

  await login(page, 'admin@forge2.local')
  await open(page, '/corrective-actions/' + capaId)
  const linkPath = await generateLink(page)

  await expect(page.getByTestId('closeout-link-active')).toBeVisible({ timeout: 30000 })

  const [token] = await rest(`/rest/v1/forge_corrective_action_closeout_tokens?corrective_action_id=eq.${capaId}&select=token_hash,expires_at,created_by`)
  expect(token.token_hash).toBe(hash(linkPath.split('/').pop()))
  expect(token.created_by).toBe(ADMIN)
  const days = (Date.parse(token.expires_at) - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(89)
  expect(days).toBeLessThan(91)

  const anonymous = await browser.newContext()
  const publicPage = await anonymous.newPage()

  await open(publicPage, linkPath)
  expect(new URL(publicPage.url()).pathname).toBe(linkPath)
  const summary = publicPage.getByTestId('closeout-summary')

  await expect(summary).toContainText(`S8 closeout guard ${RUN}`)
  await expect(summary).toContainText(`CA-S8C-${RUN}-1`)
  await expect(summary).toContainText('Missing guard on press 4')
  await expect(summary).toContainText(SITE)
  // Nothing beyond the summary: no root cause, owner or plan.
  await expect(publicPage.locator('body')).not.toContainText(`Secret root cause ${RUN}`)
  await expect(publicPage.locator('body')).not.toContainText('Replace the guard')
  await expect(publicPage.locator('body')).not.toContainText(fixture.ownerName)

  await publicPage.getByLabel('Your name').fill('Pat Contractor')
  await publicPage.getByLabel('Closeout notes').fill(`Guard installed and tested ${RUN}`)
  await publicPage.locator('#closeout-photos').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: PNG })
  await publicPage.getByRole('button', { name: 'Submit Closeout' }).click()
  await expect(publicPage.getByTestId('closeout-done')).toBeVisible({ timeout: 60000 })

  const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${capaId}&select=status,completed_at,completed_by`)
  expect(capa.status).toBe('pending_verification')
  expect(capa.completed_at).toBeTruthy()
  expect(capa.completed_by).toBeNull()

  const [task] = await rest(`/rest/v1/forge_tasks?id=eq.${fixture.taskId}&select=status,completed_at`)
  expect(task.status).toBe('completed')

  const evidence = await rest(`/rest/v1/forge_record_evidence?resource_type=eq.corrective_action&resource_id=eq.${capaId}&select=evidence_type,content_type,description`)
  expect(evidence).toHaveLength(1)
  expect(evidence[0].evidence_type).toBe('photo')
  expect(evidence[0].description).toContain('Pat Contractor')

  const activity = await rest(`/rest/v1/forge_corrective_action_activity?corrective_action_id=eq.${capaId}&activity_type=eq.public_closeout_submitted&select=actor_user_id,metadata`)
  expect(activity).toHaveLength(1)
  expect(activity[0].actor_user_id).toBeNull()
  expect(activity[0].metadata.submitted_name).toBe('Pat Contractor')

  // The link is single use.
  await open(publicPage, linkPath)
  await expect(publicPage.getByTestId('closeout-unavailable')).toHaveAttribute('data-state', 'used')
  await anonymous.close()

  // Back as the admin: pending verification, with the submission on the closeout card.
  await open(page, '/corrective-actions/' + capaId)
  await expect(page.getByTestId('closeout-last-submission')).toContainText('Pat Contractor', { timeout: 60000 })
  await expect(page.getByTestId('closeout-last-submission')).toContainText(`Guard installed and tested ${RUN}`)
  await expect(page.getByRole('button', { name: /Generate (Closeout|New) Link/ })).toHaveCount(0)
})

test('revoked, expired and unknown links show an error page', async ({ page, browser }) => {
  const capaId = fixture.capaIds[1]

  await login(page, 'admin@forge2.local')
  await open(page, '/corrective-actions/' + capaId)
  const revokedPath = await generateLink(page)

  await page.getByTestId('closeout-link-panel').getByRole('button', { name: 'Revoke Link' }).click()
  await expect(page.getByText('No active closeout link.')).toBeVisible({ timeout: 30000 })

  const expiredToken = crypto.randomBytes(24).toString('base64url')
  await rest('/rest/v1/forge_corrective_action_closeout_tokens', {
    method: 'POST',
    body: { organization_id: ORG, corrective_action_id: capaId, token_hash: hash(expiredToken), expires_at: new Date(Date.now() - 60000).toISOString(), created_by: ADMIN }
  })

  const anonymous = await browser.newContext()
  const publicPage = await anonymous.newPage()

  for (const [linkPath, state] of [
    [revokedPath, 'revoked'],
    ['/closeout/' + expiredToken, 'expired'],
    ['/closeout/' + crypto.randomBytes(24).toString('base64url'), 'invalid'],
    ['/closeout/not-a-token', 'invalid']
  ]) {
    await open(publicPage, linkPath)
    expect(new URL(publicPage.url()).pathname).toBe(linkPath)
    await expect(publicPage.getByTestId('closeout-unavailable')).toHaveAttribute('data-state', state)
    await expect(publicPage.getByTestId('closeout-form')).toHaveCount(0)
  }

  // The submit endpoint refuses these links too, and the CAPA stays open.
  const post = (linkPath, form, headers = { origin: baseURL }) =>
    publicPage.request.post(baseURL + '/api/closeout/' + linkPath.split('/').pop(), { multipart: form, headers })

  expect((await post(revokedPath, { notes: 'x' })).status()).toBe(410)
  expect((await post('/closeout/' + expiredToken, { notes: 'x' })).status()).toBe(410)
  const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${capaId}&select=status`)
  expect(capa.status).toBe('open')
  await anonymous.close()
})

test('the submit endpoint rejects bad input before using the link', async ({ request }) => {
  const capaId = fixture.capaIds[1]
  const live = crypto.randomBytes(24).toString('base64url')

  await rest('/rest/v1/forge_corrective_action_closeout_tokens', {
    method: 'POST',
    body: { organization_id: ORG, corrective_action_id: capaId, token_hash: hash(live), expires_at: new Date(Date.now() + 86_400_000).toISOString(), created_by: ADMIN }
  })

  const url = baseURL + '/api/closeout/' + live
  const headers = { origin: baseURL }
  const png = i => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: PNG })

  expect((await request.post(url, { multipart: { notes: 'ok' }, headers: { origin: 'https://evil.example' } })).status()).toBe(403)
  expect((await request.post(url, { multipart: { notes: '   ' }, headers })).status()).toBe(400)
  expect((await request.post(url, { multipart: { notes: 'x'.repeat(5001) }, headers })).status()).toBe(400)
  expect((await request.post(url, { multipart: { notes: 'ok', photos: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } }, headers })).status()).toBe(400)
  expect((await request.post(url, { multipart: { notes: 'ok', photos: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') } }, headers })).status()).toBe(400)

  // Six photos: Playwright multipart cannot repeat a field, so build the body by hand.
  const boundary = '----s8closeout' + RUN
  const parts = [`--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\nok\r\n`]
  const chunks = [Buffer.from(parts[0])]

  for (let i = 0; i < 6; i++) {
    const photo = png(i)
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${photo.name}"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  const tooMany = await request.post(url, { data: Buffer.concat(chunks), headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` } })
  expect(tooMany.status()).toBe(400)

  const [token] = await rest(`/rest/v1/forge_corrective_action_closeout_tokens?token_hash=eq.${hash(live)}&select=used_at`)
  expect(token.used_at).toBeNull()
  const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${capaId}&select=status`)
  expect(capa.status).toBe('open')
})
