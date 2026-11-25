/**
 * Port slice 19 (agent A, the truck side) browser checks: adding a forklift (new equipment and existing equipment),
 * editing it, the company checklist and settings, the pre-shift check (N/A only where allowed, a defect needs a note,
 * operator authorization shown up front), a passing check, a failing critical check that takes the truck out of
 * service, return to service refused while the critical defect is open and allowed once it is repaired (recorded as
 * maintenance), a non-critical defect that leaves the truck in service, the overview, lists and print view, and a
 * view-only employee who sees no manage actions. Operators are authorized through the forge_forklift_authorize RPC.
 * Everything is tagged "PW-S19A" and removed after (as supabase_admin in replica mode, children first).
 *
 * Run (from apps/web): playwright test tests/port-s19-forklifts.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { test, expect: baseExpect } = require('@playwright/test')

// The dev server can be slow under load; server actions and refreshes get more time than the default 5 s.
const expect = baseExpect.configure({ timeout: 20000 })

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
const ADMIN = '20000000-0000-4000-8000-000000000001'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const TAG = 'PW-S19A'
const RUN = Date.now().toString().slice(-6)
const TRUCK = `${TAG} Truck ${RUN}`
const EXISTING = `${TAG} Walkie ${RUN}`
const ITEM = `${TAG} Strobe works ${RUN}`
const fixture = {}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)

  return text ? JSON.parse(text) : null
}

/** Call an RPC as the service role; returns { data } or { error } (the database's message). */
const rpc = async (name, params) => {
  const response = await fetch(API_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  const text = await response.text()

  if (!response.ok) return { error: JSON.parse(text).message }

  return { data: text ? JSON.parse(text) : null }
}

const psql = sql => execSync(`docker exec -i ${DB_CONTAINER} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -t -A`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString()

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

const truckRow = async id => (await rest(`forge_forklifts?id=eq.${id}&select=*,forge_assets(*)`))[0]

const daysAgo = days => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)

/** Open the check form for the main truck and pick the authorized operator. */
const startCheck = async page => {
  await open(page, `/forklifts/trucks/${fixture.truckId}/check`)
  const form = page.locator('[data-check-form]')

  await form.locator('select[name="operator"]').selectOption(fixture.operatorId)
  await expect(form.locator('[data-operator-problem]')).toHaveCount(0)
  await expect(form.locator('fieldset').first()).toBeEnabled()

  return form
}

const answer = (form, label, value) => form.locator(`[data-check-item="${label}"] input[type="radio"][value="${value}"]`)

test.beforeAll(async () => {
  fixture.settingsBefore = (await rest(`forge_forklift_settings?organization_id=eq.${ORG}&select=*`))[0] || null
  const [operator, outsider] = await rest('forge_personnel', {
    method: 'POST',
    body: [
      { organization_id: ORG, first_name: TAG, last_name: `Operator ${RUN}`, location_id: LOCATION, employment_status: 'active' },
      { organization_id: ORG, first_name: TAG, last_name: `Untrained ${RUN}`, location_id: LOCATION, employment_status: 'active' }
    ]
  })

  fixture.operatorId = operator.id
  fixture.outsiderId = outsider.id
  fixture.operatorName = `${TAG} Operator ${RUN}`
  const authorized = await rpc('forge_forklift_authorize', {
    p_organization_id: ORG,
    p_actor_user_id: ADMIN,
    p_personnel_id: operator.id,
    p_truck_classes: ['I', 'III'],
    p_training_completed_on: daysAgo(20),
    p_evaluated_on: daysAgo(10),
    p_evaluator_name: `${TAG} Evaluator`
  })

  if (authorized.error) throw new Error('Unable to authorize the fixture operator: ' + authorized.error)

  const [asset] = await rest('forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `${TAG}-${RUN}`, asset_type: 'equipment', name: EXISTING, status: 'active', location_id: LOCATION, created_by: ADMIN }
  })

  fixture.existingAssetId = asset.id
})

