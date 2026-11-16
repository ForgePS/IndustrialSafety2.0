/**
 * Port slice 6 training rules: question import, quiz QC, overdue and activity reports, notice timing and CSV.
 * Pure functions with no imports so they can be unit tested with `node --experimental-strip-types`.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

export const daysBetweenIso = (from: string, to: string) =>
  Math.round((Date.parse(to.slice(0, 10) + 'T00:00:00Z') - Date.parse(from.slice(0, 10) + 'T00:00:00Z')) / DAY_MS)

export const addDaysToIso = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

const csvCell = (value: unknown) => {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text

  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

/** CSV with spreadsheet formulas neutralized and CRLF line endings. */
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'

// ---------------------------------------------------------------------------
// Material topics (1.0 training-material-topics.ts)
// ---------------------------------------------------------------------------

export const MATERIAL_TOPICS = ['general', 'new_hire', 'safety', 'loto', 'ppe', 'emergency', 'fleet', 'equipment', 'compliance', 'refresher'] as const

export type MaterialTopic = (typeof MATERIAL_TOPICS)[number]

export const MATERIAL_TOPIC_LABELS: Record<MaterialTopic, string> = {
  general: 'General',
  new_hire: 'New Hire',
  safety: 'Safety',
  loto: 'Lockout / Tagout',
  ppe: 'PPE',
  emergency: 'Emergency',
  fleet: 'Fleet',
  equipment: 'Equipment',
  compliance: 'Compliance',
  refresher: 'Refresher'
}

// ---------------------------------------------------------------------------
// Completion attachments
// ---------------------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

/** Guesses a type from the extension when the browser sends none (1.0 did the same). */
export const attachmentTypeFromName = (name: string) => {
  const ext = name.toLowerCase().split('.').pop() || ''

  return ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' } as Record<string, string>)[ext] || ''
}

// ---------------------------------------------------------------------------
// Question import (1.0 training-question-import.ts, with its silent-default bugs fixed)
// ---------------------------------------------------------------------------

export const QUESTION_IMPORT_MAX = 200
export const QUESTION_MAX_CHOICES = 6
const LETTERS = 'ABCDEF'

export type ImportedQuestion = { stem: string; choices: string[]; correctIndex: number; explanation: string | null }
export type QuestionImportResult = { questions: ImportedQuestion[]; errors: string[] }

/** Smart quotes, dashes, non-breaking spaces and the common UTF-8-as-1252 mojibake (1.0 training-import-text.ts). */
export const cleanImportText = (text: string) =>
  text
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€\u009d|â€/g, '"')
    .replace(/â€“|â€”/g, '-')
    .replace(/Â /g, ' ')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

/**
 * Reads an answer key: a letter A-F, or a number counted from 1 ("2" = B).
 * 1.0 read numbers from 0, so "1" meant B; 2.0 reads them the way people write them.
 */
export const parseAnswerKey = (raw: string, choiceCount: number): number | null => {
  const value = raw.trim().replace(/[).:\]]$/, '').replace(/^\(/, '')

  if (/^[A-Fa-f]$/.test(value)) {
    const index = LETTERS.indexOf(value.toUpperCase())

    return index < choiceCount ? index : null
  }

  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1

    return index >= 0 && index < choiceCount ? index : null
  }

  return null
}

const QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\]]\s+(.*)$/i
const CHOICE_LINE = /^\(?([A-Fa-f])\s*[.):\]]\s+(.*)$/
const ANSWER_LINE = /^(?:correct\s+answer|answer\s+key|answer|key|correct)\s*[:\-=]\s*(.+)$/i
const EXPLANATION_LINE = /^(?:explanation|rationale|why)\s*[:\-]\s*(.*)$/i
const REFERENCE_LINE = /^(?:page|ref|reference)\s*[:\-]\s*.*$/i

