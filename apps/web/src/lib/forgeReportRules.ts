/**
 * Port slice 13: Reporting. Pure rules shared by the report runner, the pages, the exports and the schedule
 * job. No server imports, so they run under `node --experimental-strip-types` in unit tests.
 *
 * A report is a list of flat rows from one module's scoped loader (forgeReportCatalog.ts). These rules turn the
 * person's choices (period, location, status, group by) into the rows they see, the same way for the screen,
 * the CSV and the PDF. Filtering happens on the whole scoped list, never on a capped page of it, so results
 * are not cut short the way 1.0's were (it applied its row limit before filtering).
 */

export type ReportColumnType = 'text' | 'date' | 'datetime' | 'number' | 'boolean'

export type ReportColumn = {
  key: string
  label: string
  type: ReportColumnType

  /**
   * Needs this permission besides the report's own (e.g. personnel.view_sensitive). Without it the column is
   * left out of the screen, the exports and the column picker.
   */
  sensitivePermission?: string
}

export type ReportCell = string | number | boolean | null

export type ReportRow = Record<string, ReportCell>

/** What the loader gives back for each record: the cells, plus the facts the filters need. */
export type ReportRecord = {
  cells: ReportRow

  /** The day the period filter compares (YYYY-MM-DD), or null when the record has none. */
  day: string | null
  locationId: string | null
  status: string | null
}

export type ReportGroupKey = { key: string; label: string }

export type ReportDefinitionMeta = {
  key: string
  name: string
  description: string
  module: string
  permission: string
  columns: ReportColumn[]

  /** Label for the date the period applies to; absent when the report is a point-in-time list. */
  dateLabel?: string
  defaultPreset: ReportPreset
  statuses?: { key: string; label: string }[]
  groupable: string[]

  /** Reports that ask for a calendar year instead of a period (OSHA logs). */
  usesYear?: boolean
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

export const isIsoDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
  new Date(Date.parse(value + 'T00:00:00Z')).toISOString().slice(0, 10) === value

export const isoDay = (value: unknown) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null)

export const addDays = (iso: string, days: number) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS)

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

export const REPORT_PRESETS = [
  { key: 'all', label: 'All dates' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '12m', label: 'Last 12 months' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'ytd', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'custom', label: 'Custom' }
] as const

export type ReportPreset = (typeof REPORT_PRESETS)[number]['key']

export type ReportPeriod = { preset: ReportPreset; from: string | null; to: string | null; label: string }

const isPreset = (value: unknown): value is ReportPreset => REPORT_PRESETS.some(item => item.key === value)

const presetLabel = (key: ReportPreset) => REPORT_PRESETS.find(item => item.key === key)!.label

/** The period for a preset, relative to today. `to` is inclusive. Bad custom dates fall back to the default. */
export const resolveReportPeriod = (
  params: { preset?: unknown; from?: unknown; to?: unknown },
  today: string,
  fallback: ReportPreset = 'all'
): ReportPeriod => {
  const preset = isPreset(params.preset) ? params.preset : fallback
  const [year, month] = today.split('-').map(Number)
  const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)

  switch (preset) {
    case 'all':
      return { preset, from: null, to: null, label: presetLabel(preset) }
    case '30d':
      return { preset, from: addDays(today, -29), to: today, label: presetLabel(preset) }
    case '90d':
      return { preset, from: addDays(today, -89), to: today, label: presetLabel(preset) }
    case '12m':
      return { preset, from: addDays(today, -364), to: today, label: presetLabel(preset) }
    case 'this_month':
      return { preset, from: monthStart(year, month), to: today, label: presetLabel(preset) }
    case 'last_month':
      return { preset, from: monthStart(year, month - 1), to: addDays(monthStart(year, month), -1), label: presetLabel(preset) }
    case 'ytd':
      return { preset, from: `${year}-01-01`, to: today, label: presetLabel(preset) }
    case 'last_year':
      return { preset, from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: presetLabel(preset) }

    case 'custom': {
      const from = isIsoDay(params.from) ? params.from : null
      const to = isIsoDay(params.to) ? params.to : null

      if (!from && !to) return resolveReportPeriod({ preset: fallback === 'custom' ? 'all' : fallback }, today, 'all')

      const [start, end] = from && to && from > to ? [to, from] : [from, to]

      return { preset, from: start, to: end, label: start && end ? `${start} to ${end}` : start ? `From ${start}` : `Up to ${end}` }
    }
  }
}

