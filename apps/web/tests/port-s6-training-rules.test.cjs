/**
 * Port slice 6: unit tests for the training gap rules (src/lib/forgeTrainingReportRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s6-training-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeTrainingReportRules.ts'))

const TODAY = '2026-11-15'

test('date helpers count whole days', () => {
  assert.equal(rules.daysBetweenIso('2026-11-10', TODAY), 5)
  assert.equal(rules.daysBetweenIso(TODAY, '2026-11-10'), -5)
  assert.equal(rules.addDaysToIso(TODAY, 30), '2026-12-15')
  assert.equal(rules.addDaysToIso('2026-12-31T23:00:00Z', 1), '2027-01-01')
})

test('CSV quotes cells and neutralizes formulas', () => {
  const csv = rules.toCsv(['Name', 'Note'], [['Smith, J', '=HYPERLINK("x")'], ['A "quote"', null]])
  const lines = csv.split('\r\n')

  assert.equal(lines[0], 'Name,Note')
  assert.ok(lines[1].startsWith('"Smith, J",'))
  assert.ok(!/,=/.test(lines[1]), 'a formula cell must not start with =')
  assert.ok(lines[2].includes('"A ""quote"""'))
  assert.ok(csv.endsWith('\r\n'))
})

test('attachment type comes from the file name', () => {
  assert.equal(rules.attachmentTypeFromName('card.PDF'), 'application/pdf')
  assert.equal(rules.attachmentTypeFromName('photo.jpg'), 'image/jpeg')
  assert.equal(rules.attachmentTypeFromName('photo.heic'), 'image/heic')
  assert.equal(rules.attachmentTypeFromName('virus.exe'), '')
  assert.equal(rules.ATTACHMENT_MAX_BYTES, 12 * 1024 * 1024)
})

test('answer keys take a letter or a number counted from 1', () => {
  assert.equal(rules.parseAnswerKey('B', 4), 1)
  assert.equal(rules.parseAnswerKey('b)', 4), 1)
  assert.equal(rules.parseAnswerKey('1', 4), 0, '1 is the first choice, not the second (1.0 read it 0-based)')
  assert.equal(rules.parseAnswerKey('4', 4), 3)
  assert.equal(rules.parseAnswerKey('E', 4), null)
  assert.equal(rules.parseAnswerKey('5', 4), null)
  assert.equal(rules.parseAnswerKey('', 4), null)
})

test('numbered text questions parse with answers and explanations', () => {
  const result = rules.parseQuestionText(`1. What color is a lockout tag?
A) Red
B) Green
C) Blue
Answer: A
Explanation: Danger tags are red.

Q2) Who may remove a lock?
(A) Anyone
(B) The person who applied it
Correct answer - B
Page 4

3. No answer here?
A. Yes
B. No`)

  assert.equal(result.questions.length, 2)
  assert.deepEqual(result.questions[0], { stem: 'What color is a lockout tag?', choices: ['Red', 'Green', 'Blue'], correctIndex: 0, explanation: 'Danger tags are red.' })
  assert.equal(result.questions[1].stem, 'Who may remove a lock?')
  assert.deepEqual(result.questions[1].choices, ['Anyone', 'The person who applied it'])
  assert.equal(result.questions[1].correctIndex, 1)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /Question 3/)
})

test('CSV questions accept choice columns and a split choices column', () => {
  const columns = rules.parseQuestionCsv(`question,choice1,choice2,choice3,answer,explanation
"Lock, then?",Tag,Try,Walk away,2,"Verify zero energy
before work"
Second?,Yes,No,,A,`)

  assert.deepEqual(columns.errors, [])
  assert.equal(columns.questions.length, 2)
  assert.deepEqual(columns.questions[0], { stem: 'Lock, then?', choices: ['Tag', 'Try', 'Walk away'], correctIndex: 1, explanation: 'Verify zero energy\nbefore work' })
  assert.deepEqual(columns.questions[1].choices, ['Yes', 'No'])
  assert.equal(columns.questions[1].correctIndex, 0)

  const split = rules.parseQuestionCsv('stem;choices;correct\nPick one;Red|Blue|Green;C\n')

  assert.deepEqual(split.errors, [])
  assert.deepEqual(split.questions[0].choices, ['Red', 'Blue', 'Green'])
  assert.equal(split.questions[0].correctIndex, 2)

  const bad = rules.parseQuestionCsv('question,A,B,answer\nOnly one?,Yes,,Z\n')

  assert.equal(bad.questions.length, 0)
  assert.equal(bad.errors.length, 1)
})

const attempt = (id, personnel, number, passed, score, questionIds, answers, month = '2026-10') => ({
  id,
  course_id: 'c1',
  personnel_id: personnel,
  attempt_number: number,
  status: 'submitted',
  question_ids: questionIds,
  answers,
  score_percent: score,
  passed,
  submitted_at: `${month}-05T12:00:00Z`
})

test('quiz QC summarizes attempts and flags hard questions', () => {
  const questions = [
    { id: 'q1', stem: 'Easy', correct_index: 0, course_id: 'c1' },
    { id: 'q2', stem: 'Hard', correct_index: 1, course_id: 'c1' }
  ]
  const qc = rules.trainingQc({
    questions,
    attempts: [
      attempt('a1', 'p1', 1, false, 50, ['q1', 'q2'], [0, 0]),
      attempt('a2', 'p1', 2, true, 100, ['q1', 'q2'], [0, 1], '2026-11'),
      attempt('a3', 'p2', 1, true, 50, ['q1', 'q2'], [0, 0], '2026-11'),
      { ...attempt('a4', 'p3', 1, null, null, null, null), status: 'in_progress', submitted_at: null }
    ]
  })

  assert.equal(qc.summary.attempts, 3)
  assert.equal(qc.summary.learners, 2)
  assert.equal(qc.summary.passRate, 66.7)
  assert.equal(qc.summary.firstAttemptPassRate, 50)
  assert.equal(qc.summary.averageAttemptsToPass, 1.5)
  assert.equal(qc.summary.inProgress, 1)
  assert.equal(qc.buckets['50-59'], 2)
  assert.equal(qc.buckets['90-100'], 1)
  assert.deepEqual(qc.months.map(item => item.month), ['2026-10', '2026-11'])
  assert.equal(qc.questionStats[0].stem, 'Hard')
  assert.equal(qc.questionStats[0].correctRate, 33.3)
  assert.deepEqual(qc.lowQuestions.map(item => item.id), ['q2'])
  assert.equal(rules.qcTone(null), 'muted')
  assert.equal(rules.qcTone(85), 'good')
  assert.equal(rules.qcTone(40), 'bad')
})

test('overdue lists every open late assignment, most late first', () => {
  const base = { course_id: 'c1', personnel_id: 'p1', assigned_at: '2026-10-01T00:00:00Z' }
  const rows = rules.overdueAssignments(
    [
      { ...base, id: 'a', status: 'assigned', due_date: '2026-11-10' },
      { ...base, id: 'b', status: 'in_progress', due_date: '2026-11-01' },
      { ...base, id: 'c', status: 'completed', due_date: '2026-11-01' },
      { ...base, id: 'd', status: 'assigned', due_date: TODAY },
      { ...base, id: 'e', status: 'assigned', due_date: null }
    ],
    TODAY
  )

  assert.deepEqual(rows.map(item => [item.id, item.daysLate]), [['b', 14], ['a', 5]])
})

test('activity counts learners per course in the period', () => {
  const rows = rules.activityByCourse({
    from: '2026-11-01',
    to: '2026-11-30',
    assignments: [
      { id: '1', course_id: 'c1', personnel_id: 'p1', status: 'in_progress', due_date: null, assigned_at: '2026-11-02T00:00:00Z' },
      { id: '2', course_id: 'c1', personnel_id: 'p2', status: 'assigned', due_date: null, assigned_at: '2026-11-03T00:00:00Z' },
      { id: '3', course_id: 'c2', personnel_id: 'p1', status: 'assigned', due_date: null, assigned_at: '2026-09-01T00:00:00Z' }
    ],
    completions: [{ course_id: 'c1', personnel_id: 'p1', completed_at: '2026-11-04T00:00:00Z' }]
  })

  assert.deepEqual(rows, [{ courseId: 'c1', assigned: 2, completed: 1, inProgress: 1, latest: '2026-11-04T00:00:00Z' }])
})

test('reminder timing: overdue beats due soon, and settings switch them off', () => {
  const settings = { due_reminder_days: 3, overdue_notices: true, expiring_notice_days: 30 }

  assert.equal(rules.assignmentReminder({ status: 'assigned', due_date: '2026-11-14' }, settings, TODAY), 'overdue')
  assert.equal(rules.assignmentReminder({ status: 'assigned', due_date: '2026-11-14' }, { ...settings, overdue_notices: false }, TODAY), null)
  assert.equal(rules.assignmentReminder({ status: 'in_progress', due_date: '2026-11-18' }, settings, TODAY), 'due_soon')
  assert.equal(rules.assignmentReminder({ status: 'assigned', due_date: '2026-11-19' }, settings, TODAY), null)
  assert.equal(rules.assignmentReminder({ status: 'assigned', due_date: TODAY }, { ...settings, due_reminder_days: 0 }, TODAY), null)
  assert.equal(rules.assignmentReminder({ status: 'completed', due_date: '2026-11-01' }, settings, TODAY), null)

  assert.equal(rules.expiringNoticeDue('2026-12-10', settings, TODAY), true)
  assert.equal(rules.expiringNoticeDue('2027-01-10', settings, TODAY), false)
  assert.equal(rules.expiringNoticeDue('2026-11-01', settings, TODAY), false, 'already expired')
  assert.equal(rules.expiringNoticeDue('2026-12-10', { ...settings, expiring_notice_days: 0 }, TODAY), false)
  for (const kind of ['assigned', 'due_soon', 'overdue', 'expiring']) assert.ok(rules.NOTICE_TEXT[kind], kind)
})
