/**
 * Sign-in hardening regression.
 *  - Public auth and checkout pages never ship a user directory (no seeded emails in the HTML/RSC payload).
 *  - Login: wrong password shows an error and stays on /auth/login; right password signs in.
 *  - Login: an unconfirmed account is sent to /auth/verify-email?email=... (decided by the provider's
 *    `email_not_confirmed` code, not a client-side user list).
 *  - Forgot password and resend verification answer the same way for unknown addresses.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/auth-signin.spec.cjs
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
const password = 'ForgeDev2!'
const run = Date.now().toString(36)

// Seeded accounts that must never appear on a public page.
const SEEDED_EMAILS = ['admin@forge2.local', 'user@forge2.local', 'support@forge2.local', 'northstar.admin@forge2.local', 'northstar.user@forge2.local']
const PUBLIC_PAGES = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/verify-email?email=nobody%40example.test', '/checkout']

async function admin(method, urlPath, body) {
  const res = await fetch(API + urlPath, {
    method,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()

  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null }
}

// Wait until React owns the form so the submit is handled by the app (never a native GET with credentials).
async function waitForForm(page, fieldName) {
  await page.waitForFunction(
    name => {
      const form = document.querySelector(`input[name="${name}"]`)?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    fieldName,
    { timeout: 90000 }
  )
}

async function signIn(page, email, pass) {
  await page.goto(baseURL + '/auth/login')
  await waitForForm(page, 'password')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(pass)
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(180000)

test('public auth and checkout pages do not ship a user directory', async ({ request }) => {
  for (const route of PUBLIC_PAGES) {
    const response = await request.get(baseURL + route)

    expect(response.status(), route).toBeLessThan(400)
    const body = await response.text()

    for (const email of SEEDED_EMAILS) {
      expect(body.includes(email), `${route} leaks ${email}`).toBe(false)
    }
  }
})

test('login rejects a wrong password and stays on the login page', async ({ page }) => {
  await signIn(page, 'user@forge2.local', 'DefinitelyWrongPassword!2')
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('login with valid credentials signs in', async ({ page }) => {
  await signIn(page, 'user@forge2.local', password)
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
})

test('login sends an unconfirmed account to email verification', async ({ page }) => {
  test.skip(!API || !KEY, 'needs the local Supabase service key to create an unconfirmed user')
  const email = `unconfirmed.${run}@example.test`
  const created = await admin('POST', '/auth/v1/admin/users', { email, password, email_confirm: false })

  expect(created.ok, JSON.stringify(created.data)).toBe(true)

  try {
    await signIn(page, email, password)
    await page.waitForURL(/\/auth\/verify-email\?/, { timeout: 30000 })
    expect(new URL(page.url()).searchParams.get('email')).toBe(email)
  } finally {
    await admin('DELETE', '/auth/v1/admin/users/' + created.data.id)
  }
})

test('register sends an existing unconfirmed email to verification without changing its password', async ({ page }) => {
  test.skip(!API || !KEY, 'needs the local Supabase service key to create an unconfirmed user')
  const email = `pending.${run}@example.test`
  const original = 'OriginalPass!1'
  const created = await admin('POST', '/auth/v1/admin/users', { email, password: original, email_confirm: false })

  expect(created.ok, JSON.stringify(created.data)).toBe(true)

  try {
    await page.goto(baseURL + '/auth/register')
    await waitForForm(page, 'password')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill('DifferentPass!2')
    await page.locator('input[name="confirm-password"]').fill('DifferentPass!2')
    await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
    await page.waitForURL(/\/auth\/verify-email\?/, { timeout: 30000 })
    expect(new URL(page.url()).searchParams.get('email')).toBe(email)

    // Once confirmed, only the password chosen at the original sign-up works.
    await admin('PUT', '/auth/v1/admin/users/' + created.data.id, { email_confirm: true })
    const signIn = pass => admin('POST', '/auth/v1/token?grant_type=password', { email, password: pass })

    expect((await signIn(original)).ok).toBe(true)
    expect((await signIn('DifferentPass!2')).ok).toBe(false)
  } finally {
    await admin('DELETE', '/auth/v1/admin/users/' + created.data.id)
  }
})

test('email state lookup answers none/unconfirmed/confirmed for the service role only', async ({ request }) => {
  test.skip(!API || !KEY, 'needs the local Supabase service key')
  const state = async (email, key = KEY) => {
    const res = await request.post(API + '/rest/v1/rpc/forge_auth_email_state', {
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      data: { p_email: email }
    })

    return { status: res.status(), body: await res.json() }
  }

  const email = `state.${run}@example.test`
  const created = await admin('POST', '/auth/v1/admin/users', { email, password, email_confirm: false })

  try {
    expect((await state(`nobody.${run}@example.test`)).body).toBe('none')
    expect((await state(email.toUpperCase())).body).toBe('unconfirmed')
    expect((await state('user@forge2.local')).body).toBe('confirmed')

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY

    if (anonKey) expect((await state(email, anonKey)).status).toBeGreaterThanOrEqual(400)
  } finally {
    await admin('DELETE', '/auth/v1/admin/users/' + created.data.id)
  }
})

test('forgot password answers the same way for an unknown address', async ({ page }) => {
  await page.goto(baseURL + '/auth/forgot-password')
  await waitForForm(page, 'email')
  await page.locator('input[name="email"]').fill(`nobody.${run}@example.test`)
  await page.locator('form', { has: page.locator('input[name="email"]') }).locator('button[type="submit"]').click()
  await expect(page.getByText(/If an account exists for that email address/i)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/does not exist/i)).toHaveCount(0)
})

test('resend verification answers the same way for an unknown address', async ({ page }) => {
  const email = `nobody.${run}@example.test`

  await page.goto(baseURL + '/auth/verify-email?email=' + encodeURIComponent(email))
  const resend = page.getByRole('button', { name: /resend/i })

  await expect(resend).toBeEnabled({ timeout: 60000 })
  await resend.click()
  await expect(page.getByText(/still needs to be verified/i)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/not found/i)).toHaveCount(0)
})