export const inPeriod = (day: string | null, period: ReportPeriod) => {
  if (!period.from && !period.to) return true
  if (!day) return false

  return (!period.from || day >= period.from) && (!period.to || day <= period.to)
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

/** What a person picks for a run. Saved reports store exactly this. */
export type ReportParams = {
  preset?: ReportPreset
  from?: string
  to?: string
  year?: number
  locationId?: string
  status?: string
  groupBy?: string

  /** Columns to show, in order. Empty or missing means all the columns the person may see. */
  columns?: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RawParams = Record<string, unknown>

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value)

/**
 * Cleans parameters from a URL, a form or a saved report against the report's definition. Anything unknown is
 * dropped rather than trusted: a status the report doesn't have, a column it doesn't have, a malformed date.
 */
export const cleanReportParams = (raw: RawParams, meta: Pick<ReportDefinitionMeta, 'columns' | 'statuses' | 'groupable' | 'usesYear'>, today: string): ReportParams => {
  const params: ReportParams = {}
  const preset = first(raw.preset)

  if (isPreset(preset)) params.preset = preset

  const from = first(raw.from)
  const to = first(raw.to)

  // A date typed in means a custom range, whatever the period list says.
  if (isIsoDay(from) || isIsoDay(to)) {
    params.preset = 'custom'
    if (isIsoDay(from)) params.from = from
    if (isIsoDay(to)) params.to = to
  } else if (params.preset === 'custom') {
    delete params.preset
  }

  if (meta.usesYear) {
    const year = Number(first(raw.year))
    const current = Number(today.slice(0, 4))

    if (Number.isInteger(year) && year >= 2000 && year <= current + 1) params.year = year
  }

  const locationId = first(raw.locationId)

  if (typeof locationId === 'string' && UUID_RE.test(locationId)) params.locationId = locationId.toLowerCase()

  const status = first(raw.status)

  if (typeof status === 'string' && meta.statuses?.some(item => item.key === status)) params.status = status

  const groupBy = first(raw.groupBy)

  if (typeof groupBy === 'string' && meta.groupable.includes(groupBy)) params.groupBy = groupBy

  const rawColumns = Array.isArray(raw.columns) ? raw.columns : typeof raw.columns === 'string' ? raw.columns.split(',') : []
  const known = new Set(meta.columns.map(column => column.key))
  const columns = [...new Set(rawColumns.map(String).map(value => value.trim()).filter(value => known.has(value)))]

  if (columns.length) params.columns = columns

  return params
}

/** Parameters as URL search params (for links, the export URLs and saved-report runs). */
export const reportParamsQuery = (params: ReportParams) => {
  const query = new URLSearchParams()

  if (params.preset) query.set('preset', params.preset)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.year) query.set('year', String(params.year))
  if (params.locationId) query.set('locationId', params.locationId)
  if (params.status) query.set('status', params.status)
  if (params.groupBy) query.set('groupBy', params.groupBy)
  if (params.columns?.length) query.set('columns', params.columns.join(','))

  return query.toString()
}

// ---------------------------------------------------------------------------
// Columns the person may see
// ---------------------------------------------------------------------------

/** The report's columns minus the sensitive ones the person lacks permission for. */
export const visibleColumns = (columns: ReportColumn[], allowed: (permissionKey: string) => boolean) =>
  columns.filter(column => !column.sensitivePermission || allowed(column.sensitivePermission))

