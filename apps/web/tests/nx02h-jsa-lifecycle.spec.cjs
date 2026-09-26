/**
 * NX-02H — JSA/JHA lifecycle Playwright coverage (hardened; full revision/execution in nx02r-*).
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  waitForPost,
  createJsa,
  selectFirstNonEmptyOption,
  assertNoHorizontalOverflow,
  addJsaStepHazardControl,
  activateJsaViaWorkflow,
  expectJsaStatus,
  clickUntilPost
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
    })
  })

  test('add step / hazard / control', async () => {
    await page.goto(jsaUrl)
    await expect(page.getByRole('heading', { name: jsaTitle })).toBeVisible({ timeout: 20000 })
    await addJsaStepHazardControl(page)
  })

  test('submit / approve / activate via JsaControls', async () => {
    await page.goto(jsaUrl)
    await activateJsaViaWorkflow(page)
  })

  test('create revision navigates to draft next version', async () => {
    await page.goto(jsaUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const originalId = jsaUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    const revisionSummary = page.locator('#revision-summary')
    const createRevision = page.getByRole('button', { name: /Create revision/i })
    await expect(createRevision).toBeVisible({ timeout: 20000 })
    await expect(revisionSummary).toBeVisible()

    await revisionSummary.fill('NX-02H revision for lifecycle coverage.')
    await clickUntilPost(page, createRevision, /\/jsas(\/|$)/i)
    await page.waitForURL(
      url => {
        const m = String(url.pathname).match(/^\/jsas\/([0-9a-f-]+)$/i)
        return Boolean(m && m[1] !== originalId)
      },
      { timeout: 30000 }
    )
    const revisionId = page.url().match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(revisionId).toBeTruthy()
    expect(revisionId).not.toBe(originalId)
    await expectJsaStatus(page, /Draft/i)
    await expect(page.getByText(/^v2$/i).or(page.getByText(/v2\b/)).first()).toBeVisible()
    await page.goto(jsaUrl)
  })

  test('start field execution', async () => {
    await page.goto(jsaUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const startExecution = page.getByRole('button', { name: /Start execution/i })
    await expect(startExecution).toBeVisible({ timeout: 20000 })

    await selectFirstNonEmptyOption(page.locator('#execution-lead'))
    await selectFirstNonEmptyOption(page.locator('#execution-location'))
    const notes = page.locator('#execution-notes')
    if (await notes.isVisible().catch(() => false)) {
      await notes.fill('NX-02H field execution for lifecycle coverage.')
    }

    await clickUntilPost(page, startExecution, /\/jsas(\/|$)/i)
    await page.waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 30000 })
    await expect(page.getByText(/planned|in_progress|active|Execution/i).first()).toBeVisible({
      timeout: 20000
    })
  })
})

test.describe('NX-02H JSA mobile viewport', () => {
  test('execution page has no horizontal overflow at 375x812', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }
    })
    const page = await context.newPage()
    await login(page, 'admin@forge2.local')

    const title = 'NX-02H mobile JSA ' + Date.now()
    await createJsa(page, title)
    await assertNoHorizontalOverflow(page)

    await addJsaStepHazardControl(page)
    await activateJsaViaWorkflow(page)

    const startExecution = page.getByRole('button', { name: /Start execution/i })
    await expect(startExecution).toBeVisible({ timeout: 20000 })
    await selectFirstNonEmptyOption(page.locator('#execution-lead'))
    await selectFirstNonEmptyOption(page.locator('#execution-location'))
    await clickUntilPost(page, startExecution, /\/jsas(\/|$)/i)
    await page.waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 30000 })
    await assertNoHorizontalOverflow(page)

    await context.close()
  })
})
