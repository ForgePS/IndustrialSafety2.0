/**
 * Training LMS rules. Pure functions with no imports so they can be unit tested directly with
 * `node --experimental-strip-types`.
 */

export const TRAINING_OPEN_STATUSES = ['assigned', 'in_progress', 'overdue'] as const
export const TRAINING_EXPIRING_DAYS = 30
export const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export const isOpenAssignment = (status: string) => (TRAINING_OPEN_STATUSES as readonly string[]).includes(status)

const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS)

export type MatrixStatus = 'current' | 'expiring' | 'expired' | 'assigned' | 'overdue' | 'missing' | 'not_required'

export const MATRIX_STATUS_LABELS: Record<MatrixStatus, string> = {
  current: 'Current',
  expiring: 'Expiring',
  expired: 'Expired',
  assigned: 'Assigned',
  overdue: 'Overdue',
  missing: 'Missing',
  not_required: '—'
}

export type MatrixCompletion = { completed_at: string; expires_at: string | null; approval_status: string; result: string }
export type MatrixAssignment = { status: string; due_date: string | null }

/**
 * Status of one person for one course. 2.0 adds expiry (from completions and course validity) and
 * "required" (from training groups) to 1.0's assignment-only matrix.
 *
 * Valid completions are approved and passed/completed. The newest valid completion decides currency;
 * an open assignment shows when nothing current exists.
 */
export const matrixStatus = ({
  completions,
  assignments,
  required,
  todayIso
}: {
  completions: MatrixCompletion[]
  assignments: MatrixAssignment[]
  required: boolean
  todayIso: string
}): { status: MatrixStatus; expiresAt: string | null; completedAt: string | null; dueDate: string | null } => {
  const valid = completions
    .filter(item => item.approval_status === 'approved' && (item.result === 'passed' || item.result === 'completed'))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))

  const latest = valid[0] || null
  const open = assignments.filter(item => isOpenAssignment(item.status)).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))[0] || null
  const dueDate = open?.due_date || null
  const openStatus: MatrixStatus | null = open ? (open.due_date && open.due_date < todayIso ? 'overdue' : 'assigned') : null

  if (latest) {
    const completedAt = latest.completed_at.slice(0, 10)
    const expiresAt = latest.expires_at

    if (!expiresAt || expiresAt >= todayIso) {
      const status: MatrixStatus = expiresAt && daysBetween(todayIso, expiresAt) <= TRAINING_EXPIRING_DAYS ? 'expiring' : 'current'

      return { status, expiresAt, completedAt, dueDate }
    }

    return { status: openStatus || 'expired', expiresAt, completedAt, dueDate }
  }

  if (openStatus) return { status: openStatus, expiresAt: null, completedAt: null, dueDate }

  return { status: required ? 'missing' : 'not_required', expiresAt: null, completedAt: null, dueDate: null }
}

/** Whether every required section of the version is done. */
export const contentComplete = (sections: Array<{ id: string; is_required: boolean }>, completedIds: string[]) =>
  sections.filter(section => section.is_required).every(section => completedIds.includes(section.id))

export type PaperResultRow = { line: number; employeeNumber: string; percent: number; date: string | null }

/**
 * Parses pasted paper quiz results, one per line: `employee number, percent[, YYYY-MM-DD]`.
 * Commas, tabs or semicolons separate fields (so a spreadsheet column paste works). A trailing % is allowed.
 */
export const parsePaperResults = (raw: string): { rows: PaperResultRow[]; errors: string[] } => {
  const rows: PaperResultRow[] = []
  const errors: string[] = []

  raw.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1
    const trimmed = text.trim()

    if (!trimmed) return

    const [employeeNumber = '', rawPercent = '', rawDate = ''] = trimmed.split(/\s*[,;\t]\s*/)
    const percent = Number(rawPercent.replace(/%$/, ''))

    if (!employeeNumber.trim()) errors.push(`Line ${line}: missing employee number.`)
    else if (!Number.isInteger(percent) || percent < 0 || percent > 100) errors.push(`Line ${line}: percent must be a whole number from 0 to 100.`)
    else if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) errors.push(`Line ${line}: date must be YYYY-MM-DD.`)
    else rows.push({ line, employeeNumber: employeeNumber.trim(), percent, date: rawDate.trim() || null })
  })

  return { rows, errors }
}
