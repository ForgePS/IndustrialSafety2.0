/**
 * Port slice 10 (piece D) browser checks: inspections started from a QR scan.
 * Seeds by REST: a daily template (3 items, one pass/fail with a finding on fail), a weekly template, an asset
 * with a location, a personnel record with a unique employee number, and a scan_menu QR in employee_number mode
 * with inspectionTemplates.daily / weekly.
 *
 * - anonymous → /scan/<token>/inspect/daily sends you to identify; after the employee number the runner opens
 * - all pass → result shows no findings; the inspection is submitted with qr_code_id / asset_id / frequency
 * - a fail without a note is refused; with a note → a finding, a CAPA, the asset out of service (qr_inspection)
 * - signed in as admin, /scan/<token>/inspect/weekly creates the inspection and redirects to /inspections/<id>
 *
 * Run (from apps/web): playwright test tests/port-s10-scan-inspections.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
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
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)
const EMPLOYEE_NUMBER = `S10D${RUN}`
const TOKEN = crypto.randomBytes(24).toString('hex')

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
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

const fixture = { dailyId: null, weeklyId: null, assetId: null, personnelId: null, qrId: null }

const item = (templateId, key, order, prompt, responseType, findingOn, required = true) => ({
  organization_id: ORG,
  template_id: templateId,
  item_key: key,
  section_key: 'general',
  section_label: 'General',
  prompt,
  response_type: responseType,
  sort_order: order,
  is_required: required,
  finding_on: findingOn
})

const qrInspections = async () =>
  rest(`/rest/v1/forge_inspections?qr_code_id=eq.${fixture.qrId}&select=*&order=created_at.asc`)

test.beforeAll(async () => {
  const [daily] = await rest('/rest/v1/forge_inspection_templates', {
    method: 'POST',
    body: { organization_id: ORG, name: `S10 Forklift Daily ${RUN}`, inspection_type: 'general', is_active: true, created_by: ADMIN }
  })
  fixture.dailyId = daily.id

  await rest('/rest/v1/forge_inspection_template_items', {
    method: 'POST',
    body: [
      item(daily.id, 'guards', 10, 'Guards and covers in place', 'pass_fail_na', ['fail']),
      item(daily.id, 'horn', 20, 'Horn works', 'yes_no_na', []),
      item(daily.id, 'hours', 30, 'Hour meter reading', 'number', [], false)
    ]
  })

  const [weekly] = await rest('/rest/v1/forge_inspection_templates', {
    method: 'POST',
    body: { organization_id: ORG, name: `S10 Forklift Weekly ${RUN}`, inspection_type: 'general', is_active: true, created_by: ADMIN }
  })
  fixture.weeklyId = weekly.id
  await rest('/rest/v1/forge_inspection_template_items', { method: 'POST', body: item(weekly.id, 'tires', 10, 'Tires in good condition', 'pass_fail_na', ['fail']) })

  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `S10D-${RUN}`, name: `S10 Forklift ${RUN}`, status: 'active', location_id: LOCATION }
  })
  fixture.assetId = asset.id

  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Dana', last_name: `Tenscan${RUN}`, employee_number: EMPLOYEE_NUMBER, employment_status: 'active' }
  })
  fixture.personnelId = person.id

  const [qr] = await rest('/rest/v1/forge_qr_codes', {
    method: 'POST',
    body: {
      organization_id: ORG,
      qr_number: `QR-S10D-${RUN}`,
      name: `S10 Forklift QR ${RUN}`,
      token: TOKEN,
      status: 'active',
      target_type: 'asset',
      target_id: asset.id,
      default_action: 'scan_menu',
      access_mode: 'employee_number',
      action_config: { inspectionTemplates: { daily: daily.id, weekly: weekly.id }, outOfServiceOnFailedInspection: true },
      created_by: ADMIN
    }
  })
  fixture.qrId = qr.id
})

test.afterAll(async () => {
  const swallow = () => {}

  if (fixture.qrId) {
    const inspections = (await qrInspections().catch(() => [])) || []
    const ids = inspections.map(row => row.id)

    if (ids.length) {
      const findings = (await rest(`/rest/v1/forge_inspection_findings?inspection_id=in.(${ids.join(',')})&select=id`).catch(() => [])) || []
      const capas = findings.length
        ? (await rest(`/rest/v1/forge_corrective_actions?source_id=in.(${findings.map(f => f.id).join(',')})&select=id`).catch(() => [])) || []
        : []

      for (const capa of capas) {
        await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'PATCH', body: { linked_task_id: null } }).catch(swallow)
        await rest(`/rest/v1/forge_tasks?source_id=eq.${capa.id}`, { method: 'DELETE' }).catch(swallow)
        await rest(`/rest/v1/forge_record_links?target_resource_id=eq.${capa.id}`, { method: 'DELETE' }).catch(swallow)
        await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'DELETE' }).catch(swallow)
      }

      await rest(`/rest/v1/forge_record_links?source_resource_id=in.(${ids.join(',')})`, { method: 'DELETE' }).catch(swallow)
      await rest(`/rest/v1/forge_inspections?id=in.(${ids.join(',')})`, { method: 'DELETE' }).catch(swallow)
    }

    await rest(`/rest/v1/forge_qr_scan_sessions?qr_code_id=eq.${fixture.qrId}`, { method: 'DELETE' }).catch(swallow)
    await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${fixture.qrId}`, { method: 'DELETE' }).catch(swallow)
    await rest(`/rest/v1/forge_qr_codes?id=eq.${fixture.qrId}`, { method: 'DELETE' }).catch(swallow)
  }

  if (fixture.assetId) await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'DELETE' }).catch(swallow)
  for (const id of [fixture.dailyId, fixture.weeklyId].filter(Boolean)) await rest(`/rest/v1/forge_inspection_templates?id=eq.${id}`, { method: 'DELETE' }).catch(swallow)
  if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' }).catch(swallow)
})

const answer = async (page, key, value) => {
  await page.locator(`[data-scan-item="${key}"] [data-answer="${value}"]`).click()
  await expect(page.locator(`[data-scan-item="${key}"] [data-answer="${value}"]`)).toHaveAttribute('aria-pressed', 'true')
}

const startButton = async page => {
  const start = page.getByTestId('scan-inspection-start')
  await expect(start).toBeVisible()
  await start.click()
}

test('an identified employee runs the daily inspection from the scan', async ({ browser }) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

  // Anonymous: sent to identify, then back to the inspection.
  await page.goto(`/scan/${TOKEN}/inspect/daily`)
  await page.waitForURL(url => url.pathname === `/scan/${TOKEN}` && url.searchParams.get('next') === 'inspect-daily')
  await page.locator('#scan-employee-number').fill(EMPLOYEE_NUMBER)
  await page.locator('[data-testid="scan-identify"] button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === `/scan/${TOKEN}/inspect/daily`, { timeout: 60000 })
  // Opening the page creates nothing; the Start button does.
  expect(await rest(`/rest/v1/forge_inspections?qr_code_id=eq.${fixture.qrId}&select=id`)).toHaveLength(0)
  await startButton(page)
  await expect(page.getByTestId('scan-inspection-runner')).toBeVisible()

  // Required items are enforced.
  await page.getByTestId('scan-inspection-complete').click()
  await expect(page.locator('[data-scan-item-error="guards"]')).toHaveText('Answer this item.')
  await expect(page.locator('[data-scan-item-error="horn"]')).toHaveText('Answer this item.')

  await answer(page, 'guards', 'pass')
  await answer(page, 'horn', 'yes')
  await page.locator('[data-scan-input="hours"]').fill('1234')
  await page.locator('[data-scan-input="hours"]').blur()

  // Reloading resumes the same inspection with the saved answers.
  const firstId = await page.getByTestId('scan-inspection-runner').getAttribute('data-inspection-id')
  await expect.poll(async () => (await rest(`/rest/v1/forge_inspection_items?inspection_id=eq.${firstId}&item_key=eq.hours&select=response_value`))[0].response_value).toBe('1234')
  await page.reload()
  await expect(page.getByTestId('scan-inspection-runner')).toHaveAttribute('data-inspection-id', firstId)
  await expect(page.locator('[data-scan-item="guards"] [data-answer="pass"]')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('scan-inspection-complete').click()
  const result = page.getByTestId('scan-inspection-result')
  await expect(result).toBeVisible({ timeout: 60000 })
  await expect(result).toHaveAttribute('data-findings', '0')
  await expect(result).toHaveAttribute('data-out-of-service', 'false')
  await expect(result.getByText('Passed')).toBeVisible()

  let [first] = await qrInspections()
  expect(first.id).toBe(firstId)
  expect(first.status).toBe('submitted')
  expect(first.result).toBe('pass')
  expect(first.asset_id).toBe(fixture.assetId)
  expect(first.inspection_frequency).toBe('daily')
  expect(first.location_id).toBe(LOCATION)
  expect(first.inspector_personnel_id).toBe(fixture.personnelId)
  expect(first.inspector_user_id).toBeNull()
  expect(first.submitted_at).toBeTruthy()

  const links = await rest(`/rest/v1/forge_record_links?source_resource_type=eq.inspection&source_resource_id=eq.${first.id}&target_resource_id=eq.${fixture.assetId}&relationship_type=eq.involves_asset&select=id`)
  expect(links).toHaveLength(1)

  const events = await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${fixture.qrId}&record_id=eq.${first.id}&select=action,record_type,personnel_id`)
  expect(events.map(event => event.action).sort()).toEqual(['inspection_complete', 'inspection_start'])
  expect(events.every(event => event.record_type === 'inspection' && event.personnel_id === fixture.personnelId)).toBe(true)

  // Second run: a fail needs a note, then raises a finding and a CAPA and tags the forklift out.
  await page.getByTestId('scan-inspection-back').click()
  await page.waitForURL(url => url.pathname === `/scan/${TOKEN}`)
  await page.goto(`/scan/${TOKEN}/inspect/daily`)
  await startButton(page)
  await expect(page.getByTestId('scan-inspection-runner')).toBeVisible()
  const secondId = await page.getByTestId('scan-inspection-runner').getAttribute('data-inspection-id')
  expect(secondId).not.toBe(firstId)

  await answer(page, 'guards', 'fail')
  await answer(page, 'horn', 'yes')
  await page.getByTestId('scan-inspection-complete').click()
  await expect(page.locator('[data-scan-item-error="guards"]')).toHaveText('Describe the problem in the notes.')
  await page.locator('[data-scan-notes="guards"]').fill('Fan guard cracked on the left side')
  await page.getByTestId('scan-inspection-complete').click()

  await expect(result).toBeVisible({ timeout: 60000 })
  await expect(result).toHaveAttribute('data-findings', '1')
  await expect(result).toHaveAttribute('data-out-of-service', 'true')
  await expect(page.getByTestId('scan-inspection-capas')).toContainText(/\S+/)

  ;[first] = (await qrInspections()).filter(row => row.id === secondId)
  expect(first.status).toBe('submitted')
  expect(first.result).toBe('fail')

  const findings = await rest(`/rest/v1/forge_inspection_findings?inspection_id=eq.${secondId}&select=*`)
  expect(findings).toHaveLength(1)
  expect(findings[0].title).toBe('Guards and covers in place')
  expect(findings[0].description).toContain('Fan guard cracked')

  const capas = await rest(`/rest/v1/forge_corrective_actions?source_type=eq.inspection_finding&source_id=eq.${findings[0].id}&select=action_number,assigned_personnel_id`)
  expect(capas).toHaveLength(1)
  expect(capas[0].assigned_personnel_id).toBe(fixture.personnelId)
  await expect(page.getByTestId('scan-inspection-capas')).toContainText(capas[0].action_number)

  const [asset] = await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}&select=status`)
  expect(asset.status).toBe('out_of_service')

  const history = await rest(`/rest/v1/forge_asset_status_history?asset_id=eq.${fixture.assetId}&select=*`)
  expect(history).toHaveLength(1)
  expect(history[0]).toMatchObject({ source: 'qr_inspection', to_status: 'out_of_service', related_record_type: 'inspection', related_record_id: secondId, actor_personnel_id: fixture.personnelId })

  // A finished inspection cannot be reopened through the runner: the next visit starts a new one.
  await page.goto(`/scan/${TOKEN}/inspect/daily`)
  await expect(page.getByTestId('scan-inspection-start')).toBeVisible()

  await context.close()
})

test('a QR without a monthly template says the inspection is not set up', async ({ browser }) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

  await page.goto(`/scan/${TOKEN}/inspect/monthly`)
  await expect(page.getByTestId('scan-inspection-notice')).toContainText('not set up')
  await context.close()
})

test('a signed-in member is sent to the normal inspection page', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await page.goto(baseURL + `/scan/${TOKEN}/inspect/weekly`)
  await startButton(page)
  await page.waitForURL(url => /^\/inspections\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })

  const id = new URL(page.url()).pathname.split('/').pop()
  const [inspection] = await rest(`/rest/v1/forge_inspections?id=eq.${id}&select=*`)

  expect(inspection).toMatchObject({ qr_code_id: fixture.qrId, asset_id: fixture.assetId, inspection_frequency: 'weekly', inspector_user_id: ADMIN, template_id: fixture.weeklyId, status: 'draft' })

  const items = await rest(`/rest/v1/forge_inspection_items?inspection_id=eq.${id}&select=item_key`)
  expect(items.map(row => row.item_key)).toEqual(['tires'])
  await expect(page.getByTestId('inspection-scan-origin')).toContainText(`Started from QR QR-S10D-${RUN} · Weekly · S10 Forklift ${RUN}`)

  // Opening it again the same day continues the same draft.
  await page.goto(baseURL + `/scan/${TOKEN}/inspect/weekly`)
  await page.waitForURL(url => url.pathname === `/inspections/${id}`, { timeout: 60000 })
})
