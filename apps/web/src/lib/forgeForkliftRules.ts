/**
 * Port slice 19: rules for forklifts (powered industrial trucks, OSHA 1910.178). Pure functions, shared by pages,
 * actions and tests. The database enforces the same rules in its workflow functions
 * (supabase/migrations/20261124100000_s19_forklifts.sql); these give the page the same answer before it asks.
 */

export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// ---------------------------------------------------------------------------
// Trucks
// ---------------------------------------------------------------------------

export const TRUCK_CLASSES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

export type TruckClass = (typeof TRUCK_CLASSES)[number]

/** OSHA / ITA truck classes. */
export const TRUCK_CLASS_INFO: Record<TruckClass, { label: string; description: string }> = {
  I: { label: 'Class I', description: 'Electric motor rider trucks (sit-down and stand-up counterbalance)' },
  II: { label: 'Class II', description: 'Electric motor narrow-aisle trucks (reach, order picker, turret)' },
  III: { label: 'Class III', description: 'Electric motor hand and hand-rider trucks (pallet jacks, walkie stackers)' },
  IV: { label: 'Class IV', description: 'Internal combustion engine trucks, cushion tires' },
  V: { label: 'Class V', description: 'Internal combustion engine trucks, pneumatic tires' },
  VI: { label: 'Class VI', description: 'Electric and internal combustion engine tractors' },
  VII: { label: 'Class VII', description: 'Rough terrain forklifts and telehandlers' }
}

export const isTruckClass = (value: unknown): value is TruckClass => typeof value === 'string' && (TRUCK_CLASSES as readonly string[]).includes(value)

export const TRUCK_TYPES: Record<string, string> = {
  sit_down_counterbalance: 'Sit-down counterbalance',
  stand_up_counterbalance: 'Stand-up counterbalance',
  reach: 'Reach truck',
  order_picker: 'Order picker',
  turret: 'Turret / swing-mast',
  pallet_rider: 'Rider pallet truck',
  pallet_walkie: 'Walkie pallet truck',
  stacker: 'Walkie stacker',
  tow_tractor: 'Tow tractor',
  rough_terrain: 'Rough terrain forklift',
  telehandler: 'Telehandler',
  other: 'Other'
}

/** The class a truck type usually falls in, to pre-fill the form. */
export const TYPICAL_CLASS: Record<string, TruckClass> = {
  sit_down_counterbalance: 'I',
  stand_up_counterbalance: 'I',
  reach: 'II',
  order_picker: 'II',
  turret: 'II',
  pallet_rider: 'III',
  pallet_walkie: 'III',
  stacker: 'III',
  tow_tractor: 'VI',
  rough_terrain: 'VII',
  telehandler: 'VII'
}

export const POWER_SOURCES = ['electric', 'lpg', 'diesel', 'gasoline', 'cng', 'dual_fuel'] as const

export type PowerSource = (typeof POWER_SOURCES)[number]

export const POWER_SOURCE_LABELS: Record<PowerSource, string> = {
  electric: 'Electric (battery)',
  lpg: 'LPG / propane',
  diesel: 'Diesel',
  gasoline: 'Gasoline',
  cng: 'CNG',
  dual_fuel: 'Dual fuel (LPG / gasoline)'
}

export const isPowerSource = (value: unknown): value is PowerSource => typeof value === 'string' && (POWER_SOURCES as readonly string[]).includes(value)

/** Electric classes are I–III; IV and V are internal combustion. VI and VII can be either. */
export const powerClassProblem = (truckClass: string, power: string): string | null => {
  if (['I', 'II', 'III'].includes(truckClass) && power !== 'electric') return `${TRUCK_CLASS_INFO[truckClass as TruckClass].label} trucks are electric.`
  if (['IV', 'V'].includes(truckClass) && power === 'electric') return `${TRUCK_CLASS_INFO[truckClass as TruckClass].label} trucks have an internal combustion engine.`

  return null
}