const finishQuestion = (block: { number: string; stem: string[]; choices: string[]; answer: string | null; explanation: string[] }, errors: string[]) => {
  const label = `Question ${block.number}`
  const stem = cleanImportText(block.stem.join(' '))
  const choices = block.choices.map(cleanImportText).filter(Boolean)

  if (!stem) {
    errors.push(`${label}: no question text.`)
    
return null
  }

  if (choices.length < 2) {
    errors.push(`${label}: needs at least 2 choices.`)
    
return null
  }

  if (choices.length > QUESTION_MAX_CHOICES) {
    errors.push(`${label}: at most ${QUESTION_MAX_CHOICES} choices (A-F).`)
    
return null
  }

  if (block.answer === null) {
    errors.push(`${label}: no "Answer:" line.`)
    
return null
  }

  const correctIndex = parseAnswerKey(block.answer, choices.length)

  if (correctIndex === null) {
    errors.push(`${label}: answer "${block.answer.trim()}" is not one of its choices.`)
    
return null
  }

  const explanation = cleanImportText(block.explanation.join(' '))

  return { stem, choices, correctIndex, explanation: explanation || null }
}

/**
 * Parses numbered multiple-choice text, as typed or as extracted from a PDF:
 *
 *   1. Question text
 *   A) choice   (also A.  A:  A]  (A))
 *   B) choice
 *   Answer: B   (also "Correct answer - 2", "Answer key: b")
 *   Explanation: optional
 *
 * Lines that follow continue the question or the last choice. Page / Ref lines are ignored.
 */
export const parseQuestionText = (raw: string): QuestionImportResult => {
  const errors: string[] = []
  const questions: ImportedQuestion[] = []

  type Block = { number: string; stem: string[]; choices: string[]; answer: string | null; explanation: string[]; mode: 'stem' | 'choice' | 'explanation' }
  let block: Block | null = null

  const flush = () => {
    if (!block) return

    const question = finishQuestion(block, errors)

    if (question) questions.push(question)
    block = null
  }

  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()

    if (!line) continue

    const start = line.match(QUESTION_START)
    const current = block as Block | null

    // A numbered line starts a question, unless we are inside choices and it is clearly a choice-like continuation.
    if (start && (!current || current.choices.length > 0 || current.answer !== null)) {
      flush()
      block = { number: start[1], stem: [start[2]], choices: [], answer: null, explanation: [], mode: 'stem' }
      continue
    }

    if (!current) continue

    const answer = line.match(ANSWER_LINE)

    if (answer) {
      current.answer = answer[1]
      current.mode = 'stem'
      continue
    }

    const explanation = line.match(EXPLANATION_LINE)

    if (explanation) {
      current.explanation.push(explanation[1])
      current.mode = 'explanation'
      continue
    }

    if (REFERENCE_LINE.test(line)) continue

    const choice = line.match(CHOICE_LINE)

    if (choice && current.answer === null && LETTERS.indexOf(choice[1].toUpperCase()) === current.choices.length) {
      current.choices.push(choice[2])
      current.mode = 'choice'
      continue
    }

    if (current.mode === 'choice') current.choices[current.choices.length - 1] += ' ' + line
    else if (current.mode === 'explanation') current.explanation.push(line)
    else if (current.answer === null) current.stem.push(line)
  }

  flush()

  if (!questions.length && !errors.length) errors.push('No numbered questions found. Start each question with "1.", "2." and so on.')

  return capQuestions({ questions, errors })
}

const splitCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      cells.push(cell)
      cell = ''
    } else cell += char
  }

  cells.push(cell)

  return cells.map(item => item.trim())
}

