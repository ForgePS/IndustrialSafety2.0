/**
 * Port slice 18: rules for high-risk work permits (confined space, hot work, working at heights, energized electrical
 * work) on one Permit-to-Work engine. Pure functions, shared by pages, actions and tests. The database enforces the
 * same rules in its workflow functions (supabase/migrations/20261123100000_s18_permits.sql); these give the page
 * the same answer before it asks.
 */

export const PERMIT_TYPES = ['confined_space', 'hot_work', 'heights', 'electrical'] as const

export type PermitType = (typeof PERMIT_TYPES)[number]

export const PERMIT_TYPE_INFO: Record<PermitType, { label: string; short: string; slug: string; prefix: string; description: string }> = {
  confined_space: { label: 'Confined Space Entry', short: 'Confined Space', slug: 'confined-space', prefix: 'CSE', description: 'Entry into a permit-required confined space (OSHA 1910.146).' },
  hot_work: { label: 'Hot Work', short: 'Hot Work', slug: 'hot-work', prefix: 'HW', description: 'Welding, cutting, grinding and other spark or flame work (OSHA 1910.252, NFPA 51B).' },
  heights: { label: 'Working at Heights', short: 'Heights', slug: 'working-at-heights', prefix: 'WAH', description: 'Work with a fall hazard (OSHA 1910.28, 1910.140, 1926.502).' },
  electrical: { label: 'Energized Electrical Work', short: 'Electrical', slug: 'electrical', prefix: 'EEW', description: 'Work on or near exposed energized parts (NFPA 70E 130.2).' }
}

export const isPermitType = (value: unknown): value is PermitType => typeof value === 'string' && (PERMIT_TYPES as readonly string[]).includes(value)

export const permitTypeFromSlug = (slug: string | null | undefined): PermitType | null =>
  (PERMIT_TYPES.find(type => PERMIT_TYPE_INFO[type].slug === slug) as PermitType | undefined) || null

export const permitPath = (type: PermitType, id?: string) => `/permits/${PERMIT_TYPE_INFO[type].slug}${id ? `/${id}` : ''}`

export const PERMIT_STATUSES = ['draft', 'requested', 'approved', 'active', 'suspended', 'closed', 'canceled'] as const

export type PermitStatus = (typeof PERMIT_STATUSES)[number]

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  draft: 'Draft',
  requested: 'Waiting for approval',
  approved: 'Approved, not issued',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed',
  canceled: 'Canceled'
}

export const permitStatusTone = (status: string, expired = false): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (expired && OPEN_STATUSES.includes(status as PermitStatus)) return 'destructive'
  if (status === 'active') return 'default'
  if (status === 'suspended') return 'destructive'
  if (status === 'closed' || status === 'canceled') return 'outline'

  return 'secondary'
}

/** Statuses where the permit is still live and can run past its valid-until time. */
export const OPEN_STATUSES: PermitStatus[] = ['approved', 'active', 'suspended']

export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const PERMIT_ROLE_LABELS: Record<string, string> = {
  entry_supervisor: 'Entry supervisor',
  attendant: 'Attendant',
  entrant: 'Entrant',
  rescuer: 'Rescuer',
  hot_work_operator: 'Hot work operator',
  fire_watch: 'Fire watch',
  worker: 'Worker',
  competent_person: 'Competent person',
  qualified_person: 'Qualified person',
  safety_watch: 'Safety watch'
}

export const PERMIT_ROLES: Record<PermitType, string[]> = {
  confined_space: ['entry_supervisor', 'attendant', 'entrant', 'rescuer'],
  hot_work: ['hot_work_operator', 'fire_watch'],
  heights: ['worker', 'competent_person', 'rescuer'],
  electrical: ['qualified_person', 'safety_watch']
}

export const REQUIRED_ROLES: Record<PermitType, string[]> = {
  confined_space: ['entry_supervisor', 'attendant', 'entrant'],
  hot_work: ['hot_work_operator', 'fire_watch'],
  heights: ['worker', 'competent_person'],
  electrical: ['qualified_person']
}