/** UL 558 / 583 type designations: where a truck may be used (1910.178(c)). */
export const DESIGNATIONS: Record<string, string> = {
  D: 'D: diesel, minimum safeguards',
  DS: 'DS: diesel, extra safeguards to exhaust, fuel and electrical',
  DY: 'DY: diesel, no electrical equipment except ignition, temperature limits',
  E: 'E: electric, minimum safeguards',
  ES: 'ES: electric, extra safeguards against sparks and surface temperatures',
  EE: 'EE: electric, motors and electrical equipment enclosed',
  EX: 'EX: electric, for atmospheres with flammable vapors or dusts',
  G: 'G: gasoline, minimum safeguards',
  GS: 'GS: gasoline, extra safeguards',
  LP: 'LP: LPG, minimum safeguards',
  LPS: 'LPS: LPG, extra safeguards',
  'G/LP': 'G/LP: dual fuel, minimum safeguards',
  'GS/LPS': 'GS/LPS: dual fuel, extra safeguards',
  CN: 'CN: CNG, minimum safeguards',
  CNS: 'CNS: CNG, extra safeguards'
}

export type TruckInput = {
  name?: string
  location_id?: string
  truck_class?: string
  truck_type?: string
  power_source?: string
  rated_capacity_lb?: string | number | null
  load_center_in?: string | number | null
  max_lift_height_in?: string | number | null
  attachments?: string | null
  designation?: string | null
  nameplate_verified_on?: string | null
}

const numberIn = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === '') return { ok: true, value: null as number | null }
  const n = Number(value)

  return Number.isFinite(n) && n >= min && n <= max ? { ok: true, value: n } : { ok: false, value: null }
}

/** Problems with a truck form (empty when it can be saved). Asset fields are checked only when `newAsset`. */
export const truckProblems = (input: TruckInput, { newAsset = true, today = new Date().toISOString().slice(0, 10) } = {}): string[] => {
  const problems: string[] = []

  if (newAsset && !String(input.name || '').trim()) problems.push('Give the forklift a name or unit number.')
  if (newAsset && !isUuid(input.location_id)) problems.push("Choose the forklift's location.")
  if (!isTruckClass(input.truck_class)) problems.push('Choose the truck class.')
  if (!input.truck_type || !(input.truck_type in TRUCK_TYPES)) problems.push('Choose the type of truck.')
  if (!isPowerSource(input.power_source)) problems.push('Choose the power source.')

  if (isTruckClass(input.truck_class) && isPowerSource(input.power_source)) {
    const mismatch = powerClassProblem(input.truck_class, input.power_source)

    if (mismatch) problems.push(mismatch)
  }

  if (!numberIn(input.rated_capacity_lb, 100, 200000).ok) problems.push('Rated capacity must be between 100 and 200,000 lb.')
  if (!numberIn(input.load_center_in, 1, 120).ok) problems.push('Load center must be between 1 and 120 in.')
  if (!numberIn(input.max_lift_height_in, 1, 1500).ok) problems.push('Maximum lift height must be between 1 and 1,500 in.')
  if (input.attachments && input.attachments.length > 500) problems.push('Attachments must be 500 characters or fewer.')
  if (input.nameplate_verified_on && input.nameplate_verified_on > today) problems.push("The nameplate check date can't be in the future.")

  return problems
}

/** A one-line summary: "Class I · Sit-down counterbalance · Electric (battery) · 5,000 lb". */
export const truckSummary = (truck: { truck_class: string; truck_type: string; power_source: string; rated_capacity_lb?: number | null }) =>
  [
    TRUCK_CLASS_INFO[truck.truck_class as TruckClass]?.label || truck.truck_class,
    TRUCK_TYPES[truck.truck_type] || truck.truck_type,
    POWER_SOURCE_LABELS[truck.power_source as PowerSource] || truck.power_source,
    truck.rated_capacity_lb ? `${Number(truck.rated_capacity_lb).toLocaleString('en-US')} lb` : null
  ]
    .filter(Boolean)
    .join(' · ')

