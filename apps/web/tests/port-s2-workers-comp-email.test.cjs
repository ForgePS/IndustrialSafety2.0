/**
 * Port slice 2 completion: unit tests for the weekly status email (src/lib/forgeWorkersCompEmail.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s2-workers-comp-email.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const email = require(path.join(__dirname, '../src/lib/forgeWorkersCompEmail.ts'))

test('recipient lists are split, lowercased, de-duplicated and validated', () => {
  assert.deepEqual(email.parseEmailRecipients('Risk@Example.com, hr@example.com;risk@example.com\nnot-an-email'), {
    valid: ['risk@example.com', 'hr@example.com'],
    invalid: ['not-an-email']
  })
  assert.deepEqual(email.parseEmailRecipients('   '), { valid: [], invalid: [] })
})

test('the report week is the most recent Thursday', () => {
  assert.equal(email.reportWeekOf('2026-10-22'), '2026-10-22') // Thursday
  assert.equal(email.reportWeekOf('2026-10-23'), '2026-10-22') // Friday
  assert.equal(email.reportWeekOf('2026-10-26'), '2026-10-22') // Monday
  assert.equal(email.reportWeekOf('2026-10-21'), '2026-10-15') // Wednesday
})

test('weekly email is due once on the chosen day and hour', () => {
  const settings = { enabled: true, weekday: 5, hour: 7, lastSentWeek: null }

  // 2026-10-23 is a Friday.
  assert.deepEqual(email.weeklyEmailDue(settings, { date: '2026-10-23', weekday: 5, hour: 6 }), { due: false, weekOf: '2026-10-22' })
  assert.deepEqual(email.weeklyEmailDue(settings, { date: '2026-10-23', weekday: 5, hour: 7 }), { due: true, weekOf: '2026-10-22' })
  assert.equal(email.weeklyEmailDue({ ...settings, lastSentWeek: '2026-10-22' }, { date: '2026-10-23', weekday: 5, hour: 9 }).due, false)
  assert.equal(email.weeklyEmailDue({ ...settings, enabled: false }, { date: '2026-10-23', weekday: 5, hour: 9 }).due, false)
  assert.equal(email.weeklyEmailDue(settings, { date: '2026-10-22', weekday: 4, hour: 9 }).due, false)
})

test('weekly email escapes content and flags missing updates', () => {
  const built = email.buildWeeklyStatusEmail({
    organizationName: 'Demo <Co>',
    weekOf: '2026-10-22',
    rows: [
      {
        caseNumber: 'WC-2026-0001', employeeName: 'Pat <script>', injuryDate: '2026-10-01', location: 'Plant', stage: 'Treatment',
        workStatus: 'Restricted', daysAway: 5, restrictedDays: 15, claim: 'CLM-1', carrier: 'Mutual', note: null,
        link: 'https://forge.example/workers-comp/1'
      },
      {
        caseNumber: 'WC-2026-0002', employeeName: 'Sam', injuryDate: '2026-10-02', location: 'Plant', stage: 'Intake',
        workStatus: 'Off work', daysAway: 3, restrictedDays: 0, claim: 'Self pay', carrier: '', note: 'Seen by clinic',
        link: 'https://forge.example/workers-comp/2'
      }
    ]
  })

  assert.equal(built.subject, "Workers' comp weekly status: 2 open cases (week of 2026-10-22)")
  assert.match(built.html, /Pat &lt;script&gt;/)
  assert.doesNotMatch(built.html, /<script>/)
  assert.match(built.html, /Demo &lt;Co&gt;/)
  assert.match(built.html, /No update entered/)
  assert.match(built.text, /1 without this week's update/)
  assert.match(built.text, /This week: Seen by clinic/)
  assert.match(built.text, /This week: NO UPDATE ENTERED/)
})

test('an empty week still produces a valid email', () => {
  const built = email.buildWeeklyStatusEmail({ organizationName: 'Demo', weekOf: '2026-10-22', rows: [] })
  assert.equal(built.subject, "Workers' comp weekly status: 0 open cases (week of 2026-10-22)")
  assert.match(built.html, /No open cases/)
})
