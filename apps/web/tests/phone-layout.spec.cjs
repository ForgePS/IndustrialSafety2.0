/**
 * Phone layout regression: signed-in pages must not scroll sideways on a 390 px phone.
 * The shared shell used to let any wide table, tab bar or button row stretch the whole page,
 * pushing the header off-screen. Overflow is measured against the fixed viewport width, not
 * window.innerWidth, because mobile emulation widens the layout viewport to fit the content.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/phone-layout.spec.cjs
 */
const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const DEMO_TENANT = '20000000-0000-4000-8000-000000000100'
const DEMO_QR = '20000000-0000-4000-8000-000000001101'
const PHONE = 390

const PAGES = [
  '/tasks',
  '/incidents',
  '/inspections',
  '/observations',
  '/corrective-actions',
  '/risk-register',
  '/risk-register/matrices',
  '/jsas',
  '/loto',
  '/assets',
  '/personnel',
  '/training',
  '/qr',
  `/qr/${DEMO_QR}`,
  '/ai/usage',
  '/help-desk',
  '/help-desk/tickets',
  '/help-desk/console',
  '/help-desk/console/knowledge',
  '/help-desk/console/incidents',
  '/admin/creator/features',
  '/admin/creator/tenants',
  `/admin/creator/tenants/${DEMO_TENANT}`,
  `/admin/creator/tenants/${DEMO_TENANT}/experience`
]

async function signIn(page) {
  await page.goto(baseURL + '/auth/login')
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
  await page.locator('input[name="email"]').fill('admin@forge2.local')
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

async function pageOverflow(page, route, width) {
  const response = await page.goto(baseURL + route, { waitUntil: 'networkidle' })

  expect(response.status(), route).toBeLessThan(400)

  return page.evaluate(w => document.documentElement.scrollWidth - w, width)
}

test.setTimeout(600000)

test('signed-in pages fit a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: PHONE, height: 844 } })
  const page = await context.newPage()

  await signIn(page)
  const failures = []

  for (const route of PAGES) {
    const overflow = await pageOverflow(page, route, PHONE)

    if (overflow > 1) failures.push(`${route} is ${overflow}px too wide`)
  }

  expect(failures).toEqual([])

  // The header controls stay on screen.
  await page.goto(baseURL + '/tasks', { waitUntil: 'networkidle' })
  const header = await page.locator('header').first().boundingBox()

  expect(header && header.x + header.width).toBeLessThanOrEqual(PHONE + 1)
  await context.close()
})

test('the Creator tenant page fits a desktop screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await signIn(page)
  expect(await pageOverflow(page, `/admin/creator/tenants/${DEMO_TENANT}`, 1440)).toBeLessThanOrEqual(1)
  await context.close()
})
