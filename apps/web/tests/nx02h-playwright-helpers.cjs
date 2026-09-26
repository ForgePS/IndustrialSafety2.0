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
  const options = await selectLocator.locator('option').evaluateAll(nodes =>
    nodes
      .map(node => ({ value: node.value, label: (node.textContent || '').trim() }))
      .filter(item => item.value)
  )
  const matcher =
    labelHint instanceof RegExp ? item => labelHint.test(item.label) : item => item.label === labelHint
  const match = options.find(matcher)
  if (match) {
    await selectLocator.selectOption(match.value)
    return true
  }
  return selectFirstNonEmptyOption(selectLocator)
}

/** Strict variant: fails when no option label matches. */
async function selectByLabelStrict(selectLocator, labelHint) {
  await expect(selectLocator).toBeVisible({ timeout: 20000 })
  const options = await selectLocator.locator('option').evaluateAll(nodes =>
    nodes
      .map(node => ({ value: node.value, label: (node.textContent || '').trim() }))
      .filter(item => item.value)
  )
  const matcher =
    labelHint instanceof RegExp ? item => labelHint.test(item.label) : item => item.label === labelHint
  const match = options.find(matcher)
  expect(match, 'Expected option matching ' + String(labelHint)).toBeTruthy()
  await selectLocator.selectOption(match.value)
  return true
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

async function createJsa(page, title, options = {}) {
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
    await jobTitle.pressSequentially('NX-02R job', { delay: 10 })
  }
  const taskName = page.locator('input[name="task_name"], #jsa-task_name').first()
  if (await taskName.isVisible().catch(() => false)) {
    await taskName.click()
    await taskName.fill('')
    await taskName.pressSequentially('NX-02R task', { delay: 10 })
  }
  const description = page.locator('textarea[name="description"], #jsa-description').first()
  if (await description.isVisible().catch(() => false)) {
    await description.fill('NX-02R JSA header for lifecycle, steps, and execution coverage.')
  }

  const locationSelect = page.locator('select[name="location_id"], #jsa-location_id').first()
  if (options.locationLabel) await selectByLabelStrict(locationSelect, options.locationLabel)
  else await selectByLabelHint(locationSelect, /Demo Location/i)
  await selectFirstNonEmptyOption(page.locator('select[name="prepared_by_personnel_id"], #jsa-prepared_by_personnel_id').first())

  if (options.isTemplate) {
    const templateCheckbox = page.locator('#jsa-is_template, input[name="is_template"]').first()
    await expect(templateCheckbox).toBeVisible({ timeout: 10000 })
    await templateCheckbox.check()
  }

  const saveBtn = page.getByTestId('jsa-save').or(page.getByRole('button', { name: /Save JSA/i }))
  await expect(saveBtn).toBeEnabled({ timeout: 10000 })
  await saveBtn.click()
  await page.waitForURL(/\/jsas\/[0-9a-f-]+$/i, { timeout: 60000 })
}

/**
 * Click a simple (non-comment) ObservationControls / RiskControls / JsaControls button.
 * Returns false when the control is missing or the POST fails.
 */
async function clickWorkflowButton(page, buttonName, pathPattern) {
  // Prefer JSA workflow control testids when present.
  const key =
    /submit/i.test(String(buttonName)) && !/review/i.test(String(buttonName))
      ? 'submit'
      : /approve/i.test(String(buttonName))
        ? 'approve'
        : /activate/i.test(String(buttonName))
          ? 'activate'
          : null

  // Clicks that land before client hydration are silently dropped; the server-action POST is the
  // signal that the click registered. Retry (after reload + networkidle) until the POST is observed.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(300)
    const testIdButton = key
      ? page.getByTestId('jsa-workflow-controls').getByTestId('jsa-transition-' + key)
      : null
    const button =
      testIdButton && (await testIdButton.isVisible().catch(() => false))
        ? testIdButton
        : page.getByRole('button', { name: buttonName }).first()

    const visible = await button
      .waitFor({ state: 'visible', timeout: attempt === 0 ? 10000 : 5000 })
      .then(() => true)
      .catch(() => false)
    if (!visible) return false
    if (!(await button.isEnabled().catch(() => false))) return false

    const postPromise = waitForPost(page, pathPattern, 15000).catch(() => null)
    await button.click()
    const response = await postPromise
    if (response) {
      if (!response.ok()) return false
      // Wait for client transition + router.refresh — do not reload mid-flight.
      await page.waitForTimeout(1000)
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
      return true
    }
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  }
  return false
}

