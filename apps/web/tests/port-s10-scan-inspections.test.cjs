/**
 * Port slice 10 (piece D): unit tests for the scan inspection rules (src/lib/forgeScanInspectionRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s10-scan-inspections.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeScanInspectionRules.ts'))

const items = [
  { id: 'a', prompt: 'Guards in place', response_type: 'pass_fail_na', is_required: true, finding_on: ['fail'] },
  { id: 'b', prompt: 'Horn works', response_type: 'yes_no_na', is_required: true, finding_on: ['no'] },
  { id: 'c', prompt: 'Hour meter', response_type: 'number', is_required: false, finding_on: [] },
  { id: 'd', prompt: 'Comments', response_type: 'text', is_required: false, finding_on: [] }
]

test('normalizeScanAnswer accepts only the answers each response type allows', () => {
  assert.deepEqual(rules.normalizeScanAnswer('pass_fail_na', 'PASS'), { value: 'pass' })
  assert.deepEqual(rules.normalizeScanAnswer('pass_fail_na', 'yes'), { error: 'Choose one of the answers.' })
  assert.deepEqual(rules.normalizeScanAnswer('yes_no_na', 'na'), { value: 'na' })
  assert.deepEqual(rules.normalizeScanAnswer('number', '12,5'), { value: '12.5' })
  assert.deepEqual(rules.normalizeScanAnswer('number', 'twelve'), { error: 'Enter a number.' })
  assert.deepEqual(rules.normalizeScanAnswer('text', '  ok  '), { value: 'ok' })
  assert.deepEqual(rules.normalizeScanAnswer('text', '   '), { value: null })
  assert.ok('error' in rules.normalizeScanAnswer('text', 'x'.repeat(2001)))
})

test('answerTriggersFinding follows the item finding_on list, not a fixed NO', () => {
  assert.equal(rules.answerTriggersFinding(items[0], 'fail'), true)
  assert.equal(rules.answerTriggersFinding(items[0], 'FAIL'), true)
  assert.equal(rules.answerTriggersFinding(items[0], 'na'), false)
  assert.equal(rules.answerTriggersFinding(items[1], 'no'), true)
  // A yes/no item left with the default ['fail'] never raises a finding (1.0 marked any NO).
  assert.equal(rules.answerTriggersFinding({ finding_on: ['fail'] }, 'no'), false)
  assert.equal(rules.answerTriggersFinding({ finding_on: null }, 'fail'), false)
  assert.equal(rules.answerTriggersFinding(items[0], null), false)
})

test('validateScanAnswers requires answers on required items and notes on answers that raise a finding', () => {
  assert.deepEqual(rules.validateScanAnswers(items, {}), { a: 'Answer this item.', b: 'Answer this item.' })

  const errors = rules.validateScanAnswers(items, {
    a: { value: 'fail', notes: '  ' },
    b: { value: 'yes', notes: null },
    c: { value: 'abc', notes: null }
  })

  assert.deepEqual(errors, { a: 'Describe the problem in the notes.', c: 'Enter a number.' })

  assert.deepEqual(
    rules.validateScanAnswers(items, { a: { value: 'fail', notes: 'Guard cracked' }, b: { value: 'na', notes: null }, c: { value: '4', notes: null } }),
    {}
  )
})

test('findingItems and scanInspectionResult', () => {
  const allPass = { a: { value: 'pass', notes: null }, b: { value: 'yes', notes: null } }
  const oneFail = { a: { value: 'fail', notes: 'Broken' }, b: { value: 'yes', notes: null } }

  assert.deepEqual(rules.findingItems(items, allPass), [])
  assert.equal(rules.scanInspectionResult(items, allPass), 'pass')
  assert.deepEqual(rules.findingItems(items, oneFail).map(item => item.id), ['a'])
  assert.equal(rules.scanInspectionResult(items, oneFail), 'fail')
  // A NO on an item that does not raise a finding still fails the inspection, as submitInspection does.
  assert.equal(rules.scanInspectionResult([{ ...items[1], finding_on: [] }], { b: { value: 'no', notes: null } }), 'fail')
})

test('finding text, inspection date and origin label', () => {
  assert.equal(rules.scanFindingTitle('  Guards in place '), 'Guards in place')
  assert.equal(rules.scanFindingTitle('x'.repeat(250)).length, 200)
  assert.equal(rules.scanFindingDescription('fail', 'Guard cracked', 'Sam Lee'), 'Guard cracked\n\nAnswer: FAIL.\n\nReported by Sam Lee from a QR scan.')
  assert.equal(rules.scanInspectionDate(new Date('2026-11-17T23:30:00.000Z')), '2026-11-17')
  assert.equal(rules.scanInspectionOriginLabel({ qrNumber: 'QR-0007', frequency: 'daily', assetName: 'Forklift 7' }), 'Started from QR QR-0007 · Daily · Forklift 7')
  assert.equal(rules.scanInspectionOriginLabel({ qrNumber: 'QR-0007', frequency: null }), 'Started from QR QR-0007')
})
