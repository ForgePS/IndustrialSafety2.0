/**
 * Port slice 17 browser checks: Environmental Safety.
 *
 * - user@forge2.local (employee, no environmental permissions) is kept out.
 * - admin@forge2.local adds an air permit and an overdue quarterly obligation under it, which shows on the
 *   overview; recording it done moves the due date on one quarter and logs it.
 * - Admin reports a reportable diesel spill with no agency notice and adds a corrective action. Closing is refused
 *   until the notice is recorded and the Corrective Action is done; then it closes.
 * - Admin records a large quantity generator shipment 50 days old: the exception report is due; recording it
 *   clears the alert. The environmental events report is in the report catalog.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s17-environmental.spec.cjs --reporter=line --workers=1
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
const LOCATION = '20000000-0000-4000-8000-000000000300'
const OWNER_PERSON = '60000000-0000-4000-8000-000000003002'
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')
const PERMIT = `S17 Title V permit ${RUN}`
const OBLIGATION = `S17 quarterly emissions report ${RUN}`
const MANIFEST = String(Date.now()).slice(-9) + 'JJK'
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const localNow = offsetMinutes => {
  const date = new Date(Date.now() + offsetMinutes * 60000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fixture = {}

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
  await page.context().clearCookies()
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

test.afterAll(async () => {
  if (fixture.eventId) {
    const actions = await rest(`/rest/v1/forge_env_event_actions?event_id=eq.${fixture.eventId}&select=capa_id`).catch(() => [])
    for (const row of actions || []) if (row.capa_id) await rest(`/rest/v1/forge_corrective_actions?id=eq.${row.capa_id}`, { method: 'PATCH', body: { archived_at: new Date().toISOString() } }).catch(() => {})
    await rest(`/rest/v1/forge_env_events?id=eq.${fixture.eventId}`, { method: 'DELETE' }).catch(() => {})
  }
  if (fixture.permitId) await rest(`/rest/v1/forge_env_permits?id=eq.${fixture.permitId}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_env_waste_shipments?manifest_number=eq.${MANIFEST}`, { method: 'DELETE' }).catch(() => {})
})

test('an employee without environmental permissions is kept out', async ({ page }) => {
  await login(page, 'user@forge2.local')
  for (const url of ['/environmental', '/environmental/events/new', '/environmental/permits', '/environmental/waste']) {
    await open(page, url)
    await expect(page).not.toHaveURL(new RegExp('/environmental'))
  }
})

test('a permit with an overdue obligation; recording it moves the due date on a quarter', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/environmental/permits/new')
  let form = page.locator('[data-form="permit"]')
  await form.locator('input[name="title"]').fill(PERMIT)
  await form.locator('select[name="permitType"]').selectOption('air')
  await form.locator('input[name="agency"]').fill('LDEQ')
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('A permit in force needs its number.')).toBeVisible()
  await form.locator('input[name="permitNumber"]').fill('TV-' + RUN)
  await form.locator('input[name="expiresOn"]').fill(day(60))
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/environmental\/permits\/[0-9a-f-]{36}$/)
  fixture.permitId = page.url().split('/').pop()
  await expect(page.locator('[data-permit-page] [data-permit-state]')).toHaveText('Expiring soon')

  await page.getByRole('link', { name: 'Add obligation' }).click()
  form = page.locator('[data-form="obligation"]')
  await form.locator('input[name="title"]').fill(OBLIGATION)
  await form.locator('select[name="obligationType"]').selectOption('report')
  await form.locator('select[name="frequency"]').selectOption('quarterly')
  await form.locator('input[name="nextDueOn"]').fill(day(-5))
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/environmental\/obligations\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-obligation-page] [data-obligation-state]')).toHaveText(/Overdue since/)

  await open(page, '/environmental')
  await expect(page.locator('[data-overview="obligations"]')).toContainText(OBLIGATION)
  await expect(page.locator('[data-overview="permits"]')).toContainText(PERMIT)

  await page.locator('[data-overview="obligations"]').getByRole('link', { name: OBLIGATION }).click()
  await page.waitForURL(/\/environmental\/obligations\//)
  form = page.locator('[data-form="completion"]')
  await form.locator('select[name="result"]').selectOption('issue')
  await form.getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Describe the problem that was found.')).toBeVisible()
  await form.locator('textarea[name="notes"]').fill('Submitted two days late')
  await form.getByRole('button', { name: 'Record' }).click()
  await expect(page.locator('[data-completions] [data-completion]')).toHaveCount(1)
  await expect(page.locator('[data-completions]')).toContainText('Problem found')
  await expect(page.locator('[data-obligation-page] [data-obligation-state]')).not.toHaveText(/Overdue/)
})

test('a reportable spill closes only with the agency notice and its corrective action done', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/environmental/events/new')
  const form = page.locator('[data-form="event"]')
  await form.locator('select[name="eventType"]').selectOption('spill_release')
  await form.locator('input[name="occurredAt"]').fill(localNow(-60))
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('input[name="substance"]').fill('Diesel fuel')
  await form.locator('input[name="quantity"]').fill('15')
  await form.locator('select[name="unit"]').selectOption('gal')
  await form.locator('textarea[name="description"]').fill(`S17 tank overfill at the fuel island ${RUN}`)
  await form.getByRole('button', { name: 'Record event' }).click()
  await expect(page.getByText('Say where the spill or release went.')).toBeVisible()
  await form.locator('input[name="media"][value="soil"]').check()
  await form.locator('input[name="reportable"]').check()
  await form.getByRole('button', { name: 'Record event' }).click()
  await page.waitForURL(/\/environmental\/events\/[0-9a-f-]{36}$/)
  fixture.eventId = page.url().split('/').pop()
  await expect(page.locator('[data-agency-notice]')).toHaveText('Reportable: agency notice not recorded')

  const action = page.locator('[data-form="event-action"]')
  await action.locator('input[name="title"]').fill('Excavate the stained soil')
  await action.locator('select[name="ownerPersonnelId"]').selectOption(OWNER_PERSON)
  await action.locator('input[name="dueOn"]').fill(day(7))
  await action.getByRole('button', { name: 'Add' }).click()
  await expect(page.locator('[data-event-action="Excavate the stained soil"]')).toContainText(/open/)
  await expect(page.locator('[data-event-blockers]')).toContainText('agency notice is not recorded')

  page.once('dialog', dialog => dialog.accept(''))
  await page.getByRole('button', { name: 'Close event' }).click()
  await expect(page.getByText(/Not ready to close/).first()).toBeVisible()

  // The refusal toast sits over the header links; open the edit page directly.
  await open(page, `/environmental/events/${fixture.eventId}/edit`)
  const edit = page.locator('[data-form="event"]')
  await expect(edit.locator('input[name="occurredAt"]')).not.toHaveValue(/Z|\+/)
  await edit.locator('input[name="agencyName"]').fill('National Response Center')
  await edit.locator('input[name="agencyNotifiedAt"]').fill(localNow(-30))
  await edit.locator('input[name="agencyReference"]').fill('NRC-' + RUN)
  await edit.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/environmental\/events\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-agency-notice]')).toContainText('Reported to National Response Center')

  const [row] = await rest(`/rest/v1/forge_env_event_actions?event_id=eq.${fixture.eventId}&select=capa_id`)
  await rest(`/rest/v1/forge_corrective_actions?id=eq.${row.capa_id}`, { method: 'PATCH', body: { status: 'pending_verification' } })
  await open(page, '/environmental/events/' + fixture.eventId)
  await expect(page.locator('[data-event-blockers]')).toHaveCount(0)
  page.once('dialog', dialog => dialog.accept('Soil removed and disposed'))
  await page.getByRole('button', { name: 'Close event' }).click()
  await expect(page.locator('[data-event-status]')).toHaveText('Closed')
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
})

test('an old large quantity generator manifest needs an exception report, and the report is listed', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/environmental/waste/new')
  const form = page.locator('[data-form="shipment"]')
  await form.locator('input[name="manifestNumber"]').fill(MANIFEST.toLowerCase())
  await form.locator('input[name="shippedOn"]').fill(day(-50))
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('select[name="generatorStatus"]').selectOption('lqg')
  await form.locator('input[name="wasteDescription"]').fill('Spent solvent')
  await form.locator('input[name="wasteCodes"]').fill('f005, d001')
  await form.locator('input[name="quantity"]').fill('4')
  await form.locator('select[name="unit"]').selectOption('drums')
  await form.locator('input[name="transporter"]').fill('Gulf Haulers')
  await form.locator('input[name="facility"]').fill('Clean Earth TSDF')
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/environmental\/waste$/)
  const row = page.locator(`[data-shipment="${MANIFEST}"]`)
  await expect(row.locator('[data-manifest-state]')).toHaveAttribute('data-manifest-state', 'exception_overdue')
  await expect(row).toContainText('F005, D001')

  await open(page, '/environmental')
  await expect(page.locator('[data-overview="manifests"]')).toContainText(MANIFEST)

  await open(page, '/environmental/waste')
  await row.getByRole('link', { name: MANIFEST }).click()
  await page.waitForURL(/\/edit$/)
  await page.locator('[data-form="shipment"] input[name="exceptionFiledOn"]').fill(day(0))
  await page.locator('[data-form="shipment"]').getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/environmental\/waste$/)
  await expect(page.locator(`[data-shipment="${MANIFEST}"] [data-manifest-state]`)).toHaveAttribute('data-manifest-state', 'exception_filed')

  await open(page, '/reporting')
  await expect(page.getByText('Environmental events').first()).toBeVisible()
})
