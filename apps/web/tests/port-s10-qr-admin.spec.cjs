/**
 * Port slice 10, agent A browser checks: the QR Links admin side.
 *
 * - admin@forge2.local creates an asset QR that opens the scan menu, uses employee numbers and has a daily
 *   inspection template; the detail page shows that setup and the "Preview scan menu" link.
 * - Editing the scan settings (employees can return to service, weekly template, no issue reports) is saved,
 *   shown, and audited (qr.updated with changed fields).
 * - A location QR and a form QR are created (scan menu only) and the list shows their targets.
 * - The detail page shows the 30-day summary and the upgraded scan log.
 * - The asset page shows the service status history row written by forge_set_asset_service_status and
 *   lists the asset's QR codes.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s10-qr-admin.spec.cjs --reporter=line --workers=1
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
const LOCATION = '20000000-0000-4000-8000-000000000300'
const RUN = Date.now().toString().slice(-6)

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

const login = async page => {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill('admin@forge2.local')
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const fixture = {}

const qrRow = async id => (await rest(`/rest/v1/forge_qr_codes?id=eq.${id}&select=*`))[0]

const saveAndOpenNewQr = async page => {
  await page.getByRole('button', { name: /Save QR Code/i }).click()
  await page.waitForURL(url => /^\/qr\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  await page.waitForLoadState('networkidle')

  return new URL(page.url()).pathname.split('/').pop()
}

test.beforeAll(async () => {
  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `S10A-${RUN}`, name: `S10A Lift ${RUN}`, status: 'active', location_id: LOCATION, created_by: ADMIN, updated_by: ADMIN }
  })
  fixture.asset = asset

  const templates = await rest(`/rest/v1/forge_inspection_templates?organization_id=eq.${ORG}&is_active=eq.true&select=id,name&order=name&limit=2`)
  fixture.daily = templates[0]
  fixture.weekly = templates[1] || templates[0]

  const [form] = await rest('/rest/v1/forge_form_templates', {
    method: 'POST',
    body: { organization_id: ORG, title: `S10A Pre-use form ${RUN}`, status: 'active', current_version: 1, schema: { fields: [] }, created_by: ADMIN, updated_by: ADMIN }
  })
  fixture.form = form

  const [location] = await rest(`/rest/v1/locations?id=eq.${LOCATION}&select=id,name`)
  fixture.location = location
})

test('create an asset QR with the scan menu, employee numbers and a daily inspection', async ({ page }) => {
  await login(page)
  await open(page, `/qr/create?asset=${fixture.asset.id}`)

  await page.getByLabel('QR Name').fill(`S10A asset QR ${RUN}`)
  await expect(page.getByLabel('QR target')).toHaveValue(fixture.asset.id)
  await expect(page.getByLabel('Default Action')).toHaveValue('scan_menu')
  await page.getByRole('radio', { name: /Employee number or sign-in/ }).check()
  await page.locator('#qr-inspection-daily').selectOption(fixture.daily.id)

  fixture.assetQrId = await saveAndOpenNewQr(page)

  const row = await qrRow(fixture.assetQrId)
  expect(row.target_type).toBe('asset')
  expect(row.default_action).toBe('scan_menu')
  expect(row.access_mode).toBe('employee_number')
  expect(row.action_config.inspectionTemplates).toEqual({ daily: fixture.daily.id })
  expect(row.action_config.employeeReturnToService).toBe(false)
  fixture.assetQr = row

  await expect(page.locator('[data-qr-access-mode]')).toHaveText('Employee number or sign-in')
  await expect(page.locator('[data-qr-inspections]')).toContainText('Daily: ' + fixture.daily.name)
  await expect(page.locator('[data-qr-enabled-actions]')).toContainText('Report an issue')
  await expect(page.getByRole('link', { name: /Preview scan menu/ })).toHaveAttribute('href', '/scan/' + row.token)
  await expect(page.getByText('/q/' + row.token)).toBeVisible()
})

test('edit the scan settings; saved, shown and audited', async ({ page }) => {
  await login(page)
  await open(page, '/qr/' + fixture.assetQrId)

  await page.getByRole('checkbox', { name: /Employees can return to service/ }).check()
  await page.getByRole('checkbox', { name: /Report an issue/ }).uncheck()
  await page.locator('#qr-inspection-weekly').selectOption(fixture.weekly.id)
  await page.getByRole('checkbox', { name: fixture.form.title }).check()
  await page.getByRole('button', { name: /Save QR Code/i }).click()

  await expect.poll(async () => (await qrRow(fixture.assetQrId)).action_config.employeeReturnToService, { timeout: 30000 }).toBe(true)

  const row = await qrRow(fixture.assetQrId)
  expect(row.action_config.reportIssue).toBe(false)
  expect(row.action_config.inspectionTemplates).toEqual({ daily: fixture.daily.id, weekly: fixture.weekly.id })
  expect(row.action_config.formTemplateIds).toEqual([fixture.form.id])

  const audits = await rest(`/rest/v1/forge_creator_audit_log?entity_id=eq.${fixture.assetQrId}&action=eq.qr.updated&select=after_value&order=created_at.desc&limit=1`)
  expect(audits[0].after_value.changed_fields).toContain('action_config')
  expect(audits[0].after_value.action_config.employeeReturnToService).toBe(true)

  await open(page, '/qr/' + fixture.assetQrId)
  await expect(page.locator('[data-qr-enabled-actions]')).toContainText('Employees can return to service')
  await expect(page.locator('[data-qr-enabled-actions]')).not.toContainText('Report an issue')
  await expect(page.locator('[data-qr-enabled-actions]')).toContainText('1 linked form')
  await expect(page.locator('[data-qr-inspections]')).toContainText('Weekly: ' + fixture.weekly.name)
})

test('create a location QR and a form QR; the list shows their targets', async ({ page }) => {
  await login(page)

  await open(page, '/qr/create')
  await page.getByLabel('QR Name').fill(`S10A location QR ${RUN}`)
  await page.getByLabel('QR points to').selectOption('location')
  await page.getByLabel('QR target').selectOption(LOCATION)
  await expect(page.getByLabel('Default Action').locator('option')).toHaveText(['Select...', /Scan Action Menu/])
  await page.getByRole('radio', { name: /Anyone can report an issue/ }).check()
  fixture.locationQrId = await saveAndOpenNewQr(page)

  let row = await qrRow(fixture.locationQrId)
  expect([row.target_type, row.target_id, row.default_action, row.access_mode]).toEqual(['location', LOCATION, 'scan_menu', 'public_report'])
  await expect(page.locator('[data-qr-target]')).toContainText('Location: ' + fixture.location.name)
  // Equipment-only toggles are not offered for a location.
  await expect(page.getByRole('checkbox', { name: /Mark out of service/ })).toHaveCount(0)

  await open(page, '/qr/create')
  await page.getByLabel('QR Name').fill(`S10A form QR ${RUN}`)
  await page.getByLabel('QR points to').selectOption('form')
  await page.getByLabel('QR target').selectOption(fixture.form.id)
  fixture.formQrId = await saveAndOpenNewQr(page)

  row = await qrRow(fixture.formQrId)
  expect([row.target_type, row.target_id, row.default_action]).toEqual(['form', fixture.form.id, 'scan_menu'])
  await expect(page.locator('[data-qr-target]')).toContainText('Form: ' + fixture.form.title)
  await expect(page.locator('#qr-inspection-daily')).toHaveCount(0)

  await open(page, '/qr')
  await page.getByPlaceholder('Search QR codes...').fill(`S10A`)
  const locationRow = page.getByRole('row').filter({ hasText: `S10A location QR ${RUN}` })
  await expect(locationRow).toContainText(fixture.location.name)
  await expect(locationRow).toContainText('Location')
  const formRow = page.getByRole('row').filter({ hasText: `S10A form QR ${RUN}` })
  await expect(formRow).toContainText(fixture.form.title)
  await expect(page.getByRole('row').filter({ hasText: `S10A asset QR ${RUN}` })).toContainText(fixture.asset.name)
})

test('scan log and 30-day summary on the detail page', async ({ page }) => {
  const id = fixture.assetQrId

  for (const action of ['open', 'open', 'report_issue', 'out_of_service', 'inspection_start']) {
    await rest('/rest/v1/rpc/forge_record_qr_event', {
      method: 'POST',
      body: { p_qr_code_id: id, p_action: action, p_auth_user_id: ADMIN, p_record_type: action === 'open' ? null : 'asset', p_record_id: action === 'open' ? null : fixture.asset.id }
    })
  }
  await rest('/rest/v1/rpc/forge_record_qr_event', { method: 'POST', body: { p_qr_code_id: id, p_action: 'identify', p_result: 'denied' } })

  await login(page)
  await open(page, '/qr/' + id)

  const summary = page.locator('[data-qr-scan-summary]')
  await expect(summary.locator('div.rounded-lg', { hasText: /^Scans/ })).toContainText('2')
  await expect(summary.locator('div.rounded-lg', { hasText: 'Issues reported' })).toContainText('1')
  await expect(summary.locator('div.rounded-lg', { hasText: 'Marked out of service' })).toContainText('1')
  await expect(summary.locator('div.rounded-lg', { hasText: 'Inspections started' })).toContainText('1')

  const log = page.locator('[data-qr-scan-log]')
  await expect(log).toContainText('Issue reported')
  await expect(log).toContainText('Opened scan menu')
  await expect(log).toContainText('Denied')
  await expect(log.getByRole('link', { name: 'Asset' }).first()).toHaveAttribute('href', '/assets/' + fixture.asset.id)
})

test('asset page shows the service status history and the asset QR codes', async ({ page }) => {
  const reason = `S10A guard missing ${RUN}`

  await rest('/rest/v1/rpc/forge_set_asset_service_status', {
    method: 'POST',
    body: {
      p_organization_id: ORG,
      p_asset_id: fixture.asset.id,
      p_status: 'out_of_service',
      p_reason: reason,
      p_notes: 'Tagged at the dock',
      p_source: 'qr_scan',
      p_qr_code_id: fixture.assetQrId,
      p_actor_user_id: ADMIN,
      p_actor_name: 'S10A Tester'
    }
  })

  await login(page)
  await open(page, '/assets/' + fixture.asset.id)

  const history = page.locator('[data-asset-status-history]')
  const row = history.getByRole('row').filter({ hasText: reason })
  await expect(row).toContainText(/Out of service/i)
  await expect(row).toContainText('Tagged at the dock')
  await expect(row).toContainText('QR scan')
  await expect(row).toContainText('S10A Tester')
  await expect(row.getByRole('link', { name: fixture.assetQr.qr_number })).toHaveAttribute('href', '/qr/' + fixture.assetQrId)

  const codes = page.locator('[data-asset-qr-codes]')
  await expect(codes.getByRole('link', { name: new RegExp(fixture.assetQr.qr_number) })).toHaveAttribute('href', '/qr/' + fixture.assetQrId)
  await expect(codes).toContainText('Opens the scan menu')
})
