/**
 * Port slice 19 (agent B) browser checks: forklift operator authorization. Authorize with validation (future dates,
 * evaluation before training, no classes, self-evaluation; the database refuses the same), the computed expiry,
 * standing badges and filters (authorized, due soon, expired), suspend / reinstate / require refresher / revoke with
 * reasons, a new evaluation clearing the refresher, an incident link that also requires refresher training, the
 * wallet card, a view-only user seeing no actions, and the card on the personnel page.
 *
 * Creates its own personnel (last name "PW-S19B <run>") and an incident, all tagged "PW-S19B" and removed after
 * (as supabase_admin in replica mode, children first).
 *
 * Run (from apps/web): playwright test tests/port-s19-operators.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { test, expect: baseExpect } = require('@playwright/test')

// The dev server can be slow while it compiles; give each assertion room.
const expect = baseExpect.configure({ timeout: 20000 })

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const TAG = 'PW-S19B'
const RUN = Date.now().toString().slice(-6)
const LAST = `${TAG} ${RUN}`
const fixture = {}

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) return { error: text, status: response.status }

  return text ? JSON.parse(text) : null
}

const psql = sql => execSync(`docker exec -i ${DB_CONTAINER} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -t -A`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString()

const asReplica = sql => psql(`begin; set local session_replication_role = replica; ${sql} commit;`)

/** Same arithmetic as forgeForkliftRules.addMonths / the database. */
const addMonths = (iso, months) => {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(d, last))

  return target.toISOString().slice(0, 10)
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const shift = days => new Date(Date.parse(today + 'T12:00:00Z') + days * 86400_000).toISOString().slice(0, 10)

async function login(page, email) {
  await page.context().clearCookies()
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 60000 })
}

const open = async (page, url) => {
  const response = await page.goto(baseURL + url)

  await page.waitForLoadState('networkidle')

  return response
}

const operatorRow = async () => (await rest(`forge_forklift_operators?personnel_id=eq.${fixture.operatorPerson}&select=*`))[0]

test.beforeAll(async () => {
  const people = await rest('forge_personnel', {
    method: 'POST',
    body: [
      { organization_id: ORG, first_name: 'Ava', last_name: LAST, employee_number: `S19B-${RUN}-1`, employment_status: 'active', location_id: LOCATION },
      { organization_id: ORG, first_name: 'Evan', last_name: LAST, employee_number: `S19B-${RUN}-2`, employment_status: 'active', location_id: LOCATION }
    ]
  })

  if (people.error) throw new Error(people.error)
  fixture.operatorPerson = people.find(row => row.first_name === 'Ava').id
  fixture.evaluatorPerson = people.find(row => row.first_name === 'Evan').id
  fixture.operatorName = `Ava ${LAST}`
  fixture.evaluatorName = `Evan ${LAST}`
  fixture.incidentId = psql(`begin; set local session_replication_role = replica;
    insert into public.forge_incidents (organization_id, incident_number, status, incident_type, occurred_at, location_id, summary, created_by)
    values ('${ORG}', 'S19B-${RUN}', 'submitted', 'other', now() - interval '1 day', '${LOCATION}', '${TAG} forklift struck racking ${RUN}', '${ADMIN}') returning id;
    commit;`).trim().split(/\s+/)[0]
})

