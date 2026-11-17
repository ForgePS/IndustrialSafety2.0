/**
 * Port slice 8 (piece E): CAPA reports. Unit tests for src/lib/forgeCapaReportRules.ts
 * (period presets, metrics incl. on-time %, breakdowns, CSV).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s8-capa-report-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeCapaReportRules.ts'))

const TODAY = '2026-11-17'

const capa = overrides => ({
  id: overrides.action_number,
  title: 'Guard rail',
  status: 'open',
  severity: 'moderate',
  source_type: 'manual',
  created_at: '2026-10-01T12:00:00Z',
  due_at: null,
  closed_at: null,
  completed_at: null,
  ownerName: 'Pat Lee',
  locationName: 'Plant A',
  ...overrides
})

const records = [
  // Closed on time (closed on the due day).
  capa({ action_number: 'A1', status: 'closed', created_at: '2026-10-01T08:00:00Z', due_at: '2026-10-11T00:00:00Z', closed_at: '2026-10-11T22:00:00Z', severity: 'high', source_type: 'incident' }),
  // Closed late.
  capa({ action_number: 'A2', status: 'closed', created_at: '2026-10-05T08:00:00Z', due_at: '2026-10-10T00:00:00Z', closed_at: '2026-10-25T08:00:00Z', ownerName: null }),
  // Closed without a due date: counts as closed, not in on-time %.
  capa({ action_number: 'A3', status: 'closed', created_at: '2026-11-01T08:00:00Z', closed_at: '2026-11-03T08:00:00Z', locationName: null }),
  // Overdue now.
  capa({ action_number: 'A4', status: 'in_progress', created_at: '2026-11-01T08:00:00Z', due_at: '2026-11-10T00:00:00Z' }),
  // Open, not yet due; opened long before the period.
  capa({ action_number: 'A5', status: 'pending_verification', created_at: '2025-01-01T08:00:00Z', due_at: '2026-12-31T00:00:00Z' }),
  // Canceled: opened, never open-now or closed.
  capa({ action_number: 'A6', status: 'canceled', created_at: '2026-11-02T08:00:00Z', due_at: '2026-11-05T00:00:00Z' }),
  // Closed before the period.
  capa({ action_number: 'A7', status: 'closed', created_at: '2024-01-01T08:00:00Z', due_at: '2024-02-01T00:00:00Z', closed_at: '2024-01-15T08:00:00Z' })
]

test('presets resolve to inclusive day ranges ending today', () => {
  assert.deepEqual(rules.resolveCapaReportPeriod({ preset: '30d' }, TODAY), { preset: '30d', from: '2026-10-19', to: TODAY, label: 'Last 30 days' })
  assert.equal(rules.resolveCapaReportPeriod({ preset: '90d' }, TODAY).from, '2026-08-20')
  assert.equal(rules.resolveCapaReportPeriod({ preset: 'ytd' }, TODAY).from, '2026-01-01')
  assert.equal(rules.resolveCapaReportPeriod({ preset: '12m' }, TODAY).from, '2025-11-18')
  assert.equal(rules.resolveCapaReportPeriod({ preset: '12m' }, '2028-02-29').from, '2027-03-01')
  assert.equal(rules.resolveCapaReportPeriod({}, TODAY).preset, '90d')
  assert.equal(rules.resolveCapaReportPeriod({ preset: 'bogus' }, TODAY).preset, '90d')
})

test('custom periods need two valid days, swap when reversed, else fall back', () => {
  assert.deepEqual(rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-10-31', to: '2026-10-01' }, TODAY), {
    preset: 'custom',
    from: '2026-10-01',
    to: '2026-10-31',
    label: '2026-10-01 to 2026-10-31'
  })
  assert.equal(rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }, TODAY).preset, '90d')
  assert.equal(rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-01-01' }, TODAY).preset, '90d')
})

test('facts: on time is closed day <= due day; open excludes closed and canceled', () => {
  const [a1, a2, a3, a4, , a6] = records.map(record => rules.capaReportFacts(record, TODAY))

  assert.equal(a1.onTime, true)
  assert.equal(a1.daysToClose, 10)
  assert.equal(a2.onTime, false)
  assert.equal(a3.onTime, null)
  assert.equal(a4.isOverdue, true)
  assert.equal(a6.isOpen, false)
  assert.equal(a6.closedDay, '')
  // closed_at without closed status (reopened) is not closed.
  assert.equal(rules.capaReportFacts(capa({ action_number: 'X', status: 'in_progress', closed_at: '2026-10-02T00:00:00Z' }), TODAY).closedDay, '')
  // closed status falls back to completed_at.
  assert.equal(rules.capaReportFacts(capa({ action_number: 'Y', status: 'closed', completed_at: '2026-10-03T00:00:00Z' }), TODAY).closedDay, '2026-10-03')
})

test('metrics for a custom period', () => {
  const period = rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-10-01', to: TODAY }, TODAY)

  assert.deepEqual(rules.capaReportMetrics(records, period, TODAY), {
    opened: 5,
    closed: 3,
    closedWithDue: 2,
    closedOnTime: 1,
    onTimePct: 50,
    openNow: 2,
    overdueNow: 1,
    avgDaysToClose: 10.7 // (10 + 20 + 2) / 3
  })
})

test('onTimePct and avgDaysToClose are null when nothing closed', () => {
  const period = rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-11-15', to: TODAY }, TODAY)
  const metrics = rules.capaReportMetrics(records, period, TODAY)

  assert.equal(metrics.closed, 0)
  assert.equal(metrics.onTimePct, null)
  assert.equal(metrics.avgDaysToClose, null)
  assert.equal(metrics.openNow, 2)
  assert.equal(rules.capaReportMetrics([], period, TODAY).onTimePct, null)
})

test('breakdowns group with fallbacks, drop idle groups and sort busiest first', () => {
  const period = rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-10-01', to: TODAY }, TODAY)

  const owners = rules.capaReportBreakdown(records, 'owner', period, TODAY)
  assert.deepEqual(owners.map(row => row.label), ['Pat Lee', 'Unassigned'])
  assert.equal(owners[1].onTimePct, 0)

  const locations = rules.capaReportBreakdown(records, 'location', period, TODAY)
  assert.deepEqual(locations.map(row => [row.label, row.closed]), [['Plant A', 2], ['No location', 1]])

  const severity = rules.capaReportBreakdown(records, 'severity', period, TODAY, { severity: { high: 'High risk' } })
  assert.ok(severity.some(row => row.label === 'High risk' && row.onTimePct === 100))

  const sources = rules.capaReportBreakdown(records, 'source', period, TODAY)
  assert.deepEqual(sources.map(row => row.label).sort(), ['Incident', 'Manual'])
})

test('CSV: header, one row per CAPA in the report, CRLF, Y/N on time, days to close', () => {
  const period = rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-10-01', to: TODAY }, TODAY)
  const csv = rules.capaReportCsv(records, period, TODAY, { status: { closed: 'Closed' } })
  const lines = csv.split('\r\n')

  assert.ok(csv.endsWith('\r\n'))
  assert.ok(!/[^\r]\n/.test(csv))
  assert.equal(lines[0], 'Number,Title,Status,Severity,Source,Owner,Location,Opened,Due,Closed,On time,Days to close')
  // A7 closed before the period and is not open: left out. A5 is open now: kept.
  assert.deepEqual(lines.slice(1, -1).map(line => line.split(',')[0]), ['A5', 'A1', 'A2', 'A3', 'A4', 'A6'])
  assert.equal(lines.find(line => line.startsWith('A1,')), 'A1,Guard rail,Closed,High,Incident,Pat Lee,Plant A,2026-10-01,2026-10-11,2026-10-11,Y,10')
  assert.equal(lines.find(line => line.startsWith('A2,')).split(',')[10], 'N')
  assert.equal(lines.find(line => line.startsWith('A4,')), 'A4,Guard rail,In progress,Moderate,Manual,Pat Lee,Plant A,2026-11-01,2026-11-10,,,')
})

test('CSV cells are quoted and guarded against formula injection', () => {
  assert.equal(rules.csvCell('a,b'), '"a,b"')
  assert.equal(rules.csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(rules.csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(rules.csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(rules.csvCell('+1'), "'+1")
  assert.equal(rules.csvCell('-1'), "'-1")
  assert.equal(rules.csvCell('@cmd'), "'@cmd")
  assert.equal(rules.csvCell('=HYPERLINK("x","y")'), '"\'=HYPERLINK(""x"",""y"")"')
  assert.equal(rules.csvCell(null), '')
  assert.equal(rules.csvCell(0), '0')

  const period = rules.resolveCapaReportPeriod({ preset: '30d' }, TODAY)
  const csv = rules.capaReportCsv([capa({ action_number: 'Z1', title: '=cmd|calc, "now"' })], period, TODAY)
  assert.ok(csv.includes('Z1,"\'=cmd|calc, ""now"""'))
})

test('query and filename follow the period', () => {
  const custom = rules.resolveCapaReportPeriod({ preset: 'custom', from: '2026-01-01', to: '2026-03-31' }, TODAY)

  assert.equal(rules.capaReportQuery(custom), 'preset=custom&from=2026-01-01&to=2026-03-31')
  assert.equal(rules.capaReportQuery(rules.resolveCapaReportPeriod({ preset: 'ytd' }, TODAY)), 'preset=ytd')
  assert.equal(rules.capaReportFilename(custom), 'capa-report-2026-01-01-to-2026-03-31.csv')
})
