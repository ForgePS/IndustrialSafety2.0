/**
 * Port slice 13: Reporting rules (src/lib/forgeReportRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s13-report-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeReportRules.ts'))

const today = '2026-11-19'

const meta = {
  defaultPreset: '90d',
  dateLabel: 'Occurred',
  columns: [
    { key: 'number', label: 'Number', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'days', label: 'Days away', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'text', sensitivePermission: 'reporting.view_sensitive' }
  ],
  statuses: [
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' }
  ],
  groupable: ['type'],
  usesYear: false
}

const LOC_A = '11111111-1111-4111-8111-111111111111'
const LOC_B = '22222222-2222-4222-8222-222222222222'

const record = (number, day, type, status, locationId, days = 0) => ({
  cells: { number, type, days, notes: 'secret ' + number },
  day,
  locationId,
  status
})

test('periods resolve relative to today, with an inclusive end', () => {
  assert.deepEqual(rules.resolveReportPeriod({ preset: '30d' }, today), { preset: '30d', from: '2026-10-21', to: today, label: 'Last 30 days' })
  assert.deepEqual(rules.resolveReportPeriod({ preset: 'last_month' }, today).from, '2026-10-01')
  assert.deepEqual(rules.resolveReportPeriod({ preset: 'last_month' }, today).to, '2026-10-31')
  assert.deepEqual(rules.resolveReportPeriod({ preset: 'last_month' }, '2026-01-15').from, '2025-12-01')
  assert.deepEqual(rules.resolveReportPeriod({ preset: 'last_year' }, today).to, '2025-12-31')
  assert.equal(rules.resolveReportPeriod({ preset: 'nope' }, today, '90d').preset, '90d')
  assert.deepEqual(rules.resolveReportPeriod({ preset: 'custom', from: '2026-03-01', to: '2026-01-01' }, today).from, '2026-01-01')
  assert.equal(rules.resolveReportPeriod({ preset: 'custom', from: '2026-02-30' }, today, '30d').preset, '30d')
  assert.equal(rules.inPeriod(null, rules.resolveReportPeriod({ preset: 'all' }, today)), true)
  assert.equal(rules.inPeriod(null, rules.resolveReportPeriod({ preset: '30d' }, today)), false)
})

test('parameters are cleaned against the report: unknown status, columns and group are dropped', () => {
  const params = rules.cleanReportParams(
    { preset: 'custom', from: '2026-01-01', to: 'bad', status: 'weird', groupBy: 'notes', locationId: 'not-a-uuid', columns: 'type,nope,number,type' },
    meta,
    today
  )

  assert.deepEqual(params, { preset: 'custom', from: '2026-01-01', columns: ['type', 'number'] })
  assert.deepEqual(rules.cleanReportParams({ status: 'open', groupBy: 'type', locationId: LOC_A.toUpperCase() }, meta, today), {
    locationId: LOC_A,
    status: 'open',
    groupBy: 'type'
  })
  // A typed date makes the range custom even when the period list still says something else.
  assert.deepEqual(rules.cleanReportParams({ preset: '30d', to: '2026-06-30' }, meta, today), { preset: 'custom', to: '2026-06-30' })
  // "Custom" with no dates falls back to the report's default.
  assert.deepEqual(rules.cleanReportParams({ preset: 'custom' }, meta, today), {})
  assert.deepEqual(rules.cleanReportParams({ year: '2026' }, { ...meta, usesYear: true }, today), { year: 2026 })
  assert.deepEqual(rules.cleanReportParams({ year: '1850' }, { ...meta, usesYear: true }, today), {})
})

test('filters apply to the whole list, and sensitive columns never reach the rows without permission', () => {
  const records = [
    record('A-1', '2026-11-01', 'injury', 'open', LOC_A, 3),
    record('A-2', '2026-10-01', 'injury', 'closed', LOC_A, 2),
    record('B-1', '2026-11-10', 'near_miss', 'open', LOC_B),
    record('OLD', '2025-01-01', 'injury', 'open', LOC_A, 9)
  ]

  const visible = rules.visibleColumns(meta.columns, () => false)
  const result = rules.runReportRules({ records, meta, params: { status: 'open' }, visible, today })

  assert.deepEqual(
    result.rows.map(row => row.number),
    ['A-1', 'B-1']
  )
  assert.equal(result.total, 2)
  assert.ok(result.rows.every(row => !('notes' in row)))
  assert.ok(!result.columns.some(column => column.key === 'notes'))

  const atA = rules.runReportRules({ records, meta, params: { locationId: LOC_A, preset: 'all' }, visible, today })

  assert.deepEqual(
    atA.rows.map(row => row.number),
    ['A-1', 'A-2', 'OLD']
  )

  // Asking for the hidden column by name does not bring it back.
  const picked = rules.runReportRules({ records, meta, params: { columns: ['notes'] }, visible, today })

  assert.ok(!picked.columns.some(column => column.key === 'notes'))
  assert.ok(picked.rows.every(row => !('notes' in row)))

  const withSensitive = rules.visibleColumns(meta.columns, key => key === 'reporting.view_sensitive')

  assert.ok(withSensitive.some(column => column.key === 'notes'))
})

test('grouping counts records and totals number columns, busiest group first', () => {
  const records = [record('A', '2026-11-01', 'injury', 'open', LOC_A, 3), record('B', '2026-11-02', 'injury', 'open', LOC_A, 4), record('C', '2026-11-03', null, 'open', LOC_B, 1)]
  const visible = rules.visibleColumns(meta.columns, () => false)
  const result = rules.runReportRules({ records, meta, params: { groupBy: 'type' }, visible, today })

  assert.deepEqual(result.groups, [
    { label: 'injury', count: 2, totals: { days: 7 } },
    { label: '(none)', count: 1, totals: { days: 1 } }
  ])

  const csv = rules.reportCsv(result)

  assert.equal(csv.split('\r\n')[0], '﻿Type,Count,Total days away')
  assert.equal(csv.split('\r\n')[1], 'injury,2,7')
})

test('a report with no date ignores the period', () => {
  const visible = rules.visibleColumns(meta.columns, () => false)
  const result = rules.runReportRules({
    records: [record('X', null, 'injury', 'open', null)],
    meta: { defaultPreset: '30d' },
    params: { preset: '30d' },
    visible,
    today
  })

  assert.equal(result.total, 1)
  assert.equal(result.period.preset, 'all')
})

test('CSV neutralizes formulas and quotes separators', () => {
  const result = {
    period: rules.resolveReportPeriod({ preset: 'all' }, today),
    columns: [
      { key: 'a', label: 'A', type: 'text' },
      { key: 'b', label: 'B', type: 'boolean' }
    ],
    rows: [{ a: '=HYPERLINK("x")', b: true }, { a: 'one, two', b: false }],
    total: 2,
    groupBy: null,
    groups: []
  }

  const lines = rules.reportCsv(result).split('\r\n')

  assert.equal(lines[1], `"'=HYPERLINK(""x"")",Yes`)
  assert.equal(lines[2], '"one, two",No')
  assert.equal(rules.reportFilename('incidents.log', rules.resolveReportPeriod({ preset: '30d' }, today), 'csv', today), 'incidents-log-2026-10-21-to-2026-11-19.csv')
})

test('schedules run at the local hour in their own time zone, across daylight saving', () => {
  const chicago = { frequency: 'daily', hour: 7, weekday: 1, monthday: 1, timezone: 'America/Chicago' }

  // 7 AM Central is 13:00 UTC in November (CST) and 12:00 UTC in July (CDT).
  assert.equal(rules.nextScheduleRun(chicago, new Date('2026-11-19T00:00:00Z')).toISOString(), '2026-11-19T13:00:00.000Z')
  assert.equal(rules.nextScheduleRun(chicago, new Date('2026-07-01T00:00:00Z')).toISOString(), '2026-07-01T12:00:00.000Z')
  assert.equal(rules.nextScheduleRun(chicago, new Date('2026-11-19T13:00:00Z')).toISOString(), '2026-11-20T13:00:00.000Z')

  // 8 PM Monday Central is Tuesday 02:00 UTC: the weekday follows local time (1.0 got this wrong).
  const monday8pm = { frequency: 'weekly', hour: 20, weekday: 1, monthday: 1, timezone: 'America/Chicago' }

  assert.equal(rules.nextScheduleRun(monday8pm, new Date('2026-11-19T00:00:00Z')).toISOString(), '2026-11-24T02:00:00.000Z')

  const monthly = { frequency: 'monthly', hour: 6, weekday: 1, monthday: 1, timezone: 'UTC' }

  assert.equal(rules.nextScheduleRun(monthly, new Date('2026-11-19T00:00:00Z')).toISOString(), '2026-12-01T06:00:00.000Z')

  assert.equal(rules.describeSchedule(monday8pm), 'Every Monday at 8:00 PM (America/Chicago)')
})

test('schedule forms are validated', () => {
  assert.deepEqual(rules.cleanScheduleTiming({ frequency: 'weekly', hour: '9', weekday: '5', timezone: 'America/New_York' }), {
    frequency: 'weekly',
    hour: 9,
    weekday: 5,
    monthday: 1,
    timezone: 'America/New_York'
  })
  assert.ok('error' in rules.cleanScheduleTiming({ frequency: 'hourly', hour: '9', timezone: 'UTC' }))
  assert.ok('error' in rules.cleanScheduleTiming({ frequency: 'daily', hour: '24', timezone: 'UTC' }))
  assert.ok('error' in rules.cleanScheduleTiming({ frequency: 'monthly', hour: '1', monthday: '31', timezone: 'UTC' }))
  assert.ok('error' in rules.cleanScheduleTiming({ frequency: 'daily', hour: '1', timezone: 'Mars/Olympus' }))
})
