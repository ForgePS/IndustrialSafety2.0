/**
 * Port slice 17: unit tests for src/lib/forgeEnvironmentalRules.ts (permits, obligations and their schedule,
 * environmental events and closing them, hazardous waste manifests).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s17-environmental-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeEnvironmentalRules.ts'))

const TODAY = '2026-11-20'
const NOW = '2026-11-20T15:00:00.000Z'
const L1 = '00000000-0000-4000-8000-000000000001'

test('dates: addMonths clamps to the end of the month', () => {
  assert.equal(rules.addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(rules.addMonths('2028-01-31', 1), '2028-02-29')
  assert.equal(rules.addMonths('2026-11-30', 3), '2027-02-28')
  assert.equal(rules.addMonths('2026-12-15', 12), '2027-12-15')
  assert.equal(rules.daysBetween('2026-10-01', '2026-11-20'), 50)
})

test('cleanPermitInput and permitState', () => {
  const base = { title: ' Title V air permit ', permitNumber: 'TV-0042', permitType: 'air', agency: 'LDEQ', locationId: L1, status: 'active', effectiveOn: '2024-01-01', expiresOn: '2029-01-01' }

  assert.match(rules.cleanPermitInput({ ...base, title: '' }).error, /name/)
  assert.match(rules.cleanPermitInput({ ...base, permitType: 'x' }).error, /type/)
  assert.match(rules.cleanPermitInput({ ...base, agency: '' }).error, /agency/)
  assert.match(rules.cleanPermitInput({ ...base, permitNumber: '' }).error, /number/)
  assert.match(rules.cleanPermitInput({ ...base, expiresOn: '2023-12-31' }).error, /expire before/)
  assert.match(rules.cleanPermitInput({ ...base, expiresOn: '2029-02-30' }).error, /valid dates/)
  assert.equal(rules.cleanPermitInput({ ...base, status: 'pending', permitNumber: '' }).permitNumber, null)
  assert.equal(rules.cleanPermitInput(base).title, 'Title V air permit')

  const state = (patch) => rules.permitState({ status: 'active', effective_on: '2024-01-01', expires_on: '2029-01-01', ...patch }, TODAY)

  assert.equal(state({}), 'active')
  assert.equal(state({ expires_on: '2027-01-15' }), 'expiring')
  assert.equal(state({ expires_on: '2026-11-19' }), 'expired')
  assert.equal(state({ effective_on: '2027-01-01' }), 'not_yet')
  assert.equal(state({ status: 'pending' }), 'pending')
  assert.equal(state({ status: 'terminated', expires_on: '2020-01-01' }), 'terminated')
  assert.equal(state({ expires_on: null }), 'active')
})

test('obligations: input, schedule and state', () => {
  const base = { title: 'Quarterly DMR', obligationType: 'report', frequency: 'quarterly', nextDueOn: '2026-12-31', locationId: L1 }

  assert.match(rules.cleanObligationInput({ ...base, title: '' }).error, /done/)
  assert.match(rules.cleanObligationInput({ ...base, frequency: 'daily' }).error, /often/)
  assert.match(rules.cleanObligationInput({ ...base, nextDueOn: '' }).error, /next due/)
  assert.match(rules.cleanObligationInput({ ...base, permitId: 'x' }).error, /permit/)
  assert.equal(rules.cleanObligationInput(base).permitId, null)

  assert.equal(rules.advanceDue('2026-12-31', 'quarterly'), '2027-03-31')
  assert.equal(rules.advanceDue('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(rules.advanceDue('2026-11-20', 'weekly'), '2026-11-27')
  assert.equal(rules.advanceDue('2026-06-30', 'semiannual'), '2026-12-30')
  assert.equal(rules.advanceDue('2026-11-20', 'annual'), '2027-11-20')
  assert.equal(rules.advanceDue('2026-11-20', 'one_time'), null)

  assert.match(rules.cleanCompletion({ completedOn: '2026-11-21', result: 'done' }, TODAY).error, /future/)
  assert.match(rules.cleanCompletion({ completedOn: TODAY, result: 'issue' }, TODAY).error, /problem/)
  assert.deepEqual(rules.cleanCompletion({ completedOn: TODAY, result: 'done', notes: ' ' }, TODAY), { completedOn: TODAY, result: 'done', notes: null })

  assert.equal(rules.obligationState({ active: true, next_due_on: '2026-11-19' }, TODAY), 'overdue')
  assert.equal(rules.obligationState({ active: true, next_due_on: '2026-12-01' }, TODAY), 'due_soon')
  assert.equal(rules.obligationState({ active: true, next_due_on: '2027-01-01' }, TODAY), 'ok')
  assert.equal(rules.obligationState({ active: false, next_due_on: '2026-01-01' }, TODAY), 'inactive')
})

test('cleanEventInput', () => {
  const base = { eventType: 'spill_release', occurredAt: '2026-11-20T09:30Z', locationId: L1, substance: 'Diesel', quantity: '15', unit: 'gal', media: ['soil'], description: 'Tank overfill' }

  assert.match(rules.cleanEventInput({ ...base, eventType: 'x' }, NOW).error, /type/)
  assert.match(rules.cleanEventInput({ ...base, occurredAt: '2026-11-21T09:30Z' }, NOW).error, /future/)
  assert.match(rules.cleanEventInput({ ...base, substance: '' }, NOW).error, /spilled/)
  assert.match(rules.cleanEventInput({ ...base, quantity: '-1' }, NOW).error, /quantity/)
  assert.match(rules.cleanEventInput({ ...base, unit: 'cups' }, NOW).error, /unit/)
  assert.match(rules.cleanEventInput({ ...base, media: [] }, NOW).error, /where/)
  assert.match(rules.cleanEventInput({ ...base, media: ['moon'] }, NOW).error, /list/)
  assert.match(rules.cleanEventInput({ ...base, agencyNotifiedAt: '2026-11-20T08:00Z' }, NOW).error, /before it happened/)
  assert.match(rules.cleanEventInput({ ...base, agencyNotifiedAt: '2026-11-20T10:00Z' }, NOW).error, /Name the agency/)
  assert.match(rules.cleanEventInput({ ...base, description: '' }, NOW).error, /Describe/)

  const event = rules.cleanEventInput({ ...base, media: ['soil', 'stormwater', 'soil'], reportable: true, agencyName: 'NRC', agencyNotifiedAt: '2026-11-20T10:00Z' }, NOW)

  assert.equal(event.quantity, 15)
  assert.deepEqual(event.media, ['stormwater', 'soil'], 'fixed order, no duplicates')
  assert.equal(event.reportable, true)

  const complaint = rules.cleanEventInput({ eventType: 'complaint', occurredAt: '2026-11-20T09:30Z', locationId: L1, description: 'Odor reported by neighbor' }, NOW)

  assert.equal(complaint.substance, null)
  assert.equal(complaint.quantity, null)
  assert.equal(complaint.unit, null)
})

test('eventCloseBlockers and severity', () => {
  const actions = [
    { title: 'Excavate soil', capaStatus: 'open', capaNumber: 'CA-7' },
    { title: 'Retrain drivers', capaStatus: 'closed' },
    { title: 'Dropped', capaStatus: 'canceled' }
  ]

  assert.deepEqual(rules.eventCloseBlockers({ reportable: true, agencyNotifiedAt: null, actions }), [
    'It is reportable and the agency notice is not recorded',
    'Action open: CA-7 Excavate soil (not done)',
    'Action open: Dropped (canceled)'
  ])
  assert.deepEqual(rules.eventCloseBlockers({ reportable: false, agencyNotifiedAt: null, actions: [actions[1]] }), [])
  assert.equal(rules.capaSeverityForEvent({ reportable: true, event_type: 'spill_release' }), 'high')
  assert.equal(rules.capaSeverityForEvent({ reportable: false, event_type: 'complaint' }), 'low')
})

test('cleanShipmentInput', () => {
  const base = { manifestNumber: '123 456 789-jjk', locationId: L1, shippedOn: '2026-10-01', generatorStatus: 'lqg', wasteDescription: 'Spent solvent', wasteCodes: 'f005, d001 F005', quantity: '4', unit: 'drums', transporter: 'Gulf Haulers', facility: 'Clean Earth TSDF' }

  assert.match(rules.cleanShipmentInput({ ...base, manifestNumber: '12345JJK' }, TODAY).error, /nine digits/)
  assert.match(rules.cleanShipmentInput({ ...base, shippedOn: '2026-11-21' }, TODAY).error, /future/)
  assert.match(rules.cleanShipmentInput({ ...base, generatorStatus: 'big' }, TODAY).error, /generator/)
  assert.match(rules.cleanShipmentInput({ ...base, wasteCodes: 'D0-01' }, TODAY).error, /waste codes/)
  assert.match(rules.cleanShipmentInput({ ...base, quantity: '0' }, TODAY).error, /quantity/)
  assert.match(rules.cleanShipmentInput({ ...base, returnReceivedOn: '2026-09-30' }, TODAY).error, /before the ship date/)

  const shipment = rules.cleanShipmentInput(base, TODAY)

  assert.equal(shipment.manifestNumber, '123456789JJK')
  assert.deepEqual(shipment.wasteCodes, ['F005', 'D001'])
  assert.equal(shipment.quantity, 4)
})

test('manifestState follows the exception reporting deadlines', () => {
  const at = (generator_status, shipped_on, patch = {}) => rules.manifestState({ generator_status, shipped_on, return_received_on: null, exception_filed_on: null, ...patch }, TODAY)

  assert.equal(at('lqg', '2026-10-20'), 'waiting', '31 days')
  assert.equal(at('lqg', '2026-10-14'), 'follow_up', '37 days')
  assert.equal(at('lqg', '2026-10-05'), 'exception_overdue', '46 days')
  assert.equal(at('lqg', '2026-10-05', { exception_filed_on: '2026-11-18' }), 'exception_filed')
  assert.equal(at('sqg', '2026-10-05'), 'waiting', 'SQGs have 60 days')
  assert.equal(at('sqg', '2026-09-15'), 'exception_overdue')
  assert.equal(at('vsqg', '2026-01-01'), 'not_required')
  assert.equal(at('lqg', '2026-01-01', { return_received_on: '2026-01-20' }), 'received')
  assert.equal(rules.exceptionDueOn({ generator_status: 'lqg', shipped_on: '2026-10-05' }), '2026-11-19')
  assert.equal(rules.exceptionDueOn({ generator_status: 'vsqg', shipped_on: '2026-10-05' }), null)
})
