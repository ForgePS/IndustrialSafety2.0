/**
 * Home dashboard rules (port of 1.0 industrial-dashboard, dashboard-layout and dashboard-insights).
 * Pure functions only, so they run under `node --experimental-strip-types` in unit tests.
 */

const DAY_MS = 86_400_000

const isoDay = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : '')

export const addDaysIso = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Blocks and per-user layout
// ---------------------------------------------------------------------------

export const DASHBOARD_SIZES = ['compact', 'medium', 'wide', 'large', 'full'] as const

export type DashboardSize = (typeof DASHBOARD_SIZES)[number]

export const DASHBOARD_SIZE_LABELS: Record<DashboardSize, string> = {
  compact: 'Compact',
  medium: 'Medium',
  wide: 'Wide',
  large: 'Large',
  full: 'Full width'
}

export const DASHBOARD_BLOCK_IDS = [
  'attention',
  'tasks-due',
  'safety-index',
  'incident-trend',
  'injury-history',
  'task-scheduler',
  'inspections-by-site',
  'body-map',
  'workspace'
] as const

export type DashboardBlockId = (typeof DASHBOARD_BLOCK_IDS)[number]

export type DashboardBlockDefinition = {
  id: DashboardBlockId
  label: string
  description: string
  sizes: readonly DashboardSize[]
  defaultSize: DashboardSize
}

/** In default order. 1.0's calendar events and reminders blocks are left out: 2.0 has no calendar or reminders module. */
export const DASHBOARD_BLOCKS: readonly DashboardBlockDefinition[] = [
  { id: 'attention', label: 'What Needs Your Attention', description: 'Open work across your modules, with quick actions.', sizes: ['wide', 'large', 'full'], defaultSize: 'full' },
  { id: 'tasks-due', label: 'Tasks Due', description: 'Your open tasks, overdue first.', sizes: ['compact', 'medium', 'wide', 'large'], defaultSize: 'medium' },
  { id: 'safety-index', label: 'Safety Index', description: 'A 0–100 score and grade from incidents, inspections and training.', sizes: ['compact', 'medium', 'wide'], defaultSize: 'medium' },
  { id: 'task-scheduler', label: 'Task Scheduler', description: 'Tasks by status and what is due this week.', sizes: ['medium', 'wide', 'large', 'full'], defaultSize: 'medium' },
  { id: 'incident-trend', label: 'Incident Trend', description: 'Incidents per month for the last 12 months.', sizes: ['medium', 'wide', 'large', 'full'], defaultSize: 'wide' },
  { id: 'injury-history', label: 'Injury History', description: 'Injuries and OSHA recordables by year.', sizes: ['medium', 'wide', 'large', 'full'], defaultSize: 'wide' },
  { id: 'inspections-by-site', label: 'Inspections by Location', description: 'Inspections per location in the last 12 months.', sizes: ['medium', 'wide', 'large', 'full'], defaultSize: 'full' },
  { id: 'body-map', label: 'Injury Body Map', description: 'Where on the body injuries happen.', sizes: ['medium', 'wide', 'large', 'full'], defaultSize: 'full' },
  { id: 'workspace', label: 'My Workspace', description: 'Your modules.', sizes: ['wide', 'large', 'full'], defaultSize: 'full' }
]

export const blockDefinition = (id: DashboardBlockId) => DASHBOARD_BLOCKS.find(block => block.id === id) as DashboardBlockDefinition

export type DashboardLayoutItem = { id: DashboardBlockId; visible: boolean; size: DashboardSize }

export type DashboardLayout = { items: DashboardLayoutItem[]; pinnedModules: string[] | null }

export const defaultDashboardLayout = (): DashboardLayout => ({
  items: DASHBOARD_BLOCKS.map(block => ({ id: block.id, visible: true, size: block.defaultSize })),
  pinnedModules: null
})

const isBlockId = (value: unknown): value is DashboardBlockId => typeof value === 'string' && (DASHBOARD_BLOCK_IDS as readonly string[]).includes(value)
const isSize = (value: unknown): value is DashboardSize => typeof value === 'string' && (DASHBOARD_SIZES as readonly string[]).includes(value)

/**
 * Cleans a saved layout: unknown blocks dropped, duplicates removed, sizes clamped to what each block
 * allows, and blocks added since the layout was saved placed where they sit by default (1.0 insertAfter).
 */
export const normalizeDashboardLayout = (raw: unknown): DashboardLayout => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const savedItems = Array.isArray(source.items) ? source.items : []
  const seen = new Set<DashboardBlockId>()
  const items: DashboardLayoutItem[] = []

  for (const entry of savedItems) {
    const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}

    if (!isBlockId(item.id) || seen.has(item.id)) continue

    const definition = blockDefinition(item.id)
    const size = isSize(item.size) && definition.sizes.includes(item.size) ? item.size : definition.defaultSize

    seen.add(item.id)
    items.push({ id: item.id, visible: item.visible !== false, size })
  }

  DASHBOARD_BLOCKS.forEach((block, index) => {
    if (seen.has(block.id)) return

    // Place after the nearest earlier default block that is already in the list.
    const before = DASHBOARD_BLOCKS.slice(0, index).map(item => item.id).reverse().find(id => seen.has(id))
    const at = before ? items.findIndex(item => item.id === before) + 1 : 0

    items.splice(at, 0, { id: block.id, visible: true, size: block.defaultSize })
    seen.add(block.id)
  })

  const pinned = Array.isArray(source.pinnedModules) ? [...new Set(source.pinnedModules.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length <= 120))] : null

  return { items, pinnedModules: pinned }
}

