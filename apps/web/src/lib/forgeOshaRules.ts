/**
 * OSHA recordkeeping rules (29 CFR 1904). Pure functions with no imports so they can be unit tested
 * directly with `node --experimental-strip-types`.
 *
 * Ported from Forge Industrial Safety 1.0 osha-helpers.ts and performance-report-helpers.ts, with these
 * 2.0 changes:
 *   - privacy cases are a flag on a recordable case instead of a separate recordability status;
 *   - the Form 300 log masks privacy-case names (1904.29(b)(6)), which 1.0 did not do;
 *   - days away + restricted days are capped at 180 (1904.7(b)(3)(vii)).
 */

export const OSHA_RATE_BASE_HOURS = 200_000
export const OSHA_DAY_CAP = 180
export const OSHA_PRIVACY_CASE_NAME = 'Privacy Case'

export const OSHA_RECORDABILITY = ['pending', 'recordable', 'not_recordable'] as const
export type OshaRecordability = (typeof OSHA_RECORDABILITY)[number]

export const OSHA_RECORDABILITY_LABELS: Record<OshaRecordability, string> = {
  pending: 'Pending review',
  recordable: 'Recordable',
  not_recordable: 'Not recordable'
}

/** Form 300 columns G-J. Select only the single most serious outcome. */
export const OSHA_CASE_OUTCOMES = ['death', 'days_away', 'job_transfer_restriction', 'other_recordable'] as const
export type OshaCaseOutcome = (typeof OSHA_CASE_OUTCOMES)[number]

export const OSHA_CASE_OUTCOME_LABELS: Record<OshaCaseOutcome, string> = {
  death: 'Death (G)',
  days_away: 'Days away from work (H)',
  job_transfer_restriction: 'Job transfer or restriction (I)',
  other_recordable: 'Other recordable case (J)'
}

/** Form 300 column M. */
export const OSHA_CASE_TYPES = [
  'injury',
  'skin_disorder',
  'respiratory_condition',
  'poisoning',
  'hearing_loss',
  'other_illness'
] as const
export type OshaCaseType = (typeof OSHA_CASE_TYPES)[number]

export const OSHA_CASE_TYPE_LABELS: Record<OshaCaseType, string> = {
  injury: '(1) Injury',
  skin_disorder: '(2) Skin disorder',
  respiratory_condition: '(3) Respiratory condition',
  poisoning: '(4) Poisoning',
  hearing_loss: '(5) Hearing loss',
  other_illness: '(6) All other illnesses'
}

export type OshaClassificationInput = {
  recordability: string
  is_privacy_case: boolean
  case_outcome: string | null
  case_type: string | null
  days_away: number
  restricted_days: number
  date_of_death: string | null
  not_recordable_reason: string | null
}

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

/** Returns a readable error, or null when the classification is consistent. */
export const validateOshaClassification = (input: OshaClassificationInput): string | null => {
  if (!isOneOf(OSHA_RECORDABILITY, input.recordability)) return 'Choose a recordability status.'

  if (!Number.isInteger(input.days_away) || input.days_away < 0) return 'Days away must be a whole number of 0 or more.'

  if (!Number.isInteger(input.restricted_days) || input.restricted_days < 0) {
    return 'Days of job transfer or restriction must be a whole number of 0 or more.'
  }

  if (input.days_away + input.restricted_days > OSHA_DAY_CAP) {
    return `Days away and restricted days together are capped at ${OSHA_DAY_CAP} (29 CFR 1904.7).`
  }

  if (input.case_outcome !== null && !isOneOf(OSHA_CASE_OUTCOMES, input.case_outcome)) return 'Choose a valid case outcome.'
  if (input.case_type !== null && !isOneOf(OSHA_CASE_TYPES, input.case_type)) return 'Choose a valid case type.'

  if (input.recordability !== 'recordable') {
    if (input.is_privacy_case) return 'Only recordable cases can be privacy cases.'
    if (input.case_outcome) return 'Clear the case outcome, or mark the case recordable.'

    if (input.recordability === 'not_recordable' && !input.not_recordable_reason?.trim()) {
      return 'Explain why this case is not recordable.'
    }

    
return null
  }

  if (!input.case_outcome) return 'Recordable cases need one case outcome (Form 300 columns G-J).'
  if (!input.case_type) return 'Recordable cases need an injury or illness type (Form 300 column M).'

  if (input.case_outcome === 'days_away' && input.days_away < 1) {
    return 'A days-away case needs at least one day away from work.'
  }

  if (input.case_outcome === 'job_transfer_restriction' && input.restricted_days < 1) {
    return 'A job transfer or restriction case needs at least one restricted day.'
  }

  if (input.date_of_death && input.case_outcome !== 'death') return 'Date of death applies only to death cases.'

  return null
}

/** Rate per 200,000 hours, rounded to two decimals. Null when hours are missing or zero. */
export const oshaRate = (cases: number, hoursWorked: number | null | undefined): number | null => {
  if (!hoursWorked || hoursWorked <= 0) return null
  
return Math.round(((cases * OSHA_RATE_BASE_HOURS) / hoursWorked) * 100) / 100
}

export type OshaRateInput = {
  recordableCases: number
  daysAwayCases: number
  transferCases: number
  hoursWorked: number | null
}

/** TRIR counts every recordable case. DART counts days-away plus job transfer/restriction cases. */
export const oshaRates = (input: OshaRateInput) => ({
  trir: oshaRate(input.recordableCases, input.hoursWorked),
  dart: oshaRate(input.daysAwayCases + input.transferCases, input.hoursWorked)
})