test.afterAll(async () => {
  psql(`begin; set local session_replication_role = replica;
    create temp table s19a_assets on commit drop as select id from public.forge_assets where organization_id = '${ORG}' and (name like '${TAG}%' or asset_number like '${TAG}%');
    create temp table s19a_trucks on commit drop as select id from public.forge_forklifts where asset_id in (select id from s19a_assets);
    create temp table s19a_people on commit drop as select id from public.forge_personnel where organization_id = '${ORG}' and first_name = '${TAG}';
    create temp table s19a_operators on commit drop as select id from public.forge_forklift_operators where personnel_id in (select id from s19a_people);
    delete from public.forge_forklift_defects where forklift_id in (select id from s19a_trucks);
    delete from public.forge_forklift_checks where forklift_id in (select id from s19a_trucks) or operator_personnel_id in (select id from s19a_people);
    delete from public.forge_forklift_incident_links where forklift_id in (select id from s19a_trucks) or operator_id in (select id from s19a_operators);
    delete from public.forge_forklift_activity where forklift_id in (select id from s19a_trucks) or operator_id in (select id from s19a_operators);
    delete from public.forge_forklift_notice_log where operator_id in (select id from s19a_operators);
    delete from public.forge_forklift_operators where id in (select id from s19a_operators);
    delete from public.forge_forklifts where id in (select id from s19a_trucks);
    delete from public.forge_asset_maintenance where asset_id in (select id from s19a_assets);
    delete from public.forge_asset_meter_readings where asset_id in (select id from s19a_assets);
    delete from public.forge_asset_status_history where asset_id in (select id from s19a_assets);
    delete from public.forge_asset_activity where asset_id in (select id from s19a_assets);
    delete from public.forge_asset_assignments where asset_id in (select id from s19a_assets);
    delete from public.forge_assets where id in (select id from s19a_assets);
    delete from public.forge_personnel_employment_events where personnel_id in (select id from s19a_people);
    delete from public.forge_personnel where id in (select id from s19a_people);
    delete from public.forge_forklift_check_items where organization_id = '${ORG}' and label like '${TAG}%';
    commit;`)
  if (fixture.settingsBefore !== undefined) {
    if (fixture.settingsBefore) {
      const { organization_id: _org, ...row } = fixture.settingsBefore

      await rest(`forge_forklift_settings?organization_id=eq.${ORG}`, { method: 'PATCH', body: row }).catch(() => {})
    } else {
      await rest(`forge_forklift_settings?organization_id=eq.${ORG}`, { method: 'DELETE' }).catch(() => {})
    }
  }
})