/** Splits CSV text into records, keeping line breaks inside quoted cells (1.0 could not). */
const csvRecords = (raw: string) => {
  const records: string[] = []
  let current = ''
  let quotes = 0

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    current = current ? current + '\n' + line : line
    quotes += (line.match(/"/g) || []).length

    if (quotes % 2 === 0) {
      if (current.trim()) records.push(current)
      current = ''
      quotes = 0
    }
  }

  if (current.trim()) records.push(current)

  return records
}

const HEADER_ALIASES: Record<string, string[]> = {
  stem: ['stem', 'question', 'prompt', 'question text'],
  correct: ['correct', 'correctindex', 'correct index', 'answer', 'answer key', 'key', 'correct answer'],
  explanation: ['explanation', 'feedback', 'rationale'],
  choices: ['choices', 'options']
}

/**
 * Parses a CSV (comma, semicolon or tab, detected from the header) with a header row:
 * question / stem, answer / correct, and choices as choice1..6, choiceA..F, option1..6, bare A..F columns,
 * or one "choices" column split on | or ;. Explanation is optional.
 */
export const parseQuestionCsv = (raw: string): QuestionImportResult => {
  const records = csvRecords(raw.replace(/^﻿/, ''))

  if (records.length < 2) return { questions: [], errors: ['The CSV needs a header row and at least one question.'] }

  const headerLine = records[0]
  const delimiter = ['\t', ';', ','].map(d => ({ d, n: splitCsvLine(headerLine, d).length })).sort((a, b) => b.n - a.n)[0].d
  const header = splitCsvLine(headerLine, delimiter).map(item => item.toLowerCase().replace(/\s+/g, ' '))
  const find = (key: string) => header.findIndex(item => HEADER_ALIASES[key].includes(item))
  const stemAt = find('stem')
  const correctAt = find('correct')
  const explanationAt = find('explanation')
  const choicesAt = find('choices')
  const choiceColumns: number[] = []

  for (let n = 0; n < QUESTION_MAX_CHOICES; n += 1) {
    const letter = LETTERS[n].toLowerCase()

    const at = header.findIndex(item =>
      [`choice${n + 1}`, `choice ${n + 1}`, `choice${letter}`, `choice ${letter}`, `option${n + 1}`, `option ${n + 1}`, `option${letter}`, `option ${letter}`, letter].includes(item)
    )

    if (at >= 0) choiceColumns.push(at)
  }

  const errors: string[] = []

  if (stemAt < 0) errors.push('Missing a "question" column.')
  if (correctAt < 0) errors.push('Missing an "answer" column.')
  if (choicesAt < 0 && choiceColumns.length < 2) errors.push('Missing choice columns (choice1, choice2... or A, B... or one "choices" column).')
  if (errors.length) return { questions: [], errors }

  const questions: ImportedQuestion[] = []

  records.slice(1).forEach((record, index) => {
    const cells = splitCsvLine(record, delimiter)
    const stem = cells[stemAt] || ''

    if (!stem.trim()) return

    const choices =
      choiceColumns.length >= 2 ? choiceColumns.map(at => cells[at] || '').filter(item => item.trim()) : (cells[choicesAt] || '').split(/\s*[|;]\s*/).filter(Boolean)

    const question = finishQuestion(
      { number: String(index + 1), stem: [stem], choices, answer: (cells[correctAt] || '').trim() || null, explanation: explanationAt >= 0 && cells[explanationAt] ? [cells[explanationAt]] : [] },
      errors
    )

    if (question) questions.push(question)
  })

  if (!questions.length && !errors.length) errors.push('No questions found in the CSV.')

  return capQuestions({ questions, errors: errors.map(item => item.replace(/^Question /, 'Row ')) })
}

const capQuestions = (result: QuestionImportResult): QuestionImportResult =>
  result.questions.length > QUESTION_IMPORT_MAX
    ? { questions: result.questions.slice(0, QUESTION_IMPORT_MAX), errors: [...result.errors, `Only the first ${QUESTION_IMPORT_MAX} questions are imported at once.`] }
    : result

// ---------------------------------------------------------------------------
// Quiz QC (1.0 training-qc-panel)
// ---------------------------------------------------------------------------

export type QcAttempt = {
  id: string
  course_id: string
  personnel_id: string
  attempt_number: number
  status: string
  question_ids: string[] | null
  answers: number[] | null
  score_percent: number | null
  passed: boolean | null
  submitted_at: string | null
}

export type QcQuestion = { id: string; stem: string; correct_index: number; course_id: string }

export const QC_LOW_THRESHOLD = 70
export const QC_SCORE_BUCKETS = ['0-49', '50-59', '60-69', '70-79', '80-89', '90-100'] as const

const bucketFor = (percent: number) => (percent < 50 ? '0-49' : percent >= 90 ? '90-100' : `${Math.floor(percent / 10) * 10}-${Math.floor(percent / 10) * 10 + 9}`)
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null)

