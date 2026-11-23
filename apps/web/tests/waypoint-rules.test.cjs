/**
 * Forge Waypoint, phase 0: unit tests for src/lib/forgeWaypointRules.ts (status light, input validation, change
 * tracking, emergency rows) and the scan menu for area QRs (src/lib/forgeScanRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/waypoint-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeWaypointRules.ts'))
const scan = require(path.join(__dirname, '../src/lib/forgeScanRules.ts'))

const LOC = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'cd'.repeat(24)
const lookups = {
  hazardKeys: ['noise', 'chemical', 'forklift_traffic'],
  ppeKeys: ['safety_glasses', 'hearing_protection']
}

const base = { restrictedEntry: false, entryRequirements: null, activeLockouts: [], outOfService: [], openIssues: 0 }

test('areaStatus: clear when nothing is going on', () => {
  const status = rules.areaStatus(base)

  assert.equal(status.level, 'clear')
  assert.equal(status.label, 'Clear')
  assert.deepEqual(status.reasons, [])
})

test('areaStatus: out of service or open issues is caution', () => {
  assert.equal(rules.areaStatus({ ...base, outOfService: [{ assetName: 'Press 4' }] }).level, 'caution')
  assert.equal(rules.areaStatus({ ...base, openIssues: 2 }).level, 'caution')
  assert.deepEqual(rules.areaStatus({ ...base, openIssues: 1 }).reasons, ['1 open issue reported here'])
})

test('areaStatus: restricted entry or an active lockout is stop, reasons most serious first', () => {
  const status = rules.areaStatus({
    ...base,
    restrictedEntry: true,
    entryRequirements: 'Confined space permit',
    activeLockouts: [{ assetName: 'Mixer 2' }],
    outOfService: [{ assetName: 'Press 4' }],
    openIssues: 3
  })

  assert.equal(status.level, 'stop')
  assert.deepEqual(status.reasons, [
    'Restricted entry: Confined space permit',
    'Locked out now: Mixer 2',
    'Out of service: Press 4',
    '3 open issues reported here'
  ])

  assert.equal(rules.areaStatus({ ...base, activeLockouts: [{ assetName: 'Mixer 2' }] }).level, 'stop')
  assert.deepEqual(rules.areaStatus({ ...base, restrictedEntry: true }).reasons, [
    'Restricted entry. Authorized people only.'
  ])
})

test('areaStatus: anonymous viewers get counts, never equipment names', () => {
  const status = rules.areaStatus(
    { ...base, activeLockouts: [{ assetName: 'Mixer 2' }], outOfService: [{ assetName: 'A' }, { assetName: 'B' }] },
    { detailed: false }
  )
  const text = status.reasons.join(' ')

  assert.equal(status.level, 'stop')
  assert.ok(!text.includes('Mixer 2'))
  assert.match(text, /1 piece of equipment is locked out now/)
  assert.match(text, /2 pieces of equipment are out of service/)
})

test('areaStatus: long equipment lists are shortened', () => {
  const items = ['A', 'B', 'C', 'D', 'E'].map(assetName => ({ assetName }))

  assert.deepEqual(rules.areaStatus({ ...base, outOfService: items }).reasons, ['Out of service: A, B, C and 2 more'])
})

test('parseAreaInput: requires a name and a location', () => {
  const result = rules.parseAreaInput({ name: '  ', locationId: 'nope' }, lookups)

  assert.equal(result.ok, false)
  assert.ok(result.errors.name)
  assert.ok(result.errors.locationId)
})

test('parseAreaInput: trims, keeps only known lookup keys once, and reads checkbox values', () => {
  const result = rules.parseAreaInput(
    {
      name: '  Paint Booth 2 ',
      code: ' PB-2 ',
      locationId: LOC,
      hazards: ['chemical', 'chemical', 'unknown', 'noise'],
      requiredPpe: 'safety_glasses,respirator',
      restrictedEntry: 'on',
      musterPoint: ' North lot ',
      nearestExit: ''
    },
    lookups
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.name, 'Paint Booth 2')
  assert.equal(result.value.code, 'PB-2')
  assert.deepEqual(result.value.hazards, ['chemical', 'noise'])
  assert.deepEqual(result.value.requiredPpe, ['safety_glasses'])
  assert.equal(result.value.restrictedEntry, true)
  assert.equal(result.value.musterPoint, 'North lot')
  assert.equal(result.value.nearestExit, null)
})

test('parseAreaInput: length limits', () => {
  const result = rules.parseAreaInput(
    {
      name: 'x'.repeat(121),
      code: 'y'.repeat(41),
      locationId: LOC,
      nearestEyewash: 'z'.repeat(301),
      emergencyNotes: 'n'.repeat(1001)
    },
    lookups
  )

  assert.equal(result.ok, false)
  assert.deepEqual(Object.keys(result.errors).sort(), ['code', 'emergencyNotes', 'name', 'nearestEyewash'])
})

test('changedAreaFields / describeAreaChanges', () => {
  const parsed = rules.parseAreaInput({ name: 'Bay 3', locationId: LOC, requiredPpe: ['hearing_protection'] }, lookups)
  const row = rules.areaInputToRow(parsed.value)
  const before = { ...row, required_ppe: [], muster_point: 'Lot A' }
  const changed = rules.changedAreaFields(before, row)

  assert.deepEqual(changed.sort(), ['muster_point', 'required_ppe'])
  assert.equal(rules.describeAreaChanges(['required_ppe', 'muster_point']), 'Updated required PPE, muster point.')
  assert.equal(rules.describeAreaChanges([]), 'No changes.')
})

test('areaEmergencyRows skips blanks and keeps reading order', () => {
  assert.deepEqual(
    rules.areaEmergencyRows({
      nearest_exit: ' East door ',
      muster_point: '',
      nearest_eyewash: null,
      nearest_extinguisher: 'By the door',
      nearest_first_aid: '  '
    }),
    [
      { label: 'Nearest exit', value: 'East door' },
      { label: 'Fire extinguisher', value: 'By the door' }
    ]
  )
})

test('optionLabels keeps keys the tenant no longer has', () => {
  assert.deepEqual(rules.optionLabels(['noise', 'old_key'], [{ key: 'noise', label: 'High noise' }]), [
    { key: 'noise', label: 'High noise' },
    { key: 'old_key', label: 'old key' }
  ])
})

test('scan menu: area QRs work like location QRs (report, inspections, forms; no equipment actions)', () => {
  assert.ok(scan.SCAN_TARGET_TYPES.includes('area'))

  const actions = scan.buildScanActions({
    targetType: 'area',
    targetId: LOC,
    token: TOKEN,
    accessMode: 'employee_number',
    config: scan.parseQrActionConfig({ inspectionTemplates: { weekly: LOC } }),
    forms: [{ id: LOC, title: 'Area walkthrough' }]
  })

  assert.deepEqual(
    actions.map(action => action.id),
    ['report_issue', 'inspect_weekly', 'fill_form']
  )

  const employee = { kind: 'employee', personnelId: LOC, name: 'Pat' }
  const menu = scan.scanMenuForViewer(actions, employee, 'employee_number', scan.parseQrActionConfig({}))

  assert.deepEqual(
    menu.map(action => [action.id, action.locked || null]),
    [
      ['report_issue', null],
      ['inspect_weekly', null],
      ['fill_form', 'sign_in']
    ]
  )
})