/** Grid classes on a 12-column grid: phones stack, tablets pair the small blocks. */
export const DASHBOARD_SIZE_CLASSES: Record<DashboardSize, string> = {
  compact: 'col-span-12 md:col-span-6 xl:col-span-3',
  medium: 'col-span-12 md:col-span-6 xl:col-span-4',
  wide: 'col-span-12 xl:col-span-6',
  large: 'col-span-12 xl:col-span-8',
  full: 'col-span-12'
}

/** Workspace modules in pinned order; with nothing pinned (or every pin gone), all modules. */
export const resolvePinnedModules = <T extends { key: string }>(modules: T[], pinned: string[] | null) => {
  if (!pinned) return modules

  const byKey = new Map(modules.map(item => [item.key, item]))
  const chosen = pinned.map(key => byKey.get(key)).filter((item): item is T => Boolean(item))

  return chosen.length ? chosen : modules
}

// ---------------------------------------------------------------------------
// Safety index (1.0 computeSafetyIndex / safetyGrade)
// ---------------------------------------------------------------------------

export type SafetyGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export const safetyGrade = (score: number): SafetyGrade => (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F')

/**
 * 1.0's formula, unchanged: starts at 100, loses 4 per open incident (at most 24), blends in the share of
 * incidents closed, and credits inspection and training activity in the period.
 */
export const computeSafetyIndex = ({
  openIncidents,
  totalIncidents,
  inspectionCount,
  trainingCount,
  enterpriseOpenHint = 0
}: {
  openIncidents: number
  totalIncidents: number
  inspectionCount: number
  trainingCount: number
  enterpriseOpenHint?: number
}) => {
  let score = 100

  score -= Math.min(openIncidents * 4, 24)
  if (totalIncidents > 0) score = score * 0.6 + (1 - openIncidents / totalIncidents) * 100 * 0.4
  if (inspectionCount > 0) score = score * 0.85 + 100 * 0.15
  if (trainingCount > 0) score = score * 0.92 + 100 * 0.08
  if (enterpriseOpenHint > 0) score -= Math.min(enterpriseOpenHint * 2, 12)

  return Math.round(Math.min(Math.max(score, 0), 100))
}

export const SAFETY_PERIODS = { '6m': { label: 'Last 6 months', days: 182 }, '1y': { label: 'Last 12 months', days: 365 } } as const

export type SafetyPeriod = keyof typeof SAFETY_PERIODS

// ---------------------------------------------------------------------------
// Trends and aggregations
// ---------------------------------------------------------------------------

/** The last `count` months ending with the month of `todayIso`, oldest first, as YYYY-MM. */
export const lastMonths = (todayIso: string, count = 12) => {
  const year = Number(todayIso.slice(0, 4))
  const month = Number(todayIso.slice(5, 7)) - 1

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - (count - 1 - index), 1))

    return date.toISOString().slice(0, 7)
  })
}

