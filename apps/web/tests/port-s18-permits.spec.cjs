/**
 * Port slice 18 (agent A) browser checks: the confined space register, company permit settings, draft permits
 * (confined space and hot work: create, warning for missing details, edit, link a lockout procedure, delete),
 * the per-type list and its filters, the board (active / suspended / past end time / people inside) and the
 * print page. Board fixtures that need a live permit are written straight to the database in replica mode (the
 * workflow itself is covered by port-s18-workflow.spec.cjs). Everything is tagged "PW-S18A" and removed after.
 *
 * Run (from apps/web): playwright test tests/port-s18-permits.spec.cjs --reporter=line --workers=1
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { test, expect } = require('@playwright/test')

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const TAG = 'PW-S18A'
const RUN = Date.now().toString().slice(-6)
const SPACE = `${TAG} Tank ${RUN}`
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

  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)

  return text ? JSON.parse(text) : null
}

const psql = sql => execSync(`docker exec -i ${DB_CONTAINER} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -t -A`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString()

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

const permitRow = async id => (await rest(`forge_permits?id=eq.${id}&select=*`))[0]

/** A permit written straight to the database (replica mode skips the draft-only insert guard). */
const insertLivePermit = ({ id, type, prefix, status, title, untilMinutes, spaceId = null, extra = '' }) => {
  const number = `${prefix}-2026-9${RUN.slice(-4)}${(fixture.seq = (fixture.seq || 0) + 1)}`
  const issued = status === 'active' || status === 'suspended'

  psql(`begin; set local session_replication_role = replica;
    insert into public.forge_permits (id, organization_id, permit_number, permit_type, location_id, space_id, title, work_description, valid_from, valid_until, details, status,
      requested_by, requested_at, approved_by, approved_at, issued_by, issued_at, suspended_by, suspended_at, suspend_reason, created_by)
    values ('${id}', '${ORG}', '${number}', '${type}', '${LOCATION}', ${spaceId ? `'${spaceId}'` : 'null'}, '${title}', 'Board fixture', now() - interval '2 hours',
      now() + interval '${untilMinutes} minutes', '{}'::jsonb, '${status}', '${ADMIN}', now() - interval '2 hours', '${ADMIN}', now() - interval '2 hours',
      ${issued ? `'${ADMIN}', now() - interval '1 hour'` : 'null, null'}, ${status === 'suspended' ? `'${ADMIN}', now(), 'Wind over 25 mph'` : 'null, null, null'}, '${ADMIN}');
    ${extra}
    commit;`)

  return number
}

test.afterAll(async () => {
  psql(`begin; set local session_replication_role = replica;
    create temp table s18a_ids on commit drop as select id from public.forge_permits where organization_id = '${ORG}' and title like '${TAG}%';
    create temp table s18a_spaces on commit drop as select id from public.forge_confined_spaces where organization_id = '${ORG}' and name like '${TAG}%';
    delete from public.forge_permit_entries where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_gas_tests where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_checks where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_people where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_links where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_notice_log where permit_id in (select id from s18a_ids);
    delete from public.forge_permit_activity where permit_id in (select id from s18a_ids) or space_id in (select id from s18a_spaces);
    delete from public.forge_permits where id in (select id from s18a_ids);
    delete from public.forge_confined_spaces where id in (select id from s18a_spaces);
    delete from public.forge_permit_check_definitions where organization_id = '${ORG}' and label like '${TAG}%';
    commit;`)
  if (fixture.requirementCleanup) await rest(`forge_permit_training_requirements?organization_id=eq.${ORG}&course_id=eq.${fixture.courseId}`, { method: 'DELETE' }).catch(() => {})
  if (fixture.settingsBefore !== undefined) {
    if (fixture.settingsBefore) {
      const { organization_id: _org, updated_at: _at, ...row } = fixture.settingsBefore

      await rest(`forge_permit_settings?organization_id=eq.${ORG}`, { method: 'PATCH', body: row }).catch(() => {})
    } else {
      await rest(`forge_permit_settings?organization_id=eq.${ORG}`, { method: 'DELETE' }).catch(() => {})
    }
  }
})

