/**
 * Batch 1 training management rules: editing and canceling assignments, editing training records, and the
 * assignment list filters on the Training overview. Pure functions with no imports so they can be unit tested
 * directly with `node --experimental-strip-types`.
 */

export const ASSIGNMENT_CANCELED = 'canceled' as const
export const ASSIGNMENT_NOTES_MAX = 2000
export const REASON_MAX = 500
export const RECORD_NOTES_MAX = 4000
export const INSTRUCTOR_MAX = 200

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isIsoDate = (value: string) => ISO_DATE.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Whether an assignment can still be edited or canceled (1.0 let trainers manage any assignment not yet done). */
export const assignmentManageable = (status: string) => status !== 'completed' && status !== ASSIGNMENT_CANCELED

export type AssignmentEdit = { due_date: string | null; notes: string | null }

/** Validates the assignment edit form: an optional due date (YYYY-MM-DD) and notes. */
export const parseAssignmentEdit = (input: { dueDate?: unknown; notes?: unknown }): { value: AssignmentEdit } | { error: string } => {
  const dueDate = text(input.dueDate)
  const notes = text(input.notes)

  if (dueDate && !isIsoDate(dueDate)) return { error: 'Due date must be a valid date.' }
  if (notes.length > ASSIGNMENT_NOTES_MAX) return { error: `Notes must be ${ASSIGNMENT_NOTES_MAX} characters or fewer.` }

  return { value: { due_date: dueDate || null, notes: notes || null } }
}

/** A cancel or archive reason. Required for archiving a record; optional when canceling an assignment. */
export const parseReason = (value: unknown, required: boolean): { value: string | null } | { error: string } => {
  const reason = text(value)

  if (required && !reason) return { error: 'Give a reason.' }
  if (reason.length > REASON_MAX) return { error: `The reason must be ${REASON_MAX} characters or fewer.` }

  return { value: reason || null }
}

export type RecordBefore = { completed_at: string; score: number | string | null; source: string; archived_at: string | null }

export type RecordEdit = {
  score: number | null
  instructor: string | null
  completed_at: string
  expires_at: string | null
  notes: string | null
}

/**
 * Validates a training record edit. Keeps the original completion time when the date is unchanged. A graded
 * record (online, kiosk, paper) keeps the score and date its quiz produced; only manual records change them.
 * The expiry may be cleared (no expiry) but cannot fall before the completion date.
 */
export const parseRecordEdit = (
  before: RecordBefore,
  input: { score?: unknown; instructor?: unknown; completedDate?: unknown; expiresAt?: unknown; notes?: unknown },
  todayIso: string
): { value: RecordEdit } | { error: string } => {
  if (before.archived_at) return { error: 'This training record is archived and cannot be changed.' }

  const rawScore = text(input.score === null || input.score === undefined ? '' : String(input.score))
  const instructor = text(input.instructor)
  const completedDate = text(input.completedDate)
  const expiresAt = text(input.expiresAt)
  const notes = text(input.notes)

  let score: number | null = null

  if (rawScore) {
    score = Number(rawScore)
    if (!Number.isFinite(score) || score < 0 || score > 100) return { error: 'Score must be a number from 0 to 100.' }
    score = Math.round(score * 100) / 100
  }

  if (!completedDate || !isIsoDate(completedDate)) return { error: 'Completed date must be a valid date.' }
  if (completedDate > todayIso) return { error: 'Completed date cannot be in the future.' }
  if (expiresAt && !isIsoDate(expiresAt)) return { error: 'Expiry must be a valid date.' }
  if (expiresAt && expiresAt < completedDate) return { error: 'Expiry cannot be before the completed date.' }
  if (instructor.length > INSTRUCTOR_MAX) return { error: `Instructor must be ${INSTRUCTOR_MAX} characters or fewer.` }
  if (notes.length > RECORD_NOTES_MAX) return { error: `Notes must be ${RECORD_NOTES_MAX} characters or fewer.` }

  const beforeDate = String(before.completed_at).slice(0, 10)
  const beforeScore = before.score === null || before.score === undefined || before.score === '' ? null : Number(before.score)
  const completedAt = completedDate === beforeDate ? before.completed_at : completedDate + 'T12:00:00.000Z'

  if (before.source !== 'manual' && (score !== beforeScore || completedDate !== beforeDate)) {
    return { error: 'The score and date of a graded quiz cannot be edited.' }
  }

  return { value: { score, instructor: instructor || null, completed_at: completedAt, expires_at: expiresAt || null, notes: notes || null } }
}

