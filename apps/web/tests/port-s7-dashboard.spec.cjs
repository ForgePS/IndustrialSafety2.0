/**
 * Port slice 7 browser checks: the home dashboard blocks, attention counts and links, Tasks Due,
 * the Safety Index period switch, and Customize (hide, size, move, pin modules, save, reset), saved
 * per user.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s7-dashboard.spec.cjs --reporter=line --workers=1
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

const layoutFilter = `organization_id=eq.${ORG}&user_id=eq.${ADMIN}`
const fixture = { savedLayout: null, taskId: null }

test.beforeAll(async () => {
  fixture.savedLayout = (await rest(`/rest/v1/forge_dashboard_layouts?${layoutFilter}&select=layout`))[0] || null
  await rest(`/rest/v1/forge_dashboard_layouts?${layoutFilter}`, { method: 'DELETE' })

  const dueAt = new Date(Date.now() - 3 * 86_400_000).toISOString()

  const [task] = await rest('/rest/v1/forge_tasks', {
    method: 'POST',
    body: { organization_id: ORG, task_number: `TSK-S7-${RUN}`, title: `S7 overdue task ${RUN}`, status: 'open', priority: 'high', assigned_user_id: ADMIN, due_at: dueAt, created_by: ADMIN }
  })

  fixture.taskId = task.id
})

test.afterAll(async () => {
  if (fixture.taskId) await rest(`/rest/v1/forge_tasks?id=eq.${fixture.taskId}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/forge_dashboard_layouts?${layoutFilter}`, { method: 'DELETE' }).catch(() => {})

  if (fixture.savedLayout) {
    await rest('/rest/v1/forge_dashboard_layouts', { method: 'POST', body: { organization_id: ORG, user_id: ADMIN, layout: fixture.savedLayout.layout } }).catch(() => {})
  }
})

test('the dashboard shows every block, attention counts, my overdue task and the safety index', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dashboard')

  const blocks = page.locator('[data-dashboard-block]')

  await expect(blocks.first()).toBeVisible({ timeout: 60000 })
  expect(await blocks.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-dashboard-block')))).toEqual([
    'attention',
    'tasks-due',
    'safety-index',
    'task-scheduler',
    'incident-trend',
    'injury-history',
    'inspections-by-site',
    'body-map',
    'workspace'
  ])

  // My open tasks counts the seeded overdue task, and Tasks Due lists it as overdue.
  const mine = page.locator('[data-attention="tasks-mine"]')

  await expect(mine).toBeVisible()
  await expect(mine).toContainText(/overdue/)
  await expect(page.getByTestId('dashboard-tasks-due').getByRole('link', { name: new RegExp(`S7 overdue task ${RUN}.*Overdue`) })).toBeVisible()

  await expect(page.getByTestId('dashboard-quick-actions').getByRole('link', { name: 'Report Incident' })).toHaveAttribute('href', '/incidents/create')

  // The safety index switches period.
  const safety = page.getByTestId('dashboard-safety-index')

  await expect(safety).toContainText('Last 12 months')
  await safety.getByRole('button', { name: '6 months' }).click()
  await expect(safety).toContainText('Last 6 months')
  await expect(page.getByTestId('safety-grade')).toHaveText(/^[ABCDF]$/)

  // An attention card opens its module.
  await page.locator('[data-attention="tasks-mine"]').click()
  await page.waitForURL(/\/tasks$/)
})

test('customize: hide, resize, move and unpin, saved per user, then reset', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/dashboard')

  await page.getByRole('button', { name: 'Customize' }).click()
  const panel = page.getByTestId('dashboard-customize')

  await expect(panel).toBeVisible()
  await panel.getByLabel('Show Incident Trend').uncheck()
  await panel.getByLabel('My Workspace size').selectOption('wide')
  await panel.getByRole('button', { name: 'Move Safety Index up' }).click()

  const firstModule = panel.locator('label:has(input[type="checkbox"])').filter({ hasNot: page.locator('[aria-label^="Show "]') }).first()
  const moduleName = (await firstModule.innerText()).trim()

  await firstModule.locator('input').uncheck()
  await panel.getByRole('button', { name: 'Save Layout' }).click()
  await expect(page.getByText('Dashboard layout saved.')).toBeVisible({ timeout: 30000 })
  await expect(panel).toBeHidden()

  await open(page, '/dashboard')
  await expect(page.locator('[data-dashboard-block="incident-trend"]')).toHaveCount(0)
  await expect(page.locator('[data-dashboard-block="workspace"]')).toHaveAttribute('data-dashboard-size', 'wide')

  const order = await page.locator('[data-dashboard-block]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-dashboard-block')))

  expect(order.indexOf('safety-index')).toBeLessThan(order.indexOf('tasks-due'))
  await expect(page.getByTestId('dashboard-workspace').getByText(moduleName, { exact: true })).toHaveCount(0)

  const [row] = await rest(`/rest/v1/forge_dashboard_layouts?${layoutFilter}&select=layout`)

  expect(row.layout.items.find(item => item.id === 'incident-trend').visible).toBe(false)
  expect(Array.isArray(row.layout.pinnedModules)).toBe(true)

  // Another user's dashboard is not affected.
  const member = await page.context().browser().newContext()
  const memberPage = await member.newPage()

  await login(memberPage, 'user@forge2.local')
  await open(memberPage, '/dashboard')
  await expect(memberPage.locator('[data-dashboard-block="workspace"]')).toHaveAttribute('data-dashboard-size', 'full', { timeout: 60000 })
  await member.close()

  // Reset brings the default back.
  await page.getByRole('button', { name: 'Customize' }).click()
  await panel.getByRole('button', { name: 'Reset to Default' }).click()
  await expect(page.getByText('Dashboard reset to the default layout.')).toBeVisible({ timeout: 30000 })
  await open(page, '/dashboard')
  await expect(page.locator('[data-dashboard-block="incident-trend"]')).toHaveCount(1)
  await expect(page.locator('[data-dashboard-block="workspace"]')).toHaveAttribute('data-dashboard-size', 'full')
  expect(await rest(`/rest/v1/forge_dashboard_layouts?${layoutFilter}&select=layout`)).toEqual([])
})
