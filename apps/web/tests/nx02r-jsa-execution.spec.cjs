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
const ORG_A = '20000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000001'
const LOC_A = '20000000-0000-4000-8000-000000000300'
const first = data => (Array.isArray(data) ? data[0] : data)

/**
 * Intercepts server-action POSTs on `pathname` and rewrites every occurrence of `from` in the
 * payload to `to`. `onPost` can run fixture work before the request continues. Returns a counter.
 */
async function retargetActionPayload(page, pathname, from, to, onPost) {
  const counter = { count: 0 }
  await page.route(
    url => url.pathname === pathname,
    async route => {
      const request = route.request()
      const body = request.postData()
      if (request.method() === 'POST' && body && (from ? body.includes(from) : true)) {
        counter.count++
        if (onPost) await onPost()
        await route.continue({ postData: from ? body.split(from).join(to) : body })
        return
      }
      await route.continue()
    }
  )
  return counter
}

// Service-role REST is used only to force fixture statuses and to read back results; the code under
// test (server action + authorization gate) is exercised through the real UI request.
const envPath = path.join(__dirname, '..', '.env.local')
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

async function rest(method, urlPath, body) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + urlPath, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

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
  let foreignJsaId

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

  test('server rejects execution create for every non-active parent status (replayed action)', async () => {
    // Replay the real Start-execution server action captured on the ACTIVE JSA, but retarget it at
    // a non-active JSA. The server gate must reject each status and no execution row may exist.
    const targetId = draftUrl.match(/\/jsas\/([0-9a-f-]+)/i)?.[1]
    expect(targetId).toBeTruthy()
    expect(jsaId).toBeTruthy()

    for (const status of ['draft', 'in_review', 'approved', 'superseded', 'retired']) {
      const patched = await rest('PATCH', '/rest/v1/forge_jsas?id=eq.' + targetId, { status })
      expect(patched.ok, 'fixture status patch ' + status).toBeTruthy()

      await page.goto(jsaUrl, { waitUntil: 'networkidle' })
      await page.waitForTimeout(400)
      await selectByLabelHint(page.locator('#execution-lead'), /NX Crew Lead/i)
      await selectByLabelHint(page.locator('#execution-location'), /Demo Location/i)

      let retargeted = 0
      await page.route(
        url => url.pathname === '/jsas/' + jsaId,
        async route => {
          const request = route.request()
          const body = request.postData()
          if (request.method() === 'POST' && body && body.includes(jsaId)) {
            retargeted++
            await route.continue({ postData: body.split(jsaId).join(targetId) })
            return
          }
          await route.continue()
        }
      )
      const response = await clickUntilPost(
        page,
        page.getByRole('button', { name: /Start execution/i }),
        JSA_POST
      )
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      expect(response.ok()).toBeTruthy()
      expect(retargeted, 'action payload must be retargeted for ' + status).toBeGreaterThanOrEqual(1)
      await expect(page.getByText(/Only an ACTIVE JSA revision may be executed/i).first()).toBeVisible({
        timeout: 20000
      })
      expect(page.url()).not.toMatch(/\/executions\//)

      const rows = await rest(
        'GET',
        '/rest/v1/forge_jsa_executions?jsa_id=eq.' + targetId + '&select=id'
      )
      expect(Array.isArray(rows.data) ? rows.data.length : -1, 'no execution for ' + status).toBe(0)
    }

    await rest('PATCH', '/rest/v1/forge_jsas?id=eq.' + targetId, { status: 'draft' })
  })

  test('execution mutations bind to the authorized JSA; crew window enforced (replayed actions)', async () => {
    const executionId = executionUrl.match(/\/executions\/([0-9a-f-]+)/i)?.[1]
    expect(executionId).toBeTruthy()
    const executionPath = new URL(executionUrl).pathname

    // Another JSA + planned execution in the SAME organization (not the one being authorized).
    const foreignJsa = await rest('POST', '/rest/v1/forge_jsas', {
      organization_id: ORG_A,
      jsa_number: 'JSA-NX02R2-FOREIGN-' + Date.now(),
      title: 'NX-02R2 foreign JSA',
      status: 'draft',
      version: 1,
      location_id: LOC_A,
      created_by: USER_A,
      updated_by: USER_A
    })
    expect(foreignJsa.ok, JSON.stringify(foreignJsa.data)).toBeTruthy()
    foreignJsaId = first(foreignJsa.data).id
    const foreignExec = await rest('POST', '/rest/v1/forge_jsa_executions', {
      organization_id: ORG_A,
      jsa_id: foreignJsaId,
      execution_number: 'EXE-NX02R2-FOREIGN-' + Date.now(),
      status: 'planned',
      location_id: LOC_A,
      created_by: USER_A
    })
    expect(foreignExec.ok, JSON.stringify(foreignExec.data)).toBeTruthy()
    const foreignExecId = first(foreignExec.data).id

    const participantCount = async id => {
      const rows = await rest(
        'GET',
        '/rest/v1/forge_jsa_execution_participants?execution_id=eq.' + id + '&select=id'
      )
      return Array.isArray(rows.data) ? rows.data.length : -1
    }
    const ownBefore = await participantCount(executionId)

    // 1) Add crew with the authorized jsaId but a foreign executionId → not found, no insert.
    await page.goto(executionUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    await selectByLabelHint(page.locator('#crew-person'), /NX Crew Two/i)
    const addRetarget = await retargetActionPayload(page, executionPath, executionId, foreignExecId)
    await clickUntilPost(page, page.getByRole('button', { name: /^Add$/i }), JSA_POST)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    expect(addRetarget.count).toBeGreaterThanOrEqual(1)
    await expect(page.getByText(/Execution not found/i).first()).toBeVisible({ timeout: 20000 })
    expect(await participantCount(foreignExecId)).toBe(0)

    // 2) Add crew while the execution is ACTIVE (status flipped just before the action runs).
    await page.goto(executionUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    await selectByLabelHint(page.locator('#crew-person'), /NX Crew Two/i)
    const activeRetarget = await retargetActionPayload(page, executionPath, null, null, async () => {
      const flipped = await rest('PATCH', '/rest/v1/forge_jsa_executions?id=eq.' + executionId, {
        status: 'active'
      })
      expect(flipped.ok, JSON.stringify(flipped.data)).toBeTruthy()
    })
    try {
      await clickUntilPost(page, page.getByRole('button', { name: /^Add$/i }), JSA_POST)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      expect(activeRetarget.count).toBeGreaterThanOrEqual(1)
      await expect(
        page.getByText(/Crew can only be added while the execution is planned, briefing, or stopped/i).first()
      ).toBeVisible({ timeout: 20000 })
      expect(await participantCount(executionId)).toBe(ownBefore)
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await rest('PATCH', '/rest/v1/forge_jsa_executions?id=eq.' + executionId, { status: 'planned' })
    }
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

    // Replay an acknowledgement with a different (viewable) jsaId: the server must bind to the
    // execution's own parent and refuse, and no acknowledgement evidence may land on the other JSA.
    expect(foreignJsaId).toBeTruthy()
    const executionPath = new URL(executionUrl).pathname
    const ackRetarget = await retargetActionPayload(page, executionPath, jsaId, foreignJsaId)
    await clickUntilPost(
      page,
      page.getByRole('button', { name: /Record acknowledgment/i }).first(),
      JSA_POST
    )
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    expect(ackRetarget.count).toBeGreaterThanOrEqual(1)
    await expect(page.getByText(/Execution not found/i).first()).toBeVisible({ timeout: 20000 })
    const foreignAcks = await rest(
      'GET',
      '/rest/v1/forge_record_acknowledgements?resource_id=eq.' + foreignJsaId + '&select=id'
    )
    expect(Array.isArray(foreignAcks.data) ? foreignAcks.data.length : -1).toBe(0)
    await page.reload({ waitUntil: 'networkidle' })

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