/**
 * Quiz quality across submitted attempts: pass rates, scores, attempts to pass, score spread, monthly trend
 * and how often each question is answered correctly (lowest first). Unlike 1.0 it reads every attempt in range.
 */
export const trainingQc = ({ attempts, questions }: { attempts: QcAttempt[]; questions: QcQuestion[] }) => {
  const submitted = attempts.filter(item => item.status === 'submitted' && item.submitted_at)
  const passed = submitted.filter(item => item.passed)
  const firstTries = submitted.filter(item => item.attempt_number <= 1)
  const scores = submitted.map(item => Number(item.score_percent ?? 0))

  // Attempts needed: the attempt number of each person's first pass, per course.
  const firstPass = new Map<string, number>()

  for (const item of passed) {
    const key = item.personnel_id + ':' + item.course_id
    const before = firstPass.get(key)

    if (before === undefined || item.attempt_number < before) firstPass.set(key, item.attempt_number)
  }

  const buckets = Object.fromEntries(QC_SCORE_BUCKETS.map(key => [key, 0])) as Record<string, number>

  for (const score of scores) buckets[bucketFor(score)] += 1

  const months = new Map<string, { attempts: number; passed: number }>()

  for (const item of submitted) {
    const key = String(item.submitted_at).slice(0, 7)
    const entry = months.get(key) || { attempts: 0, passed: 0 }

    entry.attempts += 1
    if (item.passed) entry.passed += 1
    months.set(key, entry)
  }

  const byQuestion = new Map(questions.map(item => [item.id, { ...item, presented: 0, correct: 0 }]))

  for (const item of submitted) {
    ;(item.question_ids || []).forEach((questionId, index) => {
      const entry = byQuestion.get(questionId)

      if (!entry) return
      entry.presented += 1
      if ((item.answers || [])[index] === entry.correct_index) entry.correct += 1
    })
  }

  const questionStats = [...byQuestion.values()]
    .filter(item => item.presented > 0)
    .map(item => ({ id: item.id, stem: item.stem, course_id: item.course_id, presented: item.presented, correct: item.correct, incorrect: item.presented - item.correct, correctRate: pct(item.correct, item.presented) as number }))
    .sort((a, b) => a.correctRate - b.correctRate || b.presented - a.presented)

  const attemptsToPass = [...firstPass.values()]

  return {
    summary: {
      attempts: submitted.length,
      learners: new Set(submitted.map(item => item.personnel_id)).size,
      passRate: pct(passed.length, submitted.length),
      firstAttemptPassRate: pct(firstTries.filter(item => item.passed).length, firstTries.length),
      averageScore: scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null,
      averageAttemptsToPass: attemptsToPass.length ? Math.round((attemptsToPass.reduce((sum, value) => sum + value, 0) / attemptsToPass.length) * 10) / 10 : null,
      inProgress: attempts.filter(item => item.status === 'in_progress').length
    },
    buckets,
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, value]) => ({ month, ...value, passRate: pct(value.passed, value.attempts) })),
    questionStats,
    lowQuestions: questionStats.filter(item => item.correctRate < QC_LOW_THRESHOLD)
  }
}

export const qcTone = (rate: number | null) => (rate === null ? 'muted' : rate >= 80 ? 'good' : rate >= 60 ? 'warn' : 'bad')

// ---------------------------------------------------------------------------
// Overdue (1.0 missed report) and team activity
// ---------------------------------------------------------------------------

export type ReportAssignment = {
  id: string
  course_id: string
  personnel_id: string
  status: string
  due_date: string | null
  assigned_at: string
  updated_at?: string | null
}

const OPEN = ['assigned', 'in_progress', 'overdue']

/**
 * Open assignments past their due date, most days late first. 1.0 only listed ones never started, which
 * disagreed with its own overdue count; 2.0 lists every open assignment that is late.
 */
