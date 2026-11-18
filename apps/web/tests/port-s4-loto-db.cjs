/**
 * Port slice 4 (Industrial 1.0 -> 2.0): Lockout / Tagout database contract checks.
 * Run: node apps/web/tests/port-s4-loto-db.cjs
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const error = new Error(String((data && data.message) || response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

const rpc = (fn, args, options = {}) => request('/rest/v1/rpc/' + fn, { ...options, method: 'POST', body: args })
const insert = async (table, body) => (await request('/rest/v1/' + table, { method: 'POST', body }))[0]
const select = (table, filter) => request(`/rest/v1/${table}?${filter}`)
const patch = (table, filter, body) => request(`/rest/v1/${table}?${filter}`, { method: 'PATCH', body })
const remove = (table, filter) => request(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, { code, pattern } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    if (pattern && !pattern.test(error.message)) throw new Error(`FAIL: ${message} (unexpected message: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const created = { assets: [], procedures: [], personnel: [], courses: [] }
let originalSettings = null

async function makeProcedure(label, { steps = 2 } = {}) {
  const asset = await insert('forge_assets', {
    organization_id: ORG, asset_number: `S4-${RUN}-${label}`, name: `S4 LOTO ${label} ${RUN}`, created_by: ADMIN, updated_by: ADMIN
  })
  created.assets.push(asset.id)
  const number = await rpc('next_forge_loto_number', { p_organization_id: ORG })
  const procedure = await insert('forge_loto_procedures', {
    organization_id: ORG, procedure_number: number, asset_id: asset.id, title: `S4 ${label} ${RUN}`, status: 'draft', created_by: ADMIN, updated_by: ADMIN
  })
  created.procedures.push(procedure.id)
  const source = await insert('forge_loto_energy_sources', {
    organization_id: ORG, procedure_id: procedure.id, energy_type: 'electrical', energy_code: 'E1', source_name: '480V disconnect',
    isolation_location: 'MCC-1', verification_method: 'Try start', sort_order: 1, created_by: ADMIN, updated_by: ADMIN
  })
  for (let i = 1; i <= steps; i += 1) {
    await insert('forge_loto_steps', {
      organization_id: ORG, procedure_id: procedure.id, step_type: 'isolate', title: 'Step ' + i, instructions: 'Do step ' + i, sort_order: i, created_by: ADMIN, updated_by: ADMIN
    })
  }
  return { asset, procedure, source }
}

const approve = id => patch('forge_loto_procedures', 'id=eq.' + id, { status: 'approved', approved_at: new Date().toISOString(), approved_by: ADMIN })

const issue = (procedureId, overrides = {}) =>
  rpc('forge_loto_issue_lockout', {
    p_organization_id: ORG,
    p_procedure_id: procedureId,
    p_actor_user_id: ADMIN,
    p_work_description: 'Replace drive belt',
    p_affected_employees: 'Line 2 operators',
    p_affected_notified: true,
    p_try_start_required: true,
    p_holders: [{ personnel_id: null, holder_name: 'Pat Mechanic', lock_tag_id: 'L-' + RUN }],
    ...overrides
  })

async function main() {
  console.log('LOTO procedures: return for correction')
  const a = await makeProcedure('A')
  await expectFailure(
    rpc('forge_loto_return_for_correction', { p_organization_id: ORG, p_procedure_id: a.procedure.id, p_notes: 'Fix it', p_actor_user_id: ADMIN }),
    'only procedures under review can be returned', { code: '23514' }
  )
  await patch('forge_loto_procedures', 'id=eq.' + a.procedure.id, { status: 'review' })
  await expectFailure(
    rpc('forge_loto_return_for_correction', { p_organization_id: ORG, p_procedure_id: a.procedure.id, p_notes: '  ', p_actor_user_id: ADMIN }),
    'returning needs notes', { code: '23514' }
  )
  await rpc('forge_loto_return_for_correction', { p_organization_id: ORG, p_procedure_id: a.procedure.id, p_notes: 'Add the air valve', p_actor_user_id: ADMIN })
  const [returned] = await select('forge_loto_procedures', 'select=status&id=eq.' + a.procedure.id)
  assert(returned.status === 'draft', 'returned procedure goes back to draft')
  const returns = await select('forge_loto_review_returns', 'select=notes&procedure_id=eq.' + a.procedure.id)
  assert(returns.length === 1 && returns[0].notes === 'Add the air valve', 'the correction request is recorded')

  console.log('Photos')
  const photo = n => ({
    organization_id: ORG, procedure_id: a.procedure.id, storage_path: `${ORG}/${a.procedure.id}/s4-${RUN}-${n}`, file_name: 'p.jpg',
    content_type: 'image/jpeg', byte_size: 1000, created_by: ADMIN
  })
  for (let i = 0; i < 6; i += 1) await insert('forge_loto_photos', photo(i))
  await expectFailure(insert('forge_loto_photos', photo(6)), 'a photo slot holds at most 6', { code: '23514' })
  await insert('forge_loto_photos', { ...photo('src'), energy_source_id: a.source.id })
  const b = await makeProcedure('B')
  await expectFailure(insert('forge_loto_photos', { ...photo('cross'), energy_source_id: b.source.id }), 'energy source must belong to the procedure', { code: '23503' })
  await expectFailure(insert('forge_loto_photos', { ...photo('gif'), content_type: 'image/gif' }), 'only jpeg, png or webp')
  await approve(a.procedure.id)
  await expectFailure(insert('forge_loto_photos', photo('approved')), 'photos are frozen once approved', { code: '23514' })

  console.log('Issuing a lockout')
  await expectFailure(issue(b.procedure.id), 'a draft procedure cannot be locked out', { code: '23514', pattern: /Approve/ })
  await expectFailure(issue(a.procedure.id, { p_work_description: ' ' }), 'work must be described', { code: '23514' })
  await expectFailure(issue(a.procedure.id, { p_affected_notified: false }), 'affected employees must be notified', { code: '23514' })
  await expectFailure(issue(a.procedure.id, { p_holders: [] }), 'at least one lock holder', { code: '23514' })
  await expectFailure(issue(a.procedure.id, { p_holders: [{ holder_name: ' ' }] }), 'every lock needs a holder name', { code: '23514' })
  const lockoutId = await issue(a.procedure.id)
  const [lockout] = await select('forge_loto_applications', 'select=*&id=eq.' + lockoutId)
  assert(/^LKO-\d{6}$/.test(lockout.lockout_number), 'lockout gets an LKO number')
  assert(lockout.status === 'in_progress' && lockout.procedure_snapshot.steps.length === 2, 'lockout is issued with a procedure snapshot')
  assert(lockout.procedure_snapshot.restoration_checks.length >= 1, 'snapshot carries restoration checks')
  await expectFailure(issue(a.procedure.id), 'only one open lockout per procedure', { code: '23514' })

  console.log('Working the lockout')
  const app = { p_organization_id: ORG, p_application_id: lockoutId }
  const verify = (zero = true, tryStart = true) =>
    rpc('forge_loto_verify_lockout', { ...app, p_zero_energy_confirmed: zero, p_try_start_completed: tryStart, p_notes: null, p_actor_user_id: ADMIN })
  const [step1, step2] = lockout.procedure_snapshot.steps
  await expectFailure(rpc('forge_loto_check_step', { ...app, p_step_id: 'nope', p_checked: true, p_actor_user_id: ADMIN }), 'unknown step is refused', { code: '23514' })
  await rpc('forge_loto_check_step', { ...app, p_step_id: step1.id, p_checked: true, p_actor_user_id: ADMIN })
  await expectFailure(verify(), 'verify needs every step checked', { code: '23514', pattern: /1 left/ })
  await rpc('forge_loto_check_step', { ...app, p_step_id: step2.id, p_checked: true, p_actor_user_id: ADMIN })
  await expectFailure(verify(false, true), 'verify needs zero energy confirmed', { code: '23514' })
  await expectFailure(verify(true, false), 'verify needs a try-start when required', { code: '23514' })
  await expectFailure(
    rpc('forge_loto_cancel_lockout', { ...app, p_reason: 'Changed plan', p_actor_user_id: ADMIN }),
    'cannot cancel with a lock on', { code: '23514' }
  )
  await verify()
  await expectFailure(rpc('forge_loto_check_step', { ...app, p_step_id: step1.id, p_checked: false, p_actor_user_id: ADMIN }), 'steps freeze after verify', { code: '23514' })

  const second = await rpc('forge_loto_add_lock', { ...app, p_personnel_id: null, p_holder_name: 'Sam Electrician', p_lock_tag_id: 'L2-' + RUN, p_actor_user_id: ADMIN })
  await expectFailure(
    rpc('forge_loto_complete_lockout', { ...app, p_checks: ['area_clear'], p_notes: null, p_actor_user_id: ADMIN }),
    'every lock off before return to service', { code: '23514' }
  )
  const locks = await select('forge_loto_application_locks', 'select=id,holder_name&application_id=eq.' + lockoutId)
  assert(locks.length === 2, 'group lockout holds two locks')
  for (const lock of locks) {
    await expectFailure(
      rpc('forge_loto_remove_lock', { p_organization_id: ORG, p_lock_id: lock.id, p_note: '', p_actor_user_id: ADMIN }),
      `removing ${lock.holder_name}'s lock needs a note`, { code: '23514', pattern: /someone else/ }
    )
    await rpc('forge_loto_remove_lock', { p_organization_id: ORG, p_lock_id: lock.id, p_note: 'Holder present; supervisor approved', p_actor_user_id: ADMIN })
  }
  await expectFailure(
    rpc('forge_loto_remove_lock', { p_organization_id: ORG, p_lock_id: second, p_note: 'again', p_actor_user_id: ADMIN }),
    'a lock cannot be removed twice', { code: '23514' }
  )
  const checkKeys = lockout.procedure_snapshot.restoration_checks.map(item => item.key)
  await expectFailure(
    rpc('forge_loto_complete_lockout', { ...app, p_checks: [], p_notes: null, p_actor_user_id: ADMIN }),
    'every restoration check is required', { code: '23514' }
  )
  await rpc('forge_loto_complete_lockout', { ...app, p_checks: checkKeys, p_notes: 'Back in service', p_actor_user_id: ADMIN })
  const [closed] = await select('forge_loto_applications', 'select=status,completed_at&id=eq.' + lockoutId)
  assert(closed.status === 'completed' && closed.completed_at, 'equipment returned to service')

  console.log('Own lock and cancel')
  const holder = (await select('forge_personnel', `select=id,auth_user_id,first_name,last_name&organization_id=eq.${ORG}&auth_user_id=not.is.null&limit=1`))[0]
  const ownId = await issue(a.procedure.id, { p_holders: [{ personnel_id: holder.id, holder_name: 'Holder', lock_tag_id: 'OWN-' + RUN }] })
  const [ownLock] = await select('forge_loto_application_locks', 'select=id&application_id=eq.' + ownId)
  await rpc('forge_loto_remove_lock', { p_organization_id: ORG, p_lock_id: ownLock.id, p_note: null, p_actor_user_id: holder.auth_user_id })
  console.log('  ok - holders remove their own lock without a note')
  await expectFailure(
    rpc('forge_loto_cancel_lockout', { p_organization_id: ORG, p_application_id: ownId, p_reason: ' ', p_actor_user_id: ADMIN }),
    'cancel needs a reason', { code: '23514' }
  )
  await rpc('forge_loto_cancel_lockout', { p_organization_id: ORG, p_application_id: ownId, p_reason: 'Work postponed', p_actor_user_id: ADMIN })
  const [canceled] = await select('forge_loto_applications', 'select=status,cancel_reason&id=eq.' + ownId)
  assert(canceled.status === 'canceled' && canceled.cancel_reason === 'Work postponed', 'lockout canceled with its reason')

  console.log('Authorized-employee training')
  originalSettings = (await select('forge_loto_settings', 'select=*&organization_id=eq.' + ORG))[0] || null
  const course = await insert('forge_training_courses', { organization_id: ORG, title: `S4 LOTO Authorized ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  created.courses.push(course.id)
  const writeSettings = body =>
    originalSettings
      ? patch('forge_loto_settings', 'organization_id=eq.' + ORG, body)
      : insert('forge_loto_settings', { organization_id: ORG, ...body })
  await expectFailure(writeSettings({ authorized_course_id: null, require_authorized_training: true }), 'requiring training needs a course')
  await writeSettings({ authorized_course_id: course.id, require_authorized_training: true })
  originalSettings = originalSettings || { authorized_course_id: null, require_authorized_training: false, inserted: true }
  const trainee = await insert('forge_personnel', {
    organization_id: ORG, first_name: 'Lock', last_name: `Holder ${RUN}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN
  })
  created.personnel.push(trainee.id)
  await expectFailure(issue(a.procedure.id), 'typed names are refused when training is required', { code: '23514', pattern: /picked from personnel/ })
  const traineeHolder = [{ personnel_id: trainee.id, holder_name: 'Lock Holder', lock_tag_id: 'T-' + RUN }]
  await expectFailure(issue(a.procedure.id, { p_holders: traineeHolder }), 'untrained people cannot hold a lock', { code: '23514', pattern: /not authorized/ })
  await insert('forge_training_completions', {
    organization_id: ORG, course_id: course.id, personnel_id: trainee.id, completed_at: '2024-01-01', result: 'passed', approval_status: 'approved', expires_at: '2025-01-01', created_by: ADMIN
  })
  await expectFailure(issue(a.procedure.id, { p_holders: traineeHolder }), 'expired training does not count', { code: '23514', pattern: /not authorized/ })
  await insert('forge_training_completions', {
    organization_id: ORG, course_id: course.id, personnel_id: trainee.id, completed_at: new Date().toISOString(), result: 'passed', approval_status: 'approved', created_by: ADMIN
  })
  const trainedId = await issue(a.procedure.id, { p_holders: traineeHolder })
  assert(Boolean(trainedId), 'a trained person can hold a lock')
  const [trainedLock] = await select('forge_loto_application_locks', 'select=id&application_id=eq.' + trainedId)
  await rpc('forge_loto_remove_lock', { p_organization_id: ORG, p_lock_id: trainedLock.id, p_note: 'Test cleanup', p_actor_user_id: ADMIN })
  await rpc('forge_loto_cancel_lockout', { p_organization_id: ORG, p_application_id: trainedId, p_reason: 'Test cleanup', p_actor_user_id: ADMIN })

  console.log('Access')
  const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const { access_token: token } = await tokenResponse.json()
  for (const table of ['forge_loto_procedures', 'forge_loto_applications', 'forge_loto_application_locks', 'forge_loto_photos', 'forge_loto_settings', 'forge_loto_review_returns']) {
    await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
  }
  await expectFailure(rpc('forge_loto_issue_lockout', {
    p_organization_id: ORG, p_procedure_id: a.procedure.id, p_actor_user_id: ADMIN, p_work_description: 'x', p_affected_employees: 'x',
    p_affected_notified: true, p_try_start_required: false, p_holders: [{ holder_name: 'x' }]
  }, { token }), 'members cannot call the lockout RPCs')
  await expectFailure(rpc('forge_resolve_qr_token', { p_token: 'a'.repeat(48) }, { token }), 'members cannot call the QR resolver directly')
}

async function cleanup() {
  for (const id of created.procedures) {
    await remove('forge_loto_application_locks', 'application_id=in.(' + (await select('forge_loto_applications', 'select=id&procedure_id=eq.' + id)).map(row => row.id).join(',') + ')').catch(() => {})
    await remove('forge_loto_applications', 'procedure_id=eq.' + id).catch(() => {})
    await remove('forge_loto_photos', 'procedure_id=eq.' + id).catch(() => {})
    await remove('forge_loto_review_returns', 'procedure_id=eq.' + id).catch(() => {})
    await remove('forge_loto_steps', 'procedure_id=eq.' + id).catch(() => {})
    await remove('forge_loto_energy_sources', 'procedure_id=eq.' + id).catch(() => {})
    await remove('forge_loto_procedures', 'id=eq.' + id).catch(error => console.log('  cleanup: ' + error.message))
  }
  if (originalSettings && originalSettings.inserted) {
    await remove('forge_loto_settings', 'organization_id=eq.' + ORG).catch(() => {})
  } else if (originalSettings) {
    await patch('forge_loto_settings', 'organization_id=eq.' + ORG, {
      authorized_course_id: originalSettings.authorized_course_id, require_authorized_training: originalSettings.require_authorized_training
    }).catch(() => {})
  } else {
    await remove('forge_loto_settings', 'organization_id=eq.' + ORG).catch(() => {})
  }
  for (const id of created.personnel) {
    await remove('forge_training_completions', 'personnel_id=eq.' + id).catch(() => {})
    await remove('forge_personnel', 'id=eq.' + id).catch(() => {})
  }
  for (const id of created.courses) await remove('forge_training_courses', 'id=eq.' + id).catch(() => {})
  for (const id of created.assets) await remove('forge_assets', 'id=eq.' + id).catch(() => {})
}

main()
  .then(() => cleanup())
  .then(() => console.log('\nport-s4-loto-db: all checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
