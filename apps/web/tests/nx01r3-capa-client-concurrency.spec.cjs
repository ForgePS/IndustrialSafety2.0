/**
 * NX-01R3 — CAPA client concurrency token synchronization
 * Same-browser sequential saves, lifecycle-then-save, two-browser stale conflict.
 */
const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'

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

async function createOpenCapaWithoutPlan(page, title) {
  await page.goto(baseURL + '/corrective-actions/create')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(
    'NX-01R3 concurrency fixture — open CAPA without action plan so status stays open.'
  )
  await page.locator('select[name="action_type"]').selectOption('corrective')
  await page.locator('select[name="severity"]').selectOption('moderate')
  await page.locator('select[name="source_type"]').selectOption('manual')
  await page.locator('select[name="assigned_personnel_id"]').selectOption({
    label: 'Forge Demo User (EMP-0001)'
  })
  await page.locator('select[name="location_id"]').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.locator('input[name="due_at"]').fill('2026-11-01T09:00')
  await page.locator('textarea[name="immediate_containment"]').fill('Isolate equipment pending plan.')
  await page.locator('textarea[name="root_cause"]').fill('Inspection gap identified in R3 fixture.')
  // Intentionally leave action_plan empty so create stays OPEN (no open→in_progress).

  const createPost = waitForCapaPost(page)
  await page.getByRole('button', { name: 'Save Corrective Action' }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })
}

async function createCapaWithPlan(page, title) {
  await page.goto(baseURL + '/corrective-actions/create')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(
    'NX-01R3 concurrency fixture with action plan for lifecycle start.'
  )
  await page.locator('select[name="action_type"]').selectOption('corrective')
  await page.locator('select[name="severity"]').selectOption('high')
  await page.locator('select[name="source_type"]').selectOption('manual')
  await page.locator('select[name="assigned_personnel_id"]').selectOption({
    label: 'Forge Demo User (EMP-0001)'
  })
  await page.locator('select[name="location_id"]').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.locator('input[name="due_at"]').fill('2026-11-02T10:00')
  await page.locator('textarea[name="immediate_containment"]').fill('Containment for R3 lifecycle.')
  await page.locator('textarea[name="root_cause"]').fill('Root cause for R3 lifecycle fixture.')
  await page.locator('textarea[name="action_plan"]').fill(
    'Execute corrective work and verify fasteners after install.'
  )
  await page.locator('textarea[name="preventive_action"]').fill('Add fastener checks to PM.')

  const createPost = waitForCapaPost(page)
  await page.getByRole('button', { name: 'Save Corrective Action' }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })
}

async function readConcurrencyTokens(page) {
  const root = page.locator('[data-capa-row-version]')
  await expect(root).toBeVisible({ timeout: 20000 })
  const version = Number(await root.getAttribute('data-capa-row-version'))
  const status = String(await root.getAttribute('data-capa-status') || '')
  return { version, status }
}

async function saveAndExpectSuccess(page, expectedVersion) {
  const post = waitForCapaPost(page)
  await page.getByTestId('capa-save').click()
  const response = await post
  expect(response.ok()).toBeTruthy()
  await expect(page.getByTestId('capa-save')).toBeEnabled({ timeout: 20000 })
  if (expectedVersion != null) {
    await expect(page.locator('[data-capa-row-version]')).toHaveAttribute(
      'data-capa-row-version',
      String(expectedVersion),
      { timeout: 15000 }
    )
  }
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('same-browser sequential field saves adopt returned concurrency tokens', async ({
  browser
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'user@forge2.local')

  const title = 'CAPA R3 sequential ' + Date.now()
  await createCapaWithPlan(page, title)
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible({ timeout: 20000 })

  const initial = await readConcurrencyTokens(page)
  expect(initial.version).toBeGreaterThanOrEqual(1)
  expect(initial.status).toBe('in_progress')

  await page.locator('textarea[name="preventive_action"]').fill('R3 first sequential edit')
  await saveAndExpectSuccess(page, initial.version + 1)
  const afterFirst = await readConcurrencyTokens(page)
  expect(afterFirst.version).toBe(initial.version + 1)
  expect(afterFirst.status).toBe('in_progress')

  // No manual reload — second save must use adopted tokens.
  await page.locator('textarea[name="effectiveness_notes"]').fill('R3 second sequential edit')
  await saveAndExpectSuccess(page, initial.version + 2)
  const afterSecond = await readConcurrencyTokens(page)
  expect(afterSecond.version).toBe(initial.version + 2)
  expect(afterSecond.status).toBe('in_progress')

  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('textarea[name="preventive_action"]')).toHaveValue(
    'R3 first sequential edit'
  )
  await expect(page.locator('textarea[name="effectiveness_notes"]')).toHaveValue(
    'R3 second sequential edit'
  )
  const afterReload = await readConcurrencyTokens(page)
  expect(afterReload.version).toBe(initial.version + 2)

  await context.close()
})

