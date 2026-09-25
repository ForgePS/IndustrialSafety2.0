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

async function createCapa(page, title) {
  await page.goto(baseURL + '/corrective-actions')
  await page.getByRole('link', { name: 'Create Corrective Action' }).click()
  await expect(page.getByRole('heading', { name: 'Corrective Action' })).toBeVisible()

  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Issue / Nonconformance').fill(
    'Automated smoke test identified a guarding deficiency requiring containment, root-cause analysis, corrective work, and independent verification.'
  )
  await page.getByLabel('Action Type').selectOption('corrective')
  await page.getByLabel('Severity').selectOption('high')
  await page.getByLabel('Source').selectOption('manual')
  await page.getByLabel('Assigned Owner').selectOption({ label: 'Forge Demo User (EMP-0001)' })
  await page.getByLabel('Location').selectOption({ label: 'Demo Location (DEMO)' })
  await page.getByLabel('Due Date & Time').fill('2026-10-15T12:00')
  await page.getByLabel('Immediate Containment').fill(
    'Machine removed from service and access restricted pending permanent correction.'
  )
  await page.getByLabel('Root Cause').fill(
    'Guard fastener inspection was not included in the prior preventive inspection checklist.'
  )
  await page.getByLabel('Corrective Action Plan').fill(
    'Replace the damaged guard hardware, verify secure installation, and add guard fastener checks to the recurring inspection.'
  )
  await page.getByLabel('Preventive / System Action').fill(
    'Review similar machines for the same inspection gap.'
  )

  await page.getByRole('button', { name: 'Save Corrective Action' }).click()
  await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(180000)

test('corrective action CAPA lifecycle, reopen, cancel, and tenant isolation smoke test', async ({ browser }) => {
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

  await employee.goto(baseURL + taskHref)
  await expect(employee.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(employee.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)
  await expect(employee.getByRole('link', { name: /Open CA-\d{6}/ })).toBeVisible()

  await employee.goto(capaUrl)
  employee.once('dialog', dialog => dialog.accept())
  await employee.getByRole('button', { name: 'Submit for Verification' }).click()
  await expect(employee.getByText('Pending Verification')).toBeVisible()
  await expect(employee.getByRole('button', { name: 'Verify Effectiveness' })).toHaveCount(0)

  await employee.goto(baseURL + taskHref)
  await expect(employee.getByText('Open', { exact: true })).toHaveCount(0)
  await expect(employee.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, 'admin@forge2.local')
  await admin.goto(capaUrl)

  await expect(admin.getByText('Pending Verification')).toBeVisible()
  await admin.getByRole('button', { name: 'Verify Effectiveness' }).click()
  await admin.getByLabel('Verification Result').selectOption('ineffective')
  await admin.getByLabel('Verification Notes').fill(
    'Initial verification found the guard still loose; CAPA returned for follow-up corrective work.'
  )
  await admin.getByRole('button', { name: 'Record Verification' }).click()
  await expect(admin.getByText('In Progress', { exact: true })).toBeVisible()

  await admin.goto(baseURL + taskHref)
  await expect(admin.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(admin.getByText('In Progress', { exact: true })).toBeVisible()
  await expect(admin.getByText('Open', { exact: true })).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  await employee.goto(capaUrl)
  await expect(employee.getByText('In Progress', { exact: true })).toBeVisible()
  employee.once('dialog', dialog => dialog.accept())
  await employee.getByRole('button', { name: 'Submit for Verification' }).click()
  await expect(employee.getByText('Pending Verification')).toBeVisible()

  await admin.goto(capaUrl)
  await expect(admin.getByText('Pending Verification')).toBeVisible()
  await admin.getByRole('button', { name: 'Verify Effectiveness' }).click()
  await admin.getByLabel('Verification Result').selectOption('effective')
  await admin.getByLabel('Verification Notes').fill(
    'Verified replacement guard hardware, secure installation, updated inspection checklist, and field condition.'
  )
  await admin.getByRole('button', { name: 'Record Verification' }).click()
  await expect(admin.getByText('Verified', { exact: true })).toBeVisible()

  await admin.getByRole('button', { name: 'Close Corrective Action' }).click()
  await admin.getByLabel('Closure Notes').fill(
    'Corrective action verified effective and closed after reviewing the completed controls and updated inspection requirement.'
  )
  await admin.getByRole('button', { name: 'Confirm Closure' }).click()
  await expect(admin.getByText('Closed', { exact: true })).toBeVisible()

  await admin.goto(baseURL + taskHref)
  await expect(admin.getByText('Managed by Corrective Action')).toBeVisible()
  await expect(admin.getByText('Open', { exact: true })).toHaveCount(0)
  await expect(admin.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  // Cancel + archive path on a second CAPA owned by the same tenant.
  await createCapa(admin, 'CAPA smoke cancel path')
  const cancelCapaUrl = admin.url()
  await admin.getByRole('button', { name: 'Cancel Corrective Action' }).click()
  await admin.getByLabel('Cancellation Notes').fill(
    'Canceled by automated smoke test because the original hazard was eliminated by a permanent engineering change.'
  )
  await admin.getByRole('button', { name: 'Confirm Cancellation' }).click()
  await expect(admin.getByText('Canceled', { exact: true })).toBeVisible()
  admin.once('dialog', dialog => dialog.accept())
  await admin.getByRole('button', { name: 'Archive' }).click()
  await expect(admin.getByText('Archived Corrective Action')).toBeVisible()

  // Tenant isolation: same authenticated user, switch only active tenant.
  const employeeState = await employeeContext.storageState()
  const isolationContext = await browser.newContext({ storageState: employeeState })
  await isolationContext.addCookies([{
    name: 'forge-active-organization',
    value: '30000000-0000-4000-8000-000000000100',
    domain: '127.0.0.1',
    path: '/'
  }])
  const isolated = await isolationContext.newPage()

  await isolated.goto(baseURL + '/corrective-actions')
  await expect(isolated.getByText('CAPA smoke test guarding defect')).toHaveCount(0)
  await expect(isolated.getByText('CAPA smoke cancel path')).toHaveCount(0)

  const isolatedCapaResponse = await isolated.goto(capaUrl)
  expect(isolatedCapaResponse?.status()).toBe(404)

  const isolatedTaskResponse = await isolated.goto(baseURL + taskHref)
  expect(isolatedTaskResponse?.status()).toBe(404)

  const isolatedCancelResponse = await isolated.goto(cancelCapaUrl)
  expect(isolatedCancelResponse?.status()).toBe(404)

  // Direct CAPA id must not leak across tenants even when only the UUID is known.
  expect(capaId).toBeTruthy()
  const isolatedDirect = await isolated.goto(baseURL + '/corrective-actions/' + capaId)
  expect(isolatedDirect?.status()).toBe(404)

  await isolationContext.close()
  await adminContext.close()
  await employeeContext.close()
})
