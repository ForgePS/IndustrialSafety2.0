/**
 * Port slice 11 browser checks: fleet vehicles as QR / scan targets.
 *
 * - An anonymous visitor on a DOT-regulated vehicle's QR sees Pre-trip / Post-trip DVIR locked behind the
 *   employee number; identifying with ?next=dvir-pre_trip forwards to /scan/<token>/dvir/pre_trip. The non-DOT
 *   vehicle's menu has no DVIR actions.
 * - The employee marks the vehicle out of service from the scan: vehicle status, forge_fleet_status_history
 *   (source qr_scan, QR, person) and the red header; the DVIR actions disappear.
 * - admin@forge2.local returns it to service; the vehicle history page lists both changes.
 * - An issue reported on the vehicle sets forge_qr_issue_reports.vehicle_id, opens a CAPA linked to the
 *   vehicle (fleet_vehicle) and, with "out of service", tags it out (source qr_issue).
 * - The admin creates a vehicle QR from /qr/create?vehicle=<id>: scan menu only, no inspection pickers or
 *   LOTO toggle, the DVIR note shows, and the QR page names the vehicle.
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s11-vehicle-scan.spec.cjs --reporter=line --workers=1
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

const fixture = { vehicles: {}, personnelId: null, employeeNumber: 'S11D-' + RUN, qrs: {}, createdQrId: null }

const makeVehicle = async (key, dotRegulated) => {
  const row = await insert('forge_fleet_vehicles', {
    organization_id: ORG,
    vehicle_number: `S11D-${key.toUpperCase()}-${RUN}`,
    unit_number: `D${key.toUpperCase()}${RUN}`,
    year: 2021,
    make: 'Freightliner',
    model: 'M2',
    dot_regulated: dotRegulated,
    status: 'active'
  })

  fixture.vehicles[key] = row

  return row
}

const makeQr = async (key, vehicleId) => {
  const token = crypto.randomBytes(24).toString('hex')
  const row = await insert('forge_qr_codes', {
    organization_id: ORG,
    qr_number: `QR-S11D${key.toUpperCase()}-${RUN}`,
    token,
    name: `S11D ${key} ${RUN}`,
    target_type: 'vehicle',
    target_id: vehicleId,
    default_action: 'scan_menu',
    access_mode: 'employee_number',
    action_config: { reportIssue: true, markOutOfService: true, returnToService: true, employeeReturnToService: false, history: true }
  })

  fixture.qrs[key] = { id: row.id, token }

  return fixture.qrs[key]
}

const identify = async (page, number) => {
  // (retried: a value typed before hydration is reset and the button stays disabled)
  await expect(async () => {
    await page.getByLabel('Enter your employee number').fill(number)
    await expect(page.getByTestId('scan-identify').getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 1000 })
  }).toPass({ timeout: 30000 })
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/scan/')),
    page.getByTestId('scan-identify').getByRole('button', { name: 'Continue' }).click()
  ])
}

/** A browser context already identified as the test employee on this QR (session seeded directly). */
const employeeContext = async (browser, qr) => {
  const raw = crypto.randomBytes(32).toString('hex')

  await insert('forge_qr_scan_sessions', {
    organization_id: ORG,
    qr_code_id: qr.id,
    personnel_id: fixture.personnelId,
    session_token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
    expires_at: new Date(Date.now() + 3600000).toISOString()
  })

  const context = await browser.newContext()

  await context.addCookies([{ name: 'forge_scan_session', value: raw, domain: new URL(baseURL).hostname, path: `/scan/${qr.token}` }])

  return context
}

test.beforeAll(async () => {
  await makeVehicle('dot', true)
  await makeVehicle('local', false)

  const person = await insert('forge_personnel', {
    organization_id: ORG,
    first_name: 'Fleet',
    last_name: 'Scanner' + RUN,
    employee_number: fixture.employeeNumber,
    employment_status: 'active'
  })

  fixture.personnelId = person.id

  await makeQr('dot', fixture.vehicles.dot.id)
  await makeQr('local', fixture.vehicles.local.id)
})

