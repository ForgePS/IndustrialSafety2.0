/**
 * Workers' compensation rules. Pure functions with no imports so they can be unit tested directly with
 * `node --experimental-strip-types`.
 *
 * Ported from Forge Industrial Safety 1.0 (workers-comp-helpers.ts, wc-restrictions-accommodations.ts,
 * industrial-web lib/workers-comp-module.ts). Dates are YYYY-MM-DD strings and are compared as calendar
 * dates (UTC math on date-only values), so results do not shift with the server time zone.
 */

export const WC_STAGES = ['intake', 'investigation', 'medical_review', 'treatment', 'return_to_work', 'claim_admin', 'closed'] as const
export type WcStage = (typeof WC_STAGES)[number]

export const WC_STAGE_LABELS: Record<WcStage, string> = {
  intake: 'Intake',
  investigation: 'Investigation',
  medical_review: 'Medical review',
  treatment: 'Treatment',
  return_to_work: 'Return to work',
  claim_admin: 'Claim administration',
  closed: 'Closed'
}

export const WC_SEVERITIES = ['minor', 'moderate', 'restricted', 'lost_time', 'fatality'] as const
export type WcSeverity = (typeof WC_SEVERITIES)[number]

export const WC_SEVERITY_LABELS: Record<WcSeverity, string> = {
  minor: 'Minor (first aid only, not recordable)',
  moderate: 'Moderate (medical treatment beyond first aid)',
  restricted: 'Restricted (job transfer or restriction)',
  lost_time: 'Lost time (days away from work)',
  fatality: 'Fatality'
}

export const WC_WORK_STATUSES = ['full_duty', 'restricted', 'off_work'] as const
export type WcWorkStatus = (typeof WC_WORK_STATUSES)[number]

export const WC_WORK_STATUS_LABELS: Record<WcWorkStatus, string> = {
  full_duty: 'Full duty',
  restricted: 'Restricted / transitional duty',
  off_work: 'Off work (lost time)'
}

export const WC_STAND_WALK_OPTIONS = ['none', '1-4', '4-6', '6-8', '8-12', '12-16'] as const
export const WC_SIT_OPTIONS = ['unlimited', '1-3', '3-5', '5-8'] as const
export const WC_LIFTING_OPTIONS = ['sedentary', 'minimal-light', 'light', 'light-medium', 'medium', 'light-heavy', 'heavy'] as const

export const WC_UPPER_EXTREMITY_LABELS: Record<string, string> = {
  'no-repetitive-gripping': 'No repetitive gripping',
  'no-vibratory': 'No vibratory tools',
  'no-lift-above-shoulder': 'No lifting above shoulder',
  'no-lift-floor-shoulder': 'No lifting floor to shoulder',
  'no-lift-floor-waist': 'No lifting floor to waist',
  'limit-push-pull': 'Limit pushing / pulling',
  'no-use-affected-arm-hand': 'No use of affected arm or hand'
}

export const WC_LOWER_EXTREMITY_LABELS: Record<string, string> = {
  'no-squatting-kneeling': 'No squatting or kneeling',
  'no-stairs': 'No stairs',
  'no-ladders': 'No ladders',
  'no-foot-pedal': 'No foot pedals',
  'no-stooping-bending': 'No stooping or bending'
}

const DAY_MS = 86_400_000

const toUtc = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)

  if (!match) throw new Error(`Invalid date: ${iso}`)

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDaysIso = (iso: string, days: number) => fromUtc(toUtc(iso) + days * DAY_MS)

export const daysBetweenIso = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

/**
 * Thursday of the week containing the date. Sunday-Wednesday point to the coming Thursday;
 * Thursday-Saturday use that week's Thursday (same as 1.0 thursdayWeekOf).
 */
export const thursdayWeekOf = (iso: string) => {
  const day = new Date(toUtc(iso)).getUTCDay()

  return addDaysIso(iso, 4 - day)
}

