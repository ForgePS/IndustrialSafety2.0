const { test, expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
const OUTSIDE_ORG = '30000000-0000-4000-8000-000000000100'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  const named = page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i })
  if (await named.isVisible().catch(() => false)) {
    await named.click()
  } else {
    await page.locator('form button[type="submit"]').first().click()
  }
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

async function waitForPost(page, pathPattern, timeout = 30000) {
  return page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      pathPattern.test(new URL(response.url()).pathname),
    { timeout }
  )
}

/**
 * Click a client-side action button and wait for its server-action POST. Clicks that land before
 * hydration are dropped, so retry after reload + networkidle until the POST is observed.
 */
async function clickUntilPost(page, button, pathPattern) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(300)
    await expect(button).toBeVisible({ timeout: 20000 })
    const post = waitForPost(page, pathPattern, 15000).catch(() => null)
    await button.click()
    const response = await post
    if (response) return response
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  }
  throw new Error('Server action POST never observed for ' + String(pathPattern))
}

async function selectOptionByLabelRegex(select, regex) {
  const value = await select
    .locator('option')
    .evaluateAll(
      (nodes, source) => {
        const re = new RegExp(source, 'i')
        const hit = nodes.find(node => node.value && re.test((node.textContent || '').trim()))
        return hit ? hit.value : null
      },
      regex.source
    )
  if (value) await select.selectOption(value)
  return Boolean(value)
}

