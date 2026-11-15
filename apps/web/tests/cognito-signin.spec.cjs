/**
 * Portability phase 1 contract: 2.0 signed in through 1.0's Cognito session, with no Supabase Auth
 * (docs/INTEGRATION_2X_INTO_1X_PLAN.md).
 *
 *  - Signed-out visits to app pages go to 1.0's sign-in; 2.0's own /auth pages redirect there too.
 *  - Signing in at 1.0 links an existing 2.0 user by email, and creates one for a new email.
 *  - Each person sees only their own tenant.
 *  - Signing out of 1.0 signs out of 2.0 on the next request.
 *
 * Needs the local 1.0 stand-in and 2.0 started in cognito mode:
 *   node scripts/portability/dev-platform.cjs   (prints the env values; use localhost in the browser)
 *   FORGE_AUTH_PROVIDER=cognito ... pnpm --filter forge-industrial-safety-2.0-web start --port 3020
 *   COGNITO_SMOKE=1 SMOKE_BASE_URL=http://localhost:3020 DEV_PLATFORM_URL=http://localhost:4010 \
 *     pnpm exec playwright test apps/web/tests/cognito-signin.spec.cjs
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

const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:3020'
const platformURL = process.env.DEV_PLATFORM_URL || 'http://localhost:4010'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.API_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const run = Date.now().toString(36)

test.skip(!process.env.COGNITO_SMOKE, 'set COGNITO_SMOKE=1 with 2.0 running in cognito mode')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL })

async function rest(urlPath) {
  const res = await fetch(API + '/rest/v1' + urlPath, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })

  return res.json()
}

async function signInAtPlatform(page, email, name = '') {
  await page.goto('/dashboard')
  await page.waitForURL(url => url.origin === new URL(platformURL).origin && url.pathname === '/login')
  expect(new URL(page.url()).searchParams.get('next')).toBe('/dashboard')
  await page.getByLabel('Email').fill(email)
  if (name) await page.getByLabel('Display name').fill(name)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(url => url.origin === new URL(baseURL).origin && url.pathname === '/dashboard', { timeout: 60000 })
}

test('signed-out visitors go to 1.0 sign-in, including from 2.0 sign-in pages', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForURL(url => url.origin === new URL(platformURL).origin && url.pathname === '/login')

  await page.goto('/auth/login')
  await page.waitForURL(url => url.origin === new URL(platformURL).origin && url.pathname === '/login')
})

test('an existing 2.0 user is linked by email and sees only their tenant', async ({ page }) => {
  await signInAtPlatform(page, 'northstar.admin@forge2.local')
  await expect(page.getByText('Northstar Manufacturing').first()).toBeVisible({ timeout: 60000 })
  await expect(page.getByText('Forge Industrial Safety 2.0 Demo')).toHaveCount(0)

  const links = await rest('/forge_identity_links?select=user_id,email&provider=eq.cognito&email=eq.northstar.admin@forge2.local')

  expect(links).toEqual([{ user_id: '40000000-0000-4000-8000-000000000001', email: 'northstar.admin@forge2.local' }])

  // Signed in, 2.0's sign-in page sends people on to the dashboard.
  await page.goto('/auth/login')
  await page.waitForURL(url => url.origin === new URL(baseURL).origin && url.pathname === '/dashboard')
})

test('a new email gets a 2.0 user with no tenant access', async ({ page }) => {
  const email = `cognito.${run}@example.test`

  await signInAtPlatform(page, email, 'Casey Newperson')
  await expect(page.getByText('Northstar Manufacturing')).toHaveCount(0)
  await expect(page.getByText('Forge Industrial Safety 2.0 Demo')).toHaveCount(0)

  const [link] = await rest(`/forge_identity_links?select=user_id&provider=eq.cognito&email=eq.${encodeURIComponent(email)}`)

  expect(link?.user_id).toBeTruthy()
  expect(await rest(`/users?select=name,email&user_id=eq.${link.user_id}`)).toEqual([{ name: 'Casey Newperson', email }])
})

test('signing out of 1.0 signs out of 2.0', async ({ page }) => {
  await signInAtPlatform(page, 'northstar.user@forge2.local')
  await expect(page.getByText('Northstar Manufacturing').first()).toBeVisible({ timeout: 60000 })

  const status = await page.evaluate(async url => (await fetch(url, { method: 'POST', credentials: 'include' })).status, platformURL + '/api/v1/auth/session/logout')

  expect(status).toBe(200)

  await page.goto('/dashboard')
  await page.waitForURL(url => url.origin === new URL(platformURL).origin && url.pathname === '/login')
  expect((await page.context().cookies(baseURL)).some(cookie => cookie.name === 'forge2-access')).toBe(false)
})