export const overdueAssignments = <T extends ReportAssignment>(assignments: T[], todayIso: string) =>
  assignments
    .filter(item => OPEN.includes(item.status) && item.due_date && item.due_date < todayIso)
    .map(item => ({ ...item, daysLate: daysBetweenIso(item.due_date as string, todayIso) }))
    .sort((a, b) => b.daysLate - a.daysLate)

export type ActivityCompletion = { course_id: string; personnel_id: string; completed_at: string }

/** Activity per course in a period: learners assigned, completed and in progress, latest activity first. */
export const activityByCourse = ({
  assignments,
  completions,
  from,
  to
}: {
  assignments: ReportAssignment[]
  completions: ActivityCompletion[]
  from: string
  to: string
}) => {
  const inRange = (iso: string | null | undefined) => Boolean(iso) && (iso as string).slice(0, 10) >= from && (iso as string).slice(0, 10) <= to
  const courses = new Map<string, { courseId: string; assigned: Set<string>; completed: Set<string>; inProgress: Set<string>; latest: string }>()

  const entry = (courseId: string) => {
    if (!courses.has(courseId)) courses.set(courseId, { courseId, assigned: new Set(), completed: new Set(), inProgress: new Set(), latest: '' })

    return courses.get(courseId)!
  }

  for (const item of assignments) {
    const activity = item.updated_at || item.assigned_at

    if (!inRange(item.assigned_at) && !inRange(activity)) continue

    const course = entry(item.course_id)

    course.assigned.add(item.personnel_id)
    if (item.status === 'in_progress') course.inProgress.add(item.personnel_id)
    if (activity > course.latest) course.latest = activity
  }

  for (const item of completions) {
    if (!inRange(item.completed_at)) continue

    const course = entry(item.course_id)

    course.completed.add(item.personnel_id)
    if (item.completed_at > course.latest) course.latest = item.completed_at
  }

  return [...courses.values()]
    .map(course => ({ courseId: course.courseId, assigned: course.assigned.size, completed: course.completed.size, inProgress: course.inProgress.size, latest: course.latest || null }))
    .sort((a, b) => String(b.latest || '').localeCompare(String(a.latest || '')))
}

// ---------------------------------------------------------------------------
// Notice timing
// ---------------------------------------------------------------------------

export type NoticeSettings = { due_reminder_days: number; overdue_notices: boolean; expiring_notice_days: number }

/** Which reminder an open assignment gets today, if any: overdue beats due soon. */
export const assignmentReminder = (assignment: Pick<ReportAssignment, 'status' | 'due_date'>, settings: NoticeSettings, todayIso: string): 'overdue' | 'due_soon' | null => {
  if (!OPEN.includes(assignment.status) || !assignment.due_date) return null

  const days = daysBetweenIso(todayIso, assignment.due_date)

  if (days < 0) return settings.overdue_notices ? 'overdue' : null
  if (settings.due_reminder_days > 0 && days <= settings.due_reminder_days) return 'due_soon'

  return null
}

/** Whether a completion's certification is inside the expiring-notice window (and not yet expired). */
export const expiringNoticeDue = (expiresAt: string | null, settings: NoticeSettings, todayIso: string) => {
  if (!expiresAt || settings.expiring_notice_days <= 0) return false

  const days = daysBetweenIso(todayIso, expiresAt)

  return days >= 0 && days <= settings.expiring_notice_days
}

export const NOTICE_TEXT = {
  assigned: (course: string) => ({ title: 'New training assigned to you', body: `"${course}" was assigned to you. Open My Training to start.` }),
  due_soon: (course: string, due: string) => ({ title: 'Training due soon', body: `"${course}" is due ${due}. Open My Training to finish it.` }),
  overdue: (course: string, due: string) => ({ title: 'Training overdue', body: `"${course}" was due ${due}. Open My Training to finish it.` }),
  expiring: (course: string, expires: string) => ({ title: 'Training certification expiring', body: `Your "${course}" certification expires ${expires}. Your supervisor will assign a refresher.` })
}
