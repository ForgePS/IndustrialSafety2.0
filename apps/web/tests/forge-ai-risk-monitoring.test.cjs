/**
 * Forge AI Command Center stage 3: risk indicator scoring and Watch pattern detection.
 * Run: node --experimental-strip-types --test apps/web/tests/forge-ai-risk-monitoring.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = file => require(path.join(__dirname, '../src/lib', file))
const score = lib('forgeAiRiskScore.ts')
const patterns = lib('forgeAiWatchPatterns.ts')
const agents = lib('forgeAiAgents.ts')

const model = {
  factors: [
    { key: 'a', label: 'A', weight: 0.5, saturation: 10 },
    { key: 'b', label: 'B', weight: 0.3, saturation: 4 },
    { key: 'c', label: 'C', weight: 0.2, saturation: 1 }
  ],
  bands: [
    { key: 'low', label: 'Low', min: 0 },
    { key: 'moderate', label: 'Moderate', min: 25 },
    { key: 'elevated', label: 'Elevated', min: 50 },
    { key: 'high', label: 'High', min: 75 }
  ],
  min_available_weight: 0.6
}

const input = (key, rawValue, available = true) => ({ key, available, rawValue, detail: key + ' detail', evidence: [{ type: 'incident', id: key, reference: 'INC-' + key }] })

test('the score is the weighted, saturated share of available factors', () => {
  const result = score.computeRiskScore(model, [input('a', 5), input('b', 8), input('c', 0)], 20)

  // a: 0.5 * 0.5 = 0.25, b: 0.3 * 1 (capped) = 0.3, c: 0 -> 55 of 100
  assert.equal(result.score, 55)
  assert.equal(result.band, 'elevated')
  assert.equal(result.availableWeight, 1)
  assert.deepEqual(result.indicators.map(item => item.normalized), [0.5, 1, 0])
  assert.equal(result.reason, null)
})

test('the same inputs always give the same score', () => {
  const inputs = [input('a', 3.3), input('b', 1.7), input('c', 0.4)]

  assert.deepEqual(score.computeRiskScore(model, inputs, 9), score.computeRiskScore(model, inputs, 9))
})

test('missing factors are excluded and re-weighted, not treated as zero', () => {
  const result = score.computeRiskScore(model, [input('a', 10), input('b', 4), input('c', null, false)], 20)

  // Only a and b (0.8 of the weight) have data, both saturated -> 100.
  assert.equal(result.score, 100)
  assert.equal(result.availableWeight, 0.8)
  assert.equal(result.indicators[2].available, false)
  assert.equal(result.indicators[2].contribution, null)
})

test('too few factors with data gives no score', () => {
  const result = score.computeRiskScore(model, [input('a', 10, false), input('b', 4), input('c', 1)], 20)

  assert.equal(result.score, null)
  assert.equal(result.band, 'insufficient_data')
  assert.match(result.reason, /50% of the model's factors/)
})

test('too few records gives no score, even when every factor is zero', () => {
  const result = score.computeRiskScore(model, [input('a', 0), input('b', 0), input('c', 0)], score.RISK_MIN_RECORDS - 1)

  assert.equal(result.score, null)
  assert.equal(result.band, 'insufficient_data')
  assert.match(result.reason, /at least 5 are needed/)
})

test('band boundaries are inclusive at their minimum', () => {
  assert.equal(score.bandForScore(0, model.bands), 'low')
  assert.equal(score.bandForScore(24.9, model.bands), 'low')
  assert.equal(score.bandForScore(25, model.bands), 'moderate')
  assert.equal(score.bandForScore(75, model.bands), 'high')
  assert.equal(score.bandForScore(100, model.bands), 'high')
})

test('evidence is kept per factor and capped', () => {
  const many = { ...input('a', 1), evidence: Array.from({ length: 40 }, (_, i) => ({ type: 'incident', id: String(i), reference: 'INC-' + i })) }
  const result = score.computeRiskScore(model, [many, input('b', 1), input('c', 1)], 20)

  assert.equal(result.indicators[0].evidence.length, score.RISK_EVIDENCE_LIMIT)
})

test('injury rate uses the OSHA 200,000-hour basis, prorated to the window', () => {
  assert.equal(score.injuryRate(2, 200_000 * (365 / 90), 90), 2)
  assert.equal(score.injuryRate(1, 0, 90), null)
})

test('trend is the rise above the prior rate, never negative', () => {
  // 6 in 30 days vs. 6 in the 60 before (3 per 30) -> 100% rise
  assert.equal(score.trendIncrease(6, 6, 30, 60), 1)
  assert.equal(score.trendIncrease(1, 10, 30, 60), 0)
  // No prior incidents: compared against 1
  assert.equal(score.trendIncrease(3, 0, 30, 60), 3)
})

const now = new Date('2026-11-09T12:00:00Z')
const daysAgo = days => new Date(now.getTime() - days * 86_400_000).toISOString()
const incident = (n, type, location, days) => ({ id: 'id-' + n, incident_number: 'INC-2026-' + String(n).padStart(6, '0'), incident_type: type, occurred_at: daysAgo(days), location_id: location, division_id: 'div' })

test('recurring incidents need the same type at the same location inside the window', () => {
  const incidents = [
    incident(1, 'slip', 'L1', 2),
    incident(2, 'slip', 'L1', 10),
    incident(3, 'slip', 'L1', 25),
    incident(4, 'slip', 'L1', 40),
    incident(5, 'slip', 'L2', 3),
    incident(6, 'injury', 'L1', 4)
  ]
  const clusters = patterns.detectRecurringIncidents(incidents, { windowDays: 30, minCount: 3 }, now)

  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].locationId, 'L1')
  assert.deepEqual(clusters[0].incidents.map(item => item.id), ['id-3', 'id-2', 'id-1'])
  assert.equal(patterns.detectRecurringIncidents(incidents, { windowDays: 30, minCount: 4 }, now).length, 0)
})

test('an incident trend compares a location against its own baseline', () => {
  const incidents = [
    // L1: 4 in the last 30 days, 3 in the 90 before (1 per 30) -> 4x
    incident(1, 'a', 'L1', 1), incident(2, 'a', 'L1', 5), incident(3, 'a', 'L1', 9), incident(4, 'a', 'L1', 20),
    incident(5, 'a', 'L1', 40), incident(6, 'a', 'L1', 70), incident(7, 'a', 'L1', 100),
    // L2: steady
    incident(8, 'a', 'L2', 5), incident(9, 'a', 'L2', 35), incident(10, 'a', 'L2', 65), incident(11, 'a', 'L2', 95),
    // L3: busy but no history -> not flagged
    incident(12, 'a', 'L3', 1), incident(13, 'a', 'L3', 2), incident(14, 'a', 'L3', 3)
  ]
  const trends = patterns.detectIncidentTrends(incidents, { windowDays: 30, baselineDays: 90, minCount: 3, ratio: 1.5 }, now)

  assert.deepEqual(trends.map(trend => trend.locationId), ['L1'])
  assert.equal(trends[0].ratio, 4)
  assert.equal(trends[0].baselineRate, 1)
})

test('training gaps need both the share and the minimum overdue count', () => {
  const assignment = (id, location, dueDaysAgo) => ({ id, location_id: location, division_id: null, due_date: daysAgo(dueDaysAgo).slice(0, 10) })
  const assignments = [
    assignment('1', 'L1', 5), assignment('2', 'L1', 5), assignment('3', 'L1', 5), assignment('4', 'L1', -5), assignment('5', 'L1', -5),
    assignment('6', 'L2', 5), assignment('7', 'L2', -5)
  ]
  const gaps = patterns.detectTrainingGaps(assignments, { minShare: 0.2, minOverdue: 3 }, now)

  assert.deepEqual(gaps.map(gap => [gap.locationId, gap.overdue.length, gap.total, gap.share]), [['L1', 3, 5, 0.6]])
})

test('severity routing thresholds', () => {
  assert.equal(patterns.severityAtLeast('critical', 'high'), true)
  assert.equal(patterns.severityAtLeast('high', 'high'), true)
  assert.equal(patterns.severityAtLeast('warning', 'high'), false)
})

test('risk indicators are a Risk, Monitoring and Reporting tool only', () => {
  const holders = agents.FORGE_AI_AGENTS.filter(agent => agent.tools.includes('get_risk_indicators')).map(agent => agent.key).sort()

  assert.deepEqual(holders, ['monitoring', 'reporting', 'risk'])
})