/** Name shown on the Form 300 log: privacy cases never show the employee's name. */
export const form300EmployeeName = (row: { employee_name: string; is_privacy_case: boolean }) =>
  row.is_privacy_case ? OSHA_PRIVACY_CASE_NAME : row.employee_name

/**
 * Splits an instant into the calendar date and clock time at a given time zone, so an incident that
 * happened at 11 PM local time is not logged on the next UTC day.
 */
export const zonedDateTimeParts = (iso: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso))

  const get = (type: string) => parts.find(part => part.type === type)?.value || ''

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  }
}

/** Fill blanks only: never overwrite values a recordkeeper already entered on the case. */
export const fillBlanks = <T extends Record<string, unknown>>(existing: T, seed: Partial<T>): Partial<T> => {
  const changes: Partial<T> = {}

  for (const [key, value] of Object.entries(seed) as Array<[keyof T, T[keyof T]]>) {
    const current = existing[key]
    const empty = current === null || current === undefined || (typeof current === 'string' && current.trim() === '')

    if (empty && value !== null && value !== undefined && value !== '') changes[key] = value
  }

  return changes
}

/** The Form 300 fields the print checks read. Matches forge_osha_cases columns. */
export type OshaPrintCheckCase = {
  id: string
  case_number: string | null
  location_id?: string | null
  employee_name: string | null
  job_title: string | null
  injury_date: string | null
  event_location: string | null
  injury_description: string | null
  recordability: string
  is_privacy_case: boolean
  case_outcome: string | null
  case_type: string | null
  days_away: number | null
  restricted_days: number | null
  date_of_death: string | null
  status?: string | null
}

export type OshaPrintIssue = { caseId: string; label: string; issues: string[] }

const blank = (value: string | null | undefined) => !value || !value.trim()

/**
 * What is missing or inconsistent on one Form 300 case. A case with problems here prints wrong or is left
 * out of the Form 300A totals. Ported from 1.0's oshaCaseIssues (lib/osha-module.ts); 2.0 also flags the
 * blank job title (C) and "where the event occurred" (E) columns, which 1.0 did not check.
 */
export const oshaCasePrintIssues = (row: OshaPrintCheckCase): string[] => {
  const issues: string[] = []

  if (blank(row.case_number)) issues.push('No case number (column A).')
  if (!row.is_privacy_case && blank(row.employee_name)) issues.push('No employee name (column B).')
  if (blank(row.job_title)) issues.push('No job title (column C).')
  if (blank(row.injury_date)) issues.push('No date of injury or onset of illness (column D).')
  if (blank(row.event_location)) issues.push('No location where the event occurred (column E).')
  if (blank(row.injury_description)) issues.push('No description of the injury or illness (column F).')

  if (!row.case_outcome) issues.push('No outcome checked (columns G-J), so it is missing from the 300A case counts.')
  if (!row.case_type) issues.push('No injury or illness type (column M), so it is missing from the 300A type totals.')

  const away = row.days_away ?? 0
  const restricted = row.restricted_days ?? 0

  if (away < 0 || restricted < 0) issues.push('Day counts cannot be negative.')

  if (row.case_outcome === 'days_away' && away <= 0) issues.push('Outcome is days away from work but column K has no days.')

  if (row.case_outcome === 'job_transfer_restriction' && restricted <= 0) {
    issues.push('Outcome is job transfer or restriction but column L has no days.')
  }

  if (row.case_outcome === 'job_transfer_restriction' && away > 0) {
    issues.push('Case has days away, so the most serious outcome is days away (H), not I.')
  }

  if (row.case_outcome === 'other_recordable' && (away > 0 || restricted > 0)) {
    issues.push('Case has days counted, so the outcome should be H or I, not other recordable.')
  }

  if (row.case_outcome === 'death' && blank(row.date_of_death)) {
    issues.push('Outcome is death but no date of death is entered (Form 301 field 18).')
  }

  if (row.date_of_death && row.case_outcome !== 'death') issues.push('A date of death is entered but the outcome is not death (G).')

  if (away + restricted > OSHA_DAY_CAP) issues.push(`Days are capped at ${OSHA_DAY_CAP} combined on the forms.`)

  return issues
}

/**
 * Everything to fix before printing or exporting the Form 300 log: every recordable, non-voided case with
 * problems, plus case numbers used twice on the same establishment's log. Ported from 1.0's
 * form300PrintIssues. 1.0's "unplaced" cases (no injury date or no establishment) cannot exist in 2.0: the
 * database requires both, so they are covered by the per-case checks only.
 */
export const form300PrintIssues = (cases: OshaPrintCheckCase[]): OshaPrintIssue[] => {
  const logCases = cases.filter(row => row.recordability === 'recordable' && row.status !== 'voided')
  const numberKey = (row: OshaPrintCheckCase) => (blank(row.case_number) ? '' : `${row.location_id || ''}|${row.case_number!.trim().toLowerCase()}`)
  const seen = new Map<string, number>()

  for (const row of logCases) {
    const key = numberKey(row)

    if (key) seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  const out: OshaPrintIssue[] = []

  for (const row of logCases) {
    const issues = oshaCasePrintIssues(row)
    const key = numberKey(row)

    if (key && (seen.get(key) ?? 0) > 1) issues.unshift(`Case number ${row.case_number!.trim()} is used more than once on this log.`)

    if (issues.length) {
      const name = row.is_privacy_case ? OSHA_PRIVACY_CASE_NAME : row.employee_name?.trim() || 'No name'

      out.push({ caseId: row.id, label: `${blank(row.case_number) ? 'Unnumbered case' : `Case ${row.case_number!.trim()}`} - ${name}`, issues })
    }
  }

  return out
}