test.afterAll(async () => {
  const vehicleIds = Object.values(fixture.vehicles).map(vehicle => vehicle.id)

  try {
    const qrRows = vehicleIds.length ? await rest(`/rest/v1/forge_qr_codes?target_type=eq.vehicle&target_id=in.(${vehicleIds.join(',')})&select=id`) : []
    const qrIds = qrRows.map(row => row.id)

    if (qrIds.length) {
      const reports = await rest(`/rest/v1/forge_qr_issue_reports?qr_code_id=in.(${qrIds.join(',')})&select=id,corrective_action_id`)

      for (const report of reports) {
        await rest(`/rest/v1/forge_notification_events?source_module=eq.qr_management&payload->>report_id=eq.${report.id}`, { method: 'DELETE' }).catch(() => {})

        if (report.corrective_action_id) {
          await rest(`/rest/v1/forge_record_links?source_resource_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
          await rest(`/rest/v1/forge_record_links?target_resource_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
          await rest(`/rest/v1/forge_tasks?source_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
          await rest(`/rest/v1/forge_corrective_actions?id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
        }
      }

      await rest(`/rest/v1/forge_qr_issue_uploads?qr_code_id=in.(${qrIds.join(',')})`, { method: 'DELETE' }).catch(() => {})
      await rest(`/rest/v1/forge_qr_issue_reports?qr_code_id=in.(${qrIds.join(',')})`, { method: 'DELETE' })
      await rest(`/rest/v1/forge_qr_scan_rate_limits?qr_code_id=in.(${qrIds.join(',')})`, { method: 'DELETE' })
      await rest(`/rest/v1/forge_qr_codes?id=in.(${qrIds.join(',')})`, { method: 'DELETE' })
    }

    if (vehicleIds.length) await rest(`/rest/v1/forge_fleet_vehicles?id=in.(${vehicleIds.join(',')})`, { method: 'DELETE' })
    if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' })
  } catch (error) {
    console.warn('cleanup failed:', error.message)
  }
})

test('DOT vehicle: identify from ?next=dvir-pre_trip goes to the DVIR; the non-DOT vehicle has no DVIR', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const dot = fixture.qrs.dot

  // The sticker URL lands on the scan menu.
  const redirect = await page.request.get(baseURL + '/q/' + dot.token, { maxRedirects: 0 })

  expect(redirect.status()).toBe(307)
  expect(new URL(redirect.headers().location).pathname).toBe('/scan/' + dot.token)

  await open(page, '/scan/' + dot.token)
  await expect(page.getByTestId('scan-target-name')).toHaveText(`Unit DDOT${RUN} · 2021 Freightliner M2`)
  await expect(page.getByTestId('scan-asset-status')).toHaveText('In service')
  await expect(page.getByTestId('scan-action-dvir_pre_trip')).toHaveAttribute('data-locked', 'identify')
  await expect(page.getByTestId('scan-action-dvir_post_trip')).toHaveAttribute('data-locked', 'identify')
  await expect(page.getByTestId('scan-action-open_record')).toHaveAttribute('data-locked', 'sign_in')
  await expect(page.locator('[data-testid^="scan-action-inspect_"]')).toHaveCount(0)
  await expect(page.getByTestId('scan-action-view_loto')).toHaveCount(0)

  // Tapping a locked DVIR asks for the number, and the number forwards to the DVIR page.
  // (retried: a click before hydration does nothing)
  await expect(async () => {
    await page.getByTestId('scan-action-dvir_pre_trip').click()
    await expect(page.getByTestId('scan-identify')).toContainText('Then you can fill out the pre-trip DVIR.', { timeout: 2000 })
  }).toPass({ timeout: 30000 })

  await open(page, `/scan/${dot.token}?next=dvir-pre_trip`)
  await identify(page, fixture.employeeNumber)
  await page.waitForURL(url => url.pathname === `/scan/${dot.token}/dvir/pre_trip`)

  await open(page, '/scan/' + dot.token)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'employee')
  await expect(page.getByTestId('scan-action-dvir_pre_trip')).toHaveAttribute('href', `/scan/${dot.token}/dvir/pre_trip`)
  await expect(page.getByTestId('scan-action-dvir_post_trip')).toHaveAttribute('href', `/scan/${dot.token}/dvir/post_trip`)

  // Non-DOT vehicle.
  const local = fixture.qrs.local

  await open(page, '/scan/' + local.token)
  await identify(page, fixture.employeeNumber)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'employee')
  await expect(page.getByTestId('scan-action-report_issue')).toBeVisible()
  await expect(page.getByTestId('scan-action-out_of_service')).toBeVisible()
  await expect(page.getByTestId('scan-action-dvir_pre_trip')).toHaveCount(0)
  await expect(page.getByTestId('scan-action-dvir_post_trip')).toHaveCount(0)

  await context.close()
})