test('add a forklift as new equipment, then edit it', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forklifts/trucks')
  await page.locator('[data-new-truck]').click()
  await page.waitForURL(/\/forklifts\/trucks\/new$/)
  const form = page.locator('[data-truck-form="new"]')

  await form.locator('input[name="name"]').fill(TRUCK)
  await form.locator('select[name="location_id"]').selectOption(LOCATION)
  await form.locator('input[name="manufacturer"]').fill('Toyota')
  await form.locator('select[name="truck_type"]').selectOption('sit_down_counterbalance')
  // The type pre-fills the class and power source.
  await expect(form.locator('select[name="truck_class"]')).toHaveValue('I')
  await expect(form.locator('select[name="power_source"]')).toHaveValue('electric')
  await form.locator('select[name="power_source"]').selectOption('lpg')
  await expect(form.locator('[data-truck-mismatch]')).toContainText('Class I trucks are electric.')
  await form.getByRole('button', { name: 'Add forklift' }).click()
  await expect(page.getByText('Class I trucks are electric.').last()).toBeVisible()
  await form.locator('select[name="power_source"]').selectOption('electric')
  await form.locator('input[name="rated_capacity_lb"]').fill('5000')
  await form.locator('input[name="attachments"]').fill('Side shifter')
  await form.getByRole('button', { name: 'Add forklift' }).click()
  await page.waitForURL(/\/forklifts\/trucks\/[0-9a-f-]{36}$/)
  fixture.truckId = page.url().split('/').pop()

  const saved = await truckRow(fixture.truckId)

  expect(saved.forge_assets.asset_type).toBe('forklift')
  expect(saved.forge_assets.location_id).toBe(LOCATION)
  expect(saved.rated_capacity_lb).toBe(5000)
  await expect(page.locator('[data-truck-summary]')).toContainText('Class I · Sit-down counterbalance · Electric (battery) · 5,000 lb')
  await expect(page.locator('[data-truck-status]')).toHaveText('In service')
  await expect(page.locator('[data-nameplate-warning]')).toContainText('1910.178(a)(4)')
  await expect(page.locator('[data-truck-history]')).toContainText('Forklift added')

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL(/\/edit$/)
  const edit = page.locator('[data-truck-form="edit"]')

  await edit.locator('input[name="model"]').fill('8FBE20U')
  await edit.locator('input[name="nameplate_verified_on"]').fill(daysAgo(1))
  await edit.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/forklifts\/trucks\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-nameplate-warning]')).toHaveCount(0)
  await expect(page.locator('[data-truck-page]')).toContainText('8FBE20U')
  await expect(page.locator('[data-truck-history]')).toContainText('Forklift details edited')
  expect((await truckRow(fixture.truckId)).forge_assets.model).toBe('8FBE20U')

  // The equipment record points back to the forklift.
  await page.locator('[data-asset-link]').click()
  await page.waitForURL(new RegExp(`/assets/${saved.asset_id}$`))
  await expect(page.locator('[data-asset-forklift]')).toContainText('This is a forklift')
})

test('set up existing equipment as a forklift', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forklifts/trucks/new')
  await page.locator('[data-existing-equipment]').click()
  await page.waitForURL(/existing=1/)
  const form = page.locator('[data-truck-form="existing"]')

  await expect(form.locator('input[name="name"]')).toHaveCount(0)
  await form.locator('select[name="asset_id"]').selectOption(fixture.existingAssetId)
  await form.locator('select[name="truck_type"]').selectOption('pallet_walkie')
  await expect(form.locator('select[name="truck_class"]')).toHaveValue('III')
  await form.getByRole('button', { name: 'Set up as a forklift' }).click()
  await page.waitForURL(/\/forklifts\/trucks\/[0-9a-f-]{36}$/)
  fixture.existingTruckId = page.url().split('/').pop()
  const saved = await truckRow(fixture.existingTruckId)

  expect(saved.asset_id).toBe(fixture.existingAssetId)
  expect(saved.forge_assets.asset_type).toBe('forklift')
  await expect(page.locator('[data-truck-summary]')).toContainText('Class III · Walkie pallet truck')

  // It is no longer offered.
  await open(page, '/forklifts/trucks/new?existing=1')
  await expect(page.locator(`[data-truck-form="existing"] select[name="asset_id"] option[value="${fixture.existingAssetId}"]`)).toHaveCount(0)

  await open(page, '/forklifts/trucks?class=III&q=' + encodeURIComponent(EXISTING))
  await expect(page.locator(`[data-truck-row="${EXISTING}"]`)).toBeVisible()
  await open(page, '/forklifts/trucks?class=II&q=' + encodeURIComponent(EXISTING))
  await expect(page.locator('[data-truck-row]')).toHaveCount(0)
})