// ---------------------------------------------------------------------------
// Assignment list filters (Training overview)
// ---------------------------------------------------------------------------

/** Dashboard tile / status filter keys. `open` is assigned, in progress or overdue; `overdue` is open and past due. */
export const ASSIGNMENT_STATUS_FILTERS = ['open', 'overdue', 'assigned', 'in_progress', 'completed', 'canceled', 'all'] as const
export type AssignmentStatusFilter = (typeof ASSIGNMENT_STATUS_FILTERS)[number]

export type AssignmentFilters = { status: AssignmentStatusFilter; courseId: string; groupId: string; q: string }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

/** Reads the overview's assignment filters from the URL (`?status=&course=&group=&q=`). The default is open work. */
export const assignmentFiltersFrom = (params: Record<string, string | string[] | undefined>): AssignmentFilters => {
  const status = first(params.status) as AssignmentStatusFilter
  const uuid = (value: string) => (/^[0-9a-f-]{36}$/i.test(value) ? value : '')

  return {
    status: ASSIGNMENT_STATUS_FILTERS.includes(status) ? status : 'open',
    courseId: uuid(first(params.course)),
    groupId: uuid(first(params.group)),
    q: first(params.q).trim().slice(0, 100)
  }
}

const OPEN = ['assigned', 'in_progress', 'overdue']

export type FilterableAssignment = {
  status: string
  due_date: string | null
  course_id: string
  personnel_id: string
  courseTitle: string
  personName: string
  employeeNumber: string | null
}

/** Whether an assignment is overdue: still open and past its due date (the stored status may lag). */
export const assignmentOverdue = (item: { status: string; due_date: string | null }, todayIso: string) =>
  OPEN.includes(item.status) && Boolean(item.due_date && item.due_date < todayIso)

export const matchesAssignmentStatus = (item: { status: string; due_date: string | null }, status: AssignmentStatusFilter, todayIso: string) => {
  if (status === 'all') return true
  if (status === 'open') return OPEN.includes(item.status)
  if (status === 'overdue') return assignmentOverdue(item, todayIso)
  if (status === 'assigned') return item.status === 'assigned' || (item.status === 'overdue' && !assignmentOverdue(item, todayIso))

  return item.status === status
}

/** Counts for the dashboard tiles. */
export const assignmentCounts = (items: Array<{ status: string; due_date: string | null }>, todayIso: string) => ({
  open: items.filter(item => matchesAssignmentStatus(item, 'open', todayIso)).length,
  overdue: items.filter(item => matchesAssignmentStatus(item, 'overdue', todayIso)).length,
  completed: items.filter(item => item.status === 'completed').length,
  canceled: items.filter(item => item.status === ASSIGNMENT_CANCELED).length
})

/** Applies the overview filters. `groupMembers` is the selected group's personnel ids (ignored without a group). */
export const filterAssignments = <T extends FilterableAssignment>(items: T[], filters: AssignmentFilters, todayIso: string, groupMembers?: Set<string>) => {
  const needle = filters.q.toLowerCase()

  return items.filter(
    item =>
      matchesAssignmentStatus(item, filters.status, todayIso) &&
      (!filters.courseId || item.course_id === filters.courseId) &&
      (!filters.groupId || Boolean(groupMembers?.has(item.personnel_id))) &&
      (!needle ||
        item.personName.toLowerCase().includes(needle) ||
        String(item.employeeNumber || '').toLowerCase().includes(needle) ||
        item.courseTitle.toLowerCase().includes(needle))
  )
}
