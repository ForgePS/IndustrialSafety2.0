/**
 * Port slice 8 (piece C): unit tests for incident root-cause analysis rules (src/lib/forgeIncidentRcaRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s8-incident-rca-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeIncidentRcaRules.ts'))

const OWNER = '20000000-0000-4000-8000-0000000000aa'
const CAPA = '30000000-0000-4000-8000-0000000000bb'

test('default seed comes from the incident, with five seeded whys and one blank action', () => {
  const rca = rules.defaultIncidentRca({
    summary: 'Forklift struck racking.',
    description: 'Forklift reversed into racking in aisle 4.',
    immediate_actions: 'Area cordoned off.',
    occurred_at: '2026-11-10T14:30:00.000Z'
  })

  assert.equal(rca.problemStatement, 'Forklift reversed into racking in aisle 4.')
  assert.equal(rca.immediateActions, 'Area cordoned off.')
  assert.equal(rca.eventDate, '2026-11-10')
  assert.equal(rca.fiveWhys.length, 5)
  assert.equal(rca.fiveWhys[0].question, 'Why did "Forklift struck racking" occur?')
  assert.equal(rca.fiveWhys[1].question, 'Why did that happen?')
  assert.equal(rca.actions.length, 1)
  assert.equal(rca.actions[0].status, 'pending')
  assert.match(rca.actions[0].key, /^rca-/)
  assert.equal(rules.rcaHasContent(rca), false)
})

test('problem statement falls back to the summary; no incident gives generic seeds', () => {
  assert.equal(rules.defaultIncidentRca({ summary: 'Slip' }).problemStatement, 'Slip')
  assert.equal(rules.defaultIncidentRca().fiveWhys[0].question, 'Why did the incident occur?')
})

test('later why questions are seeded from the previous answer; written questions are kept', () => {
  const whys = rules.seedFiveWhys(
    [
      { question: '', answer: 'The driver could not see behind.' },
      { question: 'Custom question?', answer: 'Mirror was broken' },
      { question: '', answer: '' }
    ],
    'Title'
  )

  assert.equal(whys[0].question, 'Why did "Title" occur?')
  assert.equal(whys[1].question, 'Custom question?')
  assert.equal(whys[2].question, 'Why did "Mirror was broken" happen?')
  assert.equal(whys[3].question, 'Why did that happen?')
  assert.equal(whys.length, 5)
})

test('normalize trims, caps lists, validates dates/statuses/owners and drops bad or duplicate action keys', () => {
  const rca = rules.normalizeIncidentRca(
    {
      problemStatement: '  P  ',
      eventDate: '2026-02-30',
      conductedAt: '2026-11-12',
      contributingFactors: [' Fatigue ', '', 7, 'Poor lighting'],
      participants: ['A', '  '],
      fiveWhys: ['legacy string answer', { question: 'Q2', answer: ' A2 ' }],
      rootCause: ' No reversing alarm ',
      actions: [
        { key: 'rca-abc123', action: ' Fit alarm ', ownerPersonnelId: OWNER, dueDate: '2026-12-01', status: 'in-progress', capaId: 'nope' },
        { key: 'rca-abc123', action: 'duplicate' },
        { key: 'bad key!', action: 'x' },
        { key: 'rca-def456', action: 'Train', ownerPersonnelId: 'not-a-uuid', status: 'completed', dueDate: 'tomorrow' }
      ]
    },
    'Title'
  )

  assert.equal(rca.problemStatement, 'P')
  assert.equal(rca.eventDate, '')
  assert.equal(rca.conductedAt, '2026-11-12')
  assert.deepEqual(rca.contributingFactors, ['Fatigue', 'Poor lighting'])
  assert.deepEqual(rca.participants, ['A'])
  assert.equal(rca.fiveWhys[0].answer, 'legacy string answer')
  assert.equal(rca.fiveWhys[0].question, 'Why did "Title" occur?')
  assert.deepEqual(rca.fiveWhys[1], { question: 'Q2', answer: 'A2' })
  assert.equal(rca.rootCause, 'No reversing alarm')
  assert.equal(rca.actions.length, 2)
  assert.deepEqual(rca.actions[0], {
    key: 'rca-abc123',
    action: 'Fit alarm',
    ownerPersonnelId: OWNER,
    ownerName: '',
    dueDate: '2026-12-01',
    status: 'in_progress',
    capaId: null,
    capaNumber: null
  })
  assert.equal(rca.actions[1].ownerPersonnelId, null)
  assert.equal(rca.actions[1].status, 'complete')
  assert.equal(rca.actions[1].dueDate, '')
})

test('row round trip keeps the analysis', () => {
  const rca = rules.normalizeIncidentRca({
    problemStatement: 'P',
    rootCause: 'R',
    contributingFactors: ['F'],
    fiveWhys: [{ question: 'Q', answer: 'A' }],
    actions: [{ key: 'rca-abc123', action: 'Do', capaId: CAPA, capaNumber: 'CA-1' }]
  })
  const back = rules.rcaFromRow(rules.rcaToRow(rca), { summary: 'S' })

  assert.equal(back.rootCause, 'R')
  assert.equal(back.actions[0].capaId, CAPA)
  assert.equal(back.actions[0].capaNumber, 'CA-1')
  assert.equal(rules.rcaHasContent(back), true)
  assert.equal(rules.rcaFromRow(null, { summary: 'S' }).fiveWhys[0].question, 'Why did "S" occur?')
})

test('save drops blank actions and takes CAPA links only from the stored analysis', () => {
  const stored = rules.normalizeIncidentRca({ actions: [{ key: 'rca-keep01', action: 'Old', capaId: CAPA, capaNumber: 'CA-9' }] })
  const posted = rules.normalizeIncidentRca({
    actions: [
      { key: 'rca-keep01', action: 'Renamed', capaId: null },
      { key: 'rca-new001', action: 'New', capaId: CAPA, capaNumber: 'CA-FORGED' },
      { key: 'rca-blank1', action: '' }
    ]
  })
  const result = rules.prepareRcaForSave(posted, stored)

  assert.ok('rca' in result)
  assert.equal(result.rca.actions.length, 2)
  assert.equal(result.rca.actions[0].capaId, CAPA)
  assert.equal(result.rca.actions[0].capaNumber, 'CA-9')
  assert.equal(result.rca.actions[0].action, 'Renamed')
  assert.equal(result.rca.actions[1].capaId, null)
  assert.equal(result.rca.actions[1].capaNumber, null)
})

test('an action with a CAPA cannot be removed or blanked', () => {
  const stored = rules.normalizeIncidentRca({ actions: [{ key: 'rca-keep01', action: 'Old', capaId: CAPA, capaNumber: 'CA-9' }] })

  const removed = rules.prepareRcaForSave(rules.normalizeIncidentRca({ actions: [] }), stored)
  assert.match(removed.error, /CA-9.*cannot be removed/)

  const blanked = rules.prepareRcaForSave(rules.normalizeIncidentRca({ actions: [{ key: 'rca-keep01', action: '' }] }), stored)
  assert.match(blanked.error, /must keep its description/)

  assert.ok('rca' in rules.prepareRcaForSave(rules.normalizeIncidentRca({ actions: [] }), null))
})

test('CAPA blockers, severity mapping and date formatting', () => {
  assert.match(rules.rcaActionCapaBlocker(undefined), /Save the analysis/)
  assert.match(rules.rcaActionCapaBlocker(rules.emptyRcaAction('rca-abc123')), /Describe the action/)
  assert.equal(rules.rcaActionCapaBlocker({ ...rules.emptyRcaAction('rca-abc123'), action: 'Do' }), null)

  assert.equal(rules.capaSeverityForIncident('critical'), 'critical')
  assert.equal(rules.capaSeverityForIncident('serious'), 'high')
  assert.equal(rules.capaSeverityForIncident('near_miss'), 'low')
  assert.equal(rules.capaSeverityForIncident('moderate'), 'moderate')
  assert.equal(rules.capaSeverityForIncident(null), 'moderate')

  assert.equal(rules.formatRcaDate('2026-11-17'), '11/17/2026')
  assert.equal(rules.formatRcaDate(''), '')
  assert.equal(rules.rcaDate('2026-11-17T08:00:00Z'), '2026-11-17')
})
