/**
 * Batch 1 parity browser smoke for Lockout / Tagout: list summary counts, search / filters / sorting /
 * paging in the URL, duplicating a draft step, retiring from a list row, and the lockout history search.
 * Seeds its own asset, procedure and closed lockout and removes them afterwards.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-b1-loto.spec.cjs --reporter=line --workers=1
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
const TITLE = `B1 Mixer lockout ${RUN}`
const HOLDER = `B1 Holder ${RUN}`

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

const open = async (page, url) => {
  await page.goto(url.startsWith('http') ? url : baseURL + url)
  await page.waitForLoadState('networkidle')
}

const seeded = { asset: null, procedure: null, lockout: null }

test.beforeAll(async () => {
  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `B1UI-${RUN}`, name: `B1 Mixer ${RUN}`, created_by: ADMIN, updated_by: ADMIN }
  })
  const number = await rest('/rest/v1/rpc/next_forge_loto_number', { method: 'POST', body: { p_organization_id: ORG } })
  const [procedure] = await rest('/rest/v1/forge_loto_procedures', {
    method: 'POST',
    body: { organization_id: ORG, procedure_number: number, asset_id: asset.id, title: TITLE, status: 'draft', created_by: ADMIN, updated_by: ADMIN }
  })
  for (const [i, title] of ['Open the mixer disconnect', 'Bleed the air line'].entries()) {
    await rest('/rest/v1/forge_loto_steps', {
      method: 'POST',
      body: {
        organization_id: ORG, procedure_id: procedure.id, step_type: 'isolate', title, instructions: title + '.',
        warning_text: i ? null : 'Stand clear of the blades.', sort_order: (i + 1) * 10, created_by: ADMIN, updated_by: ADMIN
      }
    })
  }
  const [lockout] = await rest('/rest/v1/forge_loto_applications', {
    method: 'POST',
    body: {
      organization_id: ORG, procedure_id: procedure.id, asset_id: asset.id, status: 'canceled', lockout_number: `B1-${RUN}`,
      work_description: `Batch one seal swap ${RUN}`, started_by: ADMIN, canceled_at: new Date().toISOString(), canceled_by: ADMIN, cancel_reason: 'Test'
    }
  })
  await rest('/rest/v1/forge_loto_application_locks', {
    method: 'POST',
    body: {
      organization_id: ORG, application_id: lockout.id, holder_name: HOLDER, lock_tag_id: `T-${RUN}`, applied_by: ADMIN,
      removed_at: new Date().toISOString(), removed_by: ADMIN
    }
  })
  Object.assign(seeded, { asset, procedure, lockout })
})

test.afterAll(async () => {
  if (!seeded.procedure) return
  const apps = await rest(`/rest/v1/forge_loto_applications?select=id&procedure_id=eq.${seeded.procedure.id}`)
  if (apps.length) await rest(`/rest/v1/forge_loto_application_locks?application_id=in.(${apps.map(a => a.id).join(',')})`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_loto_applications?procedure_id=eq.${seeded.procedure.id}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_loto_procedures?id=eq.${seeded.procedure.id}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_assets?id=eq.${seeded.asset.id}`, { method: 'DELETE' }).catch(() => {})
})

test('summary counts, search, sorting and paging live in the URL', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/loto')

  await expect(page.getByTestId('loto-stat-procedures')).toBeVisible()
  await expect(page.getByTestId('loto-stat-drafts')).toHaveText(/^\d+$/)
  await expect(page.getByTestId('loto-stat-open-lockouts')).toHaveText(/^\d+$/)

  await page.getByPlaceholder('Search LOTO procedures...').fill(TITLE)
  await page.waitForURL(url => url.searchParams.get('q') === TITLE, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('cell', { name: new RegExp(TITLE) })).toBeVisible()
  await expect(page.getByTestId('loto-paging-summary')).toHaveText('Showing 1–1 of 1')

  await page.getByRole('button', { name: 'Sort by Next Review' }).click()
  await page.waitForURL(url => url.searchParams.get('sort') === 'review' && url.searchParams.get('dir') === 'asc')
  await page.getByRole('button', { name: 'Sort by Next Review' }).click()
  await page.waitForURL(url => url.searchParams.get('dir') === 'desc')

  await page.getByLabel('Rows per page').selectOption('50')
  await page.waitForURL(url => url.searchParams.get('size') === '50')

  await page.getByLabel('Status', { exact: true }).selectOption('approved')
  await page.waitForURL(url => url.searchParams.get('status') === 'approved')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('No LOTO procedures match the current filters.')).toBeVisible()

  // A bad page number is clamped rather than showing an empty page.
  await open(page, '/loto?q=' + encodeURIComponent(TITLE) + '&page=9')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
})

test('duplicate a step in a draft procedure', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/loto/' + seeded.procedure.id)
  await page.getByRole('button', { name: 'Duplicate: Open the mixer disconnect' }).click()
  await expect(page.getByRole('button', { name: 'Duplicate: Open the mixer disconnect' })).toHaveCount(2, { timeout: 20000 })

  const steps = await rest(`/rest/v1/forge_loto_steps?select=title,warning_text,sort_order&procedure_id=eq.${seeded.procedure.id}&order=sort_order`)
  expect(steps.map(step => step.title)).toEqual(['Open the mixer disconnect', 'Open the mixer disconnect', 'Bleed the air line'])
  expect(steps[1].warning_text).toBe('Stand clear of the blades.')

  const audit = await rest(`/rest/v1/forge_creator_audit_log?select=id&action=eq.loto.step_duplicated&organization_id=eq.${ORG}&before_value->>source_step_id=not.is.null&order=created_at.desc&limit=1`)
  expect(audit.length).toBe(1)
})

test('lockout history search by holder, equipment, procedure and text', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/loto/lockouts?view=history')

  await page.getByLabel('Lock holder').selectOption({ label: HOLDER })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/view=history/)
  await expect(page.getByRole('link', { name: `B1-${RUN}` })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2)

  await open(page, `/loto/lockouts?view=history&asset=${seeded.asset.id}&procedure=${seeded.procedure.id}`)
  await expect(page.getByRole('link', { name: `B1-${RUN}` })).toBeVisible()

  await open(page, '/loto/lockouts?view=history&q=' + encodeURIComponent(`T-${RUN}`))
  await expect(page.getByRole('link', { name: `B1-${RUN}` })).toBeVisible()

  await open(page, '/loto/lockouts?view=history&q=' + encodeURIComponent(`seal swap ${RUN}`))
  await expect(page.getByRole('link', { name: `B1-${RUN}` })).toBeVisible()

  // The open view applies the same search; this lockout is closed.
  await open(page, '/loto/lockouts?q=' + encodeURIComponent(`B1-${RUN}`))
  await expect(page.getByText('No lockouts match the search.')).toBeVisible()
})

test('retire a procedure from its list row', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept('Batch 1 retire test'))
  await login(page, 'admin@forge2.local')
  await open(page, '/loto?q=' + encodeURIComponent(TITLE))
  await page.getByRole('button', { name: 'Retire ' + seeded.procedure.procedure_number }).click()
  await expect(page.getByText('No LOTO procedures match the current filters.')).toBeVisible({ timeout: 20000 })

  const [after] = await rest(`/rest/v1/forge_loto_procedures?select=status,retirement_reason&id=eq.${seeded.procedure.id}`)
  expect(after).toEqual({ status: 'retired', retirement_reason: 'Batch 1 retire test' })

  await open(page, '/loto?status=retired&q=' + encodeURIComponent(TITLE))
  await expect(page.getByRole('cell', { name: new RegExp(TITLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retire ' + seeded.procedure.procedure_number })).toHaveCount(0)
})
