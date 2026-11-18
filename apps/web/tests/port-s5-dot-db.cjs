/**
 * Port slice 5 (Industrial 1.0 -> 2.0): DOT Compliance database contract checks.
 * Run: node apps/web/tests/port-s5-dot-db.cjs
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
// A far-off year so the test sample never touches a real one.
const SAMPLE_YEAR = 2099

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

const created = { personnel: [], records: [] }
let originalSettings

async function person(label, extra = {}) {
  const row = await insert('forge_personnel', {
    organization_id: ORG,
    first_name: 'S5',
    last_name: `${label} ${RUN}`,
    employee_number: `S5-${RUN}-${label}`,
    employment_status: 'active',
    employment_type: 'full_time',
    created_by: ADMIN,
    updated_by: ADMIN,
    ...extra
  })
  created.personnel.push(row.id)
  return row
}

async function openFile(personnelId, label) {
  const number = await rpc('next_forge_dot_number', { p_organization_id: ORG, p_kind: 'dqf' })
  return insert('forge_dot_driver_files', {
    organization_id: ORG, personnel_id: personnelId, file_number: number, created_by: ADMIN, updated_by: ADMIN, notes: label
  })
}

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY) throw new Error('Set API_URL and SERVICE_ROLE_KEY (or run from a checkout with apps/web/.env.local).')

  originalSettings = (await select('forge_dot_settings', 'select=*&organization_id=eq.' + ORG))[0] || null
  if (originalSettings) await patch('forge_dot_settings', 'organization_id=eq.' + ORG, { dot_drivers_are_company_drivers: false })
  else await insert('forge_dot_settings', { organization_id: ORG, dot_drivers_are_company_drivers: false })

  console.log('numbering')
  const n1 = await rpc('next_forge_dot_number', { p_organization_id: ORG, p_kind: 'dqf' })
  const n2 = await rpc('next_forge_dot_number', { p_organization_id: ORG, p_kind: 'dqf' })
  const r1 = await rpc('next_forge_dot_number', { p_organization_id: ORG, p_kind: 'record' })
  assert(/^DQF-\d{6}$/.test(n1) && Number(n2.slice(4)) === Number(n1.slice(4)) + 1, 'DQF numbers count up per organization')
  assert(/^DOT-\d{6}$/.test(r1), 'record numbers use their own DOT- sequence')

  console.log('driver files and the personnel flag')
  const driver = await person('Driver')
  const file = await openFile(driver.id, 'main')
  let row = await one('forge_personnel', 'select=is_dot_driver,is_company_driver&id=eq.' + driver.id)
  assert(row.is_dot_driver === true, 'opening a DQF marks the person as a DOT driver')
  assert(row.is_company_driver === false, 'the company-driver rule is off, so the roster is untouched')
  await expectFailure(openFile(driver.id, 'second'), 'a person has at most one open DQF', { code: '23505' })

  const other = await person('Other')
  await expectFailure(patch('forge_dot_driver_files', 'id=eq.' + file.id, { personnel_id: other.id }), 'a DQF cannot move to another driver', { code: '23514' })
  const trimmed = await patch('forge_dot_driver_files', 'id=eq.' + file.id, { license_state: ' ar ', license_number: '  ' })
  assert(trimmed.license_state === 'AR' && trimmed.license_number === null, 'license fields are trimmed and upper-cased')

  await patch('forge_personnel', 'id=eq.' + driver.id, { is_dot_driver: false, updated_by: ADMIN })
  row = await one('forge_dot_driver_files', 'select=archived_at,archived_reason&id=eq.' + file.id)
  assert(row.archived_at && row.archived_reason === 'dot_driver_off', 'turning the flag off archives the DQF (dot_driver_off)')
  await patch('forge_personnel', 'id=eq.' + driver.id, { is_dot_driver: true, updated_by: ADMIN })
  row = await one('forge_dot_driver_files', 'select=archived_at,archived_reason&id=eq.' + file.id)
  assert(row.archived_at === null && row.archived_reason === null, 'turning it back on restores the same DQF')

  await patch('forge_personnel', 'id=eq.' + driver.id, { employment_status: 'terminated', updated_by: ADMIN })
  row = await one('forge_personnel', 'select=is_dot_driver&id=eq.' + driver.id)
  assert(row.is_dot_driver === false, 'terminating a driver clears the DOT flag')
  row = await one('forge_dot_driver_files', 'select=archived_reason&id=eq.' + file.id)
  assert(row.archived_reason === 'personnel_inactive', 'and archives the DQF as personnel_inactive')
  await expectFailure(
    patch('forge_dot_driver_files', 'id=eq.' + file.id, { archived_at: null, archived_reason: null }),
    'a terminated driver cannot have an open DQF',
    { code: '23514', pattern: /not an active employee/ }
  )
  await patch('forge_personnel', 'id=eq.' + driver.id, { employment_status: 'active', is_dot_driver: true, updated_by: ADMIN })
  row = await one('forge_dot_driver_files', 'select=archived_at&id=eq.' + file.id)
  assert(row.archived_at === null, 'rehiring and flagging again restores the DQF')

  await patch('forge_dot_driver_files', 'id=eq.' + file.id, { archived_at: new Date().toISOString(), archived_reason: 'manual', archived_by: ADMIN })
  row = await one('forge_personnel', 'select=is_dot_driver&id=eq.' + driver.id)
  assert(row.is_dot_driver === false, 'archiving by hand clears the DOT flag')
  await patch('forge_personnel', 'id=eq.' + driver.id, { is_dot_driver: true, updated_by: ADMIN })
  row = await one('forge_dot_driver_files', 'select=archived_at&id=eq.' + file.id)
  assert(row.archived_at !== null, 'a hand-archived DQF is not restored by the flag')
  await patch('forge_dot_driver_files', 'id=eq.' + file.id, { archived_at: null, archived_reason: null, archived_by: null })
  await expectFailure(
    insert('forge_dot_driver_files', { organization_id: ORG, personnel_id: other.id, file_number: 'DQF-X' + RUN, archived_at: new Date().toISOString() }),
    'archive time and reason go together',
    { code: '23514' }
  )

  console.log('documents')
  const doc = await insert('forge_dot_dqf_documents', {
    organization_id: ORG, driver_file_id: file.id, document_type: 'application', placed_on: '2026-01-02', updated_by: ADMIN
  })
  assert(doc.id, 'a DQF document row saves')
  await expectFailure(
    insert('forge_dot_dqf_documents', { organization_id: ORG, driver_file_id: file.id, document_type: 'application' }),
    'one row per document type',
    { code: '23505' }
  )
  await expectFailure(
    insert('forge_dot_dqf_documents', { organization_id: ORG, driver_file_id: file.id, document_type: 'not_a_document' }),
    'unknown document types are refused',
    { code: '23514' }
  )
  await expectFailure(
    insert('forge_dot_dqf_documents', { organization_id: ORG, driver_file_id: file.id, document_type: 'road_test', text_values: [] }),
    'text values must be an object',
    { code: '23514' }
  )

  console.log('uploads')
  const upload = body =>
    insert('forge_dot_files', {
      organization_id: ORG, file_name: 'x.pdf', content_type: 'application/pdf', byte_size: 100, uploaded_by: ADMIN,
      storage_path: `${ORG}/test/${RUN}/${Math.random().toString(36).slice(2)}`, ...body
    })
  const copy = await upload({ driver_file_id: file.id, slot: 'license' })
  assert(copy.id, 'a license copy records against the DQF')
  await expectFailure(upload({ driver_file_id: file.id, slot: 'nope' }), 'unknown DQF slots are refused', { code: '23514', pattern: /slot/ })
  await expectFailure(upload({ driver_file_id: file.id, slot: 'license', content_type: 'text/html' }), 'only PDF and image types are stored', { code: '23514' })
  await expectFailure(upload({ driver_file_id: file.id, slot: 'license', byte_size: 12 * 1024 * 1024 + 1 }), 'files over 12 MB are refused', { code: '23514' })
  await expectFailure(upload({ slot: 'license' }), 'an upload needs exactly one parent', { code: '23514' })
  await expectFailure(patch('forge_dot_files', 'id=eq.' + copy.id, { slot: 'mvr' }), 'an upload cannot move slots', { code: '23514' })
  await patch('forge_dot_files', 'id=eq.' + copy.id, { removed_at: new Date().toISOString(), removed_by: ADMIN })
  await expectFailure(patch('forge_dot_files', 'id=eq.' + copy.id, { removed_at: null }), 'a removed upload cannot be restored', { code: '23514' })
  for (let i = 0; i < 10; i += 1) await upload({ driver_file_id: file.id, slot: 'mvr' })
  await expectFailure(upload({ driver_file_id: file.id, slot: 'mvr' }), 'at most 10 copies per document', { code: '23514', pattern: /At most 10/ })

  console.log('company-driver roster')
  const company = await person('Company')
  await patch('forge_personnel', 'id=eq.' + company.id, { is_company_driver: true, updated_by: ADMIN })
  let roster = await one('forge_dot_company_drivers', 'select=*&personnel_id=eq.' + company.id)
  assert(roster && roster.status === 'pending_mvr' && roster.employee_number === company.employee_number, 'flagging a company driver adds a pending roster row')
  await patch('forge_personnel', 'id=eq.' + company.id, { is_company_driver: false, updated_by: ADMIN })
  roster = await one('forge_dot_company_drivers', 'select=*&id=eq.' + roster.id)
  assert(roster.status === 'removed' && roster.insurance_removed_on, 'clearing it marks the row removed and dates it')
  await patch('forge_personnel', 'id=eq.' + company.id, { is_company_driver: true, updated_by: ADMIN })
  roster = await one('forge_dot_company_drivers', 'select=*&id=eq.' + roster.id)
  assert(roster.status === 'pending_mvr' && roster.insurance_removed_on === null, 'flagging again brings the same row back as pending')
  roster = await patch('forge_dot_company_drivers', 'id=eq.' + roster.id, { status: 'on_insurance' })
  assert(roster.insurance_effective_on, 'going on insurance dates the coverage')

  const born = await person('Born', { is_company_driver: true })
  assert((await select('forge_dot_company_drivers', 'select=id&personnel_id=eq.' + born.id)).length === 1, 'a person created as a company driver gets a roster row')

  await patch('forge_dot_settings', 'organization_id=eq.' + ORG, { dot_drivers_are_company_drivers: true })
  const both = await person('Both')
  await openFile(both.id, 'both')
  row = await one('forge_personnel', 'select=is_company_driver&id=eq.' + both.id)
  assert(row.is_company_driver === true, 'with the company-driver rule on, opening a DQF adds the driver to the roster')
  assert((await select('forge_dot_company_drivers', 'select=id&personnel_id=eq.' + both.id)).length === 1, 'and the roster row exists')
  await patch('forge_dot_settings', 'organization_id=eq.' + ORG, { dot_drivers_are_company_drivers: false })
  await expectFailure(
    patch('forge_dot_settings', 'organization_id=eq.' + ORG, { hidden_document_types: ['application', 'bogus'] }),
    'settings refuse unknown document types',
    { code: '23514' }
  )
  await expectFailure(patch('forge_dot_settings', 'organization_id=eq.' + ORG, { mvr_sample_percent: 0 }), 'the sample percent is 1-100', { code: '23514' })
  await expectFailure(
    insert('forge_dot_company_drivers', { organization_id: ORG, driver_name: '  ' }),
    'roster rows need a name',
    { code: '23514' }
  )

  console.log('annual MVR sample')
  const eligible = (await select('forge_dot_company_drivers', `select=id&organization_id=eq.${ORG}&status=in.(on_insurance,pending_mvr)`)).length
  const settings = await one('forge_dot_settings', 'select=mvr_sample_percent&organization_id=eq.' + ORG)
  const expected = Math.max(1, Math.ceil((eligible * settings.mvr_sample_percent) / 100))
  const size = await rpc('forge_dot_start_mvr_sample', { p_organization_id: ORG, p_year: SAMPLE_YEAR, p_force: false, p_actor_user_id: ADMIN })
  assert(size === expected, `the sample is ${settings.mvr_sample_percent}% of ${eligible} eligible drivers, at least one (${size})`)
  const picked = await select('forge_dot_company_drivers', `select=id&organization_id=eq.${ORG}&sample_year=eq.${SAMPLE_YEAR}&order=id`)
  assert(picked.length === size, 'that many drivers are marked for the year')
  await expectFailure(
    rpc('forge_dot_start_mvr_sample', { p_organization_id: ORG, p_year: SAMPLE_YEAR, p_force: false, p_actor_user_id: ADMIN }),
    'a second draw needs an explicit redraw',
    { code: '23514', pattern: /already been drawn/ }
  )
  await rpc('forge_dot_start_mvr_sample', { p_organization_id: ORG, p_year: SAMPLE_YEAR, p_force: true, p_actor_user_id: ADMIN })
  const redrawn = await select('forge_dot_company_drivers', `select=id&organization_id=eq.${ORG}&sample_year=eq.${SAMPLE_YEAR}&order=id`)
  assert(JSON.stringify(redrawn) === JSON.stringify(picked), 'the draw is stable for a year (same drivers on redraw)')

  const sampled = picked[0].id
  await expectFailure(
    rpc('forge_dot_complete_mvr_sample', { p_organization_id: ORG, p_company_driver_id: sampled, p_completed_on: '2999-01-01', p_note: null, p_actor_user_id: ADMIN }),
    'a sampled MVR cannot be dated in the future',
    { code: '23514' }
  )
  await rpc('forge_dot_complete_mvr_sample', { p_organization_id: ORG, p_company_driver_id: sampled, p_completed_on: '2026-11-10', p_note: 'S5 test', p_actor_user_id: ADMIN })
  const done = await one('forge_dot_company_drivers', 'select=*&id=eq.' + sampled)
  assert(done.sample_completed_at && done.next_mvr_due_on >= '2027-11-10', 'recording it sets the next MVR a year out')
  await expectFailure(
    rpc('forge_dot_complete_mvr_sample', { p_organization_id: ORG, p_company_driver_id: sampled, p_completed_on: '2026-11-10', p_note: null, p_actor_user_id: ADMIN }),
    'a sampled MVR is recorded once',
    { code: '23514' }
  )
  await expectFailure(
    rpc('forge_dot_start_mvr_sample', { p_organization_id: ORG, p_year: SAMPLE_YEAR, p_force: true, p_actor_user_id: ADMIN }),
    'a sample with recorded MVRs cannot be redrawn',
    { code: '23514', pattern: /already done/ }
  )
  const events = await select('forge_dot_mvr_events', `select=kind&company_driver_id=eq.${sampled}&kind=in.(sample_selected,sample_completed)`)
  assert(events.some(e => e.kind === 'sample_completed') && events.some(e => e.kind === 'sample_selected'), 'selection and completion are logged')
  await expectFailure(
    rpc('forge_dot_complete_mvr_sample', { p_organization_id: ORG, p_company_driver_id: '00000000-0000-4000-8000-000000000000', p_completed_on: '2026-11-10', p_note: null, p_actor_user_id: ADMIN }),
    'completing an unknown driver is refused',
    { code: 'P0002' }
  )

  console.log('records')
  const record = await insert('forge_dot_records', {
    organization_id: ORG, record_number: 'DOT-T' + RUN, category: 'roadside_inspection', title: 'S5 inspection', personnel_id: driver.id, created_by: ADMIN
  })
  created.records.push(record.id)
  let closed = await patch('forge_dot_records', 'id=eq.' + record.id, { status: 'closed', closed_by: ADMIN })
  assert(closed.closed_at, 'closing a record dates it')
  closed = await patch('forge_dot_records', 'id=eq.' + record.id, { status: 'open' })
  assert(closed.closed_at === null && closed.closed_by === null, 'reopening clears the close')
  await expectFailure(
    insert('forge_dot_records', { organization_id: ORG, record_number: 'DOT-U' + RUN, category: 'parking', title: 'x' }),
    'records need a known category',
    { code: '23514' }
  )
  const attachment = await upload({ record_id: record.id, slot: 'attachment' })
  assert(attachment.id, 'records take attachments')
  await expectFailure(upload({ record_id: record.id, slot: 'license' }), 'record uploads use the attachment slot', { code: '23514' })
  await expectFailure(upload({ company_driver_id: roster.id, slot: 'road_test' }), 'roster uploads use their own slots', { code: '23514' })

  console.log('access')
  const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const { access_token: token } = await tokenResponse.json()
  for (const table of ['forge_dot_settings', 'forge_dot_driver_files', 'forge_dot_dqf_documents', 'forge_dot_company_drivers', 'forge_dot_mvr_events', 'forge_dot_records', 'forge_dot_files', 'forge_dot_sequences']) {
    await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
  }
  await expectFailure(
    rpc('forge_dot_start_mvr_sample', { p_organization_id: ORG, p_year: SAMPLE_YEAR, p_force: true, p_actor_user_id: ADMIN }, { token }),
    'members cannot draw the MVR sample'
  )
  await expectFailure(rpc('next_forge_dot_number', { p_organization_id: ORG, p_kind: 'dqf' }, { token }), 'members cannot take DOT numbers')
  const bucket = await request('/storage/v1/bucket/forge-dot')
  assert(bucket.public === false && bucket.file_size_limit === 12582912, 'the forge-dot bucket is private with a 12 MB limit')

  const perm = await one('forge_permission_registry', 'select=permission_key&permission_key=eq.dot.settings')
  assert(perm, 'the dot.settings permission exists')
  const menu = await one('forge_experience_elements', "select=settings&element_key=eq.nav.dot")
  assert(menu && menu.settings && menu.settings.route_live === true && menu.settings.required_permission === 'dot.view', 'the DOT menu entry is live behind dot.view')
}

async function cleanup() {
  await request(`/rest/v1/forge_dot_mvr_events?organization_id=eq.${ORG}&note=like.*${SAMPLE_YEAR}*`, { method: 'DELETE' }).catch(() => {})
  await patch('forge_dot_company_drivers', `organization_id=eq.${ORG}&sample_year=eq.${SAMPLE_YEAR}`, {
    sample_year: null, sample_selected_at: null, sample_completed_at: null
  }).catch(() => {})
  for (const id of created.records) await remove('forge_dot_records', 'id=eq.' + id).catch(() => {})
  for (const id of created.personnel) {
    await remove('forge_dot_company_drivers', 'personnel_id=eq.' + id).catch(() => {})
    await remove('forge_dot_driver_files', 'personnel_id=eq.' + id).catch(() => {})
    await remove('forge_personnel', 'id=eq.' + id).catch(() => {})
  }
  await remove('forge_dot_files', `storage_path=like.${ORG}/test/${RUN}/*`).catch(() => {})
  if (originalSettings) {
    const { organization_id: _org, updated_at: _at, ...rest } = originalSettings
    await patch('forge_dot_settings', 'organization_id=eq.' + ORG, rest).catch(() => {})
  } else {
    await remove('forge_dot_settings', 'organization_id=eq.' + ORG).catch(() => {})
  }
}

main()
  .then(cleanup)
  .then(() => console.log('\nport-s5 DOT database checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
