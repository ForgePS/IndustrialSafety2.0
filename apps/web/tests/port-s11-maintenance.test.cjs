/**
 * Port slice 11 (agent C): unit tests for src/lib/forgeFleetMaintenanceRules.ts (maintenance form checks, cost,
 * list order, the completion meter rule and the Drivers tab merge).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s11-maintenance.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFleetMaintenanceRules.ts'))
const fleet = require(path.join(__dirname, '../src/lib/forgeFleetRules.ts'))

const NOW = new Date('2026-11-17T12:00:00Z')

test('dollarsToCents: dollars, commas and $ to cents; empty is null; junk is NaN', () => {
  assert.equal(rules.dollarsToCents('125'), 12500)
  assert.equal(rules.dollarsToCents('$1,250.5'), 125050)
  assert.equal(rules.dollarsToCents('0.99'), 99)
  assert.equal(rules.dollarsToCents(''), null)
  assert.equal(rules.dollarsToCents(null), null)
  assert.ok(Number.isNaN(rules.dollarsToCents('12.345')))
  assert.ok(Number.isNaN(rules.dollarsToCents('-5')))
  assert.ok(Number.isNaN(rules.dollarsToCents('abc')))
})

test('parseMaintenanceInput: cleans values and reports each problem', () => {
  const ok = rules.parseMaintenanceInput({ title: '  Oil change ', maintenanceType: 'pm', dueOn: '2026-12-01', dueMileage: '45,000', vendor: ' Shop ', cost: '89.95', repeatDays: '90', repeatMiles: '', notes: '' })

  assert.equal(ok.ok, true)
  assert.deepEqual(ok.values, {
    title: 'Oil change',
    maintenance_type: 'pm',
    due_on: '2026-12-01',
    due_mileage: 45000,
    vendor: 'Shop',
    cost_cents: 8995,
    repeat_days: 90,
    repeat_miles: null,
    notes: null
  })

  const bad = rules.parseMaintenanceInput({ title: '', maintenanceType: 'paint', dueOn: '12/01/2026', dueMileage: '1.5', cost: 'x', repeatDays: '0', repeatMiles: '2000000' })

  assert.equal(bad.ok, false)
  assert.deepEqual(Object.keys(bad.errors).sort(), ['cost', 'dueMileage', 'dueOn', 'maintenanceType', 'repeatDays', 'repeatMiles', 'title'])
})

test('parseCompletionInput: needs a date not in the future; mileage optional', () => {
  assert.equal(rules.parseCompletionInput({ completedOn: '2026-11-17', completedMileage: '' }, NOW).ok, true)
  assert.equal(rules.parseCompletionInput({ completedOn: '2026-11-17', completedMileage: '50100', cost: '10' }, NOW).values.completed_mileage, 50100)
  assert.ok(rules.parseCompletionInput({ completedOn: '' }, NOW).errors.completedOn)
  assert.ok(rules.parseCompletionInput({ completedOn: '2026-11-25' }, NOW).errors.completedOn)
  assert.ok(rules.parseCompletionInput({ completedOn: '2026-11-17', completedMileage: '-3' }, NOW).errors.completedMileage)
})

test('completionWritesReading: at or above the current odometer, or when the vehicle has none', () => {
  assert.equal(rules.completionWritesReading(50000, 49000), true)
  assert.equal(rules.completionWritesReading(50000, 50000), true)
  assert.equal(rules.completionWritesReading(48000, 50000), false)
  assert.equal(rules.completionWritesReading(48000, null), true)
  assert.equal(rules.completionWritesReading(null, 50000), false)
})

test('sortMaintenance: overdue first, then due soon, scheduled, unscheduled, closed; earliest date first', () => {
  const rows = [
    { id: 'later', status: 'open', due_on: '2027-03-01' },
    { id: 'none', status: 'open' },
    { id: 'done', status: 'completed', due_on: '2026-01-01' },
    { id: 'soon', status: 'open', due_on: '2026-11-30' },
    { id: 'miles', status: 'open', due_mileage: 50000, vehicle_mileage: 50200 },
    { id: 'late', status: 'open', due_on: '2026-11-01' },
    { id: 'later2', status: 'open', due_on: '2027-01-01' }
  ]

  const sorted = rules.sortMaintenance(rows, 30, NOW)

  assert.deepEqual(
    sorted.map(item => item.row.id),
    ['late', 'miles', 'soon', 'later2', 'later', 'none', 'done']
  )
  assert.deepEqual(
    sorted.map(item => item.state),
    ['overdue', 'overdue', 'due_soon', 'scheduled', 'scheduled', 'unscheduled', 'done']
  )
})

test('nextRepeat (shared rule): 90 days from completion and miles from the completion odometer', () => {
  assert.deepEqual(fleet.nextRepeat({ repeat_days: 90 }, '2026-11-17', 50100), { due_on: '2027-02-15', due_mileage: null })
  assert.deepEqual(fleet.nextRepeat({ repeat_miles: 5000 }, '2026-11-17', 50100), { due_on: null, due_mileage: 55100 })
  assert.equal(fleet.nextRepeat({}, '2026-11-17', 50100), null)
})

test('buildFleetDrivers: one row per person from the roster and driver files, with vehicles', () => {
  const drivers = rules.buildFleetDrivers({
    roster: [
      { id: 'r1', personnel_id: 'p1', driver_name: 'Old Name', employee_number: '7', status: 'on_insurance', license_expires_on: '2027-01-01', next_mvr_due_on: '2027-05-01', person: { id: 'p1', first_name: 'Ann', last_name: 'Lee', employee_number: '100' } },
      { id: 'r2', personnel_id: null, driver_name: 'Zed Outside', status: 'pending_mvr' }
    ],
    files: [
      { id: 'f1', personnel_id: 'p1', license_expires_on: '2026-12-01', medical_certificate_expires_on: '2026-11-20', mvr_expires_on: '2027-02-01' },
      { id: 'f2', personnel_id: 'p2', license_expires_on: null, medical_certificate_expires_on: '2027-06-01', person: { id: 'p2', first_name: 'Bob', last_name: 'Ray' } }
    ],
    vehicles: [
      { id: 'v1', personnelId: 'p1', name: 'Unit 1' },
      { id: 'v2', personnelId: 'p9', name: 'Unit 2' }
    ]
  })

  assert.deepEqual(
    drivers.map(driver => driver.name),
    ['Ann Lee', 'Bob Ray', 'Zed Outside']
  )

  const ann = drivers[0]

  assert.equal(ann.companyDriverId, 'r1')
  assert.equal(ann.driverFileId, 'f1')
  assert.equal(ann.employeeNumber, '100')
  assert.equal(ann.licenseExpiresOn, '2026-12-01', 'the driver file license date wins')
  assert.equal(ann.medicalExpiresOn, '2026-11-20')
  assert.equal(ann.mvrDueOn, '2027-05-01', 'the roster next MVR due wins')
  assert.deepEqual(ann.vehicles, [{ id: 'v1', name: 'Unit 1' }])
  assert.equal(drivers[1].rosterStatus, null)
  assert.equal(drivers[2].personnelId, null)
})