test('the confined space register: add, edit, archive and restore a space', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/permits/confined-space/spaces/new')
  const form = page.locator('[data-space-form]')

  await form.locator('input[name="name"]').fill(SPACE)
  await form.locator('input[name="spaceCode"]').fill('T' + RUN)
  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('input[value="toxic"]').check()
  await form.locator('input[value="engulfment"]').check()
  await form.locator('textarea[name="rescuePlan"]').fill('Site rescue team, tripod and winch at the manway.')
  await form.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/permits\/confined-space\/spaces\/[0-9a-f-]{36}$/)
  fixture.spaceId = page.url().split('/').pop()
  await expect(page.locator('[data-space-page]')).toContainText('Toxic atmosphere')

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL(/\/edit$/)
  await page.locator('[data-space-form] textarea[name="isolationNotes"]').fill('Blind the inlet at flange F-2.')
  await page.locator('[data-space-form]').getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/spaces\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-space-page]')).toContainText('Blind the inlet at flange F-2.')

  await open(page, '/permits/confined-space/spaces')
  await expect(page.locator(`[data-space-row="${SPACE}"]`)).toContainText('Permit required')

  await open(page, '/permits/confined-space/spaces/' + fixture.spaceId)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.locator('[data-space-archived]')).toBeVisible()
  await open(page, '/permits/confined-space/spaces')
  await expect(page.locator(`[data-space-row="${SPACE}"]`)).toHaveCount(0)
  await open(page, '/permits/confined-space/spaces?archived=1')
  await expect(page.locator(`[data-space-row="${SPACE}"]`)).toContainText('Archived')
  await open(page, '/permits/confined-space/spaces/' + fixture.spaceId)
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('[data-space-archived]')).toHaveCount(0)

  // "spaces" only exists under confined space.
  expect((await open(page, '/permits/hot-work/spaces')).status()).toBe(404)
  expect((await open(page, '/permits/not-a-type')).status()).toBe(404)
})

test('company settings: limits, required training and checklist items', async ({ page }) => {
  fixture.settingsBefore = (await rest(`forge_permit_settings?organization_id=eq.${ORG}&select=*`))[0] || null
  await login(page, 'admin@forge2.local')
  await open(page, '/permits/settings')
  const form = page.locator('[data-permit-settings-form]')

  await form.locator('input[name="fire_watch_minutes"]').fill('20')
  // OSHA's 30-minute floor: the field won't accept less.
  expect(await form.locator('input[name="fire_watch_minutes"]').evaluate(input => input.validity.rangeUnderflow)).toBe(true)
  await form.locator('input[name="fire_watch_minutes"]').fill('45')
  await form.getByRole('button', { name: 'Save settings' }).click()
  await expect.poll(async () => (await rest(`forge_permit_settings?organization_id=eq.${ORG}&select=fire_watch_minutes`))[0]?.fire_watch_minutes).toBe(45)

  const [course] = await rest(`forge_training_courses?organization_id=eq.${ORG}&is_active=eq.true&select=id,title&order=title&limit=1`)

  fixture.courseId = course.id
  fixture.requirementCleanup = true
  const training = page.locator('[data-training-requirements]')

  await training.locator('select[name="requirementType"]').selectOption('hot_work')
  await training.locator('select[name="requirementRole"]').selectOption('fire_watch')
  await training.locator('select[name="requirementCourse"]').selectOption(course.id)
  await training.getByRole('button', { name: 'Add requirement' }).click()
  const added = training.locator(`[data-training-requirement="hot_work:fire_watch:${course.title}"]`)

  await expect(added).toBeVisible()
  await added.getByRole('button', { name: 'Remove' }).click()
  await expect(added).toHaveCount(0)

  const heights = page.locator('[data-checklist-items="heights"]')
  const item = `${TAG} Toe boards fitted ${RUN}`

  await expect(heights.locator('[data-checklist-item]').first()).toContainText('built in')
  await heights.getByPlaceholder('New checklist item').fill(item)
  await heights.getByRole('button', { name: 'Add item' }).click()
  await expect(heights.locator(`[data-checklist-item="${item}"]`)).toContainText('company')
  await heights.locator(`[data-checklist-item="${item}"]`).getByRole('button', { name: 'Remove' }).click()
  await expect(heights.locator(`[data-checklist-item="${item}"]`)).toHaveCount(0)
})

