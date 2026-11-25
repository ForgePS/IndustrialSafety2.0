/**
 * Port slice 19 (forklifts, OSHA 1910.178): database contract checks.
 * Trucks as assets with a profile; operator authorization (dates, classes, evaluator, self, training, expiry,
 * re-evaluation, suspend / reinstate / revoke / refresher); pre-shift checks (authorized operator, every item once,
 * N/A and defect notes, hour meter); critical defects take the truck out of service and keep it there until closed;
 * non-critical defects don't; append-only checks and history; workflow-only defects and operators; built-in
 * checklist fixed; one company for every link; no direct access for signed-in users; permissions, grants and menu.
 * Run: node apps/web/tests/port-s19-forklifts-db.cjs   (needs Docker for the local database)
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
const USER_PERSONNEL = '20000000-0000-4000-8000-000000000600'
const RUN = Date.now().toString().slice(-7)
const TAG = `DB-S19 ${RUN}`

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

  assert.ok(result.status >= 400, label + ' should fail but returned ' + result.status + ' ' + JSON.stringify(result.data))
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
const patch = (table, query, body) => rest(table, query, { method: 'PATCH', body })

/** Run SQL as supabase_admin (only it may switch triggers off) in the local database (test setup and clean-up only). */
const psql = sql => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })

const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10)

const createTruck = (org, data, actor = ADMIN) => ok(rpc('forge_forklift_create', { p_organization_id: org, p_actor_user_id: actor, p_data: data }), 'create truck ' + (data.name || data.asset_id))

const authorize = (personnelId, extra = {}) =>
  rpc('forge_forklift_authorize', {
    p_organization_id: ORG,
    p_actor_user_id: ADMIN,
    p_personnel_id: personnelId,
    p_truck_classes: ['I', 'IV'],
    p_training_completed_on: isoDay(-10),
    p_evaluated_on: isoDay(-9),
    p_evaluator_name: 'Eval Uator',
    p_evaluator_personnel_id: null,
    p_evaluation_notes: null,
    p_restrictions: null,
    ...extra
  })

const setStatus = (operatorId, action, reason, extra = {}) =>
  rpc('forge_forklift_set_operator_status', { p_organization_id: ORG, p_operator_id: operatorId, p_actor_user_id: ADMIN, p_action: action, p_reason: reason, p_incident_id: null, ...extra })

const problem = (personnelId, truckClass) => ok(rpc('forge_forklift_operator_problem', { p_organization_id: ORG, p_personnel_id: personnelId, p_truck_class: truckClass }), 'operator problem')

async function itemsFor(powerSource) {
  const rows = await ok(rest('forge_forklift_check_items', `or=(organization_id.is.null,organization_id.eq.${ORG})&archived_at=is.null&select=id,label,power_sources,critical,allow_na,organization_id`), 'items')

  return rows.filter(row => !row.power_sources || row.power_sources.includes(powerSource))
}

/** Answers for every item: all OK, with overrides by label fragment. */
const answersFor = (items, overrides = {}) =>
  items.map(item => {
    const key = Object.keys(overrides).find(fragment => item.label.includes(fragment))

    return key ? { item_id: item.id, ...overrides[key] } : { item_id: item.id, answer: 'ok' }
  })

const check = (truckId, operatorId, answers, extra = {}) =>
  rpc('forge_forklift_record_check', {
    p_organization_id: ORG,
    p_forklift_id: truckId,
    p_operator_personnel_id: operatorId,
    p_actor_user_id: ADMIN,
    p_hour_meter: null,
    p_answers: answers,
    p_notes: null,
    p_source: 'app',
    p_qr_code_id: null,
    ...extra
  })

