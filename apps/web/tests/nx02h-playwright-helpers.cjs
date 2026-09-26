/**
 * Shared Playwright helpers for NX-02H lifecycle smoke specs.
 * Patterns mirror apps/web/tests/nx02-risk-prevention-smoke.spec.cjs.
 */

const { expect } = require('@playwright/test')

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const password = 'ForgeDev2!'
const OUTSIDE_ORG = '30000000-0000-4000-8000-000000000100'

async function login(page, email) {
  await page.goto(baseURL + '/auth/login', { waitUntil: 'networkidle', timeout: 90000 })
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 45000 })
  // Settle past i18n hydration mismatch so Local Demo / form submit handlers remain attached.
  await page.waitForTimeout(500)

  if (email === 'user@forge2.local' || email === 'admin@forge2.local') {
    const demoName = email === 'admin@forge2.local' ? 'Local Forge Admin' : 'Local Demo User'
    const demo = page.getByRole('button', { name: demoName })
    await expect(demo).toBeVisible({ timeout: 20000 })
    await demo.click()
    await expect(page.locator('input[type="email"]')).toHaveValue(email, { timeout: 10000 })
  } else {
    // Fallback for non-demo accounts: type character-by-character so RHF controlled inputs accept values.
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    await emailInput.click()
    await emailInput.fill('')
    await emailInput.pressSequentially(email, { delay: 15 })
    await passwordInput.click()
    await passwordInput.fill('')
    await passwordInput.pressSequentially(password, { delay: 15 })
    await expect(emailInput).toHaveValue(email, { timeout: 10000 })
  }

  await page.getByRole('button', { name: 'Sign in to Forge Industrial Safety 2.0' }).click()
  await page.waitForURL(url => !String(url.pathname || '').includes('/auth/login'), {
    timeout: 90000
  })
}

async function waitForPost(page, pathPattern, timeout = 30000) {
  return page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      pathPattern.test(new URL(response.url()).pathname),
    { timeout }
  )
}

async function selectFirstNonEmptyOption(selectLocator) {
  if (!(await selectLocator.isVisible().catch(() => false))) return false
  if (!(await selectLocator.isEnabled().catch(() => false))) return false
  const options = await selectLocator.locator('option').evaluateAll(nodes =>
    nodes
      .map(node => ({ value: node.value, label: (node.textContent || '').trim() }))
      .filter(item => item.value)
  )
  if (!options.length) return false
  await selectLocator.selectOption(options[0].value)
  return true
}

async function selectByLabelHint(selectLocator, labelHint) {
  if (!(await selectLocator.isVisible().catch(() => false))) return false
  try {
    await selectLocator.selectOption({ label: labelHint })
    return true
  } catch {
    return selectFirstNonEmptyOption(selectLocator)
  }
}