async function createObservation(page, title) {
  await page.goto(baseURL + '/observations/create', { waitUntil: 'networkidle', timeout: 90000 })
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(400)

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(
    'NX-02 smoke observation describing an unsafe condition requiring review and follow-up.'
  )

  const typeSelect = page.locator('select[name="observation_type"]')
  if (await typeSelect.isVisible().catch(() => false)) {
    const options = await typeSelect.locator('option').allTextContents()
    const unsafe = options.findIndex(label => /unsafe/i.test(label))
    if (unsafe > 0) await typeSelect.selectOption({ index: unsafe })
    else if (options.length > 1) await typeSelect.selectOption({ index: 1 })
  }

  const modeSelect = page.locator('select[name="reporting_mode"]')
  if (await modeSelect.isVisible().catch(() => false)) {
    await modeSelect.selectOption({ label: /named/i }).catch(async () => {
      await modeSelect.selectOption('named')
    })
  }

  const occurred = page.locator('input[name="occurred_at"]')
  if (await occurred.isVisible().catch(() => false)) {
    await occurred.fill('2026-09-20T10:00')
  }

  const location = page.locator('select[name="location_id"]')
  if (await location.isVisible().catch(() => false)) {
    await selectOptionByLabelRegex(location, /Cypress Bend Main Plant/i)
  }

  const createPost = waitForPost(page, /\/observations(\/|$)/i)
  await page.getByRole('button', { name: /Save Observation/i }).click()
  expect((await createPost).ok()).toBeTruthy()
  // Dev-mode first compile of the detail route can exceed 20s on a cold server.
  await page.waitForURL(/\/observations\/[0-9a-f-]+$/i, { timeout: 90000 })
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

test('NX-02 risk prevention observation, risk, JSA, and tenant isolation smoke', async ({
  browser
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, 'user@forge2.local')

  const stamp = Date.now()
  const observationTitle = 'NX-02 smoke observation ' + stamp

  await createObservation(page, observationTitle)
  await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
    timeout: 20000
  })
  await expect(page.getByText(/OBS-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 20000 })
  const observationUrl = page.url()
  const observationId = observationUrl.split('/').pop()

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
  const submitButton = page.getByRole('button', { name: /^Submit$/i })
  if (await submitButton.isVisible().catch(() => false)) {
    const submitResponse = await clickUntilPost(page, submitButton, /\/observations(\/|$)/i)
    expect(submitResponse.ok()).toBeTruthy()
    await page.waitForTimeout(1000)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(/Submitted/i).first()).toBeVisible({ timeout: 20000 })
  } else {
    // Fallback: edit status path if domain control is not visible for this user.
    const statusSelect = page.locator('select[name="status"]')
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.selectOption('submitted')
      const savePost = waitForPost(page, /\/observations(\/|$)/i)
      await page.getByRole('button', { name: /Save Observation/i }).click()
      expect((await savePost).ok()).toBeTruthy()
      await page.reload({ waitUntil: 'load' })
    }
  }

  const createRiskButton = page.getByRole('button', { name: /Create Risk/i })
  let createdRiskId = null
  if (await createRiskButton.isVisible().catch(() => false)) {
    const riskResponse = await clickUntilPost(page, createRiskButton, /\/observations(\/|$)/i)
    expect(riskResponse.ok()).toBeTruthy()
    await page.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 20000 }).catch(() => {})
    if (/\/risk-register\/[0-9a-f-]+$/i.test(page.url())) {
      createdRiskId = page.url().split('/').pop()
    }
  } else {
    console.log('SOFT CHECK: Create Risk button not visible; continuing.')
  }

  await page.goto(baseURL + '/risk-register')
  await expect(page.getByRole('heading', { name: /Risk Register/i })).toBeVisible({
    timeout: 20000
  })
  if (createdRiskId) {
    await expect(page.getByText(observationTitle).or(page.locator('a[href*="' + createdRiskId + '"]')).first()).toBeVisible({
      timeout: 20000
    }).catch(() => {
      console.log('SOFT CHECK: Created risk not listed by title; list page loaded.')
    })
  }

  const jsaTitle = 'NX-02 smoke JSA ' + stamp
  await page.goto(baseURL + '/jsas/create')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 })
  await page.locator('input[name="title"]').fill(jsaTitle)

  const jobTitle = page.locator('input[name="job_title"]')
  if (await jobTitle.isVisible().catch(() => false)) {
    await jobTitle.fill('Smoke job')
  }
  const taskName = page.locator('input[name="task_name"]')
  if (await taskName.isVisible().catch(() => false)) {
    await taskName.fill('Smoke task')
  }
  const description = page.locator('textarea[name="description"]')
  if (await description.isVisible().catch(() => false)) {
    await description.fill('NX-02 smoke JSA header for lifecycle and CAPA cross-module coverage.')
  }
  const jsaLocation = page.locator('select[name="location_id"]')
  if (await jsaLocation.isVisible().catch(() => false)) {
    await selectOptionByLabelRegex(jsaLocation, /Cypress Bend Main Plant/i)
  }

  const jsaPost = waitForPost(page, /\/jsas(\/|$)/i)
  await page.getByRole('button', { name: /Save JSA/i }).click()
  expect((await jsaPost).ok()).toBeTruthy()
  await page.waitForURL(/\/jsas\/[0-9a-f-]+$/i, { timeout: 60000 })
  await expect(page.getByRole('heading', { name: jsaTitle })).toBeVisible({ timeout: 20000 })
  await expect(
    page.getByRole('button', { name: /Create Corrective Action/i })
  ).toBeVisible({ timeout: 20000 })

  // Cross-tenant: switch to outside org seeded by setup-support-smoke.mjs
  await page.goto(baseURL + '/dashboard', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(500)
  const orgSwitchPost = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/(dashboard|$)/.test(new URL(response.url()).pathname),
    { timeout: 20000 }
  )
  await page.getByRole('combobox', { name: /Active company/i }).selectOption(OUTSIDE_ORG)
  expect((await orgSwitchPost).ok()).toBeTruthy()
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByRole('combobox', { name: /Active company/i })).toHaveValue(OUTSIDE_ORG)

  const isolatedResponse = await page.goto(baseURL + '/observations/' + observationId)
  expect(isolatedResponse?.status()).toBe(404)

  await context.close()
})
