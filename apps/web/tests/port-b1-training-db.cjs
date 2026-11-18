/**
 * Batch 1 training parity (Industrial 1.0 -> 2.0): database contract checks for managing training.
 * Cancelled assignments, archived and edited training records, LOTO authorization, access.
 * Run: node apps/web/tests/port-b1-training-db.cjs
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
const patch = async (table, filter, body) => (await request(`/rest/v1/${table}?${filter}`, { method: 'PATCH', body }))[0]
const remove = (table, filter) => request(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })
const one = async (table, filter) => (await select(table, filter))[0]

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

const created = { courses: [], people: [] }

const course = async title => {
  const row = await insert('forge_training_courses', { organization_id: ORG, title: `${title} ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  created.courses.push(row.id)
  return row
}

let tick = 0
const assignment = (courseId, personnelId, extra = {}) =>
  insert('forge_training_assignments', {
    organization_id: ORG, course_id: courseId, personnel_id: personnelId, status: 'assigned', assigned_by: ADMIN, assigned_at: new Date(Date.now() - (tick += 1000)).toISOString(), ...extra
  })

const completion = (courseId, personnelId, extra = {}) =>
  insert('forge_training_completions', {
    organization_id: ORG, course_id: courseId, personnel_id: personnelId, completed_at: new Date().toISOString(), result: 'passed', approval_status: 'approved', created_by: ADMIN, ...extra
  })

const cancel = (assignmentId, reason = null, options = {}) =>
  rpc('forge_cancel_training_assignment', { p_organization_id: ORG, p_assignment_id: assignmentId, p_actor_user_id: ADMIN, p_reason: reason }, options)

async function main() {
  console.log('Batch 1: training management DB checks')
  const lockout = await course('B1 Lockout')
  const forklift = await course('B1 Forklift')
  const learner = await insert('forge_personnel', { organization_id: ORG, first_name: 'Robin', last_name: `B1 ${RUN}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN })
  created.people.push(learner.id)

  console.log('cancelling assignments')
  const open = await assignment(lockout.id, learner.id, { due_date: '2026-12-01' })
  const attempt = await insert('forge_training_attempts', { organization_id: ORG, assignment_id: open.id, course_id: lockout.id, personnel_id: learner.id, attempt_number: 1, channel: 'online' })
  await expectFailure(assignment(lockout.id, learner.id, { status: 'deleted' }), 'assignment status comes from the fixed list', { code: '23514' })
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + open.id, { status: 'canceled' }), 'canceled needs a cancellation time', { code: '23514' })
  const canceled = await cancel(open.id, '  Moved to another crew ')
  assert(
    canceled.status === 'canceled' && canceled.canceled_at && canceled.canceled_by === ADMIN && canceled.cancel_reason === 'Moved to another crew',
    'an open assignment is canceled with who, when and why'
  )
  const abandoned = await one('forge_training_attempts', 'select=status&id=eq.' + attempt.id)
  assert(abandoned.status === 'abandoned', 'its open quiz attempt is abandoned')
  await expectFailure(cancel(open.id), 'an assignment cannot be canceled twice', { code: '23514', pattern: /already canceled/ })
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + open.id, { status: 'assigned', canceled_at: null }), 'a canceled assignment cannot be reopened', { code: '23514' })
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + open.id, { due_date: '2027-01-01' }), 'a canceled assignment cannot be edited', { code: '23514' })
  await expectFailure(
    rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: open.id, p_channel: 'online', p_actor_user_id: ADMIN }),
    'a canceled assignment cannot start a quiz',
    { code: '23514' }
  )
  await expectFailure(
    rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: open.id, p_percent: 90, p_completed_on: '2026-11-01', p_actor_user_id: ADMIN }),
    'a canceled assignment takes no paper result',
    { code: '23514' }
  )
  const done = await assignment(lockout.id, learner.id, { status: 'completed' })
  await expectFailure(cancel(done.id), 'a completed assignment cannot be canceled', { code: '23514', pattern: /completed/ })
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + done.id, { status: 'canceled', canceled_at: new Date().toISOString() }), 'nor by a direct update', { code: '23514' })
  const edited = await patch('forge_training_assignments', 'id=eq.' + (await assignment(forklift.id, learner.id)).id, { due_date: '2027-02-01', notes: 'Bring gloves' })
  assert(edited.due_date === '2027-02-01' && edited.notes === 'Bring gloves', 'an open assignment can change its due date and notes')
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + edited.id, { course_id: lockout.id }), 'an assignment cannot move to another course', { code: '23514' })
  await expectFailure(patch('forge_training_assignments', 'id=eq.' + edited.id, { notes: 'x'.repeat(2001) }), 'notes are capped at 2000 characters', { code: '23514' })
  await expectFailure(cancel('00000000-0000-4000-8000-000000000999'), 'an unknown assignment is not found', { code: 'P0002' })
  const status = await one('forge_lookup_options', 'select=option_key,label,forge_lookup_definitions!inner(lookup_key)&option_key=eq.canceled&forge_lookup_definitions.lookup_key=eq.training.status')
  assert(status && status.label === 'Canceled', 'the training status list has Canceled')

  console.log('training records')
  const manual = await completion(lockout.id, learner.id, { source: 'manual', score: 80, certificate_number: `CERT-B1-${RUN}` })
  const updated = await patch('forge_training_completions', 'id=eq.' + manual.id, { score: 92.5, instructor: 'Pat', notes: 'Rechecked', expires_at: '2027-11-01' })
  assert(Number(updated.score) === 92.5 && updated.instructor === 'Pat' && updated.approval_status === 'approved', 'a manual record edits score, instructor, notes and expiry; approval stays')
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { certificate_number: 'CERT-OTHER' }), 'a certificate number cannot be renumbered', { code: '23514', pattern: /certificate number/ })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { score: 101 }), 'scores are 0 to 100', { code: '23514' })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { expires_at: '2000-01-01' }), 'expiry cannot be before completion', { code: '23514' })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { course_id: forklift.id }), 'a record cannot move to another course', { code: '23514' })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { source: 'online' }), 'how a record was earned cannot change', { code: '23514' })
  const graded = await completion(forklift.id, learner.id, { source: 'online', score: 85 })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + graded.id, { score: 100 }), 'a graded quiz keeps its score', { code: '23514', pattern: /graded/ })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + graded.id, { completed_at: '2026-01-01T00:00:00Z' }), 'a graded quiz keeps its date', { code: '23514' })
  const gradedNote = await patch('forge_training_completions', 'id=eq.' + graded.id, { notes: 'Card seen', instructor: 'Lee' })
  assert(gradedNote.notes === 'Card seen', 'a graded record still takes notes and instructor')

  console.log('archiving and LOTO authorization')
  const authorized = () => rpc('forge_loto_person_authorized', { p_organization_id: ORG, p_personnel_id: learner.id, p_course_id: lockout.id })
  assert((await authorized()) === true, 'a current approved record authorizes for LOTO')
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { archived_at: new Date().toISOString() }), 'archiving needs a reason', { code: '23514' })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { archive_reason: 'oops' }), 'a reason alone does not archive', { code: '23514' })
  const archived = await patch('forge_training_completions', 'id=eq.' + manual.id, { archived_at: new Date().toISOString(), archived_by: ADMIN, archive_reason: 'Entered for the wrong person' })
  assert(archived.archived_at && archived.archive_reason === 'Entered for the wrong person', 'a record is archived with a reason')
  assert((await authorized()) === false, 'an archived record no longer authorizes for LOTO')
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { archived_at: null, archive_reason: null }), 'an archived record cannot be restored', { code: '23514', pattern: /archived/ })
  await expectFailure(patch('forge_training_completions', 'id=eq.' + manual.id, { notes: 'later' }), 'an archived record cannot be edited', { code: '23514' })
  const live = await select('forge_training_completions', `select=id&personnel_id=eq.${learner.id}&archived_at=is.null`)
  assert(live.length === 1 && live[0].id === graded.id, 'archived records drop out of live record reads')
  const linked = await assignment(lockout.id, learner.id, { status: 'completed' })
  const linkedRecord = await completion(lockout.id, learner.id, { assignment_id: linked.id })
  await patch('forge_training_completions', 'id=eq.' + linkedRecord.id, { archived_at: new Date().toISOString(), archived_by: ADMIN, archive_reason: 'Duplicate' })
  await remove('forge_training_assignments', 'id=eq.' + linked.id)
  const unlinked = await one('forge_training_completions', 'select=assignment_id,archived_at&id=eq.' + linkedRecord.id)
  assert(unlinked.assignment_id === null && unlinked.archived_at, 'deleting an assignment still unlinks its archived record')

  console.log('access')
  const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const { access_token: token } = await tokenResponse.json()
  await expectFailure(cancel(edited.id, null, { token }), 'members cannot cancel assignments')
  const archiveAsMember = request(`/rest/v1/forge_training_completions?id=eq.${graded.id}`, { method: 'PATCH', body: { archived_at: new Date().toISOString(), archive_reason: 'x' }, token }).then(rows => {
    if (!rows || !rows.length) throw new Error('no rows changed')
  })
  await expectFailure(archiveAsMember, 'members cannot archive training records')
  const still = await one('forge_training_completions', 'select=archived_at&id=eq.' + graded.id)
  assert(still.archived_at === null, 'the record is untouched')
}

async function cleanup() {
  for (const id of created.courses) {
    await remove('forge_training_attempts', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_completions', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_assignments', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_courses', 'id=eq.' + id).catch(() => {})
  }
  for (const id of created.people) await remove('forge_personnel', 'id=eq.' + id).catch(() => {})
}

main()
  .then(cleanup)
  .then(() => console.log('Batch 1 training DB checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
