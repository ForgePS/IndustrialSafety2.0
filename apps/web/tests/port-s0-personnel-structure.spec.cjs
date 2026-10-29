/**
 * Port slice 0 (Industrial 1.0 -> 2.0) browser smoke: departments, positions, personnel parity fields,
 * sensitive data and employment history.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-s0-personnel-structure.spec.cjs --reporter=line --workers=1
 */
const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
const SEED_PERSON = '20000000-0000-4000-8000-000000000600'
const RUN = Date.now().toString().slice(-6)

test.describe.configure({ mode: 'serial' })
test.setTimeout(180000)

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

test('admin manages departments and positions and records personnel parity data', async ({ page }) => {
  const department = `Port QA Dept ${RUN}`
  const position = `Port QA Role ${RUN}`
  const employeeNumber = `EMP-00${Number(RUN)}`

  await login(page, 'admin@forge2.local')

  // Departments & Positions
  await page.goto(baseURL + '/personnel')
  await page.getByRole('link', { name: /Departments & Positions/ }).click()
  await expect(page.getByRole('heading', { name: 'Departments & Positions' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('department-row-Milling')).toBeVisible()

  await page.locator('#department-name').fill(department)
  await page.locator('#department-location').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.getByRole('button', { name: 'Add Department' }).click()
  await expect(page.getByTestId(`department-row-${department}`)).toBeVisible({ timeout: 30000 })

  // Same name at the same Location is refused with a readable message.
  await page.locator('#department-name').fill(department.toLowerCase())
  await page.locator('#department-location').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.getByRole('button', { name: 'Add Department' }).click()
  await expect(page.getByText(/An active department with this name already exists here/)).toBeVisible({ timeout: 30000 })

  await page.locator('#position-name').fill(position)
  await page.locator('#position-department').selectOption({ label: department })
  await page.getByRole('button', { name: 'Add Position' }).click()
  await expect(page.getByTestId(`position-row-${position}`)).toBeVisible({ timeout: 30000 })

  // Create a person with the new parity fields.
  await page.goto(baseURL + '/personnel/create')
  await page.locator('#first_name').fill('Quinn')
  await page.locator('#middle_name').fill('Avery')
  await page.locator('#last_name').fill(`Porter ${RUN}`)
  await page.locator('#preferred_name').fill('Q')
  await page.locator('#employee_number').fill(employeeNumber)
  await page.locator('#employment_status').selectOption('active')
  await page.locator('#employment_type').selectOption('seasonal')
  await page.locator('#hire_date').fill('2026-03-02')
  await page.locator('#location_id').selectOption({ label: 'Cypress Bend Main Plant (CBM)' })
  await page.locator('#department_id').selectOption({ label: department })
  await page.locator('#position_id').selectOption({ label: position })
  await page.locator('#is_dot_driver').click()
  await page.getByRole('button', { name: 'Save Personnel' }).click()

  await page.waitForURL(url => /\/personnel\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 })
  const personUrl = page.url()
  await expect(page.getByRole('heading', { name: `Quinn Avery Porter ${RUN} ("Q")` })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#department_id')).toHaveValue(/[0-9a-f-]{36}/)
  // Marking DOT driver also marks company driver.
  await expect(page.locator('#is_company_driver')).toHaveAttribute('data-state', 'checked')

  const history = page.getByTestId('personnel-employment-history')
  await expect(history.getByText('Record created')).toBeVisible()

  // Sensitive information (OSHA 301 / workers' comp fields).
  const sensitive = page.getByTestId('personnel-sensitive-panel')
  await expect(sensitive).toBeVisible()
  await page.locator('#sensitive-date_of_birth').fill('1991-07-14')
  await page.locator('#sensitive-sex').selectOption('female')
  await page.locator('#sensitive-address_line1').fill('100 Synthetic Way')
  await page.locator('#sensitive-city').fill('Testville')
  await page.locator('#sensitive-state_region').fill('AR')
  await page.getByRole('button', { name: 'Save Sensitive Information' }).click()
  await expect(page.getByText('Sensitive information saved.')).toBeVisible({ timeout: 30000 })

  await page.locator('#contact-0-name').fill('Morgan Example')
  await page.locator('#contact-0-relationship').fill('Sibling')
  await page.locator('#contact-0-phone').fill('555-0100')
  await page.getByRole('button', { name: 'Save Emergency Contacts' }).click()
  await expect(page.getByText('Emergency contacts saved.')).toBeVisible({ timeout: 30000 })

  await page.goto(personUrl)
  await expect(page.locator('#sensitive-date_of_birth')).toHaveValue('1991-07-14')
  await expect(page.locator('#sensitive-sex')).toHaveValue('female')
  await expect(page.locator('#contact-0-name')).toHaveValue('Morgan Example')

  // Moving departments is recorded in employment history.
  await page.locator('#department_id').selectOption({ label: 'Maintenance (MAINT)' })
  await expect(page.locator('#position_id')).toHaveValue('')
  await page.getByRole('button', { name: 'Save Personnel' }).click()
  await expect(page.getByText('Personnel record updated.')).toBeVisible({ timeout: 30000 })
  await page.goto(personUrl)
  await expect(history.getByText('Department changed')).toBeVisible({ timeout: 30000 })
  await expect(history.getByText(`${department} → Maintenance (MAINT)`, { exact: false })).toBeVisible()

  // An equivalent employee number ("42" vs "EMP-0042") is refused.
  await page.goto(baseURL + '/personnel/create')
  await page.locator('#first_name').fill('Duplicate')
  await page.locator('#last_name').fill(`Number ${RUN}`)
  await page.locator('#employee_number').fill(String(Number(RUN)))
  await page.locator('#employment_status').selectOption('active')
  await page.getByRole('button', { name: 'Save Personnel' }).click()
  await expect(page.getByText(/already uses this employee number/)).toBeVisible({ timeout: 30000 })
})

test('employee sees their record without sensitive data or structure admin', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await page.goto(baseURL + '/personnel/' + SEED_PERSON)
  await expect(page.getByTestId('personnel-employment-history')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('personnel-sensitive-panel')).toHaveCount(0)

  await page.goto(baseURL + '/personnel')
  await expect(page.getByRole('link', { name: /Departments & Positions/ })).toHaveCount(0)

  await page.goto(baseURL + '/personnel/structure')
  await page.waitForURL(url => !url.pathname.startsWith('/personnel/structure'), { timeout: 30000 })
  expect(new URL(page.url()).pathname).not.toBe('/personnel/structure')
})
