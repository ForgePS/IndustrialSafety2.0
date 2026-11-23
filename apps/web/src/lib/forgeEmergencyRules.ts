/**
 * Port slice 14: Emergency Management rules (plans and drills, alerts, audiences, roll call). Pure and
 * self-contained (no "@/" imports) so the unit tests can load it directly.
 */

// ---------------------------------------------------------------------------
// Plans, scenarios, drills, response teams
// ---------------------------------------------------------------------------

export const PLAN_KINDS = [
  { key: 'plan', label: 'Emergency action plan', plural: 'Action plans' },
  { key: 'scenario', label: 'Scenario procedure', plural: 'Scenarios' },
  { key: 'drill', label: 'Drill', plural: 'Drills' },
  { key: 'team', label: 'Response team', plural: 'Response teams' }
] as const

export type PlanKind = (typeof PLAN_KINDS)[number]['key']

export const PLAN_STATUSES = [
  { key: 'draft', label: 'Draft' },
  { key: 'active', label: 'Active' },
  { key: 'retired', label: 'Retired' }
] as const

export const DRILL_STATUSES = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'canceled', label: 'Canceled' }
] as const

export const SCENARIO_TYPES = ['fire', 'evacuation', 'shelter_in_place', 'severe_weather', 'chemical_release', 'medical', 'security', 'utility_failure', 'other'] as const

export const isPlanKind = (value: unknown): value is PlanKind => PLAN_KINDS.some(kind => kind.key === value)
export const planKindLabel = (kind: string) => PLAN_KINDS.find(item => item.key === kind)?.label || kind

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')

export type PlanInput = {
  kind: PlanKind
  title: string
  status: string
  scenarioType: string | null
  locationId: string | null
  planId: string | null
  summary: string | null
  body: string | null
  reviewDueOn: string | null
  eventDate: string | null
  participants: number | null
  durationMinutes: number | null
  afterAction: string | null
}

/** Checks a plan / scenario / drill / team form. Returns the cleaned record or the first problem. */
export const cleanPlanInput = (raw: Record<string, unknown>): PlanInput | { error: string } => {
  const kind = raw.kind

  if (!isPlanKind(kind)) return { error: 'Pick what kind of record this is.' }

  const title = text(raw.title).replace(/\s+/g, ' ')

  if (!title) return { error: 'Give it a title.' }
  if (title.length > 200) return { error: 'Keep the title to 200 characters.' }

  const statuses: readonly { key: string }[] = kind === 'drill' ? DRILL_STATUSES : PLAN_STATUSES
  const status = String(raw.status || statuses[0].key)

  if (!statuses.some(item => item.key === status)) return { error: 'Pick a status.' }

  const scenarioType = raw.scenarioType ? String(raw.scenarioType) : null

  if (scenarioType && !(SCENARIO_TYPES as readonly string[]).includes(scenarioType)) return { error: 'Pick a scenario type.' }
  if (kind === 'scenario' && !scenarioType) return { error: 'Pick the kind of emergency this scenario covers.' }

  const locationId = raw.locationId ? String(raw.locationId) : null

  if (locationId && !isUuid(locationId)) return { error: 'Pick a location.' }

  const planId = raw.planId ? String(raw.planId) : null

  if (planId && !isUuid(planId)) return { error: 'Pick the plan.' }

  const summary = text(raw.summary)
  const body = text(raw.body)
  const afterAction = text(raw.afterAction)

  if (summary.length > 1000) return { error: 'Keep the summary to 1,000 characters.' }
  if (body.length > 20000) return { error: 'Keep the procedure to 20,000 characters.' }
  if (afterAction.length > 10000) return { error: 'Keep the after-action review to 10,000 characters.' }

  const reviewDueOn = raw.reviewDueOn ? String(raw.reviewDueOn) : null

  if (reviewDueOn && !isDate(reviewDueOn)) return { error: 'Enter a valid review date.' }

  const eventDate = raw.eventDate ? String(raw.eventDate) : null

  if (eventDate && !isDate(eventDate)) return { error: 'Enter a valid drill date.' }
  if (kind === 'drill' && !eventDate) return { error: 'Enter the drill date.' }

  const whole = (value: unknown, max: number, label: string) => {
    if (value === undefined || value === null || value === '') return { value: null }
    const number = Number(value)

    if (!Number.isInteger(number) || number < 0 || number > max) return { error: `Enter ${label} as a whole number up to ${max.toLocaleString('en-US')}.` }

    return { value: number }
  }

  const participants = whole(raw.participants, 100000, 'participants')

  if ('error' in participants) return { error: participants.error as string }

  const duration = whole(raw.durationMinutes, 1440, 'the duration in minutes')

  if ('error' in duration) return { error: duration.error as string }

  if (kind === 'drill' && status === 'completed' && !afterAction) return { error: 'Add the after-action review to complete the drill.' }

  const drillOnly = kind === 'drill'

  return {
    kind,
    title,
    status,
    scenarioType: kind === 'scenario' || kind === 'drill' ? scenarioType : null,
    locationId,
    planId: drillOnly || kind === 'scenario' ? planId : null,
    summary: summary || null,
    body: body || null,
    reviewDueOn: drillOnly ? null : reviewDueOn,
    eventDate: drillOnly ? eventDate : null,
    participants: drillOnly ? participants.value : null,
    durationMinutes: drillOnly ? duration.value : null,
    afterAction: drillOnly ? afterAction || null : null
  }
}

