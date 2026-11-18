/**
 * Port slice 11 (vehicles): unit tests for src/lib/forgeFleetImportRules.ts (vehicle field validation, CSV
 * parsing, 1.0 template / export header mapping, value conversion, match keys, report columns).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s11-vehicles.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFleetImportRules.ts'))

test('parseCsv handles quotes, doubled quotes, CRLF, a BOM and blank lines', () => {
  const rows = rules.parseCsv('﻿Year,Make,Notes\r\n2020,"Ford, Inc","Said ""hi""\nline two"\r\n\r\n,,\n2019,Ram,')

  assert.deepEqual(rows, [
    ['Year', 'Make', 'Notes'],
    ['2020', 'Ford, Inc', 'Said "hi"\nline two'],
    ['2019', 'Ram', '']
  ])
})

test('mapCsvHeaders reads the 1.0 industrial.fleet.v1 template and reports unknown columns', () => {
  const { keys, unknown } = rules.mapCsvHeaders([...rules.FLEET_TEMPLATE_HEADERS, 'Favourite colour'])

  assert.deepEqual(keys.slice(0, 6), ['year', 'make', 'model', 'color', 'vin', 'license_plate'])
  assert.equal(keys[rules.FLEET_TEMPLATE_HEADERS.indexOf('Not on Vehicle Fringe SS')], 'vehicle_fringe')
  assert.equal(keys[rules.FLEET_TEMPLATE_HEADERS.indexOf('Asset Type')], 'vehicle_type')
  assert.equal(keys[rules.FLEET_TEMPLATE_HEADERS.indexOf('Unit Number')], 'unit_number')
  assert.deepEqual(unknown, ['Favourite colour'])
})

test('every inventory export header maps back on import', () => {
  const headers = rules.INVENTORY_COLUMNS.map(([header]) => header)
  const { unknown } = rules.mapCsvHeaders(headers)

  assert.deepEqual(unknown, [])
})

test('mapCsvRow converts 1.0 values (Yes/No, labels, US dates, month names)', () => {
  const headers = ['Year', 'Make', 'Model', 'VIN Number', 'License', 'Renewal Date', 'Insured', 'County Assessed', 'Asset Type', 'Form 2290', 'Registration Renewal Month', 'Mileage', 'Not on Vehicle Fringe SS', 'Assigned Driver']
  const { keys } = rules.mapCsvHeaders(headers)
  const row = rules.mapCsvRow(['2019.0', 'Ford', 'F-150', ' 1ftfw1e50mfa00000 ', 'ABC 123', '3/31/2027', 'Yes', 'Exempt', 'Dump Truck', 'Filed', 'March', '42,000', 'x', 'Pat Driver'], keys, 2)

  assert.deepEqual(row.problems, [])
  assert.equal(row.fields.year, '2019')
  assert.equal(row.fields.registration_renewal_date, '2027-03-31')
  assert.equal(row.fields.insurance_status, 'insured')
  assert.equal(row.fields.county_assessment_status, 'exempt')
  assert.equal(row.fields.vehicle_type, 'dump_truck')
  assert.equal(row.fields.form_2290_status, 'filed')
  assert.equal(row.fields.registration_renewal_month, '3')
  assert.equal(row.fields.vehicle_fringe, 'true')
  assert.equal(row.mileage, 42000)
  assert.equal(row.driverName, 'Pat Driver')
  assert.equal(rules.rowMatchKey(row), 'vin:1FTFW1E50MFA00000')

  const { values, errors } = rules.cleanVehicleInput(row.fields)

  assert.deepEqual(errors, [])
  assert.equal(values.vin, '1FTFW1E50MFA00000')
  assert.equal(values.year, 2019)
  assert.equal(values.vehicle_fringe, true)
  assert.equal(values.irp_status, 'unknown')
})

test('mapCsvRow keeps unreadable statuses in notes and flags unusable rows', () => {
  const { keys } = rules.mapCsvHeaders(['Unit Number', 'Form 2290', 'Asset Type', 'Renewal Date', 'Status'])
  const row = rules.mapCsvRow(['12', 'Ask Sue', 'Snow plow', '31/31/2027', 'Sold'], keys, 3)

  assert.equal(row.fields.form_2290_notes, 'Ask Sue')
  assert.equal(row.fields.vehicle_type, 'other')
  assert.equal(row.fields.custom_type_label, 'Snow plow')
  assert.equal(row.warnings.length, 2)
  assert.match(row.problems[0], /Registration renewal date/)
  assert.equal(row.status, null)
  assert.equal(rules.rowMatchKey(row), 'unit:12')

  const empty = rules.mapCsvRow(['', '', '', '', ''], keys, 4)

  assert.match(empty.problems.at(-1), /VIN, unit number or license plate/)
})

test('cleanVehicleInput validates enums, numbers, dates, state, email and insurance dates', () => {
  const { errors } = rules.cleanVehicleInput({
    vehicle_type: 'spaceship',
    year: '1800',
    license_state: 'Texas',
    insurance_agent_email: 'nope',
    registration_renewal_date: '2026-02-30',
    insurance_effective_on: '2026-05-01',
    insurance_expires_on: '2026-04-01'
  })

  assert.equal(errors.length, 6)

  const ok = rules.cleanVehicleInput({ license_state: 'tx', gvwr_lbs: '26,001', dot_regulated: 'on' })

  assert.deepEqual(ok.errors, [])
  assert.equal(ok.values.license_state, 'TX')
  assert.equal(ok.values.gvwr_lbs, 26001)
  assert.equal(ok.values.dot_regulated, true)
  assert.equal(ok.values.vehicle_type, 'fleet_vehicle')
  assert.equal(ok.values.insurance_status, 'unknown')
})

test('cleanVehicleInput partial only returns the keys given', () => {
  const { values } = rules.cleanVehicleInput({ make: 'Ram', vehicle_fringe: '' }, { partial: true })

  assert.deepEqual(Object.keys(values).sort(), ['make', 'vehicle_fringe'])
})

test('parseDateText / parseMonthText', () => {
  assert.equal(rules.parseDateText('2026-01-05'), '2026-01-05')
  assert.equal(rules.parseDateText('1/5/26'), '2026-01-05')
  assert.equal(rules.parseDateText('2026-01-05T10:00:00Z'), '2026-01-05')
  assert.equal(rules.parseDateText('soon'), null)
  assert.equal(rules.parseMonthText('Sept'), 9)
  assert.equal(rules.parseMonthText('13'), null)
})

test('vehicleMatchKeys lines up with rowMatchKey', () => {
  assert.deepEqual(rules.vehicleMatchKeys({ vin: '1ftfw1e50mfa00000', unit_number: ' T-9 ', license_plate: 'ab 12' }), ['vin:1FTFW1E50MFA00000', 'unit:t-9', 'plate:AB12'])
  assert.equal(rules.rowMatchKey({ fields: { license_plate: 'ab 12' } }), 'plate:AB12')
})

test('inventory columns render labels and the export round-trips through the import', () => {
  const vehicle = {
    vehicle_number: 'VEH-000001',
    unit_number: '7',
    vehicle_type: 'trailer',
    status: 'active',
    insurance_status: 'insured',
    dot_regulated: true,
    vehicle_fringe: false,
    vin: '1FTFW1E50MFA00000',
    mileage: 1200,
    driver: { first_name: 'Pat', last_name: 'Driver', employee_number: 'E1' },
    locations: { name: 'Main' }
  }
  const header = rules.INVENTORY_COLUMNS.map(([name]) => name)
  const cells = rules.INVENTORY_COLUMNS.map(([, value]) => String(value(vehicle) ?? ''))

  assert.equal(cells[header.indexOf('Type')], 'Trailer')
  assert.equal(cells[header.indexOf('Insurance Status')], 'Insured')
  assert.equal(cells[header.indexOf('DOT Regulated')], 'Yes')

  const { keys } = rules.mapCsvHeaders(header)
  const row = rules.mapCsvRow(cells, keys, 2)

  assert.deepEqual(row.problems, [])
  assert.equal(row.fields.vehicle_type, 'trailer')
  assert.equal(row.fields.insurance_status, 'insured')
  assert.equal(row.fields.dot_regulated, 'true')
  assert.equal(row.status, 'active')
  assert.equal(row.driverEmployeeNumber, 'E1')
  assert.equal(row.location, 'Main')
  assert.equal(row.mileage, 1200)
})
