/**
 * Port slice 8 (piece A) browser checks: inspection finding → Corrective Action. A finding can open a CAPA by hand
 * ("Create CAPA"), submitting the inspection opens one for every finding still open (1.0's completion behaviour),
 * closed findings are skipped, re-runs reuse the existing CAPA, and the finding links to /corrective-actions/<id>.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s8-inspection-capa.spec.cjs --reporter=line --workers=1
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
const RUN = Date.now().toString().slice(-6)

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  // PostgREST rejects a bulk insert whose rows have different columns; post those one at a time.
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

// Wait for hydration, so client controls react to the first click.
const open = async (page, url) => {
  await page.goto(baseURL + url)
  await page.waitForLoadState('networkidle')
}

const fixture = { inspection: null, location: null, findings: {} }

const capasFor = findingId =>
  rest(`/rest/v1/forge_corrective_actions?organization_id=eq.${ORG}&source_type=eq.inspection_finding&source_id=eq.${findingId}&select=*`)

const findingCard = (page, title) => page.locator('div.rounded-lg.border.p-4').filter({ has: page.getByText(title, { exact: true }) })

test.beforeAll(async () => {
  ;[fixture.location] = await rest(`/rest/v1/locations?organization_id=eq.${ORG}&is_active=eq.true&select=id,name&limit=1`)

  const [inspection] = await rest('/rest/v1/forge_inspections', {
    method: 'POST',
    body: {
      organization_id: ORG,
      inspection_number: `INS-S8-${RUN}`,
      template_name_snapshot: 'S8 CAPA check',
      status: 'in_progress',
      inspection_date: new Date().toISOString().slice(0, 10),
      location_id: fixture.location?.id || null,
      inspector_user_id: ADMIN,
      created_by: ADMIN
    }
  })

  fixture.inspection = inspection

  const findings = await rest('/rest/v1/forge_inspection_findings', {
    method: 'POST',
    body: [
      { organization_id: ORG, inspection_id: inspection.id, title: `S8 guard missing ${RUN}`, description: 'Belt guard removed on line 2', severity: 'high', status: 'open', due_date: '2026-12-31', corrective_action: 'Refit the guard', created_by: ADMIN },
      { organization_id: ORG, inspection_id: inspection.id, title: `S8 label faded ${RUN}`, severity: 'low', status: 'in_progress', created_by: ADMIN },
      { organization_id: ORG, inspection_id: inspection.id, title: `S8 already fixed ${RUN}`, severity: 'critical', status: 'closed', closed_at: new Date().toISOString(), created_by: ADMIN }
    ]
  })

  for (const finding of findings) fixture.findings[finding.title.split(' ')[1]] = finding
})

test.afterAll(async () => {
  const findingIds = Object.values(fixture.findings).map(finding => finding.id)

  if (findingIds.length) {
    const capas = await rest(`/rest/v1/forge_corrective_actions?organization_id=eq.${ORG}&source_type=eq.inspection_finding&source_id=in.(${findingIds.join(',')})&select=id,linked_task_id`).catch(() => [])

    for (const capa of capas) {
      await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'PATCH', body: { linked_task_id: null }, prefer: 'return=minimal' }).catch(() => {})
      await rest(`/rest/v1/forge_tasks?source_type=eq.corrective_action&source_id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
      await rest(`/rest/v1/forge_record_links?target_resource_id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
      await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
    }
  }

  if (fixture.inspection) await rest(`/rest/v1/forge_inspections?id=eq.${fixture.inspection.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
})

test('Create CAPA on a finding opens one Corrective Action and links to it', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/inspections/' + fixture.inspection.id)

  const label = findingCard(page, fixture.findings.label.title)

  await label.getByRole('button', { name: 'Create CAPA' }).click()

  const link = label.getByRole('link', { name: /Open CAPA CA-/ })

  await expect(link).toBeVisible({ timeout: 30000 })

  const [capa] = await capasFor(fixture.findings.label.id)

  expect(capa.severity).toBe('low')
  expect(capa.title).toBe('Inspection finding: ' + fixture.findings.label.title)
  expect(capa.source_reference).toBe(`INS-S8-${RUN} / ${fixture.findings.label.title}`)
  expect(capa.location_id).toBe(fixture.location?.id || null)
  expect(capa.linked_task_id).toBeTruthy()
  // No finding due date → 1.0's 90-day window.
  expect(Math.round((Date.parse(capa.due_at) - Date.now()) / 86_400_000)).toBe(90)
  await expect(link).toHaveAttribute('href', '/corrective-actions/' + capa.id)
  await expect(label.getByTestId('finding-capa')).toContainText(capa.action_number)
  await expect(label.getByTestId('finding-capa')).toContainText('Open')

  const links = await rest(`/rest/v1/forge_record_links?source_resource_type=eq.inspection_finding&source_resource_id=eq.${fixture.findings.label.id}&relationship_type=eq.generated_capa&select=target_resource_id`)

  expect(links.map(row => row.target_resource_id)).toEqual([capa.id])
})

test('submitting the inspection opens CAPAs for the remaining open findings only', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/inspections/' + fixture.inspection.id)

  await page.getByRole('button', { name: 'Submit for Review' }).click()
  await expect(page.getByText(/1 Corrective Action opened/)).toBeVisible({ timeout: 30000 })

  const [guard] = await capasFor(fixture.findings.guard.id)

  expect(guard.severity).toBe('high')
  expect(guard.due_at.slice(0, 10)).toBe('2026-12-31')
  expect(guard.description).toContain('Belt guard removed on line 2')
  expect(guard.description).toContain('Refit the guard')

  // The hand-made CAPA is reused, and the closed finding gets none.
  expect(await capasFor(fixture.findings.label.id)).toHaveLength(1)
  expect(await capasFor(fixture.findings.already.id)).toHaveLength(0)

  const card = findingCard(page, fixture.findings.guard.title)

  await expect(card.getByRole('link', { name: 'Open CAPA ' + guard.action_number })).toBeVisible({ timeout: 30000 })
  // The legacy inline corrective-action text stays readable.
  await expect(card).toContainText('Earlier corrective action note: Refit the guard')
  await expect(findingCard(page, fixture.findings.already.title).getByRole('button', { name: 'Create CAPA' })).toHaveCount(0)

  await card.getByRole('link', { name: 'Open CAPA ' + guard.action_number }).click()
  await page.waitForURL(url => url.pathname === '/corrective-actions/' + guard.id, { timeout: 60000 })
  await expect(page.getByText(guard.action_number).first()).toBeVisible({ timeout: 30000 })
})
