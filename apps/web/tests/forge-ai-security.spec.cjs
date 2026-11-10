/**
 * Forge AI Command Center stage 5 security and rollout, end to end against a running server
 * started with FORGE_AI_CRON_SECRET and the stage 1 test-provider variables:
 *  - a location-scoped supervisor sees an alert at their facility on the Command Center and through
 *    the agent tool, and stops seeing it once it belongs to another facility;
 *  - the Command Center needs its own permissions (no approvals or usage for a supervisor);
 *  - turning the forge_ai_command_center feature off for a tenant hides the Command Center, risk
 *    and recommendations pages, denies their agent tools and stops the cycle scoring risk;
 *  - the header assistant opens anywhere, carries the record a user is looking at, and is not shown
 *    to a member without forge_ai.use.
 * Run against a server: SMOKE_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test apps/web/tests/forge-ai-security.spec.cjs
 */
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const envPath = path.join(__dirname, '../.env.local')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.FORGE_AI_CRON_SECRET || 'forge-test-cron-secret'
const CYPRESS = '20000000-0000-4000-8000-000000000100'
const MAIN_PLANT = '20000000-0000-4000-8000-000000000300'
const PASSWORD = 'ForgeDev2!'
const RUN = Date.now().toString(36).toUpperCase()
const SUPERVISOR_EMAIL = `ai-sec-supervisor-${RUN.toLowerCase()}@forge2.local`
const MEMBER_EMAIL = `ai-sec-member-${RUN.toLowerCase()}@forge2.local`
const created = { users: [], roles: [], restore: [], locationId: null, alert: null }

test.describe.configure({ mode: 'serial' })
test.setTimeout(180000)

const rest = async (pathname, { method = 'GET', body, prefer = 'return=representation' } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(method + ' ' + pathname + ' ' + response.status + ' ' + text)

  return text ? JSON.parse(text) : null
}

const createMember = async (email, roleKey) => {
  const user = await rest('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true, user_metadata: { name: email, email, email_verified: true } }
  })

  created.users.push(user.id)
  await rest('/rest/v1/organization_memberships', {
    method: 'POST',
    body: { organization_id: CYPRESS, user_id: user.id, role: 'member', is_active: true },
    prefer: 'return=minimal'
  })
  await rest('/rest/v1/forge_tenant_user_location_access', {
    method: 'POST',
    body: { organization_id: CYPRESS, user_id: user.id, location_id: MAIN_PLANT },
    prefer: 'return=minimal'
  })

  if (roleKey) {
    const [role] = await rest(`/rest/v1/forge_tenant_roles?organization_id=eq.${CYPRESS}&role_key=eq.${roleKey}&select=id`)

    await rest('/rest/v1/forge_tenant_user_roles', {
      method: 'POST',
      body: { organization_id: CYPRESS, user_id: user.id, role_id: role.id },
      prefer: 'return=minimal'
    })
  }

  return user.id
}

const setCommandCenter = async enabled => {
  const [feature] = await rest('/rest/v1/forge_feature_registry?feature_key=eq.forge_ai_command_center&select=id')

  await rest(`/rest/v1/forge_tenant_entitlement_overrides?organization_id=eq.${CYPRESS}&feature_id=eq.${feature.id}`, {
    method: 'PATCH',
    body: { enabled },
    prefer: 'return=minimal'
  })
}

