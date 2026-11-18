/**
 * Port slice 11: unit tests for vehicle QR targets in src/lib/forgeScanRules.ts (DVIR actions, service
 * status, history, record link, fleet permissions), plus the vehicle bits of forgeScanIssues and
 * forgeQrDestination.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s11-vehicle-scan.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeScanRules.ts'))
const issues = require(path.join(__dirname, '../src/lib/forgeScanIssues.ts'))
const destination = require(path.join(__dirname, '../src/lib/forgeQrDestination.ts'))

const V1 = '44444444-4444-4444-8444-444444444444'
const T1 = '11111111-1111-4111-8111-111111111111'
const F1 = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'cd'.repeat(24)

const anonymous = { kind: 'anonymous' }
const employee = { kind: 'employee', personnelId: T1, name: 'Pat Doe' }
const user = (...permissions) => ({ kind: 'user', userId: T1, personnelId: null, name: 'Sam', permissions })
const ids = actions => actions.map(action => action.id)

const vehicleMenu = (overrides = {}) =>
  rules.buildScanActions({
    targetType: 'vehicle',
    targetId: V1,
    token: TOKEN,
    accessMode: 'employee_number',
    config: rules.parseQrActionConfig({ inspectionTemplates: { daily: T1 } }),
    vehicleStatus: 'active',
    vehicleDotRegulated: true,
    lotoAvailable: true,
    forms: [],
    ...overrides
  })

const find = (actions, id) => actions.find(action => action.id === id)

test('DOT-regulated vehicle in service: DVIRs first, no frequency inspections, no LOTO', () => {
  const actions = vehicleMenu()

  assert.deepEqual(ids(actions), ['dvir_pre_trip', 'dvir_post_trip', 'report_issue', 'out_of_service', 'history', 'open_record'])
  assert.equal(find(actions, 'dvir_pre_trip').href, `/scan/${TOKEN}/dvir/pre_trip`)
  assert.equal(find(actions, 'dvir_post_trip').href, `/scan/${TOKEN}/dvir/post_trip`)
  assert.equal(find(actions, 'dvir_pre_trip').trip, 'pre_trip')
  assert.equal(find(actions, 'open_record').href, `/fleet/vehicles/${V1}`)
  assert.ok(actions.filter(action => action.id !== 'fill_form').every(action => action.subject === 'vehicle'))
})

test('non-DOT vehicle: no DVIRs, and still no frequency inspections', () => {
  assert.deepEqual(ids(vehicleMenu({ vehicleDotRegulated: false })), ['report_issue', 'out_of_service', 'history', 'open_record'])
})

test('out of service vehicle: DVIRs disappear, return to service offered', () => {
  assert.deepEqual(ids(vehicleMenu({ vehicleStatus: 'out_of_service' })), ['report_issue', 'return_to_service', 'history', 'open_record'])
})

test('inactive vehicle is not out of service (1.0 bug): DVIRs stay, mark out of service offered', () => {
  assert.deepEqual(ids(vehicleMenu({ vehicleStatus: 'inactive' })), ['dvir_pre_trip', 'dvir_post_trip', 'report_issue', 'out_of_service', 'history', 'open_record'])
})

test('removed / sold / disposed vehicle: only history and the record', () => {
  for (const status of ['removed', 'sold', 'disposed']) {
    assert.deepEqual(ids(vehicleMenu({ vehicleStatus: status })), ['history', 'open_record'], status)
  }
})

test('vehicle config toggles and linked forms', () => {
  const config = rules.parseQrActionConfig({ reportIssue: false, markOutOfService: false, history: false, formTemplateIds: [F1] })
  const actions = vehicleMenu({ config, forms: [{ id: F1, title: 'Fuel log' }] })

  assert.deepEqual(ids(actions), ['dvir_pre_trip', 'dvir_post_trip', 'fill_form', 'open_record'])
  assert.equal(find(actions, 'fill_form').subject, undefined)
  assert.deepEqual(ids(vehicleMenu({ vehicleStatus: 'out_of_service', config: rules.parseQrActionConfig({ returnToService: false }) })), ['report_issue', 'history', 'open_record'])
})

test('scanVehicleOffersDvir matches the fleet rule', () => {
  assert.equal(rules.scanVehicleOffersDvir('active', true), true)
  assert.equal(rules.scanVehicleOffersDvir('inactive', true), true)
  assert.equal(rules.scanVehicleOffersDvir('active', false), false)
  assert.equal(rules.scanVehicleOffersDvir('out_of_service', true), false)
  assert.equal(rules.scanVehicleOffersDvir('sold', true), false)
  assert.equal(rules.scanVehicleOffersDvir(null, null), false)
})

test('vehicle permissions: fleet permissions for signed-in users, employees as field workers', () => {
  const actions = vehicleMenu()
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const can = (id, viewer, mode = 'employee_number', cfg = config) => rules.canUseScanAction(find(actions, id), viewer, mode, cfg)

  // DVIR
  assert.equal(can('dvir_pre_trip', employee), true)
  assert.equal(can('dvir_post_trip', anonymous, 'public_report'), false)
  assert.equal(can('dvir_pre_trip', user('fleet.dvir')), true)
  assert.equal(can('dvir_pre_trip', user('inspections.create', 'fleet.view')), false)

  // Report
  assert.equal(can('report_issue', anonymous), false)
  assert.equal(can('report_issue', anonymous, 'public_report'), true)
  assert.equal(can('report_issue', user()), true)

  // Out of service: fleet.edit or qr_management.service_status; assets_equipment.edit is not enough
  assert.equal(can('out_of_service', employee), true)
  assert.equal(can('out_of_service', user('fleet.edit')), true)
  assert.equal(can('out_of_service', user('qr_management.service_status')), true)
  assert.equal(can('out_of_service', user('assets_equipment.edit')), false)

  // History: fleet.view or view_scans
  assert.equal(can('history', employee), true)
  assert.equal(can('history', user('fleet.view')), true)
  assert.equal(can('history', user('qr_management.view_scans')), true)
  assert.equal(can('history', user('assets_equipment.view')), false)

  // Record: fleet.view only, signed in
  assert.equal(can('open_record', user('fleet.view')), true)
  assert.equal(can('open_record', user('assets_equipment.view')), false)
  assert.equal(can('open_record', employee), false)

  // Return to service
  const oos = vehicleMenu({ vehicleStatus: 'out_of_service' })
  const rts = find(oos, 'return_to_service')

  assert.equal(rules.canUseScanAction(rts, employee, 'employee_number', config), false)
  assert.equal(rules.canUseScanAction(rts, employee, 'employee_number', { ...config, employeeReturnToService: true }), true)
  assert.equal(rules.canUseScanAction(rts, user('fleet.edit'), 'employee_number', config), true)
  assert.equal(rules.canUseScanAction(rts, user('assets_equipment.edit'), 'employee_number', config), false)
})

test('vehicle menu locking: anonymous on an employee QR sees DVIRs locked behind identify', () => {
  const actions = vehicleMenu()
  const menu = rules.scanMenuForViewer(actions, anonymous, 'employee_number', rules.DEFAULT_QR_ACTION_CONFIG)

  assert.equal(find(menu, 'dvir_pre_trip').locked, 'identify')
  assert.equal(find(menu, 'out_of_service').locked, 'identify')
  assert.equal(find(menu, 'open_record').locked, 'sign_in')

  const signedIn = rules.scanMenuForViewer(actions, user('fleet.view'), 'employee_number', rules.DEFAULT_QR_ACTION_CONFIG)

  assert.deepEqual(ids(signedIn), ['report_issue', 'history', 'open_record'])

  const signedInOnly = rules.scanMenuForViewer(actions, anonymous, 'signed_in', rules.DEFAULT_QR_ACTION_CONFIG)

  assert.equal(find(signedInOnly, 'dvir_pre_trip').locked, 'sign_in')
})

test('asset menus are unchanged by the vehicle fields', () => {
  const asset = rules.buildScanActions({
    targetType: 'asset',
    targetId: T1,
    token: TOKEN,
    accessMode: 'employee_number',
    config: rules.parseQrActionConfig({ inspectionTemplates: { daily: T1 } }),
    assetStatus: 'active',
    vehicleStatus: 'active',
    vehicleDotRegulated: true,
    lotoAvailable: true,
    forms: []
  })

  assert.deepEqual(ids(asset), ['report_issue', 'inspect_daily', 'out_of_service', 'history', 'view_loto', 'open_record'])
  assert.ok(asset.every(action => action.subject === undefined))
})

test('dvir_submit scan event label', () => {
  assert.ok(rules.SCAN_EVENT_ACTIONS.includes('dvir_submit'))
  assert.equal(rules.SCAN_EVENT_LABELS.dvir_submit, 'DVIR submitted')
})

test('issue reports can tag vehicles out of service', () => {
  assert.equal(issues.shouldMarkOutOfService({ targetType: 'vehicle', viewerMayMarkOutOfService: true, requested: true, immediateHazard: false }), true)
  assert.equal(issues.shouldMarkOutOfService({ targetType: 'vehicle', viewerMayMarkOutOfService: true, requested: false, immediateHazard: true }), true)
  assert.equal(issues.shouldMarkOutOfService({ targetType: 'vehicle', viewerMayMarkOutOfService: false, requested: true, immediateHazard: true }), false)

  const text = issues.issueCapaDescription({
    description: 'Brake light out',
    qrNumber: 'QR-1',
    targetName: 'Unit 7',
    reportId: V1,
    category: null,
    immediateHazard: false,
    reporter: 'Pat',
    outOfService: true,
    photoCount: 0,
    noun: 'vehicle'
  })

  assert.match(text, /The vehicle was marked out of service/)
})

test('QR admin helpers: vehicles open only the scan menu, record links', () => {
  assert.deepEqual(destination.allowedQrDefaultActions('vehicle'), ['scan_menu'])
  assert.equal(destination.QR_TARGET_TYPE_LABELS.vehicle, 'Fleet vehicle')
  assert.equal(destination.scanRecordHref('vehicle', V1), `/fleet/vehicles/${V1}`)
  assert.equal(destination.SCAN_RECORD_TYPE_LABELS.vehicle, 'Vehicle')
})
