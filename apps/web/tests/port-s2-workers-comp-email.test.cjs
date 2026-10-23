/**
 * Unit tests for the workers' comp weekly status notice (src/lib/forgeWorkersCompEmail.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s2-workers-comp-email.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const email = require(path.join(__dirname, '../src/lib/forgeWorkersCompEmail.ts'))

const row = (overrides = {}) => ({
  caseNumber: 'WC-2026-0001',
  stage: 'Treatment',
  workStatus: 'Restricted duty',
  daysAway: 5,
  restrictedDays: 15,
  hasUpdate: true,
  ...overrides
})

test('the report week is the most recent Thursday', () => {
  assert.equal(email.reportWeekOf('2026-10-22'), '2026-10-22') // Thursday
  assert.equal(email.reportWeekOf('2026-10-23'), '2026-10-22') // Friday
  assert.equal(email.reportWeekOf('2026-10-26'), '2026-10-22') // Monday
  assert.equal(email.reportWeekOf('2026-10-21'), '2026-10-15') // Wednesday
  assert.equal(email.weekdayOf('2026-10-23'), 5)
})

test('weekly notice is due once on the chosen day and hour', () => {
  const settings = { enabled: true, weekday: 5, hour: 7, lastSentWeek: null }

  // 2026-10-23 is a Friday.
  assert.deepEqual(email.weeklyEmailDue(settings, { date: '2026-10-23', weekday: 5, hour: 6 }), { due: false, weekOf: '2026-10-22' })
  assert.deepEqual(email.weeklyEmailDue(settings, { date: '2026-10-23', weekday: 5, hour: 7 }), { due: true, weekOf: '2026-10-22' })
  assert.equal(email.weeklyEmailDue({ ...settings, lastSentWeek: '2026-10-22' }, { date: '2026-10-23', weekday: 5, hour: 9 }).due, false)
  assert.equal(email.weeklyEmailDue({ ...settings, enabled: false }, { date: '2026-10-23', weekday: 5, hour: 9 }).due, false)
  assert.equal(email.weeklyEmailDue(settings, { date: '2026-10-22', weekday: 4, hour: 9 }).due, false)
})

test('the notice lists cases missing an update first and carries no employee details', () => {
  const notice = email.buildWeeklyStatusNotice({
    organizationName: 'Demo Co',
    weekOf: '2026-10-22',
    rows: [row(), row({ caseNumber: 'WC-2026-0002', stage: 'Intake', workStatus: 'Off work', daysAway: 3, restrictedDays: 0, hasUpdate: false })]
  })

  assert.equal(notice.title, "Workers' comp weekly status: 2 open cases (week of 2026-10-22)")
  assert.match(notice.body, /2 open cases; 1 without this week's update/)
  assert.ok(notice.body.indexOf('WC-2026-0002') < notice.body.indexOf('WC-2026-0001'), 'missing updates come first')
  assert.match(notice.body, /WC-2026-0002: Intake, Off work, 3 away \/ 0 restricted - NO UPDATE/)
  assert.match(notice.body, /WC-2026-0001: Treatment, Restricted duty, 5 away \/ 15 restricted\n/)
  assert.match(notice.body, /Open the weekly status page in Forge/)
})

test('a long list is cut to fit the notification service limit', () => {
  const rows = Array.from({ length: 200 }, (_, index) => row({ caseNumber: `WC-2026-${String(index + 1).padStart(4, '0')}`, hasUpdate: index % 2 === 0 }))
  const notice = email.buildWeeklyStatusNotice({ organizationName: 'A'.repeat(200), weekOf: '2026-10-22', rows })

  assert.ok(notice.body.length <= 2000, `body is ${notice.body.length} characters`)
  assert.ok(notice.title.length <= 200)
  assert.match(notice.body, /\.\.\. and \d+ more/)
  assert.match(notice.body, /200 open cases; 100 without this week's update/)
})

test('an empty week still produces a valid notice', () => {
  const notice = email.buildWeeklyStatusNotice({ organizationName: 'Demo', weekOf: '2026-10-22', rows: [] })

  assert.equal(notice.title, "Workers' comp weekly status: 0 open cases (week of 2026-10-22)")
  assert.match(notice.body, /No open cases in your area/)
})
