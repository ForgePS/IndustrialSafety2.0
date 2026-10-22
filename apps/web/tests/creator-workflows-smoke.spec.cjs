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

test('Creator workflows: platform owner sees core definitions without tenant workflow.view', async ({
  browser
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'admin@forge2.local')

  await page.goto(baseURL + '/admin/creator/workflows')
  await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('workflow-definition').first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/No workflow definitions/i)).toHaveCount(0)
  await expect(page.getByText(/corrective_actions\.lifecycle|Core/i).first()).toBeVisible()

  await context.close()
})

test('Creator workflows: normal tenant user is denied', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'user@forge2.local')

  await page.goto(baseURL + '/admin/creator/workflows')
  await page.waitForURL(url => !url.pathname.includes('/admin/creator/workflows') || url.pathname === '/admin', {
    timeout: 20000
  })
  expect(page.url()).not.toMatch(/\/admin\/creator\/workflows\/?$/)

  await context.close()
})