/** Attachments are fitted but the nameplate hasn't been checked against them (1910.178(a)(4)). */
export const nameplateWarning = (truck: { attachments?: string | null; nameplate_verified_on?: string | null }) =>
  truck.attachments && truck.attachments.trim() && !truck.nameplate_verified_on
    ? 'Attachments are fitted. Confirm the nameplate shows the capacity with them (1910.178(a)(4)).'
    : null

// ---------------------------------------------------------------------------
// Pre-shift checklist
// ---------------------------------------------------------------------------

export type CheckItem = {
  id: string
  organization_id: string | null
  section: 'visual' | 'operational'
  label: string
  power_sources: string[] | null
  critical: boolean
  allow_na: boolean
  sort_order: number
  archived_at?: string | null
}

export type CheckAnswerValue = 'ok' | 'defect' | 'na'

export type CheckAnswer = { item_id: string; answer: CheckAnswerValue | null | ''; note?: string | null }

export const SECTION_LABELS: Record<string, string> = {
  visual: 'Visual check (engine off)',
  operational: 'Operational check'
}

/** Items that apply to a truck with this power source, in checklist order. */
export const applicableItems = (items: CheckItem[], powerSource: string) =>
  items
    .filter(item => !item.archived_at && (!item.power_sources || item.power_sources.length === 0 || item.power_sources.includes(powerSource)))
    .sort(
      (a, b) =>
        (a.section === 'visual' ? 0 : 1) - (b.section === 'visual' ? 0 : 1) || a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    )

/** The first problem with a set of answers, as the database would report it (null when it can be submitted). */
export const checkAnswersProblem = (items: CheckItem[], answers: CheckAnswer[]): string | null => {
  for (const item of items) {
    const matches = answers.filter(answer => answer.item_id === item.id)

    if (matches.length === 0 || !matches[0].answer) return `Answer every item: "${item.label}" is missing.`
    if (matches.length > 1) return `"${item.label}" is answered more than once.`
    const { answer, note } = matches[0]

    if (!['ok', 'defect', 'na'].includes(answer as string)) return `Answer "${item.label}" OK, defect or N/A.`
    if (answer === 'na' && !item.allow_na) return `"${item.label}" can't be marked N/A.`
    if (answer === 'defect' && !String(note || '').trim()) return `Describe the defect for "${item.label}".`
    if (note && note.trim().length > 1000) return `The note for "${item.label}" is too long.`
  }

  if (answers.some(answer => !items.some(item => item.id === answer.item_id))) return 'The checklist changed. Reload the page and answer it again.'

  return null
}

/** What a set of answers will do: pass / fail, and whether the truck goes out of service. */
export const checkOutcome = (items: CheckItem[], answers: CheckAnswer[], criticalOutOfService = true) => {
  const defects = answers.filter(answer => answer.answer === 'defect')
  const critical = defects.filter(answer => items.find(item => item.id === answer.item_id)?.critical)

  return {
    result: defects.length ? ('fail' as const) : ('pass' as const),
    defects: defects.length,
    criticalDefects: critical.length,
    outOfService: critical.length > 0 && criticalOutOfService
  }
}