export type PermitPerson = { id?: string; role: string; personnel_id: string | null; contractor_worker_id: string | null; removed_at?: string | null }

const samePerson = (a: PermitPerson, b: PermitPerson) =>
  (a.personnel_id && a.personnel_id === b.personnel_id) || (a.contractor_worker_id && a.contractor_worker_id === b.contractor_worker_id)

/** First reason the people on a permit aren't enough (null when they are). Mirrors forge_permit_people_problem. */
export const peopleProblem = (type: PermitType, people: PermitPerson[]): string | null => {
  const current = people.filter(person => !person.removed_at)
  const has = (role: string) => current.some(person => person.role === role)
  const clash = (a: string, b: string) => current.some(x => x.role === a && current.some(y => y.role === b && samePerson(x, y)))

  if (type === 'confined_space') {
    if (!has('entry_supervisor')) return 'Add an entry supervisor.'
    if (!has('attendant')) return 'Add an attendant.'
    if (!has('entrant')) return 'Add at least one entrant.'
    if (clash('attendant', 'entrant')) return "The attendant can't also be an entrant."
  } else if (type === 'hot_work') {
    if (!has('hot_work_operator')) return 'Add the person doing the hot work.'
    if (!has('fire_watch')) return 'Add a fire watch.'
    if (clash('fire_watch', 'hot_work_operator')) return "The fire watch can't also do the hot work."
  } else if (type === 'heights') {
    if (!has('worker')) return 'Add at least one worker.'
    if (!has('competent_person')) return 'Add a competent person.'
  } else if (type === 'electrical') {
    if (!has('qualified_person')) return 'Add at least one qualified person.'
  }

  return null
}

// ---------------------------------------------------------------------------
// Type-specific details
// ---------------------------------------------------------------------------

export const HOT_WORK_TYPES: Record<string, string> = {
  welding: 'Welding',
  cutting: 'Cutting',
  brazing: 'Brazing',
  soldering: 'Soldering',
  grinding: 'Grinding',
  torch: 'Torch work',
  other: 'Other'
}

export const FALL_PROTECTION: Record<string, string> = {
  guardrail: 'Guardrails',
  personal_fall_arrest: 'Personal fall arrest',
  travel_restraint: 'Travel restraint',
  positioning: 'Positioning system',
  safety_net: 'Safety net',
  aerial_lift: 'Aerial lift',
  scaffold: 'Scaffold',
  ladder: 'Ladder'
}

export const PERSONAL_FALL_SYSTEMS = ['personal_fall_arrest', 'travel_restraint', 'positioning']

export const SPACE_HAZARDS: Record<string, string> = {
  oxygen_deficiency: 'Oxygen deficiency',
  oxygen_enrichment: 'Oxygen enrichment',
  flammable: 'Flammable atmosphere',
  toxic: 'Toxic atmosphere',
  engulfment: 'Engulfment',
  entrapment: 'Entrapment (converging walls, sloping floor)',
  mechanical: 'Mechanical hazards',
  electrical: 'Electrical hazards',
  thermal: 'Heat or cold',
  other: 'Other'
}

