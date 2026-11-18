/**
 * Port slice 11 (agent C) browser checks as admin@forge2.local: fleet maintenance, the Drivers tab and settings.
 *
 * - new maintenance from a preset with a 90-day repeat and a cost → the detail page
 * - complete it with an odometer → completed, a 'maintenance' meter reading and the vehicle's mileage updated,
 *   and the next item opened 90 days out (linked both ways)
 * - cancel the next item with a reason
 * - the list for the vehicle puts the overdue item first
 * - the Drivers tab lists a DOT company driver with their assigned vehicle
 * - settings save (restored afterwards)
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s11-maintenance.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-6) + crypto.randomBytes(2).toString('hex')
const DAY = 86_400_000
const iso = offsetDays => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)

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
const select = async query => rest('/rest/v1/' + query)

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

const fixture = { vehicleId: null, personnelId: null, companyDriverId: null, overdueId: null, createdId: null, nextId: null, settings: undefined }

test.beforeAll(async () => {
  const person = await insert('forge_personnel', { organization_id: ORG, first_name: 'Fleet', last_name: 'Driver' + RUN, employee_number: 'S11C-' + RUN, employment_status: 'active' })

  fixture.personnelId = person.id

  const roster = await insert('forge_dot_company_drivers', { organization_id: ORG, personnel_id: person.id, driver_name: `Fleet Driver${RUN}`, status: 'on_insurance', license_expires_on: iso(12) })

  fixture.companyDriverId = roster.id

  const vehicle = await insert('forge_fleet_vehicles', {
    organization_id: ORG,
    vehicle_number: 'S11C-' + RUN,
    unit_number: 'C' + RUN,
    year: 2021,
    make: 'Test',
    model: 'Hauler',
    mileage: 40000,
    assigned_driver_personnel_id: person.id
  })

  fixture.vehicleId = vehicle.id

  const overdue = await insert('forge_fleet_maintenance', {
    organization_id: ORG,
    maintenance_number: 'FM-S11C-' + RUN,
    vehicle_id: vehicle.id,
    title: 'Overdue brake check ' + RUN,
    maintenance_type: 'pm',
    status: 'open',
    due_on: iso(-5)
  })

  fixture.overdueId = overdue.id

  const settings = await select(`forge_fleet_settings?organization_id=eq.${ORG}&select=*`)

  fixture.settings = settings[0] || null
})

test.afterAll(async () => {
  if (fixture.vehicleId) {
    await rest(`/rest/v1/forge_fleet_meter_readings?vehicle_id=eq.${fixture.vehicleId}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_fleet_maintenance?vehicle_id=eq.${fixture.vehicleId}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_fleet_vehicles?id=eq.${fixture.vehicleId}`, { method: 'DELETE' }).catch(error => console.error(error.message))
  }

  if (fixture.companyDriverId) await rest(`/rest/v1/forge_dot_company_drivers?id=eq.${fixture.companyDriverId}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' }).catch(error => console.error(error.message))

  if (fixture.settings === null) await rest(`/rest/v1/forge_fleet_settings?organization_id=eq.${ORG}`, { method: 'DELETE' }).catch(() => {})
  else if (fixture.settings) {
    const { organization_id, ...values } = fixture.settings

    await rest(`/rest/v1/forge_fleet_settings?organization_id=eq.${organization_id}`, { method: 'PATCH', body: values }).catch(() => {})
  }
})

test('schedule maintenance from a preset with a 90-day repeat', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/fleet/maintenance/new?vehicle=${fixture.vehicleId}`)

  await expect(page.locator('#fm-vehicle')).toHaveValue(fixture.vehicleId)
  await page.locator('[data-preset="Oil and filter change"]').click()
  await expect(page.locator('#fm-title')).toHaveValue('Oil and filter change')
  await page.locator('#fm-title').fill('Oil and filter change ' + RUN)
  await page.locator('#fm-due-on').fill(iso(10))
  await page.locator('#fm-vendor').fill('Corner Garage')
  await page.locator('#fm-cost').fill('49.99')
  await page.locator('#fm-repeat-days').fill('90')
  await page.getByRole('button', { name: 'Schedule Maintenance' }).click()
  await page.waitForURL(url => /\/fleet\/maintenance\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })

  fixture.createdId = page.url().split('/').pop()

  const [record] = await select(`forge_fleet_maintenance?id=eq.${fixture.createdId}&select=*`)

  expect(record).toMatchObject({ vehicle_id: fixture.vehicleId, status: 'open', maintenance_type: 'pm', repeat_days: 90, cost_cents: 4999, due_on: iso(10), vendor: 'Corner Garage' })
  expect(record.maintenance_number).toMatch(/^FM-\d{4}-\d{6}$/)
  await expect(page.locator('[data-maintenance-status="open"]')).toContainText('Oil and filter change ' + RUN)

  const activity = await select(`forge_fleet_activity?vehicle_id=eq.${fixture.vehicleId}&activity_type=eq.maintenance_scheduled&select=id`)

  expect(activity.length).toBeGreaterThan(0)
})

test('complete it with an odometer: meter reading written and the next item opened', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/fleet/maintenance/${fixture.createdId}`)

  await page.locator('#fm-completed-on').fill(iso(0))
  await page.locator('#fm-completed-mileage').fill('40500')
  await page.locator('#fm-completed-cost').fill('52.10')
  await page.locator('#fm-completed-notes').fill('Changed oil and filter.')
  await page.getByRole('button', { name: 'Mark Complete' }).click()
  await expect(page.locator('[data-maintenance-status="completed"]')).toBeVisible({ timeout: 60000 })

  const [record] = await select(`forge_fleet_maintenance?id=eq.${fixture.createdId}&select=*`)

  expect(record).toMatchObject({ status: 'completed', completed_on: iso(0), completed_mileage: 40500, cost_cents: 5210 })

  const readings = await select(`forge_fleet_meter_readings?vehicle_id=eq.${fixture.vehicleId}&select=meter,value,source,source_record_id`)

  expect(readings).toEqual([{ meter: 'mileage', value: 40500, source: 'maintenance', source_record_id: fixture.createdId }])

  const [vehicle] = await select(`forge_fleet_vehicles?id=eq.${fixture.vehicleId}&select=mileage`)

  expect(vehicle.mileage).toBe(40500)

  const next = await select(`forge_fleet_maintenance?repeated_from_id=eq.${fixture.createdId}&select=*`)

  expect(next).toHaveLength(1)
  expect(next[0]).toMatchObject({ status: 'open', due_on: iso(90), repeat_days: 90, title: 'Oil and filter change ' + RUN, vendor: 'Corner Garage', cost_cents: null })

  fixture.nextId = next[0].id
  await expect(page.locator(`[data-next-maintenance="${next[0].maintenance_number}"]`)).toBeVisible()
})

test('cancel the next item with a reason', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/fleet/maintenance/${fixture.nextId}`)

  await expect(page.locator('[data-previous-maintenance]')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel This Item' }).click()
  await page.getByRole('button', { name: 'Confirm Cancel' }).click()
  await expect(page.getByText('Say why it is canceled.')).toBeVisible()
  await page.locator('#fm-cancel-reason').fill('Vehicle is being sold')
  await page.getByRole('button', { name: 'Confirm Cancel' }).click()
  await expect(page.locator('[data-maintenance-status="canceled"]')).toBeVisible({ timeout: 60000 })

  const [record] = await select(`forge_fleet_maintenance?id=eq.${fixture.nextId}&select=status,notes`)

  expect(record.status).toBe('canceled')
  expect(record.notes).toContain('Canceled: Vehicle is being sold')
})

test('the list puts the overdue item first', async ({ page }) => {
  // One more open item due later, so the order is meaningful.
  await insert('forge_fleet_maintenance', {
    organization_id: ORG,
    maintenance_number: 'FM-S11C-L' + RUN,
    vehicle_id: fixture.vehicleId,
    title: 'Later tire rotation ' + RUN,
    maintenance_type: 'tires',
    status: 'open',
    due_on: iso(60)
  })

  await login(page, 'admin@forge2.local')
  await open(page, `/fleet/maintenance?vehicle=${fixture.vehicleId}`)

  const rows = page.locator('tr[data-maintenance]')

  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toHaveAttribute('data-maintenance', 'FM-S11C-' + RUN)
  await expect(rows.first()).toHaveAttribute('data-due-state', 'overdue')
  await expect(rows.nth(1)).toHaveAttribute('data-due-state', 'scheduled')

  await open(page, `/fleet/maintenance?vehicle=${fixture.vehicleId}&status=all`)
  await expect(page.locator('tr[data-maintenance]')).toHaveCount(4)

  await open(page, `/fleet/maintenance?vehicle=${fixture.vehicleId}&due=overdue`)
  await expect(page.locator('tr[data-maintenance]')).toHaveCount(1)
})

test('the Drivers tab lists the company driver with their vehicle', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/fleet/drivers')

  const row = page.locator(`tr[data-fleet-driver="Fleet Driver${RUN}"]`)

  await expect(row).toBeVisible()
  await expect(row.locator(`[data-driver-vehicle="${fixture.vehicleId}"]`)).toBeVisible()
  await expect(row.getByRole('link', { name: 'Company driver' })).toHaveAttribute('href', `/dot/company-drivers/${fixture.companyDriverId}`)
  await expect(row.locator('[data-expiry="expiring"]').first()).toBeVisible()

  await open(page, '/fleet/drivers?vehicle=1')
  await expect(page.locator(`tr[data-fleet-driver="Fleet Driver${RUN}"]`)).toBeVisible()
})

test('fleet settings save', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/fleet/settings')

  await page.locator('#fleet-warning-days').fill('45')
  await page.locator('#fleet-retention-days').fill('30')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.getByText('Federal rules require at least 91 days (up to 3650).')).toBeVisible()

  await page.locator('#fleet-retention-days').fill('120')
  await page.locator('#fleet-defect-repair').uncheck()
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.getByText('Fleet settings saved.')).toBeVisible({ timeout: 60000 })

  const [settings] = await select(`forge_fleet_settings?organization_id=eq.${ORG}&select=*`)

  expect(settings).toMatchObject({ renewal_warning_days: 45, dvir_retention_days: 120, defect_opens_repair: false })

  const audit = await select(`forge_creator_audit_log?organization_id=eq.${ORG}&action=eq.fleet.settings_saved&order=created_at.desc&limit=1&select=after_value`)

  expect(audit[0].after_value.renewal_warning_days).toBe(45)
})