test.afterAll(async () => {
  const ops = `(select id from public.forge_forklift_operators where personnel_id in (select id from public.forge_personnel where organization_id = '${ORG}' and last_name = '${LAST}'))`

  asReplica(`
    create temp table s19b_ops on commit drop as select id from ${ops} o;
    delete from public.forge_notification_deliveries where event_id in (select id from public.forge_notification_events where source_module = 'forklifts' and resource_id in (select id from s19b_ops));
    delete from public.forge_notification_events where source_module = 'forklifts' and resource_id in (select id from s19b_ops);
    delete from public.forge_forklift_incident_links where operator_id in (select id from s19b_ops) or incident_id in (select id from public.forge_incidents where organization_id = '${ORG}' and summary like '${TAG}%');
    delete from public.forge_forklift_notice_log where operator_id in (select id from s19b_ops);
    delete from public.forge_forklift_activity where operator_id in (select id from s19b_ops);
    delete from public.forge_forklift_operators where id in (select id from s19b_ops);
    delete from public.forge_incidents where organization_id = '${ORG}' and summary like '${TAG}%';
    delete from public.forge_personnel_employment_events where personnel_id in (select id from public.forge_personnel where organization_id = '${ORG}' and last_name = '${LAST}');
    delete from public.forge_personnel where organization_id = '${ORG}' and last_name = '${LAST}';
  `)
})

const problems = page => page.locator('[data-authorize-problems]')

test('authorize an operator: validation, the computed expiry, then saved', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/forklifts/operators/new')
  const form = page.locator('[data-authorize-form]')

  await form.locator('select[name="personnelId"]').selectOption(fixture.operatorPerson)
  await form.locator('input[name="trainingCompletedOn"]').fill(shift(1))
  await form.locator('input[name="evaluatedOn"]').fill(shift(1))
  await form.locator('select[name="evaluatorPersonnelId"]').selectOption(fixture.operatorPerson)
  await form.locator('[data-authorize-submit]').click()
  await expect(problems(page)).toContainText('Choose the truck classes this operator is authorized for.')
  await expect(problems(page)).toContainText("Training and evaluation dates can't be in the future.")
  await expect(problems(page)).toContainText("Operators can't evaluate themselves.")

  await form.locator('input[name="trainingCompletedOn"]').fill(shift(-10))
  await form.locator('input[name="evaluatedOn"]').fill(shift(-20))
  await expect(problems(page)).toContainText("The evaluation can't be before the training.")

  // The database refuses the same, whatever the page does.
  const refused = await rest('rpc/forge_forklift_authorize', {
    method: 'POST',
    body: {
      p_organization_id: ORG,
      p_actor_user_id: ADMIN,
      p_personnel_id: fixture.operatorPerson,
      p_truck_classes: ['I'],
      p_training_completed_on: shift(-10),
      p_evaluated_on: shift(-20),
      p_evaluator_name: 'Someone',
      p_evaluator_personnel_id: null,
      p_evaluation_notes: null,
      p_restrictions: null
    }
  })

  expect(refused.error).toContain("The evaluation can't be before the training.")
  const future = await rest('rpc/forge_forklift_authorize', {
    method: 'POST',
    body: {
      p_organization_id: ORG,
      p_actor_user_id: ADMIN,
      p_personnel_id: fixture.operatorPerson,
      p_truck_classes: ['I'],
      p_training_completed_on: shift(-1),
      p_evaluated_on: shift(2),
      p_evaluator_name: 'Someone',
      p_evaluator_personnel_id: null,
      p_evaluation_notes: null,
      p_restrictions: null
    }
  })

  expect(future.error).toContain("can't be in the future")

  await form.locator('input[name="trainingCompletedOn"]').fill(shift(-30))
  await form.locator('input[name="evaluatedOn"]').fill(shift(-20))
  await form.locator('select[name="evaluatorPersonnelId"]').selectOption(fixture.evaluatorPerson)
  await form.locator('input[name="truckClasses"][value="I"]').check()
  await form.locator('input[name="truckClasses"][value="III"]').check()
  await form.locator('textarea[name="restrictions"]').fill('No attachments')
  await expect(problems(page)).toHaveCount(0)
  const expires = addMonths(shift(-20), 36)

  await expect(page.locator('[data-computed-expiry]')).toHaveAttribute('data-computed-expiry', expires)
  await form.locator('[data-authorize-submit]').click()
  await page.waitForURL(/\/forklifts\/operators\/[0-9a-f-]{36}$/)
  fixture.operatorId = page.url().split('/').pop()

  const pageRoot = page.locator('[data-operator-page]')

  await expect(pageRoot.locator('[data-operator-standing]').first()).toHaveAttribute('data-operator-standing', 'authorized')
  await expect(page.locator('[data-operator-expires]')).toHaveAttribute('data-operator-expires', expires)
  await expect(page.locator('[data-operator-classes]')).toContainText('Class I')
  await expect(page.locator('[data-operator-classes]')).toContainText('Class III')
  await expect(page.locator('[data-operator-history]')).toContainText('Authorized until')

  const row = await operatorRow()

  expect(row.truck_classes).toEqual(['I', 'III'])
  expect(row.evaluator_personnel_id).toBe(fixture.evaluatorPerson)
  expect(row.evaluator_name).toBe(fixture.evaluatorName)
  expect(row.expires_on).toBe(expires)

  // Picking them again links to their page instead.
  await open(page, `/forklifts/operators/new?person=${fixture.operatorPerson}`)
  await expect(page.locator('[data-already-operator] a')).toHaveAttribute('href', `/forklifts/operators/${fixture.operatorId}`)
})

