/**
 * Port slice 10 (agent A): unit tests for the QR admin helpers in src/lib/forgeQrDestination.ts.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s10-qr-admin.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const qr = require(path.join(__dirname, '../src/lib/forgeQrDestination.ts'))
const rules = require(path.join(__dirname, '../src/lib/forgeScanRules.ts'))

const NOW = new Date('2026-11-17T12:00:00Z')
const daysAgo = days => new Date(NOW.getTime() - days * 86400000).toISOString()

test('allowedQrDefaultActions: asset QRs keep the direct actions plus scan_menu; others only scan_menu', () => {
  assert.deepEqual(qr.allowedQrDefaultActions('asset'), ['scan_menu', 'asset_record', 'maintenance', 'meter_reading', 'loto_view'])
  assert.deepEqual(qr.allowedQrDefaultActions('location'), ['scan_menu'])
  assert.deepEqual(qr.allowedQrDefaultActions('form'), ['scan_menu'])
})

test('summarizeQrScans counts the action names the scan pages write, last 30 days, ok only', () => {
  const rows = [
    { action: 'open', scanned_at: daysAgo(1) },
    { action: 'open', destination_path: '/assets/x', scanned_at: daysAgo(2) },
    { destination_path: '/assets/x', scanned_at: daysAgo(3) },
    { action: 'open', scanned_at: daysAgo(40) },
    { action: 'inspection_start', scanned_at: daysAgo(1) },
    { action: 'inspection_complete', scanned_at: daysAgo(1) },
    { action: 'report_issue', scanned_at: daysAgo(5) },
    { action: 'report_issue', result: 'denied', scanned_at: daysAgo(5) },
    { action: 'out_of_service', scanned_at: daysAgo(5) },
    { action: 'return_to_service', scanned_at: daysAgo(4) },
    { action: 'identify', scanned_at: daysAgo(4) },
    // 1.0's analytics counted these names, which were never written; they must not count here.
    { action: 'issue_reported', scanned_at: daysAgo(1) },
    { action: 'inspection_started', scanned_at: daysAgo(1) }
  ]

  assert.deepEqual(qr.summarizeQrScans(rows, { now: NOW }), {
    scans: 3,
    inspectionsStarted: 1,
    inspectionsCompleted: 1,
    issuesReported: 1,
    outOfService: 1,
    returnedToService: 1
  })
})

test('every counted action name is a real scan event action', () => {
  for (const name of ['open', 'inspection_start', 'inspection_complete', 'report_issue', 'out_of_service', 'return_to_service']) {
    assert.ok(rules.SCAN_EVENT_ACTIONS.includes(name), name)
  }
})

test('describeQrScanEvent labels legacy redirect rows and scan-menu rows', () => {
  assert.equal(qr.describeQrScanEvent({ action: 'open', destination_path: '/assets/a/maintenance/create' }, 'Forklift'), 'Log maintenance · Forklift')
  assert.equal(qr.describeQrScanEvent({ destination_path: '/assets/a' }), 'Open asset')
  assert.equal(qr.describeQrScanEvent({ action: 'open', destination_path: null }), 'Opened scan menu')
  assert.equal(qr.describeQrScanEvent({ action: 'report_issue' }), 'Issue reported')
  assert.equal(qr.describeQrScanEvent({ action: 'return_to_service' }), 'Returned to service')
  assert.equal(qr.describeQrScanEvent({ action: 'something_new' }), 'something new')
})

test('scanRecordHref links known record types', () => {
  assert.equal(qr.scanRecordHref('inspection', 'i1'), '/inspections/i1')
  assert.equal(qr.scanRecordHref('corrective_action', 'c1'), '/corrective-actions/c1')
  assert.equal(qr.scanRecordHref('asset', 'a1'), '/assets/a1')
  assert.equal(qr.scanRecordHref('form_submission', 's1'), '/forms/submissions/s1')
  assert.equal(qr.scanRecordHref('form', 'f1'), '/forms/fill/f1')
  assert.equal(qr.scanRecordHref('qr_issue_report', 'r1'), null)
  assert.equal(qr.scanRecordHref('inspection', null), null)
  assert.equal(qr.scanRecordHref(null, 'x'), null)
})

test('qrConfigReferences lists each referenced template and form once', () => {
  const t = '11111111-1111-4111-8111-111111111111'
  const f = '22222222-2222-4222-8222-222222222222'
  const config = rules.parseQrActionConfig({ inspectionTemplates: { daily: t, weekly: t, monthly: 'bad' }, formTemplateIds: [f, f, 'nope'] })

  assert.deepEqual(qr.qrConfigReferences(config), { inspectionTemplateIds: [t], formTemplateIds: [f] })
})

test('assetStatusLabel and source labels', () => {
  assert.equal(qr.assetStatusLabel(null), 'New')
  assert.equal(qr.assetStatusLabel('out_of_service'), 'Out of service')
  assert.equal(qr.assetStatusLabel('active', { active: 'Active' }), 'Active')
  assert.equal(qr.assetStatusLabel('in_repair'), 'in repair')
  assert.equal(qr.ASSET_STATUS_SOURCE_LABELS.qr_scan, 'QR scan')
})

test('every access mode has plain-language help', () => {
  for (const mode of rules.SCAN_ACCESS_MODES) assert.ok(qr.QR_ACCESS_MODE_HELP[mode], mode)
})
