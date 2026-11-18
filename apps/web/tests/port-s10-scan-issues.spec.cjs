/**
 * Port slice 10 (agent C) browser checks: issue reports from a QR scan.
 * - An anonymous visitor on a public_report scan_menu QR reports an issue with a photo: the confirmation shows a
 *   CA- number (no internal link), the report row holds the CAPA id and one photo, the scan log has report_issue.
 * - An employee_number QR sends anonymous visitors to identify (/scan/<token>?next=report).
 * - An employee identified on the QR (session seeded directly) reports with "out of service": the asset is
 *   out of service and the status history has a qr_issue row.
 * - The admin sees the reports at /qr/issues.
 *
 * Run (from apps/web): playwright test tests/port-s10-scan-issues.spec.cjs --reporter=line --workers=1
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
const ADMIN = '20000000-0000-4000-8000-000000000001'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const RUN = Date.now().toString().slice(-6)
const EMPLOYEE_NUMBER = `S10C${RUN}`

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

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

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const fixture = { assetId: null, personnelId: null, qrs: {} }

const createQr = async (key, accessMode) => {
  const number = await rest('/rest/v1/rpc/next_forge_qr_number', { method: 'POST', body: { p_organization_id: ORG } })
  const token = crypto.randomBytes(24).toString('hex')
  const [qr] = await rest('/rest/v1/forge_qr_codes', {
    method: 'POST',
    body: {
      organization_id: ORG,
      qr_number: number,
      token,
      name: `S10 issue ${key} ${RUN}`,
      target_type: 'asset',
      target_id: fixture.assetId,
      default_action: 'scan_menu',
      access_mode: accessMode,
      action_config: { reportIssue: true, markOutOfService: true },
      created_by: ADMIN
    }
  })

  fixture.qrs[key] = { id: qr.id, token, number }

  return fixture.qrs[key]
}

const reportsFor = qrId => rest(`/rest/v1/forge_qr_issue_reports?qr_code_id=eq.${qrId}&select=*&order=created_at.asc`)

const fillAndSend = async (page, description, { photo = false, outOfService = false } = {}) => {
  await page.locator('#issue-description').fill(description)
  await page.locator('#issue-priority').selectOption('high')
  await page.locator('#issue-category').selectOption('leak_spill')

  if (outOfService) await page.locator('input[name="outOfService"]').check()

  if (photo) {
    await page.locator('[data-testid="scan-issue-photo-input"]').setInputFiles({ name: 'leak.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.locator('[data-photo-status="ready"]')).toHaveCount(1, { timeout: 30000 })
  }

  await page.locator('[data-testid="scan-issue-submit"]').click()
  await expect(page.locator('[data-testid="scan-issue-done"]')).toBeVisible({ timeout: 60000 })
}

test.beforeAll(async () => {
  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `S10C-${RUN}`, name: `S10 Press ${RUN}`, location_id: LOCATION, created_by: ADMIN, updated_by: ADMIN }
  })

  fixture.assetId = asset.id

  const [person] = await rest('/rest/v1/forge_personnel', {
    method: 'POST',
    body: { organization_id: ORG, first_name: 'Ivy', last_name: `Issuefield${RUN}`, employee_number: EMPLOYEE_NUMBER, employment_status: 'active' }
  })

  fixture.personnelId = person.id

  await createQr('public', 'public_report')
  await createQr('employee', 'employee_number')
})

test.afterAll(async () => {
  for (const qr of Object.values(fixture.qrs)) {
    const reports = await reportsFor(qr.id).catch(() => [])

    for (const report of reports) {
      await rest(`/rest/v1/forge_notification_events?source_module=eq.qr_management&payload->>report_id=eq.${report.id}`, { method: 'DELETE' }).catch(() => {})
      if (report.corrective_action_id) {
        await rest(`/rest/v1/forge_record_links?target_resource_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
        await rest(`/rest/v1/forge_record_links?source_resource_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
        await rest(`/rest/v1/forge_tasks?source_id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
        await rest(`/rest/v1/forge_corrective_actions?id=eq.${report.corrective_action_id}`, { method: 'DELETE' }).catch(() => {})
      }
    }

    await rest(`/rest/v1/forge_qr_issue_uploads?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_qr_issue_reports?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_qr_scan_sessions?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qr.id}`, { method: 'DELETE' }).catch(() => {})
    await rest(`/rest/v1/forge_qr_codes?id=eq.${qr.id}`, { method: 'DELETE' }).catch(() => {})
  }

  if (fixture.assetId) await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.personnelId) await rest(`/rest/v1/forge_personnel?id=eq.${fixture.personnelId}`, { method: 'DELETE' }).catch(() => {})
})

test('anonymous visitor reports an issue with a photo on a public_report QR', async ({ browser }) => {
  const qr = fixture.qrs.public
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${baseURL}/scan/${qr.token}/report`)
  await expect(page.locator('[data-testid="scan-issue-form"]')).toBeVisible()
  // Anonymous viewers may not tag equipment out.
  await expect(page.locator('input[name="outOfService"]')).toHaveCount(0)

  await fillAndSend(page, `Hydraulic oil leaking under the press ${RUN}`, { photo: true })

  const capa = page.locator('[data-testid="scan-issue-capa"]')

  await expect(capa).toHaveText(/^CA-\d+/)
  // No internal links for anonymous viewers.
  await expect(page.locator('[data-testid="scan-issue-done"] a[href^="/corrective-actions"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="scan-issue-oos"]')).toHaveCount(0)

  const [report] = await reportsFor(qr.id)

  expect(report.anonymous).toBe(true)
  expect(report.priority).toBe('high')
  expect(report.category).toBe('leak_spill')
  expect(report.corrective_action_id).toBeTruthy()
  expect(report.photos).toHaveLength(1)
  expect(report.photos[0].path).toBe(`${ORG}/qr_issue/${qr.id}/` + report.photos[0].path.split('/').pop())
  expect(report.photos[0].type).toBe('image/png')

  const [ca] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${report.corrective_action_id}&select=*`)

  expect(ca.action_number).toBe(await capa.textContent())
  expect(ca.source_type).toBe('asset')
  expect(ca.source_id).toBe(report.id)
  expect(ca.severity).toBe('high')
  expect(ca.location_id).toBe(LOCATION)
  expect(ca.created_by).toBeNull()
  expect(ca.description).toContain(qr.number)

  const links = await rest(`/rest/v1/forge_record_links?source_resource_id=eq.${ca.id}&target_resource_id=eq.${fixture.assetId}&select=relationship_type`)

  expect(links.map(link => link.relationship_type)).toContain('equipment')

  const scans = await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qr.id}&action=eq.report_issue&select=*`)

  expect(scans).toHaveLength(1)
  expect(scans[0].record_type).toBe('corrective_action')
  expect(scans[0].record_id).toBe(ca.id)

  // An upload id from somewhere else is refused: the photo route rejects a non-image.
  const bad = await page.request.post(`${baseURL}/scan/${qr.token}/report/photos`, {
    multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<svg></svg>') } }
  })

  expect(bad.status()).toBe(400)
  await context.close()
})

test('employee_number QR sends anonymous visitors to identify first', async () => {
  const qr = fixture.qrs.employee
  const response = await fetch(`${baseURL}/scan/${qr.token}/report`, { redirect: 'manual' })

  expect([303, 307, 308]).toContain(response.status)
  expect(new URL(response.headers.get('location'), baseURL).pathname + new URL(response.headers.get('location'), baseURL).search).toBe(`/scan/${qr.token}?next=report`)

  const photo = await fetch(`${baseURL}/scan/${qr.token}/report/photos`, { method: 'POST', body: new FormData() })

  expect(photo.status).toBe(403)
})

test('identified employee reports with out of service and the asset is tagged out', async ({ browser }) => {
  const qr = fixture.qrs.employee
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

  const context = await browser.newContext()

  await context.addCookies([{ name: 'forge_scan_session', value: raw, domain: new URL(baseURL).hostname, path: `/scan/${qr.token}` }])

  const page = await context.newPage()

  await page.goto(`${baseURL}/scan/${qr.token}/report`)
  await expect(page.locator('[data-testid="scan-viewer"]')).toHaveAttribute('data-viewer', 'employee')
  await expect(page.locator('#issue-reporter')).toHaveCount(0)

  await fillAndSend(page, `Guard cracked on the press ${RUN}`, { outOfService: true })
  await expect(page.locator('[data-testid="scan-issue-oos"]')).toBeVisible()
  await expect(page.locator('[data-testid="scan-issue-capa"]')).toHaveText(/^CA-\d+/)
  await expect(page.locator('[data-testid="scan-issue-done"] a[href^="/corrective-actions"]')).toHaveCount(0)

  const [report] = await reportsFor(qr.id)

  expect(report.anonymous).toBe(false)
  expect(report.reporter_personnel_id).toBe(fixture.personnelId)
  expect(report.marked_out_of_service).toBe(true)
  expect(report.corrective_action_id).toBeTruthy()

  const [asset] = await rest(`/rest/v1/forge_assets?id=eq.${fixture.assetId}&select=status`)

  expect(asset.status).toBe('out_of_service')

  const history = await rest(`/rest/v1/forge_asset_status_history?asset_id=eq.${fixture.assetId}&source=eq.qr_issue&select=*`)

  expect(history).toHaveLength(1)
  expect(history[0].to_status).toBe('out_of_service')

  const scans = await rest(`/rest/v1/forge_qr_scans?qr_code_id=eq.${qr.id}&action=eq.report_issue&select=personnel_id,record_type`)

  expect(scans).toHaveLength(1)
  expect(scans[0].personnel_id).toBe(fixture.personnelId)
  await context.close()
})

test('admin sees the reports at /qr/issues', async ({ page }) => {
  const reports = [...(await reportsFor(fixture.qrs.public.id)), ...(await reportsFor(fixture.qrs.employee.id))]

  await login(page, 'admin@forge2.local')
  await page.goto(`${baseURL}/qr/issues`)

  for (const report of reports) {
    const row = page.locator(`[data-testid="scan-issue-row"][data-report-id="${report.id}"]`)

    await expect(row).toBeVisible()
    await expect(row.locator('[data-testid="scan-issue-capa-link"]')).toHaveText(/^CA-\d+/)
  }

  const employeeRow = page.locator(`[data-testid="scan-issue-row"][data-report-id="${reports[1].id}"]`)

  await expect(employeeRow.locator('[data-testid="scan-issue-oos-flag"]')).toBeVisible()
  await expect(page.locator(`[data-testid="scan-issue-row"][data-report-id="${reports[0].id}"] [data-testid="scan-issue-thumb"]`)).toHaveCount(1)
})