/** Review state of a plan: overdue, due within the warning window, or fine. */
export const reviewState = (reviewDueOn: string | null, today: string, warningDays = 30): 'overdue' | 'due_soon' | 'ok' | 'none' => {
  if (!reviewDueOn) return 'none'
  if (reviewDueOn < today) return 'overdue'

  const soon = new Date(today + 'T00:00:00Z')

  soon.setUTCDate(soon.getUTCDate() + warningDays)

  return reviewDueOn <= soon.toISOString().slice(0, 10) ? 'due_soon' : 'ok'
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const ALERT_TYPES = [
  { key: 'general', label: 'General' },
  { key: 'fire', label: 'Fire' },
  { key: 'evacuation', label: 'Evacuation' },
  { key: 'shelter_in_place', label: 'Shelter in place' },
  { key: 'severe_weather', label: 'Severe weather' },
  { key: 'chemical_release', label: 'Chemical release' },
  { key: 'medical', label: 'Medical' },
  { key: 'security', label: 'Security' },
  { key: 'utility_failure', label: 'Utility failure' }
] as const

export const ALERT_SEVERITIES = [
  { key: 'extreme', label: 'Extreme' },
  { key: 'severe', label: 'Severe' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'minor', label: 'Minor' }
] as const

export const alertTypeLabel = (key: string) => ALERT_TYPES.find(item => item.key === key)?.label || key
export const severityLabel = (key: string) => ALERT_SEVERITIES.find(item => item.key === key)?.label || key

export const RESPONSE_STATUSES = [
  { key: 'safe', label: "I'm safe" },
  { key: 'need_help', label: 'I need help' }
] as const

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number]['key']

export const MAX_RECIPIENTS = 5000

export type AlertMessage = {
  alertType: string
  severity: string
  headline: string
  message: string
  instructions: string | null
}

export type AlertInput = AlertMessage & { isDrill: boolean; requiresResponse: boolean }

/** Checks the message part of an alert or template. */
export const cleanAlertMessage = (raw: Record<string, unknown>): AlertMessage | { error: string } => {
  const alertType = String(raw.alertType || '')

  if (!ALERT_TYPES.some(item => item.key === alertType)) return { error: 'Pick the type of alert.' }

  const severity = String(raw.severity || '')

  if (!ALERT_SEVERITIES.some(item => item.key === severity)) return { error: 'Pick the severity.' }

  const headline = text(raw.headline).replace(/\s+/g, ' ')

  if (!headline) return { error: 'Write a headline.' }
  if (headline.length > 120) return { error: 'Keep the headline to 120 characters.' }

  const message = text(raw.message)

  if (!message) return { error: 'Write the message.' }
  if (message.length > 1000) return { error: 'Keep the message to 1,000 characters.' }

  const instructions = text(raw.instructions)

  if (instructions.length > 2000) return { error: 'Keep the instructions to 2,000 characters.' }

  return { alertType, severity, headline, message, instructions: instructions || null }
}