/** Whether a truck has a check today, in the company's time zone. Checks are needed before use, at least daily. */
export const checkedToday = (lastCheckAt: string | null | undefined, timeZone: string, now = new Date()) => {
  if (!lastCheckAt) return false
  const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

  return day(new Date(lastCheckAt)) === day(now)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type ForkliftSettings = {
  evaluation_months: number
  require_authorized_operator: boolean
  require_training: boolean
  training_course_id: string | null
  critical_defect_out_of_service: boolean
  expiry_notice_days: number
}

export const DEFAULT_FORKLIFT_SETTINGS: ForkliftSettings = {
  evaluation_months: 36,
  require_authorized_operator: true,
  require_training: true,
  training_course_id: null,
  critical_defect_out_of_service: true,
  expiry_notice_days: 30
}

export const normalizeSettings = (row: Record<string, any> | null | undefined): ForkliftSettings => ({
  evaluation_months: Number(row?.evaluation_months ?? DEFAULT_FORKLIFT_SETTINGS.evaluation_months),
  require_authorized_operator: row?.require_authorized_operator ?? DEFAULT_FORKLIFT_SETTINGS.require_authorized_operator,
  require_training: row?.require_training ?? DEFAULT_FORKLIFT_SETTINGS.require_training,
  training_course_id: row?.training_course_id ?? null,
  critical_defect_out_of_service: row?.critical_defect_out_of_service ?? DEFAULT_FORKLIFT_SETTINGS.critical_defect_out_of_service,
  expiry_notice_days: Number(row?.expiry_notice_days ?? DEFAULT_FORKLIFT_SETTINGS.expiry_notice_days)
})

export const settingsProblems = (input: Partial<ForkliftSettings>): string[] => {
  const problems: string[] = []
  const months = Number(input.evaluation_months)
  const days = Number(input.expiry_notice_days)

  if (!Number.isInteger(months) || months < 6 || months > 36) problems.push('Re-evaluate operators every 6 to 36 months (OSHA requires at least every 3 years).')
  if (!Number.isInteger(days) || days < 1 || days > 120) problems.push('The reminder window must be 1 to 120 days.')
  if (input.training_course_id && !isUuid(input.training_course_id)) problems.push('Choose a training course.')

  return problems
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/** Date-only arithmetic in UTC, so a date never shifts by a day. */
export const addMonths = (isoDate: string, months: number) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(d, lastDay))

  return target.toISOString().slice(0, 10)
}

const utcDay = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)

  return Date.UTC(y, m - 1, d)
}

/** Whole days from one date to another (negative when `toIso` is earlier). */
export const daysBetween = (fromIso: string, toIso: string) => Math.round((utcDay(toIso) - utcDay(fromIso)) / 86400000)

export type AuthorizationInput = {
  personnel_id?: string
  truck_classes?: string[]
  training_completed_on?: string
  evaluated_on?: string
  evaluator_name?: string
  evaluator_personnel_id?: string | null
}

/** Problems with an authorization form (empty when it can be saved). Training completion is checked by the database. */
export const authorizationProblems = (input: AuthorizationInput, settings: ForkliftSettings, today: string): string[] => {
  const problems: string[] = []
  const classes = (input.truck_classes || []).filter(Boolean)

  if (!isUuid(input.personnel_id)) problems.push('Choose the operator.')
  if (!classes.length) problems.push('Choose the truck classes this operator is authorized for.')
  else if (classes.some(value => !isTruckClass(value))) problems.push('Unknown truck class.')
  if (!input.training_completed_on) problems.push('Enter the date training was completed.')
  if (!input.evaluated_on) problems.push('Enter the date of the evaluation.')

  if (input.training_completed_on && input.evaluated_on) {
    if (input.training_completed_on > today || input.evaluated_on > today) problems.push("Training and evaluation dates can't be in the future.")
    else if (input.evaluated_on < input.training_completed_on) problems.push("The evaluation can't be before the training.")
    else if (addMonths(input.evaluated_on, settings.evaluation_months) < today)
      problems.push(`That evaluation is more than ${settings.evaluation_months} months old. Evaluate the operator again.`)
  }

  if (!String(input.evaluator_name || '').trim()) problems.push('Name the person who evaluated the operator.')
  if (input.evaluator_personnel_id && input.evaluator_personnel_id === input.personnel_id) problems.push("Operators can't evaluate themselves.")

  return problems
}

export type OperatorRow = {
  status: 'authorized' | 'suspended' | 'revoked' | string
  truck_classes: string[]
  expires_on: string
  refresher_required: boolean
}

