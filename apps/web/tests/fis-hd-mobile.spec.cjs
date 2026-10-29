/**
 * FIS-HD-01 — Help Desk mobile layout regression (390x844 phone viewport).
 * Customer and staff surfaces must render their primary controls without horizontal page overflow.
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.API_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const NS_USER = '40000000-0000-4000-8000-000000000002'
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

async function rest(urlPath) {
  const res = await fetch(API + urlPath, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
  return res.json()
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  // Wait for React to hydrate the form (independent of translations, which can load slowly on a
  // cold dev server and leave the submit button unlabeled), then submit it directly.
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

async function expectFits(page, route, visible) {
  const response = await page.goto(baseURL + route)
  expect(response.status(), route).toBeLessThan(400)
  await expect(visible(page), route).toBeVisible({ timeout: 60000 })
  // Compare with the phone width, not window.innerWidth: mobile emulation widens the layout viewport
  // to fit wide content, which would hide the overflow this check exists to catch.
  const overflow = await page.evaluate(width => document.documentElement.scrollWidth - width, phone.viewport.width)
  expect(overflow, `${route} must not scroll horizontally`).toBeLessThanOrEqual(1)
}

test.setTimeout(600000)

test('customer help desk fits a phone screen', async ({ browser }) => {
  const [own] = await rest(`/rest/v1/forge_support_tickets?requester_user_id=eq.${NS_USER}&merged_into_ticket_id=is.null&select=id,subject&order=created_at.asc&limit=1`)
  expect(own?.id).toBeTruthy()
  const context = await browser.newContext(phone)
  const page = await context.newPage()
  await login(page, 'northstar.user@forge2.local')

  await expectFits(page, '/help-desk', p => p.getByRole('heading', { name: 'How can we help?' }))
  await expectFits(page, '/help-desk/tickets', p => p.getByLabel('Search tickets'))
  await expectFits(page, '/help-desk/tickets/new', p => p.getByRole('radio', { name: /Technical Issue/i }))
  await expectFits(page, '/help-desk/status', p => p.getByRole('heading', { level: 1 }))
  await expectFits(page, '/help-desk/ask', p => p.getByRole('heading', { level: 1 }))
  await expectFits(page, `/help-desk/tickets/${own.id}`, p => p.getByRole('heading', { name: own.subject }))
  await context.close()
})

test('support console ticket workspace fits a phone screen', async ({ browser }) => {
  const [ticket] = await rest('/rest/v1/forge_support_tickets?ticket_number=like.SUP-*-000001&select=id')
  expect(ticket?.id).toBeTruthy()
  const context = await browser.newContext(phone)
  const page = await context.newPage()
  await login(page, 'support@forge2.local')

  await expectFits(page, '/help-desk/console', p => p.getByLabel('Search tickets'))
  await expectFits(page, `/help-desk/console/tickets/${ticket.id}`, p => p.getByLabel('Reply to customer'))
  await context.close()
})