async function signIn(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.waitForFunction(
    () => {
      const form = document.querySelector('input[name="password"]')?.form

      return !!form && Object.keys(form).some(key => key.startsWith('__react'))
    },
    null,
    { timeout: 90000 }
  )
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('form', { has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const askTool = async (page, tool, args) => {
  const response = await page.request.post(baseURL + '/api/forge-ai/chat', {
    data: { message: `Check this. [[forge-test:tool:${tool} ${JSON.stringify(args)}]]`, conversationId: null }
  })

  expect(response.status()).toBe(200)

  return (await response.json()).message.content
}

test.beforeAll(async () => {
  // A second facility, and one real open asset alert at the main plant made critical and renamed
  // so it is easy to find. The asset stays where it is, so only the alert's facility changes.
  const [location] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: CYPRESS, name: 'AI Security Plant ' + RUN } })

  created.locationId = location.id

  const [alert] = await rest(
    `/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&location_id=eq.${MAIN_PLANT}&target_type=eq.asset&status=eq.open&select=id,title,severity,location_id&limit=1`
  )

  expect(alert, 'seed has an open asset alert at the main plant').toBeTruthy()
  created.alert = alert
  await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${alert.id}`, {
    method: 'PATCH',
    body: { severity: 'critical', title: 'SEC-' + RUN + ' ' + alert.title },
    prefer: 'return=minimal'
  })

  await createMember(SUPERVISOR_EMAIL, 'supervisor')
  await createMember(MEMBER_EMAIL, null)
})

test.afterAll(async () => {
  await setCommandCenter(true)

  if (created.alert) {
    await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${created.alert.id}`, {
      method: 'PATCH',
      body: { severity: created.alert.severity, title: created.alert.title, location_id: created.alert.location_id, status: 'open' },
      prefer: 'return=minimal'
    })
  }

  for (const undo of created.restore.reverse()) await undo().catch(() => null)

  for (const id of created.users) {
    await rest(`/rest/v1/organization_memberships?user_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    await rest('/auth/v1/admin/users/' + id, { method: 'DELETE' }).catch(() => null)
  }

  for (const id of created.roles) await rest(`/rest/v1/forge_tenant_roles?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => null)

  if (created.locationId) await rest(`/rest/v1/locations?id=eq.${created.locationId}`, { method: 'DELETE', prefer: 'return=minimal' })
})