async function createObservation(page, title) {
  await page.goto(baseURL + '/observations/create', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(400)
  await expect(page.locator('input[name="title"], #observation-title').first()).toBeVisible({
    timeout: 20000
  })

  const titleField = page.locator('input[name="title"], #observation-title').first()
  await titleField.click()
  await titleField.fill('')
  await titleField.pressSequentially(title, { delay: 10 })

  const description = page.locator('textarea[name="description"], #observation-description').first()
  await description.fill(
    'NX-02H observation describing an unsafe condition requiring review and follow-up.'
  )

  const typeSelect = page.locator('select[name="observation_type"], #observation-observation_type').first()
  if (await typeSelect.isVisible().catch(() => false)) {
    const options = await typeSelect.locator('option').allTextContents()
    const unsafe = options.findIndex(label => /unsafe/i.test(label))
    if (unsafe > 0) await typeSelect.selectOption({ index: unsafe })
    else if (options.length > 1) await typeSelect.selectOption({ index: 1 })
  }

  const modeSelect = page.locator('select[name="reporting_mode"], #observation-reporting_mode').first()
  if (await modeSelect.isVisible().catch(() => false)) {
    await modeSelect.selectOption({ label: /named/i }).catch(async () => {
      await modeSelect.selectOption('named')
    })
  }

  const occurred = page.locator('input[name="occurred_at"], #observation-occurred_at').first()
  if (await occurred.isVisible().catch(() => false)) {
    await occurred.fill('2026-09-20T10:00')
  }

  await selectByLabelHint(
    page.locator('select[name="location_id"], #observation-location_id').first(),
    /Demo Location/i
  )

  await page.getByRole('button', { name: /Save Observation/i }).click()
  await page.waitForURL(/\/observations\/[0-9a-f-]+$/i, { timeout: 60000 })
}

async function createRisk(page, title) {
  await page.goto(baseURL + '/risk-register/create', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(400)
  await expect(page.locator('input[name="title"], #risk-title').first()).toBeVisible({ timeout: 20000 })

  const titleField = page.locator('input[name="title"], #risk-title').first()
  await titleField.click()
  await titleField.fill('')
  await titleField.pressSequentially(title, { delay: 10 })

  const description = page.locator('textarea[name="description"], #risk-description').first()
  if (await description.isVisible().catch(() => false)) {
    await description.fill('NX-02H risk register entry for lifecycle coverage.')
  }

  const hazard = page.locator('textarea[name="hazard_description"], #risk-hazard_description').first()
  if (await hazard.isVisible().catch(() => false)) {
    await hazard.fill('Unguarded pinch point during changeover.')
  }

  await selectByLabelHint(page.locator('select[name="location_id"], #risk-location_id').first(), /Demo Location/i)
  await selectByLabelHint(
    page.locator('select[name="owner_personnel_id"], #risk-owner_personnel_id').first(),
    /Forge Demo User/i
  )

  const category = page.locator('select[name="category_key"], #risk-category_key').first()
  if (await category.isVisible().catch(() => false)) {
    await selectFirstNonEmptyOption(category)
  }

  const saveBtn = page.getByRole('button', { name: /Save Risk/i })
  await saveBtn.click()
  await page.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 60000 })
}

async function createJsa(page, title) {
  await page.goto(baseURL + '/jsas/create', { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForTimeout(400)

  const titleField = page.locator('input[name="title"], #jsa-title').first()
  await expect(titleField).toBeVisible({ timeout: 20000 })
  await titleField.click()
  await titleField.fill('')
  await titleField.pressSequentially(title, { delay: 10 })

  const jobTitle = page.locator('input[name="job_title"], #jsa-job_title').first()
  if (await jobTitle.isVisible().catch(() => false)) {
    await jobTitle.click()
    await jobTitle.fill('')
    await jobTitle.pressSequentially('NX-02H job', { delay: 10 })
  }
  const taskName = page.locator('input[name="task_name"], #jsa-task_name').first()
  if (await taskName.isVisible().catch(() => false)) {
    await taskName.click()
    await taskName.fill('')
    await taskName.pressSequentially('NX-02H task', { delay: 10 })
  }
  const description = page.locator('textarea[name="description"], #jsa-description').first()
  if (await description.isVisible().catch(() => false)) {
    await description.fill('NX-02H JSA header for lifecycle, steps, and execution coverage.')
  }
  await selectByLabelHint(page.locator('select[name="location_id"], #jsa-location_id').first(), /Demo Location/i)
  await selectFirstNonEmptyOption(page.locator('select[name="prepared_by_personnel_id"], #jsa-prepared_by_personnel_id').first())

  const saveBtn = page.getByTestId('jsa-save').or(page.getByRole('button', { name: /Save JSA/i }))
  await expect(saveBtn).toBeEnabled({ timeout: 10000 })
  await saveBtn.click()
  await page.waitForURL(/\/jsas\/[0-9a-f-]+$/i, { timeout: 60000 })
}

/**
 * Click a simple (non-comment) ObservationControls / RiskControls / JsaControls button.
 * Returns false when the control is missing so callers can soft-skip.
 */
async function clickWorkflowButton(page, buttonName, pathPattern) {
  const button = page.getByRole('button', { name: buttonName }).first()
  if (!(await button.isVisible().catch(() => false))) return false
  if (!(await button.isEnabled().catch(() => false))) return false

  const postPromise = waitForPost(page, pathPattern, 45000).catch(() => null)
  await button.click()
  const post = await postPromise
  if (!post) {
    // Server actions may navigate without a matching POST pathname — accept URL/status settle.
    await page.waitForTimeout(800)
    await page.reload({ waitUntil: 'load' })
    return true
  }
  if (!post.ok()) {
    console.log('SOFT CHECK: Workflow POST not ok for ' + buttonName + ' status=' + post.status())
    await page.reload({ waitUntil: 'load' })
    return false
  }
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'load' })
  return true
}

