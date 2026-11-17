/**
 * Port slice 8 (piece E) browser checks: CAPA reports. The list links to Reports; a custom period
 * shows opened / closed / closed-on-time % tiles and the location breakdown (open and overdue now)
 * for seeded CAPAs; the CSV download lists them with on-time Y/N. Signed-out requests get no CSV.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s8-capa-reports.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { test, expect, request: playwrightRequest } = require('@playwright/test')

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
const SITE = `S8 Report Site ${RUN}`

// A period long before any real data, so the period tiles count only the seeded CAPAs.
const FROM = '2001-01-01'
const TO = '2001-12-31'

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

const fixture = { locationId: null, capaIds: [] }

const NUMBERS = { onTime: `CA-S8-${RUN}-1`, late: `CA-S8-${RUN}-2`, overdue: `CA-S8-${RUN}-3` }

test.beforeAll(async () => {
  const [location] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG, name: SITE, code: `S8${RUN}` } })

  fixture.locationId = location.id

  const base = { organization_id: ORG, location_id: location.id, source_type: 'manual', created_by: ADMIN, action_type: 'corrective' }

  const rows = await rest('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: [
      {
        ...base,
        action_number: NUMBERS.onTime,
        title: `S8 on time ${RUN}`,
        severity: 'high',
        status: 'closed',
        created_at: '2001-03-01T12:00:00Z',
        due_at: '2001-03-20T12:00:00Z',
        closed_at: '2001-03-11T12:00:00Z',
        closed_by: ADMIN
      },
      {
        ...base,
        action_number: NUMBERS.late,
        title: `S8 late ${RUN}`,
        severity: 'moderate',
        status: 'closed',
        created_at: '2001-04-01T12:00:00Z',
        due_at: '2001-04-10T12:00:00Z',
        closed_at: '2001-04-21T12:00:00Z',
        closed_by: ADMIN
      },
      {
        ...base,
        action_number: NUMBERS.overdue,
        title: `S8 overdue ${RUN}`,
        severity: 'critical',
        status: 'in_progress',
        created_at: '2001-05-01T12:00:00Z',
        due_at: '2001-05-15T12:00:00Z'
      }
    ]
  })

  fixture.capaIds = rows.map(row => row.id)
})

test.afterAll(async () => {
  if (fixture.capaIds.length) {
    await rest(`/rest/v1/forge_corrective_actions?id=in.(${fixture.capaIds.join(',')})`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.locationId) await rest(`/rest/v1/locations?id=eq.${fixture.locationId}`, { method: 'DELETE' }).catch(() => {})
})

const tile = (page, key) => page.locator(`[data-capa-tile="${key}"] [data-capa-tile-value]`)

test('the list links to reports; a custom period shows the seeded CAPAs in tiles and breakdowns', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/corrective-actions')
  await page.getByRole('link', { name: 'Reports' }).click()
  await page.waitForURL(/\/corrective-actions\/reports$/)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-capa-report-period]')).toContainText('Last 90 days')

  // Presets switch the period.
  await page.getByRole('link', { name: 'This year' }).click()
  await expect(page.locator('[data-capa-report-period]')).toContainText('This year')

  // Custom range through the form.
  await page.locator('input[name="from"]').fill(FROM)
  await page.locator('input[name="to"]').fill(TO)
  await page.getByRole('button', { name: 'Apply custom range' }).click()
  await page.waitForURL(/preset=custom/)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-capa-report-period]')).toContainText(`${FROM} to ${TO}`)

  await expect(tile(page, 'opened')).toHaveText('3')
  await expect(tile(page, 'closed')).toHaveText('2')
  await expect(tile(page, 'on-time')).toHaveText('50%')
  // (10 + 20) / 2 days.
  await expect(tile(page, 'avg-days')).toHaveText('15')
  expect(Number(await tile(page, 'overdue-now').innerText())).toBeGreaterThanOrEqual(1)
  expect(Number(await tile(page, 'open-now').innerText())).toBeGreaterThanOrEqual(1)

  const siteRow = page.locator(`[data-capa-breakdown="location"] [data-capa-breakdown-row="${SITE}"] td`)

  await expect(siteRow).toHaveText([SITE, '3', '2', '50%', '1', '1'])

  const critical = page.locator('[data-capa-breakdown="severity"] tr', { hasText: 'Critical' }).first()

  await expect(critical).toBeVisible()
})

test('the CSV download lists the seeded CAPAs with on-time Y/N; signed out gets none', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/corrective-actions/reports?preset=custom&from=${FROM}&to=${TO}`)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download CSV' }).click()])

  expect(download.suggestedFilename()).toBe(`capa-report-${FROM}-to-${TO}.csv`)

  const csv = fs.readFileSync(await download.path(), 'utf8')
  const lines = csv.split('\r\n')

  expect(lines[0]).toBe('Number,Title,Status,Severity,Source,Owner,Location,Opened,Due,Closed,On time,Days to close')

  const row = number => lines.find(line => line.startsWith(number + ','))

  expect(row(NUMBERS.onTime)).toBe(`${NUMBERS.onTime},S8 on time ${RUN},Closed,High,Manual,,${SITE},2001-03-01,2001-03-20,2001-03-11,Y,10`)
  expect(row(NUMBERS.late)).toMatch(new RegExp(`,2001-04-10,2001-04-21,N,20$`))
  expect(row(NUMBERS.overdue)).toMatch(new RegExp(`,${SITE},2001-05-01,2001-05-15,,,$`))

  const anonymous = await playwrightRequest.newContext({ baseURL })
  const response = await anonymous.get(`/corrective-actions/reports/export?preset=custom&from=${FROM}&to=${TO}`, { maxRedirects: 0 })
  const body = await response.text()

  expect(response.headers()['content-type'] || '').not.toContain('text/csv')
  expect(body).not.toContain(NUMBERS.onTime)
  await anonymous.dispose()
})