export const ELECTRICAL_JUSTIFICATIONS: Record<string, string> = {
  infeasible: 'De-energizing is infeasible (equipment design or operating limits)',
  greater_hazard: 'De-energizing would create a greater hazard'
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const num = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

/** Clean up a details object from a form: trim strings, drop empties, coerce numbers and booleans. */
export const normalizeDetails = (type: PermitType, raw: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}

  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return
    out[key] = value
  }

  if (type === 'confined_space') {
    put('rescue_service', text(raw.rescue_service))
    put('communication', text(raw.communication))
    put('entry_type', ['horizontal', 'vertical'].includes(text(raw.entry_type)) ? text(raw.entry_type) : '')
    put('extra_hazards', text(raw.extra_hazards))
  } else if (type === 'hot_work') {
    put('work_type', text(raw.work_type))
    out.gas_test_required = raw.gas_test_required === true || raw.gas_test_required === 'true' || raw.gas_test_required === 'on'
    put('designated_area', raw.designated_area === true || raw.designated_area === 'true' || raw.designated_area === 'on' ? true : '')
    put('extinguisher', text(raw.extinguisher))
  } else if (type === 'heights') {
    put('working_height_ft', num(raw.working_height_ft))
    const methods = (Array.isArray(raw.fall_protection) ? raw.fall_protection : [raw.fall_protection]).map(text).filter(Boolean)

    put('fall_protection', [...new Set(methods)])
    put('anchorage', text(raw.anchorage))
    put('rescue_plan', text(raw.rescue_plan))
    put('equipment', text(raw.equipment))
  } else if (type === 'electrical') {
    put('voltage', num(raw.voltage))
    put('equipment', text(raw.equipment))
    put('justification', text(raw.justification))
    put('justification_detail', text(raw.justification_detail))
    put('limited_approach', text(raw.limited_approach))
    put('restricted_approach', text(raw.restricted_approach))
    put('arc_flash_boundary', text(raw.arc_flash_boundary))
    put('incident_energy', num(raw.incident_energy))
    put('ppe_category', ['1', '2', '3', '4'].includes(text(String(raw.ppe_category ?? ''))) ? text(String(raw.ppe_category)) : '')
    put('ppe', text(raw.ppe))
    put('loto_considered', text(raw.loto_considered))
  }

  return out
}

/** First thing missing from a permit's details (null when complete). Mirrors forge_permit_details_problem. */
export const detailsProblem = (type: PermitType, d: Record<string, any>): string | null => {
  if (type === 'confined_space') {
    if (!text(d.rescue_service)) return 'Name the rescue service for this entry.'
    if (!text(d.communication)) return 'Say how the attendant and entrants will communicate.'
    if (d.entry_type !== undefined && !['horizontal', 'vertical'].includes(d.entry_type)) return 'Entry type must be horizontal or vertical.'
  } else if (type === 'hot_work') {
    if (!Object.keys(HOT_WORK_TYPES).includes(d.work_type)) return 'Pick the kind of hot work.'
    if (typeof d.gas_test_required !== 'boolean') return 'Say whether a gas test is needed before the work.'
  } else if (type === 'heights') {
    const height = num(d.working_height_ft)

    if (height === null || height <= 0 || height > 2000) return 'Enter the working height in feet.'
    if (!Array.isArray(d.fall_protection) || d.fall_protection.length === 0) return 'Pick at least one fall protection method.'
    if (d.fall_protection.some((method: string) => !(method in FALL_PROTECTION))) return 'Unknown fall protection method.'
    if (d.fall_protection.some((method: string) => PERSONAL_FALL_SYSTEMS.includes(method)) && !text(d.anchorage)) return 'Describe the anchorage for the personal fall protection.'
    if (!text(d.rescue_plan)) return 'Write the rescue plan for a fallen worker.'
  } else if (type === 'electrical') {
    const voltage = num(d.voltage)

    if (voltage === null || voltage <= 0) return 'Enter the voltage of the exposed parts.'
    if (!(d.justification in ELECTRICAL_JUSTIFICATIONS)) return 'Say why the work must be done energized.'
    if (!text(d.justification_detail)) return 'Explain why the equipment cannot be de-energized.'
    if (!text(d.equipment)) return 'Name the equipment being worked on.'
    if (!text(d.limited_approach) || !text(d.restricted_approach)) return 'Enter the limited and restricted approach boundaries.'
    if (!text(d.arc_flash_boundary)) return 'Enter the arc flash boundary.'
    if (num(d.incident_energy) === null && !text(String(d.ppe_category ?? ''))) return 'Enter the incident energy or the PPE category.'
    if (d.ppe_category !== undefined && !['1', '2', '3', '4'].includes(String(d.ppe_category))) return 'PPE category must be 1 to 4.'
    if (!text(d.ppe)) return 'List the PPE required.'
  }

  return null
}

/** NFPA 70E: under 50 volts an energized work permit normally isn't needed. Shown as a hint, not a block. */
export const lowVoltageHint = (d: Record<string, any>) => {
  const voltage = num(d.voltage)

  return voltage !== null && voltage < 50 ? 'Under 50 volts an energized work permit is normally not needed.' : null
}

