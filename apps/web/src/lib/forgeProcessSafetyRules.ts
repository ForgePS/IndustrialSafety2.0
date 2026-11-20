/**
 * Port slice 16: Process Safety rules (management of change, pre-startup safety review, process hazard
 * analyses and their actions). Pure and self-contained (no "@/" imports) so the unit tests can load it directly.
 */

export const CHANGE_TYPES = [
  { key: 'process', label: 'Process conditions or chemistry' },
  { key: 'equipment', label: 'Equipment (not replacement in kind)' },
  { key: 'chemical', label: 'Chemicals or materials' },
  { key: 'procedure', label: 'Operating or maintenance procedure' },
  { key: 'controls', label: 'Controls, alarms, interlocks or software' },
  { key: 'facility', label: 'Facility or layout' },
  { key: 'organizational', label: 'Organization or staffing' },
  { key: 'other', label: 'Other' }
] as const

export type ChangeType = (typeof CHANGE_TYPES)[number]['key']

export const MOC_STATUSES = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'implemented', label: 'Implemented' },
  { key: 'closed', label: 'Closed' },
  { key: 'canceled', label: 'Canceled' }
] as const

export type MocStatus = (typeof MOC_STATUSES)[number]['key']

export const RISK_LEVELS = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' }
] as const

/** What the change touches. Each one is a reminder of the follow-up work the change needs. */
export const IMPACT_AREAS = [
  { key: 'psi', label: 'Process safety information (P&IDs, data sheets, limits)' },
  { key: 'procedures', label: 'Operating or maintenance procedures' },
  { key: 'training', label: 'Training for operators or maintenance' },
  { key: 'mechanical_integrity', label: 'Mechanical integrity / inspection plans' },
  { key: 'hazard_review', label: 'Hazard review or PHA update' },
  { key: 'emergency', label: 'Emergency response' },
  { key: 'permits', label: 'Environmental or other permits' }
] as const

/** Pre-startup safety review checklist (OSHA 1910.119(i)). */
export const PSSR_ITEMS = [
  { key: 'built_per_design', label: 'Construction and equipment match the design specifications' },
  { key: 'procedures_ready', label: 'Safety, operating, maintenance and emergency procedures are in place and adequate' },
  { key: 'hazard_review_done', label: 'The hazard review or PHA is done and its pre-startup recommendations are resolved' },
  { key: 'training_done', label: 'Everyone involved in operating the process has been trained' },
  { key: 'psi_updated', label: 'Process safety information is updated' },
  { key: 'mi_ready', label: 'Mechanical integrity: inspections, tests and maintenance plans are set up' }
] as const

export type PssrAnswer = 'yes' | 'no' | 'na'
export type PssrAnswers = Record<string, { answer: PssrAnswer; note: string | null }>

export const PHA_METHODS = [
  { key: 'hazop', label: 'HAZOP' },
  { key: 'what_if', label: 'What-if' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'what_if_checklist', label: 'What-if / checklist' },
  { key: 'fmea', label: 'FMEA' },
  { key: 'fault_tree', label: 'Fault tree' },
  { key: 'lopa', label: 'LOPA' },
  { key: 'other', label: 'Other' }
] as const

export const PHA_STATUSES = [
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' }
] as const

/** OSHA 1910.119(e)(6): a PHA is revalidated at least every five years. */
export const REVALIDATION_YEARS = 5
export const REVALIDATION_WARN_DAYS = 180

export const ACTION_PHASES = [
  { key: 'before_startup', label: 'Before startup' },
  { key: 'after_startup', label: 'After startup' }
] as const

export type ActionPhase = (typeof ACTION_PHASES)[number]['key']

export const MAX_APPROVERS = 10

const labelOf = (list: readonly { key: string; label: string }[], key: string | null | undefined) => list.find(item => item.key === key)?.label || key || ''

export const changeTypeLabel = (key: string) => labelOf(CHANGE_TYPES, key)
export const mocStatusLabel = (key: string) => labelOf(MOC_STATUSES, key)
export const riskLabel = (key: string) => labelOf(RISK_LEVELS, key)
export const impactLabel = (key: string) => labelOf(IMPACT_AREAS, key)
export const phaMethodLabel = (key: string) => labelOf(PHA_METHODS, key)
export const phaStatusLabel = (key: string) => labelOf(PHA_STATUSES, key)
export const phaseLabel = (key: string | null) => labelOf(ACTION_PHASES, key)

const isOneOf = <T extends { key: string }>(list: readonly T[], value: unknown): value is T['key'] => list.some(item => item.key === value)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

