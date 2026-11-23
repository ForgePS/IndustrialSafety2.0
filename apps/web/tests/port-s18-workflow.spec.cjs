/**
 * Port slice 18 (agent B) browser checks: the permit workflow on the record page with two people.
 *
 * Seeds by REST a confined space and a draft confined space entry permit (details filled in) created by admin, and
 * a hot work permit taken to issued through the workflow functions. user@forge2.local (view only at its location)
 * gets permits.request + permits.approve allow overrides for the run, removed afterwards.
 *
 * Confined space:
 * - admin adds the entry supervisor, attendant and entrant, answers the checklist and sends it for approval;
 *   admin is offered no Approve (self-approval) and the database refuses it too; the approver is told
 * - user sees it on the dashboard, approves (admin told), can't issue without a gas test, records a passing test,
 *   issues (admin told) and signs the entrant in
 * - a failing gas test suspends the permit (admin told: get everyone out); resume refuses until a new passing test
 * - close is not offered while someone is inside (and the database refuses); sign out, then close
 * Hot work: work complete starts the fire watch; close is not offered and is refused until it ends; afterwards
 * (backdated) the permit closes.
 *
 * Run (from apps/web): playwright test tests/port-s18-workflow.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { test, expect } = require('@playwright/test')

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:3001'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-7)
const TAG = `PW-S18B flow ${RUN}`

test.describe.configure({ mode: 'serial' })
test.setTimeout(300000)

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)

  return text ? JSON.parse(text) : null
}

const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args })

const rpcError = async (name, args) => {
  try {
    await rpc(name, args)
  } catch (failure) {
    return failure.message
  }

  return null
}

/** supabase_admin may switch the guards off (replica mode): backdating and clean-up only. */
const psql = sql => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })

const asReplica = sql => psql(`begin; set local session_replication_role = replica; ${sql} commit;`)

const at = minutes => new Date(Date.now() + minutes * 60_000).toISOString()

const step = (fn, permit, actor, extra = {}) => rpc('forge_permit_' + fn, { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: actor, ...extra })

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const state = { overrides: [] }

const permitRow = async id => (await rest(`forge_permits?id=eq.${id}&select=status,work_completed_at,suspend_reason`))[0]
const statusIs = (id, status) => async () => (await permitRow(id)).status === status
const notices = async (permitId, eventType, userId) =>
  rest(`forge_notification_events?source_module=eq.permits&resource_id=eq.${permitId}&event_type=eq.${eventType}&payload->>recipient_user_id=eq.${userId}&select=id,title,body`)

const permitUrl = (slug, id) => `${baseURL}/permits/${slug}/${id}`

/** Opens a workflow step's dialog (retrying until hydrated), fills the reason if given, confirms. */
const runStep = async (page, key, reason) => {
  const dialog = page.locator(`[data-permit-dialog="${key}"]`)

  await expect(async () => {
    if (!(await dialog.isVisible())) await page.locator(`[data-permit-action="${key}"]`).click()
    await expect(dialog).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 60000 })
  if (reason !== undefined) await dialog.locator('textarea[name="reason"]').fill(reason)
  await dialog.locator('[data-permit-confirm]').click()
}

/** Clicks until the database shows the effect (a click before hydration does nothing). */
const actUntil = async (click, done) => {
  await expect(async () => {
    if (await done()) return
    await click()
    await expect.poll(done, { timeout: 5000 }).toBe(true)
  }).toPass({ timeout: 60000 })
}

const fillGas = async (page, readings) => {
  const form = page.locator('[data-gas-form]')

  for (const [name, value] of Object.entries(readings)) await form.locator(`input[name="${name}"]`).fill(String(value))
}

const gasCount = async permitId => (await rest(`forge_permit_gas_tests?permit_id=eq.${permitId}&select=id`)).length