test('standing badges and filters: authorized, due soon, expired', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  const listRow = () => page.locator(`[data-operator-row="${fixture.operatorName}"]`)

  await open(page, `/forklifts/operators?q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow().locator('[data-operator-standing]')).toHaveAttribute('data-operator-standing', 'authorized')
  await expect(listRow()).toContainText(`S19B-${RUN}-1`)
  await expect(listRow()).toContainText('I, III')

  const original = (await operatorRow()).expires_on

  asReplica(`update public.forge_forklift_operators set expires_on = '${shift(10)}' where id = '${fixture.operatorId}';`)
  await open(page, `/forklifts/operators?standing=expiring&q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow().locator('[data-operator-standing]')).toHaveAttribute('data-operator-standing', 'expiring')
  await open(page, `/forklifts/operators?standing=expired&q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow()).toHaveCount(0)

  asReplica(`update public.forge_forklift_operators set expires_on = '${shift(-1)}' where id = '${fixture.operatorId}';`)
  await open(page, `/forklifts/operators?standing=expired&q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow().locator('[data-operator-standing]')).toHaveAttribute('data-operator-standing', 'expired')
  await open(page, `/forklifts/operators/${fixture.operatorId}`)
  await expect(page.locator('[data-operator-expired]')).toBeVisible()

  // Class filter.
  asReplica(`update public.forge_forklift_operators set expires_on = '${original}' where id = '${fixture.operatorId}';`)
  await open(page, `/forklifts/operators?class=III&q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow()).toHaveCount(1)
  await open(page, `/forklifts/operators?class=VII&q=${encodeURIComponent(fixture.operatorName)}`)
  await expect(listRow()).toHaveCount(0)
})

const action = async (page, name, fill) => {
  await page.locator(`[data-operator-action="${name}"]`).click()
  const dialog = page.locator(`[data-operator-dialog="${name}"]`)

  await expect(dialog).toBeVisible()
  if (fill) await fill(dialog)
  await dialog.locator('[data-operator-confirm]').click()
  await expect(dialog).toBeHidden()
  await page.waitForLoadState('networkidle')
}

const standing = page => page.locator('[data-operator-page] [data-operator-standing]').first()

test('suspend, reinstate, require refresher and a new evaluation that clears it', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forklifts/operators/${fixture.operatorId}`)

  // A reason is needed.
  await page.locator('[data-operator-action="suspend"]').click()
  await page.locator('[data-operator-dialog="suspend"] [data-operator-confirm]').click()
  await expect(page.getByText('Fill in: Why is it suspended?').first()).toBeVisible()
  await page.locator('[data-operator-dialog="suspend"] textarea[name="reason"]').fill(`${TAG} seen speeding in aisle 4`)
  await page.locator('[data-operator-dialog="suspend"] [data-operator-confirm]').click()
  await expect(page.locator('[data-operator-suspended]')).toContainText('seen speeding in aisle 4')
  await expect(standing(page)).toHaveAttribute('data-operator-standing', 'suspended')
  expect((await operatorRow()).status).toBe('suspended')

  await action(page, 'reinstate')
  await expect(standing(page)).toHaveAttribute('data-operator-standing', 'authorized')
  await expect(page.locator('[data-operator-suspended]')).toHaveCount(0)

  await action(page, 'require_refresher', async dialog => {
    await dialog.locator('select[name="reasonKey"]').selectOption('near_miss')
    await dialog.locator('textarea[name="reason"]').fill('Pedestrian near miss at dock 2')
  })
  await expect(page.locator('[data-operator-refresher]')).toContainText('Involved in a near-miss incident: Pedestrian near miss at dock 2')
  await expect(standing(page)).toHaveAttribute('data-operator-standing', 'refresher')
  await expect(page.locator('[data-operator-action="require_refresher"]')).toHaveCount(0)

  // A new evaluation clears it and restarts the clock.
  await page.locator('[data-new-evaluation]').click()
  await page.waitForURL(/\/evaluate$/)
  const form = page.locator('[data-authorize-form]')

  await expect(form.locator('input[name="truckClasses"][value="III"]')).toBeChecked()
  await expect(form.locator('textarea[name="restrictions"]')).toHaveValue('No attachments')
  await form.locator('input[name="trainingCompletedOn"]').fill(shift(-2))
  await form.locator('input[name="evaluatedOn"]').fill(shift(-1))
  await form.locator('input[name="evaluatorName"]').fill('Outside trainer, Gulf Lift Co.')
  await form.locator('[data-authorize-submit]').click()
  await page.waitForURL(new RegExp(`/forklifts/operators/${fixture.operatorId}$`))
  await expect(standing(page)).toHaveAttribute('data-operator-standing', 'authorized')
  await expect(page.locator('[data-operator-refresher]')).toHaveCount(0)
  await expect(page.locator('[data-operator-expires]')).toHaveAttribute('data-operator-expires', addMonths(shift(-1), 36))
  await expect(page.locator('[data-operator-history]')).toContainText('(evaluated by Outside trainer, Gulf Lift Co.)')

  const row = await operatorRow()

  expect(row.refresher_required).toBe(false)
  expect(row.evaluator_name).toBe('Outside trainer, Gulf Lift Co.')
  expect(row.evaluator_personnel_id).toBe(null)
})