/**
 * Click a client-side action button and wait for its server-action POST. Clicks that land before
 * hydration are dropped, so retry (after networkidle) until the POST is observed. Throws otherwise.
 */
async function clickUntilPost(page, locator, pathPattern, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(300)
    await expect(locator).toBeVisible({ timeout: 20000 })
    await expect(locator).toBeEnabled({ timeout: 20000 })
    const post = waitForPost(page, pathPattern, 15000).catch(() => null)
    await locator.click()
    const response = await post
    if (response) return response
  }
  throw new Error('Server action POST never observed for ' + String(pathPattern))
}

/** Hard variant — throws when the workflow control is missing or fails. */
async function clickWorkflowButtonHard(page, buttonName, pathPattern) {
  const ok = await clickWorkflowButton(page, buttonName, pathPattern)
  expect(ok, 'Workflow control must succeed: ' + String(buttonName)).toBeTruthy()
}

async function expectJsaStatus(page, statusRegex) {
  await expect(page.getByTestId('jsa-status')).toHaveText(statusRegex, { timeout: 20000 })
}

async function clickJsaTransitionUntil(page, key, labelRegex, expectedStatus) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
    const btn = page
      .getByTestId('jsa-transition-' + key)
      .or(page.getByTestId('jsa-workflow-controls').getByRole('button', { name: labelRegex }))
      .first()
    await expect(btn).toBeVisible({ timeout: 20000 })
    await expect(btn).toBeEnabled({ timeout: 20000 })
    await btn.click()
    const changed = await expect(page.getByTestId('jsa-status'))
      .toHaveText(expectedStatus, { timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    if (changed) return
    // Click may have landed before hydration — reload and retry.
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
    const already = await expect(page.getByTestId('jsa-status'))
      .toHaveText(expectedStatus, { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (already) return
  }
  await expect(page.getByTestId('jsa-status')).toHaveText(expectedStatus, { timeout: 5000 })
}

async function activateJsaViaWorkflow(page) {
  await clickJsaTransitionUntil(page, 'submit', /^Submit$/i, /In Review|Review/i)
  await clickJsaTransitionUntil(page, 'approve', /^Approve$/i, /Approved/i)
  await clickJsaTransitionUntil(page, 'activate', /^Activate$/i, /^Active$/i)
}

async function addJsaStepHazardControl(page, {
  stepTitle = 'Isolate energy sources',
  hazardText = 'Unexpected stored energy release',
  controlTitle = 'Apply lock and tag'
} = {}) {
  const stepField = page.locator('#step-title')
  await expect(stepField).toBeVisible({ timeout: 20000 })
  await expect(stepField).toBeEnabled()
  await stepField.fill(stepTitle)
  const stepDescription = page.locator('#step-description')
  if (await stepDescription.isVisible().catch(() => false)) {
    await stepDescription.fill('Verify LOTO before work begins.')
  }
  const addStep = page.getByRole('button', { name: /^Add step$/i })
  await expect(addStep).toBeEnabled()
  await clickUntilPost(page, addStep, /\/jsas(\/|$)/i)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await expect(page.getByText(stepTitle).first()).toBeVisible({ timeout: 20000 })

  await selectFirstNonEmptyOption(page.locator('#hazard-step'))
  await page.locator('#hazard-description').fill(hazardText)
  await selectFirstNonEmptyOption(page.locator('#hazard-category'))
  await selectFirstNonEmptyOption(page.locator('#hazard-likelihood'))
  await selectFirstNonEmptyOption(page.locator('#hazard-severity'))
  await selectFirstNonEmptyOption(page.locator('#hazard-residual-likelihood'))
  await selectFirstNonEmptyOption(page.locator('#hazard-residual-severity'))
  const addHazard = page.getByRole('button', { name: /^Add hazard$/i })
  await expect(addHazard).toBeEnabled()
  await clickUntilPost(page, addHazard, /\/jsas(\/|$)/i)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await expect(page.getByText(hazardText).first()).toBeVisible({ timeout: 20000 })

  await selectFirstNonEmptyOption(page.locator('#control-hazard'))
  await selectFirstNonEmptyOption(page.locator('#control-type'))
  await page.locator('#control-title').fill(controlTitle)
  const controlDescription = page.locator('#control-description')
  if (await controlDescription.isVisible().catch(() => false)) {
    await controlDescription.fill('Personal lock on energy isolation point.')
  }
  const addControl = page.getByRole('button', { name: /^Add control$/i })
  await expect(addControl).toBeEnabled()
  await clickUntilPost(page, addControl, /\/jsas(\/|$)/i)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await expect(page.getByText(controlTitle).first()).toBeVisible({ timeout: 20000 })
}

async function addJsaPpeAndTraining(page, ppeLabel = 'Hard hat / safety glasses') {
  await page.locator('#ppe-label').fill(ppeLabel)
  const addPpe = page.getByRole('button', { name: /^Add PPE$/i })
  await expect(addPpe).toBeEnabled()
  await clickUntilPost(page, addPpe, /\/jsas(\/|$)/i)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await expect(page.getByText(ppeLabel).first()).toBeVisible({ timeout: 20000 })

  const courseSelect = page.locator('#training-course')
  await expect(courseSelect).toBeVisible({ timeout: 20000 })
  await selectFirstNonEmptyOption(courseSelect)
  const addTraining = page.getByRole('button', { name: /^Add training$/i })
  await expect(addTraining).toBeEnabled()
  await clickUntilPost(page, addTraining, /\/jsas(\/|$)/i)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
}

async function assertSafeDenial(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const status = response?.status()
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const denied =
    status === 404 ||
    status === 403 ||
    /not found|forbidden|you do not have access|unauthorized/i.test(bodyText)
  expect(denied, 'Expected safe denial for ' + url + ' (status=' + status + ')').toBeTruthy()
}

async function confirmCommentedTransition(page, openButtonName, pathPattern, comment, textareaIdPrefix) {
  const openButton = page.getByRole('button', { name: openButtonName }).first()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
  if (!(await openButton.isVisible().catch(() => false))) return false

  const openLabel = ((await openButton.textContent()) || 'Close').trim()

  const textarea = textareaIdPrefix
    ? page.locator('textarea[id^="' + textareaIdPrefix + '"]').first()
    : page.locator('textarea[id*="transition-comment"], form.rounded-lg textarea, .rounded-lg.border textarea').first()

  // Opening the comment panel is client-only state; a click before hydration is dropped. Retry.
  let opened = false
  for (let attempt = 0; attempt < 4 && !opened; attempt++) {
    await page.waitForTimeout(300)
    await openButton.click()
    opened = await textarea
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    if (!opened) await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
  }

  if (!opened) {
    console.log('SOFT CHECK: Comment panel did not open for ' + openLabel)
    return false
  }

  await textarea.fill(comment)

  const confirm = page
    .getByRole('button', {
      name: new RegExp('Confirm\\s+' + openLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    })
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
    const scrollWidth = Math.max(
      root.scrollWidth,
      body ? body.scrollWidth : 0,
      main ? main.scrollWidth : 0
    )
    const clientWidth = Math.max(
      root.clientWidth,
      body ? body.clientWidth : 0,
      main ? main.clientWidth : 0
    )
    return scrollWidth > clientWidth + 2
  })
  expect(overflowed, 'Expected no horizontal overflow on main workflow viewport').toBeFalsy()
}

async function readObsRowVersion(page) {
  const formVersion = await page
    .locator('[data-obs-row-version]')
    .first()
    .getAttribute('data-obs-row-version')
    .catch(() => null)
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
  LOC_A1: '20000000-0000-4000-8000-000000000300',
  LOC_A2: '20000000-0000-4000-8000-000000000301',
  CREW_IDS: [
    '20000000-0000-4000-8000-000000000610',
    '20000000-0000-4000-8000-000000000611',
    '20000000-0000-4000-8000-000000000612'
  ],
  TENANT_B_EMAIL: 'tenantb@forge2.local',
  SCOPED_EMAIL: 'scoped@forge2.local',
  login,
  waitForPost,
  selectFirstNonEmptyOption,
  selectByLabelHint,
  selectByLabelStrict,
  createObservation,
  createRisk,
  createJsa,
  clickWorkflowButton,
  clickWorkflowButtonHard,
  clickUntilPost,
  confirmCommentedTransition,
  assertNoHorizontalOverflow,
  readObsRowVersion,
  switchToOutsideOrgIfAvailable,
  addJsaStepHazardControl,
  addJsaPpeAndTraining,
  activateJsaViaWorkflow,
  expectJsaStatus,
  assertSafeDenial
}
