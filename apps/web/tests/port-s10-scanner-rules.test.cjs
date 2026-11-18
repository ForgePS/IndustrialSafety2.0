/**
 * Port slice 10: unit tests for src/lib/forgeScanRules.ts (action config parsing, the scan menu per
 * target and asset status, who may use which action, menu locking, and reading a token from QR text).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s10-scanner-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeScanRules.ts'))

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const F1 = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'ab'.repeat(24)

const anonymous = { kind: 'anonymous' }
const employee = { kind: 'employee', personnelId: T1, name: 'Pat Doe' }
const user = (...permissions) => ({ kind: 'user', userId: T2, personnelId: null, name: 'Sam', permissions })
const ids = actions => actions.map(action => action.id)

const menu = (overrides = {}) =>
  rules.buildScanActions({
    targetType: 'asset',
    targetId: T1,
    token: TOKEN,
    accessMode: 'employee_number',
    config: rules.parseQrActionConfig({ inspectionTemplates: { daily: T1 } }),
    assetStatus: 'active',
    lotoAvailable: true,
    forms: [],
    ...overrides
  })

test('parseQrActionConfig: defaults for junk input', () => {
  for (const junk of [null, undefined, 'x', 42, [], [1, 2], true]) {
    assert.deepEqual(rules.parseQrActionConfig(junk), rules.DEFAULT_QR_ACTION_CONFIG)
  }
})

test('parseQrActionConfig: camelCase, snake_case aliases and string booleans', () => {
  const config = rules.parseQrActionConfig({
    report_issue: false,
    mark_out_of_service: 'false',
    return_to_service: false,
    employee_return_to_service: 'true',
    out_of_service_on_failed_inspection: false,
    equipment_history: false,
    view_loto: false,
    inspection_templates: { Daily: T1, WEEKLY: T2, monthly: 'not-a-uuid', yearly: T1 },
    form_template_ids: [F1, F1, 'nope', 7, T2]
  })

  assert.equal(config.reportIssue, false)
  assert.equal(config.markOutOfService, false)
  assert.equal(config.returnToService, false)
  assert.equal(config.employeeReturnToService, true)
  assert.equal(config.outOfServiceOnFailedInspection, false)
  assert.equal(config.history, false)
  assert.equal(config.lotoView, false)
  assert.deepEqual(config.inspectionTemplates, { daily: T1, weekly: T2 })
  assert.deepEqual(config.formTemplateIds, [F1, T2])

  const camel = rules.parseQrActionConfig({ reportIssue: false, viewLoto: true, lotoView: false, history: 'yes', formTemplateIds: 'x' })

  assert.equal(camel.reportIssue, false)
  assert.equal(camel.lotoView, false, 'first known key wins')
  assert.equal(camel.history, true, 'unrecognized value falls back to the default')
  assert.deepEqual(camel.formTemplateIds, [])
})

test('parseQrActionConfig caps form templates at 20 and parseScanAccessMode falls back to signed_in', () => {
  const many = Array.from({ length: 30 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`)

  assert.equal(rules.parseQrActionConfig({ formTemplateIds: many }).formTemplateIds.length, 20)
  assert.equal(rules.parseScanAccessMode('employee_number'), 'employee_number')
  assert.equal(rules.parseScanAccessMode('public_report'), 'public_report')
  assert.equal(rules.parseScanAccessMode('admin'), 'signed_in')
  assert.equal(rules.parseScanAccessMode(null), 'signed_in')
  assert.equal(rules.allowsEmployeeIdentification('signed_in'), false)
  assert.equal(rules.allowsEmployeeIdentification('employee_number'), true)
  assert.equal(rules.allowsEmployeeIdentification('public_report'), true)
})

test('buildScanActions: asset in service', () => {
  const actions = menu()

  assert.deepEqual(ids(actions), ['report_issue', 'inspect_daily', 'out_of_service', 'history', 'view_loto', 'open_record'])
  assert.equal(actions.find(a => a.id === 'view_loto').href, `/q/${TOKEN}/loto`)
  assert.equal(actions.find(a => a.id === 'open_record').href, `/assets/${T1}`)
  assert.equal(actions.find(a => a.id === 'inspect_daily').templateId, T1)
})

test('buildScanActions: asset out of service offers return to service, not out of service', () => {
  const actions = ids(menu({ assetStatus: 'out_of_service' }))

  assert.ok(actions.includes('return_to_service'))
  assert.ok(!actions.includes('out_of_service'))
})

test('buildScanActions: retired asset has no inspections or service changes; no LOTO without a procedure', () => {
  assert.deepEqual(ids(menu({ assetStatus: 'retired', lotoAvailable: false })), ['report_issue', 'history', 'open_record'])
})

test('buildScanActions: config switches actions off', () => {
  const config = rules.parseQrActionConfig({ reportIssue: false, markOutOfService: false, history: false, lotoView: false })

  assert.deepEqual(ids(menu({ config })), ['open_record'])
  assert.deepEqual(ids(menu({ config: rules.parseQrActionConfig({ returnToService: false }), assetStatus: 'out_of_service' })), [
    'report_issue',
    'history',
    'view_loto',
    'open_record'
  ])
})

test('buildScanActions: location and form targets', () => {
  const config = rules.parseQrActionConfig({ inspectionTemplates: { weekly: T2 } })
  const location = menu({ targetType: 'location', config, assetStatus: null, forms: [{ id: F1, title: 'Daily huddle' }] })

  assert.deepEqual(ids(location), ['report_issue', 'inspect_weekly', 'fill_form'])
  assert.equal(location[2].href, `/forms/fill/${F1}`)
  assert.equal(location[2].label, 'Fill out: Daily huddle')

  const form = menu({ targetType: 'form', config, assetStatus: null, forms: [{ id: F1, title: 'JHA' }] })

  assert.deepEqual(ids(form), ['report_issue', 'fill_form'], 'form QRs have no inspections')
})

test('canUseScanAction: anonymous', () => {
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const all = menu({ forms: [{ id: F1, title: 'F' }] }).concat(menu({ assetStatus: 'out_of_service' }))
  const allowed = mode => [...new Set(all.filter(a => rules.canUseScanAction(a, anonymous, mode, config)).map(a => a.id))]

  assert.deepEqual(allowed('employee_number'), ['view_loto'])
  assert.deepEqual(allowed('signed_in'), ['view_loto'])
  assert.deepEqual(allowed('public_report'), ['report_issue', 'view_loto'])
})

test('canUseScanAction: employee, with and without employeeReturnToService', () => {
  const all = menu({ forms: [{ id: F1, title: 'F' }] }).concat(menu({ assetStatus: 'out_of_service' }))
  const allowed = config => [...new Set(all.filter(a => rules.canUseScanAction(a, employee, 'employee_number', config)).map(a => a.id))].sort()

  assert.deepEqual(allowed(rules.DEFAULT_QR_ACTION_CONFIG), ['history', 'inspect_daily', 'out_of_service', 'report_issue', 'view_loto'])
  assert.deepEqual(allowed(rules.parseQrActionConfig({ employeeReturnToService: true })), [
    'history',
    'inspect_daily',
    'out_of_service',
    'report_issue',
    'return_to_service',
    'view_loto'
  ])
})

test('canUseScanAction: signed-in user by permission', () => {
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const all = menu({ forms: [{ id: F1, title: 'F' }] }).concat(menu({ assetStatus: 'out_of_service' }))
  const allowed = viewer => [...new Set(all.filter(a => rules.canUseScanAction(a, viewer, 'signed_in', config)).map(a => a.id))].sort()

  assert.deepEqual(allowed(user()), ['report_issue', 'view_loto'], 'any member can report')
  assert.deepEqual(allowed(user('inspections.create')), ['inspect_daily', 'report_issue', 'view_loto'])
  assert.deepEqual(allowed(user('qr_management.service_status')), ['out_of_service', 'report_issue', 'return_to_service', 'view_loto'])
  assert.deepEqual(allowed(user('assets_equipment.edit')), ['out_of_service', 'report_issue', 'return_to_service', 'view_loto'])
  assert.deepEqual(allowed(user('assets_equipment.view')), ['history', 'open_record', 'report_issue', 'view_loto'])
  assert.deepEqual(allowed(user('qr_management.view_scans')), ['history', 'report_issue', 'view_loto'])
  assert.deepEqual(allowed(user('forms.submit')), ['fill_form', 'report_issue', 'view_loto'])
  assert.equal(rules.canUseScanAction({ id: 'bogus' }, user('assets_equipment.edit'), 'signed_in', config), false)
})

test('scanMenuForViewer: anonymous on an employee-number QR sees locked actions', () => {
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const result = rules.scanMenuForViewer(menu({ forms: [{ id: F1, title: 'F' }] }), anonymous, 'employee_number', config)
  const locks = Object.fromEntries(result.map(a => [a.id, a.locked || null]))

  assert.deepEqual(locks, {
    report_issue: 'identify',
    inspect_daily: 'identify',
    out_of_service: 'identify',
    history: 'identify',
    view_loto: null,
    fill_form: 'sign_in',
    open_record: 'sign_in'
  })
})

test('scanMenuForViewer: anonymous on a signed-in QR is told to sign in; public_report opens reporting', () => {
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const signedIn = rules.scanMenuForViewer(menu(), anonymous, 'signed_in', config)

  assert.ok(signedIn.filter(a => a.id !== 'view_loto').every(a => a.locked === 'sign_in'))

  const publicReport = rules.scanMenuForViewer(menu(), anonymous, 'public_report', config)

  assert.equal(publicReport.find(a => a.id === 'report_issue').locked, undefined)
  assert.equal(publicReport.find(a => a.id === 'history').locked, 'identify')
})

test('scanMenuForViewer: employee and user', () => {
  const config = rules.DEFAULT_QR_ACTION_CONFIG
  const oos = menu({ assetStatus: 'out_of_service', forms: [{ id: F1, title: 'F' }] })
  const asEmployee = rules.scanMenuForViewer(oos, employee, 'employee_number', config)

  assert.equal(asEmployee.find(a => a.id === 'report_issue').locked, undefined)
  assert.equal(asEmployee.find(a => a.id === 'return_to_service'), undefined, 'employees never see return to service unless allowed')
  assert.equal(asEmployee.find(a => a.id === 'fill_form').locked, 'sign_in')
  assert.equal(asEmployee.find(a => a.id === 'open_record').locked, 'sign_in')

  const allowedEmployee = rules.scanMenuForViewer(oos, employee, 'employee_number', rules.parseQrActionConfig({ employeeReturnToService: true }))

  assert.equal(allowedEmployee.find(a => a.id === 'return_to_service').locked, undefined)

  const asUser = rules.scanMenuForViewer(oos, user('assets_equipment.view'), 'employee_number', config)

  assert.deepEqual(ids(asUser), ['report_issue', 'history', 'view_loto', 'open_record'], 'users only see what they can use')
  assert.ok(asUser.every(a => !a.locked))
})

test('extractTokenFromQrText', () => {
  const token = 'a1'.repeat(24)
  const upper = token.toUpperCase()

  assert.equal(rules.extractTokenFromQrText(token), token)
  assert.equal(rules.extractTokenFromQrText(`  ${upper}  `), token)
  assert.equal(rules.extractTokenFromQrText(`https://forge.example.com/q/${token}`), token)
  assert.equal(rules.extractTokenFromQrText(`https://forge.example.com/scan/${upper}/history?x=1`), token)
  assert.equal(rules.extractTokenFromQrText(`/q/${token}?utm=1`), token)
  assert.equal(rules.extractTokenFromQrText(`/scan/${token}#top`), token)
  assert.equal(rules.extractTokenFromQrText(`/q/${token}0`), null, 'too long')
  assert.equal(rules.extractTokenFromQrText(token.slice(1)), null, 'too short')
  assert.equal(rules.extractTokenFromQrText(`https://example.com/other/${token}`), null)
  assert.equal(rules.extractTokenFromQrText('hello'), null)
  assert.equal(rules.extractTokenFromQrText(''), null)
  assert.equal(rules.extractTokenFromQrText(null), null)
  assert.equal(rules.scanPath(token), `/scan/${token}`)
})
