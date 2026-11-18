/**
 * Port slice 6 (Industrial 1.0 -> 2.0): training gaps database contract checks.
 * Attachments, material folders/topics, notice queue + dedupe, the daily retraining claim, access.
 * Run: node apps/web/tests/port-s6-training-db.cjs
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

const created = { courses: [], people: [], subjects: [], settings: undefined }

const course = async title => {
  const row = await insert('forge_training_courses', { organization_id: ORG, title: `${title} ${RUN}`, validity_months: 12, created_by: ADMIN, updated_by: ADMIN })
  created.courses.push(row.id)
  return row
}

const fileRow = (completionId, n, extra = {}) =>
  insert('forge_training_completion_files', {
    organization_id: ORG,
    completion_id: completionId,
    storage_path: `${ORG}/test/${RUN}/${completionId}/${n}`,
    file_name: `card-${n}.pdf`,
    content_type: 'application/pdf',
    byte_size: 1024,
    uploaded_by: ADMIN,
    ...extra
  })

const material = (courseId, title, extra = {}) =>
  insert('forge_training_materials', {
    organization_id: ORG,
    course_id: courseId,
    title,
    file_name: title + '.pdf',
    storage_path: `${ORG}/test/${RUN}/materials/${courseId}/${title}`,
    content_type: 'application/pdf',
    size_bytes: 2048,
    ...extra
  })

async function main() {
  console.log('Port slice 6: training gaps DB checks')

  console.log('completion attachments')
  const lockout = await course('S6 Lockout')
  const other = await course('S6 Forklift')
  const learner = await insert('forge_personnel', { organization_id: ORG, first_name: 'Sam', last_name: `S6 ${RUN}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN })
  created.people.push(learner.id)
  const completion = await insert('forge_training_completions', {
    organization_id: ORG, course_id: lockout.id, personnel_id: learner.id, completed_at: new Date().toISOString(), result: 'passed', approval_status: 'approved', created_by: ADMIN
  })
  const second = await insert('forge_training_completions', {
    organization_id: ORG, course_id: other.id, personnel_id: learner.id, completed_at: new Date().toISOString(), result: 'passed', approval_status: 'approved', created_by: ADMIN
  })
  const first = await fileRow(completion.id, 0)
  assert(first.id && first.removed_at === null, 'a training record takes an attachment')
  await expectFailure(fileRow(completion.id, 'exe', { content_type: 'application/x-msdownload' }), 'only PDFs and photos are allowed', { code: '23514' })
  await expectFailure(fileRow(completion.id, 'big', { byte_size: 12582913 }), 'attachments are capped at 12 MB', { code: '23514' })
  await expectFailure(patch('forge_training_completion_files', 'id=eq.' + first.id, { completion_id: second.id }), 'an attachment cannot move to another record', { code: '23514' })
  for (let n = 1; n < 10; n += 1) await fileRow(completion.id, n)
  await expectFailure(fileRow(completion.id, 10), 'at most 10 live attachments per record', { code: '23514', pattern: /At most 10/ })
  await patch('forge_training_completion_files', 'id=eq.' + first.id, { removed_at: new Date().toISOString(), removed_by: ADMIN })
  const eleventh = await fileRow(completion.id, 11)
  assert(eleventh.id, 'removing one frees a slot (removed files do not count)')
  await expectFailure(patch('forge_training_completion_files', 'id=eq.' + first.id, { removed_at: null }), 'a removed attachment cannot be restored', { code: '23514' })

  console.log('material folders and topics')
  const folder = await insert('forge_training_material_folders', { organization_id: ORG, course_id: lockout.id, name: 'Handouts', created_by: ADMIN })
  const otherFolder = await insert('forge_training_material_folders', { organization_id: ORG, course_id: other.id, name: 'Handouts', created_by: ADMIN })
  assert(folder.id && otherFolder.id, 'each course can have its own folder of the same name')
  await expectFailure(insert('forge_training_material_folders', { organization_id: ORG, course_id: lockout.id, name: 'Handouts' }), 'folder names are unique within a course', { code: '23505' })
  await expectFailure(insert('forge_training_material_folders', { organization_id: ORG, course_id: lockout.id, name: '   ' }), 'folder names cannot be blank', { code: '23514' })
  await expectFailure(patch('forge_training_material_folders', 'id=eq.' + folder.id, { course_id: other.id }), 'a folder cannot move to another course', { code: '23514' })
  const handout = await material(lockout.id, 'Steps', { folder_id: folder.id, topic: 'loto' })
  assert(handout.folder_id === folder.id && handout.topic === 'loto', 'a material goes in a folder with a topic')
  const plain = await material(lockout.id, 'Plain')
  assert(plain.topic === 'general' && plain.folder_id === null, 'materials default to the general topic with no folder')
  await expectFailure(patch('forge_training_materials', 'id=eq.' + plain.id, { topic: 'cooking' }), 'topics come from the fixed list', { code: '23514' })
  await expectFailure(patch('forge_training_materials', 'id=eq.' + plain.id, { folder_id: otherFolder.id }), "a material cannot use another course's folder", { code: '23514' })
  await remove('forge_training_material_folders', 'id=eq.' + folder.id)
  const unfiled = await one('forge_training_materials', 'select=folder_id&id=eq.' + handout.id)
  assert(unfiled.folder_id === null, 'deleting a folder leaves its materials unfiled')

  console.log('notice queue')
  const subject = crypto.randomUUID()
  created.subjects.push(subject)
  const item = { kind: 'overdue', subject_id: subject, user_id: ADMIN, title: `S6 overdue ${RUN}`, body: 'Lockout is overdue.', link_path: '/my-training' }
  const stranger = { ...item, user_id: crypto.randomUUID() }
  const firstRun = await rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: [item, stranger] })
  assert(firstRun.queued === 1 && firstRun.skipped === 1 && firstRun.duplicate === 0, 'a member gets the notice; a non-member is skipped')
  const log = await one('forge_training_notice_log', `select=event_id&subject_id=eq.${subject}`)
  const deliveries = await select('forge_notification_deliveries', `select=channel,status,link_path&event_id=eq.${log.event_id}&order=channel`)
  assert(deliveries.length === 2 && deliveries[0].channel === 'email' && deliveries[0].status === 'pending' && deliveries[1].status === 'sent', 'it becomes an in-app notice and a pending email')
  const event = await one('forge_notification_events', `select=source_module,event_type,resource_type&id=eq.${log.event_id}`)
  assert(event.source_module === 'training' && event.event_type === 'overdue' && event.resource_type === 'training_assignment', 'the event is filed under training')
  const again = await rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: [item] })
  assert(again.queued === 0 && again.duplicate === 1, 'the same notice is never sent twice')
  const dueSoon = await rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: [{ ...item, kind: 'due_soon' }] })
  assert(dueSoon.queued === 1, 'a different kind for the same assignment is its own notice')
  await expectFailure(rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: { not: 'array' } }), 'the queue takes an array', { code: '22023' })
  await expectFailure(rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: Array.from({ length: 1001 }, () => stranger) }), 'at most 1000 per call', { code: '22023' })

  console.log('daily retraining claim')
  created.settings = (await one('forge_training_settings', 'select=*&organization_id=eq.' + ORG)) || null
  if (created.settings) await patch('forge_training_settings', 'organization_id=eq.' + ORG, { auto_retrain: false, last_auto_retrain_on: null })
  else await insert('forge_training_settings', { organization_id: ORG })
  const defaults = await one('forge_training_settings', 'select=*&organization_id=eq.' + ORG)
  if (!created.settings) {
    assert(defaults.notify_on_assign === true && defaults.due_reminder_days === 3 && defaults.expiring_notice_days === 30 && defaults.retrain_due_days === 30, 'notice settings default to 1.0 behavior')
  }
  await expectFailure(patch('forge_training_settings', 'organization_id=eq.' + ORG, { due_reminder_days: 31 }), 'reminder days are 0 to 30', { code: '23514' })
  await expectFailure(patch('forge_training_settings', 'organization_id=eq.' + ORG, { retrain_due_days: 0 }), 'retraining needs at least a day to finish', { code: '23514' })
  assert((await rpc('forge_training_mark_auto_retrain', { p_organization_id: ORG, p_today: '2099-01-01' })) === false, 'no run while retraining is off')
  await patch('forge_training_settings', 'organization_id=eq.' + ORG, { auto_retrain: true })
  assert((await rpc('forge_training_mark_auto_retrain', { p_organization_id: ORG, p_today: '2099-01-01' })) === true, 'the first run of the day claims it')
  assert((await rpc('forge_training_mark_auto_retrain', { p_organization_id: ORG, p_today: '2099-01-01' })) === false, 'a second run the same day does nothing')
  assert((await rpc('forge_training_mark_auto_retrain', { p_organization_id: ORG, p_today: '2099-01-02' })) === true, 'the next day runs again')

  console.log('access')
  const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const { access_token: token } = await tokenResponse.json()
  for (const table of ['forge_training_completion_files', 'forge_training_material_folders', 'forge_training_notice_log']) {
    await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
  }
  await expectFailure(rpc('forge_training_queue_notices', { p_organization_id: ORG, p_items: [] }, { token }), 'members cannot queue notices')
  await expectFailure(rpc('forge_training_mark_auto_retrain', { p_organization_id: ORG, p_today: '2099-01-03' }, { token }), 'members cannot claim the retraining run')

  const perm = await one('forge_permission_registry', 'select=permission_key,feature_key&permission_key=eq.training.reports')
  assert(perm && perm.feature_key === 'training', 'the training.reports permission exists')
  const grants = await select('forge_tenant_role_permissions', `select=role_id&permission_id=eq.${(await one('forge_permission_registry', 'select=id&permission_key=eq.training.reports')).id}&allowed=is.true`)
  assert(grants.length > 0, 'company administrators and owners have training.reports')
}

async function cleanup() {
  for (const subject of created.subjects) {
    const logs = await select('forge_training_notice_log', `select=event_id&subject_id=eq.${subject}`).catch(() => [])
    await remove('forge_training_notice_log', `subject_id=eq.${subject}`).catch(() => {})
    for (const row of logs) if (row.event_id) await remove('forge_notification_events', 'id=eq.' + row.event_id).catch(() => {})
  }
  await remove('forge_training_completion_files', `storage_path=like.${ORG}/test/${RUN}/*`).catch(() => {})
  for (const id of created.courses) {
    await remove('forge_training_materials', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_material_folders', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_completions', 'course_id=eq.' + id).catch(() => {})
    await remove('forge_training_courses', 'id=eq.' + id).catch(() => {})
  }
  for (const id of created.people) await remove('forge_personnel', 'id=eq.' + id).catch(() => {})
  if (created.settings === null) await remove('forge_training_settings', 'organization_id=eq.' + ORG).catch(() => {})
  else if (created.settings) {
    const { organization_id, created_at, updated_at, ...rest } = created.settings
    await patch('forge_training_settings', 'organization_id=eq.' + ORG, rest).catch(() => {})
  }
}

main()
  .then(cleanup)
  .then(() => console.log('Port slice 6 DB checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
