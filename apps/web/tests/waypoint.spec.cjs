/**
 * Forge Waypoint, phase 0 browser checks: an area from creation to its Area Card at the entrance.
 * Seeds by REST: one piece of equipment at the Cypress Bend main plant.
 *
 * - admin creates an area (PPE and hazard chips, muster point) → status Clear
 * - admin places the equipment in the area; it shows on the brief
 * - admin creates the Area Card QR from the area page (QR Management, area preselected)
 * - signed in, the Area Card shows the brief with equipment names; anonymous, it shows counts only
 * - equipment out of service → Caution; restricted entry → Stop
 * - archiving the area stops its Area Card (archived QR, /q/unavailable); restoring brings the area back without it
 * - another company's admin gets 404 for the area
 *
 * Run (from apps/web): playwright test tests/waypoint.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
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
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const RUN = Date.now().toString().slice(-7)
const AREA_NAME = `Waypoint Bay ${RUN}`
const ASSET_NAME = `Waypoint Press ${RUN}`
const ASSET_NUMBER = `WPS-${RUN}`
const UUID = /\/waypoint\/([0-9a-f-]{36})$/

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
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

const fixture = { assetId: null, areaId: null, token: null, qrIds: [] }

const areaQrs = () =>
  rest(
    `/rest/v1/forge_qr_codes?target_type=eq.area&target_id=eq.${fixture.areaId}&select=id,token,status,archived_at,access_mode`
  )

test.beforeAll(async () => {
  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: {
      organization_id: ORG,
      location_id: LOCATION,
      asset_number: ASSET_NUMBER,
      name: ASSET_NAME,
      status: 'active'
    }
  })

  fixture.assetId = asset.id
})

test.afterAll(async () => {
  const swallow = () => {}

  if (fixture.areaId) {
    const qrs = (await areaQrs().catch(() => [])) || []

    for (const qr of qrs) {
      await rest(`/rest/v1/forge_qr_scan_sessions?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(swallow)
      await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(swallow)
      await rest(`/rest/v1/forge_qr_codes?id=eq.${qr.id}`, { method: 'DELETE' }).catch(swallow)
    }

    await rest(`/rest/v1/forge_areas?id=eq.${fixture.areaId}`, { method: 'DELETE' }).catch(swallow)
  }

  if (fixture.assetId) await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'DELETE' }).catch(swallow)
})

test('admin creates an area, places equipment and creates its Area Card', async ({ page }) => {
  await login(page, 'admin@forge2.local')

  await page.goto(baseURL + '/waypoint/new')
  const form = page.getByTestId('area-form')

  await expect(form).toBeVisible()
  await form.locator('#area-name').fill(AREA_NAME)
  await form.locator('#area-code').fill(`WB${RUN}`)
  await form.locator('#area-locationId').selectOption(LOCATION)
  await form.getByRole('group', { name: 'requiredPpe' }).locator('label', { hasText: 'Safety glasses' }).click()
  await form.getByRole('group', { name: 'hazards' }).locator('label', { hasText: 'High noise' }).click()
  await form.locator('#area-musterPoint').fill('North lot, row B')
  await form.getByRole('button', { name: 'Create area' }).click()

  await page.waitForURL(UUID, { timeout: 60000 })
  fixture.areaId = page.url().match(UUID)[1]

  const briefing = page.getByTestId('area-briefing')

  await expect(page.getByRole('heading', { name: AREA_NAME })).toBeVisible()
  await expect(briefing.getByTestId('area-status')).toHaveAttribute('data-level', 'clear')
  await expect(briefing.getByTestId('area-ppe')).toContainText('Safety glasses')
  await expect(briefing.getByTestId('area-hazards')).toContainText('High noise')
  await expect(briefing.getByTestId('area-emergency')).toContainText('North lot, row B')

  // Place the equipment.
  await page.getByLabel('Equipment to add').selectOption({ label: `${ASSET_NUMBER} · ${ASSET_NAME}` })
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(briefing.getByTestId('area-equipment')).toContainText(ASSET_NAME)

  const [asset] = await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}&select=area_id`)

  expect(asset.area_id).toBe(fixture.areaId)

  // Area Card QR, starting from the area page.
  await page.getByTestId('create-area-card').click()
  await page.waitForURL(/\/qr\/create\?area=/)
  await page.getByRole('button', { name: 'Save QR Code' }).click()
  await page.waitForURL(/\/qr\/[0-9a-f-]{36}$/, { timeout: 60000 })

  const qrs = await areaQrs()

  expect(qrs).toHaveLength(1)
  expect(qrs[0].access_mode).toBe('employee_number')
  fixture.token = qrs[0].token

  await page.goto(baseURL + `/waypoint/${fixture.areaId}`)
  await expect(page.getByTestId('area-qr-codes')).toContainText('Area Card')
})

test('the Area Card shows the brief: full for signed-in users, counts only for anonymous viewers', async ({
  page,
  browser
}) => {
  test.skip(!fixture.token, 'needs the Area Card from the first test')

  await login(page, 'admin@forge2.local')
  await page.goto(baseURL + `/scan/${fixture.token}`)

  const briefing = page.getByTestId('area-briefing')

  await expect(briefing).toBeVisible()
  await expect(briefing.getByTestId('area-status')).toHaveAttribute('data-level', 'clear')
  await expect(briefing.getByTestId('area-equipment')).toContainText(ASSET_NAME)

  // Equipment out of service turns the light amber.
  await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'PATCH', body: { status: 'out_of_service' } })

  const anonymous = await browser.newContext({ baseURL })
  const anonPage = await anonymous.newPage()

  await anonPage.goto(`/scan/${fixture.token}`)

  const anonBriefing = anonPage.getByTestId('area-briefing')

  await expect(anonBriefing.getByTestId('area-status')).toHaveAttribute('data-level', 'caution')
  await expect(anonBriefing.getByTestId('area-status')).toContainText('1 piece of equipment is out of service')
  await expect(anonBriefing.getByTestId('area-ppe')).toContainText('Safety glasses')
  await expect(anonBriefing.getByTestId('area-equipment-hidden')).toBeVisible()
  await expect(anonPage.locator('body')).not.toContainText(ASSET_NAME)
  await anonymous.close()

  await page.reload()
  await expect(briefing.getByTestId('area-status')).toHaveAttribute('data-level', 'caution')
  await expect(briefing.getByTestId('area-status')).toContainText(`Out of service: ${ASSET_NAME}`)

  await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'PATCH', body: { status: 'active' } })
})

test('restricted entry turns the light red', async ({ page }) => {
  test.skip(!fixture.areaId, 'needs the area from the first test')

  await login(page, 'admin@forge2.local')
  await page.goto(baseURL + `/waypoint/${fixture.areaId}/edit`)
  await page.getByTestId('area-restricted').check()
  await page.locator('#area-entryRequirements').fill('Sign in with the shift lead.')
  await page.getByRole('button', { name: 'Save area' }).click()
  await page.waitForURL(UUID, { timeout: 60000 })

  const status = page.getByTestId('area-briefing').getByTestId('area-status')

  await expect(status).toHaveAttribute('data-level', 'stop')
  await expect(status).toContainText('Restricted entry: Sign in with the shift lead.')
})

test('archiving stops the Area Card; restoring brings the area back without it', async ({ page, browser }) => {
  test.skip(!fixture.token, 'needs the Area Card from the first test')

  await login(page, 'admin@forge2.local')
  await page.goto(baseURL + `/waypoint/${fixture.areaId}`)
  await page.getByRole('button', { name: 'Archive area' }).click()
  await page.getByPlaceholder('Optional reason...').fill('Waypoint browser test')
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  await expect(page.getByRole('button', { name: 'Restore area' })).toBeVisible({ timeout: 30000 })

  const [qr] = await areaQrs()

  expect(qr.status).toBe('archived')
  expect(qr.archived_at).not.toBeNull()

  const [asset] = await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}&select=area_id`)

  expect(asset.area_id).toBeNull()

  const anonymous = await browser.newContext({ baseURL })
  const anonPage = await anonymous.newPage()

  await anonPage.goto(`/scan/${fixture.token}`)
  await expect(anonPage).toHaveURL(/\/q\/unavailable/)
  await anonymous.close()

  await page.getByRole('button', { name: 'Restore area' }).click()
  await expect(page.getByRole('button', { name: 'Archive area' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('area-qr-codes')).toContainText('No Area Card yet')
})

test('another company cannot open the area', async ({ page }) => {
  test.skip(!fixture.areaId, 'needs the area from the first test')

  await login(page, 'northstar.admin@forge2.local')

  const response = await page.goto(baseURL + `/waypoint/${fixture.areaId}`)

  expect(response?.status()).toBe(404)
  await expect(page.locator('body')).not.toContainText(AREA_NAME)
})
