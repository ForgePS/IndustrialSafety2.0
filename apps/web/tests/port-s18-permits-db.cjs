/**
 * Port slice 18 (high-risk work permits): database contract checks for the shared Permit-to-Work engine.
 * Numbering; new permits start as drafts; one company for every link; status only through the workflow functions;
 * content fixed after draft; details, people, window, checklist, training and gas test gates; self-approval;
 * failing gas test suspends; resume needs a new test; confined space entry log; close blockers (people inside,
 * hot work fire watch); frozen closed permits; append-only gas tests and history; space guard; no direct access for
 * signed-in users; permissions and grants.
 * Run: node apps/web/tests/port-s18-permits-db.cjs   (needs Docker for the local database)
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const OTHER_ORG = '40000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const OTHER_LOCATION = '40000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-7)
const TAG = `DB-S18 ${RUN}`

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: { apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { status: response.status, data }
}

const rest = (table, query = '', options = {}) => request('/rest/v1/' + table + (query ? '?' + query : ''), options)
const rpc = (fn, body, options = {}) => request('/rest/v1/rpc/' + fn, { ...options, method: 'POST', body })

async function ok(promise, label) {
  const result = await promise

  if (result.status >= 300) throw new Error(label + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function fails(promise, pattern, label) {
  const result = await promise

  assert.ok(result.status >= 400, label + ' should fail but returned ' + result.status)
  assert.match(String(result.data?.message || JSON.stringify(result.data)), pattern, label)
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data
}

const insert = (table, body, label) => ok(rest(table, '', { method: 'POST', body }), label).then(rows => rows[0])
const patch = (table, id, body) => rest(table, 'id=eq.' + id, { method: 'PATCH', body })

/** Run SQL as supabase_admin (only it may switch triggers off) in the local database (test setup and clean-up only). */
const psql = sql => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })

const step = (fn, permit, actor, extra = {}) => rpc('forge_permit_' + fn, { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: actor, ...extra })

const hours = n => new Date(Date.now() + n * 3600_000).toISOString()

async function newPermit(type, extra = {}) {
  const number = await ok(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: type }), 'number')

  return insert(
    'forge_permits',
    { organization_id: ORG, permit_number: number, permit_type: type, location_id: LOCATION, title: `${TAG} ${type}`, work_description: 'Test work', valid_from: hours(0), valid_until: hours(6), created_by: USER, ...extra },
    'permit ' + type
  )
}

const addPerson = (permit, role, personnelId) => insert('forge_permit_people', { organization_id: ORG, permit_id: permit.id, role, personnel_id: personnelId, added_by: USER }, 'person ' + role)

async function answerChecklist(permit) {
  const defs = await ok(rest('forge_permit_check_definitions', `permit_type=eq.${permit.permit_type}&organization_id=is.null&select=check_key,allow_na`), 'definitions')

  for (const def of defs) {
    await insert('forge_permit_checks', { organization_id: ORG, permit_id: permit.id, check_key: def.check_key, answer: def.allow_na ? 'na' : 'yes', note: def.allow_na ? 'Not needed' : null }, 'check')
  }
}