export type WcWeeklyStatus = 'complete' | 'due' | 'overdue'

/** complete = note saved; overdue = no note on or after that Thursday; due = Thursday still ahead. */
export const weeklyUpdateStatus = (weekOf: string, hasUpdate: boolean, todayIso: string): WcWeeklyStatus => {
  if (hasUpdate) return 'complete'

  return todayIso >= weekOf ? 'overdue' : 'due'
}

export type WcWorkPeriod = { work_status: string; start_date: string; end_date: string | null }

/**
 * Days away and restricted days from work-status periods, using OSHA's counting rules
 * (29 CFR 1904.7(b)(3)): calendar days, not counting the day of injury, through today for an open period.
 * Values are not capped here; the 180-day cap applies when they go onto the OSHA log.
 */
export const calculateWorkDays = (periods: WcWorkPeriod[], injuryDate: string, todayIso: string) => {
  const firstCountable = addDaysIso(injuryDate, 1)
  let daysAway = 0
  let restrictedDays = 0

  for (const period of periods) {
    if (period.work_status !== 'off_work' && period.work_status !== 'restricted') continue

    const start = period.start_date > firstCountable ? period.start_date : firstCountable
    const rawEnd = period.end_date && period.end_date < todayIso ? period.end_date : todayIso
    const days = rawEnd >= start ? daysBetweenIso(start, rawEnd) + 1 : 0

    if (period.work_status === 'off_work') daysAway += days
    else restrictedDays += days
  }

  return { daysAway, restrictedDays }
}

/** Current work status: the period covering today, else the most recent one. */
export const currentWorkStatus = (periods: WcWorkPeriod[], todayIso: string): string | null => {
  const covering = periods.find(period => period.start_date <= todayIso && (!period.end_date || period.end_date >= todayIso))

  if (covering) return covering.work_status

  const latest = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]

  return latest ? latest.work_status : null
}

export const OSHA_DAY_CAP = 180

/** 1904.7(b)(3)(vii): stop counting at 180 days in total; days away are counted first. */
export const capOshaDays = (daysAway: number, restrictedDays: number) => {
  const away = Math.min(Math.max(daysAway, 0), OSHA_DAY_CAP)

  return { daysAway: away, restrictedDays: Math.min(Math.max(restrictedDays, 0), OSHA_DAY_CAP - away) }
}

export type OshaOutcome = 'death' | 'days_away' | 'job_transfer_restriction' | 'other_recordable'

/** Form 300 columns G-J from a workers' comp case (1.0 deriveOshaOutcomeFromWorkersComp). */
export const deriveOshaOutcome = (input: {
  override?: string | null
  severity?: string | null
  daysAway: number
  restrictedDays: number
}): OshaOutcome => {
  if (
    input.override === 'death' ||
    input.override === 'days_away' ||
    input.override === 'job_transfer_restriction' ||
    input.override === 'other_recordable'
  ) {
    return input.override
  }

  if (input.severity === 'fatality') return 'death'
  if (input.daysAway > 0) return 'days_away'
  if (input.restrictedDays > 0) return 'job_transfer_restriction'
  if (input.severity === 'lost_time') return 'days_away'
  if (input.severity === 'restricted') return 'job_transfer_restriction'

  return 'other_recordable'
}

export type WcNextActionPriority = 'high' | 'medium' | 'low'

export type WcNextActionCase = {
  id: string
  case_number: string
  employee_name: string
  status: string
  stage: string
  severity: string | null
  claim_number: string | null
  is_self_pay: boolean
  carrier_name: string | null
  reported_date: string | null
  created_at: string
  next_action_label: string | null
  next_action_due: string | null
  next_action_priority: string | null
  days_away: number
  current_work_status: string | null
}

export type WcNextAction = {
  id: string
  caseId: string
  caseNumber: string
  employee: string
  title: string
  priority: WcNextActionPriority
  dueDate: string
  overdue: boolean
  daysOverdue: number
  reason: string
}

