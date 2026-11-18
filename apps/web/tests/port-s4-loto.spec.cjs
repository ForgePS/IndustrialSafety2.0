/**
 * Port slice 4 (Industrial 1.0 -> 2.0) browser smoke for Lockout / Tagout: review, return for
 * correction, approve, the printable sheet with its QR code, issuing and working a lockout through
 * to return to service, and the public QR page.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s4-loto.spec.cjs --reporter=line --workers=1
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

const seeded = { asset: null, procedure: null }

test.beforeAll(async () => {
  const [asset] = await rest('/rest/v1/forge_assets', {
    method: 'POST',
    body: { organization_id: ORG, asset_number: `S4UI-${RUN}`, name: `S4 Conveyor ${RUN}`, created_by: ADMIN, updated_by: ADMIN }
  })
  const number = await rest('/rest/v1/rpc/next_forge_loto_number', { method: 'POST', body: { p_organization_id: ORG } })
  const [procedure] = await rest('/rest/v1/forge_loto_procedures', {
    method: 'POST',
    body: {
      organization_id: ORG, procedure_number: number, asset_id: asset.id, title: `S4 Conveyor lockout ${RUN}`, status: 'review',
      special_precautions: 'Belt can coast after shutdown.', created_by: ADMIN, updated_by: ADMIN
    }
  })
  await rest('/rest/v1/forge_loto_energy_sources', {
    method: 'POST',
    body: {
      organization_id: ORG, procedure_id: procedure.id, energy_type: 'electrical', energy_code: 'E1', source_name: '480V drive disconnect',
      isolation_location: 'MCC-3 bucket 4', verification_method: 'Try start at local station', sort_order: 1, created_by: ADMIN, updated_by: ADMIN
    }
  })
  for (const [i, title] of ['Open and lock the disconnect', 'Block the take-up pulley'].entries()) {
    await rest('/rest/v1/forge_loto_steps', {
      method: 'POST',
      body: { organization_id: ORG, procedure_id: procedure.id, step_type: i ? 'verify' : 'isolate', title, instructions: title + '.', sort_order: i + 1, created_by: ADMIN, updated_by: ADMIN }
    })
  }
  seeded.asset = asset
  seeded.procedure = procedure
})

test.afterAll(async () => {
  if (!seeded.procedure) return
  const apps = await rest(`/rest/v1/forge_loto_applications?select=id&procedure_id=eq.${seeded.procedure.id}`)
  if (apps.length) await rest(`/rest/v1/forge_loto_application_locks?application_id=in.(${apps.map(a => a.id).join(',')})`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_loto_applications?procedure_id=eq.${seeded.procedure.id}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_loto_procedures?id=eq.${seeded.procedure.id}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_qr_codes?target_id=eq.${seeded.asset.id}&default_action=eq.loto_view`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_assets?id=eq.${seeded.asset.id}`, { method: 'DELETE' }).catch(() => {})
})

test('review, return, approve, print, lock out and return to service', async ({ page, context }) => {
  page.on('dialog', dialog => dialog.accept())
  await login(page, 'admin@forge2.local')
  const procedureUrl = '/loto/' + seeded.procedure.id

  // Return for correction, then resubmit and approve.
  await open(page, procedureUrl)
  await page.getByRole('button', { name: 'Return for Correction' }).click()
  await page.getByText('What needs to change').locator('xpath=following-sibling::textarea').fill('Add the take-up pulley block.')
  await page.getByRole('button', { name: 'Return to Author' }).click()
  await expect(page.getByText('Add the take-up pulley block.').first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Submit for Review' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit for Review' }).click()
  await expect(page.getByRole('button', { name: 'Approve Procedure' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Approve Procedure' }).click()
  await expect(page.getByRole('button', { name: 'Issue Lockout' })).toBeVisible({ timeout: 20000 })

  // Printable sheet: two pages, QR code created on first print.
  const print = await context.newPage()
  await open(print, '/loto-print?ids=' + seeded.procedure.id)
  await expect(print.locator('[data-loto-sheet]')).toHaveCount(2)
  await expect(print.getByText('ENERGY ISOLATION POINTS')).toBeVisible()
  await expect(print.getByText('MCC-3 bucket 4').first()).toBeVisible()
  await expect(print.getByText('RESTORING EQUIPMENT TO SERVICE')).toBeVisible()
  await expect(print.locator('[data-loto-sheet] svg').first()).toBeVisible()
  await print.close()

  // Issue the lockout.
  await page.getByRole('button', { name: 'Issue Lockout' }).click()
  await page.getByPlaceholder('e.g. Replace drive belt on conveyor C-3').fill('Replace drive belt')
  await page.getByPlaceholder('Operators and others in the area').fill('Line 3 operators')
  await page.getByPlaceholder('Name').first().fill('Pat Mechanic')
  await page.getByPlaceholder('Lock / tag #').first().fill('L-' + RUN)
  await page.getByText('Affected employees have been told').click()
  await page.getByRole('button', { name: /^Issue Lockout$/ }).last().click()
  await page.waitForURL(/\/loto\/lockouts\/[0-9a-f-]{36}$/, { timeout: 30000 })
  await page.waitForLoadState('networkidle')

  // Work it: check steps, verify, remove the lock, return to service.
  await expect(page.getByText(/LKO-\d{6}/).first()).toBeVisible()
  await page.getByText('1. Open and lock the disconnect').click()
  await page.waitForLoadState('networkidle')
  await page.getByText('2. Block the take-up pulley').click()
  await page.waitForLoadState('networkidle')
  await page.getByText('Zero energy confirmed at every isolation point').click()
  await page.getByText('Try-start done').click()
  await expect(page.getByRole('button', { name: 'Verify' })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('button', { name: 'Return to Service' })).toBeVisible({ timeout: 20000 })

  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByPlaceholder(/Required when removing someone else/).fill('Holder present; supervisor approved')
  await page.getByRole('button', { name: 'Remove lock' }).click()
  await expect(page.getByText(/still on/)).toHaveCount(0, { timeout: 20000 })

  await page.getByText(/Restoration complete/).click()
  await page.getByRole('button', { name: 'Return to Service' }).click()
  await expect
    .poll(async () => (await rest(`/rest/v1/forge_loto_applications?select=status&procedure_id=eq.${seeded.procedure.id}`))[0].status, { timeout: 20000 })
    .toBe('completed')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Return to Service' })).toHaveCount(0, { timeout: 20000 })
})

test('the QR sticker opens the approved procedure without signing in', async ({ browser }) => {
  const [qr] = await rest(`/rest/v1/forge_qr_codes?select=token&target_id=eq.${seeded.asset.id}&default_action=eq.loto_view&status=eq.active`)
  expect(qr && qr.token).toBeTruthy()

  const anonymous = await browser.newContext()
  const page = await anonymous.newPage()
  // The scan route redirects to NEXT_PUBLIC_APP_URL, which may be another port; check the target, then open it here.
  const scan = await fetch(baseURL + '/q/' + qr.token, { redirect: 'manual' })
  expect(new URL(scan.headers.get('location')).pathname).toBe('/q/' + qr.token + '/loto')
  await open(page, '/q/' + qr.token + '/loto')
  await expect(page.locator('[data-public-loto]')).toHaveCount(1)
  await expect(page.getByText('480V drive disconnect')).toBeVisible()
  await expect(page.getByText('Pat Mechanic')).toHaveCount(0)
  await open(page, '/q/' + 'f'.repeat(48) + '/loto')
  await expect(page).toHaveURL(/\/q\/unavailable/)
  await anonymous.close()
})
