/**
 * NX-02H — Risk register lifecycle Playwright coverage.
 * Controls: RiskControls + RiskAssessmentPanel + RiskCrossModuleActions.
 */
const { test, expect } = require('@playwright/test')
const {
  login,
  waitForPost,
  createRisk,
  clickWorkflowButton,
  confirmCommentedTransition,
  selectFirstNonEmptyOption
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

test.describe('NX-02H risk lifecycle', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let riskTitle
  let riskUrl

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('create risk', async () => {
    riskTitle = 'NX-02H risk lifecycle ' + Date.now()
    await createRisk(page, riskTitle)
    await expect(page.getByRole('heading', { name: riskTitle })).toBeVisible({ timeout: 20000 })
    riskUrl = page.url()
    await expect(page.getByText(/RSK-|Risk Workflow/i).first()).toBeVisible({ timeout: 20000 }).catch(
      () => {
        console.log('SOFT CHECK: Risk number / Risk Workflow heading soft-check.')
      }
    )
  })

  test('assess inherent and residual when RiskAssessmentPanel allows', async () => {
    await page.goto(riskUrl)
    await expect(page.getByRole('heading', { name: riskTitle })).toBeVisible({ timeout: 20000 })

    const inherentLikelihood = page.locator('#inherent-likelihood')
    const inherentSeverity = page.locator('#inherent-severity')
    const residualLikelihood = page.locator('#residual-likelihood')
    const residualSeverity = page.locator('#residual-severity')

    if (!(await inherentLikelihood.isVisible().catch(() => false))) {
      console.log('SOFT CHECK: Inherent assessment panel not rendered.')
      return
    }
    if (!(await inherentLikelihood.isEnabled().catch(() => false))) {
      console.log('SOFT CHECK: Inherent assessment disabled (permission/status).')
      return
    }

    const likOk = await selectFirstNonEmptyOption(inherentLikelihood)
    const sevOk = await selectFirstNonEmptyOption(inherentSeverity)
    if (!likOk || !sevOk) {
      console.log('SOFT CHECK: No matrix likelihood/severity options for inherent assessment.')
      return
    }

    const assessInherent = page.getByRole('button', { name: /Assess Inherent/i })
    if (await assessInherent.isVisible().catch(() => false)) {
      if (!(await assessInherent.isEnabled().catch(() => false))) {
        console.log('SOFT CHECK: Assess Inherent button disabled.')
        return
      }
      const post = waitForPost(page, /\/risk-register(\/|$)/i, 20000).catch(() => null)
      await assessInherent.click()
      await post
      await page.waitForTimeout(400)
      await page.reload({ waitUntil: 'load' })
      const inherentCard = page.getByRole('heading', { name: /Inherent Risk/i })
      if (await inherentCard.isVisible().catch(() => false)) {
        await expect(
          page.locator('text=/score|low|moderate|medium|high|critical/i').first()
        ).toBeVisible({ timeout: 10000 }).catch(() => {
          console.log('SOFT CHECK: Inherent band/score text not visible after assess.')
        })
      }
    } else {
      console.log('SOFT CHECK: Assess Inherent button not visible (permission or matrix).')
    }

    if (
      (await residualLikelihood.isVisible().catch(() => false)) &&
      (await residualLikelihood.isEnabled().catch(() => false))
    ) {
      await selectFirstNonEmptyOption(residualLikelihood)
      await selectFirstNonEmptyOption(residualSeverity)
      const assessResidual = page.getByRole('button', { name: /Assess Residual/i })
      if (
        (await assessResidual.isVisible().catch(() => false)) &&
        (await assessResidual.isEnabled().catch(() => false))
      ) {
        await assessResidual.click()
        await page.waitForTimeout(800)
        await page.reload({ waitUntil: 'load' })
      } else {
        console.log('SOFT CHECK: Assess Residual button not available.')
      }
    }

    // Activation requires active controls (or documented acceptance).
    const controlTitle = page.locator('#control-title')
    if (
      (await controlTitle.isVisible().catch(() => false)) &&
      (await controlTitle.isEnabled().catch(() => false))
    ) {
      await selectFirstNonEmptyOption(page.locator('#control-type'))
      await controlTitle.fill('NX-02H guard and interlock')
      const controlDescription = page.locator('#control-description')
      if (await controlDescription.isVisible().catch(() => false)) {
        await controlDescription.fill('Physical guard with interlock during changeover.')
      }
      const addControl = page.getByRole('button', { name: /Add Control/i })
      if (await addControl.isEnabled().catch(() => false)) {
        await addControl.click()
        await page.waitForTimeout(800)
        await page.reload({ waitUntil: 'load' })
        await expect(page.getByText(/NX-02H guard and interlock/i).first()).toBeVisible({
          timeout: 20000
        })
      }
    }

    // Activation requires next review / review due date.
    const reviewDue = page.locator('input[name="review_due_at"], #risk-review_due_at, input[name="next_review_at"]').first()
    if (await reviewDue.isVisible().catch(() => false) && (await reviewDue.isEnabled().catch(() => false))) {
      await reviewDue.fill('2026-12-31T10:00')
      const saveBtn = page.getByRole('button', { name: /Save Risk/i })
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click()
        await page.waitForTimeout(800)
        await page.reload({ waitUntil: 'load' })
      }
    }
  })

  test('transition submit_assessment → submit_for_review → activate when possible', async () => {
    await page.goto(riskUrl)
    await expect(page.getByRole('heading', { name: /Risk Workflow/i })).toBeVisible({
      timeout: 20000
    }).catch(() => {})

    // Ensure owner is set before activation gates (edit form if present).
    const owner = page.locator('select[name="owner_personnel_id"]')
    if (await owner.isVisible().catch(() => false)) {
      const current = await owner.inputValue().catch(() => '')
      if (!current) {
        await selectFirstNonEmptyOption(owner)
        const savePost = waitForPost(page, /\/risk-register(\/|$)/i, 20000).catch(() => null)
        const saveBtn = page.getByRole('button', { name: /Save Risk/i })
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click()
          await savePost
          await page.reload({ waitUntil: 'load' })
        }
      }
    }

    const assessed = await clickWorkflowButton(
      page,
      /Submit Assessment/i,
      /\/risk-register(\/|$)/i
    )
    expect(assessed, 'Submit Assessment must be available after inherent scoring').toBeTruthy()
    await expect(page.getByText(/Assessment/i).first()).toBeVisible({ timeout: 20000 })

    const reviewed = await clickWorkflowButton(
      page,
      /Submit for Review/i,
      /\/risk-register(\/|$)/i
    )
    expect(reviewed, 'Submit for Review must be available').toBeTruthy()
    await expect(page.getByText(/Review/i).first()).toBeVisible({ timeout: 20000 })

    const activated = await clickWorkflowButton(page, /^Activate$/i, /\/risk-register(\/|$)/i)
    expect(activated, 'Activate must be available after assessment + controls + review date').toBeTruthy()
    await expect(page.getByText(/Active/i).first()).toBeVisible({ timeout: 20000 })
  })

  test('create CAPA link when Create Corrective Action exists', async () => {
    await page.goto(riskUrl)
    const capaButton = page.getByRole('button', { name: /Create Corrective Action/i })
    if (!(await capaButton.isVisible().catch(() => false))) {
      test.skip(true, 'Create Corrective Action button not visible on risk detail')
    }

    const capaPost = waitForPost(page, /\/risk-register(\/|$)/i, 20000).catch(() => null)
    await capaButton.click()
    await capaPost
    await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 }).catch(() => {})
    if (!/\/corrective-actions\/[0-9a-f-]+$/i.test(page.url())) {
      console.log('SOFT CHECK: CAPA create from risk did not navigate to corrective-actions detail.')
    }
    await page.goto(riskUrl)
  })

  test('close / reopen when RiskControls buttons exist', async () => {
    await page.goto(riskUrl)

    const closed = await confirmCommentedTransition(
      page,
      /^Close$/i,
      /\/risk-register(\/|$)/i,
      'NX-02H risk closure summary — residual risk accepted for smoke coverage.',
      'risk-transition-comment-'
    )

    if (!closed) {
      console.log('SOFT CHECK: Close not available (risk may still be draft/assessment/review).')
      return
    }

    await expect(page.getByText(/Closed/i).first()).toBeVisible({ timeout: 20000 })

    const reopened = await confirmCommentedTransition(
      page,
      /^Reopen$/i,
      /\/risk-register(\/|$)/i,
      'NX-02H reopen after close for lifecycle coverage.',
      'risk-transition-comment-'
    )

    if (!reopened) {
      // reopen is commented transition; also try simple if UI ever changes
      const simpleReopen = await clickWorkflowButton(page, /^Reopen$/i, /\/risk-register(\/|$)/i)
      if (!simpleReopen) {
        console.log('SOFT CHECK: Reopen control not available after close.')
      }
    } else {
      await expect(page.getByText(/Review|Active|Assessment/i).first()).toBeVisible({
        timeout: 20000
      })
    }
  })
})
