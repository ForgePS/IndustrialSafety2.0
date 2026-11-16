/**
 * Port slice 7: home dashboard. Unit tests for src/lib/forgeDashboardRules.ts
 * (layout cleaning, pinned modules, safety index, trends, task schedule, training renewals, attention order).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s7-dashboard-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeDashboardRules.ts'))

const TODAY = '2026-11-16'

test('default layout lists every block once, visible, at its default size', () => {
  const layout = rules.defaultDashboardLayout()

  assert.deepEqual(
    layout.items.map(item => item.id),
    [...rules.DASHBOARD_BLOCKS.map(block => block.id)]
  )
  assert.ok(layout.items.every(item => item.visible))
  assert.equal(layout.items.find(item => item.id === 'attention').size, 'full')
  assert.equal(layout.pinnedModules, null)
})

test('normalizeDashboardLayout drops junk, dedupes, clamps sizes and inserts new blocks in place', () => {
  const layout = rules.normalizeDashboardLayout({
    items: [
      { id: 'workspace', visible: false, size: 'wide' },
      { id: 'nope', visible: true, size: 'full' },
      { id: 'attention', visible: true, size: 'compact' }, // compact is not allowed for attention
      { id: 'workspace', visible: true, size: 'full' }, // duplicate
      { id: 'safety-index', visible: true, size: 'medium' }
    ],
    pinnedModules: ['nav.incidents', 'nav.incidents', 7, '']
  })

  const ids = layout.items.map(item => item.id)

  assert.equal(new Set(ids).size, rules.DASHBOARD_BLOCK_IDS.length)
  assert.equal(ids[0], 'workspace')
  assert.equal(layout.items[0].visible, false)
  assert.equal(layout.items[0].size, 'wide')
  assert.equal(layout.items.find(item => item.id === 'attention').size, 'full')
  // tasks-due (default right after attention) is placed after attention, before safety-index.
  assert.equal(ids.indexOf('tasks-due'), ids.indexOf('attention') + 1)
  assert.ok(ids.indexOf('safety-index') > ids.indexOf('tasks-due'))
  assert.deepEqual(layout.pinnedModules, ['nav.incidents'])
})

test('normalizeDashboardLayout treats anything else as the default', () => {
  for (const raw of [null, undefined, 'x', 42, [], { items: 'no' }]) {
    assert.deepEqual(rules.normalizeDashboardLayout(raw), rules.defaultDashboardLayout())
  }
})

test('resolvePinnedModules keeps pinned order and falls back to all modules', () => {
  const modules = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

  assert.deepEqual(rules.resolvePinnedModules(modules, null), modules)
  assert.deepEqual(
    rules.resolvePinnedModules(modules, ['c', 'a']).map(item => item.key),
    ['c', 'a']
  )
  assert.deepEqual(rules.resolvePinnedModules(modules, ['gone']), modules)
})

test('safety index follows 1.0 and grades A to F', () => {
  assert.equal(rules.computeSafetyIndex({ openIncidents: 0, totalIncidents: 0, inspectionCount: 0, trainingCount: 0 }), 100)
  // 100 - 8 = 92 → 92*0.6 + (1 - 2/4)*100*0.4 = 75.2 → +inspections 75.2*0.85+15 = 78.92 → +training 78.92*0.92+8 = 80.6
  assert.equal(rules.computeSafetyIndex({ openIncidents: 2, totalIncidents: 4, inspectionCount: 3, trainingCount: 5 }), 81)
  // The open-incident penalty caps at 24.
  assert.equal(rules.computeSafetyIndex({ openIncidents: 50, totalIncidents: 50, inspectionCount: 0, trainingCount: 0 }), 46)
  assert.deepEqual([95, 85, 75, 65, 10].map(rules.safetyGrade), ['A', 'B', 'C', 'D', 'F'])
})

test('lastMonths and incidentTrend cover 12 months and skip drafts', () => {
  const months = rules.lastMonths(TODAY, 12)

  assert.equal(months.length, 12)
  assert.equal(months[0], '2025-12')
  assert.equal(months[11], '2026-11')

  const trend = rules.incidentTrend(
    [
      { occurred_at: '2026-11-02T10:00:00Z', involves_injury: true, status: 'submitted' },
      { occurred_at: '2026-11-03T10:00:00Z', incident_type: 'injury', status: 'closed' },
      { occurred_at: '2026-11-04T10:00:00Z', incident_type: 'near_miss', status: 'approved' },
      { occurred_at: '2026-11-05T10:00:00Z', involves_injury: true, status: 'draft' },
      { occurred_at: '2024-01-05T10:00:00Z', involves_injury: true, status: 'closed' }
    ],
    TODAY
  )

  const november = trend.find(item => item.month === '2026-11')

  assert.deepEqual({ injuries: november.injuries, other: november.other, total: november.total }, { injuries: 2, other: 1, total: 3 })
  assert.equal(
    trend.reduce((sum, item) => sum + item.total, 0),
    3
  )
})

test('injuryHistory counts recordable, DART and days away from the OSHA columns', () => {
  const rows = rules.injuryHistory({
    incidents: [{ occurred_at: '2026-03-01T00:00:00Z', involves_injury: true, status: 'approved' }],
    oshaCases: [
      { injury_date: '2026-03-01', status: 'open', recordability: 'recordable', case_outcome: 'days_away', days_away: 4, restricted_days: 0 },
      { injury_date: '2026-04-01', status: 'closed', recordability: 'recordable', case_outcome: 'job_transfer_restriction', days_away: 0, restricted_days: 6 },
      { injury_date: '2026-05-01', status: 'open', recordability: 'recordable', case_outcome: 'other_recordable', days_away: 0, restricted_days: 0 },
      { injury_date: '2026-06-01', status: 'voided', recordability: 'recordable', case_outcome: 'days_away', days_away: 9 },
      { injury_date: '2026-07-01', status: 'open', recordability: 'not_recordable', case_outcome: null },
      { injury_date: '2025-02-01', status: 'closed', recordability: 'recordable', case_outcome: 'days_away', days_away: 2 }
    ],
    todayIso: TODAY
  })

  assert.equal(rows.length, 5)
  assert.deepEqual(rows[0], { year: 2026, injuries: 1, recordables: 3, dart: 2, daysAway: 4 })
  assert.deepEqual(rows[1], { year: 2025, injuries: 0, recordables: 1, dart: 1, daysAway: 2 })

  const withoutOsha = rules.injuryHistory({ incidents: [], oshaCases: null, todayIso: TODAY })

  assert.equal(withoutOsha[0].recordables, null)
})

test('countByLabel groups blanks and sorts by count', () => {
  assert.deepEqual(rules.countByLabel(['Plant', null, 'Yard', 'Plant', ' ']), [
    { label: 'No location', count: 2 },
    { label: 'Plant', count: 2 },
    { label: 'Yard', count: 1 }
  ])
})

test('taskSchedule and tasksDue', () => {
  const tasks = [
    { id: '1', title: 'Late', status: 'open', due_at: '2026-11-10T00:00:00Z' },
    { id: '2', title: 'Soon', status: 'in_progress', due_at: '2026-11-18T00:00:00Z' },
    { id: '3', title: 'Later', status: 'blocked', due_at: '2026-12-30T00:00:00Z' },
    { id: '4', title: 'Whenever', status: 'open', due_at: null },
    { id: '5', title: 'Done', status: 'completed', due_at: '2026-11-01T00:00:00Z' },
    { id: '6', title: 'Dropped', status: 'canceled', due_at: '2026-11-01T00:00:00Z' }
  ]

  const schedule = rules.taskSchedule(tasks, TODAY)

  assert.deepEqual(schedule.byStatus, { open: 2, in_progress: 1, blocked: 1, completed: 1 })
  assert.deepEqual([schedule.overdue, schedule.dueThisWeek, schedule.later, schedule.noDueDate], [1, 1, 1, 1])

  const due = rules.tasksDue(tasks, TODAY)

  assert.deepEqual(
    due.map(item => item.title),
    ['Late', 'Soon', 'Later', 'Whenever']
  )
  assert.equal(due[0].overdue, true)
  assert.equal(due[1].overdue, false)
})

test('trainingRenewals counts only the newest passing approved record per person and course', () => {
  const result = rules.trainingRenewals(
    [
      // Replaced by a newer completion: not expiring.
      { personnel_id: 'p1', course_id: 'c1', completed_at: '2025-11-20', expires_at: '2026-11-20', result: 'passed', approval_status: 'approved' },
      { personnel_id: 'p1', course_id: 'c1', completed_at: '2026-11-01', expires_at: '2027-11-01', result: 'passed', approval_status: 'approved' },
      // Expiring within 30 days.
      { personnel_id: 'p2', course_id: 'c1', completed_at: '2025-12-01', expires_at: '2026-12-01', result: 'passed', approval_status: 'approved' },
      // Expired.
      { personnel_id: 'p3', course_id: 'c1', completed_at: '2025-01-01', expires_at: '2026-01-01', result: 'completed', approval_status: 'approved' },
      // Failed or pending records don't count.
      { personnel_id: 'p4', course_id: 'c1', completed_at: '2026-01-01', expires_at: '2026-11-20', result: 'failed', approval_status: 'approved' },
      { personnel_id: 'p5', course_id: 'c1', completed_at: '2026-01-01', expires_at: '2026-11-20', result: 'passed', approval_status: 'pending' }
    ],
    TODAY,
    30
  )

  assert.deepEqual(result, { expiring: 1, expired: 1 })
})

test('sortAttention puts items with work first, by tone then count', () => {
  const sorted = rules.sortAttention([
    { key: 'a', label: 'A', count: 0, href: '/', tone: 'danger' },
    { key: 'b', label: 'B', count: 2, href: '/', tone: 'info' },
    { key: 'c', label: 'C', count: 1, href: '/', tone: 'danger' },
    { key: 'd', label: 'D', count: 5, href: '/', tone: 'danger' }
  ])

  assert.deepEqual(
    sorted.map(item => item.key),
    ['d', 'c', 'b', 'a']
  )
})