const assetOf = async truckId => (await ok(rest('forge_forklifts', `id=eq.${truckId}&select=asset_id,forge_assets(status)`), 'truck'))[0]

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error('Set the Supabase URL and keys (see docs/LOCAL_DEVELOPMENT.md).')

  const user = await signIn('user@forge2.local')
  const course = (await ok(rest('forge_training_courses', `organization_id=eq.${ORG}&is_active=eq.true&select=id,title&limit=1`), 'course'))[0]
  const incident = (await ok(rest('forge_incidents', `organization_id=eq.${ORG}&select=id&limit=1`), 'incident'))[0]

  // Our own people, so nothing collides with other tests' operators (one operator row per person).
  const person = async first =>
    insert('forge_personnel', { organization_id: ORG, first_name: first, last_name: TAG, employment_status: 'active', location_id: LOCATION }, 'personnel ' + first)

  const [opA, opB, evaluator, opC] = [await person('Ana'), await person('Ben'), await person('Eve'), await person('Cy')]

  try {
    // -----------------------------------------------------------------------
    // Trucks
    // -----------------------------------------------------------------------
    const truckId = await createTruck(ORG, { name: `${TAG} Sit-down 1`, location_id: LOCATION, truck_class: 'IV', truck_type: 'sit_down_counterbalance', power_source: 'lpg', rated_capacity_lb: 5000, attachments: 'Side shifter' })
    const truck = (await ok(rest('forge_forklifts', `id=eq.${truckId}&select=*,forge_assets(asset_number,asset_type,status,location_id,name)`), 'truck'))[0]

    assert.equal(truck.forge_assets.asset_type, 'forklift')
    assert.equal(truck.forge_assets.status, 'active')
    assert.equal(truck.forge_assets.location_id, LOCATION)
    assert.match(truck.forge_assets.asset_number, /\S/)

    await fails(rpc('forge_forklift_create', { p_organization_id: ORG, p_actor_user_id: ADMIN, p_data: { name: '', location_id: LOCATION, truck_class: 'I', power_source: 'electric' } }), /name or unit number/, 'no name')
    await fails(rpc('forge_forklift_create', { p_organization_id: ORG, p_actor_user_id: ADMIN, p_data: { name: `${TAG} x`, location_id: OTHER_LOCATION, truck_class: 'I', power_source: 'electric' } }), /location/, 'other company location')
    await fails(rpc('forge_forklift_create', { p_organization_id: ORG, p_actor_user_id: ADMIN, p_data: { name: `${TAG} x`, location_id: LOCATION, truck_class: 'IX', power_source: 'electric' } }), /check constraint|truck_class/, 'bad class')

    // Existing equipment becomes a forklift; twice is refused; retired is refused.
    const asset = await insert('forge_assets', { organization_id: ORG, asset_number: `${TAG}-EQ`, asset_type: 'equipment', name: `${TAG} Walkie`, location_id: LOCATION, status: 'active' }, 'asset')
    const walkieId = await createTruck(ORG, { asset_id: asset.id, truck_class: 'III', truck_type: 'pallet_walkie', power_source: 'electric' })

    assert.equal((await ok(rest('forge_assets', `id=eq.${asset.id}&select=asset_type`), 'asset type'))[0].asset_type, 'forklift')
    await fails(rpc('forge_forklift_create', { p_organization_id: ORG, p_actor_user_id: ADMIN, p_data: { asset_id: asset.id, truck_class: 'III', power_source: 'electric' } }), /already a forklift/, 'twice')
    await fails(rpc('forge_forklift_create', { p_organization_id: OTHER_ORG, p_actor_user_id: ADMIN, p_data: { asset_id: asset.id, truck_class: 'III', power_source: 'electric' } }), /not found/, 'other company asset')
    await fails(patch('forge_forklifts', `id=eq.${walkieId}`, { asset_id: truck.asset_id }), /can't move/, 'profile moves asset')
    console.log('ok - trucks: new, from existing equipment, company and class checks')

    // -----------------------------------------------------------------------
    // Operators
    // -----------------------------------------------------------------------
    await fails(authorize(opA.id, { p_truck_classes: [] }), /truck classes/, 'no classes')
    await fails(authorize(opA.id, { p_evaluated_on: isoDay(1) }), /future/, 'future evaluation')
    await fails(authorize(opA.id, { p_training_completed_on: isoDay(-5), p_evaluated_on: isoDay(-6) }), /before the training/, 'evaluation before training')
    await fails(authorize(opA.id, { p_training_completed_on: isoDay(-1200), p_evaluated_on: isoDay(-1100) }), /more than 36 months old/, 'stale evaluation')
    await fails(authorize(opA.id, { p_evaluator_name: ' ' }), /evaluated the operator/, 'no evaluator')
    await fails(authorize(opA.id, { p_evaluator_personnel_id: opA.id }), /evaluate themselves/, 'self evaluation')
    await fails(authorize(USER_PERSONNEL, { p_actor_user_id: USER }), /authorize yourself/, 'self authorization')
    await fails(authorize(opA.id, { p_truck_classes: ['IX'] }), /Unknown truck class/, 'unknown class')

    const evaluatedOn = isoDay(-9)
    const operatorA = await ok(authorize(opA.id, { p_evaluator_personnel_id: evaluator.id, p_evaluated_on: evaluatedOn }), 'authorize A')
    let rowA = (await ok(rest('forge_forklift_operators', `id=eq.${operatorA}&select=*`), 'operator A'))[0]
    const expected = new Date(evaluatedOn + 'T00:00:00Z')

    expected.setUTCMonth(expected.getUTCMonth() + 36)
    assert.equal(rowA.expires_on, expected.toISOString().slice(0, 10), 'expires 36 months after the evaluation')
    assert.deepEqual(rowA.truck_classes, ['I', 'IV'])
    assert.equal(await problem(opA.id, 'IV'), null)
    assert.match(await problem(opA.id, 'II'), /not authorized for Class II/)
    assert.match(await problem(opB.id, 'I'), /not an authorized forklift operator/)

    // Suspend / reinstate / refresher / re-evaluate / revoke.
    await fails(setStatus(operatorA, 'suspend', ''), /reason/, 'suspend without reason')
    await ok(setStatus(operatorA, 'suspend', 'Seen speeding'), 'suspend')
    assert.match(await problem(opA.id, 'I'), /suspended/)
    await fails(setStatus(operatorA, 'suspend', 'again'), /Only an authorized operator/, 'suspend twice')
    await ok(setStatus(operatorA, 'reinstate', null), 'reinstate')
    assert.equal(await problem(opA.id, 'I'), null)
    await ok(setStatus(operatorA, 'require_refresher', 'Involved in a near-miss incident', { p_incident_id: incident?.id || null }), 'refresher')
    assert.match(await problem(opA.id, 'I'), /refresher training/)
    await ok(authorize(opA.id, { p_truck_classes: ['I', 'IV', 'V'], p_evaluator_personnel_id: evaluator.id }), 're-evaluate')
    rowA = (await ok(rest('forge_forklift_operators', `id=eq.${operatorA}&select=*`), 'operator A'))[0]
    assert.equal(rowA.refresher_required, false, 'a new evaluation clears the refresher')
    assert.equal(await problem(opA.id, 'V'), null)

    const operatorB = await ok(authorize(opB.id, { p_truck_classes: ['III'] }), 'authorize B')

    await ok(setStatus(operatorB, 'revoke', 'Left the forklift program'), 'revoke')
    assert.match(await problem(opB.id, 'III'), /revoked/)
    await fails(setStatus(operatorB, 'reinstate', null), /Only a suspended operator/, 'reinstate revoked')

    // Expired: past expires_on (set directly, as time would).
    const operatorC = await ok(authorize(opC.id, { p_truck_classes: ['IV'] }), 'authorize C')

    psql(`begin; set local session_replication_role = replica; update public.forge_forklift_operators set expires_on = current_date - 1 where id = '${operatorC}'; commit;`)
    assert.match(await problem(opC.id, 'IV'), /evaluation expired/)

    // Required training: no current completion -> refused for authorize and for operating.
    if (course) {
      await insert('forge_forklift_settings', { organization_id: ORG, require_training: true, training_course_id: course.id }, 'settings')
      assert.match(await problem(opA.id, 'I'), new RegExp('no current ' + course.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' training'))
      await fails(authorize(opA.id), /no current .* training/, 'authorize without training')
      await insert('forge_training_completions', { organization_id: ORG, course_id: course.id, personnel_id: opA.id, completed_at: new Date().toISOString(), result: 'completed', approval_status: 'approved', notes: TAG }, 'completion')
      assert.equal(await problem(opA.id, 'I'), null)
      psql(`delete from public.forge_forklift_settings where organization_id = '${ORG}';`)
    }
    console.log('ok - operators: validation, expiry, class, suspend / reinstate / refresher / re-evaluate / revoke, expired, training')

    // -----------------------------------------------------------------------
    // Pre-shift checks
    // -----------------------------------------------------------------------
    const lpgItems = await itemsFor('lpg')
    const allOk = answersFor(lpgItems)

    assert.ok(lpgItems.some(item => item.label.startsWith('LPG cylinder')), 'LPG item applies to an LPG truck')
    assert.ok(!lpgItems.some(item => item.label.startsWith('Battery')), 'battery item does not')

    await fails(check(truckId, opB.id, allOk), /revoked/, 'revoked operator')
    await fails(check(truckId, opC.id, allOk), /expired/, 'expired operator')
    await fails(check(truckId, null, allOk), /Name the operator/, 'no operator')
    await fails(check(truckId, opA.id, allOk.slice(1)), /Answer every item/, 'missing item')
    await fails(check(truckId, opA.id, [...allOk, allOk[0]]), /more than once/, 'duplicate item')
    await fails(check(truckId, opA.id, answersFor(lpgItems, { Horn: { answer: 'na' } })), /can't be marked N\/A/, 'N/A not allowed')
    await fails(check(truckId, opA.id, answersFor(lpgItems, { Horn: { answer: 'defect' } })), /Describe the defect/, 'defect without note')
    await fails(check(truckId, opA.id, [...allOk, { item_id: '00000000-0000-0000-0000-000000000000', answer: 'ok' }]), /checklist changed/, 'unknown item')
    await fails(check(walkieId, opA.id, answersFor(await itemsFor('electric'))), /not authorized for Class III/, 'class not covered')

    // Pass with N/A where allowed and an hour meter reading.
    const pass = await ok(check(truckId, opA.id, answersFor(lpgItems, { 'Fire extinguisher': { answer: 'na', note: 'Not fitted' } }), { p_hour_meter: 1200.5 }), 'pass')

    assert.equal(pass.result, 'pass')
    assert.equal(pass.out_of_service, false)
    const readings = await ok(rest('forge_asset_meter_readings', `asset_id=eq.${truck.asset_id}&meter_type=eq.hours&select=reading`), 'readings')

    assert.deepEqual(readings.map(row => Number(row.reading)), [1200.5])
    await fails(check(truckId, opA.id, allOk, { p_hour_meter: 1100 }), /lower than the last reading/, 'lower hour meter')

    // Non-critical defect: fails the check, stays in service, defect open.
    const minor = await ok(check(truckId, opA.id, answersFor(lpgItems, { 'Warning decals': { answer: 'defect', note: 'Capacity decal peeling' } })), 'minor defect')

    assert.equal(minor.result, 'fail')
    assert.equal(minor.out_of_service, false)
    assert.equal((await assetOf(truckId)).forge_assets.status, 'active')

    // Critical defect: out of service, with status history and a defect row.
    const major = await ok(check(truckId, opA.id, answersFor(lpgItems, { Horn: { answer: 'defect', note: 'Horn dead' }, 'Parking brake': { answer: 'defect', note: 'Rolls on slope' } })), 'critical defect')

    assert.equal(major.out_of_service, true)
    assert.equal(major.defects, 2)
    assert.equal((await assetOf(truckId)).forge_assets.status, 'out_of_service')
    const history = await ok(rest('forge_asset_status_history', `asset_id=eq.${truck.asset_id}&select=to_status,source,reason,related_record_id&order=changed_at.desc&limit=1`), 'history')

    assert.equal(history[0].source, 'forklift_check')
    assert.equal(history[0].related_record_id, major.check_id)
    assert.match(history[0].reason, /Horn works; Parking brake holds/)

    await fails(check(truckId, opA.id, allOk), /out of service/, 'check an out-of-service truck')

    // Back in service is refused by every route while a critical defect is open.
    await fails(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: null }), /open critical defect/, 'return with open defect')
    await fails(patch('forge_assets', `id=eq.${truck.asset_id}`, { status: 'active' }), /open critical defect/, 'asset edit with open defect')
    await fails(
      rpc('forge_set_asset_service_status', { p_organization_id: ORG, p_asset_id: truck.asset_id, p_status: 'active', p_reason: 'scan', p_notes: null, p_source: 'qr_scan', p_qr_code_id: null, p_actor_user_id: ADMIN, p_actor_personnel_id: null, p_actor_name: null, p_related_record_type: null, p_related_record_id: null }),
      /open critical defect/,
      'scan return with open defect'
    )

    const defects = await ok(rest('forge_forklift_defects', `forklift_id=eq.${truckId}&status=eq.open&select=id,item_label,critical&order=reported_at`), 'defects')

    assert.equal(defects.length, 3)
    const resolve = (defect, status, note, record = false) => rpc('forge_forklift_resolve_defect', { p_organization_id: ORG, p_defect_id: defect.id, p_actor_user_id: ADMIN, p_status: status, p_note: note, p_record_repair: record })

    await fails(resolve(defects[1], 'repaired', ''), /what was repaired/, 'repair without note')
    await fails(resolve(defects[1], 'open', 'x'), /repaired or not a defect/, 'bad status')
    await ok(resolve(defects[1], 'repaired', 'Replaced horn button', true), 'repair horn')
    await fails(resolve(defects[1], 'repaired', 'again'), /already closed/, 'close twice')
    await fails(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: null }), /Parking brake/, 'one critical still open')
    await ok(resolve(defects[2], 'not_a_defect', 'Brake holds; slope was wet'), 'not a defect')
    await ok(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: 'Repaired' }), 'return to service')
    assert.equal((await assetOf(truckId)).forge_assets.status, 'active')
    const maintenance = await ok(rest('forge_asset_maintenance', `asset_id=eq.${truck.asset_id}&select=maintenance_type,status,description`), 'maintenance')

    assert.equal(maintenance.length, 1)
    assert.equal(maintenance[0].maintenance_type, 'corrective')
    assert.match(maintenance[0].description, /Horn works/)
    console.log('ok - checks: operator, every item once, N/A, notes, hour meter, minor vs critical defects, out of service until closed')

    // Reported defects, manual out of service, setting off.
    await ok(rpc('forge_forklift_take_out_of_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_reason: 'Annual service' }), 'manual out of service')
    await fails(rpc('forge_forklift_take_out_of_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_reason: 'Again' }), /Only a forklift in service/, 'out of service twice')
    await fails(rpc('forge_forklift_take_out_of_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_reason: ' ' }), /Say why/, 'no reason')
    await ok(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: null }), 'back after service')
    await fails(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: null }), /not out of service/, 'return when in service')

    const reportDefect = critical =>
      rpc('forge_forklift_report_defect', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_actor_personnel_id: null, p_actor_name: 'Admin', p_label: 'Mast', p_description: 'Chain slack', p_critical: critical })

    await fails(rpc('forge_forklift_report_defect', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_actor_personnel_id: null, p_actor_name: null, p_label: 'Mast', p_description: '', p_critical: true }), /Describe/, 'no description')
    const reported = await ok(reportDefect(true), 'report critical')

    assert.equal((await assetOf(truckId)).forge_assets.status, 'out_of_service')
    await ok(resolve({ id: reported }, 'repaired', 'Adjusted chains'), 'repair mast')
    await ok(rpc('forge_forklift_return_to_service', { p_organization_id: ORG, p_forklift_id: truckId, p_actor_user_id: ADMIN, p_notes: null }), 'back after mast')

    await insert('forge_forklift_settings', { organization_id: ORG, critical_defect_out_of_service: false }, 'settings off')
    const off = await ok(check(truckId, opA.id, answersFor(lpgItems, { Steering: { answer: 'defect', note: 'Stiff' } })), 'critical with setting off')

    assert.equal(off.out_of_service, false)
    assert.equal((await assetOf(truckId)).forge_assets.status, 'active')
    psql(`delete from public.forge_forklift_settings where organization_id = '${ORG}';`)

    // Operators can be required to be authorized or not.
    await insert('forge_forklift_settings', { organization_id: ORG, require_authorized_operator: false }, 'settings no auth')
    const steering = (await ok(rest('forge_forklift_defects', `forklift_id=eq.${truckId}&status=eq.open&select=id`), 'open'))[0]

    await ok(resolve(steering, 'repaired', 'Steering serviced'), 'repair steering')
    await ok(check(truckId, opB.id, allOk), 'revoked operator allowed when the setting is off')
    psql(`delete from public.forge_forklift_settings where organization_id = '${ORG}';`)
    console.log('ok - reported defects, manual out of service, settings')

    // -----------------------------------------------------------------------
    // Company checklist items
    // -----------------------------------------------------------------------
    const builtIn = lpgItems.find(item => item.organization_id === null)

    await fails(patch('forge_forklift_check_items', `id=eq.${builtIn.id}`, { label: 'Changed' }), /Built-in/, 'edit built-in')
    await fails(rest('forge_forklift_check_items', `id=eq.${builtIn.id}`, { method: 'DELETE' }), /Archive/, 'delete built-in')
    await fails(rest('forge_forklift_check_items', '', { method: 'POST', body: { organization_id: null, label: 'x' } }), /Built-in/, 'insert built-in')
    const own = await insert('forge_forklift_check_items', { organization_id: ORG, section: 'operational', label: `${TAG} Blue light works`, critical: false, sort_order: 300 }, 'company item')

    await fails(check(truckId, opA.id, allOk), /Blue light works/, 'company item must be answered')
    await ok(check(truckId, opA.id, [...allOk, { item_id: own.id, answer: 'ok' }]), 'with company item')
    await ok(patch('forge_forklift_check_items', `id=eq.${own.id}`, { archived_at: new Date().toISOString() }), 'archive item')
    await ok(check(truckId, opA.id, allOk), 'archived item not needed')
    console.log('ok - checklist: built-ins fixed, company items required until archived')

    // -----------------------------------------------------------------------
    // Guards and company boundaries
    // -----------------------------------------------------------------------
    const aCheck = (await ok(rest('forge_forklift_checks', `forklift_id=eq.${truckId}&select=*&limit=1`), 'a check'))[0]

    await fails(patch('forge_forklift_checks', `id=eq.${aCheck.id}`, { result: 'pass' }), /can't be changed/, 'edit check')
    await fails(rest('forge_forklift_checks', `id=eq.${aCheck.id}`, { method: 'DELETE' }), /can't be deleted/, 'delete check')
    await fails(
      rest('forge_forklift_checks', '', { method: 'POST', body: { organization_id: ORG, forklift_id: truckId, asset_id: truck.asset_id, operator_name: 'x', result: 'pass', answers: [] } }),
      /workflow/,
      'insert check directly'
    )
    await fails(rest('forge_forklift_defects', '', { method: 'POST', body: { organization_id: ORG, forklift_id: truckId, item_label: 'x', description: 'y' } }), /workflow/, 'insert defect directly')
    await fails(patch('forge_forklift_defects', `forklift_id=eq.${truckId}`, { status: 'repaired', resolved_at: new Date().toISOString() }), /workflow/, 'close defect directly')
    await fails(patch('forge_forklift_operators', `id=eq.${operatorB}`, { status: 'authorized' }), /workflow/, 'reinstate directly')
    await fails(rest('forge_forklift_operators', `id=eq.${operatorB}`, { method: 'DELETE' }), /can't be deleted/, 'delete operator')
    await fails(patch('forge_forklift_activity', `operator_id=eq.${operatorA}`, { message: 'x' }), /history can't be changed/, 'edit history')

    const otherTruck = await createTruck(OTHER_ORG, { name: `${TAG} Other`, location_id: OTHER_LOCATION, truck_class: 'I', power_source: 'electric' })

    if (incident) {
      await insert('forge_forklift_incident_links', { organization_id: ORG, incident_id: incident.id, forklift_id: truckId, operator_id: operatorA, note: TAG }, 'incident link')
      await fails(rest('forge_forklift_incident_links', '', { method: 'POST', body: { organization_id: ORG, incident_id: incident.id, forklift_id: otherTruck } }), /one company/, 'link other company truck')
    }
    await fails(check(otherTruck, opA.id, allOk), /not found/, 'check other company truck under this company')

    const activity = await ok(rest('forge_forklift_activity', `operator_id=eq.${operatorA}&select=action&order=created_at`), 'activity')

    assert.deepEqual(activity.map(row => row.action), ['authorized', 'suspended', 'reinstated', 'refresher_required', 'authorized'])
    console.log('ok - guards: append-only checks and history, workflow-only defects and operators, one company')

    // -----------------------------------------------------------------------
    // No direct access for signed-in users
    // -----------------------------------------------------------------------
    for (const table of ['forge_forklifts', 'forge_forklift_checks', 'forge_forklift_defects', 'forge_forklift_operators', 'forge_forklift_settings', 'forge_forklift_check_items']) {
      const result = await rest(table, 'select=id&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' is closed to signed-in users')
    }
    await fails(rpc('forge_forklift_set_operator_status', { p_organization_id: ORG, p_operator_id: operatorA, p_actor_user_id: USER, p_action: 'suspend', p_reason: 'x', p_incident_id: null }, { token: user.access_token }), /permission denied|not find/, 'rpc as user')
    console.log('ok - no direct access for signed-in users')

    // -----------------------------------------------------------------------
    // Permissions, grants and menu
    // -----------------------------------------------------------------------
    const permissions = await ok(rest('forge_permission_registry', 'feature_key=eq.forklifts&select=id,permission_key'), 'permissions')

    assert.deepEqual(permissions.map(row => row.permission_key).sort(), ['forklifts.authorize', 'forklifts.check', 'forklifts.manage', 'forklifts.view'])
    const roles = await ok(rest('forge_tenant_roles', 'select=id,role_key'), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-administrator')['forklifts.authorize'], 'organization')
    assert.equal(grantsFor('location-administrator')['forklifts.manage'], 'location')
    assert.equal(grantsFor('supervisor')['forklifts.check'], 'location')
    assert.equal(grantsFor('supervisor')['forklifts.manage'], undefined)
    assert.equal(grantsFor('employee')['forklifts.check'], 'location')
    assert.equal(grantsFor('employee')['forklifts.authorize'], undefined)
    assert.equal(grantsFor('read-only')['forklifts.view'], 'organization')
    assert.equal(grantsFor('read-only')['forklifts.check'], undefined)
    const menu = await ok(rest('forge_experience_elements', 'element_key=eq.nav.forklifts&select=route,category'), 'menu')

    assert.deepEqual(menu, [{ route: '/forklifts', category: 'Equipment & Operations' }])
    console.log('ok - permissions, grants and menu')
  } finally {
    psql(
      // Replica mode skips the guards and also the cascades, so children go first.
      `begin; set local session_replication_role = replica;
       create temp table s19_trucks on commit drop as
         select f.id, f.asset_id from public.forge_forklifts f join public.forge_assets a on a.id = f.asset_id where a.name like '${TAG}%';
       create temp table s19_people on commit drop as select id from public.forge_personnel where organization_id = '${ORG}' and last_name = '${TAG}';
       create temp table s19_ops on commit drop as select id from public.forge_forklift_operators where personnel_id in (select id from s19_people);
       delete from public.forge_forklift_incident_links where forklift_id in (select id from s19_trucks) or operator_id in (select id from s19_ops);
       delete from public.forge_forklift_defects where forklift_id in (select id from s19_trucks);
       delete from public.forge_forklift_checks where forklift_id in (select id from s19_trucks);
       delete from public.forge_forklift_activity where forklift_id in (select id from s19_trucks) or operator_id in (select id from s19_ops);
       delete from public.forge_forklift_notice_log where operator_id in (select id from s19_ops);
       delete from public.forge_forklift_operators where id in (select id from s19_ops);
       delete from public.forge_forklifts where id in (select id from s19_trucks);
       delete from public.forge_asset_meter_readings where asset_id in (select asset_id from s19_trucks);
       delete from public.forge_asset_maintenance where asset_id in (select asset_id from s19_trucks);
       delete from public.forge_asset_status_history where asset_id in (select asset_id from s19_trucks);
       delete from public.forge_asset_activity where asset_id in (select asset_id from s19_trucks);
       delete from public.forge_assets where id in (select asset_id from s19_trucks);
       delete from public.forge_forklift_check_items where organization_id = '${ORG}' and label like '${TAG}%';
       delete from public.forge_training_completions where notes = '${TAG}';
       delete from public.forge_personnel_employment_events where personnel_id in (select id from s19_people);
       delete from public.forge_personnel where id in (select id from s19_people);
       commit;`
    )
  }

  console.log('\nport-s19 forklift database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
