/**
 * NX-02R §22 — JSA revision Playwright (hard expects).
 * Asserts by record identity / version text, not URL change alone.
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  createJsa,
  waitForPost,
  addJsaStepHazardControl,
  addJsaPpeAndTraining,
  activateJsaViaWorkflow,
  clickWorkflowButtonHard
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(420000)

test.describe('NX-02R JSA revision', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let originalTitle
  let originalId
  let originalUrl
  let revisionId
  let revisionUrl
  const stepTitle = 'Isolate energy sources'
  const hazardText = 'Unexpected stored energy release'
  const controlTitle = 'Apply lock and tag'
  const ppeLabel = 'Hard hat / safety glasses'

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('create active JSA with steps/hazards/controls/PPE/training', async () => {
    originalTitle = 'NX-02R revision source ' + Date.now()
    await createJsa(page, originalTitle)
    originalUrl = page.url()
    originalId = originalUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(originalId).toBeTruthy()

    await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/^v1$/i).or(page.getByText(/v1\b/)).first()).toBeVisible({
      timeout: 20000
    })

    await addJsaStepHazardControl(page, { stepTitle, hazardText, controlTitle })
    await addJsaPpeAndTraining(page, ppeLabel)
    await activateJsaViaWorkflow(page)
    await expect(page.getByTestId('jsa-status')).toHaveText(/^Active$/i, { timeout: 20000 })
  })

  test('Create Revision → next version DRAFT with copied content', async () => {
    await page.goto(originalUrl, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible({ timeout: 20000 })

    const revisionSummary = page.locator('#revision-summary')
    const createRevision = page.getByRole('button', { name: /Create revision/i })
    await expect(revisionSummary).toBeVisible({ timeout: 20000 })
    await expect(createRevision).toBeVisible()
    await expect(createRevision).toBeEnabled()

    await revisionSummary.fill('NX-02R revision for lineage coverage.')

    // Delay the server-action POST so the pending state is observable; the button must disable
    // (and a forced second click must not dispatch) while the revision request is in flight.
    const originalPath = '/jsas/' + originalId
    let revisionPosts = 0
    await page.route(
      url => url.pathname === originalPath,
      async route => {
        if (route.request().method() === 'POST') {
          revisionPosts++
          await new Promise(resolve => setTimeout(resolve, 2500))
        }
        await route.continue()
      }
    )
    await createRevision.click()
    const pendingButton = page.getByRole('button', { name: /Creating/i })
    await expect(pendingButton).toBeVisible({ timeout: 5000 })
    await expect(pendingButton).toBeDisabled()
    await pendingButton.click({ force: true, timeout: 2000 }).catch(() => null)
    await page.waitForURL(
      url => {
        const id = String(url).match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
        return Boolean(id && id !== originalId)
      },
      { timeout: 60000 }
    )
    await page.waitForLoadState('networkidle').catch(() => null)
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => null)
    expect(revisionPosts, 'Create Revision must submit exactly one request while pending').toBe(1)

    revisionUrl = page.url()
    revisionId = revisionUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(revisionId).toBeTruthy()
    expect(revisionId).not.toBe(originalId)

    await expect(page.getByTestId('jsa-status')).toHaveText(/Draft/i, { timeout: 20000 })
    await expect(page.getByText(/^v2$/i).or(page.getByText(/v2\b/)).first()).toBeVisible({
      timeout: 20000
    })
    await expect(page.getByText(stepTitle).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(hazardText).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(controlTitle).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(ppeLabel).first()).toBeVisible({ timeout: 20000 })
  })

  test('edit revision leaves original unchanged', async () => {
    await page.goto(revisionUrl, { waitUntil: 'networkidle' })
    const titleField = page.locator('input[name="title"], #jsa-title').first()
    await expect(titleField).toBeVisible({ timeout: 20000 })
    const revisedTitle = originalTitle + ' REVISED'
    await titleField.fill(revisedTitle)
    await page.getByTestId('jsa-save').click()
    await expect(page.getByRole('heading', { name: revisedTitle })).toBeVisible({ timeout: 30000 })

    await page.goto(originalUrl, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('jsa-status')).toHaveText(/^Active$/i, { timeout: 20000 })
    await expect(page.getByText(/^v1$/i).or(page.getByText(/v1\b/)).first()).toBeVisible()
  })

  test('activate revision supersedes previous; only one ACTIVE', async () => {
    await page.goto(revisionUrl, { waitUntil: 'networkidle' })
    await activateJsaViaWorkflow(page)
    await expect(page.getByText(/^v2$/i).or(page.getByText(/v2\b/)).first()).toBeVisible()

    await page.goto(originalUrl, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('jsa-status')).toHaveText(/Superseded/i, { timeout: 20000 })

    await page.goto(revisionUrl, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('jsa-status')).toHaveText(/^Active$/i, { timeout: 20000 })
  })
})
