/**
 * Port slice 10 browser checks: the public scan menu (/scan/<token>).
 *
 * - /q/<token> on a scan-menu QR lands on /scan/<token>
 * - a wrong employee number shows the generic error; the right one identifies the employee
 * - the employee marks the asset out of service with a reason: the header turns red and a status history
 *   row is written; return to service is not offered to employees (employeeReturnToService is off)
 * - admin@forge2.local, signed in, returns it to service; the history page lists both changes
 * - a signed-in-only QR asks an anonymous visitor to sign in
 * - rate limit: after 8 wrong numbers even the right one is refused (separate QR, cleaned up after)
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s10-scan-menu.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-7) + crypto.randomBytes(2).toString('hex')

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

const insert = async (table, body) => (await rest('/rest/v1/' + table, { method: 'POST', body }))[0]

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const newToken = () => crypto.randomBytes(24).toString('hex')

const fixture = { assetId: null, personnelId: null, employeeNumber: 'S10-' + RUN, qrs: {} }

const makeQr = async (key, accessMode, extra = {}) => {
  const token = newToken()
  const row = await insert('forge_qr_codes', {
    organization_id: ORG,
    qr_number: `QR-S10${key.toUpperCase()}-${RUN}`,
    token,
    name: `S10 ${key} ${RUN}`,
    target_type: 'asset',
    target_id: fixture.assetId,
    default_action: 'scan_menu',
    access_mode: accessMode,
    action_config: { reportIssue: true, markOutOfService: true, returnToService: true, employeeReturnToService: false, history: true, lotoView: true },
    ...extra
  })

  fixture.qrs[key] = { id: row.id, token }

  return fixture.qrs[key]
}

/** Submits the employee-number form and waits for the server action to answer. */
const identify = async (page, number) => {
  await page.getByLabel('Enter your employee number').fill(number)
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/scan/')),
    page.getByTestId('scan-identify').getByRole('button', { name: 'Continue' }).click()
  ])
}

test.beforeAll(async () => {
  const asset = await insert('forge_assets', { organization_id: ORG, asset_number: 'S10-' + RUN, name: `S10 Forklift ${RUN}`, status: 'active' })

  fixture.assetId = asset.id

  const person = await insert('forge_personnel', {
    organization_id: ORG,
    first_name: 'Scan',
    last_name: 'Tester' + RUN,
    employee_number: fixture.employeeNumber,
    employment_status: 'active'
  })

  fixture.personnelId = person.id

  await makeQr('main', 'employee_number')
  await makeQr('signin', 'signed_in')
  await makeQr('limit', 'employee_number')
})

test.afterAll(async () => {
  const qrIds = Object.values(fixture.qrs).map(qr => qr.id)

  try {
    if (qrIds.length) {
      await rest(`/rest/v1/forge_qr_scan_rate_limits?qr_code_id=in.(${qrIds.join(',')})`, { method: 'DELETE' })
      await rest(`/rest/v1/forge_qr_codes?id=in.(${qrIds.join(',')})`, { method: 'DELETE' })
    }

    if (fixture.assetId) {
      await rest(`/rest/v1/forge_asset_activity?asset_id=eq.${fixture.assetId}`, { method: 'DELETE' })
      await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'DELETE' })
    }

    if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' })
  } catch (error) {
    console.warn('cleanup failed:', error.message)
  }
})