export const cleanAlertInput = (raw: Record<string, unknown>): AlertInput | { error: string } => {
  const message = cleanAlertMessage(raw)

  if ('error' in message) return message

  return { ...message, isDrill: raw.isDrill === true, requiresResponse: raw.requiresResponse !== false }
}

/** An alert number like EA-20261119-3F9A1C. */
export const alertNumber = (now: Date, random: string) => 'EA-' + now.toISOString().slice(0, 10).replaceAll('-', '') + '-' + random.toUpperCase()

export type NoticeKind = 'issued' | 'update' | 'all_clear'

/** Notice title and body for each step, marked as a drill when it is one. */
export const alertNotice = (alert: AlertMessage & { isDrill: boolean; requiresResponse: boolean }, kind: NoticeKind) => {
  const drill = alert.isDrill ? '[DRILL] ' : ''
  const label = alertTypeLabel(alert.alertType).toUpperCase()

  if (kind === 'all_clear') {
    return {
      title: `${drill}ALL CLEAR: ${alert.headline}`.slice(0, 200),
      body: [alert.message, alert.instructions].filter(Boolean).join('\n\n').slice(0, 2000)
    }
  }

  const prefix = kind === 'update' ? 'UPDATE ' : ''
  const ask = alert.requiresResponse && kind === 'issued' ? "\n\nOpen the alert and tell us if you're safe." : ''

  return {
    title: `${drill}${prefix}${label}: ${alert.headline}`.slice(0, 200),
    body: ([alert.message, alert.instructions].filter(Boolean).join('\n\n') + ask).slice(0, 2000)
  }
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export type Audience = {
  scope: 'company' | 'targeted'
  locationIds: string[]
  departmentIds: string[]
  personnelIds: string[]
}

const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(String).filter(isUuid))]

/** Any location, department or person makes the audience targeted. A targeted audience needs at least one. */
export const cleanAudience = (raw: unknown): Audience | { error: string } => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const audience: Audience = {
    scope: 'company',
    locationIds: ids(input.locationIds),
    departmentIds: ids(input.departmentIds),
    personnelIds: ids(input.personnelIds)
  }

  if (audience.locationIds.length || audience.departmentIds.length || audience.personnelIds.length) audience.scope = 'targeted'
  else if (input.scope === 'targeted') return { error: 'Pick at least one location, department or person, or send it to the whole company.' }

  return audience
}

/**
 * A location-scoped sender (scopeLocationIds is a list) can only alert their own locations: no company-wide
 * alerts and no departments or people on their own, since those reach other sites. Organization scope is null.
 */
export const audienceWithinScope = (audience: Audience, scopeLocationIds: string[] | null) => {
  if (scopeLocationIds === null) return null
  if (audience.scope === 'company') return 'You can only send alerts to your own locations, not the whole company.'
  if (!audience.locationIds.length) return 'Pick one or more of your locations.'
  if (audience.departmentIds.length || audience.personnelIds.length) return 'Departments and people can only be added by someone who can alert the whole company.'

  const allowed = new Set(scopeLocationIds)

  return audience.locationIds.every(id => allowed.has(id)) ? null : 'You can only send alerts to your own locations.'
}

export type AudiencePerson = {
  id: string
  name: string
  userId: string | null
  locationId: string | null
  departmentId: string | null
  status: string
  archived: boolean
}

export type Recipient = { userId: string; personnelId: string | null; name: string; locationId: string | null; departmentId: string | null }
export type Exclusion = { personnelId: string; name: string; reason: 'no_account' | 'not_active' | 'not_member' }

export const EXCLUSION_LABELS: Record<Exclusion['reason'], string> = {
  no_account: 'No Forge account to send to',
  not_active: 'Not an active employee',
  not_member: 'Account is not active in this company'
}

