/**
 * NX-02R §24 — JSA execution Playwright (hard expects).
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  createJsa,
  clickUntilPost,
  selectByLabelHint,
  addJsaStepHazardControl,
  addJsaPpeAndTraining,
  activateJsaViaWorkflow
} = require('./nx02h-playwright-helpers.cjs')

const JSA_POST = /\/jsas(\/|$)/i

test.describe.configure({ mode: 'serial' })
test.setTimeout(420000)

test.describe('NX-02R JSA execution', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context
  /** @type {import('@playwright/test').Page} */
  let page
  let jsaUrl
  let jsaId
  let executionUrl
  let draftUrl

  test.beforeAll({ timeout: 180000 }, async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('non-active: Start execution absent + server deny gate present', async () => {
    const title = 'NX-02R exec draft deny ' + Date.now()
    await createJsa(page, title)
    draftUrl = page.url()
    await expect(page.getByRole('button', { name: /Start execution/i })).toHaveCount(0)

    const src = fs.readFileSync(path.join(__dirname, '../src/lib/forgeJsa.ts'), 'utf8')
    const assignSrc = fs.readFileSync(
      path.join(__dirname, '../src/lib/forgeJsaAssignment.ts'),
      'utf8'
    )
    expect(src).toMatch(/assertJsaIsExecutableActive/)
    expect(assignSrc).toMatch(/Only an ACTIVE JSA revision may be executed/)
  })

  test('ACTIVE JSA → create execution with 3 personnel, roles, training warning', async () => {
    const title = 'NX-02R execution ' + Date.now()
    await createJsa(page, title)
    jsaUrl = page.url()
    jsaId = jsaUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(jsaId).toBeTruthy()

    await addJsaStepHazardControl(page)
    await addJsaPpeAndTraining(page)
    await activateJsaViaWorkflow(page)

    await selectByLabelHint(page.locator('#execution-lead'), /NX Crew Lead/i)
    await selectByLabelHint(page.locator('#execution-location'), /Demo Location/i)
    const notes = page.locator('#execution-notes')
    if (await notes.isVisible().catch(() => false)) {
      await notes.fill('NX-02R field execution.')
    }

    const startExecution = page.getByRole('button', { name: /Start execution/i })
    await clickUntilPost(page, startExecution, JSA_POST)
    await page.waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 30000 })
    executionUrl = page.url()

    // Add two more crew (lead already present) → 3 personnel
    for (const label of [/NX Crew Two/i, /NX Crew Three/i]) {
      await selectByLabelHint(page.locator('#crew-person'), label)
      await page.locator('#crew-role').selectOption('crew')
      const add = page.getByRole('button', { name: /^Add$/i })
      await clickUntilPost(page, add, JSA_POST)
      await page.waitForTimeout(400)
      await page.reload({ waitUntil: 'networkidle' })
    }

    await expect(page.getByText(/NX Crew Lead/i).first()).toBeVisible()
    await expect(page.getByText(/NX Crew Two/i).first()).toBeVisible()
    await expect(page.getByText(/NX Crew Three/i).first()).toBeVisible()
    await expect(page.getByText(/Training warnings/i).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/may be missing required training/i).first()).toBeVisible()
  })

  test('activation blocked before acks; all ack; activate; stop; resume; complete; persist', async () => {
    await page.goto(executionUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    await clickUntilPost(page, page.getByRole('button', { name: /Start briefing/i }), JSA_POST)
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle' })

    const activateBlocked = page.getByRole('button', { name: /Activate work \(acks required\)/i })
    await expect(activateBlocked).toBeVisible({ timeout: 20000 })
    await expect(activateBlocked).toBeDisabled()

    const ackButtons = page.getByRole('button', { name: /Record acknowledgment/i })
    const ackCount = await ackButtons.count()
    expect(ackCount).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < ackCount; i++) {
      const button = page.getByRole('button', { name: /Record acknowledgment/i }).first()
      await clickUntilPost(page, button, JSA_POST)
      await page.waitForTimeout(400)
      await page.reload({ waitUntil: 'networkidle' })
    }

    await expect(page.getByText(/Pending ack/i)).toHaveCount(0)
    const activate = page.getByRole('button', { name: /^Activate work$/i })
    await clickUntilPost(page, activate, JSA_POST)
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(/^active$/i).or(page.getByText(/\bactive\b/i)).first()).toBeVisible({
      timeout: 20000
    })

    await page.waitForTimeout(300)
    await page.locator('#stop-reason').fill('NX-02R stop-work: unexpected condition.')
    const stop = page.getByRole('button', { name: /Stop work/i })
    await clickUntilPost(page, stop, JSA_POST)
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(/stopped/i).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/unexpected condition/i).first()).toBeVisible()

    // Follow-up: resume briefing then re-activate
    await clickUntilPost(page, page.getByRole('button', { name: /Resume briefing/i }), JSA_POST)
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle' })
    const activateAgain = page.getByRole('button', { name: /^Activate work$/i })
    await clickUntilPost(page, activateAgain, JSA_POST)
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle' })

    await page.waitForTimeout(300)
    await page.getByPlaceholder(/Completion notes/i).fill('NX-02R execution completed after stop-work follow-up.')
    await clickUntilPost(page, page.getByRole('button', { name: /Mark completed/i }), JSA_POST)
    await page.waitForTimeout(800)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 20000 })

    await page.goto(executionUrl)
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 20000 })
    // Stop-work reason persists in the execution timeline (activity log) after resume + completion.
    await expect(
      page.getByTestId('jsa-execution-timeline').getByText(/unexpected condition/i).first()
    ).toBeVisible({ timeout: 20000 })
  })
})