test('a confined space entry draft: create with a warning, edit, link a lockout procedure, print', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/permits/confined-space')
  await page.locator('[data-new-permit]').click()
  await page.waitForURL(/\/permits\/confined-space\/new$/)
  const form = page.locator('[data-permit-form]')

  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('select[name="spaceId"]').selectOption(fixture.spaceId)
  await form.locator('input[name="title"]').fill(`${TAG} Clean tank ${RUN}`)
  await form.locator('textarea[name="workDescription"]').fill('Remove sludge from the tank floor.')
  await expect(form.locator('[data-details-warning]')).toContainText('Name the rescue service')
  await form.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/permits\/confined-space\/[0-9a-f-]{36}$/)
  fixture.csId = page.url().split('/').pop()

  const saved = await permitRow(fixture.csId)

  expect(saved.status).toBe('draft')
  expect(saved.permit_number).toMatch(/^CSE-\d{4}-\d{4}$/)
  expect(saved.space_id).toBe(fixture.spaceId)
  expect(new Date(saved.valid_until) - new Date(saved.valid_from)).toBeLessThanOrEqual(12 * 3600_000 + 60_000)
  await expect(page.locator('[data-permit-status]')).toHaveText('Draft')
  await expect(page.locator('[data-details-warning]')).toContainText('rescue service')
  await expect(page.locator('[data-permit-space]')).toContainText('Engulfment')
  await expect(page.locator('[data-permit-history]')).toContainText('Created')

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL(/\/edit$/)
  const edit = page.locator('[data-permit-form]')

  await edit.locator('input[name="details.rescue_service"]').fill('Site rescue team, 4 minute response')
  await edit.locator('input[name="details.communication"]').fill('Radio channel 3 and voice')
  await edit.locator('select[name="details.entry_type"]').selectOption('vertical')
  await expect(edit.locator('[data-details-warning]')).toHaveCount(0)
  await edit.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/permits\/confined-space\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-permit-type-details]')).toContainText('Radio channel 3 and voice')
  await expect(page.locator('[data-details-warning]')).toHaveCount(0)
  expect((await permitRow(fixture.csId)).details).toMatchObject({ rescue_service: 'Site rescue team, 4 minute response', entry_type: 'vertical' })

  const [procedure] = await rest(`forge_loto_procedures?organization_id=eq.${ORG}&retired_at=is.null&select=id,procedure_number,title&order=procedure_number&limit=1`)

  if (procedure) {
    const links = page.locator('[data-permit-links]')

    await links.locator('select').selectOption('loto:' + procedure.id)
    await links.getByRole('button', { name: 'Link' }).click()
    await expect(links.locator('[data-permit-link]')).toHaveCount(1)
    await expect(page.locator('[data-permit-history]')).toContainText('Linked')
    await links.locator('[data-permit-link]').getByRole('button', { name: 'Remove' }).click()
    await expect(links.locator('[data-permit-link]')).toHaveCount(0)
    await expect(page.locator('[data-permit-history]')).toContainText('Unlinked')
  }

  await open(page, `/permits/confined-space/${fixture.csId}/print`)
  const sheet = page.locator('[data-permit-print]')

  await expect(sheet).toContainText(saved.permit_number)
  await expect(sheet).toContainText('Confined Space Entry Permit')
  await expect(sheet.locator('[data-print-people]')).toContainText('Entry supervisor')
  await expect(sheet.locator('[data-print-checklist]')).toContainText('Ventilation keeps running during entry')
  await expect(sheet.locator('[data-print-gas-tests]')).toBeVisible()
  await expect(sheet.locator('[data-print-entries]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
})

test('a hot work draft: list, filters, and deleting the draft', async ({ page }) => {
  await login(page, 'admin@forge2.local')
  await open(page, '/permits/hot-work/new')
  const form = page.locator('[data-permit-form]')
  const title = `${TAG} Weld bracket ${RUN}`

  await form.locator('select[name="locationId"]').selectOption(LOCATION)
  await form.locator('input[name="title"]').fill(title)
  await form.locator('input[name="workArea"]').fill('Bay 4')
  await form.locator('textarea[name="workDescription"]').fill('Weld a support bracket to the mezzanine rail.')
  await form.locator('select[name="details.work_type"]').selectOption('welding')
  await form.locator('input[name="details.gas_test_required"]').check()
  await form.locator('input[name="details.extinguisher"]').fill('20 lb ABC at the stairs')
  await expect(form.locator('[data-details-warning]')).toHaveCount(0)
  await form.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/permits\/hot-work\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()
  const saved = await permitRow(id)

  expect(saved.permit_number).toMatch(/^HW-\d{4}-\d{4}$/)
  expect(saved.details).toMatchObject({ work_type: 'welding', gas_test_required: true })

  await open(page, '/permits/hot-work?q=' + encodeURIComponent('Weld bracket ' + RUN))
  await expect(page.locator('[data-permit-row]')).toHaveCount(1)
  await expect(page.locator(`[data-permit-row="${saved.permit_number}"]`)).toContainText('Bay 4')
  await open(page, '/permits/hot-work?status=active&q=' + encodeURIComponent('Weld bracket ' + RUN))
  await expect(page.locator('[data-permit-row]')).toHaveCount(0)

  // The window is checked: an end before the start is refused.
  await open(page, `/permits/hot-work/${id}/edit`)
  const edit = page.locator('[data-permit-form]')

  await edit.locator('input[name="validUntil"]').fill('2020-01-01T08:00')
  await edit.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('The end time must be after the start time.')).toBeVisible()

  await open(page, '/permits/hot-work/' + id)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete draft' }).click()
  await page.waitForURL(/\/permits\/hot-work$/)
  expect(await rest(`forge_permits?id=eq.${id}&select=id`)).toHaveLength(0)
})