test('settings and the company checklist item', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forklifts/settings')
  const form = page.locator('[data-forklift-settings-form]')

  await form.locator('input[name="expiry_notice_days"]').fill('45')
  await form.getByRole('button', { name: 'Save settings' }).click()
  await expect.poll(async () => (await rest(`forge_forklift_settings?organization_id=eq.${ORG}&select=expiry_notice_days`))[0]?.expiry_notice_days).toBe(45)

  const list = page.locator('[data-forklift-checklist]')

  await expect(list.locator('[data-checklist-item="Horn works"]')).toContainText('built in')
  await expect(list.locator('[data-checklist-item="Horn works"]').getByRole('button')).toHaveCount(0)
  const add = page.locator('[data-add-checklist-item]')

  await add.locator('input[name="itemLabel"]').fill(ITEM + ' draft')
  await add.locator('select[name="itemSection"]').selectOption('operational')
  await add.locator('input[name="itemCritical"]').uncheck()
  await add.getByRole('button', { name: 'Add item' }).click()
  const draft = list.locator(`[data-checklist-item="${ITEM} draft"]`)

  await expect(draft).toContainText('company, not critical')
  await draft.getByRole('button', { name: 'Edit' }).click()
  await draft.locator('input[name="itemLabel"]').fill(ITEM)
  await draft.getByRole('button', { name: 'Save item' }).click()
  const item = list.locator(`[data-checklist-item="${ITEM}"]`)

  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Archive' }).click()
  await expect(item).toContainText('archived')
  await item.getByRole('button', { name: 'Restore' }).click()
  await expect(item).not.toContainText('archived')
  const [row] = await rest(`forge_forklift_check_items?organization_id=eq.${ORG}&label=eq.${encodeURIComponent(ITEM)}&select=*`)

  expect(row).toMatchObject({ section: 'operational', critical: false, archived_at: null })
  fixture.itemId = row.id
})