/**
 * Follow-ups owed on open cases. Same rules and due dates as 1.0 buildWorkersCompNextActions,
 * measured from the date the injury was reported to the employer.
 */
export const buildWcNextActions = (cases: WcNextActionCase[], todayIso: string): WcNextAction[] => {
  const actions: WcNextAction[] = []
  const treatmentIndex = WC_STAGES.indexOf('treatment')

  for (const item of cases) {
    if (item.status !== 'active') continue

    const baseDate = item.reported_date || item.created_at.slice(0, 10)
    const stageIndex = WC_STAGES.indexOf(item.stage as WcStage)
    const inTreatmentOrLater = stageIndex >= treatmentIndex

    const push = (key: string, title: string, priority: WcNextActionPriority, dueDate: string, reason: string) => {
      const overdue = dueDate < todayIso

      actions.push({
        id: `${item.id}:${key}`,
        caseId: item.id,
        caseNumber: item.case_number,
        employee: item.employee_name,
        title,
        priority,
        dueDate,
        overdue,
        daysOverdue: overdue ? daysBetweenIso(dueDate, todayIso) : 0,
        reason
      })
    }

    if (!inTreatmentOrLater && (item.next_action_label || item.next_action_due)) {
      const priority = item.next_action_priority === 'high' || item.next_action_priority === 'low' ? item.next_action_priority : 'medium'

      push(
        'manual',
        item.next_action_label || 'Follow-up required',
        priority,
        item.next_action_due || addDaysIso(baseDate, 7),
        item.next_action_due ? 'Follow-up date set on the case.' : 'Follow-up has no date, so it is due 7 days after the report date.'
      )
      continue
    }

    if (!item.claim_number && !item.is_self_pay) {
      push('claim-number', 'Claim number missing', 'high', addDaysIso(baseDate, 3), 'Add the carrier claim number. Due 3 days after the report date.')
    }

    if (item.stage === 'intake') {
      push(
        'classification',
        'Claim classification review',
        item.severity === 'lost_time' || item.severity === 'fatality' ? 'high' : 'medium',
        addDaysIso(baseDate, 5),
        'Case is still in intake. Move it to the next stage. Due 5 days after the report date.'
      )
    }

    if (!inTreatmentOrLater && (item.current_work_status === 'restricted' || item.severity === 'restricted')) {
      push('rtw', 'Return-to-work follow-up', 'medium', addDaysIso(baseDate, 14), 'Worker is on restricted duty. Due 14 days after the report date.')
    }

    if (!inTreatmentOrLater && (item.current_work_status === 'off_work' || item.severity === 'lost_time' || item.days_away > 0)) {
      push(
        'lost-time',
        'Lost-time medical review',
        'high',
        addDaysIso(baseDate, 7),
        `Lost time recorded${item.days_away ? ` (${item.days_away} day${item.days_away === 1 ? '' : 's'} away)` : ''}. Due 7 days after the report date.`
      )
    }

    if (item.stage === 'medical_review' || item.stage === 'investigation') {
      push(
        'medical-review',
        item.carrier_name && !item.is_self_pay ? `Pending medical review from ${item.carrier_name}` : 'Pending medical review',
        'medium',
        addDaysIso(baseDate, 10),
        'Move the case to treatment or a later stage. Due 10 days after the report date.'
      )
    }
  }

  const rank = (action: WcNextAction) => (action.overdue ? 0 : 10) + (action.priority === 'high' ? 0 : action.priority === 'medium' ? 1 : 2)

  return actions.sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate))
}

/** Medical and work-status notes: the author may edit; others need workers_comp.configure (1.0 admin). */
export const canEditAuthoredNote = (input: { userId: string; createdBy: string | null; canConfigure: boolean }) =>
  input.canConfigure || (Boolean(input.createdBy) && input.createdBy === input.userId)