// ---------------------------------------------------------------------------
// Settings, time window, expiry, fire watch
// ---------------------------------------------------------------------------

export type PermitSettings = {
  allow_self_approval: boolean
  require_training: boolean
  confined_space_max_hours: number
  hot_work_max_hours: number
  heights_max_hours: number
  electrical_max_hours: number
  o2_min: number
  o2_max: number
  lel_max: number
  hot_work_lel_max: number
  h2s_max: number
  co_max: number
  gas_test_valid_minutes: number
  fire_watch_minutes: number
}

export const DEFAULT_PERMIT_SETTINGS: PermitSettings = {
  allow_self_approval: false,
  require_training: true,
  confined_space_max_hours: 12,
  hot_work_max_hours: 12,
  heights_max_hours: 12,
  electrical_max_hours: 12,
  o2_min: 19.5,
  o2_max: 23.5,
  lel_max: 10,
  hot_work_lel_max: 10,
  h2s_max: 10,
  co_max: 35,
  gas_test_valid_minutes: 60,
  fire_watch_minutes: 60
}

/** Settings row from the database (numerics arrive as strings) with defaults filled in. */
export const normalizeSettings = (row: Record<string, any> | null | undefined): PermitSettings => {
  const out: any = { ...DEFAULT_PERMIT_SETTINGS }

  for (const key of Object.keys(DEFAULT_PERMIT_SETTINGS) as (keyof PermitSettings)[]) {
    const value = row?.[key]

    if (value === null || value === undefined) continue
    out[key] = typeof DEFAULT_PERMIT_SETTINGS[key] === 'boolean' ? Boolean(value) : Number(value)
  }

  return out
}

export const maxHours = (settings: PermitSettings, type: PermitType) =>
  ({ confined_space: settings.confined_space_max_hours, hot_work: settings.hot_work_max_hours, heights: settings.heights_max_hours, electrical: settings.electrical_max_hours })[type]

/** Problem with a permit's valid window (null when fine). */
export const windowProblem = (type: PermitType, validFrom: Date, validUntil: Date, settings: PermitSettings, now = new Date()): string | null => {
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) return 'Enter when the permit starts and ends.'
  if (validUntil <= validFrom) return 'The end time must be after the start time.'
  if (validUntil <= now) return 'The valid-until time has passed. Change the times.'
  const hours = maxHours(settings, type)

  if (validUntil.getTime() - validFrom.getTime() > hours * 3600_000) return `A permit of this type can be valid for at most ${hours} hours.`

  return null
}

export const isExpired = (permit: { status: string; valid_until: string }, now = new Date()) =>
  OPEN_STATUSES.includes(permit.status as PermitStatus) && new Date(permit.valid_until) <= now

/** Minutes left before expiry for an open permit (negative once expired), or null for other statuses. */
export const minutesLeft = (permit: { status: string; valid_until: string }, now = new Date()) =>
  OPEN_STATUSES.includes(permit.status as PermitStatus) ? Math.floor((new Date(permit.valid_until).getTime() - now.getTime()) / 60_000) : null

export const fireWatchEndsAt = (permit: { work_completed_at: string | null }, settings: PermitSettings) =>
  permit.work_completed_at ? new Date(new Date(permit.work_completed_at).getTime() + settings.fire_watch_minutes * 60_000) : null

// ---------------------------------------------------------------------------
// Gas tests
// ---------------------------------------------------------------------------

export type GasReading = {
  o2_pct?: number | null
  lel_pct?: number | null
  h2s_ppm?: number | null
  co_ppm?: number | null
  other_gas?: string | null
  other_value?: number | null
  other_limit?: number | null
}

