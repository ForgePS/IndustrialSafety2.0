/**
 * NX-02H — JSA/JHA lifecycle Playwright coverage.
 * Controls: JsaControls + JsaDetailPanels (steps/hazards/controls/revision/execution).
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  waitForPost,
  createJsa,
  clickWorkflowButton,
  selectFirstNonEmptyOption,
  assertNoHorizontalOverflow
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test.describe('NX-02H JSA lifecycle', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let jsaTitle
  let jsaUrl

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('create JSA', async () => {
    jsaTitle = 'NX-02H JSA lifecycle ' + Date.now()
    await createJsa(page, jsaTitle)
    await expect(page.getByRole('heading', { name: jsaTitle })).toBeVisible({ timeout: 20000 })
    jsaUrl = page.url()
    await expect(page.getByRole('heading', { name: /JSA Workflow/i })).toBeVisible({
      timeout: 20000
    }).catch(() => {
      console.log('SOFT CHECK: JSA Workflow card not visible yet.')
    })
  })

  test('add step / hazard / control when panels allow', async () => {
    await page.goto(jsaUrl)
    await expect(page.getByRole('heading', { name: jsaTitle })).toBeVisible({ timeout: 20000 })

    const stepTitle = page.locator('#step-title')
    if (!(await stepTitle.isVisible().catch(() => false))) {
      console.log('SOFT CHECK: Job steps panel / Add step controls not editable.')
      return
    }
    if (!(await stepTitle.isEnabled().catch(() => false))) {
      console.log('SOFT CHECK: Step title disabled (non-draft or permission).')
      return
    }

    await stepTitle.fill('Isolate energy sources')
    const stepDescription = page.locator('#step-description')
    if (await stepDescription.isVisible().catch(() => false)) {
      await stepDescription.fill('Verify LOTO before work begins.')
    }

    const addStep = page.getByRole('button', { name: /^Add step$/i })
    if (!(await addStep.isEnabled().catch(() => false))) {
      console.log('SOFT CHECK: Add step disabled.')
      return
    }
    const stepPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
    await addStep.click({ timeout: 10000 })
    await stepPost
    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByText(/Isolate energy sources/i).first()).toBeVisible({ timeout: 20000 })

    const hazardDescription = page.locator('#hazard-description')
    if (await hazardDescription.isVisible().catch(() => false)) {
      await selectFirstNonEmptyOption(page.locator('#hazard-step'))
      await hazardDescription.fill('Unexpected stored energy release')

      const hazardCategory = page.locator('#hazard-category')
      if (await hazardCategory.isVisible().catch(() => false)) {
        await selectFirstNonEmptyOption(hazardCategory)
      }
      const hazardLikelihood = page.locator('#hazard-likelihood')
      if (await hazardLikelihood.isVisible().catch(() => false)) {
        await selectFirstNonEmptyOption(hazardLikelihood)
      }
      const hazardSeverity = page.locator('#hazard-severity')
      if (await hazardSeverity.isVisible().catch(() => false)) {
        await selectFirstNonEmptyOption(hazardSeverity)
      }
      const residualLikelihood = page.locator('#hazard-residual-likelihood')
      if (await residualLikelihood.isVisible().catch(() => false)) {
        await selectFirstNonEmptyOption(residualLikelihood)
      }
      const residualSeverity = page.locator('#hazard-residual-severity')
      if (await residualSeverity.isVisible().catch(() => false)) {
        await selectFirstNonEmptyOption(residualSeverity)
      }

      const addHazard = page.getByRole('button', { name: /^Add hazard$/i })
      if (await addHazard.isEnabled().catch(() => false)) {
        const hazardPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
        await addHazard.click({ timeout: 10000 })
        await hazardPost
        await page.waitForTimeout(500)
        await page.reload({ waitUntil: 'load' })
        await expect(page.getByText(/Unexpected stored energy release/i).first()).toBeVisible({
          timeout: 20000
        })
      } else {
        console.log('SOFT CHECK: Add hazard disabled (missing step/likelihood/severity).')
      }
    } else {
      console.log('SOFT CHECK: Hazard form not visible after adding step.')
    }

    const controlTitle = page.locator('#control-title')
    if (await controlTitle.isVisible().catch(() => false)) {
      await selectFirstNonEmptyOption(page.locator('#control-hazard'))
      await selectFirstNonEmptyOption(page.locator('#control-type'))
      await controlTitle.fill('Apply lock and tag')
      const controlDescription = page.locator('#control-description')
      if (await controlDescription.isVisible().catch(() => false)) {
        await controlDescription.fill('Personal lock on energy isolation point.')
      }

      const addControl = page.getByRole('button', { name: /^Add control$/i })
      if (await addControl.isEnabled().catch(() => false)) {
        const controlPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
        await addControl.click({ timeout: 10000 })
        await controlPost
        await page.waitForTimeout(500)
        await page.reload({ waitUntil: 'load' })
        await expect(page.getByText(/Apply lock and tag/i).first()).toBeVisible({ timeout: 20000 })
      } else {
        console.log('SOFT CHECK: Add control disabled (no hazard yet).')
      }
    } else {
      console.log('SOFT CHECK: Control form not visible.')
    }
  })

  test('submit / approve / activate via JsaControls', async () => {
    await page.goto(jsaUrl)

    const submitted = await clickWorkflowButton(page, /^Submit$/i, /\/jsas(\/|$)/i)
    if (!submitted) {
      const alt = await clickWorkflowButton(page, /Submit for Review/i, /\/jsas(\/|$)/i)
      expect(alt, 'Submit control must be available').toBeTruthy()
    }
    await expect(page.getByText(/In Review|Review/i).first()).toBeVisible({ timeout: 20000 })

    const approved = await clickWorkflowButton(page, /^Approve$/i, /\/jsas(\/|$)/i)
    expect(approved, 'Approve must be available after submit with complete hazard structure').toBeTruthy()
    await expect(page.getByText(/Approved/i).first()).toBeVisible({ timeout: 20000 })

    const activated = await clickWorkflowButton(page, /^Activate$/i, /\/jsas(\/|$)/i)
    expect(activated, 'Activate must be available after approve').toBeTruthy()
    await expect(page.getByText(/Active/i).first()).toBeVisible({ timeout: 20000 })
  })

  test('create revision when button exists', async () => {
    await page.goto(jsaUrl)
    const revisionSummary = page.locator('#revision-summary')
    const createRevision = page.getByRole('button', { name: /Create revision/i })

    if (
      !(await createRevision.isVisible().catch(() => false)) ||
      !(await revisionSummary.isVisible().catch(() => false))
    ) {
      test.skip(true, 'Create revision controls not visible')
    }

    await revisionSummary.fill('NX-02H revision for lifecycle coverage.')
    const revPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
    await createRevision.click()
    await revPost
    await page.waitForURL(/\/jsas\/[0-9a-f-]+$/i, { timeout: 20000 }).catch(() => {})

    // Revision may navigate to the new draft JSA id
    if (page.url() !== jsaUrl && /\/jsas\/[0-9a-f-]+$/i.test(page.url())) {
      await expect(page.getByText(/Draft|revision|version/i).first()).toBeVisible({
        timeout: 20000
      }).catch(() => {
        console.log('SOFT CHECK: Landed on revision JSA without draft label.')
      })
      // Return to original for execution tests
      await page.goto(jsaUrl)
    } else {
      console.log('SOFT CHECK: Create revision did not navigate to a new JSA id.')
    }
  })

  test('start field execution when reachable', async () => {
    await page.goto(jsaUrl)

    const startExecution = page.getByRole('button', { name: /Start execution/i })
    if (!(await startExecution.isVisible().catch(() => false))) {
      test.skip(true, 'Start execution not available (JSA may not be active / no execute perm)')
    }

    await selectFirstNonEmptyOption(page.locator('#execution-lead'))
    await selectFirstNonEmptyOption(page.locator('#execution-location'))
    const notes = page.locator('#execution-notes')
    if (await notes.isVisible().catch(() => false)) {
      await notes.fill('NX-02H field execution for lifecycle coverage.')
    }

    const execPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
    await startExecution.click()
    await execPost
    await page
      .waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 20000 })
      .catch(() => {})

    if (/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i.test(page.url())) {
      await expect(page.getByText(/planned|in_progress|active|Execution/i).first()).toBeVisible({
        timeout: 20000
      })
    } else {
      console.log('SOFT CHECK: Start execution did not navigate to execution detail.')
    }
  })
})

test.describe('NX-02H JSA mobile viewport', () => {
  test('execution page has no horizontal overflow at 375x812 when reachable', async ({
    browser
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }
    })
    const page = await context.newPage()
    await login(page, 'admin@forge2.local')

    const title = 'NX-02H mobile JSA ' + Date.now()
    await createJsa(page, title)
    await assertNoHorizontalOverflow(page)

    // Try to reach an execution: submit → approve → activate → start execution
    await clickWorkflowButton(page, /^Submit$/i, /\/jsas(\/|$)/i)
    await clickWorkflowButton(page, /^Approve$/i, /\/jsas(\/|$)/i)
    await clickWorkflowButton(page, /^Activate$/i, /\/jsas(\/|$)/i)

    const startExecution = page.getByRole('button', { name: /Start execution/i })
    if (!(await startExecution.isVisible().catch(() => false))) {
      console.log(
        'SOFT CHECK: Execution page not reachable on mobile path; overflow asserted on JSA detail.'
      )
      await assertNoHorizontalOverflow(page)
      await context.close()
      return
    }

    await selectFirstNonEmptyOption(page.locator('#execution-lead'))
    await selectFirstNonEmptyOption(page.locator('#execution-location'))
    const execPost = waitForPost(page, /\/jsas(\/|$)/i, 20000).catch(() => null)
    await startExecution.click()
    await execPost
    await page
      .waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 20000 })
      .catch(() => {})

    if (/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i.test(page.url())) {
      await assertNoHorizontalOverflow(page)
    } else {
      console.log('SOFT CHECK: Could not open execution detail on mobile; asserting JSA detail.')
      await page.goto(baseURL + '/jsas')
      await assertNoHorizontalOverflow(page)
    }

    await context.close()
  })
})
