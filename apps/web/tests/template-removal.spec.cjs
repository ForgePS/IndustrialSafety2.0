/**
 * The purchased starter template's surfaces are gone:
 *  - the marketing site, legal pages, blog, checkout, billing, payment webhook and template admin
 *    pages return real 404s (signed in, so middleware login redirects don't mask them);
 *  - "/" sends signed-out visitors to sign-in and signed-in users to the dashboard;
 *  - every signed-in user lands on /dashboard (the owner is no longer turned away);
 *  - the sign-in screen shows the Forge panel, not the template's dashboard image, logos or tagline.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/template-removal.spec.cjs
 */
const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const TEMPLATE_TEXT = /jetship|chatflow|themeselection|ship faster|saas boilerplate|lemon squeezy/i

const REMOVED = [
  '/blog',
  '/changelog',
  '/checkout',
  '/faqs',
  '/privacy-policy',
  '/terms-of-service',
  '/thank-you',
  '/billing',
  '/admin',
  '/admin/users',
  '/admin/users/create',
  '/admin/roles',
  '/admin/permissions',
  '/admin/faqs/faq',
  '/admin/faqs/category',
  '/admin/reviews/review',
  '/admin/reviews/platform',
  '/admin/settings/general-settings',
  '/admin/settings/payment-providers'
]

async function waitForForm(page) {
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
}

async function signIn(page, email = 'admin@forge2.local') {
  await page.goto(baseURL + '/auth/login')
  await waitForForm(page)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('signed-out visitors go from / to sign-in', async ({ page }) => {
  await page.goto(baseURL + '/')
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('sign-in screen shows the Forge panel and no template branding', async ({ page }) => {
  for (const route of ['/auth/login', '/auth/register', '/auth/forgot-password']) {
    await page.goto(baseURL + route)
    await expect(page.getByRole('heading', { name: 'Every incident, inspection and lockout in one place.' })).toBeVisible()
    await expect(page.locator('img[src*="/images/logos/"], img[src*="dashboard-light"], img[src*="dashboard-dark"]')).toHaveCount(0)
    expect(await page.locator('body').innerText(), route).not.toMatch(TEMPLATE_TEXT)
  }
  await page.goto(baseURL + '/auth/login')
  await expect(page.getByText('Sign in to manage incidents, inspections and corrective actions.')).toBeVisible()
})

test('the auth error page offers a way back', async ({ page }) => {
  await page.goto(baseURL + '/auth/error')
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('unknown URLs return a real 404', async ({ request }) => {
  const res = await request.get(baseURL + '/this-page-does-not-exist', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
})

test('the template payment webhook is gone', async ({ request }) => {
  const res = await request.post(baseURL + '/api/webhook', { data: {}, maxRedirects: 0 })
  expect([404, 405]).toContain(res.status())
})

test('signed-in users land on the dashboard and removed pages return 404', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page).not.toHaveURL(/not-authorized/)

  await page.goto(baseURL + '/')
  await expect(page).toHaveURL(/\/dashboard/)

  for (const route of REMOVED) {
    const res = await page.request.get(baseURL + route, { maxRedirects: 0 })
    expect(res.status(), route).toBe(404)
  }
})

// A regular user has none of the template admin permissions; removed pages must still 404 for them,
// not redirect to /not-authorized.
test('removed admin pages return 404 for a regular user too', async ({ page }) => {
  await signIn(page, 'user@forge2.local')
  await expect(page).toHaveURL(/\/dashboard/)

  for (const route of REMOVED.filter(r => r.startsWith('/admin'))) {
    const res = await page.request.get(baseURL + route, { maxRedirects: 0 })
    expect(res.status(), route).toBe(404)
  }
})
