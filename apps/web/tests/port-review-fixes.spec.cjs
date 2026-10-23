/**
 * PR #12 review fixes, in the browser:
 * - A location-scoped trainer can record paper results and assign group training only for people in their
 *   locations; others are reported as not found or skipped, and their records are untouched.
 * - A course with sections but no quiz can be completed (with its acknowledgement) and earns a certificate.
 *
 * Run: pnpm exec playwright test apps/web/tests/port-review-fixes.spec.cjs --reporter=line --workers=1
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
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const DEMO_USER = '20000000-0000-4000-8000-000000000002'
const DEMO_PERSON = '20000000-0000-4000-8000-000000000600'
const RUN = Date.now().toString().slice(-6)

test.describe.configure({ mode: 'serial' })
test.setTimeout(240000)

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${pathname} failed: ${text}`)
  return text ? JSON.parse(text) : null
}

async function login(page, email) {
  await page.goto(baseURL + '/auth/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill('ForgeDev2!')
  await page.getByRole('button', { name: /Sign in to Forge Industrial Safety 2\.0/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/auth/login'), { timeout: 30000 })
}

const open = async (page, url) => {
  await page.goto(url.startsWith('http') ? url : baseURL + url)
  await page.waitForLoadState('networkidle')
}

// A course with one section and, unless `quiz` is false, one question; published through the database function.
const publishedCourse = async (title, { quiz = true, acknowledgement = null } = {}) => {
  const [course] = await rest('/rest/v1/forge_training_courses', { method: 'POST', body: { organization_id: ORG, title, validity_months: 12, created_by: ADMIN, updated_by: ADMIN } })
  const [version] = await rest('/rest/v1/forge_training_course_versions', {
    method: 'POST',
    body: { organization_id: ORG, course_id: course.id, version_number: 1, requires_acknowledgement: Boolean(acknowledgement), acknowledgement_text: acknowledgement, created_by: ADMIN }
  })
  await rest('/rest/v1/forge_training_sections', { method: 'POST', body: { organization_id: ORG, version_id: version.id, title: 'Read the procedure', body: 'Synthetic procedure text.', sort_order: 1, is_required: true } })
  if (quiz) {
    await rest('/rest/v1/forge_training_questions', { method: 'POST', body: { organization_id: ORG, version_id: version.id, stem: 'Ready?', choices: ['Yes', 'No'], correct_index: 0, sort_order: 1 } })
  }
  await rest('/rest/v1/rpc/forge_publish_training_version', { method: 'POST', body: { p_organization_id: ORG, p_version_id: version.id, p_actor_user_id: ADMIN } })
  return course
}

let fx = null

test.beforeAll(async () => {
  const [inside] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG, name: `Scoped Plant ${RUN}`, code: `SI${RUN}` } })
  const [outside] = await rest('/rest/v1/locations', { method: 'POST', body: { organization_id: ORG, name: `Other Plant ${RUN}`, code: `SO${RUN}` } })
  const person = async (last, locationId, number) =>
    (await rest('/rest/v1/forge_personnel', {
      method: 'POST',
      body: { organization_id: ORG, first_name: 'Scope', last_name: `${last} ${RUN}`, employee_number: number, employment_status: 'active', location_id: locationId, created_by: ADMIN, updated_by: ADMIN }
    }))[0]
  const near = await person('Inside', inside.id, `IN-${RUN}`)
  const far = await person('Outside', outside.id, `OUT-${RUN}`)

  const course = await publishedCourse(`Scoped Course ${RUN}`)
  const [group] = await rest('/rest/v1/forge_training_groups', { method: 'POST', body: { organization_id: ORG, name: `Scoped Group ${RUN}`, created_by: ADMIN } })
  await rest('/rest/v1/forge_training_group_members', { method: 'POST', body: [near, far].map(item => ({ organization_id: ORG, group_id: group.id, personnel_id: item.id })) })
  await rest('/rest/v1/forge_training_group_requirements', { method: 'POST', body: { organization_id: ORG, group_id: group.id, course_id: course.id, added_by: ADMIN } })

  // The demo employee becomes a trainer limited to one location.
  const [role] = await rest('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    body: { organization_id: ORG, role_key: `port-scoped-trainer-${RUN}`, name: `Scoped Trainer ${RUN}`, is_system_role: false, is_active: true, sort_order: 906 }
  })
  const permissions = await rest('/rest/v1/forge_permission_registry?select=id,permission_key&permission_key=in.(training.view,training.record_completion,training.assign,training.manage_groups)')
  await rest('/rest/v1/forge_tenant_role_permissions', {
    method: 'POST',
    body: permissions.map(item => ({ role_id: role.id, permission_id: item.id, allowed: true, scope: item.permission_key === 'training.manage_groups' ? 'organization' : 'location' }))
  })
  await rest('/rest/v1/forge_tenant_user_roles', { method: 'POST', body: { organization_id: ORG, user_id: DEMO_USER, role_id: role.id } })
  await rest('/rest/v1/forge_tenant_user_location_access', { method: 'POST', body: { organization_id: ORG, user_id: DEMO_USER, location_id: inside.id } })

  fx = { inside, outside, near, far, course, group, role }
})

test.afterAll(async () => {
  if (!fx) return
  await rest(`/rest/v1/forge_tenant_user_location_access?organization_id=eq.${ORG}&user_id=eq.${DEMO_USER}&location_id=eq.${fx.inside.id}`, { method: 'DELETE' })
  await rest(`/rest/v1/forge_tenant_roles?id=eq.${fx.role.id}`, { method: 'DELETE' })
})

test('a location-scoped trainer only records paper results and assigns training inside their locations', async ({ page }) => {
  await login(page, 'user@forge2.local')

  await open(page, '/training/paper')
  await page.locator('#paper-course').selectOption({ label: fx.course.title })
  await page.locator('#paper-results').fill(`OUT-${RUN}, 95\nIN-${RUN}, 95`)
  await page.getByRole('button', { name: 'Record Results' }).click()
  const outcomes = page.getByTestId('paper-outcomes')
  await expect(outcomes).toContainText(`Scope Inside ${RUN}) — Passed (95%)`, { timeout: 30000 })
  await expect(outcomes).toContainText('Employee number not found.')
  await expect(outcomes).not.toContainText(`Scope Outside ${RUN}`)

  const farAssignments = () => rest(`/rest/v1/forge_training_assignments?personnel_id=eq.${fx.far.id}&select=id`)
  const farCompletions = await rest(`/rest/v1/forge_training_completions?personnel_id=eq.${fx.far.id}&select=id`)
  expect(await farAssignments()).toHaveLength(0)
  expect(farCompletions).toHaveLength(0)

  await open(page, `/training/groups?group=${fx.group.id}`)
  await page.getByRole('button', { name: 'Assign Required Training' }).click()
  await expect(page.getByText(/1 member is outside your assignment access and were skipped|1 member is outside your assignment access/)).toBeVisible({ timeout: 30000 })
  expect(await farAssignments()).toHaveLength(0)
})

test('the OSHA review queue files a New Year\'s Eve incident under its local year only', async ({ page }) => {
  // 03:00 UTC on Jan 1 is still Dec 31 in America/Chicago, the OSHA time zone used for injury dates.
  const number = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG } })
  await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG, incident_number: number, occurred_at: '2026-01-01T03:00:00Z', location_id: fx.inside.id, reported_by_personnel_id: fx.near.id,
      summary: `New Year strain ${RUN}`, incident_type: 'injury', involves_injury: true, created_by: ADMIN, updated_by: ADMIN
    }
  })

  await login(page, 'admin@forge2.local')
  await open(page, '/osha?year=2025')
  await expect(page.getByTestId('osha-awaiting-review')).toContainText(number, { timeout: 30000 })
  await open(page, '/osha?year=2026')
  await expect(page.locator('main')).not.toContainText(number)
})

test('an own-scope OSHA viewer sees only their own cases on an incident', async ({ page }) => {
  const number = await rest('/rest/v1/rpc/next_forge_incident_number', { method: 'POST', body: { p_organization_id: ORG } })
  const [incident] = await rest('/rest/v1/forge_incidents', {
    method: 'POST',
    body: {
      organization_id: ORG, incident_number: number, occurred_at: '2026-10-05T15:00:00Z', location_id: fx.inside.id, reported_by_personnel_id: fx.near.id,
      summary: `Shared incident ${RUN}`, incident_type: 'injury', involves_injury: true, created_by: ADMIN, updated_by: ADMIN
    }
  })
  const oshaCase = async (personnel, createdBy, name) => {
    const caseNumber = await rest('/rest/v1/rpc/next_forge_osha_case_number', { method: 'POST', body: { p_organization_id: ORG, p_location_id: fx.inside.id, p_year: 2026 } })
    await rest('/rest/v1/forge_osha_cases', {
      method: 'POST',
      body: {
        organization_id: ORG, case_number: caseNumber, incident_id: incident.id, personnel_id: personnel.id, location_id: fx.inside.id, employee_name: name,
        injury_date: '2026-10-05', recordability: 'pending', created_by: createdBy, updated_by: createdBy
      }
    })
    return caseNumber
  }
  const othersCase = await oshaCase(fx.near, ADMIN, `Someone Else ${RUN}`)
  const ownCase = await oshaCase(fx.far, DEMO_USER, `Own Case ${RUN}`)

  const [role] = await rest('/rest/v1/forge_tenant_roles', {
    method: 'POST',
    body: { organization_id: ORG, role_key: `port-osha-own-${RUN}`, name: `OSHA Own ${RUN}`, is_system_role: false, is_active: true, sort_order: 907 }
  })
  try {
    const permissions = await rest('/rest/v1/forge_permission_registry?select=id,permission_key&permission_key=in.(incidents.view,osha.view,osha.edit)')
    await rest('/rest/v1/forge_tenant_role_permissions', {
      method: 'POST',
      body: permissions.map(item => ({ role_id: role.id, permission_id: item.id, allowed: true, scope: item.permission_key.startsWith('osha.') ? 'own' : 'organization' }))
    })
    await rest('/rest/v1/forge_tenant_user_roles', { method: 'POST', body: { organization_id: ORG, user_id: DEMO_USER, role_id: role.id } })

    await login(page, 'user@forge2.local')
    await open(page, `/incidents/${incident.id}`)
    const panel = page.getByTestId('incident-osha-panel')
    await expect(panel).toContainText(ownCase, { timeout: 30000 })
    await expect(panel).not.toContainText(othersCase)
    await expect(panel).not.toContainText(`Someone Else ${RUN}`)
    await expect(page.getByTestId('incident-osha-hidden')).toHaveText('One other OSHA case on this incident is outside your OSHA access.')
    await expect(panel).not.toContainText('No OSHA case has been opened')

    // Opening a case for the employee whose case is hidden explains it, instead of sending the viewer to a 404.
    await panel.locator('#osha-injured-person').evaluate((select, value) => {
      if (![...select.options].some(option => option.value === value)) select.add(new Option('Injured employee', value))
    }, fx.near.id)
    await panel.locator('#osha-injured-person').selectOption(fx.near.id)
    await panel.getByRole('button', { name: 'Open OSHA Case' }).click()
    await expect(page.getByText('This employee already has an OSHA case for this incident, outside your OSHA access. Ask an OSHA administrator.')).toBeVisible({ timeout: 30000 })
    expect(new URL(page.url()).pathname).toBe(`/incidents/${incident.id}`)
  } finally {
    await rest(`/rest/v1/forge_tenant_roles?id=eq.${role.id}`, { method: 'DELETE' })
  }
})

test('a course without a quiz is completed after its sections and acknowledgement', async ({ page }) => {
  const course = await publishedCourse(`Read and Sign ${RUN}`, { quiz: false, acknowledgement: 'I read the lockout procedure.' })
  const [assignment] = await rest('/rest/v1/forge_training_assignments', {
    method: 'POST',
    body: { organization_id: ORG, course_id: course.id, personnel_id: DEMO_PERSON, status: 'assigned', assigned_by: ADMIN }
  })

  await login(page, 'user@forge2.local')
  await open(page, `/my-training/${assignment.id}`)
  const complete = page.getByTestId('course-complete')
  await expect(complete).toContainText('Finish the required sections to complete the course.', { timeout: 30000 })
  await expect(page.getByTestId('course-quiz')).toHaveCount(0)

  await page.getByRole('button', { name: 'Mark Section Complete' }).click()
  await expect(page.getByTestId('course-notice')).toContainText('Complete the course below', { timeout: 30000 })
  await expect(complete.getByRole('button', { name: 'Complete Course' })).toBeDisabled()
  await complete.getByText('I read the lockout procedure.').click()
  await complete.getByRole('button', { name: 'Complete Course' }).click()
  await expect(complete.getByRole('link', { name: 'View Certificate' })).toBeVisible({ timeout: 30000 })

  const [completion] = await rest(`/rest/v1/forge_training_completions?assignment_id=eq.${assignment.id}&select=result,source,approval_status,certificate_number,attempt_id`)
  expect(completion).toMatchObject({ result: 'completed', source: 'online', approval_status: 'approved', attempt_id: null })
  expect(completion.certificate_number).toMatch(/^CERT-\d{4}-\d{5}$/)
  const [progress] = await rest(`/rest/v1/forge_training_progress?assignment_id=eq.${assignment.id}&select=acknowledged_at,acknowledgement_text`)
  expect(progress.acknowledged_at).toBeTruthy()
  expect(progress.acknowledgement_text).toBe('I read the lockout procedure.')
  const [after] = await rest(`/rest/v1/forge_training_assignments?id=eq.${assignment.id}&select=status`)
  expect(after.status).toBe('completed')
})