/** Problems with a set of readings against the company's limits. Mirrors forge_permit_record_gas_test. */
export const gasProblems = (type: PermitType, reading: GasReading, settings: PermitSettings): string[] => {
  const problems: string[] = []
  const lelMax = type === 'hot_work' ? settings.hot_work_lel_max : settings.lel_max
  const o2 = num(reading.o2_pct)
  const lel = num(reading.lel_pct)
  const h2s = num(reading.h2s_ppm)
  const co = num(reading.co_ppm)

  if (o2 !== null && o2 < settings.o2_min) problems.push(`Oxygen ${o2}% is below ${settings.o2_min}%`)
  if (o2 !== null && o2 > settings.o2_max) problems.push(`Oxygen ${o2}% is above ${settings.o2_max}%`)
  if (lel !== null && lel >= lelMax && !(lelMax === 0 && lel === 0)) problems.push(`LEL ${lel}% is at or above ${lelMax}%`)
  if (h2s !== null && h2s >= settings.h2s_max) problems.push(`H2S ${h2s} ppm is at or above ${settings.h2s_max} ppm`)
  if (co !== null && co >= settings.co_max) problems.push(`CO ${co} ppm is at or above ${settings.co_max} ppm`)
  const otherValue = num(reading.other_value)
  const otherLimit = num(reading.other_limit)

  if (text(reading.other_gas) && otherValue !== null && otherLimit !== null && otherValue >= otherLimit) {
    problems.push(`${text(reading.other_gas)} ${otherValue} is at or above ${otherLimit}`)
  }

  return problems
}

export const needsGasTest = (permit: { permit_type: string; details: Record<string, any> }) =>
  permit.permit_type === 'confined_space' || (permit.permit_type === 'hot_work' && permit.details?.gas_test_required === true)