/** The columns to show: the person's pick (in their order) within what they may see, else all of those. */
export const chosenColumns = (visible: ReportColumn[], picked: string[] | undefined) => {
  if (!picked?.length) return visible

  const byKey = new Map(visible.map(column => [column.key, column]))
  const chosen = picked.map(key => byKey.get(key)).filter((column): column is ReportColumn => Boolean(column))

  return chosen.length ? chosen : visible
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export type ReportGroupRow = { label: string; count: number; totals: Record<string, number> }

export type ReportResult = {
  period: ReportPeriod
  columns: ReportColumn[]
  rows: ReportRow[]
  total: number
  groupBy: ReportColumn | null
  groups: ReportGroupRow[]
}

const compareCells = (a: ReportCell, b: ReportCell) => {
  if (a === b) return 0
  if (a === null || a === '') return 1
  if (b === null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b

  return String(a).localeCompare(String(b))
}

/**
 * Filters records by the person's choices and shapes the result. Sensitive columns the person lacks are
 * already gone from `visible`, and are stripped from every row here, so nothing downstream can leak them.
 */
export const runReportRules = ({
  records,
  meta,
  params,
  visible,
  today
}: {
  records: ReportRecord[]
  meta: Pick<ReportDefinitionMeta, 'defaultPreset' | 'dateLabel'>
  params: ReportParams
  visible: ReportColumn[]
  today: string
}): ReportResult => {
  const period = meta.dateLabel ? resolveReportPeriod(params, today, meta.defaultPreset) : resolveReportPeriod({ preset: 'all' }, today)
  const columns = chosenColumns(visible, params.columns)

  const kept = records.filter(
    record =>
      inPeriod(record.day, period) &&
      (!params.locationId || record.locationId === params.locationId) &&
      (!params.status || record.status === params.status)
  )

  const rows = kept.map(record => Object.fromEntries(columns.map(column => [column.key, record.cells[column.key] ?? null])) as ReportRow)
  const groupBy = params.groupBy ? visible.find(column => column.key === params.groupBy) || null : null
  const groups: ReportGroupRow[] = []

  if (groupBy) {
    const numeric = visible.filter(column => column.type === 'number')
    const byLabel = new Map<string, ReportGroupRow>()

    for (const record of kept) {
      const label = formatCell(record.cells[groupBy.key] ?? null, groupBy.type) || '(none)'
      const group = byLabel.get(label) || { label, count: 0, totals: Object.fromEntries(numeric.map(column => [column.key, 0])) }

      group.count += 1

      for (const column of numeric) {
        const value = record.cells[column.key]

        if (typeof value === 'number' && Number.isFinite(value)) group.totals[column.key] += value
      }

      byLabel.set(label, group)
    }

    groups.push(...[...byLabel.values()].sort((a, b) => b.count - a.count || compareCells(a.label, b.label)))
  }

  return { period, columns, rows, total: kept.length, groupBy, groups }
}

// ---------------------------------------------------------------------------
// Formatting and CSV
// ---------------------------------------------------------------------------

export const humanizeKey = (value: string | null | undefined) => {
  const text = String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/** How a cell reads on screen, in the PDF and in a group label. */
export const formatCell = (value: ReportCell, type: ReportColumnType) => {
  if (value === null || value === undefined || value === '') return ''

  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'date':
      return String(value).slice(0, 10)
    case 'datetime':
      return String(value).slice(0, 16).replace('T', ' ')
    case 'number':
      return typeof value === 'number' ? String(value) : String(value)
    default:
      return String(value)
  }
}

export const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)

  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text

  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

/** The rows as CSV (or the group counts, when grouped), CRLF line endings, with a byte-order mark for Excel. */
export const reportCsv = (result: ReportResult) => {
  const lines: string[] = []

  if (result.groupBy) {
    const numeric = Object.keys(result.groups[0]?.totals || {})
    const labels = new Map(result.columns.map(column => [column.key, column.label]))

    lines.push([result.groupBy.label, 'Count', ...numeric.map(key => 'Total ' + (labels.get(key) || key).toLowerCase())].map(csvCell).join(','))

    for (const group of result.groups) lines.push([group.label, group.count, ...numeric.map(key => group.totals[key])].map(csvCell).join(','))
  } else {
    lines.push(result.columns.map(column => csvCell(column.label)).join(','))

    for (const row of result.rows) lines.push(result.columns.map(column => csvCell(formatCell(row[column.key], column.type))).join(','))
  }

  return '﻿' + lines.join('\r\n') + '\r\n'
}

export const reportFilename = (key: string, period: ReportPeriod, extension: 'csv' | 'pdf', today: string) => {
  const span = period.from || period.to ? `${period.from || 'start'}-to-${period.to || today}` : today

  return `${key.replace(/[^a-z0-9]+/gi, '-')}-${span}.${extension}`.toLowerCase()
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export const SCHEDULE_FREQUENCIES = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'monthly', label: 'Every month' }
] as const

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number]['key']

