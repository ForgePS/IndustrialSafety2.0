const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
const outsideOrgId = '30000000-0000-4000-8000-000000000100'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 20000 })
}

async function waitForCapaPost(page, timeout = 30000) {
  return page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/corrective-actions(\/|$)/i.test(new URL(response.url()).pathname),
    { timeout }
  )
}

async function createCapa(page, title) {
  await page.goto(baseURL + '/corrective-actions/create')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(
    'NX-01 workflow core smoke: guarding deficiency requiring CAPA lifecycle and shared evidence panels.'
  )
  await page.locator('select[name="action_type"]').selectOption('corrective')
  await page.locator('select[name="severity"]').selectOption('high')
  await page.locator('select[name="source_type"]').selectOption('manual')
  await page.locator('select[name="assigned_personnel_id"]').selectOption({
    label: 'Forge Demo User (EMP-0001)'
  })
  await page.locator('select[name="location_id"]').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.locator('input[name="due_at"]').fill('2026-10-15T12:00')
  await page.locator('textarea[name="immediate_containment"]').fill('Machine locked out pending repair.')
  await page.locator('textarea[name="root_cause"]').fill('Inspection checklist omitted fastener torque.')
  await page.locator('textarea[name="action_plan"]').fill(
    'Replace hardware, torque to spec, update inspection checklist.'
  )
  await page.locator('textarea[name="preventive_action"]').fill('Audit similar assets.')

  const createPost = waitForCapaPost(page)
  await page.getByRole('button', { name: 'Save Corrective Action' }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test('NX-01 universal workflow + shared evidence core smoke', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'user@forge2.local')

  const title = 'NX01 Workflow Smoke ' + Date.now()
  await createCapa(page, title)

  const capaUrl = page.url()
  const capaId = capaUrl.split('/').pop()

  await expect(page.getByTestId('workflow-status')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('workflow-status')).toContainText(/Workflow · In Progress/i)
  await expect(page.getByTestId('workflow-timeline')).toBeVisible()

  // Shared comment persists across reload
  await expect(page.getByTestId('shared-comments')).toBeVisible()
  const commentText = 'NX-01 shared comment ' + Date.now()
  await page.getByTestId('shared-comments').locator('textarea[name="body"]').fill(commentText)
  const commentPost = page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().includes('/corrective-actions'),
    { timeout: 20000 }
  )
  await page.getByTestId('shared-comments').getByRole('button', { name: /Add Comment|Save Comment/i }).click()
  await commentPost
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByTestId('shared-comments')).toContainText(commentText)

  // Record link to linked task if visible
  await expect(page.getByTestId('record-links')).toBeVisible()
  const taskLink = page.getByRole('link', { name: /Task /i })
  if (await taskLink.isVisible().catch(() => false)) {
    const href = await taskLink.getAttribute('href')
    const taskId = href?.split('/').pop()
    if (taskId) {
      await page.getByTestId('record-links').locator('select[name="targetResourceType"]').selectOption('task')
      await page.getByTestId('record-links').locator('input[name="targetResourceId"]').fill(taskId)
      const linkPost = page.waitForResponse(
        response => response.request().method() === 'POST' && response.url().includes('/corrective-actions'),
        { timeout: 20000 }
      )
      await page.getByTestId('record-links').getByRole('button', { name: /Create link/i }).click()
      await linkPost
      await page.reload({ waitUntil: 'load' })
      await expect(page.getByTestId('record-links')).toContainText(/task/i)
    }
  }

  // Evidence upload
  await expect(page.getByTestId('record-evidence')).toBeVisible()
  const evidenceFile = Buffer.from('NX-01 evidence smoke ' + Date.now())
  await page.getByTestId('record-evidence').locator('input[type="file"]').setInputFiles({
    name: 'nx01-evidence.txt',
    mimeType: 'text/plain',
    buffer: evidenceFile
  })
  const uploadResponse = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/api\/evidence\/upload/i.test(new URL(response.url()).pathname),
    { timeout: 30000 }
  )
  await page.getByTestId('record-evidence').getByRole('button', { name: /Upload/i }).click()
  expect((await uploadResponse).ok()).toBeTruthy()
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByTestId('record-evidence')).toContainText('nx01-evidence.txt')

  // CAPA transition persists and workflow timeline updates
  await page.getByRole('button', { name: 'Submit for Verification' }).click()
  await expect(page.getByTestId('workflow-status')).toContainText(/Workflow · Pending Verification/i, {
    timeout: 20000
  })
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByTestId('workflow-status')).toContainText(/Workflow · Pending Verification/i)
  await expect(page.getByTestId('workflow-timeline')).toContainText(/pending.?verification|Submit/i)

  // Cross-tenant denial
  const employeeState = await context.storageState()
  const isolationContext = await browser.newContext({ storageState: employeeState })
  const isolated = await isolationContext.newPage()
  await isolated.goto(baseURL + '/dashboard')
  const orgSwitchPost = isolated.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/(dashboard|$)/.test(new URL(response.url()).pathname),
    { timeout: 20000 }
  )
  await isolated.getByRole('combobox', { name: /Active company/i }).selectOption(outsideOrgId)
  expect((await orgSwitchPost).ok()).toBeTruthy()
  await isolated.reload({ waitUntil: 'load' })
  const foreignResponse = await isolated.goto(baseURL + '/corrective-actions/' + capaId, {
    waitUntil: 'domcontentloaded'
  })
  const status = foreignResponse?.status() || 0
  const body = await isolated.content()
  expect(status === 404 || /not found|page not found|doesn't exist/i.test(body)).toBeTruthy()
  expect(body.includes(title)).toBeFalsy()

  await isolationContext.close()
  await context.close()
})