test('employee marks the DOT vehicle out of service; DVIR actions disappear', async ({ browser }) => {
  const qr = fixture.qrs.dot
  const vehicleId = fixture.vehicles.dot.id
  const context = await employeeContext(browser, qr)
  const page = await context.newPage()

  await open(page, '/scan/' + qr.token)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'employee')
  await page.getByTestId('scan-action-out_of_service').click()

  const form = page.getByTestId('scan-oos-form')

  await form.getByLabel('What is wrong? (required)').fill('Air leak at the brake chamber')
  await form.getByRole('button', { name: 'Mark out of service' }).click()

  await expect(page.getByTestId('scan-confirmation')).toContainText('Nobody should drive this vehicle')
  await expect(page.getByTestId('scan-asset-status')).toHaveAttribute('data-status', 'out_of_service')
  await expect(page.getByTestId('scan-asset-status')).toHaveText('OUT OF SERVICE — DO NOT USE')
  await expect(page.getByTestId('scan-header')).toHaveClass(/bg-red-600/)
  await expect(page.getByTestId('scan-action-dvir_pre_trip')).toHaveCount(0)
  await expect(page.getByTestId('scan-action-dvir_post_trip')).toHaveCount(0)
  await expect(page.getByTestId('scan-action-return_to_service')).toHaveCount(0)

  const [vehicle] = await rest(`/rest/v1/forge_fleet_vehicles?id=eq.${vehicleId}&select=status`)

  expect(vehicle.status).toBe('out_of_service')

  const history = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${vehicleId}&select=*`)

  expect(history).toHaveLength(1)
  expect(history[0]).toMatchObject({
    from_status: 'active',
    to_status: 'out_of_service',
    reason: 'Air leak at the brake chamber',
    source: 'qr_scan',
    qr_code_id: qr.id,
    actor_personnel_id: fixture.personnelId
  })

  const events = await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qr.id}&action=eq.out_of_service&select=result,record_type,record_id`)

  expect(events).toEqual([{ result: 'ok', record_type: 'vehicle', record_id: vehicleId }])

  await context.close()
})