test('employee scans, identifies and marks the asset out of service; return to service is not offered', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const { token, id: qrId } = fixture.qrs.main

  // /q/<token> redirects to the scan menu (the redirect origin is NEXT_PUBLIC_APP_URL, so only the path is checked).
  const redirect = await page.request.get(baseURL + '/q/' + token, { maxRedirects: 0 })

  expect(redirect.status()).toBe(307)
  expect(new URL(redirect.headers().location).pathname).toBe('/scan/' + token)

  await open(page, '/scan/' + token)

  await expect(page.getByTestId('scan-target-name')).toHaveText(`S10 Forklift ${RUN}`)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'anonymous')
  await expect(page.getByTestId('scan-action-out_of_service')).toHaveAttribute('data-locked', 'identify')
  await expect(page.getByTestId('scan-action-open_record')).toHaveAttribute('data-locked', 'sign_in')

  // The page logs one 'open' event.
  await expect.poll(async () => (await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qrId}&action=eq.open&select=id`)).length).toBe(1)

  await identify(page, 'WRONG-' + RUN)
  await expect(page.getByTestId('scan-identify-error')).toHaveText('That employee number was not recognized.')

  await identify(page, fixture.employeeNumber)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'employee')
  await expect(page.getByTestId('scan-employee')).toContainText(`Scan Tester${RUN}`)
  await expect(page.getByTestId('scan-action-out_of_service')).not.toHaveAttribute('data-locked', /.+/)

  await page.getByTestId('scan-action-out_of_service').click()
  const form = page.getByTestId('scan-oos-form')

  await form.getByRole('button', { name: 'Mark out of service' }).click()
  await expect(form.getByRole('alert')).toHaveText('Enter the reason it is out of service.')

  await form.getByLabel('What is wrong? (required)').fill('Brake pedal soft')
  await form.getByLabel('Notes (optional)').fill('Parked in bay 3')
  await form.getByRole('button', { name: 'Mark out of service' }).click()

  await expect(page.getByTestId('scan-confirmation')).toContainText('Marked out of service')
  await expect(page.getByTestId('scan-asset-status')).toHaveAttribute('data-status', 'out_of_service')
  await expect(page.getByTestId('scan-asset-status')).toHaveText('OUT OF SERVICE — DO NOT USE')
  await expect(page.getByTestId('scan-action-return_to_service')).toHaveCount(0)
  await expect(page.getByTestId('scan-action-out_of_service')).toHaveCount(0)

  const history = await rest(`/rest/v1/forge_asset_status_history?asset_id=eq.${fixture.assetId}&select=*`)

  expect(history).toHaveLength(1)
  expect(history[0]).toMatchObject({
    from_status: 'active',
    to_status: 'out_of_service',
    reason: 'Brake pedal soft',
    notes: 'Parked in bay 3',
    source: 'qr_scan',
    qr_code_id: qrId,
    actor_personnel_id: fixture.personnelId
  })

  // Employees see history with names but no links into Forge.
  await page.getByTestId('scan-action-history').click()
  await page.waitForURL(url => url.pathname === `/scan/${token}/history`)
  await expect(page.getByTestId('scan-history-row').filter({ hasText: 'Marked out of service' })).toContainText(`Scan Tester${RUN}`)
  await expect(page.getByTestId('scan-history').locator('a')).toHaveCount(0)

  // Sign out returns to the identify panel.
  await open(page, '/scan/' + token)
  await page.getByTestId('scan-employee').getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByTestId('scan-identify')).toBeVisible()
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'anonymous')

  // History now redirects to the identify panel with ?next=history.
  await page.goto(baseURL + `/scan/${token}/history`)
  await page.waitForURL(url => url.pathname === '/scan/' + token && url.searchParams.get('next') === 'history')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('scan-identify')).toContainText('Then you can see the equipment history.')
  await identify(page, fixture.employeeNumber)
  await page.waitForURL(url => url.pathname === `/scan/${token}/history`)

  await context.close()
})

test('a signed-in admin returns the asset to service and sees both changes in history', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const { token } = fixture.qrs.main

  await login(page, 'admin@forge2.local')
  await open(page, '/scan/' + token)

  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'user')
  await expect(page.getByTestId('scan-identify')).toHaveCount(0)
  await page.getByTestId('scan-action-return_to_service').click()
  await page.getByTestId('scan-rts-form').getByLabel('Notes (optional)').fill('Brakes bled and tested')
  await page.getByTestId('scan-rts-form').getByRole('button', { name: 'Return to service' }).click()

  await expect(page.getByTestId('scan-confirmation')).toContainText('Returned to service')
  await expect(page.getByTestId('scan-asset-status')).toHaveAttribute('data-status', 'active')
  await expect(page.getByTestId('scan-action-out_of_service')).toBeVisible()

  const history = await rest(`/rest/v1/forge_asset_status_history?asset_id=eq.${fixture.assetId}&select=to_status,actor_user_id,notes&order=changed_at.asc`)

  expect(history.map(row => row.to_status)).toEqual(['out_of_service', 'active'])
  expect(history[1].actor_user_id).toBeTruthy()
  expect(history[1].notes).toBe('Brakes bled and tested')

  await open(page, `/scan/${token}/history`)
  const rows = page.locator('[data-testid="scan-history-row"][data-kind="status"]')

  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Returned to service' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Marked out of service' })).toContainText('Reason: Brake pedal soft')

  // Newest first.
  const titles = await page.locator('[data-testid="scan-history-row"][data-kind="status"] p.font-semibold').allTextContents()

  expect(titles).toEqual(['Returned to service', 'Marked out of service'])

  await context.close()
})

test('a signed-in-only QR asks an anonymous visitor to sign in', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const { token } = fixture.qrs.signin

  await open(page, '/scan/' + token)
  await expect(page.getByTestId('scan-identify')).toHaveCount(0)
  await expect(page.getByTestId('scan-sign-in-required')).toBeVisible()
  await expect(page.getByTestId('scan-sign-in-required').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/auth/login?next=' + encodeURIComponent('/scan/' + token)
  )
  await expect(page.getByTestId('scan-action-report_issue')).toHaveAttribute('data-locked', 'sign_in')

  // History on a signed-in-only QR goes to sign-in.
  await page.goto(baseURL + `/scan/${token}/history`)
  await page.waitForURL(url => url.pathname === '/auth/login')

  await context.close()
})

test('after 8 wrong employee numbers even the right one is refused', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const { token, id } = fixture.qrs.limit

  try {
    await open(page, '/scan/' + token)

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await identify(page, `BAD-${RUN}-${attempt}`)
      await expect(page.getByTestId('scan-identify-error')).toHaveText('That employee number was not recognized.')
    }

    await identify(page, fixture.employeeNumber)
    await expect(page.getByTestId('scan-identify-error')).toContainText('Too many attempts')
    await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'anonymous')
  } finally {
    await rest(`/rest/v1/forge_qr_scan_rate_limits?qr_code_id=eq.${id}`, { method: 'DELETE' })
    await context.close()
  }
})
