import { createServiceRoleClient } from '@repo/supabase/server'

import {
  BODY_MAP_PERIODS,
  bodyMapWindowStart,
  bodyRegionsFromText,
  extractBodyLocationsFromPayload,
  mergeBodyMapInjuries,
  summarizeBodyMap,
  type BodyMapPeriod,
  type BodyMapSource,
  type BodyMapSourceRow,
  type BodyMapSummary
} from '@/lib/forgeBodyMapRules'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedOshaCases } from '@/lib/forgeOsha'
import { getScopedWcCases } from '@/lib/forgeWorkersComp'

/**
 * Injury body map loader (port of 1.0's dashboard body map, sourced from 2.0 records).
 *
 * Sources, each only when the viewer holds that module's view permission, through the module's own scoped loader:
 * - workers' comp cases (workers_comp.view): forge_wc_cases.body_parts (free text), archived cases excluded;
 * - OSHA cases (osha.view): injury_or_illness + injury_description (Form 301 / 300 free text), voided excluded;
 * - incidents (incidents.view): body-part keys in forge_incidents.custom_data (1.0 payload keys), drafts excluded.
 * Each injury counts once: see mergeBodyMapInjuries in forgeBodyMapRules.ts.
 * Labels carry case / incident numbers only, never employee names (OSHA privacy cases).
 */

export type BodyMapAccess = { effective: EffectivePermission[] }

export type BodyMapData = BodyMapSummary & { sources: BodyMapSource[] }

/** What BodyMapCard takes: every period, built from one fetch. */
export type BodyMapCardData = { sources: BodyMapSource[]; periods: Record<BodyMapPeriod, BodyMapSummary> }

const SOURCE_PERMISSIONS: Record<BodyMapSource, string> = {
  workers_comp: 'workers_comp.view',
  osha: 'osha.view',
  incident: 'incidents.view'
}

const allowedPermission = (access: BodyMapAccess, key: string) => {
  const permission = access.effective.find(item => item.permissionKey === key)

  return permission?.allowed ? permission : null
}

const isoDate = (value: unknown) => (typeof value === 'string' ? value.slice(0, 10) : '')

/** Distinct OSHA calendar years to read: from the window start (or the oldest case) to this year. */
const oshaYears = async (organizationId: string, since: string | null, now: Date) => {
  const current = now.getUTCFullYear()
  let first = since ? Number(since.slice(0, 4)) : current

  if (!since) {
    const supabase = createServiceRoleClient() as any

    const { data, error } = await supabase
      .from('forge_osha_cases')
      .select('calendar_year')
      .eq('organization_id', organizationId)
      .order('calendar_year', { ascending: true })
      .limit(1)

    if (error) throw new Error(`Unable to load OSHA case years: ${error.message}`)

    first = Number(data?.[0]?.calendar_year) || current
  }

  const years: number[] = []

  for (let year = Math.max(first, current - 50); year <= current; year += 1) years.push(year)

  return years
}

const loadSourceRows = async ({
  organizationId,
  userId,
  access,
  months,
  now
}: {
  organizationId: string
  userId: string
  access: BodyMapAccess
  months: number | null
  now: Date
}) => {
  const since = bodyMapWindowStart(months, now)
  const inWindow = (date: string) => Boolean(date) && (!since || date >= since)

  const wcPermission = allowedPermission(access, SOURCE_PERMISSIONS.workers_comp)
  const oshaPermission = allowedPermission(access, SOURCE_PERMISSIONS.osha)
  const incidentPermission = allowedPermission(access, SOURCE_PERMISSIONS.incident)

  const sources: BodyMapSource[] = []

  if (wcPermission) sources.push('workers_comp')
  if (oshaPermission) sources.push('osha')
  if (incidentPermission) sources.push('incident')

  if (!sources.length) return null

  const [wcRows, oshaRows, incidentRows] = await Promise.all([
    wcPermission ? getScopedWcCases({ organizationId, userId, permission: wcPermission }) : Promise.resolve([]),
    oshaPermission
      ? oshaYears(organizationId, since, now).then(years =>
          Promise.all(years.map(year => getScopedOshaCases({ organizationId, userId, permission: oshaPermission, year }))).then(lists => lists.flat())
        )
      : Promise.resolve([]),
    incidentPermission ? getScopedIncidents({ organizationId, userId, permission: incidentPermission }) : Promise.resolve([])
  ])

  const rows: BodyMapSourceRow[] = []

  for (const record of wcRows as any[]) {
    const date = isoDate(record.injury_date)

    if (!inWindow(date)) continue

    rows.push({
      source: 'workers_comp',
      recordId: record.id,
      label: `WC case ${record.case_number}`,
      href: `/workers-comp/${record.id}`,
      date,
      bodyLocations: bodyRegionsFromText(record.body_parts),
      incidentId: record.incident_id,
      personnelId: record.personnel_id,
      employeeName: record.employee_name,
      oshaCaseId: record.osha_case_id
    })
  }

  for (const record of oshaRows as any[]) {
    const date = isoDate(record.injury_date)

    if (!inWindow(date)) continue

    // Form 301 item 15 names the body part; the Form 300 description is the fallback.
    const fromInjury = bodyRegionsFromText(record.injury_or_illness)

    rows.push({
      source: 'osha',
      recordId: record.id,
      label: `OSHA case ${record.case_number}`,
      href: `/osha/cases/${record.id}`,
      date,
      bodyLocations: fromInjury.length ? fromInjury : bodyRegionsFromText(record.injury_description),
      incidentId: record.incident_id,
      personnelId: record.personnel_id,
      employeeName: record.employee_name
    })
  }

  for (const record of incidentRows as any[]) {
    if (record.status === 'draft') continue

    const date = isoDate(record.occurred_at)

    if (!inWindow(date)) continue

    rows.push({
      source: 'incident',
      recordId: record.id,
      label: `Incident ${record.incident_number}`,
      href: `/incidents/${record.id}`,
      date,
      bodyLocations: extractBodyLocationsFromPayload(record.custom_data)
    })
  }

  return { sources, injuries: mergeBodyMapInjuries(rows) }
}

/**
 * Region counts and the most recent matching injuries for one rolling window (months = null: all time).
 * `access` is the viewer's effective access (requireTenantPermission(...).access, or getEffectiveTenantAccess).
 * Returns null when the viewer can see none of the sources.
 */
export const getBodyMapData = async ({
  organizationId,
  userId,
  access,
  months = 12,
  cap = 10,
  now = new Date()
}: {
  organizationId: string
  userId: string
  access: BodyMapAccess
  months?: number | null
  cap?: number
  now?: Date
}): Promise<BodyMapData | null> => {
  const loaded = await loadSourceRows({ organizationId, userId, access, months, now })

  if (!loaded) return null

  return { ...summarizeBodyMap(loaded.injuries, { months, now, cap }), sources: loaded.sources }
}

/** Every period of the card (6 months, 12 months, all time) from one all-time fetch. */
export const getBodyMapCardData = async ({
  organizationId,
  userId,
  access,
  cap = 50,
  now = new Date()
}: {
  organizationId: string
  userId: string
  access: BodyMapAccess
  cap?: number
  now?: Date
}): Promise<BodyMapCardData | null> => {
  const loaded = await loadSourceRows({ organizationId, userId, access, months: null, now })

  if (!loaded) return null

  const periods = Object.fromEntries(
    BODY_MAP_PERIODS.map(period => [period.value, summarizeBodyMap(loaded.injuries, { months: period.months, now, cap })])
  ) as Record<BodyMapPeriod, BodyMapSummary>

  return { sources: loaded.sources, periods }
}
