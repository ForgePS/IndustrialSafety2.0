/**
 * Forge AI Command Center stage 4: recommendation rules and verification.
 * Run: node --experimental-strip-types --test apps/web/tests/forge-ai-recommendations.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = file => require(path.join(__dirname, '../src/lib', file))
const rules = lib('forgeAiRecommendationRules.ts')
const agents = lib('forgeAiAgents.ts')

const alert = (overrides = {}) => ({
  id: 'alert-1',
  rule_key: 'inspection.failed',
  severity: 'high',
  status: 'open',
  target_type: 'inspection',
  target_id: 'insp-1',
  target_reference: null,
  title: 'Failed inspection not closed: INSP-2026-000007',
  summary: 'INSP-2026-000007 failed on 2026-11-04 and is still submitted.',
  location_id: 'loc-1',
  division_id: 'div-1',
  data: { inspection_number: 'INSP-2026-000007' },
  ...overrides
})

const indicator = (factor_key, normalized, contribution, raw_value = 4) => ({
  factor_key,
  label: factor_key.replaceAll('_', ' '),
  available: true,
  raw_value,
  normalized,
  contribution,
  detail: factor_key + ' detail',
  evidence: [{ type: 'task', id: 't-' + factor_key, reference: 'TSK-' + factor_key }]
})

const assessment = (overrides = {}) => ({
  id: 'assess-1',
  scope_type: 'location',
  scope_id: 'loc-1',
  scope_name: 'Main Plant',
  score: 74.6,
  band: 'elevated',
  indicators: [
    indicator('overdue_corrective_actions', 0.8, 0.12),
    indicator('incident_severity', 1, 0.2, 31),
    indicator('overdue_training', 0.9, 0.09),
    indicator('open_high_risks', 0.6, 0.06),
    indicator('incident_trend', 0.2, 0.02)
  ],
  ...overrides
})

test('a failed inspection becomes a corrective action recommendation that cites it', () => {
  const rec = rules.recommendationFromAlert(alert())

  assert.equal(rec.recommendation_key, 'alert:alert-1')
  assert.equal(rec.kind, 'corrective_action')
  assert.equal(rec.priority, 'high')
  assert.equal(rec.title, 'Correct the deficiencies from failed inspection INSP-2026-000007')
  assert.match(rec.rationale, /^INSP-2026-000007 failed/)
  assert.deepEqual(rec.evidence, [
    { type: 'watch_alert', id: 'alert-1', reference: 'Failed inspection not closed: INSP-2026-000007' },
    { type: 'inspection', id: 'insp-1', reference: 'INSP-2026-000007' }
  ])
  assert.equal(rec.proposed_action.action_key, 'corrective_action.create')
  assert.equal(rec.proposed_action.payload.severity, 'high')
  assert.equal(rec.proposed_action.payload.source_type, 'inspection')
  assert.equal(rec.proposed_action.payload.location_id, 'loc-1')
  assert.deepEqual(rec.verification_criteria, [{ type: 'action_completed' }, { type: 'alert_cleared', alert_id: 'alert-1' }])
})

test('advisory rules propose no action and verify on the alert clearing', () => {
  const rec = rules.recommendationFromAlert(
    alert({ rule_key: 'training.location_gap', severity: 'warning', target_type: 'training_gap', title: 'Training gap at Main Plant', data: { assignment_ids: ['a1', 'a2'] } })
  )

  assert.equal(rec.kind, 'training')
  assert.equal(rec.priority, 'medium')
  assert.equal(rec.proposed_action, null)
  assert.deepEqual(rec.evidence.map(item => item.type), ['watch_alert', 'training_assignment', 'training_assignment'])
  assert.deepEqual(rec.verification_criteria, [{ type: 'alert_cleared', alert_id: 'alert-1' }])
})

test('rules without a mapping, and closed alerts, produce nothing', () => {
  assert.equal(rules.recommendationFromAlert(alert({ rule_key: 'training.overdue' })), null)
  assert.equal(rules.recommendationFromAlert(alert({ status: 'resolved' })), null)
  assert.equal(rules.recommendationFromAlert(alert({ status: 'dismissed' })), null)
  assert.ok(rules.recommendationFromAlert(alert({ status: 'acknowledged' })))
})

test('a serious incident gets a root-cause corrective action that is not tied to the alert clearing', () => {
  const rec = rules.recommendationFromAlert(
    alert({ rule_key: 'incident.serious_reported', target_type: 'incident', target_reference: 'INC-2026-000013', title: 'Serious incident: INC-2026-000013' })
  )

  assert.equal(rec.title, 'Open a corrective action for INC-2026-000013')
  assert.equal(rec.proposed_action.payload.root_cause_required, true)
  assert.equal(rec.proposed_action.payload.source_type, 'incident')
  assert.deepEqual(rec.verification_criteria, [{ type: 'action_completed' }])
})

test('recurring incident patterns cite every incident behind them', () => {
  const rec = rules.recommendationFromAlert(
    alert({
      rule_key: 'incident.recurring_type',
      target_type: 'incident_pattern',
      target_id: 'loc-1:injury',
      title: 'Recurring injury incidents at Main Plant',
      data: { incident_ids: ['i1', 'i2', 'i3'] }
    })
  )

  assert.equal(rec.title, 'Investigate the root cause of recurring injury incidents at Main Plant')
  assert.deepEqual(rec.evidence.slice(1).map(item => item.id), ['i1', 'i2', 'i3'])
  assert.equal(rec.proposed_action.payload.action_type, 'preventive')
})

test('only the top factors of an Elevated or High score become recommendations', () => {
  const recs = rules.recommendationsFromAssessment(assessment())

  // incident_trend is below the threshold; the top three by contribution are kept.
  assert.deepEqual(recs.map(rec => rec.factor_key), ['incident_severity', 'overdue_corrective_actions', 'overdue_training'])
  assert.equal(recs[0].recommendation_key, 'risk:location:loc-1:incident_severity')
  assert.equal(recs[0].kind, 'corrective_action')
  assert.equal(recs[0].proposed_action.payload.action_type, 'preventive')
  assert.equal(recs[0].priority, 'medium')
  assert.match(recs[0].rationale, /risk indicator is 74\.6 \(Elevated\)\. incident severity adds 20 points: incident_severity detail/)
  assert.equal(recs[1].proposed_action, null)
  assert.deepEqual(recs[1].verification_criteria, [
    { type: 'factor_reduced', scope_type: 'location', scope_id: 'loc-1', factor_key: 'overdue_corrective_actions', baseline: 4 }
  ])
  assert.equal(recs[1].evidence[0].type, 'risk_assessment')
})

test('low, moderate and unscored assessments produce nothing', () => {
  assert.deepEqual(rules.recommendationsFromAssessment(assessment({ band: 'moderate', score: 40 })), [])
  assert.deepEqual(rules.recommendationsFromAssessment(assessment({ band: 'insufficient_data', score: null })), [])
})

test('a division recommendation targets the division, not a location', () => {
  const [rec] = rules.recommendationsFromAssessment(assessment({ scope_type: 'division', scope_id: 'div-9', band: 'high', score: 80 }))

  assert.equal(rec.location_id, null)
  assert.equal(rec.division_id, 'div-9')
  assert.equal(rec.priority, 'high')
  assert.equal(rec.proposed_action.payload.division_id, 'div-9')
})

test('existing recommendations block duplicates; superseded ones and old closed ones do not', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  const candidates = ['a', 'b', 'c', 'd', 'e', 'a'].map(key => ({ recommendation_key: key }))
  const existing = [
    { recommendation_key: 'a', status: 'proposed', updated_at: '2026-01-01T00:00:00Z' },
    { recommendation_key: 'b', status: 'dismissed', updated_at: '2026-11-01T00:00:00Z' },
    { recommendation_key: 'c', status: 'dismissed', updated_at: '2026-09-01T00:00:00Z' },
    { recommendation_key: 'd', status: 'superseded', updated_at: '2026-11-08T00:00:00Z' }
  ]

  assert.deepEqual(rules.selectNewRecommendations(candidates, existing, now).map(item => item.recommendation_key), ['c', 'd', 'e'])
})

const facts = (overrides = {}) => ({
  alertStatus: () => 'open',
  correctiveAction: null,
  latestFactor: () => null,
  executedAt: '2026-11-01T00:00:00Z',
  ...overrides
})

test('verification is effective only when every check is met', () => {
  const criteria = [{ type: 'action_completed' }, { type: 'alert_cleared', alert_id: 'x' }]

  const pending = rules.evaluateVerification(criteria, facts({ correctiveAction: { status: 'closed', verification_result: 'effective' } }))
  assert.equal(pending.outcome, 'pending')
  assert.deepEqual(pending.checks.map(check => check.met), [true, false])

  const done = rules.evaluateVerification(
    criteria,
    facts({ alertStatus: () => 'resolved', correctiveAction: { status: 'verified', verification_result: 'effective' } })
  )
  assert.equal(done.outcome, 'effective')
})

test('a corrective action verified as ineffective fails the recommendation', () => {
  const result = rules.evaluateVerification(
    [{ type: 'action_completed' }],
    facts({ correctiveAction: { status: 'closed', verification_result: 'ineffective' } })
  )

  assert.equal(result.outcome, 'ineffective')
})

test('a dismissed alert is not proof that the condition cleared', () => {
  const result = rules.evaluateVerification([{ type: 'alert_cleared', alert_id: 'x' }], facts({ alertStatus: () => 'dismissed' }))

  assert.equal(result.outcome, 'pending')
})

test('a factor counts as reduced only on a recalculation after the work was done', () => {
  const criterion = [{ type: 'factor_reduced', scope_type: 'location', scope_id: 'loc-1', factor_key: 'f', baseline: 5 }]

  const stale = rules.evaluateVerification(criterion, facts({ latestFactor: () => ({ raw_value: 1, computed_at: '2026-10-30T00:00:00Z' }) }))
  assert.equal(stale.outcome, 'pending')

  const same = rules.evaluateVerification(criterion, facts({ latestFactor: () => ({ raw_value: 5, computed_at: '2026-11-02T00:00:00Z' }) }))
  assert.equal(same.outcome, 'pending')

  const lower = rules.evaluateVerification(criterion, facts({ latestFactor: () => ({ raw_value: 2, computed_at: '2026-11-02T00:00:00Z' }) }))
  assert.equal(lower.outcome, 'effective')
})

test('no verification criteria never verifies', () => {
  assert.equal(rules.evaluateVerification([], facts()).outcome, 'pending')
})

test('recommendations are a Risk, Monitoring and Reporting tool only, and route to Monitoring', () => {
  const holders = agents.FORGE_AI_AGENTS.filter(agent => agent.tools.includes('get_recommendations')).map(agent => agent.key).sort()

  assert.deepEqual(holders, ['monitoring', 'reporting', 'risk'])
  assert.equal(agents.routeForgeAiRequest({ message: 'What do you recommend we do first?' }).agentKey, 'monitoring')
})
