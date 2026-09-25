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

test.describe.configure({ mode: 'serial' })
test.setTimeout(120000)

test('corrective action CAPA lifecycle and linked task smoke test', async ({ browser }) => {
  const employeeContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  await login(employee, 'user@forge2.local')

  await employee.goto(baseURL + '/corrective-actions')
  await expect(employee.getByRole('heading', { name: 'Corrective Actions' })).toBeVisible()

  await employee.getByRole('link', { name: 'Create Corrective Action' }).click()
  await expect(employee.getByRole('heading', { name: 'Corrective Action' })).toBeVisible()

  await employee.getByLabel('Title').fill('CAPA smoke test guarding defect')
  await employee.getByLabel('Issue / Nonconformance').fill(
    'Automated smoke test identified a guarding deficiency requiring containment, root-cause analysis, corrective work, and independent verification.'
  )
  await employee.getByLabel('Action Type').selectOption('corrective')
  await employee.getByLabel('Severity').selectOption('high')
  await employee.getByLabel('Source').selectOption('manual')
  await employee.getByLabel('Assigned Owner').selectOption({ label: /Forge Demo User/ })
  await employee.getByLabel('Location').selectOption({ label: /Demo Location/ })
  await employee.getByLabel('Due Date & Time').fill('2026-10-15T12:00')
  await employee.getByLabel('Immediate Containment').fill(
    'Machine removed from service and access restricted pending permanent correction.'
  )
  await employee.getByLabel('Root Cause').fill(
    'Guard fastener inspection was not included in the prior preventive inspection checklist.'
  )
  await employee.getByLabel('Corrective Action Plan').fill(
    'Replace the damaged guard hardware, verify secure installation, and add guard fastener checks to the recurring inspection.'
  )
  await employee.getByLabel('Preventive / System Action').fill(
    'Review similar machines for the same inspection gap.'
  )

  await employee.getByRole('button', { name: 'Save Corrective Action' }).click()
  await employee.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 })

  const capaUrl = employee.url()
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
  await expect(employee.getByText('Completed', { exact: true })).toBeVisible()
  await expect(employee.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, 'admin@forge2.local')
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
  await expect(admin.getByText('Completed', { exact: true })).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Complete Task' })).toHaveCount(0)

  await adminContext.close()
  await employeeContext.close()
})
