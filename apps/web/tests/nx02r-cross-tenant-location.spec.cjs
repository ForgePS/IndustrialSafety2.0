/**
 * NX-02R §25–26 — Cross-tenant (Tenant B direct login) + location-scope UI denials.
 * Requires: node apps/web/tests/setup-nx02r-playwright.mjs
 */
const { test, expect } = require('@playwright/test')
const {
  baseURL,
  login,
  createObservation,
  createRisk,
  createJsa,
  addJsaStepHazardControl,
  activateJsaViaWorkflow,
  selectByLabelHint,
  selectByLabelStrict,
  clickUntilPost,
  waitForPost,
  selectFirstNonEmptyOption,
  assertSafeDenial,
  TENANT_B_EMAIL,
  SCOPED_EMAIL
} = require('./nx02h-playwright-helpers.cjs')

test.describe.configure({ mode: 'serial' })
test.setTimeout(420000)

test.describe('NX-02R cross-tenant + location-scope UI', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let adminContext
  /** @type {import('@playwright/test').Page} */
  let adminPage

  let observationId
  let riskId
  let jsaId
  let executionId
  let a2ObservationId
  let a2RiskId
  let a2JsaId

  test.beforeAll({ timeout: 240000 }, async ({ browser }) => {
    adminContext = await browser.newContext()
    adminPage = await adminContext.newPage()
    adminPage.setDefaultTimeout(60000)
    await login(adminPage, 'admin@forge2.local')
  })

  test.afterAll(async () => {
    await adminContext?.close()
  })

  test('admin creates Tenant A observation/risk/jsa/execution + A2 records', async () => {
    const stamp = Date.now()
    await createObservation(adminPage, 'NX-02R CT obs A1 ' + stamp)
    observationId = adminPage.url().match(/\/observations\/([0-9a-f-]+)/i)?.[1]
    expect(observationId).toBeTruthy()

    await createRisk(adminPage, 'NX-02R CT risk A1 ' + stamp)
    riskId = adminPage.url().match(/\/risk-register\/([0-9a-f-]+)/i)?.[1]
    expect(riskId).toBeTruthy()

    await createJsa(adminPage, 'NX-02R CT jsa A1 ' + stamp)
    jsaId = adminPage.url().match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(jsaId).toBeTruthy()
    await addJsaStepHazardControl(adminPage)
    await activateJsaViaWorkflow(adminPage)
    await selectFirstNonEmptyOption(adminPage.locator('#execution-lead'))
    await selectByLabelHint(adminPage.locator('#execution-location'), /Demo Location/i)
    const start = adminPage.getByRole('button', { name: /Start execution/i })
    await clickUntilPost(adminPage, start, /\/jsas(\/|$)/i)
    await adminPage.waitForURL(/\/jsas\/[0-9a-f-]+\/executions\/[0-9a-f-]+$/i, { timeout: 30000 })
    executionId = adminPage.url().match(/\/executions\/([0-9a-f-]+)/i)?.[1]
    expect(executionId).toBeTruthy()

    // Location A2 records
    await createObservation(adminPage, 'NX-02R scope obs A2 ' + stamp)
    // Re-open create and force A2 — createObservation defaults Demo; patch via create with location
    await adminPage.goto(baseURL + '/observations/create', { waitUntil: 'networkidle' })
    await adminPage.locator('input[name="title"], #observation-title').first().fill('NX-02R A2 obs ' + stamp)
    await adminPage
      .locator('textarea[name="description"], #observation-description')
      .first()
      .fill('Location A2 observation for scope denial.')
    await selectByLabelStrict(
      adminPage.locator('select[name="location_id"], #observation-location_id').first(),
      /Location A2/i
    )
    await adminPage.getByRole('button', { name: /Save Observation/i }).click()
    await adminPage.waitForURL(/\/observations\/[0-9a-f-]+$/i, { timeout: 60000 })
    a2ObservationId = adminPage.url().match(/\/observations\/([0-9a-f-]+)/i)?.[1]
    expect(a2ObservationId).toBeTruthy()

    await adminPage.goto(baseURL + '/risk-register/create', { waitUntil: 'networkidle' })
    await adminPage.locator('input[name="title"], #risk-title').first().fill('NX-02R A2 risk ' + stamp)
    await adminPage
      .locator('textarea[name="description"], #risk-description')
      .first()
      .fill('Location A2 risk for location-scope denial coverage.')
    await selectByLabelStrict(
      adminPage.locator('select[name="location_id"], #risk-location_id').first(),
      /Location A2/i
    )
    await selectFirstNonEmptyOption(
      adminPage.locator('select[name="owner_personnel_id"], #risk-owner_personnel_id').first()
    )
    await adminPage.getByRole('button', { name: /Save Risk/i }).click()
    await adminPage.waitForURL(/\/risk-register\/[0-9a-f-]+$/i, { timeout: 60000 })
    a2RiskId = adminPage.url().match(/\/risk-register\/([0-9a-f-]+)/i)?.[1]
    expect(a2RiskId).toBeTruthy()

    await createJsa(adminPage, 'NX-02R A2 jsa ' + stamp, { locationLabel: /Location A2/i })
    a2JsaId = adminPage.url().match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(a2JsaId).toBeTruthy()
  })

  test('§25 Tenant B direct login denied Tenant A record URLs', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, TENANT_B_EMAIL)

    await assertSafeDenial(page, baseURL + '/observations/' + observationId)
    await assertSafeDenial(page, baseURL + '/risk-register/' + riskId)
    await assertSafeDenial(page, baseURL + '/jsas/' + jsaId)
    await assertSafeDenial(page, baseURL + '/jsas/' + jsaId + '/executions/' + executionId)

    await context.close()
  })

  test('§26 location-scoped user denied Location A2 record URLs', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await login(page, SCOPED_EMAIL)

    await assertSafeDenial(page, baseURL + '/observations/' + a2ObservationId)
    await assertSafeDenial(page, baseURL + '/risk-register/' + a2RiskId)
    await assertSafeDenial(page, baseURL + '/jsas/' + a2JsaId)

    await context.close()
  })
})