export type Standing = 'authorized' | 'expiring' | 'expired' | 'refresher' | 'suspended' | 'revoked' | 'training' | 'none'

export const STANDING_LABELS: Record<Standing, string> = {
  authorized: 'Authorized',
  expiring: 'Re-evaluation due soon',
  expired: 'Evaluation expired',
  refresher: 'Needs refresher training',
  suspended: 'Suspended',
  revoked: 'Revoked',
  training: 'Training not current',
  none: 'Not authorized'
}

export const standingTone = (standing: Standing): 'default' | 'secondary' | 'destructive' | 'outline' =>
  standing === 'authorized' ? 'default' : standing === 'expiring' ? 'secondary' : standing === 'none' ? 'outline' : 'destructive'

/**
 * An operator's standing today. Mirrors forge_forklift_operator_problem: revoked, suspended, refresher, expired, then
 * training. `trainingCurrent` is false only when the company requires a course and the person has no current completion.
 */
export const operatorStanding = (
  operator: OperatorRow | null | undefined,
  { today, noticeDays = 30, trainingCurrent = true }: { today: string; noticeDays?: number; trainingCurrent?: boolean }
): Standing => {
  if (!operator) return 'none'
  if (operator.status === 'revoked') return 'revoked'
  if (operator.status === 'suspended') return 'suspended'
  if (operator.refresher_required) return 'refresher'
  if (operator.expires_on < today) return 'expired'
  if (!trainingCurrent) return 'training'
  if (daysBetween(today, operator.expires_on) <= noticeDays) return 'expiring'

  return 'authorized'
}

/** Whether a standing lets the person operate (expiring soon still can). */
export const canOperate = (standing: Standing) => standing === 'authorized' || standing === 'expiring'

/** Why this operator can't use a truck of this class (null when they can). */
export const operatorProblemFor = (name: string, operator: OperatorRow | null | undefined, truckClass: string | null, options: { today: string; trainingCurrent?: boolean; courseTitle?: string }) => {
  const standing = operatorStanding(operator, { today: options.today, trainingCurrent: options.trainingCurrent })

  if (standing === 'none') return `${name} is not an authorized forklift operator.`
  if (standing === 'revoked') return `${name}'s forklift authorization was revoked.`
  if (standing === 'suspended') return `${name}'s forklift authorization is suspended.`
  if (standing === 'refresher') return `${name} needs refresher training and a new evaluation before operating.`
  if (standing === 'expired') return `${name}'s forklift evaluation expired on ${formatDate(operator!.expires_on)}.`
  if (truckClass && !operator!.truck_classes.includes(truckClass)) return `${name} is not authorized for Class ${truckClass} trucks.`
  if (standing === 'training') return `${name} has no current ${options.courseTitle || 'forklift'} training.`

  return null
}

/** 1910.178(l)(4)(ii): when refresher training and a new evaluation are required. */
export const REFRESHER_REASONS: Record<string, string> = {
  unsafe_operation: 'Observed operating the truck in an unsafe manner',
  accident: 'Involved in an accident',
  near_miss: 'Involved in a near-miss incident',
  evaluation: 'Evaluation showed the truck is not operated safely',
  different_truck: 'Assigned to a different type of truck',
  workplace_change: 'A change in the workplace affects safe operation'
}

export type OperatorActionName = 'suspend' | 'reinstate' | 'revoke' | 'require_refresher'

/** Which status actions an operator row offers. */
export const operatorActions = (operator: OperatorRow): OperatorActionName[] => {
  if (operator.status === 'revoked') return []
  const actions: OperatorActionName[] = []

  if (operator.status === 'authorized') actions.push('suspend')
  if (operator.status === 'suspended') actions.push('reinstate')
  if (!operator.refresher_required) actions.push('require_refresher')
  actions.push('revoke')

  return actions
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)

  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export const DEFECT_STATUS_LABELS: Record<string, string> = { open: 'Open', repaired: 'Repaired', not_a_defect: 'Not a defect' }
