/**
 * Incident root-cause analysis (5 Whys) rules, ported from Forge Industrial 1.0's RootCauseAnalysis
 * (industrial-web/src/lib/incidents-module.ts): default seeding, normalizing stored/posted values, validation, and
 * the merge that keeps a CAPA link on each action. Pure (no imports), so pages, server actions and node tests share it.
 */

export const RCA_WHY_COUNT = 5
export const RCA_TEXT_MAX = 4000
export const RCA_LIST_MAX = 30
export const RCA_ACTIONS_MAX = 30

export const RCA_ACTION_STATUSES = ['pending', 'in_progress', 'complete'] as const
export type RcaActionStatus = (typeof RCA_ACTION_STATUSES)[number]

export const RCA_ACTION_STATUS_LABELS: Record<RcaActionStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  complete: 'Complete'
}

export type RcaWhy = { question: string; answer: string }

export type RcaAction = {

  /** Stable per action; the CAPA opened for it uses this as its source id. */
  key: string
  action: string
  ownerPersonnelId: string | null
  ownerName: string
  dueDate: string
  status: RcaActionStatus
  capaId: string | null
  capaNumber: string | null
}

export type IncidentRca = {
  problemStatement: string
  immediateActions: string
  eventDate: string
  conductedBy: string
  conductedAt: string
  participants: string[]
  contributingFactors: string[]
  fiveWhys: RcaWhy[]
  rootCause: string
  actions: RcaAction[]
}

export type IncidentRcaRow = {
  problem_statement?: string | null
  immediate_actions?: string | null
  event_date?: string | null
  conducted_by?: string | null
  conducted_at?: string | null
  participants?: unknown
  contributing_factors?: unknown
  five_whys?: unknown
  root_cause?: string | null
  actions?: unknown
}

type IncidentSeed = {
  summary?: string | null
  description?: string | null
  immediate_actions?: string | null
  occurred_at?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ACTION_KEY = /^[A-Za-z0-9_-]{6,64}$/

const text = (value: unknown, max = RCA_TEXT_MAX) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const textList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map(item => text(item, 300))
        .filter(Boolean)
        .slice(0, RCA_LIST_MAX)
    : []

/** `YYYY-MM-DD` when valid (a timestamp is cut to its date), otherwise ''. */
export const rcaDate = (value: unknown) => {
  const raw = text(value, 40).slice(0, 10)

  if (!ISO_DATE.test(raw)) return ''
  const date = new Date(raw + 'T00:00:00Z')

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? '' : raw
}

const status = (value: unknown): RcaActionStatus => {
  const raw = text(value, 20).toLowerCase().replace('-', '_')

  if (raw === 'completed') return 'complete'

  return (RCA_ACTION_STATUSES as readonly string[]).includes(raw) ? (raw as RcaActionStatus) : 'pending'
}

export const newRcaActionKey = () =>
  'rca-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

export const emptyRcaAction = (key = newRcaActionKey()): RcaAction => ({
  key,
  action: '',
  ownerPersonnelId: null,
  ownerName: '',
  dueDate: '',
  status: 'pending',
  capaId: null,
  capaNumber: null
})

const clipWhyText = (value: string, max = 120) => {
  const clean = value.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '')

  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean
}

/** Suggested question for a why, as 1.0: #1 from the incident title, later ones from the previous answer. */
export const fiveWhySeedQuestion = (index: number, context: { incidentTitle?: string | null; previousAnswer?: string | null }) => {
  if (index === 0) {
    const title = clipWhyText(context.incidentTitle || '')

    return title ? `Why did "${title}" occur?` : 'Why did the incident occur?'
  }

  const previous = clipWhyText(context.previousAnswer || '')

  return previous ? `Why did "${previous}" happen?` : 'Why did that happen?'
}

const GENERIC_WHY = 'Why did that happen?'

/** Exactly five whys; blank questions get the 1.0 seed, questions the user wrote are kept. */
export const seedFiveWhys = (whys: RcaWhy[], incidentTitle: string): RcaWhy[] =>
  Array.from({ length: RCA_WHY_COUNT }, (_, index) => {
    const why = whys[index] || { question: '', answer: '' }

    return {
      // The generic placeholder is re-seeded so it picks up the previous answer once there is one.
      question: why.question.trim() && why.question.trim() !== GENERIC_WHY ? why.question : fiveWhySeedQuestion(index, { incidentTitle, previousAnswer: whys[index - 1]?.answer }),
      answer: why.answer
    }
  })

/** The analysis a new RCA starts from (1.0 createDefaultRootCauseAnalysis, filled from the 2.0 incident). */
export const defaultIncidentRca = (incident: IncidentSeed = {}): IncidentRca => ({
  problemStatement: text(incident.description) || text(incident.summary),
  immediateActions: text(incident.immediate_actions),
  eventDate: rcaDate(incident.occurred_at),
  conductedBy: '',
  conductedAt: '',
  participants: [],
  contributingFactors: [],
  fiveWhys: seedFiveWhys([], text(incident.summary)),
  rootCause: '',
  actions: [emptyRcaAction()]
})

const normalizeWhys = (value: unknown): RcaWhy[] => {
  const list = Array.isArray(value) ? value : []

  return Array.from({ length: RCA_WHY_COUNT }, (_, index) => {
    const item = list[index]

    if (typeof item === 'string') return { question: '', answer: text(item) }
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}

    return { question: text(record.question, 500), answer: text(record.answer) }
  })
}