/**
 * Who an alert reaches. Company-wide: every active member of the company, plus the employees linked to them.
 * Targeted: employees at any of the locations, in any of the departments, or picked by name (an OR, as in
 * 1.0). Each account is counted once. Employees without an account, or not active, are listed as excluded.
 */
export const resolveAudience = ({
  audience,
  personnel,
  members
}: {
  audience: Audience
  personnel: AudiencePerson[]
  members: { userId: string; name: string }[]
}) => {
  const memberIds = new Set(members.map(member => member.userId))
  const recipients = new Map<string, Recipient>()
  const exclusions: Exclusion[] = []
  const locations = new Set(audience.locationIds)
  const departments = new Set(audience.departmentIds)
  const picked = new Set(audience.personnelIds)

  const matches = (person: AudiencePerson) =>
    audience.scope === 'company' ||
    picked.has(person.id) ||
    (person.locationId !== null && locations.has(person.locationId)) ||
    (person.departmentId !== null && departments.has(person.departmentId))

  for (const person of personnel) {
    if (!matches(person)) continue

    if (person.archived || person.status !== 'active') exclusions.push({ personnelId: person.id, name: person.name, reason: 'not_active' })
    else if (!person.userId) exclusions.push({ personnelId: person.id, name: person.name, reason: 'no_account' })
    else if (!memberIds.has(person.userId)) exclusions.push({ personnelId: person.id, name: person.name, reason: 'not_member' })
    else if (!recipients.has(person.userId))
      recipients.set(person.userId, { userId: person.userId, personnelId: person.id, name: person.name, locationId: person.locationId, departmentId: person.departmentId })
  }

  if (audience.scope === 'company') {
    // An account linked only to employee records that are not active (terminated, archived) is left out.
    const linkedActive = new Set(personnel.filter(person => person.userId && !person.archived && person.status === 'active').map(person => person.userId))
    const linkedInactive = new Set(personnel.filter(person => person.userId && !linkedActive.has(person.userId)).map(person => person.userId))

    for (const member of members) {
      if (linkedInactive.has(member.userId)) continue
      if (!recipients.has(member.userId)) recipients.set(member.userId, { userId: member.userId, personnelId: null, name: member.name, locationId: null, departmentId: null })
    }
  }

  const list = [...recipients.values()].sort((a, b) => a.name.localeCompare(b.name))
  const byReason = exclusions.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] || 0) + 1 }), {})

  return { recipients: list, exclusions, byReason, tooMany: list.length > MAX_RECIPIENTS }
}

// ---------------------------------------------------------------------------
// Roll call
// ---------------------------------------------------------------------------

export type RollCallRow = Recipient & { status: ResponseStatus | 'no_response'; note: string | null; respondedAt: string | null }

/** Puts "need help" first, then no response, then safe; within each, by name. */
export const rollCall = (recipients: Recipient[], responses: { userId: string; status: ResponseStatus; note: string | null; respondedAt: string }[]) => {
  const byUser = new Map(responses.map(response => [response.userId, response]))
  const order = { need_help: 0, no_response: 1, safe: 2 }

  const rows: RollCallRow[] = recipients.map(recipient => {
    const response = byUser.get(recipient.userId)

    return { ...recipient, status: response?.status || 'no_response', note: response?.note || null, respondedAt: response?.respondedAt || null }
  })

  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))

  const counts = { total: rows.length, safe: 0, need_help: 0, no_response: 0 }

  for (const row of rows) counts[row.status] += 1

  return { rows, counts, accountedPercent: rows.length ? Math.round(((counts.safe + counts.need_help) / rows.length) * 100) : 0 }
}

export const cleanResponse = (raw: Record<string, unknown>): { status: ResponseStatus; note: string | null } | { error: string } => {
  const status = String(raw.status || '')

  if (!RESPONSE_STATUSES.some(item => item.key === status)) return { error: "Pick I'm safe or I need help." }

  const note = text(raw.note)

  if (note.length > 500) return { error: 'Keep the note to 500 characters.' }

  return { status: status as ResponseStatus, note: note || null }
}
