/**
 * Batch 1 DOT parity: database checks for forge_dot_records.due_on
 * (migration 20261116150000_forge_dot_parity.sql). Self-cleaning.
 * Run: node apps/web/tests/port-b1-dot-db.cjs
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
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
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

const insert = async (table, body) => (await request('/rest/v1/' + table, { method: 'POST', body }))[0]
const select = (table, filter) => request(`/rest/v1/${table}?${filter}`)
const patch = async (table, filter, body) => (await request(`/rest/v1/${table}?${filter}`, { method: 'PATCH', body }))[0]
const remove = (table, filter) => request(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, { code } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const created = { personnel: [], records: [] }

async function record(label, extra = {}) {
  const row = await insert('forge_dot_records', {
    organization_id: ORG,
    record_number: `DOT-B1${label}${RUN}`,
    category: 'roadside_inspection',
    title: 'B1 ' + label,
    created_by: ADMIN,
    ...extra
  })
  created.records.push(row.id)
  return row
}

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY) throw new Error('Set API_URL and SERVICE_ROLE_KEY (or run from a checkout with apps/web/.env.local).')

  console.log('due_on column')
  const blank = await record('A')
  assert(Object.prototype.hasOwnProperty.call(blank, 'due_on') && blank.due_on === null, 'due_on exists and defaults to null')

  const due = await record('B', { record_date: '2026-11-01', due_on: '2026-11-30' })
  assert(due.due_on === '2026-11-30', 'a record saves its due date')

  const same = await record('C', { record_date: '2026-11-01', due_on: '2026-11-01' })
  assert(same.due_on === '2026-11-01', 'the due date can be the record date')

  const noDate = await record('D', { due_on: '2026-01-01' })
  assert(noDate.due_on === '2026-01-01', 'a due date without a record date is allowed')

  await expectFailure(record('E', { record_date: '2026-11-10', due_on: '2026-11-09' }), 'the due date cannot be before the record date', { code: '23514' })
  await expectFailure(
    patch('forge_dot_records', 'id=eq.' + due.id, { record_date: '2026-12-15' }),
    'moving the record date past the due date is refused',
    { code: '23514' }
  )

  let row = await patch('forge_dot_records', 'id=eq.' + due.id, { due_on: '2026-12-31' })
  assert(row.due_on === '2026-12-31', 'the due date can be edited')
  row = await patch('forge_dot_records', 'id=eq.' + due.id, { due_on: null })
  assert(row.due_on === null, 'the due date can be cleared')

  row = await patch('forge_dot_records', 'id=eq.' + same.id, { status: 'closed', closed_by: ADMIN })
  assert(row.status === 'closed' && row.due_on === '2026-11-01' && row.closed_at, 'closing a record keeps its due date')

  console.log('related records by driver')
  const person = await insert('forge_personnel', {
    organization_id: ORG,
    first_name: 'B1',
    last_name: 'Driver ' + RUN,
    employee_number: `B1-${RUN}`,
    employment_status: 'active',
    employment_type: 'full_time',
    created_by: ADMIN,
    updated_by: ADMIN
  })
  created.personnel.push(person.id)
  await record('F', { personnel_id: person.id, due_on: '2026-12-01' })
  await record('G', { personnel_id: person.id, category: 'accident' })
  const related = await select('forge_dot_records', `select=id,record_number,due_on&organization_id=eq.${ORG}&personnel_id=eq.${person.id}`)
  assert(related.length === 2 && related.some(item => item.due_on === '2026-12-01'), 'records are found by the driver they are about, with their due dates')
}

async function cleanup() {
  for (const id of created.records) await remove('forge_dot_records', 'id=eq.' + id).catch(() => {})
  for (const id of created.personnel) await remove('forge_personnel', 'id=eq.' + id).catch(() => {})
}

main()
  .then(cleanup)
  .then(() => console.log('\nport-b1 DOT database checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
