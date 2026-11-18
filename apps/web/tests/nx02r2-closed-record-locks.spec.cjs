/**
 * NX-02R2 — closed observations and closed risks are locked (server + UI).
 *
 * For each record: open the edit form while the record is editable, flip the record to `closed`
 * just before the real Save server action reaches the server (service-role fixture work only),
 * and assert the server refuses with the lock message and nothing changed. After reload the
 * UI must render the record read-only. Risk: reopening (status leaves `closed`) unlocks it.
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const { login, createObservation, createRisk, clickUntilPost } = require('./nx02h-playwright-helpers.cjs')

const envPath = path.join(__dirname, '..', '.env.local')
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

async function rest(method, urlPath, body) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + urlPath, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

const first = data => (Array.isArray(data) ? data[0] : data)

async function flipBeforeSave(page, pathname, onPost) {
  const counter = { count: 0 }
  await page.route(
    url => url.pathname === pathname,
    async route => {
      const request = route.request()
      if (request.method() === 'POST' && counter.count === 0) {
        counter.count++
        await onPost()
      }
      await route.continue()
    }
  )
  return counter
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test.describe('NX-02R2 closed record locks', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('closed observation: save refused server-side and form renders read-only', async () => {
    const title = 'NX-02R2 closed observation ' + Date.now()
    await createObservation(page, title)
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30000 })
    const observationPath = new URL(page.url()).pathname
    const observationId = observationPath.split('/').pop()

    await page.reload({ waitUntil: 'networkidle' })
    const save = page.getByTestId('observation-save')
    await expect(save).toBeVisible({ timeout: 20000 })
    await page.getByLabel(/^Title/i).first().fill(title + ' rewritten')

    const flip = await flipBeforeSave(page, observationPath, async () => {
      const closed = await rest('PATCH', '/rest/v1/forge_observations?id=eq.' + observationId, {
        status: 'closed',
        closed_at: new Date().toISOString(),
        closure_summary: 'Closed by NX-02R2 lock test.'
      })
      expect(closed.ok, JSON.stringify(closed.data)).toBeTruthy()
    })
    await clickUntilPost(page, save, /\/observations(\/|$)/i)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    expect(flip.count).toBe(1)
    await expect(page.getByText(/Closed observations are read-only/i).first()).toBeVisible({
      timeout: 20000
    })

    const row = first((await rest('GET', '/rest/v1/forge_observations?id=eq.' + observationId + '&select=title,status')).data)
    expect(row.status).toBe('closed')
    expect(row.title).toBe(title)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('observation-save')).toHaveCount(0)
  })

  test('closed risk: save refused, mutation panels hidden, reopen unlocks', async () => {
    const title = 'NX-02R2 closed risk ' + Date.now()
    await createRisk(page, title)
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30000 })
    const riskPath = new URL(page.url()).pathname
    const riskId = riskPath.split('/').pop()

    await page.reload({ waitUntil: 'networkidle' })
    const save = page.getByTestId('risk-save')
    await expect(save).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /Assess Inherent/i })).toBeVisible()
    await page.getByLabel(/^Title/i).first().fill(title + ' rewritten')

    const flip = await flipBeforeSave(page, riskPath, async () => {
      const closed = await rest('PATCH', '/rest/v1/forge_risks?id=eq.' + riskId, {
        status: 'closed',
        closed_at: new Date().toISOString(),
        closure_summary: 'Closed by NX-02R2 lock test.'
      })
      expect(closed.ok, JSON.stringify(closed.data)).toBeTruthy()
    })
    await clickUntilPost(page, save, /\/risk-register(\/|$)/i)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    expect(flip.count).toBe(1)
    await expect(page.getByText(/Closed risks are read-only/i).first()).toBeVisible({ timeout: 20000 })

    const row = first((await rest('GET', '/rest/v1/forge_risks?id=eq.' + riskId + '&select=title,status')).data)
    expect(row.status).toBe('closed')
    expect(row.title).toBe(title)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('risk-save')).toHaveCount(0)
    for (const name of [/Assess Inherent/i, /Assess Residual/i, /Accept Risk|Update Acceptance/i, /Record Review/i]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }

    // Reopen (status leaves closed) → editable again.
    const reopened = await rest('PATCH', '/rest/v1/forge_risks?id=eq.' + riskId, {
      status: 'review',
      closed_at: null,
      closure_summary: null
    })
    expect(reopened.ok, JSON.stringify(reopened.data)).toBeTruthy()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('risk-save')).toBeVisible({ timeout: 20000 })
  })
})