test('same-browser lifecycle save then field save adopts status + rowVersion', async ({
  browser
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'user@forge2.local')

  const title = 'CAPA R3 lifecycle then field ' + Date.now()
  await createOpenCapaWithoutPlan(page, title)

  const initial = await readConcurrencyTokens(page)
  expect(initial.status).toBe('open')
  const n = initial.version

  // OPEN → IN_PROGRESS via form save with action plan
  await page.locator('textarea[name="action_plan"]').fill(
    'R3 start work plan — replace guard hardware and verify torque.'
  )
  await saveAndExpectSuccess(page, n + 1)

  const afterLifecycle = await readConcurrencyTokens(page)
  expect(afterLifecycle.status).toBe('in_progress')
  expect(afterLifecycle.version).toBe(n + 1)
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible({ timeout: 20000 })

  // Without manual reload — field save must send expectedStatus=in_progress, version N+1
  await page.locator('textarea[name="preventive_action"]').fill('R3 post-lifecycle field edit')
  await saveAndExpectSuccess(page, n + 2)

  const afterField = await readConcurrencyTokens(page)
  expect(afterField.status).toBe('in_progress')
  expect(afterField.version).toBe(n + 2)

  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('textarea[name="preventive_action"]')).toHaveValue(
    'R3 post-lifecycle field edit'
  )
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible()

  await context.close()
})

test('two-browser stale conflict still rejects overwrite', async ({ browser }) => {
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  await login(pageA, 'user@forge2.local')

  const title = 'CAPA R3 two-browser ' + Date.now()
  await createCapaWithPlan(pageA, title)
  const capaUrl = pageA.url()
  await expect(pageA.getByText('In Progress', { exact: true })).toBeVisible({ timeout: 20000 })

  const tokensA0 = await readConcurrencyTokens(pageA)
  const n = tokensA0.version

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await login(pageB, 'user@forge2.local')
  await pageB.goto(capaUrl)
  await expect(pageB.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })
  const tokensB0 = await readConcurrencyTokens(pageB)
  expect(tokensB0.version).toBe(n)

  await pageA.locator('textarea[name="preventive_action"]').fill('Browser A won the race')
  await saveAndExpectSuccess(pageA, n + 1)
  const tokensA1 = await readConcurrencyTokens(pageA)
  expect(tokensA1.version).toBe(n + 1)

  await pageB.locator('textarea[name="preventive_action"]').fill('STALE B MUST NOT APPLY')
  const stalePost = waitForCapaPost(pageB)
  await pageB.getByTestId('capa-save').click()
  await stalePost
  await expect(
    pageB.getByText(
      /This record changed after you opened it\. Refresh the record before saving your changes\./i
    )
  ).toBeVisible({ timeout: 15000 })

  // Dirty local value retained (not silently wiped)
  await expect(pageB.locator('textarea[name="preventive_action"]')).toHaveValue(
    'STALE B MUST NOT APPLY'
  )

  await pageB.reload({ waitUntil: 'load' })
  await expect(pageB.locator('textarea[name="preventive_action"]')).toHaveValue(
    'Browser A won the race'
  )
  const tokensBAfter = await readConcurrencyTokens(pageB)
  expect(tokensBAfter.version).toBe(n + 1)

  await contextB.close()
  await contextA.close()
})
