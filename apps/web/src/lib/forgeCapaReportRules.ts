/**
 * CAPA report rules (port of 1.0 reporting-adapters capa.open / capa.overdue and the corrective_actions
 * section of industrial-performance-report.service). Pure functions only, so they run under
 * `node --experimental-strip-types` in unit tests.
 *
 * Definitions (dates compare as UTC calendar days, like 1.0):
 * - opened: created in the period (canceled CAPAs count: they were raised).
 * - closed: status `closed` with its closed date (closed_at, else completed_at) in the period.
 * - closedOnTime: closed in the period with a due date, closed on or before the due day.
 * - onTimePct: closedOnTime / closed-with-a-due-date (1.0's denominator); null when none.
 * - openNow / overdueNow: point in time. Open is any status except closed and canceled;
 *   overdue is open with a due day before today.
 * - avgDaysToClose: mean of (closed day - created day) over closed in the period; null when none.
 * Archived CAPAs are left out entirely (the loader does not return them), as in 1.0.
 */

const DAY_MS = 86_400_000

const isoDay = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : '')

const dayNumber = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY_MS)

const addDays = (iso: string, days: number) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

const isIsoDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(Date.parse(value + 'T00:00:00Z')).toISOString().slice(0, 10) === value

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

export const CAPA_REPORT_PRESETS = [
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'ytd', label: 'This year' },
  { key: '12m', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom' }
] as const

export type CapaReportPreset = (typeof CAPA_REPORT_PRESETS)[number]['key']

export const DEFAULT_CAPA_REPORT_PRESET: CapaReportPreset = '90d'

export type CapaReportPeriod = { preset: CapaReportPreset; from: string; to: string; label: string }

const presetLabel = (key: CapaReportPreset) => CAPA_REPORT_PRESETS.find(item => item.key === key)!.label

/** Resolves the period from search params; `to` is inclusive. Bad custom dates fall back to the default preset. */
export const resolveCapaReportPeriod = (
  params: { preset?: unknown; from?: unknown; to?: unknown },
  today: string
): CapaReportPeriod => {
  const preset = CAPA_REPORT_PRESETS.some(item => item.key === params.preset) ? (params.preset as CapaReportPreset) : DEFAULT_CAPA_REPORT_PRESET

  if (preset === 'custom') {
    if (isIsoDay(params.from) && isIsoDay(params.to)) {
      const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from]

      return { preset, from, to, label: from + ' to ' + to }
    }

    return resolveCapaReportPeriod({ preset: DEFAULT_CAPA_REPORT_PRESET }, today)
  }

  // Last 12 months runs from the day after the same date a year ago, through today.
  const lastYear = String(Number(today.slice(0, 4)) - 1)
  const yearAgoDay = isIsoDay(lastYear + today.slice(4)) ? lastYear + today.slice(4) : lastYear + '-02-28' // 29 Feb → 28 Feb

  const from =
    preset === '30d'
      ? addDays(today, -29)
      : preset === '90d'
        ? addDays(today, -89)
        : preset === 'ytd'
          ? today.slice(0, 4) + '-01-01'
          : addDays(yearAgoDay, 1)

  return { preset, from, to: today, label: presetLabel(preset) }
}

const inPeriod = (day: string, period: CapaReportPeriod) => Boolean(day) && day >= period.from && day <= period.to

// ---------------------------------------------------------------------------
// Per-CAPA facts
// ---------------------------------------------------------------------------

export type CapaReportRecord = {
  id: string
  action_number: string
  title: string
  status: string
  severity: string | null
  source_type: string | null
  created_at: string
  due_at: string | null
  closed_at: string | null
  completed_at?: string | null
  ownerName: string | null
  locationName: string | null
}

export type CapaReportFacts = {
  createdDay: string
  dueDay: string
  closedDay: string
  isOpen: boolean
  isOverdue: boolean

  /** null when not closed or closed without a due date. */
  onTime: boolean | null
  daysToClose: number | null
}

export const capaReportFacts = (record: CapaReportRecord, today: string): CapaReportFacts => {
  const createdDay = isoDay(record.created_at)
  const dueDay = isoDay(record.due_at)
  const closedDay = record.status === 'closed' ? isoDay(record.closed_at || record.completed_at || null) : ''
  const isOpen = record.status !== 'closed' && record.status !== 'canceled'

  return {
    createdDay,
    dueDay,
    closedDay,
    isOpen,
    isOverdue: isOpen && Boolean(dueDay) && dueDay < today,
    onTime: closedDay && dueDay ? closedDay <= dueDay : null,
    daysToClose: closedDay && createdDay ? Math.max(0, dayNumber(closedDay) - dayNumber(createdDay)) : null
  }
}

/** A CAPA belongs to the report when it was opened or closed in the period, or is open now. */
export const capaInReport = (record: CapaReportRecord, period: CapaReportPeriod, today: string) => {
  const facts = capaReportFacts(record, today)

  return inPeriod(facts.createdDay, period) || inPeriod(facts.closedDay, period) || facts.isOpen
}

// ---------------------------------------------------------------------------
// Metrics and breakdowns
// ---------------------------------------------------------------------------

export type CapaReportMetrics = {
  opened: number
  closed: number
  closedWithDue: number
  closedOnTime: number
  onTimePct: number | null
  openNow: number
  overdueNow: number
  avgDaysToClose: number | null
}