test('a location supervisor sees only alerts at their own facility, on the page and through the agent', async ({ page, browser }) => {
  const title = 'SEC-' + RUN
  const severity = { status: null, severity: 'critical', limit: 50 }

  await signIn(page, SUPERVISOR_EMAIL)
  await page.goto(baseURL + '/ai/command-center')
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await expect(page.getByTestId('alert-center-item').filter({ hasText: title })).toHaveCount(1)
  expect(await askTool(page, 'search_watch_alerts', severity)).toContain(title)

  // Supervisors hold neither approve_actions nor view_usage.
  await expect(page.getByTestId('kpi-approvals')).toHaveCount(0)
  await expect(page.getByTestId('usage-summary')).toHaveCount(0)

  await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${created.alert.id}`, {
    method: 'PATCH',
    body: { location_id: created.locationId },
    prefer: 'return=minimal'
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await expect(page.getByTestId('alert-center-item').filter({ hasText: title })).toHaveCount(0)
  expect(await askTool(page, 'search_watch_alerts', severity)).not.toContain(title)

  // The organization-wide owner still sees it.
  const admin = await browser.newPage()

  await signIn(admin, 'admin@forge2.local')
  await admin.goto(baseURL + '/ai/command-center')
  await expect(admin.getByTestId('alert-center-item').filter({ hasText: title })).toHaveCount(1)
  await expect(admin.getByTestId('kpi-approvals')).toBeVisible()
  await expect(admin.getByTestId('usage-summary')).toBeVisible()

  // Acknowledging from the alert center goes through the normal Watch action.
  await admin.getByTestId('alert-center-item').filter({ hasText: title }).getByRole('button', { name: 'Acknowledge' }).click()
  await expect
    .poll(async () => (await rest(`/rest/v1/forge_ai_watch_alerts?id=eq.${created.alert.id}&select=status`))[0].status)
    .toBe('acknowledged')
  await admin.close()
})

test('turning the Command Center feature off for a tenant closes its pages, tools and scoring', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')
  await page.goto(baseURL + '/ai')
  await expect(page.getByRole('link', { name: 'Command Center' })).toBeVisible()

  await setCommandCenter(false)

  try {
    for (const pathname of ['/ai/command-center', '/ai/risk', '/ai/recommendations']) {
      await page.goto(baseURL + pathname)
      // The permission check sends a closed page to the dashboard, the page check to /ai.
      await page.waitForURL(url => ['/ai', '/dashboard'].includes(url.pathname), { timeout: 30000 })
    }

    await page.goto(baseURL + '/ai')

    await expect(page.getByRole('link', { name: 'Command Center' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Risk Indicators' })).toHaveCount(0)

    // The assistant itself keeps working; only the Command Center tools are refused.
    const reply = await askTool(page, 'get_recommendations', { status: 'open', priority: null, limit: 5 })

    expect(reply).toMatch(/get_recommendations: (refused|\{"error")/)

    const cron = await fetch(baseURL + '/api/forge-ai/watch/cron', { method: 'POST', headers: { authorization: 'Bearer ' + CRON_SECRET } })
    const cypress = (await cron.json()).results.find(result => result.organizationId === CYPRESS)

    expect(cypress).toMatchObject({ success: true, commandCenter: false, recommendations: 0 })
  } finally {
    await setCommandCenter(true)
  }

  await page.goto(baseURL + '/ai/command-center')
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
})

test('the header assistant opens anywhere and carries the record being viewed', async ({ page }) => {
  await signIn(page, 'admin@forge2.local')
  await page.goto(baseURL + '/dashboard')

  const opener = page.getByRole('button', { name: 'Open Forge AI' })

  await expect(opener).toBeVisible()
  await opener.click()
  await expect(page.getByTestId('global-assistant')).toBeVisible()
  await expect(page.getByTestId('global-assistant')).toContainText('Open Command Center')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('global-assistant')).toHaveCount(0)

  // Ctrl+J toggles it.
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('global-assistant')).toBeVisible()
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('global-assistant')).toHaveCount(0)

  const [{ target_id: assetId }] = await rest(
    `/rest/v1/forge_ai_watch_alerts?organization_id=eq.${CYPRESS}&target_type=eq.asset&select=target_id&limit=1`
  )

  await page.goto(baseURL + '/assets/' + assetId)
  await page.getByRole('button', { name: 'Open Forge AI' }).click()

  const sheet = page.getByTestId('global-assistant')

  await expect(sheet).toContainText('Context: this asset')

  const request = page.waitForRequest(req => req.url().endsWith('/api/forge-ai/chat') && req.method() === 'POST')

  await sheet.getByLabel('Message Forge AI').fill('What is the status of this asset?')
  await sheet.getByRole('button', { name: 'Send' }).click()
  expect((await request).postDataJSON().context).toEqual({ type: 'asset', id: assetId })
  await expect(sheet.getByTestId('assistant-message').last()).toBeVisible({ timeout: 60000 })

  // The full workspace is the assistant, so the header button is not shown there.
  await page.goto(baseURL + '/ai')
  await expect(page.getByRole('button', { name: 'Open Forge AI' })).toHaveCount(0)
})

test('a viewer with company-wide AI access but location-limited module and review rights stays inside those limits', async ({ page, browser }) => {
  // A custom role: organization-wide risk and recommendation viewing, but incidents and
  // recommendation review only at the user's own facility.
  const [role] = await rest('/rest/v1/forge_tenant_roles', { method: 'POST', body: { organization_id: CYPRESS, name: 'AI Security Mixed ' + RUN } })

  created.roles.push(role.id)
  const grants = {
    'forge_ai.use': 'organization',
    'forge_ai.view_risk': 'organization',
    'forge_ai.view_recommendations': 'organization',
    'forge_ai.review_recommendations': 'location',
    'incidents.view': 'location'
  }
  const permissions = await rest(`/rest/v1/forge_permission_registry?permission_key=in.(${Object.keys(grants).join(',')})&select=id,permission_key`)

  await rest('/rest/v1/forge_tenant_role_permissions', {
    method: 'POST',
    body: permissions.map(item => ({ role_id: role.id, permission_id: item.id, allowed: true, scope: grants[item.permission_key] })),
    prefer: 'return=minimal'
  })

  const mixedEmail = `ai-sec-mixed-${RUN.toLowerCase()}@forge2.local`
  const mixedId = await createMember(mixedEmail, null)

  await rest('/rest/v1/forge_tenant_user_roles', {
    method: 'POST',
    body: { organization_id: CYPRESS, user_id: mixedId, role_id: role.id },
    prefer: 'return=minimal'
  })

  // Score the plant and build recommendations, then take one incident cited as Main Plant risk
  // evidence and one Main Plant recommendation, and move both to the other facility.
  const cycle = await fetch(baseURL + '/api/forge-ai/watch/cron', { method: 'POST', headers: { authorization: 'Bearer ' + CRON_SECRET } })

  expect(cycle.status).toBe(200)

  const [assessment] = await rest(
    `/rest/v1/forge_ai_risk_assessments?organization_id=eq.${CYPRESS}&scope_type=eq.location&scope_id=eq.${MAIN_PLANT}&select=id&order=computed_at.desc&limit=1`
  )
  const indicators = await rest(`/rest/v1/forge_ai_risk_indicators?assessment_id=eq.${assessment.id}&select=evidence`)
  const incident = indicators.flatMap(item => item.evidence || []).find(entry => entry.type === 'incident')

  expect(incident, 'Main Plant risk cites an incident').toBeTruthy()
  const [before] = await rest(`/rest/v1/forge_incidents?id=eq.${incident.id}&select=location_id`)

  created.restore.push(() =>
    rest(`/rest/v1/forge_incidents?id=eq.${incident.id}`, { method: 'PATCH', body: { location_id: before.location_id }, prefer: 'return=minimal' })
  )
  await rest(`/rest/v1/forge_incidents?id=eq.${incident.id}`, { method: 'PATCH', body: { location_id: created.locationId }, prefer: 'return=minimal' })

  const [rec] = await rest(
    `/rest/v1/forge_ai_recommendations?organization_id=eq.${CYPRESS}&source_type=eq.risk_assessment&scope_type=eq.location&scope_id=eq.${MAIN_PLANT}&status=eq.proposed&select=id,title,location_id&limit=1`
  )

  expect(rec, 'a proposed Main Plant risk recommendation exists').toBeTruthy()
  created.restore.push(() =>
    rest(`/rest/v1/forge_ai_recommendations?id=eq.${rec.id}`, { method: 'PATCH', body: { location_id: rec.location_id }, prefer: 'return=minimal' })
  )
  await rest(`/rest/v1/forge_ai_recommendations?id=eq.${rec.id}`, { method: 'PATCH', body: { location_id: created.locationId }, prefer: 'return=minimal' })

  const openPlant = async viewer => {
    await viewer.goto(baseURL + '/ai/risk')
    await expect(viewer.getByTestId('risk-assessment').first()).toBeVisible()
    const plant = viewer.getByTestId('risk-assessment').filter({ hasText: 'Cypress Bend Main Plant' }).first()

    // Clicking before hydration does nothing, so retry until the factors are shown.
    await expect(async () => {
      if (!(await plant.getByText(/^weight /).count())) await plant.getByRole('heading').first().click()
      await expect(plant.getByText(/^weight /).first()).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30000 })

    return plant.locator(`a[href="/incidents/${incident.id}"]`)
  }

  // Risk evidence: the incident now sits outside the mixed user's incident scope.
  await signIn(page, mixedEmail)
  await expect(await openPlant(page)).toHaveCount(0)
  await expect(page.getByText(/record\(s\) outside your access/).first()).toBeVisible()

  const admin = await browser.newPage()

  await signIn(admin, 'admin@forge2.local')
  await expect(await openPlant(admin)).not.toHaveCount(0)
  await admin.close()

  // Review: the recommendation is visible company-wide but its facility is outside review scope.
  await page.goto(baseURL + '/ai/recommendations')
  const card = page.getByTestId('recommendation').filter({ hasText: rec.title }).first()

  await expect(card).toBeVisible()
  await expect(async () => {
    if (!(await card.getByRole('button', { name: 'Dismiss' }).count())) await card.getByTestId('recommendation-title').click()
    await expect(card.getByRole('button', { name: 'Dismiss' })).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await card.getByRole('button', { name: 'Dismiss' }).click()
  await card.getByLabel('Why is no action needed?').fill('Out of scope attempt ' + RUN)
  await card.getByTestId('recommendation-form').getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('This recommendation is outside the locations you can review.')).toBeVisible({ timeout: 30000 })

  const [after] = await rest(`/rest/v1/forge_ai_recommendations?id=eq.${rec.id}&select=status`)

  expect(after.status).toBe('proposed')
})

test('a member without forge_ai.use gets no header assistant and no Command Center', async ({ page }) => {
  await signIn(page, MEMBER_EMAIL)
  await page.goto(baseURL + '/dashboard')
  await expect(page.locator('header')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Forge AI' })).toHaveCount(0)

  await page.goto(baseURL + '/ai/command-center')
  await page.waitForURL(url => url.pathname !== '/ai/command-center', { timeout: 30000 })
  await expect(page.getByTestId('command-center')).toHaveCount(0)
})
