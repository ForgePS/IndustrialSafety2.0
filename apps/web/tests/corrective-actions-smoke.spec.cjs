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

async function clickCapaWorkflowButton(page, buttonName, reopen) {
  const button = page.getByRole('button', { name: buttonName })
  await expect(button).toBeVisible({ timeout: 20000 })

  let lastError = null
  for (let attempt = 1; attempt <= 6; attempt++) {
    const postPromise = waitForCapaPost(page, 8000).catch(error => {
      lastError = error
      return null
    })

    await button.click()
    const post = await postPromise
    if (post && post.ok()) {
      await page.reload({ waitUntil: 'load' })
      return post
    }

    await page.waitForTimeout(500 * attempt)
    if (attempt === 3 || attempt === 5) {
      await page.reload({ waitUntil: 'load' })
      if (typeof reopen === 'function') {
        await reopen(page)
      }
      await expect(button).toBeVisible({ timeout: 20000 })
    }
  }

  throw lastError || new Error('CAPA workflow button did not POST: ' + buttonName)
}

async function openWorkflowPanel(page, openButtonName, confirmButtonName) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByRole('button', { name: openButtonName }).click()
    const confirm = page.getByRole('button', { name: confirmButtonName })
    if (await confirm.isVisible().catch(() => false)) {
      return
    }
    await page.waitForTimeout(400 * attempt)
  }

  throw new Error('Unable to open workflow panel: ' + openButtonName)
}

async function submitForVerification(page) {
  await clickCapaWorkflowButton(page, 'Submit for Verification')
  await expect(page.getByText('Pending Verification', { exact: true })).toBeVisible({
    timeout: 20000
  })
}

