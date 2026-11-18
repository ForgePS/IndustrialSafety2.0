/**
 * Port slice 11 browser checks: the vehicle registry (/fleet, /fleet/vehicles, renewals, removed, import, reports).
 *
 * As admin@forge2.local:
 * - create a vehicle with a driver and a starting mileage: a meter reading and an assignment history row are
 *   written, and the driver becomes a company driver (DOT roster row)
 * - edit it; a lower mileage is refused, then accepted as a correction
 * - out of service / return to service write status history rows
 * - upload a document and open it through the signed link
 * - remove as sold (Removed tab), then restore as inactive
 * - renewals list the vehicle (registration due in 10 days); the inventory CSV contains it
 * - CSV import: dry run saves nothing, import adds 2, a re-import adds nothing
 *
 * Run from apps/web: SMOKE_BASE_URL=http://localhost:3001 npx playwright test tests/port-s11-vehicles.spec.cjs --reporter=line --workers=1
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { test, expect: baseExpect } = require('@playwright/test')

// The dev server can take a while to re-render after router.refresh().
const expect = baseExpect.configure({ timeout: 30000 })

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

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
const randomVin = () => Array.from(crypto.randomBytes(17), byte => VIN_CHARS[byte % VIN_CHARS.length]).join('')
const isoIn = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

const fixture = { personnelId: null, employeeNumber: 'S11V-' + RUN, vehicleId: null, vehicleNumber: null, vins: [] }

const vehicle = async () => (await rest(`/rest/v1/forge_fleet_vehicles?id=eq.${fixture.vehicleId}&select=*`))[0]

test.beforeAll(async () => {
  const person = await insert('forge_personnel', {
    organization_id: ORG,
    first_name: 'Fleet',
    last_name: 'Driver' + RUN,
    employee_number: fixture.employeeNumber,
    employment_status: 'active',
    is_company_driver: false
  })

  fixture.personnelId = person.id
})

test.afterAll(async () => {
  try {
    const vehicles = await rest(`/rest/v1/forge_fleet_vehicles?organization_id=eq.${ORG}&or=(unit_number.like.S11V-${RUN}*,unit_number.like.S11I-${RUN}*)&select=id`)
    const ids = vehicles.map(row => row.id)

    if (ids.length) {
      const documents = await rest(`/rest/v1/forge_fleet_documents?vehicle_id=in.(${ids.join(',')})&select=storage_path`)

      if (documents.length) {
        await fetch(API_URL + '/storage/v1/object/forge-fleet', {
          method: 'DELETE',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: documents.map(row => row.storage_path) })
        })
      }

      await rest(`/rest/v1/forge_fleet_vehicles?id=in.(${ids.join(',')})`, { method: 'DELETE' })
    }

    if (fixture.personnelId) {
      await rest(`/rest/v1/forge_dot_company_drivers?personnel_id=eq.${fixture.personnelId}`, { method: 'DELETE' })
      await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' })
    }
  } catch (error) {
    console.warn('cleanup failed:', error.message)
  }
})

test('create, edit, meters, service status, documents, removal and restore', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/fleet/vehicles/new')

  const vin = randomVin()

  fixture.vins.push(vin)
  await page.locator('#vehicle-unit_number').fill(`S11V-${RUN}`)
  await page.locator('#vehicle-make').fill('Ford')
  await page.locator('#vehicle-model').fill('F-250')
  await page.locator('#vehicle-year').fill('2021')
  await page.locator('#vehicle-vin').fill(vin.toLowerCase())
  await page.locator('#vehicle-registration_renewal_date').fill(isoIn(10))
  await page.locator('#vehicle-driver').selectOption(fixture.personnelId)
  await page.locator('#vehicle-mileage').fill('1000')
  await page.getByRole('button', { name: 'Add vehicle' }).click()
  await page.waitForURL(url => /^\/fleet\/vehicles\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })

  fixture.vehicleId = page.url().split('/').pop()

  const created = await vehicle()

  fixture.vehicleNumber = created.vehicle_number
  expect(created).toMatchObject({ vin, mileage: 1000, assigned_driver_personnel_id: fixture.personnelId, status: 'active' })
  expect(created.vehicle_number).toMatch(/^VEH-\d{6}$/)

  const readings = await rest(`/rest/v1/forge_fleet_meter_readings?vehicle_id=eq.${fixture.vehicleId}&select=*`)

  expect(readings).toHaveLength(1)
  expect(readings[0]).toMatchObject({ meter: 'mileage', source: 'manual', is_correction: false })
  expect(Number(readings[0].value)).toBe(1000)

  const assignments = await rest(`/rest/v1/forge_fleet_assignment_history?vehicle_id=eq.${fixture.vehicleId}&select=*`)

  expect(assignments).toHaveLength(1)
  expect(assignments[0]).toMatchObject({ action: 'assign', personnel_id: fixture.personnelId })

  // The driver is now a company driver, and DOT's trigger put them on the roster.
  expect((await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}&select=is_company_driver`))[0].is_company_driver).toBe(true)
  expect(await rest(`/rest/v1/forge_dot_company_drivers?personnel_id=eq.${fixture.personnelId}&select=id`)).toHaveLength(1)

  await expect(page.getByTestId('vehicle-assignment-history')).toContainText('Assigned')

  // Edit.
  await open(page, `/fleet/vehicles/${fixture.vehicleId}/edit`)
  await page.locator('#vehicle-color').fill('Blue')
  await page.locator('#vehicle-insurance_status').selectOption('insured')
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await expect.poll(async () => (await vehicle()).color).toBe('Blue')
  expect((await vehicle()).insurance_status).toBe('insured')
  await page.waitForURL(url => url.pathname === `/fleet/vehicles/${fixture.vehicleId}`)

  // Lower mileage is refused, then accepted as a correction.
  await open(page, `/fleet/vehicles/${fixture.vehicleId}`)
  const meter = page.getByTestId('vehicle-meter-action')

  await meter.getByLabel('Reading', { exact: true }).fill('900')
  await meter.getByRole('button', { name: 'Record reading' }).click()
  await expect(page.getByTestId('meter-error')).toContainText('lower than the current mileage (1,000)')
  expect((await vehicle()).mileage).toBe(1000)

  await meter.getByLabel(/This is a correction/).check()
  await meter.getByRole('button', { name: 'Record reading' }).click()
  await expect.poll(async () => (await vehicle()).mileage).toBe(900)
  expect(await rest(`/rest/v1/forge_fleet_meter_readings?vehicle_id=eq.${fixture.vehicleId}&is_correction=eq.true&select=id`)).toHaveLength(1)

  // Out of service and back.
  const service = page.getByTestId('vehicle-service-action')

  await service.getByLabel('Reason').fill('Cracked windshield')
  await service.getByRole('button', { name: 'Mark out of service' }).click()
  await expect(page.getByTestId('vehicle-oos-banner')).toContainText('Cracked windshield')
  await page.getByTestId('vehicle-service-action').getByRole('button', { name: 'Return to service' }).click()
  await expect.poll(async () => (await vehicle()).status).toBe('active')
  await expect(page.getByTestId('vehicle-oos-banner')).toHaveCount(0)

  const statuses = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${fixture.vehicleId}&select=*&order=changed_at`)

  expect(statuses.map(row => row.to_status)).toEqual(['out_of_service', 'active'])
  expect(statuses[0]).toMatchObject({ reason: 'Cracked windshield', source: 'record_edit' })

  // Document upload and signed download.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
  const documents = page.getByTestId('vehicle-documents')

  await documents.getByLabel('Type').selectOption('registration')
  await documents.getByLabel('Expires').fill(isoIn(200))
  await documents.getByLabel(/^File/).setInputFiles({ name: 'registration.png', mimeType: 'image/png', buffer: png })
  const [upload] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/fleet/vehicles/${fixture.vehicleId}/documents`)),
    documents.getByRole('button', { name: 'Upload document' }).click()
  ])

  expect(upload.status(), await upload.text()).toBe(200)
  await expect(documents.locator('[data-document="registration.png"]')).toHaveCount(1)

  const [document] = await rest(`/rest/v1/forge_fleet_documents?vehicle_id=eq.${fixture.vehicleId}&select=*`)

  expect(document).toMatchObject({ content_type: 'image/png', document_type: 'registration', size_bytes: png.length })
  expect(document.storage_path).toBe(`${ORG}/${fixture.vehicleId}/${document.id}`)

  const link = await page.request.get(`${baseURL}/fleet/vehicles/${fixture.vehicleId}/documents/${document.id}`, { maxRedirects: 0 })

  expect([302, 303, 307]).toContain(link.status())

  const file = await fetch(link.headers().location)

  expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true)

  // A renamed non-image is refused by its bytes.
  await documents.getByLabel(/^File/).setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') })
  await documents.getByRole('button', { name: 'Upload document' }).click()
  await expect(page.getByText('Choose a PDF or a photo (JPG, PNG or WebP).')).toBeVisible()

  // Remove as sold, then restore.
  const retire = page.getByTestId('vehicle-retire-action')

  await retire.getByLabel('Disposition').selectOption('sold')
  await retire.getByLabel('Notes').fill('Sold at auction')
  await retire.getByRole('button', { name: 'Remove from fleet' }).click()
  await expect.poll(async () => (await vehicle()).status).toBe('sold')
  expect((await vehicle()).disposition_notes).toBe('Sold at auction')

  await open(page, '/fleet/removed')
  const removedRow = page.locator(`[data-removed-vehicle="${fixture.vehicleNumber}"]`)

  await expect(removedRow).toContainText('Sold at auction')
  await open(page, '/fleet/vehicles')
  await expect(page.locator(`[data-vehicle="${fixture.vehicleNumber}"]`)).toHaveCount(0)

  await open(page, '/fleet/removed')
  await page.locator(`[data-removed-vehicle="${fixture.vehicleNumber}"]`).getByRole('button', { name: 'Restore' }).click()
  await expect.poll(async () => (await vehicle()).status).toBe('inactive')

  const disposal = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${fixture.vehicleId}&select=*&order=changed_at`)

  expect(disposal.slice(-2).map(row => [row.to_status, row.source])).toEqual([
    ['sold', 'disposal'],
    ['inactive', 'record_edit']
  ])
})

test('renewals, dashboard and the inventory CSV', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await open(page, '/fleet/renewals')
  await expect(page.locator(`[data-renewal-group="soon"] [data-renewal="${fixture.vehicleNumber}"][data-renewal-kind="registration"]`)).toHaveCount(1)

  await open(page, '/fleet')
  await expect(page.locator('[data-stat="Inactive"]')).toBeVisible()

  await open(page, '/fleet/vehicles?q=' + encodeURIComponent(`S11V-${RUN}`))
  await expect(page.locator(`[data-vehicle="${fixture.vehicleNumber}"]`)).toHaveCount(1)

  const csv = await page.request.get(baseURL + '/fleet/reports/inventory')

  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')

  const text = await csv.text()

  expect(text.split('\r\n')[0]).toContain('"Vehicle #","Unit Number"')
  expect(text).toContain(fixture.vehicleNumber)
})

test('CSV import: dry run, import, re-import adds nothing', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  const vins = [randomVin(), randomVin()]
  const header = 'Year,Make,Model,Color,VIN Number,License,Renewal Date,Location,Assigned Driver,County Assessed,Insured,Mileage,Notes,Not on Vehicle Fringe SS,Asset Type,Form 2290,IRP,Commute Use,Registration Renewal Month,Unit Number'
  const rows = [
    `2018,Ram,1500,White,${vins[0]},S11A${RUN.slice(-4)},3/31/2027,,${fixture.employeeNumber},Yes,Yes,"12,500",Imported one,No,Fleet Vehicle,N/A,,No,March,S11I-${RUN}-1`,
    `2015,Mack,Granite,Red,${vins[1]},S11B${RUN.slice(-4)},,,Nobody Here${RUN},No,No,88000,,Yes,Dump Truck,Filed,Filed,,,S11I-${RUN}-2`
  ]
  const file = { name: 'fleet.csv', mimeType: 'text/csv', buffer: Buffer.from([header, ...rows].join('\r\n')) }
  const counts = page.getByTestId('fleet-import-counts')

  await open(page, '/fleet/import')
  await page.getByLabel('Vehicle CSV file').setInputFiles(file)
  await page.getByRole('button', { name: 'Check file (dry run)' }).click()
  await expect(page.getByTestId('fleet-import-summary')).toHaveAttribute('data-dry-run', '1')
  await expect(counts.locator('[data-count="created"]')).toHaveText('2')
  await expect(page.locator('[data-import-line="3"]')).toContainText('No active employee matches')
  expect(await rest(`/rest/v1/forge_fleet_vehicles?vin=in.(${vins.join(',')})&select=id`)).toHaveLength(0)

  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('fleet-import-summary')).toHaveAttribute('data-dry-run', '0')
  await expect(counts.locator('[data-count="created"]')).toHaveText('2')

  const imported = await rest(`/rest/v1/forge_fleet_vehicles?vin=in.(${vins.join(',')})&select=*&order=unit_number`)

  expect(imported).toHaveLength(2)
  expect(imported[0]).toMatchObject({
    source_system: 'forge-1.0-csv',
    mileage: 12500,
    insurance_status: 'insured',
    county_assessment_status: 'assessed',
    registration_renewal_date: '2027-03-31',
    registration_renewal_month: 3,
    form_2290_status: 'not_required',
    assigned_driver_personnel_id: fixture.personnelId
  })
  expect(imported[1]).toMatchObject({ vehicle_type: 'dump_truck', vehicle_fringe: true, assigned_driver_personnel_id: null, mileage: 88000 })

  const importReadings = await rest(`/rest/v1/forge_fleet_meter_readings?vehicle_id=in.(${imported.map(row => row.id).join(',')})&select=source`)

  expect(importReadings.map(row => row.source)).toEqual(['import', 'import'])

  // Re-import: nothing to add or change.
  await open(page, '/fleet/import')
  await page.getByLabel('Vehicle CSV file').setInputFiles(file)
  await page.getByRole('button', { name: 'Check file (dry run)' }).click()
  await expect(counts.locator('[data-count="unchanged"]')).toHaveText('2')
  await expect(counts.locator('[data-count="created"]')).toHaveText('0')
  await expect(counts.locator('[data-count="updated"]')).toHaveText('0')
  await expect(page.getByRole('button', { name: 'Import' })).toBeDisabled()
  expect(await rest(`/rest/v1/forge_fleet_vehicles?vin=in.(${vins.join(',')})&select=id`)).toHaveLength(2)
  expect(await rest(`/rest/v1/forge_fleet_meter_readings?vehicle_id=in.(${imported.map(row => row.id).join(',')})&select=id`)).toHaveLength(2)
})