export const monthLabel = (month: string) => new Date(month + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export type TrendIncident = { occurred_at: string; involves_injury?: boolean | null; incident_type?: string | null; status?: string | null }

/** Incidents per month, split into injuries and other incidents. Drafts are not counted. */
export const incidentTrend = (incidents: TrendIncident[], todayIso: string, count = 12) => {
  const months = lastMonths(todayIso, count)
  const buckets = new Map(months.map(month => [month, { month, label: monthLabel(month), injuries: 0, other: 0, total: 0 }]))

  for (const incident of incidents) {
    if (incident.status === 'draft') continue

    const bucket = buckets.get(isoDay(incident.occurred_at).slice(0, 7))

    if (!bucket) continue

    const injury = Boolean(incident.involves_injury) || incident.incident_type === 'injury'

    if (injury) bucket.injuries += 1
    else bucket.other += 1
    bucket.total += 1
  }

  return [...buckets.values()]
}

export type HistoryOshaCase = {
  injury_date: string
  status: string
  recordability?: string | null
  case_outcome?: string | null
  days_away?: number | null
  restricted_days?: number | null
}

/** Per year, newest first: injury incidents, OSHA recordables (recordable and not voided), DART cases and days away. */
export const injuryHistory = ({ incidents, oshaCases, todayIso, years = 5 }: { incidents: TrendIncident[]; oshaCases: HistoryOshaCase[] | null; todayIso: string; years?: number }) => {
  const current = Number(todayIso.slice(0, 4))

  const rows = Array.from({ length: years }, (_, index) => ({
    year: current - index,
    injuries: 0,
    recordables: oshaCases ? 0 : null as number | null,
    dart: oshaCases ? 0 : null as number | null,
    daysAway: oshaCases ? 0 : null as number | null
  }))

  const byYear = new Map(rows.map(row => [row.year, row]))

  for (const incident of incidents) {
    if (incident.status === 'draft' || !(incident.involves_injury || incident.incident_type === 'injury')) continue

    const row = byYear.get(Number(isoDay(incident.occurred_at).slice(0, 4)))

    if (row) row.injuries += 1
  }

  for (const item of oshaCases || []) {
    if (item.status === 'voided' || (item.recordability && item.recordability !== 'recordable')) continue

    const row = byYear.get(Number(isoDay(item.injury_date).slice(0, 4)))

    if (!row) continue

    row.recordables = (row.recordables || 0) + 1


    // DART: days away, restricted or job transfer (OSHA columns H and I).
    if (item.case_outcome === 'days_away' || item.case_outcome === 'job_transfer_restriction' || Number(item.days_away || 0) > 0 || Number(item.restricted_days || 0) > 0) {
      row.dart = (row.dart || 0) + 1
    }

    row.daysAway = (row.daysAway || 0) + Number(item.days_away || 0)
  }

  return rows
}

/** Counts per label, largest first; blank labels become `fallback`. */
export const countByLabel = (labels: Array<string | null | undefined>, fallback = 'No location') => {
  const counts = new Map<string, number>()

  for (const label of labels) {
    const key = label && label.trim() ? label.trim() : fallback

    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

const OPEN_TASK_STATUSES = ['open', 'in_progress', 'blocked']

export type SchedulerTask = { id: string; title: string; status: string; due_at: string | null; priority?: string | null }

/** Task scheduler: counts by status, and open tasks overdue, due this week and later. */
export const taskSchedule = (tasks: SchedulerTask[], todayIso: string) => {
  const weekEnd = addDaysIso(todayIso, 7)
  const open = tasks.filter(task => OPEN_TASK_STATUSES.includes(task.status))
  const due = (task: SchedulerTask) => isoDay(task.due_at)

  return {
    byStatus: {
      open: tasks.filter(task => task.status === 'open').length,
      in_progress: tasks.filter(task => task.status === 'in_progress').length,
      blocked: tasks.filter(task => task.status === 'blocked').length,
      completed: tasks.filter(task => task.status === 'completed').length
    },
    overdue: open.filter(task => due(task) && due(task) < todayIso).length,
    dueThisWeek: open.filter(task => due(task) && due(task) >= todayIso && due(task) <= weekEnd).length,
    later: open.filter(task => due(task) && due(task) > weekEnd).length,
    noDueDate: open.filter(task => !due(task)).length
  }
}

/** Open tasks, overdue first then soonest due; tasks without a due date last. */
export const tasksDue = <T extends SchedulerTask>(tasks: T[], todayIso: string, limit = 8) =>
  tasks
    .filter(task => OPEN_TASK_STATUSES.includes(task.status))
    .map(task => ({ ...task, overdue: Boolean(isoDay(task.due_at) && isoDay(task.due_at) < todayIso) }))
    .sort((a, b) => {
      const da = isoDay(a.due_at)
      const db = isoDay(b.due_at)

      if (!da || !db) return da === db ? a.title.localeCompare(b.title) : da ? -1 : 1

      return da.localeCompare(db)
    })
    .slice(0, limit)

export type ExpiryCompletion = { personnel_id: string; course_id: string; completed_at: string; expires_at: string | null; result?: string | null; approval_status?: string | null }

/**
 * Certifications that need renewing: for each person and course, only the newest passing record counts
 * (an older one replaced by a newer completion is not "expiring"). Expiring = within `days`.
 */
export const trainingRenewals = (completions: ExpiryCompletion[], todayIso: string, days = 30) => {
  const newest = new Map<string, ExpiryCompletion>()

  for (const row of completions) {
    if (row.approval_status && row.approval_status !== 'approved') continue
    if (row.result && !['passed', 'completed'].includes(row.result)) continue

    const key = row.personnel_id + ':' + row.course_id
    const before = newest.get(key)

    if (!before || row.completed_at > before.completed_at) newest.set(key, row)
  }

  const limit = addDaysIso(todayIso, days)
  let expiring = 0
  let expired = 0

  for (const row of newest.values()) {
    const expires = isoDay(row.expires_at)

    if (!expires) continue
    if (expires < todayIso) expired += 1
    else if (expires <= limit) expiring += 1
  }

  return { expiring, expired }
}

export type AttentionTone = 'danger' | 'warning' | 'info' | 'primary' | 'muted'

export type AttentionItem = { key: string; label: string; count: number; detail?: string; href: string; tone: AttentionTone }

/** Attention items with something to do first (by tone, then count), then the clear ones. */
export const sortAttention = (items: AttentionItem[]) => {
  const rank: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2, primary: 3, muted: 4 }

  return [...items].sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || rank[a.tone] - rank[b.tone] || b.count - a.count)
}