/** Whether the latest test lets work go ahead (null when it does). Mirrors forge_permit_gas_problem. */
export const gasTestProblem = (
  permit: { permit_type: string; details: Record<string, any> },
  tests: { tested_at: string; passed: boolean }[],
  settings: PermitSettings,
  after: string | null = null,
  now = new Date()
): string | null => {
  if (!needsGasTest(permit)) return null
  const latest = [...tests].sort((a, b) => b.tested_at.localeCompare(a.tested_at))[0]

  if (!latest) return 'Record a gas test first.'
  if (!latest.passed) return 'The last gas test failed. Ventilate and test again.'

  if (new Date(latest.tested_at).getTime() < now.getTime() - settings.gas_test_valid_minutes * 60_000) {
    return `The last gas test is more than ${settings.gas_test_valid_minutes} minutes old. Test again.`
  }

  if (after && latest.tested_at < after) return 'Test again after the suspension.'

  return null
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export type CheckDefinition = { check_key: string; label: string; required: boolean; allow_na: boolean; sort_order: number; organization_id: string | null }

export type CheckAnswer = { check_key: string; answer: 'yes' | 'no' | 'na'; note: string | null }

/** Built-in items plus the company's own; a company item with the same key replaces the built-in one. */
export const mergeCheckDefinitions = (definitions: CheckDefinition[]) => {
  const byKey = new Map<string, CheckDefinition>()

  for (const definition of definitions.filter(item => !item.organization_id)) byKey.set(definition.check_key, definition)
  for (const definition of definitions.filter(item => item.organization_id)) byKey.set(definition.check_key, definition)

  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}

/** First checklist problem (null when every required item is answered). Mirrors forge_permit_checks_problem. */
export const checklistProblem = (definitions: CheckDefinition[], answers: CheckAnswer[]): string | null => {
  const byKey = new Map(answers.map(answer => [answer.check_key, answer]))

  for (const definition of mergeCheckDefinitions(definitions).filter(item => item.required)) {
    const answer = byKey.get(definition.check_key)

    if (!answer) return `Answer the checklist: ${definition.label}.`
    if (answer.answer === 'no') return `Not ready: ${definition.label}.`
    if (answer.answer === 'na' && !definition.allow_na) return `${definition.label} can't be marked not applicable.`
    if (answer.answer === 'na' && !text(answer.note)) return `Add a note for "${definition.label}".`
  }

  return null
}

// ---------------------------------------------------------------------------
// What can be done next
// ---------------------------------------------------------------------------

export type PermitRights = { request: boolean; approve: boolean; manage: boolean }

export type PermitForActions = {
  status: string
  permit_type: string
  valid_until: string
  requested_by: string | null
  created_by: string | null
  work_completed_at: string | null
}

/**
 * Buttons the page should offer. The server re-checks every one. `insideCount` is the number signed in to a
 * confined space.
 */
export const permitActions = (
  permit: PermitForActions,
  rights: PermitRights,
  userId: string,
  settings: PermitSettings,
  insideCount = 0,
  now = new Date()
) => {
  const status = permit.status as PermitStatus
  const expired = new Date(permit.valid_until) <= now
  const mine = permit.requested_by === userId || permit.created_by === userId
  const fireWatchEnd = fireWatchEndsAt(permit, settings)

  return {
    edit: status === 'draft' && (rights.request || rights.manage),
    delete: status === 'draft' && (mine || rights.manage),
    submit: status === 'draft' && rights.request,
    withdraw: status === 'requested' && (mine || rights.manage),
    approve: status === 'requested' && rights.approve && (settings.allow_self_approval || permit.requested_by !== userId),
    reject: status === 'requested' && rights.approve,
    issue: status === 'approved' && rights.approve && !expired,
    suspend: status === 'active' && (rights.request || rights.approve),
    resume: status === 'suspended' && rights.approve && !expired,
    completeWork: permit.permit_type === 'hot_work' && (status === 'active' || status === 'suspended') && !permit.work_completed_at && (rights.request || rights.approve),
    close:
      (status === 'active' || status === 'suspended') &&
      (rights.approve || mine) &&
      insideCount === 0 &&
      (permit.permit_type !== 'hot_work' || Boolean(fireWatchEnd && fireWatchEnd <= now)),
    cancel: (status === 'draft' || status === 'requested' || status === 'approved') && (mine || rights.manage || rights.approve),
    editPeople: !['closed', 'canceled'].includes(status) && (rights.request || rights.approve),
    editChecklist: ['draft', 'requested', 'approved'].includes(status) && (rights.request || rights.approve),
    recordGasTest: ['confined_space', 'hot_work'].includes(permit.permit_type) && OPEN_STATUSES.includes(status) && (rights.request || rights.approve),
    signIn: permit.permit_type === 'confined_space' && status === 'active' && !expired && (rights.request || rights.approve),
    signOut: permit.permit_type === 'confined_space' && (rights.request || rights.approve),
    expired: OPEN_STATUSES.includes(status) && expired,
    fireWatchEnd
  }
}

/** Plain-language list of what still blocks closing a permit (empty when it can be closed). */
export const closeBlockers = (permit: PermitForActions, settings: PermitSettings, insideCount: number, now = new Date()) => {
  const blockers: string[] = []

  if (insideCount > 0) blockers.push(insideCount === 1 ? '1 person is still inside the space.' : `${insideCount} people are still inside the space.`)

  if (permit.permit_type === 'hot_work') {
    const end = fireWatchEndsAt(permit, settings)

    if (!end) blockers.push(`Mark the work complete; the fire watch then runs for ${settings.fire_watch_minutes} minutes.`)
    else if (end > now) blockers.push(`The fire watch runs until ${end.toISOString()}.`)
  }

  return blockers
}

/** Name for a person row from personnel / contractor worker lookups. */
export const personLabel = (
  person: PermitPerson,
  personnel: Map<string, string>,
  workers: Map<string, string>
) => (person.personnel_id ? personnel.get(person.personnel_id) || 'Unknown person' : workers.get(person.contractor_worker_id || '') || 'Unknown contractor worker')

/** Convert a datetime-local value entered in a time zone to an ISO instant. */
export const localDateTimeToIso = (value: string, timeZone: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '')

  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)

  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instant))
      .reduce<Record<string, number>>((acc, part) => (part.type === 'literal' ? acc : { ...acc, [part.type]: Number(part.value) }), {})

    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant
  }

  let instant = guess - offsetAt(guess)

  instant = guess - offsetAt(instant)

  return new Date(instant).toISOString()
}

/** ISO instant to a datetime-local value in a time zone. */
export const isoToLocalDateTime = (iso: string | null | undefined, timeZone: string): string => {
  if (!iso) return ''
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => (part.type === 'literal' ? acc : { ...acc, [part.type]: part.value }), {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