const normalizeAction = (value: unknown): RcaAction | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const key = text(record.key, 64)

  if (!ACTION_KEY.test(key)) return null
  const owner = text(record.ownerPersonnelId, 40)
  const capaId = text(record.capaId, 40)

  return {
    key,
    action: text(record.action, 1000),
    ownerPersonnelId: UUID.test(owner) ? owner : null,
    ownerName: text(record.ownerName, 200),
    dueDate: rcaDate(record.dueDate),
    status: status(record.status),
    capaId: UUID.test(capaId) ? capaId : null,
    capaNumber: text(record.capaNumber, 60) || null
  }
}

const normalizeActions = (value: unknown) => {
  const seen = new Set<string>()

  return (Array.isArray(value) ? value : [])
    .map(normalizeAction)
    .filter((item): item is RcaAction => {
      if (!item || seen.has(item.key)) return false
      seen.add(item.key)

      return true
    })
    .slice(0, RCA_ACTIONS_MAX)
}

/** Normalizes posted client values (camelCase). Blank actions are kept here; `prepareRcaForSave` drops them. */
export const normalizeIncidentRca = (value: unknown, incidentTitle = ''): IncidentRca => {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  return {
    problemStatement: text(record.problemStatement),
    immediateActions: text(record.immediateActions),
    eventDate: rcaDate(record.eventDate),
    conductedBy: text(record.conductedBy, 200),
    conductedAt: rcaDate(record.conductedAt),
    participants: textList(record.participants),
    contributingFactors: textList(record.contributingFactors),
    fiveWhys: seedFiveWhys(normalizeWhys(record.fiveWhys), incidentTitle),
    rootCause: text(record.rootCause),
    actions: normalizeActions(record.actions)
  }
}

/** Reads a forge_incident_rca row; with no row, the default seed from the incident. */
export const rcaFromRow = (row: IncidentRcaRow | null | undefined, incident: IncidentSeed = {}): IncidentRca => {
  if (!row) return defaultIncidentRca(incident)

  const rca = normalizeIncidentRca(
    {
      problemStatement: row.problem_statement,
      immediateActions: row.immediate_actions,
      eventDate: row.event_date,
      conductedBy: row.conducted_by,
      conductedAt: row.conducted_at,
      participants: row.participants,
      contributingFactors: row.contributing_factors,
      fiveWhys: row.five_whys,
      rootCause: row.root_cause,
      actions: row.actions
    },
    text(incident.summary)
  )

  return rca
}

export const rcaToRow = (rca: IncidentRca) => ({
  problem_statement: rca.problemStatement || null,
  immediate_actions: rca.immediateActions || null,
  event_date: rca.eventDate || null,
  conducted_by: rca.conductedBy || null,
  conducted_at: rca.conductedAt || null,
  participants: rca.participants,
  contributing_factors: rca.contributingFactors,
  five_whys: rca.fiveWhys,
  root_cause: rca.rootCause || null,
  actions: rca.actions
})

/**
 * Prepares a posted analysis for save against the stored one: blank actions are dropped, the CAPA link on each
 * action comes from the stored action (never from the client), and an action that already has a CAPA cannot be
 * removed.
 */
export const prepareRcaForSave = (posted: IncidentRca, stored: IncidentRca | null): { rca: IncidentRca } | { error: string } => {
  const storedByKey = new Map((stored?.actions || []).map(item => [item.key, item]))

  const actions = posted.actions
    .map(item => {
      const before = storedByKey.get(item.key)

      return { ...item, capaId: before?.capaId || null, capaNumber: before?.capaNumber || null }
    })
    .filter(item => item.action || item.capaId)

  const kept = new Set(actions.map(item => item.key))
  const removedWithCapa = (stored?.actions || []).find(item => item.capaId && !kept.has(item.key))

  if (removedWithCapa) {
    const capa = removedWithCapa.capaNumber ? 'CAPA ' + removedWithCapa.capaNumber : 'a CAPA'

    return { error: `The action "${removedWithCapa.action || removedWithCapa.key}" has ${capa} and cannot be removed.` }
  }

  for (const item of actions) {
    if (item.capaId && !item.action) return { error: 'An action with a CAPA must keep its description.' }
  }

  return { rca: { ...posted, actions } }
}

/** Why an action cannot open a CAPA yet, or null. */
export const rcaActionCapaBlocker = (action: RcaAction | undefined | null) => {
  if (!action) return 'Save the analysis before creating a CAPA for this action.'
  if (action.capaId) return null
  if (!action.action) return 'Describe the action before creating a CAPA.'

  return null
}

/** 2.0 CAPA severity for an incident severity lookup key. */
export const capaSeverityForIncident = (severity: string | null | undefined) => {
  switch (severity) {
    case 'critical':
      return 'critical'
    case 'serious':
    case 'high':
      return 'high'
    case 'near_miss':
    case 'minor':
    case 'low':
      return 'low'
    default:
      return 'moderate'
  }
}

/** `YYYY-MM-DD` → `MM/DD/YYYY` (1.0 printable format); anything else as-is. */
export const formatRcaDate = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value || '').trim())

  return match ? `${match[2]}/${match[3]}/${match[1]}` : (value || '').trim()
}

/** Whether anything beyond the default seed has been recorded. */
export const rcaHasContent = (rca: IncidentRca) =>
  Boolean(rca.rootCause || rca.contributingFactors.length || rca.fiveWhys.some(why => why.answer) || rca.actions.some(item => item.action))