export type ScheduleTiming = {
  frequency: ScheduleFrequency
  hour: number

  /** 0 = Sunday. Weekly only. */
  weekday: number

  /** 1-28, so every month has the day. Monthly only. */
  monthday: number
  timezone: string
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const isTimezone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value || value.length > 64) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })

    return true
  } catch {
    return false
  }
}

/** Wall-clock parts of an instant in a timezone. */
const zonedParts = (instant: Date, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>

  return parts
}

/** The instant a wall-clock time happens in a timezone (DST gaps move forward, overlaps take the first). */
export const zonedTimeToUtc = (year: number, month: number, day: number, hour: number, timezone: string) => {
  const wall = Date.UTC(year, month - 1, day, hour)
  let guess = wall

  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(guess), timezone)
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const next = guess + (wall - seen)

    if (next === guess) break
    guess = next
  }

  return new Date(guess)
}

/** The next run strictly after `after`, at the schedule's hour in its own timezone. */
export const nextScheduleRun = (timing: ScheduleTiming, after: Date) => {
  const local = zonedParts(after, timing.timezone)
  const start = Date.UTC(local.year, local.month - 1, local.day)

  for (let offset = 0; offset <= 62; offset += 1) {
    const date = new Date(start + offset * DAY_MS)
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]

    if (timing.frequency === 'weekly' && date.getUTCDay() !== timing.weekday) continue
    if (timing.frequency === 'monthly' && d !== timing.monthday) continue

    const run = zonedTimeToUtc(y, m, d, timing.hour, timing.timezone)

    if (run.getTime() > after.getTime()) return run
  }

  throw new Error('No next run found for the schedule.')
}

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12

  return `${twelve}:00 ${suffix}`
}

export const describeSchedule = (timing: ScheduleTiming) => {
  const at = `${hourLabel(timing.hour)} (${timing.timezone})`

  switch (timing.frequency) {
    case 'daily':
      return `Every day at ${at}`
    case 'weekly':
      return `Every ${WEEKDAYS[timing.weekday]} at ${at}`
    case 'monthly':
      return `On day ${timing.monthday} of every month at ${at}`
  }
}

/** Cleans a schedule form. Returns an error message instead of a schedule when something is off. */
export const cleanScheduleTiming = (raw: RawParams): ScheduleTiming | { error: string } => {
  const frequency = first(raw.frequency)

  if (!SCHEDULE_FREQUENCIES.some(item => item.key === frequency)) return { error: 'Pick how often to send it.' }

  const hour = Number(first(raw.hour))

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: 'Pick the hour to send it.' }

  const weekday = Number(first(raw.weekday) ?? 1)
  const monthday = Number(first(raw.monthday) ?? 1)

  if (frequency === 'weekly' && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) return { error: 'Pick the day of the week.' }
  if (frequency === 'monthly' && (!Number.isInteger(monthday) || monthday < 1 || monthday > 28)) return { error: 'Pick a day of the month from 1 to 28.' }

  const timezone = first(raw.timezone)

  if (!isTimezone(timezone)) return { error: 'Pick a valid time zone.' }

  return {
    frequency: frequency as ScheduleFrequency,
    hour,
    weekday: frequency === 'weekly' ? weekday : 1,
    monthday: frequency === 'monthly' ? monthday : 1,
    timezone
  }
}