const gasTest = (permit, actor, o2, lel, extra = {}) =>
  step('record_gas_test', permit, actor, {
    p_o2: o2,
    p_lel: lel,
    p_h2s: 0,
    p_co: 0,
    p_other_gas: null,
    p_other_value: null,
    p_other_limit: null,
    p_instrument: 'Four-gas meter',
    p_bump_tested: true,
    p_test_point: 'Top',
    p_note: null,
    ...extra
  })

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error('Set the Supabase URL and keys (see docs/LOCAL_DEVELOPMENT.md).')

  const user = await signIn('user@forge2.local')
  const people = await ok(rest('forge_personnel', `organization_id=eq.${ORG}&archived_at=is.null&employment_status=eq.active&select=id&order=id&limit=4`), 'personnel')

  assert.ok(people.length >= 4, 'the seed has at least four active people')
  const [p1, p2, p3, p4] = people.map(row => row.id)

  try {
    // Numbering -------------------------------------------------------------------------------------
    const first = await ok(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'hot_work' }), 'number')
    const second = await ok(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'hot_work' }), 'number')

    assert.match(first, /^HW-\d{4}-\d{4,}$/)
    assert.equal(Number(second.slice(-4)), Number(first.slice(-4)) + 1, 'numbers go up by one')
    assert.match(await ok(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'confined_space' }), 'cse'), /^CSE-/)
    await fails(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'loto' }), /Unknown permit type/, 'unknown type')
    await fails(rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: 'hot_work' }, { token: user.access_token }), /permission|denied/i, 'signed-in users cannot number')
    console.log('ok - numbering')

    // Register --------------------------------------------------------------------------------------
    const space = await insert('forge_confined_spaces', { organization_id: ORG, location_id: LOCATION, name: `${TAG} Tank`, hazards: ['toxic', 'engulfment'] }, 'space')
    const plainSpace = await insert('forge_confined_spaces', { organization_id: ORG, location_id: LOCATION, name: `${TAG} Pit`, permit_required: false }, 'plain space')

    await fails(rest('forge_confined_spaces', '', { method: 'POST', body: { organization_id: ORG, location_id: OTHER_LOCATION, name: 'x' } }), /Location not found/, 'space location in the company')
    await fails(rest('forge_confined_spaces', '', { method: 'POST', body: { organization_id: ORG, location_id: LOCATION, name: 'x', hazards: ['ghosts'] } }), /check/, 'hazards from the list')
    console.log('ok - confined space register')

    // Insert checks ---------------------------------------------------------------------------------
    const base = { organization_id: ORG, permit_type: 'hot_work', location_id: LOCATION, title: `${TAG} x`, work_description: 'x', valid_from: hours(0), valid_until: hours(4) }

    await fails(rest('forge_permits', '', { method: 'POST', body: { ...base, permit_number: second, status: 'active' } }), /starts as a draft/, 'new permits start as drafts')
    await fails(rest('forge_permits', '', { method: 'POST', body: { ...base, permit_number: 'CSE-2026-9999' } }), /prefix/, 'prefix matches the type')
    await fails(rest('forge_permits', '', { method: 'POST', body: { ...base, permit_number: second, space_id: space.id } }), /forge_permits_space/, 'only confined space has a space')
    await fails(rest('forge_permits', '', { method: 'POST', body: { ...base, permit_number: second, location_id: OTHER_LOCATION } }), /Location not found/, 'location in the company')
    await fails(rest('forge_permits', '', { method: 'POST', body: { ...base, permit_number: second, valid_until: base.valid_from } }), /window/, 'end after start')
    console.log('ok - permit insert checks')

    // Confined space flow ---------------------------------------------------------------------------
    const cse = await newPermit('confined_space', { space_id: space.id })

    assert.equal(cse.status, 'draft')
    await fails(step('submit', cse, USER), /rescue service/, 'details needed to submit')
    await ok(patch('forge_permits', cse.id, { details: { rescue_service: 'Plant rescue team', communication: 'Radio', entry_type: 'vertical' } }), 'details')
    await fails(step('submit', cse, USER), /entry supervisor/, 'people needed to submit')
    await addPerson(cse, 'entry_supervisor', p1)
    await addPerson(cse, 'attendant', p2)
    const clash = await addPerson(cse, 'entrant', p2)

    await fails(step('submit', cse, USER), /attendant can.t also be an entrant/, 'attendant stays outside')
    await ok(rest('forge_permit_people', 'id=eq.' + clash.id, { method: 'DELETE' }), 'remove clash on a draft')
    const entrant = await addPerson(cse, 'entrant', p3)

    await fails(rest('forge_permit_people', '', { method: 'POST', body: { organization_id: ORG, permit_id: cse.id, role: 'fire_watch', personnel_id: p4 } }), /role isn.t used/, 'roles per type')
    await fails(patch('forge_permits', cse.id, { status: 'active' }), /permit workflow/, 'no direct status change')
    await ok(step('submit', cse, USER), 'submit')
    await fails(patch('forge_permits', cse.id, { title: 'Changed' }), /Only a draft permit can be edited/, 'content fixed after submit')
    await fails(step('approve', cse, USER, { p_note: null }), /someone else must approve/, 'no self-approval')

    // Training gate: require a course nobody on the permit has.
    const course = (await ok(rest('forge_training_courses', `organization_id=eq.${ORG}&select=id,title&limit=1`), 'course'))[0]
    const requirement = await insert('forge_permit_training_requirements', { organization_id: ORG, permit_type: 'confined_space', role: 'entrant', course_id: course.id }, 'requirement')
    const gaps = await ok(rpc('forge_permit_training_gaps', { p_permit_id: cse.id }), 'gaps')
    const coveredAlready = !gaps.some(gap => gap.person_row_id === entrant.id)

    if (!coveredAlready) await fails(step('approve', cse, ADMIN, { p_note: null }), /has no current .* training/, 'training gate')
    await ok(rest('forge_permit_training_requirements', 'id=eq.' + requirement.id, { method: 'DELETE' }), 'drop requirement')
    await fails(rest('forge_permit_training_requirements', '', { method: 'POST', body: { organization_id: ORG, permit_type: 'confined_space', role: 'fire_watch', course_id: course.id } }), /role/, 'requirement role fits the type')

    await ok(step('approve', cse, ADMIN, { p_note: 'Go ahead' }), 'approve')
    await fails(step('issue', cse, ADMIN), /Answer the checklist/, 'checklist before issue')
    await answerChecklist(cse)
    await fails(step('issue', cse, ADMIN), /Record a gas test first/, 'gas test before issue')
    await fails(gasTest(cse, USER, null, 0), /oxygen and LEL/, 'confined space test needs O2 and LEL')
    const good = await ok(gasTest(cse, USER, 20.9, 0), 'gas test')

    assert.equal(good.passed, true)
    await ok(step('issue', cse, ADMIN), 'issue')
    await fails(rest('forge_permit_checks', `permit_id=eq.${cse.id}&check_key=eq.communication`, { method: 'PATCH', body: { note: 'x' } }), /fixed once the permit is issued/, 'checklist fixed after issue')
    await fails(step('sign_in', cse, ADMIN, { p_person_id: (await ok(rest('forge_permit_people', `permit_id=eq.${cse.id}&role=eq.attendant&select=id`), 'att'))[0].id }), /Only entrants/, 'only entrants enter')
    await ok(step('sign_in', cse, ADMIN, { p_person_id: entrant.id }), 'sign in')
    await fails(step('sign_in', cse, ADMIN, { p_person_id: entrant.id }), /already signed in/, 'no double sign-in')
    await fails(patch('forge_permit_people', entrant.id, { removed_at: new Date().toISOString() }), /Sign this person out/, 'no removing someone inside')

    const bad = await ok(gasTest(cse, USER, 18.5, 12), 'failing gas test')

    assert.equal(bad.passed, false)
    assert.equal(bad.problems.length, 2)
    const suspended = (await ok(rest('forge_permits', 'id=eq.' + cse.id), 'reload'))[0]

    assert.equal(suspended.status, 'suspended', 'a failing test suspends the permit')
    assert.match(suspended.suspend_reason, /Gas test failed/)
    await fails(step('resume', cse, ADMIN), /last gas test failed/, 'resume needs a passing test')
    await fails(patch('forge_permit_gas_tests', bad.id, { passed: true }), /can.t be changed/, 'gas tests are append-only')
    await fails(step('close', cse, ADMIN, { p_note: null }), /still inside/, 'close refused while someone is inside')
    await ok(step('sign_out', cse, USER, { p_person_id: entrant.id }), 'sign out while suspended')
    await ok(gasTest(cse, USER, 20.8, 1), 'passing retest')
    await ok(step('resume', cse, ADMIN), 'resume')
    await ok(step('close', cse, USER, { p_note: 'Done' }), 'close')
    await fails(patch('forge_permits', cse.id, { title: 'x' }), /closed and can.t be changed/, 'closed permits are frozen')
    await fails(rest('forge_permit_links', '', { method: 'POST', body: { organization_id: ORG, permit_id: cse.id, document_id: null, loto_procedure_id: null } }), /./, 'links need a target')
    await fails(rest('forge_permits', 'id=eq.' + cse.id, { method: 'DELETE' }), /Only a draft permit can be deleted/, 'only drafts are deleted')

    const activity = await ok(rest('forge_permit_activity', `permit_id=eq.${cse.id}&select=id,action&order=created_at`), 'activity')

    assert.deepEqual(
      activity.map(row => row.action),
      ['submitted', 'approved', 'gas_test_passed', 'issued', 'entered', 'gas_test_failed', 'suspended', 'exited', 'gas_test_passed', 'resumed', 'closed']
    )
    await fails(patch('forge_permit_activity', activity[0].id, { detail: 'x' }), /history can.t be changed/, 'history is append-only')
    console.log('ok - confined space flow (details, people, self-approval, training, checklist, gas tests, entry log, suspend, resume, close)')

    // Space guard and type rules --------------------------------------------------------------------
    const cse2 = await newPermit('confined_space', { space_id: plainSpace.id, details: { rescue_service: 'Team', communication: 'Voice' } })

    await addPerson(cse2, 'entry_supervisor', p1)
    await addPerson(cse2, 'attendant', p2)
    await addPerson(cse2, 'entrant', p3)
    await fails(step('submit', cse2, USER), /not a permit-required space/, 'non-permit spaces need no permit')
    await ok(patch('forge_confined_spaces', plainSpace.id, { permit_required: true }), 'reclassify')
    await ok(step('submit', cse2, USER), 'submit 2')
    await fails(patch('forge_confined_spaces', plainSpace.id, { archived_at: new Date().toISOString() }), /open permits/, 'no archiving a space with open permits')
    await fails(step('cancel', cse2, USER, { p_reason: ' ' }), /Say why/, 'cancel needs a reason')
    await ok(step('cancel', cse2, USER, { p_reason: 'Not needed' }), 'cancel')
    await ok(patch('forge_confined_spaces', plainSpace.id, { archived_at: new Date().toISOString() }), 'archive after cancel')
    console.log('ok - space guard and cancel')

    // Hot work: fire watch --------------------------------------------------------------------------
    const hw = await newPermit('hot_work', { details: { work_type: 'welding', gas_test_required: false } })

    await addPerson(hw, 'hot_work_operator', p1)
    await addPerson(hw, 'fire_watch', p2)
    await ok(step('submit', hw, USER), 'hw submit')
    await ok(step('approve', hw, ADMIN, { p_note: null }), 'hw approve')
    await answerChecklist(hw)
    await ok(step('issue', hw, ADMIN), 'hw issue (no gas test needed)')
    await fails(step('close', hw, ADMIN, { p_note: null }), /Mark the work complete/, 'close needs work complete')
    await ok(step('complete_work', hw, USER), 'work complete')
    await fails(step('complete_work', hw, USER), /already marked complete/, 'once')
    await fails(step('close', hw, ADMIN, { p_note: null }), /fire watch runs until/, 'fire watch blocks close')
    psql(`begin; set local session_replication_role = replica; update public.forge_permits set work_completed_at = now() - interval '61 minutes' where id = '${hw.id}'; commit;`)
    await ok(step('close', hw, ADMIN, { p_note: 'No smoldering' }), 'close after fire watch')
    await fails(gasTest(hw, USER, null, 0), /once the permit is approved and until it is closed/, 'no tests on a closed permit')
    console.log('ok - hot work fire watch')

    // Heights and electrical details ----------------------------------------------------------------
    const wah = await newPermit('heights', { details: { working_height_ft: 20, fall_protection: ['personal_fall_arrest'], rescue_plan: 'Rescue kit at the lift' } })

    await addPerson(wah, 'worker', p1)
    await addPerson(wah, 'competent_person', p2)
    await fails(step('submit', wah, USER), /anchorage/, 'personal fall protection needs an anchorage')
    await ok(patch('forge_permits', wah.id, { details: { working_height_ft: 20, fall_protection: ['personal_fall_arrest'], rescue_plan: 'Rescue kit', anchorage: 'Beam strap' } }), 'anchorage')
    await ok(step('submit', wah, USER), 'heights submit')
    await fails(gasTest(wah, USER, 20.9, 0), /confined space and hot work/, 'no gas tests on heights')

    const eew = await newPermit('electrical', { details: { voltage: 480, justification: 'infeasible', justification_detail: 'Line feeds life support', equipment: 'MCC-2' } })

    await addPerson(eew, 'qualified_person', p1)
    await fails(step('submit', eew, USER), /approach boundaries/, 'boundaries needed')
    await ok(
      patch('forge_permits', eew.id, {
        details: {
          voltage: 480,
          justification: 'infeasible',
          justification_detail: 'Line feeds life support',
          equipment: 'MCC-2',
          limited_approach: '3 ft 6 in',
          restricted_approach: '1 ft',
          arc_flash_boundary: '4 ft',
          ppe_category: '2',
          ppe: 'CAT 2 arc-rated clothing'
        }
      }),
      'electrical details'
    )
    await ok(step('submit', eew, USER), 'electrical submit')
    await fails(step('reject', eew, ADMIN, { p_reason: '' }), /Say why/, 'sending back needs a reason')
    await ok(step('reject', eew, ADMIN, { p_reason: 'Use the infrared window instead' }), 'send back')
    const back = (await ok(rest('forge_permits', 'id=eq.' + eew.id), 'reload'))[0]

    assert.equal(back.status, 'draft')
    assert.equal(back.reject_reason, 'Use the infrared window instead')
    console.log('ok - heights and electrical details, send back')

    // Window ----------------------------------------------------------------------------------------
    const long = await newPermit('hot_work', { valid_until: hours(13), details: { work_type: 'grinding', gas_test_required: true } })

    await addPerson(long, 'hot_work_operator', p1)
    await addPerson(long, 'fire_watch', p2)
    await fails(step('submit', long, USER), /at most 12 hours/, 'max hours')
    await ok(patch('forge_permits', long.id, { valid_until: hours(8) }), 'shorten')
    await ok(step('submit', long, USER), 'submit long')
    await ok(step('approve', long, ADMIN, { p_note: null }), 'approve long')
    await answerChecklist(long)
    await fails(step('issue', long, ADMIN), /Record a gas test first/, 'hot work with gas test required needs one')
    console.log('ok - permit window and hot work gas test')

    // Another company -------------------------------------------------------------------------------
    await fails(rpc('forge_permit_submit', { p_organization_id: OTHER_ORG, p_permit_id: wah.id, p_actor_user_id: USER }), /Permit not found/, 'company checked')
    await fails(
      rest('forge_permit_people', '', { method: 'POST', body: { organization_id: OTHER_ORG, permit_id: wah.id, role: 'worker', personnel_id: p3 } }),
      /Permit not found|violates/,
      'people in the permit company'
    )
    console.log('ok - one company')

    // No direct access ------------------------------------------------------------------------------
    for (const table of ['forge_permits', 'forge_confined_spaces', 'forge_permit_people', 'forge_permit_gas_tests', 'forge_permit_entries', 'forge_permit_activity', 'forge_permit_settings']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' is not readable by signed-in users')
    }
    await fails(rpc('forge_permit_issue', { p_organization_id: ORG, p_permit_id: wah.id, p_actor_user_id: USER }, { token: user.access_token }), /permission|denied/i, 'signed-in users cannot call the workflow')
    console.log('ok - signed-in users have no direct access')

    // Permissions -----------------------------------------------------------------------------------
    const permissions = await ok(rest('forge_permission_registry', 'feature_key=eq.work_permits&select=id,permission_key,danger_level'), 'permissions')
    const byKey = Object.fromEntries(permissions.map(row => [row.permission_key, row]))

    for (const key of ['permits.view', 'permits.request', 'permits.approve', 'permits.manage']) assert.ok(byKey[key], key + ' registered')
    assert.equal(byKey['permits.approve'].danger_level, 'sensitive')
    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-administrator')['permits.approve'], 'organization')
    assert.equal(grantsFor('location-administrator')['permits.manage'], 'location')
    assert.equal(grantsFor('supervisor')['permits.request'], 'location')
    assert.equal(grantsFor('supervisor')['permits.approve'], undefined)
    assert.equal(grantsFor('employee')['permits.view'], 'location')
    assert.equal(grantsFor('employee')['permits.request'], undefined)
    const menu = await ok(rest('forge_experience_elements', 'element_key=like.nav.*&category=eq.High-Risk%20Work&select=element_key,route'), 'menu')

    for (const route of ['/permits', '/permits/confined-space', '/permits/hot-work', '/permits/working-at-heights', '/permits/electrical']) {
      assert.ok(menu.some(row => row.route === route), route + ' in the menu')
    }
    console.log('ok - permissions, grants and menu')
  } finally {
    psql(
      // Replica mode skips the guards and also the cascades, so children go first.
      `begin; set local session_replication_role = replica;
       create temp table s18_ids on commit drop as select id from public.forge_permits where organization_id = '${ORG}' and title like '${TAG}%';
       delete from public.forge_permit_entries where permit_id in (select id from s18_ids);
       delete from public.forge_permit_gas_tests where permit_id in (select id from s18_ids);
       delete from public.forge_permit_checks where permit_id in (select id from s18_ids);
       delete from public.forge_permit_people where permit_id in (select id from s18_ids);
       delete from public.forge_permit_links where permit_id in (select id from s18_ids);
       delete from public.forge_permit_notice_log where permit_id in (select id from s18_ids);
       delete from public.forge_permit_activity where permit_id in (select id from s18_ids);
       delete from public.forge_permits where id in (select id from s18_ids);
       delete from public.forge_confined_spaces where organization_id = '${ORG}' and name like '${TAG}%';
       commit;`
    )
  }

  console.log('\nport-s18 permit database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