/**
 * Open a commented transition panel, fill the comment, and confirm.
 * ObservationControls: Confirm {Label}; Risk/JSA form actions: Confirm {Label}.
 */
async function confirmCommentedTransition(page, openButtonName, pathPattern, comment, textareaIdPrefix) {
  const openButton = page.getByRole('button', { name: openButtonName }).first()
  if (!(await openButton.isVisible().catch(() => false))) return false

  await openButton.click()
  await page.waitForTimeout(300)

  const openLabel = ((await openButton.textContent()) || 'Close').trim()

  const textarea = textareaIdPrefix
    ? page.locator('textarea[id^="' + textareaIdPrefix + '"]').first()
    : page.locator('textarea[id*="transition-comment"], form.rounded-lg textarea, .rounded-lg.border textarea').first()

  if (!(await textarea.isVisible().catch(() => false))) {
    console.log('SOFT CHECK: Comment panel did not open for ' + openLabel)
    return false
  }

  await textarea.fill(comment)

  const confirm = page
    .getByRole('button', { name: new RegExp('Confirm\\s+' + openLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
    .or(page.getByRole('button', { name: /^Confirm /i }))
    .first()

  if (!(await confirm.isVisible().catch(() => false))) return false

  const postPromise = waitForPost(page, pathPattern, 20000).catch(() => null)
  await confirm.click()
  await postPromise

  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'load' })
  return true
}

async function assertNoHorizontalOverflow(page) {
  const overflowed = await page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const main = document.querySelector('main') || document.querySelector('[role="main"]')
    const scrollWidth = Math.max(root.scrollWidth, body ? body.scrollWidth : 0, main ? main.scrollWidth : 0)
    const clientWidth = Math.max(root.clientWidth, body ? body.clientWidth : 0, main ? main.clientWidth : 0)
    return scrollWidth > clientWidth + 2
  })
  expect(overflowed, 'Expected no horizontal overflow on main workflow viewport').toBeFalsy()
}

async function readObsRowVersion(page) {
  const formVersion = await page.locator('[data-obs-row-version]').first().getAttribute('data-obs-row-version').catch(() => null)
  const controlsVersion = await page
    .locator('[data-obs-controls-row-version]')
    .first()
    .getAttribute('data-obs-controls-row-version')
    .catch(() => null)
  const raw = formVersion || controlsVersion
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

async function switchToOutsideOrgIfAvailable(page) {
  await page.goto(baseURL + '/dashboard')
  const combo = page.getByRole('combobox', { name: /Active company/i })
  if (!(await combo.isVisible().catch(() => false))) {
    console.log('SOFT CHECK: Active company switcher not visible; skipping cross-tenant denial.')
    return false
  }

  const hasOutside = await combo.locator('option[value="' + OUTSIDE_ORG + '"]').count()
  if (!hasOutside) {
    console.log('SOFT CHECK: Outside org fixture not present; skipping cross-tenant denial.')
    return false
  }

  const orgSwitchPost = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      /\/(dashboard|$)/.test(new URL(response.url()).pathname),
    { timeout: 20000 }
  )
  await combo.selectOption(OUTSIDE_ORG)
  expect((await orgSwitchPost).ok()).toBeTruthy()
  await page.reload({ waitUntil: 'load' })
  await expect(combo).toHaveValue(OUTSIDE_ORG)
  return true
}

module.exports = {
  baseURL,
  password,
  OUTSIDE_ORG,
  login,
  waitForPost,
  selectFirstNonEmptyOption,
  selectByLabelHint,
  createObservation,
  createRisk,
  createJsa,
  clickWorkflowButton,
  confirmCommentedTransition,
  assertNoHorizontalOverflow,
  readObsRowVersion,
  switchToOutsideOrgIfAvailable
}
