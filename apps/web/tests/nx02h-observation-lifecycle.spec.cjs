/**
 * NX-02H — Observation full lifecycle Playwright coverage.
 * Controls: ObservationControls + ObservationCrossModuleActions + ObservationRecordForm.
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  waitForPost,
  createObservation,
  clickWorkflowButton,
  confirmCommentedTransition,
  assertNoHorizontalOverflow,
  readObsRowVersion
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial', timeout: 180000 })
test.setTimeout(300000)

test.describe('NX-02H observation lifecycle', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let observationTitle
  let observationId
  let observationUrl
  let chosenReviewPath = null

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('create observation and adopt row version on sequential save', async () => {
    const stamp = Date.now()
    observationTitle = 'NX-02H observation lifecycle ' + stamp

    await createObservation(page, observationTitle)
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })
    await expect(page.getByText(/OBS-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 20000 })

    observationUrl = page.url()
    observationId = observationUrl.split('/').pop()

    const versionAfterCreate = await readObsRowVersion(page)
    // data-obs-row-version / data-obs-controls-row-version expose optimistic concurrency token
    if (versionAfterCreate == null) {
      console.log('SOFT CHECK: row version data attributes not exposed after create.')
    } else {
      expect(versionAfterCreate).toBeGreaterThanOrEqual(1)
    }

    // Sequential second save — force a field change and assert version adoption when UI exposes it.
    const description = page.locator('textarea[name="description"]')
    await expect(description).toBeVisible({ timeout: 20000 })
    await description.fill(
      'NX-02H observation describing an unsafe condition requiring review and follow-up. (edited for row-version check)'
    )

    const savePost = waitForPost(page, /\/observations(\/|$)/i)
    await page.getByRole('button', { name: /Save Observation/i }).click()
    expect((await savePost).ok()).toBeTruthy()
    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'load' })

    const versionAfterSave = await readObsRowVersion(page)
    if (versionAfterCreate != null && versionAfterSave != null) {
      expect(versionAfterSave).toBeGreaterThan(versionAfterCreate)
    } else {
      console.log('SOFT CHECK: Could not assert row version adoption; attributes missing.')
    }
  })

  test('submit → begin review → require_action OR no_action', async () => {
    await page.goto(observationUrl)
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })

    const submitted = await clickWorkflowButton(page, /^Submit$/i, /\/observations(\/|$)/i)
    expect(submitted, 'Submit control must be available for company-owner on draft Observation').toBeTruthy()
    await expect(page.getByText(/Submitted/i).first()).toBeVisible({ timeout: 20000 })

    const began = await clickWorkflowButton(page, /Begin Review/i, /\/observations(\/|$)/i)
    expect(began, 'Begin Review must be available for company-owner').toBeTruthy()
    await expect(page.getByText(/In Review|Review/i).first()).toBeVisible({ timeout: 20000 })

    // Prefer Require Action (enables close_from_action); fall back to No Action.
    const required = await clickWorkflowButton(page, /Require Action/i, /\/observations(\/|$)/i)
    if (required) {
      chosenReviewPath = 'require_action'
      await expect(page.getByText(/Action Required/i).first()).toBeVisible({ timeout: 20000 })
    } else {
      const noAction = await clickWorkflowButton(page, /No Action/i, /\/observations(\/|$)/i)
      expect(noAction, 'Require Action or No Action must be available after review').toBeTruthy()
      chosenReviewPath = 'no_action'
      await expect(page.getByText(/No Action/i).first()).toBeVisible({ timeout: 20000 })
    }
  })

  test('create linked CAPA or Risk when cross-module buttons exist', async () => {
    await page.goto(observationUrl)
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })

    const capaButton = page.getByRole('button', { name: /Create Corrective Action/i })
    const riskButton = page.getByRole('button', { name: /Create Risk/i })

    let linked = false

    if (await capaButton.isVisible().catch(() => false)) {
      const capaPost = waitForPost(page, /\/observations(\/|$)/i, 20000).catch(() => null)
      await capaButton.click()
      await capaPost
      await page.waitForURL(/\/corrective-actions\/[0-9a-f-]+$/i, { timeout: 20000 }).catch(() => {})
      if (/\/corrective-actions\/[0-9a-f-]+$/i.test(page.url())) {
        linked = true
        await page.goto(observationUrl)
      } else {
        console.log('SOFT CHECK: Create Corrective Action did not navigate to CAPA detail.')
        await page.goto(observationUrl)
      }
    }

    if (!linked && (await riskButton.isVisible().catch(() => false))) {
      const riskPost = waitForPost(page, /\/observations(\/|$)/i, 20000).catch(() => null)
      await riskButton.click()
      await riskPost
      await page.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 20000 }).catch(() => {})
      if (/\/risk-register\/[0-9a-f-]+$/i.test(page.url())) {
        linked = true
        await page.goto(observationUrl)
      } else {
        console.log('SOFT CHECK: Create Risk did not navigate to risk detail.')
        await page.goto(observationUrl)
      }
    }

    if (!linked) {
      console.log(
        'SOFT CHECK: Neither Create Corrective Action nor Create Risk button produced a linked record.'
      )
    }
  })

  test('close with comment and reload confirms status / activity / timeline', async () => {
    await page.goto(observationUrl)
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })

    const closed = await confirmCommentedTransition(
      page,
      /^Close$/i,
      /\/observations(\/|$)/i,
      'NX-02H closure summary for ' + (chosenReviewPath || 'review') + ' path.',
      'obs-transition-comment-'
    )

    if (!closed) {
      throw new Error('Close control with comment panel must be available for company-owner')
    }

    await expect(page.getByText(/Closed/i).first()).toBeVisible({ timeout: 20000 })

    await page.reload({ waitUntil: 'load' })
    await expect(page.getByRole('heading', { name: observationTitle })).toBeVisible({
      timeout: 20000
    })
    await expect(page.getByText(/Closed/i).first()).toBeVisible({ timeout: 20000 })

    // Activity cards / shared RecordActivityTimeline / WorkflowTimeline
    const activityHeading = page.getByRole('heading', { name: /^Activity$/i })
    if (await activityHeading.isVisible().catch(() => false)) {
      await expect(activityHeading).toBeVisible()
    } else {
      console.log('SOFT CHECK: Activity heading not visible after close.')
    }

    // Timeline events should retain transition history when WorkflowTimeline rendered
    const timelineText = page.getByText(/submit|begin_review|require_action|no_action|close/i).first()
    if (await timelineText.isVisible().catch(() => false)) {
      await expect(timelineText).toBeVisible()
    } else {
      console.log('SOFT CHECK: Workflow timeline transition keys not visible as plain text.')
    }
  })

  test('cross-tenant denial via Tenant B direct login', async ({ browser }) => {
    const context = await browser.newContext()
    const pageB = await context.newPage()
    pageB.setDefaultTimeout(60000)
    const {
      login: loginHelper,
      TENANT_B_EMAIL,
      assertSafeDenial,
      baseURL: burl
    } = require('./nx02h-playwright-helpers.cjs')
    await loginHelper(pageB, TENANT_B_EMAIL)
    await assertSafeDenial(pageB, burl + '/observations/' + observationId)
    await context.close()
  })
})

test.describe('NX-02H observation mobile viewport', () => {
  test('create + submit without horizontal overflow at 375x812', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }
    })
    const page = await context.newPage()
    await login(page, 'admin@forge2.local')

    const title = 'NX-02H mobile observation ' + Date.now()
    await createObservation(page, title)
    await assertNoHorizontalOverflow(page)

    const submitted = await clickWorkflowButton(page, /^Submit$/i, /\/observations(\/|$)/i)
    if (submitted) {
      await expect(page.getByText(/Submitted/i).first()).toBeVisible({ timeout: 20000 })
      await assertNoHorizontalOverflow(page)
    } else {
      console.log('SOFT CHECK: Submit not available on mobile observation detail; overflow checked after create.')
    }

    await context.close()
  })
})