test('an incident link that also requires refresher training, and removing the link', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forklifts/operators/${fixture.operatorId}`)
  const panel = page.locator('[data-incident-link-form]')

  await panel.locator('select[name="incidentId"]').selectOption(fixture.incidentId)
  await panel.locator('input[name="note"]').fill('Mast hit the rack upright')
  await panel.locator('input[name="requireRefresher"]').check()
  await panel.locator('select[name="refresherReason"]').selectOption('accident')
  await panel.getByRole('button', { name: 'Link incident' }).click()
  await expect(page.locator(`[data-incident-link="S19B-${RUN}"]`)).toContainText('Mast hit the rack upright')
  await expect(page.locator('[data-operator-refresher]')).toContainText(`Involved in an accident (incident S19B-${RUN})`)
  await expect(page.locator('[data-operator-refresher] a')).toHaveText(`S19B-${RUN}`)

  const row = await operatorRow()

  expect(row.refresher_required).toBe(true)
  expect(row.refresher_incident_id).toBe(fixture.incidentId)
  await expect(page.locator('[data-operator-history]')).toContainText(`Linked incident S19B-${RUN}`)

  await page.locator(`[data-incident-link="S19B-${RUN}"] [data-remove-incident-link]`).click()
  await expect(page.locator(`[data-incident-link="S19B-${RUN}"]`)).toHaveCount(0)
  expect((await rest(`forge_forklift_incident_links?operator_id=eq.${fixture.operatorId}&select=id`)).length).toBe(0)
})

test('the wallet card', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  // Clear the refresher from the last test with a new evaluation (straight through the workflow).
  const result = await rest('rpc/forge_forklift_authorize', {
    method: 'POST',
    body: {
      p_organization_id: ORG,
      p_actor_user_id: ADMIN,
      p_personnel_id: fixture.operatorPerson,
      p_truck_classes: ['I', 'III'],
      p_training_completed_on: shift(-2),
      p_evaluated_on: shift(-1),
      p_evaluator_name: fixture.evaluatorName,
      p_evaluator_personnel_id: fixture.evaluatorPerson,
      p_evaluation_notes: null,
      p_restrictions: 'No attachments'
    }
  })

  expect(result.error).toBeUndefined()
  await open(page, `/forklifts/operators/${fixture.operatorId}/card`)
  const card = page.locator('[data-wallet-print]')

  await expect(card.locator('[data-card-name]')).toHaveText(fixture.operatorName)
  await expect(card.locator('[data-card-employee]')).toContainText(`S19B-${RUN}-1`)
  await expect(card.locator('[data-card-classes]')).toHaveText('I, III')
  await expect(card.locator('[data-card-evaluator]')).toHaveText(fixture.evaluatorName)
  await expect(card.locator('[data-card-restrictions]')).toHaveText('No attachments')
  await expect(card).toContainText('Cypress Bend')
  await expect(page.locator('[data-card-invalid]')).toHaveCount(0)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('[data-print-hide]')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
})

test('a view-only user sees the operator but no actions', async ({ page }) => {
  await login(page, 'user@forge2.local')
  await open(page, `/forklifts/operators/${fixture.operatorId}`)
  await expect(page.locator('[data-operator-page]')).toBeVisible()
  await expect(page.locator('[data-operator-actions]')).toHaveCount(0)
  await expect(page.locator('[data-new-evaluation]')).toHaveCount(0)
  await expect(page.locator('[data-incident-link-form]')).toHaveCount(0)
  await open(page, '/forklifts/operators')
  await expect(page.locator('[data-authorize-operator]')).toHaveCount(0)
  await open(page, '/forklifts/operators/new')
  expect(new URL(page.url()).pathname).toBe('/dashboard')
})

test('the personnel page shows the forklift authorization', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/personnel/${fixture.operatorPerson}`)
  const card = page.getByTestId('personnel-forklift-card')

  await expect(card).toBeVisible()
  await expect(card.locator('[data-operator-standing]')).toHaveAttribute('data-operator-standing', 'authorized')
  await expect(card).toContainText('I, III')
  await expect(card.locator('[data-personnel-forklift-link]')).toHaveAttribute('href', `/forklifts/operators/${fixture.operatorId}`)

  // Someone with no operator row has no card.
  await open(page, `/personnel/${fixture.evaluatorPerson}`)
  await expect(page.getByTestId('personnel-forklift-card')).toHaveCount(0)
})

test('revoke with a reason ends the actions', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, `/forklifts/operators/${fixture.operatorId}`)
  await action(page, 'revoke', dialog => dialog.locator('textarea[name="reason"]').fill(`${TAG} repeated unsafe operation`))
  await expect(page.locator('[data-operator-revoked]')).toContainText('repeated unsafe operation')
  await expect(standing(page)).toHaveAttribute('data-operator-standing', 'revoked')
  await expect(page.locator('[data-operator-actions]')).toHaveCount(0)
  await expect(page.locator('[data-new-evaluation]')).toBeVisible()
  await open(page, `/forklifts/operators/${fixture.operatorId}/card`)
  await expect(page.locator('[data-card-invalid]')).toBeVisible()
  await expect(page.locator('[data-wallet-front]')).toContainText('NOT VALID: REVOKED')
})