export const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const addDays = (iso: string, days: number) => {
  const date = new Date(iso + 'T00:00:00Z')

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

/** Adds whole years; 29 February falls back to 28 February in a non-leap year. */
export const addYears = (iso: string, years: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const year = y + years
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()

  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

const line = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')

// ---------------------------------------------------------------------------
// Management of change
// ---------------------------------------------------------------------------

export type MocInput = {
  title: string
  changeType: ChangeType
  locationId: string
  assetId: string | null
  description: string
  reason: string
  technicalBasis: string | null
  riskLevel: 'low' | 'medium' | 'high'
  impacts: string[]
  isTemporary: boolean
  temporaryUntil: string | null
  requiresPssr: boolean
}

export const cleanMocInput = (raw: Record<string, unknown>, today: string): MocInput | { error: string } => {
  const title = line(raw.title)

  if (!title) return { error: 'Give the change a title.' }
  if (title.length > 200) return { error: 'Keep the title to 200 characters.' }
  if (!isOneOf(CHANGE_TYPES, raw.changeType)) return { error: 'Pick the type of change.' }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location.' }

  const assetId = raw.assetId ? String(raw.assetId) : null

  if (assetId && !isUuid(assetId)) return { error: 'Pick the equipment from the list.' }

  const description = text(raw.description)
  const reason = text(raw.reason)
  const technicalBasis = text(raw.technicalBasis)

  if (!description) return { error: 'Describe the change.' }
  if (!reason) return { error: 'Say why the change is needed.' }
  if (description.length > 10000 || reason.length > 5000 || technicalBasis.length > 10000) return { error: 'One of the text fields is too long.' }

  const riskLevel = isOneOf(RISK_LEVELS, raw.riskLevel) ? raw.riskLevel : null

  if (!riskLevel) return { error: 'Pick the risk level.' }

  const impactsRaw = Array.isArray(raw.impacts) ? raw.impacts.map(String) : []

  if (!impactsRaw.every(item => isOneOf(IMPACT_AREAS, item))) return { error: 'Pick impacts from the list.' }

  const impacts = IMPACT_AREAS.map(item => item.key).filter(key => impactsRaw.includes(key))
  const isTemporary = raw.isTemporary === true
  const temporaryUntil = isTemporary ? String(raw.temporaryUntil || '') : null

  if (isTemporary && !isDate(temporaryUntil)) return { error: 'A temporary change needs the date it will be reversed by.' }
  if (isTemporary && (temporaryUntil as string) < today) return { error: "The revert-by date can't be in the past." }

  // A pre-startup safety review is needed for anything that changes the physical process; organizational
  // changes may skip it.
  const requiresPssr = raw.changeType === 'organizational' ? raw.requiresPssr === true : true

  return { title, changeType: raw.changeType, locationId: raw.locationId, assetId, description, reason, technicalBasis: technicalBasis || null, riskLevel, impacts, isTemporary, temporaryUntil, requiresPssr }
}

export type ApproverInput = { userId: string; role: string | null }

/** At least one approver, at most MAX_APPROVERS, no duplicates, and never the person who owns or raised the change. */
export const cleanApprovers = (raw: unknown, excluded: string[]): ApproverInput[] | { error: string } => {
  const list = Array.isArray(raw) ? raw : []
  const out: ApproverInput[] = []

  for (const item of list) {
    const userId = String((item as any)?.userId || '')

    if (!isUuid(userId)) return { error: 'Pick each approver from the list.' }
    if (excluded.includes(userId)) return { error: "The person who owns or raised the change can't approve it." }
    if (out.some(entry => entry.userId === userId)) continue

    const role = line((item as any)?.role)

    if (role.length > 80) return { error: 'Keep each approver role to 80 characters.' }
    out.push({ userId, role: role || null })
  }

  if (!out.length) return { error: 'Add at least one approver.' }
  if (out.length > MAX_APPROVERS) return { error: `Add at most ${MAX_APPROVERS} approvers.` }

  return out
}

export type Decision = 'pending' | 'approved' | 'rejected'

/** In review until everyone has approved; one rejection rejects the change. */
export const approvalOutcome = (decisions: Decision[]): 'in_review' | 'approved' | 'rejected' => {
  if (!decisions.length) return 'in_review'
  if (decisions.includes('rejected')) return 'rejected'

  return decisions.every(decision => decision === 'approved') ? 'approved' : 'in_review'
}

export const cleanDecision = (raw: Record<string, unknown>): { decision: 'approved' | 'rejected'; comment: string | null } | { error: string } => {
  const decision = raw.decision === 'approved' || raw.decision === 'rejected' ? raw.decision : null
  const comment = text(raw.comment)

  if (!decision) return { error: 'Approve or reject.' }
  if (decision === 'rejected' && !comment) return { error: 'Say why you are rejecting it.' }
  if (comment.length > 2000) return { error: 'Keep the comment to 2,000 characters.' }

  return { decision, comment: comment || null }
}

/** Pre-startup safety review: every item answered, none answered "no", and "not applicable" explained. */
export const cleanPssr = (raw: unknown): PssrAnswers | { error: string } => {
  const answers = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const out: PssrAnswers = {}

  for (const item of PSSR_ITEMS) {
    const entry = answers[item.key] || {}
    const answer = entry.answer

    if (answer !== 'yes' && answer !== 'no' && answer !== 'na') return { error: `Answer: ${item.label}.` }

    const note = text(entry.note)

    if (note.length > 1000) return { error: 'Keep each note to 1,000 characters.' }
    if (answer === 'no') return { error: `Not ready for startup: ${item.label}. Resolve it first.` }
    if (answer === 'na' && !note) return { error: `Explain why this doesn't apply: ${item.label}.` }
    out[item.key] = { answer, note: note || null }
  }

  return out
}

// ---------------------------------------------------------------------------
// Actions (each one is a Corrective Action) and what blocks each step
// ---------------------------------------------------------------------------

/** A CAPA counts as done once the work is finished: waiting for verification, verified or closed. */
export const actionDone = (capaStatus: string | null) => capaStatus === 'pending_verification' || capaStatus === 'verified' || capaStatus === 'closed'

export type ActionInput = { title: string; description: string | null; ownerPersonnelId: string; dueOn: string; phase: ActionPhase | null }

export const cleanActionInput = (raw: Record<string, unknown>, kind: 'moc' | 'pha'): ActionInput | { error: string } => {
  const title = line(raw.title)
  const description = text(raw.description)

  if (!title) return { error: 'Say what needs to be done.' }
  if (title.length > 200) return { error: 'Keep the action to 200 characters.' }
  if (description.length > 5000) return { error: 'Keep the details to 5,000 characters.' }
  if (!isUuid(raw.ownerPersonnelId)) return { error: 'Pick who owns the action.' }
  if (!isDate(raw.dueOn)) return { error: 'Pick a due date.' }

  const phase = kind === 'moc' ? (isOneOf(ACTION_PHASES, raw.phase) ? raw.phase : null) : null

  if (kind === 'moc' && !phase) return { error: 'Say whether it must be done before startup.' }

  return { title, description: description || null, ownerPersonnelId: raw.ownerPersonnelId, dueOn: raw.dueOn, phase }
}

export type BlockingAction = { title: string; phase: string | null; capaStatus: string | null; capaNumber?: string | null }

const unfinished = (action: BlockingAction) => `${action.capaNumber ? action.capaNumber + ' ' : ''}${action.title} (${action.capaStatus === 'canceled' ? 'canceled' : 'not done'})`

/** What stands in the way of the next step, per step. Empty lists mean the step may proceed. */
export const mocBlockers = ({
  requiresPssr,
  pssrCompletedAt,
  actions
}: {
  requiresPssr: boolean
  pssrCompletedAt: string | null
  actions: BlockingAction[]
}) => {
  const beforeStartup = actions.filter(action => action.phase === 'before_startup' && !actionDone(action.capaStatus))
  const any = actions.filter(action => !actionDone(action.capaStatus))

  return {
    pssr: beforeStartup.map(action => 'Pre-startup action open: ' + unfinished(action)),
    implement: [...(requiresPssr && !pssrCompletedAt ? ['The pre-startup safety review is not done'] : []), ...beforeStartup.map(action => 'Pre-startup action open: ' + unfinished(action))],
    close: any.map(action => 'Action open: ' + unfinished(action))
  }
}

/** Which workflow steps a status allows (before any blockers). */
export const MOC_STEPS: Record<string, MocStatus[]> = {
  edit: ['draft', 'rejected'],
  submit: ['draft', 'rejected'],
  decide: ['in_review'],
  pssr: ['approved'],
  implement: ['approved'],
  close: ['implemented'],
  cancel: ['draft', 'in_review', 'approved', 'rejected']
}

export const stepAllowed = (step: keyof typeof MOC_STEPS, status: string) => (MOC_STEPS[step] as string[]).includes(status)

/** A temporary change past its revert-by date that hasn't been closed. */
export const temporaryOverdue = (moc: { is_temporary: boolean; temporary_until: string | null; status: string }, today: string) =>
  moc.is_temporary && Boolean(moc.temporary_until) && (moc.temporary_until as string) < today && moc.status !== 'closed' && moc.status !== 'canceled'

// ---------------------------------------------------------------------------
// Process hazard analyses
// ---------------------------------------------------------------------------

export type PhaInput = {
  title: string
  processUnit: string
  locationId: string
  method: string
  status: string
  leaderName: string | null
  team: string | null
  startedOn: string | null
  completedOn: string | null
  revalidateBy: string | null
  summary: string | null
  mocId: string | null
}

export const cleanPhaInput = (raw: Record<string, unknown>, today: string): PhaInput | { error: string } => {
  const title = line(raw.title)
  const processUnit = line(raw.processUnit)

  if (!title) return { error: 'Give the study a title.' }
  if (title.length > 200) return { error: 'Keep the title to 200 characters.' }
  if (!processUnit) return { error: 'Name the process or unit studied.' }
  if (processUnit.length > 200) return { error: 'Keep the process name to 200 characters.' }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location.' }
  if (!isOneOf(PHA_METHODS, raw.method)) return { error: 'Pick the method.' }
  if (!isOneOf(PHA_STATUSES, raw.status)) return { error: 'Pick the status.' }

  const leaderName = line(raw.leaderName)
  const team = text(raw.team)
  const summary = text(raw.summary)

  if (leaderName.length > 120 || team.length > 2000 || summary.length > 10000) return { error: 'One of the text fields is too long.' }

  const startedOn = raw.startedOn ? String(raw.startedOn) : null
  const completedOn = raw.completedOn ? String(raw.completedOn) : null
  let revalidateBy = raw.revalidateBy ? String(raw.revalidateBy) : null

  for (const [value, label] of [
    [startedOn, 'start'],
    [completedOn, 'completion'],
    [revalidateBy, 'revalidation']
  ] as const) {
    if (value && !isDate(value)) return { error: `Enter a valid ${label} date.` }
  }

  if (raw.status === 'completed' && !completedOn) return { error: 'A completed study needs its completion date.' }
  if (raw.status !== 'completed' && completedOn) return { error: 'Only a completed study has a completion date.' }
  if (completedOn && completedOn > today) return { error: "The completion date can't be in the future." }
  if (startedOn && completedOn && completedOn < startedOn) return { error: 'The study finished before it started.' }

  if (completedOn) {
    const latest = addYears(completedOn, REVALIDATION_YEARS)

    if (!revalidateBy) revalidateBy = latest
    if (revalidateBy > latest) return { error: `Revalidate within ${REVALIDATION_YEARS} years of completion (by ${latest}).` }
    if (revalidateBy <= completedOn) return { error: 'The revalidation date must be after the completion date.' }
  } else {
    revalidateBy = null
  }

  const mocId = raw.mocId ? String(raw.mocId) : null

  if (mocId && !isUuid(mocId)) return { error: 'Pick the change from the list.' }

  return {
    title,
    processUnit,
    locationId: raw.locationId,
    method: raw.method,
    status: raw.status,
    leaderName: leaderName || null,
    team: team || null,
    startedOn,
    completedOn,
    revalidateBy,
    summary: summary || null,
    mocId
  }
}

export const revalidationState = (revalidateBy: string | null, today: string): 'none' | 'overdue' | 'due_soon' | 'ok' => {
  if (!revalidateBy) return 'none'
  if (revalidateBy < today) return 'overdue'

  return revalidateBy <= addDays(today, REVALIDATION_WARN_DAYS) ? 'due_soon' : 'ok'
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export type MocNoticeKind = 'review_requested' | 'approved' | 'rejected' | 'decision'

export const mocNotice = (moc: { moc_number: string; title: string }, kind: MocNoticeKind, detail: { by?: string; comment?: string | null } = {}) => {
  const name = `${moc.moc_number}: ${moc.title}`

  switch (kind) {
    case 'review_requested':
      return { title: `Approval needed: ${name}`.slice(0, 200), body: 'You are an approver on this management of change. Review it and approve or reject.' }
    case 'approved':
      return { title: `Approved: ${name}`.slice(0, 200), body: 'Every approver has approved this change. Next: the pre-startup safety review and the pre-startup actions.' }
    case 'rejected':
      return { title: `Rejected: ${name}`.slice(0, 200), body: `${detail.by || 'An approver'} rejected this change${detail.comment ? ': ' + detail.comment : '.'}`.slice(0, 2000) }
    default:
      return { title: `Approved by ${detail.by || 'an approver'}: ${name}`.slice(0, 200), body: 'Other approvers are still reviewing it.' }
  }
}
