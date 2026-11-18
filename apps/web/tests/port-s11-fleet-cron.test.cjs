/**
 * Port slice 11 (agent C): unit tests for src/lib/forgeFleetNotifyRules.ts (which reminders are due, who may
 * get them, the digest text).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s11-fleet-cron.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFleetNotifyRules.ts'))

const NOW = new Date('2026-11-17T12:00:00Z')

const vehicle = (patch = {}) => ({ id: 'v1', organization_id: 'o1', unit_number: '12', year: 2020, make: 'Ford', model: 'F-150', mileage: 50000, ...patch })

test('vehicleNotices: registration, insurance and annual inspection within the window or overdue', () => {
  const notices = rules.vehicleNotices(
    vehicle({ registration_renewal_date: '2026-12-01', insurance_expires_on: '2026-11-10', annual_inspection_due_on: '2027-06-01' }),
    30,
    NOW
  )

  assert.deepEqual(
    notices.map(item => [item.kind, item.dueKey]),
    [
      ['registration', '2026-12-01'],
      ['insurance', '2026-11-10']
    ]
  )
  assert.match(notices[0].line, /Unit 12 · 2020 Ford F-150: registration is due 12\/01\/2026 \(in 14 days\)/)
  assert.match(notices[1].line, /insurance expired 11\/10\/2026/)
  assert.equal(notices[0].link, '/fleet/vehicles/v1')

  // Renewal month only: the end of that month is the due date.
  const byMonth = rules.vehicleNotices(vehicle({ registration_renewal_month: 12 }), 60, NOW)

  assert.deepEqual(byMonth.map(item => item.dueKey), ['2026-12-31'])
  assert.deepEqual(rules.vehicleNotices(vehicle({ registration_renewal_month: 12 }), 30, NOW), [])
})

test('maintenanceNotice: due soon vs overdue by date or mileage; the key follows the due point', () => {
  const soon = rules.maintenanceNotice({ id: 'm1', vehicle_id: 'v1', title: 'Oil change', status: 'open', due_on: '2026-11-30', maintenance_number: 'FM-2026-000001' }, vehicle(), 30, NOW)

  assert.equal(soon.kind, 'maintenance_due')
  assert.equal(soon.dueKey, '2026-11-30|-')
  assert.match(soon.line, /Oil change \(FM-2026-000001\) is due soon: due 11\/30\/2026 \(in 13 days\)/)

  const miles = rules.maintenanceNotice({ id: 'm2', vehicle_id: 'v1', title: 'Tires', status: 'open', due_mileage: 49800 }, vehicle(), 30, NOW)

  assert.equal(miles.kind, 'maintenance_overdue')
  assert.equal(miles.dueKey, '-|49800')
  assert.match(miles.line, /200 miles over/)

  assert.equal(rules.maintenanceNotice({ id: 'm3', vehicle_id: 'v1', title: 'x', status: 'open', due_on: '2027-05-01' }, vehicle(), 30, NOW), null)
  assert.equal(rules.maintenanceNotice({ id: 'm4', vehicle_id: 'v1', title: 'x', status: 'completed', due_on: '2026-11-01' }, vehicle(), 30, NOW), null)
  assert.equal(rules.maintenanceNotice({ id: 'm5', vehicle_id: 'v1', title: 'x', status: 'open' }, vehicle(), 30, NOW), null)
})

test('dvirDefectNotice: only open DVIRs waiting more than 24 hours; keyed by the DVIR', () => {
  const old = rules.dvirDefectNotice({ id: 'd1', vehicle_id: 'v1', dvir_number: 'DVIR-2026-000004', status: 'open', created_at: '2026-11-15T10:00:00Z' }, vehicle(), NOW)

  assert.equal(old.kind, 'dvir_defect')
  assert.equal(old.dueKey, 'd1')
  assert.equal(old.link, '/fleet/dvirs/d1')
  assert.match(old.line, /DVIR DVIR-2026-000004 has defects waiting for a mechanic for 2 days/)

  assert.equal(rules.dvirDefectNotice({ id: 'd2', vehicle_id: 'v1', status: 'open', created_at: '2026-11-17T00:00:00Z' }, vehicle(), NOW), null)
  assert.equal(rules.dvirDefectNotice({ id: 'd3', vehicle_id: 'v1', status: 'needs_review', created_at: '2026-11-01T00:00:00Z' }, vehicle(), NOW), null)
})

test('documentNotice: expiring or expired documents that are not archived', () => {
  const doc = rules.documentNotice({ id: 'x1', vehicle_id: 'v1', file_name: 'card.pdf', title: 'Insurance card', document_type: 'insurance_card', expires_on: '2026-12-10' }, vehicle(), 30, NOW)

  assert.equal(doc.kind, 'document_expiring')
  assert.equal(doc.dueKey, '2026-12-10')
  assert.match(doc.line, /document "Insurance card" expires 12\/10\/2026/)
  assert.equal(rules.documentNotice({ id: 'x2', vehicle_id: 'v1', file_name: 'a.pdf', document_type: 'other', expires_on: '2027-12-10' }, vehicle(), 30, NOW), null)
  assert.equal(rules.documentNotice({ id: 'x3', vehicle_id: 'v1', file_name: 'a.pdf', document_type: 'other', expires_on: '2026-11-01', archived_at: '2026-11-02' }, vehicle(), 30, NOW), null)
})

test('scopeCoversVehicle: organization, location, division and own (assigned driver)', () => {
  const v = vehicle({ location_id: 'L1', division_id: 'D1', assigned_driver_personnel_id: 'P1' })
  const nobody = { locationIds: [], divisionIds: [], personnelIds: [] }

  assert.equal(rules.scopeCoversVehicle({ scope: 'organization' }, nobody, v), true)
  assert.equal(rules.scopeCoversVehicle({ scope: 'location' }, { ...nobody, locationIds: ['L1'] }, v), true)
  assert.equal(rules.scopeCoversVehicle({ scope: 'location' }, { ...nobody, locationIds: ['L2'] }, v), false)
  assert.equal(rules.scopeCoversVehicle({ scope: 'location' }, { ...nobody, divisionIds: ['D1'] }, v), false)
  assert.equal(rules.scopeCoversVehicle({ scope: 'division' }, { ...nobody, divisionIds: ['D1'] }, v), true)
  assert.equal(rules.scopeCoversVehicle({ scope: 'own' }, nobody, v), false)
  assert.equal(rules.scopeCoversVehicle({ scope: 'own' }, { ...nobody, personnelIds: ['P1'] }, v), true)
  assert.equal(rules.scopeCoversVehicle({ scope: 'location' }, { ...nobody, personnelIds: ['P1'] }, v), true, 'your own vehicle at another location')
  assert.equal(rules.scopeCoversVehicle(null, nobody, v), false)
})

test('noticeReachesRecipient: fleet.maintenance gets maintenance and DVIR kinds only', () => {
  const v = vehicle({ location_id: 'L1' })
  const scope = { locationIds: ['L1'], divisionIds: [], personnelIds: [] }
  const mechanic = { 'fleet.maintenance': { scope: 'organization' }, 'fleet.edit': null }
  const editor = { 'fleet.edit': { scope: 'location' } }

  for (const kind of ['maintenance_due', 'maintenance_overdue', 'dvir_defect']) assert.equal(rules.noticeReachesRecipient({ kind }, mechanic, scope, v), true, kind)
  for (const kind of ['registration', 'insurance', 'annual_inspection', 'document_expiring']) assert.equal(rules.noticeReachesRecipient({ kind }, mechanic, scope, v), false, kind)
  for (const kind of rules.FLEET_NOTICE_KINDS) assert.equal(rules.noticeReachesRecipient({ kind }, editor, scope, v), true, kind)
  assert.equal(rules.noticeReachesRecipient({ kind: 'registration' }, editor, { ...scope, locationIds: ['L9'] }, v), false)
})

test('fleetDigest: one title and body; single item links to it, several link to Fleet; long lists are capped', () => {
  const one = rules.fleetDigest([{ kind: 'registration', subjectId: 'v1', vehicleId: 'v1', dueKey: 'k', line: 'Unit 1: registration is due.', link: '/fleet/vehicles/v1' }], NOW)

  assert.equal(one.title, 'Fleet reminder')
  assert.equal(one.link, '/fleet/vehicles/v1')
  assert.match(one.body, /^As of 11\/17\/2026:\n- Unit 1: registration is due\.$/)

  const many = rules.fleetDigest(
    Array.from({ length: 40 }, (_, index) => ({ kind: 'maintenance_due', subjectId: 'm' + index, vehicleId: 'v1', dueKey: 'k', line: `Item ${index} is due soon with a fairly long description of the work.`, link: '/x' })),
    NOW
  )

  assert.equal(many.title, 'Fleet reminders: 40 items need attention')
  assert.equal(many.link, '/fleet')
  assert.ok(many.body.length <= 2000)
  assert.match(many.body, /and 15 more/)
})