test('the check form: operator shown up front, N/A only where allowed, a defect needs a note, then a passing check', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forklifts/trucks/${fixture.truckId}/check`)
  const form = page.locator('[data-check-form]')

  // An operator who isn't authorized is flagged before anything is filled in.
  await form.locator('select[name="operator"]').selectOption(fixture.outsiderId)
  await expect(form.locator('[data-operator-problem]')).toContainText('is not an authorized forklift operator')
  await expect(form.getByRole('button', { name: 'Submit check' })).toBeDisabled()
  await form.locator('select[name="operator"]').selectOption(fixture.operatorId)
  await expect(form.locator('[data-operator-problem]')).toHaveCount(0)

  // Electric truck: battery item, no LPG item; the company item is on the form.
  await expect(form.locator('[data-check-item^="Battery charged"]')).toHaveCount(1)
  await expect(form.locator('[data-check-item^="LPG cylinder"]')).toHaveCount(0)
  await expect(form.locator(`[data-check-item="${ITEM}"]`)).toBeVisible()
  // N/A only where the item allows it.
  await expect(answer(form, 'Horn works', 'na')).toHaveCount(0)
  await expect(answer(form, 'Seat belt or operator restraint present and working', 'na')).toHaveCount(1)

  await form.locator('[data-all-ok="visual"]').click()
  await form.locator('[data-all-ok="operational"]').click()
  await answer(form, 'Horn works', 'defect').check()
  await form.getByRole('button', { name: 'Submit check' }).click()
  await expect(form.locator('[data-check-error]')).toHaveText('Describe the defect for "Horn works".')
  await answer(form, 'Horn works', 'ok').check()

  // The database refuses N/A on an item that doesn't allow it, whatever the page sends.
  const items = await rest(`forge_forklift_check_items?or=(organization_id.is.null,organization_id.eq.${ORG})&archived_at=is.null&select=id,label,allow_na,power_sources`)
  const applicable = items.filter(item => !item.power_sources || item.power_sources.includes('electric'))
  const horn = applicable.find(item => item.label === 'Horn works')
  const refused = await rpc('forge_forklift_record_check', {
    p_organization_id: ORG,
    p_forklift_id: fixture.truckId,
    p_operator_personnel_id: fixture.operatorId,
    p_actor_user_id: ADMIN,
    p_hour_meter: null,
    p_answers: applicable.map(item => ({ item_id: item.id, answer: item.id === horn.id ? 'na' : 'ok' }))
  })

  expect(refused.error).toBe('"Horn works" can\'t be marked N/A.')

  await answer(form, 'Seat belt or operator restraint present and working', 'na').check()
  await form.locator('input[name="hourMeter"]').fill('1200.5')
  await form.locator('textarea[name="notes"]').fill('Start of first shift.')
  await form.getByRole('button', { name: 'Submit check' }).click()
  await page.waitForURL(/\/forklifts\/checks\/[0-9a-f-]{36}$/)
  fixture.passId = page.url().split('/').pop()
  await expect(page.locator('[data-check-outcome]')).toHaveAttribute('data-check-outcome', 'pass')
  await expect(page.locator('[data-check-operator-name]')).toHaveText(fixture.operatorName)
  await expect(page.locator('[data-check-answer="Seat belt or operator restraint present and working"]')).toContainText('N/A')
  await expect(page.locator('[data-check-print]')).toContainText('Forklift Pre-Shift Check')
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()

  const [check] = await rest(`forge_forklift_checks?id=eq.${fixture.passId}&select=*`)

  expect(check).toMatchObject({ result: 'pass', took_out_of_service: false, operator_personnel_id: fixture.operatorId, performed_by_user_id: ADMIN })
  expect(Number(check.hour_meter)).toBe(1200.5)
  const [reading] = await rest(`forge_asset_meter_readings?asset_id=eq.${check.asset_id}&meter_type=eq.hours&select=reading`)

  expect(Number(reading.reading)).toBe(1200.5)

  // A lower hour meter: the field won't accept it, and the database refuses it too.
  const lower = await startCheck(page)

  await lower.locator('input[name="hourMeter"]').fill('1000')
  expect(await lower.locator('input[name="hourMeter"]').evaluate(input => input.validity.rangeUnderflow)).toBe(true)
  const lowerRefused = await rpc('forge_forklift_record_check', {
    p_organization_id: ORG,
    p_forklift_id: fixture.truckId,
    p_operator_personnel_id: fixture.operatorId,
    p_actor_user_id: ADMIN,
    p_hour_meter: 1000,
    p_answers: applicable.map(item => ({ item_id: item.id, answer: 'ok' }))
  })

  expect(lowerRefused.error).toContain('lower than the last reading')
})

test('a critical defect takes the truck out of service; it returns only after the defect is repaired', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  const form = await startCheck(page)

  await form.locator('[data-all-ok="visual"]').click()
  await form.locator('[data-all-ok="operational"]').click()
  await answer(form, 'Horn works', 'defect').check()
  await form.getByLabel('Describe the defect: Horn works').fill('No sound when pressed')
  await expect(form.locator('[data-check-preview]')).toContainText('will be taken out of service')
  await form.getByRole('button', { name: 'Submit check' }).click()
  await page.waitForURL(/\/forklifts\/checks\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-check-outcome]')).toHaveAttribute('data-check-outcome', 'out-of-service')
  expect((await truckRow(fixture.truckId)).forge_assets.status).toBe('out_of_service')

  await open(page, '/forklifts/trucks/' + fixture.truckId)
  await expect(page.locator('[data-out-of-service-banner]')).toContainText('OUT OF SERVICE')
  await expect(page.locator('[data-out-of-service-reason]')).toContainText('Pre-shift check failed: Horn works')
  await expect(page.locator('[data-defect-row="Horn works"]')).toContainText('Critical')

  // The check page says so before anything is filled in.
  await open(page, `/forklifts/trucks/${fixture.truckId}/check`)
  await expect(page.locator('[data-check-blocked]')).toContainText('OUT OF SERVICE')
  await expect(page.locator('[data-check-form]')).toHaveCount(0)

  // The overview lists it with its reason, and the open critical defect.
  await open(page, '/forklifts')
  await expect(page.locator(`[data-overview-section="out-of-service"] [data-overview-truck="${TRUCK}"]`)).toContainText('Pre-shift check failed: Horn works')
  await expect(page.locator('[data-overview-section="critical-defects"]')).toContainText('No sound when pressed')

  // Returning it to service is refused while the critical defect is open.
  await open(page, '/forklifts/trucks/' + fixture.truckId)
  await page.locator('[data-truck-action="return"]').click()
  await expect(page.locator('[data-truck-dialog="return"]')).toContainText('open critical defect')
  await page.locator('[data-truck-confirm]').click()
  await expect(page.getByText('This forklift has an open critical defect (Horn works).')).toBeVisible()
  await page.keyboard.press('Escape')
  expect((await truckRow(fixture.truckId)).forge_assets.status).toBe('out_of_service')

  // Close it as repaired, recorded as maintenance.
  await page.locator('[data-defect-row="Horn works"] [data-defect-close]').click()
  const dialog = page.locator('[data-defect-dialog]')

  await expect(dialog.locator('input[name="recordRepair"]')).toBeChecked()
  await dialog.locator('textarea[name="resolutionNote"]').fill('Replaced the horn button')
  await dialog.locator('[data-defect-confirm]').click()
  await expect(page.locator('[data-defect-row="Horn works"]')).toHaveCount(0)
  const [defect] = await rest(`forge_forklift_defects?forklift_id=eq.${fixture.truckId}&item_label=eq.Horn%20works&select=*`)

  expect(defect).toMatchObject({ status: 'repaired', resolution_note: 'Replaced the horn button' })
  expect(defect.maintenance_id).toBeTruthy()
  const [maintenance] = await rest(`forge_asset_maintenance?id=eq.${defect.maintenance_id}&select=*`)

  expect(maintenance).toMatchObject({ maintenance_type: 'corrective', status: 'completed', corrective_action: 'Replaced the horn button' })

  await page.locator('[data-truck-action="return"]').click()
  await page.locator('[data-truck-dialog="return"] textarea[name="reason"]').fill('Horn tested OK')
  await page.locator('[data-truck-confirm]').click()
  await expect(page.locator('[data-out-of-service-banner]')).toHaveCount(0)
  await expect(page.locator('[data-truck-status]')).toHaveText('In service')
  await expect(page.locator('[data-truck-history]')).toContainText('Returned to service')

  // Out of service by hand, with a reason, and back.
  await expect(page.locator('[data-truck-dialog]')).toHaveCount(0)
  await page.locator('[data-truck-action="out"]').click()
  await page.locator('[data-truck-confirm]').click()
  await expect(page.getByText('Say why the forklift is out of service.')).toBeVisible()
  await page.locator('[data-truck-dialog="out"] textarea[name="reason"]').fill('Forks being replaced')
  await page.locator('[data-truck-confirm]').click()
  await expect(page.locator('[data-out-of-service-reason]')).toContainText('Forks being replaced')
  await expect(page.locator('[data-truck-dialog]')).toHaveCount(0)
  await page.locator('[data-truck-action="return"]').click()
  await expect(page.locator('[data-truck-dialog="return"]')).toContainText('Confirm the forklift is safe to use.')
  await page.locator('[data-truck-confirm]').click()
  await expect(page.locator('[data-truck-dialog]')).toHaveCount(0)
  await expect(page.locator('[data-out-of-service-banner]')).toHaveCount(0)
  expect((await truckRow(fixture.truckId)).forge_assets.status).toBe('active')
})

test('a non-critical defect leaves the truck in service; lists, filters and the defects page', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  const form = await startCheck(page)

  await form.locator('[data-all-ok="visual"]').click()
  await form.locator('[data-all-ok="operational"]').click()
  await answer(form, ITEM, 'defect').check()
  await form.getByLabel('Describe the defect: ' + ITEM).fill('Strobe flickers')
  await expect(form.locator('[data-check-preview]')).toContainText('stays in service')
  await form.getByRole('button', { name: 'Submit check' }).click()
  await page.waitForURL(/\/forklifts\/checks\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-check-outcome]')).toHaveAttribute('data-check-outcome', 'fail')
  expect((await truckRow(fixture.truckId)).forge_assets.status).toBe('active')

  // Reported by hand too (non-critical), from the truck page.
  await open(page, '/forklifts/trucks/' + fixture.truckId)
  await page.locator('[data-truck-action="defect"]').click()
  const dialog = page.locator('[data-truck-dialog="defect"]')

  await dialog.locator('input[name="defectLabel"]').fill(`${TAG} Mirror`)
  await dialog.locator('textarea[name="defectDescription"]').fill('Mirror cracked')
  await dialog.locator('input[name="defectCritical"]').uncheck()
  await page.locator('[data-truck-confirm]').click()
  await expect(page.locator(`[data-defect-row="${TAG} Mirror"]`)).toBeVisible()
  await expect(page.locator('[data-truck-status]')).toHaveText('In service')

  await open(page, '/forklifts/defects')
  const row = page.locator(`[data-defect-row="${ITEM}"]`)

  await expect(row).toContainText('Strobe flickers')
  await row.locator('[data-defect-close]').click()
  await page.locator('[data-defect-dialog] input[value="not_a_defect"]').check()
  await expect(page.locator('[data-defect-dialog] input[name="recordRepair"]')).toHaveCount(0)
  await page.locator('[data-defect-dialog] textarea[name="resolutionNote"]').fill('Strobe is meant to flash')
  await page.locator('[data-defect-confirm]').click()
  await expect(row).toHaveCount(0)
  await open(page, '/forklifts/defects?status=closed')
  await expect(page.locator(`[data-defect-row="${ITEM}"]`)).toContainText('Not a defect')

  await open(page, `/forklifts/checks?truck=${fixture.truckId}`)
  await expect(page.locator(`[data-check-row="${TRUCK}"]`)).toHaveCount(3)
  await open(page, `/forklifts/checks?truck=${fixture.truckId}&result=pass`)
  await expect(page.locator(`[data-check-row="${TRUCK}"]`)).toHaveCount(1)

  // The overview: the truck was checked today, the walkie never was.
  await open(page, '/forklifts')
  await expect(page.locator(`[data-overview-section="not-checked"] [data-overview-truck="${EXISTING}"]`)).toBeVisible()
  await expect(page.locator(`[data-overview-section="not-checked"] [data-overview-truck="${TRUCK}"]`)).toHaveCount(0)
  await open(page, '/forklifts/trucks?unchecked=1&q=' + encodeURIComponent(TAG))
  await expect(page.locator(`[data-truck-row="${EXISTING}"] [data-not-checked-today]`)).toBeVisible()
  await expect(page.locator(`[data-truck-row="${TRUCK}"]`)).toHaveCount(0)

  // An archived company item leaves the form.
  await rest(`forge_forklift_check_items?id=eq.${fixture.itemId}`, { method: 'PATCH', body: { archived_at: new Date().toISOString() } })
  await open(page, `/forklifts/trucks/${fixture.truckId}/check`)
  await expect(page.locator(`[data-check-item="${ITEM}"]`)).toHaveCount(0)
})

test('a view-only employee sees no manage actions', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await open(page, '/forklifts/trucks/' + fixture.truckId)
  await expect(page.locator('[data-truck-page]')).toBeVisible()
  await expect(page.locator('[data-truck-action="out"]')).toHaveCount(0)
  await expect(page.locator('[data-truck-action="return"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(page.locator('[data-defect-close]')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Forklifts' }).getByRole('link', { name: 'Settings' })).toHaveCount(0)

  // The check form is for themselves only.
  await open(page, `/forklifts/trucks/${fixture.truckId}/check`)
  await expect(page.locator('[data-check-operator]')).toContainText('Forge Demo User')
  await expect(page.locator('select[name="operator"]')).toHaveCount(0)

  await open(page, '/forklifts/defects')
  await expect(page.locator('[data-defect-close]')).toHaveCount(0)
  await open(page, '/forklifts/trucks')
  await expect(page.locator('[data-new-truck]')).toHaveCount(0)

  await open(page, '/forklifts/settings')
  await expect(page).not.toHaveURL(/\/forklifts\/settings/)
  await open(page, '/forklifts/trucks/new')
  await expect(page).not.toHaveURL(/\/forklifts\/trucks\/new/)
  await open(page, `/forklifts/trucks/${fixture.truckId}/edit`)
  await expect(page).not.toHaveURL(/\/edit$/)
})