test.beforeAll(async () => {
  const people = await rest(`forge_personnel?organization_id=eq.${ORG}&location_id=eq.${LOCATION}&archived_at=is.null&employment_status=eq.active&select=id,first_name,last_name&order=id&limit=3`)

  expect(people.length).toBe(3)
  state.people = people.map(row => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim() }))

  const permissions = await rest('forge_permission_registry?permission_key=in.(permits.request,permits.approve)&select=id,permission_key')

  for (const permission of permissions) {
    const existing = await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${permission.id}&select=user_id`)

    if (existing.length) continue
    await rest('forge_user_permission_overrides', { method: 'POST', body: { organization_id: ORG, user_id: USER, permission_id: permission.id, override_state: 'allow', scope: 'organization' } })
    state.overrides.push(permission.id)
  }

  const [space] = await rest('forge_confined_spaces', { method: 'POST', body: { organization_id: ORG, location_id: LOCATION, name: `${TAG} Tank`, hazards: ['toxic', 'engulfment'] } })

  state.space = space

  const cseNumber = await rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'confined_space' })

  ;[state.cse] = await rest('forge_permits', {
    method: 'POST',
    body: {
      organization_id: ORG,
      permit_number: cseNumber,
      permit_type: 'confined_space',
      location_id: LOCATION,
      space_id: space.id,
      title: `${TAG} tank entry`,
      work_description: 'Clean the tank floor',
      valid_from: at(-5),
      valid_until: at(360),
      details: { rescue_service: 'Plant rescue team', communication: 'Radio', entry_type: 'vertical' },
      created_by: ADMIN
    }
  })

  // Hot work, taken to issued through the workflow functions.
  const hwNumber = await rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'hot_work' })

  ;[state.hw] = await rest('forge_permits', {
    method: 'POST',
    body: {
      organization_id: ORG,
      permit_number: hwNumber,
      permit_type: 'hot_work',
      location_id: LOCATION,
      title: `${TAG} weld bracket`,
      work_description: 'Weld a bracket to the frame',
      valid_from: at(-5),
      valid_until: at(360),
      details: { work_type: 'welding', gas_test_required: false },
      created_by: ADMIN
    }
  })
  await rest('forge_permit_people', {
    method: 'POST',
    body: [
      { organization_id: ORG, permit_id: state.hw.id, role: 'hot_work_operator', personnel_id: state.people[0].id, added_by: ADMIN },
      { organization_id: ORG, permit_id: state.hw.id, role: 'fire_watch', personnel_id: state.people[1].id, added_by: ADMIN }
    ]
  })
  const defs = await rest('forge_permit_check_definitions?permit_type=eq.hot_work&organization_id=is.null&archived_at=is.null&select=check_key')

  await rest('forge_permit_checks', { method: 'POST', body: defs.map(def => ({ organization_id: ORG, permit_id: state.hw.id, check_key: def.check_key, answer: 'yes', note: null, answered_by: ADMIN })) })
  await step('submit', state.hw, ADMIN)
  await step('approve', state.hw, USER, { p_note: null })
  await step('issue', state.hw, USER)
})

test.afterAll(async () => {
  for (const permissionId of state.overrides) {
    await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${permissionId}`, { method: 'DELETE' }).catch(() => {})
  }

  const ids = [state.cse?.id, state.hw?.id].filter(Boolean)

  if (ids.length) await rest(`forge_notification_events?source_module=eq.permits&resource_id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})

  asReplica(`
    create temp table s18b_ids on commit drop as select id from public.forge_permits where organization_id = '${ORG}' and title like '${TAG}%';
    delete from public.forge_permit_entries where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_gas_tests where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_checks where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_people where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_links where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_notice_log where permit_id in (select id from s18b_ids);
    delete from public.forge_permit_activity where permit_id in (select id from s18b_ids);
    delete from public.forge_permits where id in (select id from s18b_ids);
    delete from public.forge_confined_spaces where organization_id = '${ORG}' and name like '${TAG}%';
  `)
})

test('requester names the people, answers the checklist and sends the permit for approval', async ({ page }) => {
  const permit = state.cse

  await login(page, 'admin@forge2.local')
  await page.goto(permitUrl('confined-space', permit.id))
  await expect(page.locator(`[data-permit-page="${permit.permit_number}"]`)).toBeVisible()
  await expect(page.locator('[data-permit-status="draft"]')).toBeVisible()

  // Submitting too early: the database says what is missing.
  await runStep(page, 'submit')
  await expect(page.getByText('Add an entry supervisor.').first()).toBeVisible()
  await page.keyboard.press('Escape')

  const roles = [
    ['entry_supervisor', state.people[0]],
    ['attendant', state.people[1]],
    ['entrant', state.people[2]]
  ]

  for (const [role, person] of roles) {
    const added = async () => (await rest(`forge_permit_people?permit_id=eq.${permit.id}&role=eq.${role}&removed_at=is.null&select=id`)).length === 1

    await actUntil(async () => {
      const form = page.locator('[data-add-person]')

      await form.locator('select[name="role"]').selectOption(role)
      await form.locator('select[name="source"]').selectOption('personnel')
      await form.locator('select[name="person"]').selectOption(person.id)
      await form.locator('[data-add-person-button]').click()
    }, added)
  }

  await expect(page.locator('[data-role="entrant"]').getByText(state.people[2].name)).toBeVisible()
  state.entrantRow = (await rest(`forge_permit_people?permit_id=eq.${permit.id}&role=eq.entrant&select=id`))[0].id

  // Every checklist item answered yes.
  const items = await page.locator('[data-check]').count()

  expect(items).toBeGreaterThan(5)
  const answered = async () => (await rest(`forge_permit_checks?permit_id=eq.${permit.id}&select=check_key`)).length === items

  await actUntil(async () => {
    for (const radio of await page.locator('[data-permit-checklist] input[type="radio"][value="yes"]').all()) await radio.check()
    await page.locator('[data-save-checklist]').click()
  }, answered)

  await runStep(page, 'submit')
  await expect.poll(statusIs(permit.id, 'requested'), { timeout: 30000 }).toBe(true)
  await page.reload()
  await expect(page.locator('[data-permit-status="requested"]')).toBeVisible()

  // Self-approval: no Approve for the requester, and the database refuses it.
  await expect(page.locator('[data-permit-action="reject"]')).toBeVisible()
  await expect(page.locator('[data-permit-action="approve"]')).toHaveCount(0)
  expect(await rpcError('forge_permit_approve', { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: ADMIN, p_note: null })).toMatch(/someone else must approve/)

  // The approver in scope (user) is told; the requester is not.
  await expect.poll(async () => (await notices(permit.id, 'permit_submitted', USER)).length, { timeout: 15000 }).toBe(1)
  expect((await notices(permit.id, 'permit_submitted', ADMIN)).length).toBe(0)
})

test('approver approves, needs a gas test to issue, issues and signs the entrant in', async ({ page }) => {
  const permit = state.cse

  await login(page, 'user@forge2.local')
  await page.goto(baseURL + '/dashboard')
  await expect(page.getByText('Permits waiting for your approval').first()).toBeVisible({ timeout: 60000 })

  await page.goto(permitUrl('confined-space', permit.id))
  await runStep(page, 'approve', 'Looks right')
  await expect.poll(statusIs(permit.id, 'approved'), { timeout: 30000 }).toBe(true)
  await expect.poll(async () => (await notices(permit.id, 'permit_approved', ADMIN)).length, { timeout: 15000 }).toBe(1)

  await page.reload()
  await runStep(page, 'issue')
  await expect(page.getByText('Record a gas test first.').first()).toBeVisible()
  expect((await permitRow(permit.id)).status).toBe('approved')
  await page.keyboard.press('Escape')

  await fillGas(page, { o2: 20.9, lel: 0, h2s: 0, co: 0 })
  await expect(page.locator('[data-gas-preview="pass"]')).toBeVisible()
  await actUntil(
    () => page.locator('[data-record-gas-test]').click(),
    async () => (await gasCount(permit.id)) === 1
  )

  await page.reload()
  await expect(page.locator('[data-gas-test="passed"]')).toHaveCount(1)
  await runStep(page, 'issue')
  await expect.poll(statusIs(permit.id, 'active'), { timeout: 30000 }).toBe(true)
  await expect.poll(async () => (await notices(permit.id, 'permit_issued', ADMIN)).length, { timeout: 15000 }).toBe(1)

  await page.reload()
  const inside = async () => (await rest(`forge_permit_entries?permit_id=eq.${permit.id}&exited_at=is.null&select=id`)).length === 1

  await actUntil(() => page.locator(`[data-person-row="${state.entrantRow}"] [data-sign-in]`).click(), inside)
  await page.reload()
  await expect(page.locator(`[data-person-row="${state.entrantRow}"] [data-inside]`)).toBeVisible()
  await expect(page.locator('[data-entry-log]')).toContainText('Still inside')
})

test('a failing gas test suspends the permit; resume needs a new passing test', async ({ page }) => {
  const permit = state.cse

  await login(page, 'user@forge2.local')
  await page.goto(permitUrl('confined-space', permit.id))

  await fillGas(page, { o2: 18.2, lel: 3 })
  await expect(page.locator('[data-gas-preview="fail"]')).toContainText('Oxygen 18.2% is below 19.5%')
  await actUntil(
    () => page.locator('[data-record-gas-test]').click(),
    async () => (await gasCount(permit.id)) === 2
  )
  await expect.poll(statusIs(permit.id, 'suspended'), { timeout: 30000 }).toBe(true)
  expect((await permitRow(permit.id)).suspend_reason).toMatch(/Gas test failed/)

  await expect.poll(async () => (await notices(permit.id, 'permit_gas_failed', ADMIN)).length, { timeout: 15000 }).toBe(1)
  const told = await notices(permit.id, 'permit_gas_failed', ADMIN)

  expect(told[0].body).toMatch(/Get everyone out of the space/)

  await page.reload()
  await expect(page.locator('[data-permit-suspended]')).toBeVisible()

  // Resume is refused while the last test failed.
  await runStep(page, 'resume')
  await expect(page.getByText('The last gas test failed. Ventilate and test again.').first()).toBeVisible()
  expect((await permitRow(permit.id)).status).toBe('suspended')
  await page.keyboard.press('Escape')

  await fillGas(page, { o2: 20.8, lel: 0 })
  await actUntil(
    () => page.locator('[data-record-gas-test]').click(),
    async () => (await gasCount(permit.id)) === 3
  )
  await page.reload()
  await runStep(page, 'resume')
  await expect.poll(statusIs(permit.id, 'active'), { timeout: 30000 }).toBe(true)
})

test('close is refused while someone is inside; sign out, then close', async ({ page }) => {
  const permit = state.cse

  await login(page, 'user@forge2.local')
  await page.goto(permitUrl('confined-space', permit.id))

  await expect(page.locator('[data-permit-action="close"]')).toHaveCount(0)
  await expect(page.locator('[data-permit-action="close-blocked"]')).toBeDisabled()
  await expect(page.locator('[data-close-blockers]')).toContainText('1 person is still inside the space.')
  expect(await rpcError('forge_permit_close', { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: USER, p_note: null })).toMatch(/still inside the space/)

  const out = async () => (await rest(`forge_permit_entries?permit_id=eq.${permit.id}&exited_at=is.null&select=id`)).length === 0

  await actUntil(() => page.locator(`[data-person-row="${state.entrantRow}"] [data-sign-out]`).click(), out)
  await page.reload()
  await runStep(page, 'close', 'Tank cleaned, all out')
  await expect.poll(statusIs(permit.id, 'closed'), { timeout: 30000 }).toBe(true)
  await page.reload()
  await expect(page.locator('[data-permit-status="closed"]')).toBeVisible()
  await expect(page.locator('[data-entry-log]')).not.toContainText('Still inside')
})

test('hot work: close waits for the fire watch', async ({ page }) => {
  const permit = state.hw

  await login(page, 'admin@forge2.local')
  await page.goto(permitUrl('hot-work', permit.id))
  await expect(page.locator('[data-permit-status="active"]')).toBeVisible()

  await runStep(page, 'completeWork')
  await expect.poll(async () => Boolean((await permitRow(permit.id)).work_completed_at), { timeout: 30000 }).toBe(true)
  await page.reload()
  await expect(page.locator('[data-fire-watch]')).toContainText('Fire watch in progress until')
  await expect(page.locator('[data-permit-action="close"]')).toHaveCount(0)
  await expect(page.locator('[data-close-blockers]')).toContainText('The fire watch runs until')
  expect(await rpcError('forge_permit_close', { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: ADMIN, p_note: null })).toMatch(/fire watch runs until/)

  // The fire watch ends (backdated) and the permit closes.
  asReplica(`update public.forge_permits set work_completed_at = now() - interval '61 minutes' where id = '${permit.id}';`)
  await page.reload()
  await expect(page.locator('[data-fire-watch]')).toContainText('Fire watch finished')
  await runStep(page, 'close')
  await expect.poll(statusIs(permit.id, 'closed'), { timeout: 30000 }).toBe(true)
})
