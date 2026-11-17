/**
 * Port slice 8 (piece C) browser checks: incident root-cause analysis (5 Whys). Fill the whys, root cause and an
 * action, save, reload (persists), Create CAPA for the action (one CAPA, linked to the incident, shown on the
 * action), the printable RCA, and the plain Create CAPA next to Create Risk.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s8-incident-rca.spec.cjs --reporter=line --workers=1
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

const fixture = { incident: null }

const capasForIncident = async () => {
  const id = fixture.incident.id
  const rca = (await rest(`/rest/v1/forge_incident_rca?incident_id=eq.${id}&select=actions`).catch(() => []))[0]
  const keys = (rca?.actions || []).map(item => item.key)
  const byAction = keys.length
    ? await rest(`/rest/v1/forge_corrective_actions?organization_id=eq.${ORG}&source_type=eq.incident_rca_action&source_id=in.(${keys.join(',')})&select=id,action_number,source_id,status`)
    : []
  const direct = await rest(`/rest/v1/forge_corrective_actions?organization_id=eq.${ORG}&source_type=eq.incident&source_id=eq.${id}&select=id,action_number,source_id,status`)

  return { byAction, direct, keys }
}

test.beforeAll(async () => {
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG,
      incident_number: `INC-S8RCA-${RUN}`,
      status: 'submitted',
      incident_type: 'other',
      severity: 'serious',
      occurred_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      reported_by_user_id: ADMIN,
      summary: `S8 RCA forklift struck racking ${RUN}`,
      description: `Forklift reversed into racking in aisle 4 (${RUN}).`,
      immediate_actions: 'Area cordoned off.',
      created_by: ADMIN
    }
  })

  fixture.incident = incident
})

test.afterAll(async () => {
  if (!fixture.incident) return
  const { byAction, direct } = await capasForIncident().catch(() => ({ byAction: [], direct: [] }))

  for (const capa of [...byAction, ...direct]) {
    await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'PATCH', body: { linked_task_id: null }, prefer: 'return=minimal' }).catch(() => {})
    await rest(`/rest/v1/forge_tasks?source_type=eq.corrective_action&source_id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
    await rest(`/rest/v1/forge_record_links?target_resource_id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
    await rest(`/rest/v1/forge_corrective_actions?id=eq.${capa.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
  }

  await rest(`/rest/v1/forge_incidents?id=eq.${fixture.incident.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
})

test('fill the 5 whys, save, and the analysis persists on reload', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/incidents/' + fixture.incident.id)

  const panel = page.getByTestId('incident-rca-panel')

  await expect(panel).toBeVisible({ timeout: 60000 })

  // Seeded like 1.0: problem statement from the description, why #1 from the incident title.
  await expect(panel.locator('#rca-problem')).toHaveValue(`Forklift reversed into racking in aisle 4 (${RUN}).`)
  await expect(panel.locator('#rca-why-q-0')).toHaveValue(`Why did "S8 RCA forklift struck racking ${RUN}" occur?`)

  await panel.locator('#rca-why-a-0').fill(`Driver could not see behind the load ${RUN}`)
  await panel.locator('#rca-why-a-1').fill('Rear mirror was broken')
  await panel.locator('#rca-why-a-2').fill('Pre-use checks were skipped')
  await panel.locator('#rca-root-cause').fill(`No enforced pre-use inspection ${RUN}`)
  await panel.getByRole('button', { name: 'Add factor' }).click()
  await panel.getByLabel('Contributing factor 1').fill('Night shift fatigue')
  await panel.locator('#rca-action-0').fill(`Enforce daily forklift pre-use checks ${RUN}`)

  const owner = panel.locator('#rca-action-owner-0')
  const ownerValues = await owner.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean))

  if (ownerValues.length) await owner.selectOption(ownerValues[0])
  await panel.locator('#rca-action-due-0').fill('2026-12-15')

  // Create CAPA waits for a save.
  await expect(panel.getByRole('button', { name: 'Create CAPA' })).toBeDisabled()

  await panel.getByRole('button', { name: 'Save analysis' }).click()
  await expect(panel.getByRole('status')).toHaveText('Root-cause analysis saved.')

  await open(page, '/incidents/' + fixture.incident.id)
  const reloaded = page.getByTestId('incident-rca-panel')

  await expect(reloaded.locator('#rca-why-a-0')).toHaveValue(`Driver could not see behind the load ${RUN}`)
  await expect(reloaded.locator('#rca-why-q-1')).toHaveValue(`Why did "Driver could not see behind the load ${RUN}" happen?`)
  await expect(reloaded.locator('#rca-root-cause')).toHaveValue(`No enforced pre-use inspection ${RUN}`)
  await expect(reloaded.getByLabel('Contributing factor 1')).toHaveValue('Night shift fatigue')
  await expect(reloaded.locator('#rca-action-0')).toHaveValue(`Enforce daily forklift pre-use checks ${RUN}`)
  await expect(reloaded.locator('#rca-action-due-0')).toHaveValue('2026-12-15')

  const [stored] = await rest(`/rest/v1/forge_incident_rca?incident_id=eq.${fixture.incident.id}&select=*`)

  expect(stored.organization_id).toBe(ORG)
  expect(stored.five_whys).toHaveLength(5)
  expect(stored.actions).toHaveLength(1)
})

test('Create CAPA for an RCA action opens one CAPA linked to the incident and shows it on the action', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/incidents/' + fixture.incident.id)

  const panel = page.getByTestId('incident-rca-panel')

  await panel.getByRole('button', { name: 'Create CAPA' }).click()

  const capaLink = panel.getByTestId('rca-action-capa').getByRole('link')

  await expect(capaLink).toBeVisible({ timeout: 60000 })

  const { byAction, keys } = await capasForIncident()

  expect(byAction).toHaveLength(1)
  expect(byAction[0].source_id).toBe(keys[0])
  await expect(capaLink).toHaveText(byAction[0].action_number)
  await expect(capaLink).toHaveAttribute('href', '/corrective-actions/' + byAction[0].id)

  const [capa] = await rest(`/rest/v1/forge_corrective_actions?id=eq.${byAction[0].id}&select=title,severity,due_at,root_cause,source_reference`)

  expect(capa.title).toBe(`Enforce daily forklift pre-use checks ${RUN}`)
  expect(capa.severity).toBe('high')
  expect(capa.root_cause).toBe(`No enforced pre-use inspection ${RUN}`)
  expect(capa.source_reference).toBe(fixture.incident.incident_number)
  expect(String(capa.due_at).slice(0, 10)).toBe('2026-12-15')

  const links = await rest(
    `/rest/v1/forge_record_links?source_resource_type=eq.incident&source_resource_id=eq.${fixture.incident.id}&target_resource_type=eq.corrective_action&target_resource_id=eq.${byAction[0].id}&select=relationship_type`
  )

  expect(links).toEqual([{ relationship_type: 'generated_capa' }])

  const [stored] = await rest(`/rest/v1/forge_incident_rca?incident_id=eq.${fixture.incident.id}&select=actions`)

  expect(stored.actions[0].capaId).toBe(byAction[0].id)
  expect(stored.actions[0].capaNumber).toBe(byAction[0].action_number)

  // The CAPA survives a reload, and the action can no longer open a second one.
  await open(page, '/incidents/' + fixture.incident.id)
  await expect(page.getByTestId('incident-rca-panel').getByTestId('rca-action-capa').getByRole('link')).toHaveText(byAction[0].action_number)
  await expect(page.getByTestId('incident-rca-panel').getByRole('button', { name: 'Create CAPA' })).toHaveCount(0)
})

test('the printable RCA renders the analysis', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/incidents/' + fixture.incident.id)

  await expect(page.getByTestId('incident-rca-panel').getByRole('link', { name: 'Print RCA' })).toHaveAttribute('href', `/incidents/${fixture.incident.id}/rca/print`)

  await open(page, `/incidents/${fixture.incident.id}/rca/print`)

  const sheet = page.locator('[data-rca-print]')

  await expect(sheet.getByRole('heading', { name: 'Root Cause Analysis' })).toBeVisible({ timeout: 60000 })
  await expect(sheet).toContainText(fixture.incident.incident_number)
  await expect(sheet.getByTestId('rca-print-why').first()).toHaveText(`Driver could not see behind the load ${RUN}`)
  await expect(sheet).toContainText(`No enforced pre-use inspection ${RUN}`)
  await expect(sheet).toContainText('Night shift fatigue')
  await expect(sheet).toContainText(`Enforce daily forklift pre-use checks ${RUN}`)
  await expect(sheet).toContainText('12/15/2026')
  await expect(sheet).toContainText('Reviewed and approved by')
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()

  const { byAction } = await capasForIncident()

  await expect(sheet).toContainText(byAction[0].action_number)
})

test('Create CAPA next to Create Risk opens a CAPA for the incident itself', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/incidents/' + fixture.incident.id)

  await expect(page.getByRole('button', { name: 'Create Risk' })).toBeVisible()

  // The header button (the RCA panel's per-action buttons are gone once the action has its CAPA).
  await page.getByRole('button', { name: 'Create CAPA' }).first().click()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]{36}/, { timeout: 60000 })

  const { direct } = await capasForIncident()

  expect(direct).toHaveLength(1)
  expect(page.url()).toContain('/corrective-actions/' + direct[0].id)

  const links = await rest(
    `/rest/v1/forge_record_links?source_resource_type=eq.incident&source_resource_id=eq.${fixture.incident.id}&target_resource_id=eq.${direct[0].id}&select=relationship_type`
  )

  expect(links).toEqual([{ relationship_type: 'generated_capa' }])
})