test('the board shows active, suspended, past-end-time permits and who is inside a space', async ({ page }) => {
  const [person] = await rest(`forge_personnel?organization_id=eq.${ORG}&archived_at=is.null&select=id,first_name,last_name&order=last_name&limit=1`)
  const ids = {
    active: crypto.randomUUID(),
    suspended: crypto.randomUUID(),
    expired: crypto.randomUUID(),
    cs: crypto.randomUUID()
  }
  const personRow = crypto.randomUUID()

  const active = insertLivePermit({ id: ids.active, type: 'heights', prefix: 'WAH', status: 'active', title: `${TAG} Roof work ${RUN}`, untilMinutes: 30 })
  const suspended = insertLivePermit({ id: ids.suspended, type: 'heights', prefix: 'WAH', status: 'suspended', title: `${TAG} Gutter ${RUN}`, untilMinutes: 300 })
  const expired = insertLivePermit({ id: ids.expired, type: 'electrical', prefix: 'EEW', status: 'active', title: `${TAG} MCC ${RUN}`, untilMinutes: -45 })

  insertLivePermit({
    id: ids.cs,
    type: 'confined_space',
    prefix: 'CSE',
    status: 'active',
    title: `${TAG} Tank entry ${RUN}`,
    untilMinutes: 240,
    spaceId: fixture.spaceId,
    extra: `insert into public.forge_permit_people (id, organization_id, permit_id, role, personnel_id, added_by) values ('${personRow}', '${ORG}', '${ids.cs}', 'entrant', '${person.id}', '${ADMIN}');
      insert into public.forge_permit_entries (organization_id, permit_id, person_id, entered_recorded_by) values ('${ORG}', '${ids.cs}', '${personRow}', '${ADMIN}');`
  })

  await login(page, 'admin@forge2.local')
  await open(page, '/permits')
  await expect(page.locator('[data-board-section="active"]')).toContainText(active)
  await expect(page.locator(`[data-board-section="active"] [data-board-permit="${active}"] [data-time-left]`)).toHaveClass(/text-error/)
  await expect(page.locator('[data-board-section="suspended"]')).toContainText('Wind over 25 mph')
  await expect(page.locator(`[data-board-section="suspended"] [data-board-permit="${suspended}"]`)).toBeVisible()
  await expect(page.locator(`[data-board-section="expired"] [data-board-permit="${expired}"]`)).toContainText('Expired')
  await expect(page.locator(`[data-board-section="active"] [data-board-permit="${expired}"]`)).toHaveCount(0)
  const inside = page.locator(`[data-inside-person="${person.first_name} ${person.last_name}"]`)

  await expect(inside).toContainText(SPACE)
  await inside.getByRole('link').click()
  await page.waitForURL(new RegExp(`/permits/confined-space/${ids.cs}$`))
  await expect(page.locator('[data-entry-log]')).toContainText('Still inside')

  await open(page, '/permits/electrical?expired=1')
  await expect(page.locator(`[data-permit-row="${expired}"] [data-permit-expired]`)).toBeVisible()
  await open(page, `/permits/working-at-heights/${ids.suspended}`)
  await expect(page.locator('[data-permit-suspended]')).toContainText('Wind over 25 mph')
})

test('a view-only employee sees no settings tab and cannot open settings', async ({ page }) => {
  await login(page, 'user@forge2.local')
  const response = await open(page, '/permits/settings')

  expect(response.status()).toBeLessThan(500)
  await expect(page).not.toHaveURL(/\/permits\/settings/)
})