const emptyAccumulator = () => ({ opened: 0, closed: 0, closedWithDue: 0, closedOnTime: 0, openNow: 0, overdueNow: 0, daysTotal: 0 })

type Accumulator = ReturnType<typeof emptyAccumulator>

const accumulate = (acc: Accumulator, facts: CapaReportFacts, period: CapaReportPeriod) => {
  if (inPeriod(facts.createdDay, period)) acc.opened += 1

  if (inPeriod(facts.closedDay, period)) {
    acc.closed += 1
    acc.daysTotal += facts.daysToClose ?? 0

    if (facts.onTime !== null) {
      acc.closedWithDue += 1
      if (facts.onTime) acc.closedOnTime += 1
    }
  }

  if (facts.isOpen) {
    acc.openNow += 1
    if (facts.isOverdue) acc.overdueNow += 1
  }
}

const finish = ({ daysTotal, ...acc }: Accumulator): CapaReportMetrics => ({
  ...acc,
  onTimePct: acc.closedWithDue ? Math.round((acc.closedOnTime / acc.closedWithDue) * 1000) / 10 : null,
  avgDaysToClose: acc.closed ? Math.round((daysTotal / acc.closed) * 10) / 10 : null
})

export const capaReportMetrics = (records: CapaReportRecord[], period: CapaReportPeriod, today: string): CapaReportMetrics => {
  const acc = emptyAccumulator()

  for (const record of records) accumulate(acc, capaReportFacts(record, today), period)

  return finish(acc)
}

export const CAPA_REPORT_BREAKDOWNS = [
  { key: 'owner', label: 'By owner', empty: 'Unassigned' },
  { key: 'location', label: 'By location', empty: 'No location' },
  { key: 'severity', label: 'By severity', empty: 'No severity' },
  { key: 'source', label: 'By source', empty: 'No source' }
] as const

export type CapaReportBreakdownKey = (typeof CAPA_REPORT_BREAKDOWNS)[number]['key']

export type CapaReportBreakdownRow = CapaReportMetrics & { label: string }

export type CapaReportLabels = { status?: Record<string, string>; severity?: Record<string, string> }

export const humanizeKey = (value: string | null | undefined) => {
  const text = String(value ?? '').trim().replace(/[_-]+/g, ' ')

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

const groupLabel = (record: CapaReportRecord, key: CapaReportBreakdownKey, labels: CapaReportLabels) => {
  switch (key) {
    case 'owner':
      return record.ownerName || ''
    case 'location':
      return record.locationName || ''
    case 'severity':
      return record.severity ? labels.severity?.[record.severity] || humanizeKey(record.severity) : ''
    case 'source':
      return humanizeKey(record.source_type)
  }
}

/** One row per group with anything to show, busiest first (open now, then opened), then by name. */
export const capaReportBreakdown = (
  records: CapaReportRecord[],
  key: CapaReportBreakdownKey,
  period: CapaReportPeriod,
  today: string,
  labels: CapaReportLabels = {}
): CapaReportBreakdownRow[] => {
  const empty = CAPA_REPORT_BREAKDOWNS.find(item => item.key === key)!.empty
  const groups = new Map<string, Accumulator>()

  for (const record of records) {
    const label = groupLabel(record, key, labels) || empty
    const acc = groups.get(label) || emptyAccumulator()

    accumulate(acc, capaReportFacts(record, today), period)
    groups.set(label, acc)
  }

  return [...groups.entries()]
    .map(([label, acc]) => ({ label, ...finish(acc) }))
    .filter(row => row.opened || row.closed || row.openNow)
    .sort((a, b) => b.openNow - a.openNow || b.opened - a.opened || a.label.localeCompare(b.label))
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)

  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text

  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

export const CAPA_REPORT_CSV_HEADER = [
  'Number',
  'Title',
  'Status',
  'Severity',
  'Source',
  'Owner',
  'Location',
  'Opened',
  'Due',
  'Closed',
  'On time',
  'Days to close'
]

/** One row per CAPA in the report (see capaInReport), oldest first by number of creation; CRLF line ends. */
export const capaReportCsv = (records: CapaReportRecord[], period: CapaReportPeriod, today: string, labels: CapaReportLabels = {}) => {
  const lines = records
    .filter(record => capaInReport(record, period, today))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.action_number.localeCompare(b.action_number))
    .map(record => {
      const facts = capaReportFacts(record, today)

      return [
        record.action_number,
        record.title,
        labels.status?.[record.status] || humanizeKey(record.status),
        record.severity ? labels.severity?.[record.severity] || humanizeKey(record.severity) : '',
        humanizeKey(record.source_type),
        record.ownerName || '',
        record.locationName || '',
        facts.createdDay,
        facts.dueDay,
        facts.closedDay,
        facts.onTime === null ? '' : facts.onTime ? 'Y' : 'N',
        facts.daysToClose ?? ''
      ]
    })

  return [CAPA_REPORT_CSV_HEADER, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export const capaReportFilename = (period: CapaReportPeriod) => `capa-report-${period.from}-to-${period.to}.csv`

/** Search-param string for a period, for links between the page and the CSV export. */
export const capaReportQuery = (period: CapaReportPeriod) =>
  period.preset === 'custom' ? `preset=custom&from=${period.from}&to=${period.to}` : `preset=${period.preset}`