async function createCapa(page, title) {
  await page.goto(baseURL + '/corrective-actions/create')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(
    'Automated smoke test identified a guarding deficiency requiring containment, root-cause analysis, corrective work, and independent verification.'
  )
  await page.locator('select[name="action_type"]').selectOption('corrective')
  await page.locator('select[name="severity"]').selectOption('high')
  await page.locator('select[name="source_type"]').selectOption('manual')
  await page.locator('select[name="assigned_personnel_id"]').selectOption({
    label: 'Forge Demo User (EMP-0001)'
  })
  await page.locator('select[name="location_id"]').selectOption({ label: 'Demo Location (DEMO)' })
  await page.locator('input[name="due_at"]').fill('2026-10-15T12:00')
  await page.locator('textarea[name="immediate_containment"]').fill(
    'Machine removed from service and access restricted pending permanent correction.'
  )
  await page.locator('textarea[name="root_cause"]').fill(
    'Guard fastener inspection was not included in the prior preventive inspection checklist.'
  )
  await page.locator('textarea[name="action_plan"]').fill(
    'Replace the damaged guard hardware, verify secure installation, and add guard fastener checks to the recurring inspection.'
  )
  await page.locator('textarea[name="preventive_action"]').fill(
    'Review similar machines for the same inspection gap.'
  )

  const createPost = waitForCapaPost(page)
  await page.getByRole('button', { name: 'Save Corrective Action' }).click()
  expect((await createPost).ok()).toBeTruthy()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('corrective action CAPA lifecycle, reopen, cancel, and tenant isolation smoke test', async ({
  browser
}) => {
  const employeeContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  await login(employee, 'user@forge2.local')

  await employee.goto(baseURL + '/corrective-actions')
  await expect(employee.getByRole('heading', { name: 'Corrective Actions' })).toBeVisible()

  await createCapa(employee, 'CAPA smoke test guarding defect')

  const capaUrl = employee.url()
  const capaId = capaUrl.split('/').pop()
  await expect(employee.getByRole('heading', { name: 'CAPA smoke test guarding defect' })).toBeVisible()
  await expect(employee.getByText(/CA-\d{6}/)).toBeVisible()

  const taskLink = employee.getByRole('link', { name: /Task TASK-\d{6}/ })
  await expect(taskLink).toBeVisible()
  const taskHref = await taskLink.getAttribute('href')
  expect(taskHref).toBeTruthy()

  // Submit while the detail page is still freshly mounted after create (avoids
  // SSR-button / pre-hydration clicks that no-op after soft navigations).
  await submitForVerification(employee)
  await expect(employee.locator('#capa-verification-result')).toHaveCount(0)

  await employee.goto(baseURL + taskHref)
  await expect(employee.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(employee.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)
  await expect(employee.getByRole('link', { name: /Open CA-\d{6}/ })).toBeVisible()
  await expect(
    employee
      .getByRole('heading', { name: 'CAPA smoke test guarding defect' })
      .locator('..')
      .getByText('Completed', { exact: true })
  ).toBeVisible()

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, 'admin@forge2.local')
  await admin.goto(capaUrl)
  await expect(admin).toHaveURL(new RegExp('/corrective-actions/' + capaId + '$'))
  await expect(admin.getByRole('heading', { name: 'CAPA Workflow' })).toBeVisible({
    timeout: 20000
  })
  await expect(admin.getByText('Pending Verification', { exact: true })).toBeVisible()
  await expect(admin.locator('#capa-verification-result')).toBeVisible({ timeout: 20000 })
  await admin.locator('#capa-verification-result').selectOption('ineffective')
  await admin.locator('#capa-verification-notes').fill(
    'Initial verification found the guard still loose; CAPA returned for follow-up corrective work.'
  )
  await clickCapaWorkflowButton(admin, 'Record Verification')
  await expect(admin.getByText('In Progress', { exact: true })).toBeVisible({ timeout: 20000 })

  await admin.goto(baseURL + taskHref)
  await expect(admin.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(
    admin
      .getByRole('heading', { name: 'CAPA smoke test guarding defect' })
      .locator('..')
      .getByText('In Progress', { exact: true })
  ).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  await employee.goto(capaUrl)
  await expect(employee.getByText('In Progress', { exact: true })).toBeVisible()
  await submitForVerification(employee)

  await admin.goto(capaUrl)
  await expect(admin.locator('#capa-verification-result')).toBeVisible({ timeout: 20000 })
  await admin.locator('#capa-verification-result').selectOption('effective')
  await admin.locator('#capa-verification-notes').fill(
    'Verified replacement guard hardware, secure installation, updated inspection checklist, and field condition.'
  )
  await clickCapaWorkflowButton(admin, 'Record Verification')
  await expect(admin.getByText('Verified', { exact: true })).toBeVisible({ timeout: 20000 })

  await expect(admin.locator('#capa-closure-notes')).toBeVisible({ timeout: 10000 })
  await admin.locator('#capa-closure-notes').fill(
    'Corrective action verified effective and closed after reviewing the completed controls and updated inspection requirement.'
  )
  await clickCapaWorkflowButton(admin, 'Confirm Closure')
  await expect(admin.getByText('Closed', { exact: true })).toBeVisible({ timeout: 20000 })

  await admin.goto(baseURL + taskHref)
  await expect(admin.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(
    admin
      .getByRole('heading', { name: 'CAPA smoke test guarding defect' })
      .locator('..')
      .getByText('Completed', { exact: true })
  ).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  await createCapa(admin, 'CAPA smoke cancel path')
  const cancelCapaUrl = admin.url()
  await openWorkflowPanel(admin, 'Cancel Corrective Action', 'Confirm Cancellation')
  await expect(admin.locator('#capa-cancellation-notes')).toBeVisible({ timeout: 10000 })
  await admin.locator('#capa-cancellation-notes').fill(
    'Canceled by automated smoke test because the original hazard was eliminated by a permanent engineering change.'
  )
  await clickCapaWorkflowButton(admin, 'Confirm Cancellation', async page => {
    await openWorkflowPanel(page, 'Cancel Corrective Action', 'Confirm Cancellation')
    await page.locator('#capa-cancellation-notes').fill(
      'Canceled by automated smoke test because the original hazard was eliminated by a permanent engineering change.'
    )
  })
  await expect(admin.getByText('Canceled', { exact: true })).toBeVisible({ timeout: 20000 })
  await openWorkflowPanel(admin, 'Archive', 'Confirm Archive')
  await clickCapaWorkflowButton(admin, 'Confirm Archive', async page => {
    await openWorkflowPanel(page, 'Archive', 'Confirm Archive')
  })
  await expect(admin.getByText('Archived Corrective Action')).toBeVisible({ timeout: 20000 })

  const employeeState = await employeeContext.storageState()
  const isolationContext = await browser.newContext({ storageState: employeeState })
  const isolated = await isolationContext.newPage()

  // Switch tenant through the real server action and wait for it to commit the httpOnly cookie.
  await isolated.goto(baseURL + '/dashboard')
  const orgSwitchPost = isolated.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/(dashboard|$)/.test(new URL(response.url()).pathname),
    { timeout: 20000 }
  )
  await isolated.getByRole('combobox', { name: /Active company/i }).selectOption(
    '30000000-0000-4000-8000-000000000100'
  )
  expect((await orgSwitchPost).ok()).toBeTruthy()
  await isolated.reload({ waitUntil: 'load' })
  await expect(isolated.getByRole('combobox', { name: /Active company/i })).toHaveValue(
    '30000000-0000-4000-8000-000000000100'
  )

  await isolated.goto(baseURL + '/corrective-actions')
  await expect(isolated.getByRole('combobox', { name: /Active company/i })).toHaveValue(
    '30000000-0000-4000-8000-000000000100'
  )
  await expect(isolated.getByText('CAPA smoke test guarding defect')).toHaveCount(0)
  await expect(isolated.getByText('CAPA smoke cancel path')).toHaveCount(0)

  const isolatedCapaResponse = await isolated.goto(capaUrl)
  expect(isolatedCapaResponse?.status()).toBe(404)
  await expect(isolated.getByRole('heading', { name: 'CAPA smoke test guarding defect' })).toHaveCount(0)

  const isolatedTaskResponse = await isolated.goto(baseURL + taskHref)
  expect(isolatedTaskResponse?.status()).toBe(404)

  const isolatedCancelResponse = await isolated.goto(cancelCapaUrl)
  expect(isolatedCancelResponse?.status()).toBe(404)

  expect(capaId).toBeTruthy()
  const isolatedDirect = await isolated.goto(baseURL + '/corrective-actions/' + capaId)
  expect(isolatedDirect?.status()).toBe(404)

  await isolationContext.close()
  await adminContext.close()
  await employeeContext.close()
})
