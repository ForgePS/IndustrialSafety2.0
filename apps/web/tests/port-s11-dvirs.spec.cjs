/**
 * Port slice 11 (piece B) browser checks: Driver Vehicle Inspection Reports.
 * Seeds by REST: a DOT-regulated vehicle (mileage 1000), a non-DOT vehicle, a personnel record with an employee
 * number, and a vehicle QR (scan_menu, employee_number) for each vehicle. Fleet settings: defaults (no row).
 *
 * - office DVIR, all Yes, odometer 1050 → closed, mileage 1050 (meter reading source dvir)
 * - office DVIR with a defect → open, defect row, vehicle out of service (source dvir), repair record opened
 * - mechanic certifies "corrected" → needs_review, vehicle back in service (dvir_certified), repair completed
 * - next-driver review → closed; signed parts are immutable (REST PATCH refused)
 * - print page shows all three signatures; the day sheet lists the day's DVIRs
 * - scan DVIR: anonymous → identify (?next=dvir-pre_trip); identified employee submits a pre-trip DVIR
 * - a non-DOT vehicle's scan DVIR is refused
 *
 * Run (from apps/web): playwright test tests/port-s11-dvirs.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')
const { test, expect } = require('@playwright/test')

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)
const EMPLOYEE_NUMBER = `S11B${RUN}`

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

const psql = sql => execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString()

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

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

const localToday = () => {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const fixture = { vehicleId: null, plainVehicleId: null, personnelId: null, qr: null, plainQr: null, dvirs: [] }

const vehicle = async () => (await rest(`/rest/v1/forge_fleet_vehicles?id=eq.${fixture.vehicleId}&select=*`))[0]
const dvirRow = async id => (await rest(`/rest/v1/forge_fleet_dvirs?id=eq.${id}&select=*`))[0]

const allOk = async page => {
  for (const section of ['truck', 'safety', 'trailer']) await page.getByTestId(`dvir-all-ok-${section}`).click()
}

const submitAndOpen = async page => {
  await page.getByTestId('dvir-submit').click()
  await page.waitForURL(url => /^\/fleet\/dvirs\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })

  const id = new URL(page.url()).pathname.split('/').pop()

  fixture.dvirs.push(id)

  return id
}

const makeQr = async (vehicleId, label) =>
  (
    await rest('/rest/v1/forge_qr_codes', {
      method: 'POST',
      body: {
        organization_id: ORG,
        qr_number: `QR-S11B-${label}-${RUN}`,
        name: `S11B ${label} ${RUN}`,
        token: crypto.randomBytes(24).toString('hex'),
        status: 'active',
        target_type: 'vehicle',
        target_id: vehicleId,
        default_action: 'scan_menu',
        access_mode: 'employee_number',
        action_config: {},
        created_by: ADMIN
      }
    })
  )[0]

const identify = async (browser, qr) => {
  const raw = crypto.randomBytes(32).toString('hex')

  await rest('/rest/v1/forge_qr_scan_sessions', {
    method: 'POST',
    body: {
      organization_id: ORG,
      qr_code_id: qr.id,
      personnel_id: fixture.personnelId,
      session_token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    }
  })

  const context = await browser.newContext({ baseURL })

  await context.addCookies([{ name: 'forge_scan_session', value: raw, domain: new URL(baseURL).hostname, path: `/scan/${qr.token}` }])

  return context
}

test.beforeAll(async () => {
  const settings = await rest(`/rest/v1/forge_fleet_settings?organization_id=eq.${ORG}&select=*`)

  if (settings.length && (!settings[0].defect_out_of_service || !settings[0].defect_opens_repair)) {
    throw new Error('This test needs the default fleet settings (defects take the vehicle out of service and open a repair).')
  }

  const [dot] = await rest('/rest/v1/forge_fleet_vehicles', {
    method: 'POST',
    body: {
      organization_id: ORG,
      vehicle_number: `S11B-${RUN}`,
      unit_number: `B${RUN}`,
      vehicle_type: 'tractor_truck',
      year: 2020,
      make: 'Freightliner',
      model: 'Cascadia',
      dot_regulated: true,
      status: 'active',
      mileage: 1000,
      location_id: LOCATION,
      created_by: ADMIN
    }
  })
  fixture.vehicleId = dot.id

  const [plain] = await rest('/rest/v1/forge_fleet_vehicles', {
    method: 'POST',
    body: { organization_id: ORG, vehicle_number: `S11B-P-${RUN}`, vehicle_type: 'passenger_vehicle', dot_regulated: false, status: 'active', location_id: LOCATION, created_by: ADMIN }
  })
  fixture.plainVehicleId = plain.id

  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Robin', last_name: `Dvir${RUN}`, employee_number: EMPLOYEE_NUMBER, employment_status: 'active' }
  })
  fixture.personnelId = person.id

  fixture.qr = await makeQr(dot.id, 'DOT')
  fixture.plainQr = await makeQr(plain.id, 'PLAIN')
})

test.afterAll(async () => {
  const vehicles = [fixture.vehicleId, fixture.plainVehicleId].filter(Boolean)
  const qrs = [fixture.qr?.id, fixture.plainQr?.id].filter(Boolean)
  const list = ids => ids.map(id => `'${id}'`).join(',')

  try {
    psql(
      [
        vehicles.length ? `delete from public.forge_notification_events where source_module = 'fleet' and payload->>'vehicle_id' in (${list(vehicles)});` : '',
        // DVIRs are records the delete guard keeps; the test's own rows are removed with triggers off.
        'set session_replication_role = replica;',
        vehicles.length ? `delete from public.forge_fleet_dvir_defects where vehicle_id in (${list(vehicles)});` : '',
        vehicles.length ? `update public.forge_fleet_maintenance set dvir_id = null where vehicle_id in (${list(vehicles)});` : '',
        vehicles.length ? `delete from public.forge_fleet_dvirs where vehicle_id in (${list(vehicles)});` : '',
        'set session_replication_role = origin;',
        qrs.length ? `delete from public.forge_qr_scan_sessions where qr_code_id in (${list(qrs)});` : '',
        qrs.length ? `delete from public.forge_qr_scans where qr_code_id in (${list(qrs)});` : '',
        qrs.length ? `delete from public.forge_qr_codes where id in (${list(qrs)});` : '',
        vehicles.length ? `delete from public.forge_fleet_vehicles where id in (${list(vehicles)});` : '',
        fixture.personnelId ? `delete from public.forge_personnel where id = '${fixture.personnelId}';` : ''
      ].join('\n')
    )
  } catch (error) {
    console.error('cleanup failed', error.stderr?.toString() || error.message)
  }
})

test('office DVIR with every item OK closes and moves the mileage forward', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/fleet/dvirs/new?vehicle=${fixture.vehicleId}`)
  await expect(page.getByTestId('dvir-form')).toBeVisible()
  await expect(page.locator('#dvir-driver')).not.toHaveValue('')

  await allOk(page)
  await expect(page.locator('[data-dvir-item="brakes"] [data-answer="yes"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#dvir-odometer').fill('1050')
  await page.getByTestId('dvir-satisfactory').check()
  await draw(page, page.getByTestId('dvir-form'))

  const id = await submitAndOpen(page)
  const row = await dvirRow(id)

  expect(row.status).toBe('closed')
  expect(row.submitted_via).toBe('office')
  expect(row.driver_user_id).toBe(ADMIN)
  expect(row.items).toHaveLength(54)
  expect(row.driver_signature.image).toMatch(/^data:image\/png;base64,/)
  expect((await vehicle()).mileage).toBe(1050)

  const readings = await rest(`/rest/v1/forge_fleet_meter_readings?source_record_id=eq.${id}&select=*`)

  expect(readings).toHaveLength(1)
  expect(readings[0].source).toBe('dvir')
  await expect(page.getByTestId('dvir-status')).toHaveText('Closed')
})

test('office DVIR with a defect takes the vehicle out of service and opens a repair; certify and review close it', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/fleet/dvirs/new?vehicle=${fixture.vehicleId}`)
  await page.locator('[data-trip="post_trip"]').click()
  await page.locator('[data-dvir-item="brakes"] [data-answer="no"]').click()
  await page.locator('#dvir-note-brakes').fill('Soft brake pedal')
  await allOk(page)
  await expect(page.getByTestId('dvir-satisfactory')).toBeDisabled()
  await page.locator('#dvir-odometer').fill('900')
  await draw(page, page.getByTestId('dvir-form'))

  const id = await submitAndOpen(page)
  fixture.defectDvirId = id

  let row = await dvirRow(id)
  expect(row.status).toBe('open')
  expect(row.trip_type).toBe('post_trip')
  expect(row.odometer).toBe(900)
  expect((await vehicle()).mileage).toBe(1050)
  await expect(page.getByTestId('dvir-odometer')).toContainText('mileage was not changed')

  const defects = await rest(`/rest/v1/forge_fleet_dvir_defects?dvir_id=eq.${id}&select=*`)
  expect(defects).toHaveLength(1)
  expect(defects[0]).toMatchObject({ item_id: 'brakes', notes: 'Soft brake pedal', status: 'open' })

  let unit = await vehicle()
  expect(unit.status).toBe('out_of_service')
  expect(unit.out_of_service_reason).toContain(row.dvir_number)

  let history = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${fixture.vehicleId}&select=*&order=changed_at.desc&limit=1`)
  expect(history[0]).toMatchObject({ to_status: 'out_of_service', source: 'dvir', related_record_id: id })

  const repairs = await rest(`/rest/v1/forge_fleet_maintenance?dvir_id=eq.${id}&select=*`)
  expect(repairs).toHaveLength(1)
  expect(repairs[0]).toMatchObject({ maintenance_type: 'repair', status: 'open', title: `Repair DVIR defects (${row.dvir_number})` })
  expect(row.repair_maintenance_id).toBe(repairs[0].id)

  // Review is not offered before the mechanic signs.
  await expect(page.getByTestId('dvir-review-panel')).toHaveCount(0)

  // Mechanic certification.
  const certify = page.getByTestId('dvir-certify-panel')
  await certify.locator('[data-mechanic-action="corrected"]').check()
  await draw(page, certify)
  await certify.getByTestId('dvir-certify-save').click()
  await expect(page.getByTestId('dvir-status')).toHaveText('Needs driver review', { timeout: 120000 })

  row = await dvirRow(id)
  expect(row.status).toBe('needs_review')
  expect(row.mechanic_action).toBe('corrected')
  expect(row.mechanic_user_id).toBe(ADMIN)
  expect((await rest(`/rest/v1/forge_fleet_dvir_defects?dvir_id=eq.${id}&select=status`))[0].status).toBe('corrected')

  unit = await vehicle()
  expect(unit.status).toBe('active')
  history = await rest(`/rest/v1/forge_fleet_status_history?vehicle_id=eq.${fixture.vehicleId}&select=*&order=changed_at.desc&limit=1`)
  expect(history[0]).toMatchObject({ to_status: 'active', source: 'dvir_certified' })

  const repair = (await rest(`/rest/v1/forge_fleet_maintenance?id=eq.${row.repair_maintenance_id}&select=*`))[0]
  expect(repair.status).toBe('completed')
  expect(repair.completed_on).toBeTruthy()

  // Next driver review.
  const review = page.getByTestId('dvir-review-panel')
  await draw(page, review)
  await review.getByTestId('dvir-review-save').click()
  await expect(page.getByTestId('dvir-status')).toHaveText('Closed', { timeout: 120000 })

  row = await dvirRow(id)
  expect(row.status).toBe('closed')
  expect(row.review_user_id).toBe(ADMIN)
  expect(row.review_signature.image).toMatch(/^data:image\/png;base64,/)
  await expect(page.locator('[data-testid="dvir-signatures"] [data-signed="true"]')).toHaveCount(3)
})

test('signed parts of a DVIR cannot be changed', async () => {
  const id = fixture.defectDvirId

  await expect(rest(`/rest/v1/forge_fleet_dvirs?id=eq.${id}`, { method: 'PATCH', body: { items: [] } })).rejects.toThrow(/cannot be changed/)
  await expect(rest(`/rest/v1/forge_fleet_dvirs?id=eq.${id}`, { method: 'PATCH', body: { mechanic_name: 'Someone else' } })).rejects.toThrow(/cannot be changed/)
  await expect(rest(`/rest/v1/forge_fleet_dvirs?id=eq.${id}`, { method: 'DELETE' })).rejects.toThrow(/3 months/)
})

test('the print page shows all three signatures and the day sheet lists the day', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/fleet/dvirs/${fixture.defectDvirId}/print`)
  await expect(page.locator('[data-testid="print-signature"][data-signed="true"]')).toHaveCount(3)
  await expect(page.locator('[data-print-item="brakes"]')).toHaveAttribute('data-answer', 'no')
  await expect(page.getByRole('button', { name: /Print or save as PDF/ })).toBeVisible()

  await page.goto(`${baseURL}/fleet/dvirs/print?vehicle=${fixture.vehicleId}&date=${localToday()}`)
  await expect(page.getByTestId('dvir-day-sheet')).toHaveAttribute('data-count', '2')

  // The list filters by vehicle and by follow-up.
  await page.goto(`${baseURL}/fleet/dvirs?vehicle=${fixture.vehicleId}`)
  await expect(page.locator('[data-dvir-row]')).toHaveCount(2)
  await page.goto(`${baseURL}/fleet/dvirs?vehicle=${fixture.vehicleId}&status=open`)
  await expect(page.locator('[data-dvir-row]')).toHaveCount(0)
})

test('an identified employee submits a pre-trip DVIR from the vehicle QR', async ({ browser }) => {
  // Anonymous: sent to identify, and back to the DVIR after.
  const anonymous = await browser.newContext({ baseURL })
  const anonPage = await anonymous.newPage()

  await anonPage.goto(`/scan/${fixture.qr.token}/dvir/pre_trip`)
  await anonPage.waitForURL(url => url.pathname === `/scan/${fixture.qr.token}` && url.searchParams.get('next') === 'dvir-pre_trip')
  await anonymous.close()

  const context = await identify(browser, fixture.qr)
  const page = await context.newPage()

  await page.goto(`/scan/${fixture.qr.token}/dvir/pre_trip`)
  await expect(page.getByTestId('scan-viewer')).toHaveAttribute('data-viewer', 'employee')
  await expect(page.getByTestId('dvir-trip')).toHaveText('Pre-trip')
  await expect(page.locator('#dvir-driver')).toHaveValue(new RegExp(`Dvir${RUN}`))
  await allOk(page)
  await page.locator('#dvir-odometer').fill('1100')
  await page.getByTestId('dvir-satisfactory').check()
  await draw(page, page.getByTestId('dvir-form'))
  await page.getByTestId('dvir-submit').click()

  const result = page.getByTestId('dvir-result')
  await expect(result).toBeVisible({ timeout: 60000 })
  await expect(result).toHaveAttribute('data-out-of-service', 'false')
  await expect(page.getByTestId('dvir-back-to-menu')).toHaveAttribute('href', `/scan/${fixture.qr.token}`)
  await expect(page.locator('a[href^="/fleet"]')).toHaveCount(0)

  const number = await result.getAttribute('data-dvir-number')
  const row = (await rest(`/rest/v1/forge_fleet_dvirs?organization_id=eq.${ORG}&dvir_number=eq.${number}&select=*`))[0]

  fixture.dvirs.push(row.id)
  expect(row).toMatchObject({ status: 'closed', trip_type: 'pre_trip', submitted_via: 'scan', qr_code_id: fixture.qr.id, driver_personnel_id: fixture.personnelId, driver_user_id: null })
  expect((await vehicle()).mileage).toBe(1100)

  const events = await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${fixture.qr.id}&record_id=eq.${row.id}&select=action,record_type,result`)
  expect(events[0]).toMatchObject({ action: 'dvir_submit', record_type: 'fleet_dvir', result: 'ok' })

  await context.close()
})

test("a vehicle that isn't DOT-regulated has no scan DVIR", async ({ browser }) => {
  const context = await identify(browser, fixture.plainQr)
  const page = await context.newPage()

  await page.goto(`/scan/${fixture.plainQr.token}/dvir/post_trip`)
  await expect(page.getByTestId('scan-dvir-notice')).toContainText('not available')
  await expect(page.getByTestId('dvir-form')).toHaveCount(0)

  await context.close()
})
