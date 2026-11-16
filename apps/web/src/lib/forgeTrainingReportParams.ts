import { trainingTodayIso } from '@/lib/forgeTrainingLms'
import { QC_DAY_OPTIONS, type RecordFilters } from '@/lib/forgeTrainingReports'

/** Query-string parsing shared by the report pages and their CSV route, so both show the same rows. */

const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

type Params = Record<string, string | string[] | undefined>

const one = (params: Params, key: string) => {
  const value = params[key]

  return String(Array.isArray(value) ? value[0] : value || '').trim()
}

export const recordFiltersFrom = (params: Params): RecordFilters => ({
  courseId: UUID.test(one(params, 'course')) ? one(params, 'course') : undefined,
  q: one(params, 'q').slice(0, 100) || undefined,
  from: ISO.test(one(params, 'from')) ? one(params, 'from') : undefined,
  to: ISO.test(one(params, 'to')) ? one(params, 'to') : undefined,
  source: ['manual', 'online', 'kiosk', 'paper'].includes(one(params, 'source')) ? one(params, 'source') : undefined,
  result: ['passed', 'failed', 'completed', 'incomplete'].includes(one(params, 'result')) ? one(params, 'result') : undefined
})

/** Activity period: a month (YYYY-MM) or a year (YYYY), defaulting to this year (1.0's default). */
export const activityPeriodFrom = (params: Params) => {
  const today = trainingTodayIso()
  const year = /^\d{4}$/.test(one(params, 'year')) ? one(params, 'year') : today.slice(0, 4)
  const month = /^(0[1-9]|1[0-2])$/.test(one(params, 'month')) ? one(params, 'month') : ''
  const from = month ? `${year}-${month}-01` : `${year}-01-01`
  const to = month ? new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10) : `${year}-12-31`

  return {
    year,
    month,
    from,
    to,
    locationId: UUID.test(one(params, 'location')) ? one(params, 'location') : undefined,
    groupId: UUID.test(one(params, 'group')) ? one(params, 'group') : undefined
  }
}

export const qcParamsFrom = (params: Params) => {
  const days = Number(one(params, 'days') || 90)

  return {
    courseId: UUID.test(one(params, 'course')) ? one(params, 'course') : undefined,
    days: (QC_DAY_OPTIONS as readonly number[]).includes(days) ? days : 90
  }
}

export const queryString = (params: Params, keys: string[]) => {
  const query = new URLSearchParams()

  for (const key of keys) if (one(params, key)) query.set(key, one(params, key))

  const text = query.toString()

  return text ? '?' + text : ''
}