test('admin returns the vehicle to service and the history lists both changes', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const qr = fixture.qrs.dot
  const vehicleId = fixture.vehicles.dot.id

  await login(page, 'admin@forge2.local')
  await open(page, '/scan/' + qr.token)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'user')
  await expect(page.getByTestId('scan-action-open_record')).toHaveAttribute('href', `/fleet/vehicles/${vehicleId}`)

  await page.getByTestId('scan-action-return_to_service').click()
  await page.getByTestId('scan-rts-form').getByLabel('Notes (optional)').fill('Chamber replaced')
  await page.getByTestId('scan-rts-form').getByRole('button', { name: 'Return to service' }).click()

  await expect(page.getByTestId('scan-confirmation')).toContainText('The vehicle is back in use')
  await expect(page.getByTestId('scan-asset-status')).toHaveAttribute('data-status', 'active')
  await expect(page.getByTestId('scan-action-dvir_pre_trip')).toBeVisible()

  const history = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${vehicleId}&select=to_status,source,actor_user_id,reason&order=changed_at.asc`)

  expect(history.map(row => row.to_status)).toEqual(['out_of_service', 'active'])
  expect(history[1].source).toBe('qr_scan')
  expect(history[1].actor_user_id).toBeTruthy()
  expect(history[1].reason).toBe('Chamber replaced')

  await open(page, `/scan/${qr.token}/history`)
  await expect(page.getByRole('heading', { name: 'Vehicle history' })).toBeVisible()

  const rows = page.locator('[data-testid="scan-history-row"][data-kind="status"]')

  await expect(rows).toHaveCount(2)

  const titles = await rows.locator('p.font-semibold').allTextContents()

  expect(titles).toEqual(['Returned to service', 'Marked out of service'])
  await expect(rows.filter({ hasText: 'Marked out of service' })).toContainText('Reason: Air leak at the brake chamber')
  await expect(rows.filter({ hasText: 'Marked out of service' })).toContainText(`Fleet Scanner${RUN}`)

  await context.close()
})

test('an issue reported on the vehicle sets vehicle_id, opens a linked CAPA and tags it out', async ({ browser }) => {
  const qr = fixture.qrs.local
  const vehicleId = fixture.vehicles.local.id
  const context = await employeeContext(browser, qr)
  const page = await context.newPage()

  await open(page, `/scan/${qr.token}/report`)
  await expect(page.locator('[data-testid="scan-issue-form"]')).toBeVisible()
  await expect(page.getByText('Mark this vehicle out of service')).toBeVisible()

  // (retried: input typed before hydration is reset)
  await expect(async () => {
    await page.locator('#issue-description').fill('Left mirror cracked and loose')
    await page.locator('input[name="outOfService"]').check()
    await page.waitForTimeout(1000)
    await expect(page.locator('#issue-description')).toHaveValue('Left mirror cracked and loose', { timeout: 500 })
    await expect(page.locator('input[name="outOfService"]')).toBeChecked({ timeout: 500 })
  }).toPass({ timeout: 30000 })
  await page.locator('[data-testid="scan-issue-submit"]').click()
  await expect(page.locator('[data-testid="scan-issue-done"]')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('[data-testid="scan-issue-capa"]')).toHaveText(/^CA-\d+/)
  await expect(page.locator('[data-testid="scan-issue-oos"]')).toContainText('This vehicle is now marked OUT OF SERVICE')

  const [report] = await rest(`/rest/v1/forge_qr_issue_reports?qr_code_id=eq.${qr.id}&select=*`)

  expect(report.target_type).toBe('vehicle')
  expect(report.vehicle_id).toBe(vehicleId)
  expect(report.asset_id).toBeNull()
  expect(report.marked_out_of_service).toBe(true)
  expect(report.corrective_action_id).toBeTruthy()

  const [ca] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${report.corrective_action_id}&select=*`)

  expect(ca.source_id).toBe(report.id)
  expect(ca.assigned_personnel_id).toBeNull()
  expect(ca.description).toContain('The vehicle was marked out of service with this report.')

  const links = await rest(`/rest/v1/forge_record_links?source_resource_id=eq.${report.corrective_action_id}&select=target_resource_type,target_resource_id,relationship_type`)

  expect(links).toContainEqual({ target_resource_type: 'fleet_vehicle', target_resource_id: vehicleId, relationship_type: 'equipment' })

  const [vehicle] = await rest(`/rest/v1/forge_fleet_vehicles?id=eq.${vehicleId}&select=status`)

  expect(vehicle.status).toBe('out_of_service')

  const history = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${vehicleId}&select=source,related_record_type,related_record_id,qr_code_id`)

  expect(history).toEqual([{ source: 'qr_issue', related_record_type: 'qr_issue_report', related_record_id: report.id, qr_code_id: qr.id }])

  // The issue shows on the vehicle history.
  await open(page, `/scan/${qr.token}/history`)
  await expect(page.locator('[data-testid="scan-history-row"][data-kind="issue"]')).toContainText('Issue reported')

  await context.close()
})

test('admin creates a vehicle QR from /qr/create?vehicle=<id>', async ({ page }) => {
  const vehicle = fixture.vehicles.dot

  await login(page, 'admin@forge2.local')
  await open(page, `/qr/create?vehicle=${vehicle.id}`)

  await expect(page.getByLabel('QR points to')).toHaveValue('vehicle')
  await expect(page.getByLabel('QR target')).toHaveValue(vehicle.id)
  await expect(page.getByLabel('Default Action').locator('option')).toHaveText(['Select...', /Scan Action Menu/])
  await expect(page.locator('#qr-inspection-daily')).toHaveCount(0)
  await expect(page.locator('[data-qr-vehicle-dvir-note]')).toBeVisible()
  await expect(page.getByText('Lockout / Tagout procedure')).toHaveCount(0)
  await expect(page.getByText('Vehicle history')).toBeVisible()

  await page.getByLabel('QR Name').fill(`S11D created QR ${RUN}`)
  await page.locator('input[name="qr-access-mode"][value="employee_number"]').check()
  await page.getByRole('button', { name: /Create|Save/ }).first().click()
  await page.waitForURL(url => /^\/qr\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })

  const id = new URL(page.url()).pathname.split('/').pop()
  const [row] = await rest(`/rest/v1/forge_qr_codes?id=eq.${id}&select=*`)

  expect(row).toMatchObject({ target_type: 'vehicle', target_id: vehicle.id, default_action: 'scan_menu', access_mode: 'employee_number' })
  expect(row.action_config.inspectionTemplates).toEqual({})

  await expect(page.locator('[data-qr-target]')).toContainText(`Fleet vehicle: S11D-DOT-${RUN} · Unit DDOT${RUN}`)
  await expect(page.locator('[data-qr-inspections]')).toContainText('Pre-trip and post-trip DVIRs')

  await open(page, '/qr')
  await expect(page.getByRole('row').filter({ hasText: `S11D created QR ${RUN}` })).toContainText(`Unit DDOT${RUN} · 2021 Freightliner M2`)

  // The vehicle page's QR codes card (VehicleQrCard) lists it and offers Create QR.
  await open(page, `/fleet/vehicles/${vehicle.id}`)

  const card = page.locator('[data-vehicle-qr-codes]')

  await expect(card.locator('[data-vehicle-qr-row]').filter({ hasText: `S11D created QR ${RUN}` })).toHaveCount(1)
  await expect(card.locator('[data-vehicle-create-qr]')).toHaveAttribute('href', `/qr/create?vehicle=${vehicle.id}`)
})
