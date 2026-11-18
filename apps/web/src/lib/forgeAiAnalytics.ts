import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedAssets } from '@/lib/forgeAssets'

export type ForgeAiAnalyticsRange = {
  dateFrom: string
  dateTo: string
  days: number
}

type AnalyticsContext = {
  organizationId: string
  userId: string
  analyticsPermission: EffectivePermission
  permissionByKey: Map<string, EffectivePermission>
}

const scopeRank: Record<string, number> = {
  own: 1,
  assigned: 2,
  location: 3,
  division: 4,
  organization: 5
}

const permissionFor = (
  permissionByKey: Map<string, EffectivePermission>,
  key: string,
  analyticsPermission: EffectivePermission
): EffectivePermission | null => {
  const permission = permissionByKey.get(key)
  if (!permission?.allowed) return null

  const analyticsScope = analyticsPermission.scope || 'own'
  const moduleScope = permission.scope || 'own'
  const narrower =
    (scopeRank[analyticsScope] || 0) <= (scopeRank[moduleScope] || 0)
      ? analyticsScope
      : moduleScope

  return {
    ...permission,
    scope: narrower
  }
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

export const resolveForgeAiAnalyticsRange = ({
  days = 90,
  dateFrom,
  dateTo
}: {
  days?: number
  dateFrom?: string | null
  dateTo?: string | null
}): ForgeAiAnalyticsRange => {
  const clampedDays = Math.min(Math.max(Math.trunc(Number(days) || 90), 1), 3650)
  const today = new Date()

  let end = dateTo ? new Date(dateTo + 'T23:59:59Z') : today
  if (Number.isNaN(end.getTime())) end = today

  let start = dateFrom
    ? new Date(dateFrom + 'T00:00:00Z')
    : new Date(end.getTime() - (clampedDays - 1) * 86_400_000)

  if (Number.isNaN(start.getTime())) {
    start = new Date(end.getTime() - (clampedDays - 1) * 86_400_000)
  }

  if (start > end) {
    const swap = start
    start = new Date(end)
    end = swap
  }

  const actualDays =
    Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)

  return {
    dateFrom: isoDate(start),
    dateTo: isoDate(end),
    days: actualDays
  }
}

const inRange = (
  value: string | null | undefined,
  range: ForgeAiAnalyticsRange
) => {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return false

  const from = new Date(range.dateFrom + 'T00:00:00Z').getTime()
  const to = new Date(range.dateTo + 'T23:59:59.999Z').getTime()
  return timestamp >= from && timestamp <= to
}

const countsBy = (rows: any[], key: (row: any) => unknown) => {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const value = key(row)
    const label = value == null || value === '' ? 'Unspecified' : String(value)
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

const monthBuckets = (rows: any[], getDate: (row: any) => string | null | undefined) => {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const value = getDate(row)
    if (!value) continue
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    const key = date.toISOString().slice(0, 7)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0

const previousRange = (range: ForgeAiAnalyticsRange): ForgeAiAnalyticsRange => {
  const start = new Date(range.dateFrom + 'T00:00:00Z')
  const end = new Date(range.dateFrom + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() - 1)
  start.setUTCDate(start.getUTCDate() - range.days)

  return {
    dateFrom: isoDate(start),
    dateTo: isoDate(end),
    days: range.days
  }
}

const trendChange = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : null
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

export const getForgeAiIncidentAnalytics = async ({
  organizationId,
  userId,
  analyticsPermission,
  permissionByKey,
  range
}: AnalyticsContext & { range: ForgeAiAnalyticsRange }) => {
  const permission = permissionFor(permissionByKey, 'incidents.view', analyticsPermission)
  if (!permission) return { available: false, reason: 'Incident access is not available.' }

  const rows = await getScopedIncidents({ organizationId, userId, permission })
  const current = rows.filter((row: any) => inRange(row.occurred_at, range))
  const priorRange = previousRange(range)
  const prior = rows.filter((row: any) => inRange(row.occurred_at, priorRange))

  return {
    available: true,
    range,
    total: current.length,
    previous_period_total: prior.length,
    change_percent: trendChange(current.length, prior.length),
    open: current.filter((row: any) => row.status !== 'closed').length,
    submitted: current.filter((row: any) => row.status === 'submitted').length,
    high_severity: current.filter((row: any) => ['major','critical'].includes(String(row.severity))).length,
    by_status: countsBy(current, row => row.status),
    by_severity: countsBy(current, row => row.severity),
    by_type: countsBy(current, row => row.incident_type),
    by_location: countsBy(current, row => row.locations?.name),
    by_division: countsBy(current, row => row.divisions?.name),
    monthly_trend: monthBuckets(current, row => row.occurred_at)
  }
}

export const getForgeAiTrainingAnalytics = async ({
  organizationId,
  userId,
  analyticsPermission,
  permissionByKey,
  range
}: AnalyticsContext & { range: ForgeAiAnalyticsRange }) => {
  const permission = permissionFor(permissionByKey, 'training.view', analyticsPermission)
  if (!permission) return { available: false, reason: 'Training access is not available.' }

  const data = await getTrainingOverview({ organizationId, userId, permission })
  const today = new Date().toISOString().slice(0, 10)
  const personnelById = new Map((data.personnel || []).map((person: any) => [person.id, person]))

  const activeAssignments = (data.assignments || []).filter(
    (row: any) => !['completed','canceled'].includes(String(row.status))
  )
  const overdue = activeAssignments.filter(
    (row: any) => Boolean(row.due_date && row.due_date < today)
  )
  const assignmentsInRange = (data.assignments || []).filter(
    (row: any) => inRange(row.assigned_at, range)
  )
  const completionsInRange = (data.completions || []).filter(
    (row: any) => inRange(row.completed_at, range)
  )

  const overdueByLocation = countsBy(overdue, row => {
    const person = personnelById.get(row.personnel_id) as any
    return person?.locations?.name
  })
  const overdueByDivision = countsBy(overdue, row => {
    const person = personnelById.get(row.personnel_id) as any
    return person?.divisions?.name
  })

  return {
    available: true,
    range,
    visible_personnel: data.personnel.length,
    active_courses: data.courses.length,
    active_assignments: activeAssignments.length,
    overdue_assignments: overdue.length,
    overdue_rate_percent: percent(overdue.length, activeAssignments.length),
    assignments_created_in_range: assignmentsInRange.length,
    completions_in_range: completionsInRange.length,
    by_assignment_status: countsBy(data.assignments || [], row => row.status),
    overdue_by_course: countsBy(overdue, row => row.forge_training_courses?.title),
    overdue_by_location: overdueByLocation,
    overdue_by_division: overdueByDivision,
    completion_result: countsBy(completionsInRange, row => row.result),
    monthly_completions: monthBuckets(completionsInRange, row => row.completed_at)
  }
}

export const getForgeAiInspectionAnalytics = async ({
  organizationId,
  userId,
  analyticsPermission,
  permissionByKey,
  range
}: AnalyticsContext & { range: ForgeAiAnalyticsRange }) => {
  const permission = permissionFor(permissionByKey, 'inspections.view', analyticsPermission)
  if (!permission) return { available: false, reason: 'Inspection access is not available.' }

  const supabase = createServiceRoleClient() as any
  const inspections = await getScopedInspections({ organizationId, userId, permission })
  const current = inspections.filter((row: any) => inRange(row.inspection_date, range))
  const inspectionIds = inspections.map((row: any) => row.id)

  let findings: any[] = []

  if (inspectionIds.length) {
    const { data, error } = await supabase
      .from('forge_inspection_findings')
      .select('id, inspection_id, title, severity, status, due_date, created_at')
      .eq('organization_id', organizationId)
      .in('inspection_id', inspectionIds)

    if (error) throw new Error('Unable to analyze inspection findings: ' + error.message)
    findings = data || []
  }

  const today = new Date().toISOString().slice(0, 10)
  const openFindings = findings.filter(
    row => !['closed','canceled'].includes(String(row.status))
  )
  const overdueFindings = openFindings.filter(
    row => Boolean(row.due_date && row.due_date < today)
  )
  const criticalOpen = openFindings.filter(
    row => String(row.severity) === 'critical'
  )

  const normalizedTitles = countsBy(findings, row =>
    String(row.title || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  ).filter(item => item.label !== 'Unspecified')

  return {
    available: true,
    range,
    inspections_in_range: current.length,
    open_inspections: inspections.filter((row: any) => row.status !== 'closed').length,
    submitted_inspections: inspections.filter((row: any) => row.status === 'submitted').length,
    open_findings: openFindings.length,
    overdue_findings: overdueFindings.length,
    critical_open_findings: criticalOpen.length,
    by_status: countsBy(current, row => row.status),
    by_result: countsBy(current, row => row.result),
    by_template: countsBy(current, row =>
      row.template_name_snapshot || row.forge_inspection_templates?.name
    ),
    by_location: countsBy(current, row => row.locations?.name),
    by_finding_severity: countsBy(findings, row => row.severity),
    by_finding_status: countsBy(findings, row => row.status),
    repeat_finding_titles: normalizedTitles.filter(item => item.count > 1).slice(0, 20),
    monthly_trend: monthBuckets(current, row => row.inspection_date)
  }
}

export const getForgeAiAssetAnalytics = async ({
  organizationId,
  userId,
  analyticsPermission,
  permissionByKey,
  range
}: AnalyticsContext & { range: ForgeAiAnalyticsRange }) => {
  const permission = permissionFor(permissionByKey, 'assets_equipment.view', analyticsPermission)
  if (!permission) return { available: false, reason: 'Assets & Equipment access is not available.' }

  const supabase = createServiceRoleClient() as any
  const assets = await getScopedAssets({
    organizationId,
    userId,
    permission,
    includeRetired: true
  })

  const activeAssets = assets.filter((row: any) => !row.retired_at)
  const assetIds = assets.map((row: any) => row.id)
  const assetById = new Map(assets.map((row: any) => [row.id, row]))
  let maintenance: any[] = []

  if (assetIds.length) {
    const { data, error } = await supabase
      .from('forge_asset_maintenance')
      .select('id, asset_id, maintenance_type, status, performed_on, scheduled_for, total_cost, next_due_date, created_at')
      .eq('organization_id', organizationId)
      .in('asset_id', assetIds)

    if (error) throw new Error('Unable to analyze asset maintenance: ' + error.message)
    maintenance = data || []
  }

  const maintenanceInRange = maintenance.filter((row: any) =>
    inRange(row.performed_on || row.created_at, range)
  )
  const today = new Date().toISOString().slice(0, 10)
  const maintenanceDue = maintenance.filter(
    (row: any) => Boolean(row.next_due_date && row.next_due_date <= today)
  )

  const costByAsset = new Map<string, number>()
  for (const row of maintenanceInRange) {
    const cost = Number(row.total_cost || 0)
    costByAsset.set(row.asset_id, (costByAsset.get(row.asset_id) || 0) + cost)
  }

  const topMaintenanceCostAssets = Array.from(costByAsset.entries())
    .map(([assetId, cost]) => {
      const asset = assetById.get(assetId) as any
      return {
        asset_number: asset?.asset_number || null,
        asset_name: asset?.name || null,
        cost: Number(cost.toFixed(2))
      }
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20)

  return {
    available: true,
    range,
    active_assets: activeAssets.length,
    retired_assets: assets.length - activeAssets.length,
    out_of_service: activeAssets.filter((row: any) => row.status === 'out_of_service').length,
    in_maintenance: activeAssets.filter((row: any) => row.status === 'maintenance').length,
    poor_or_unserviceable: activeAssets.filter((row: any) =>
      ['poor','unserviceable'].includes(String(row.condition))
    ).length,
    critical_assets: activeAssets.filter((row: any) => row.criticality === 'critical').length,
    maintenance_records_in_range: maintenanceInRange.length,
    maintenance_cost_in_range: Number(
      maintenanceInRange
        .reduce((sum: number, row: any) => sum + Number(row.total_cost || 0), 0)
        .toFixed(2)
    ),
    maintenance_due_now: maintenanceDue.length,
    by_status: countsBy(activeAssets, row => row.status),
    by_condition: countsBy(activeAssets, row => row.condition),
    by_type: countsBy(activeAssets, row => row.asset_type),
    by_location: countsBy(activeAssets, row => row.locations?.name),
    maintenance_by_type: countsBy(maintenanceInRange, row => row.maintenance_type),
    top_maintenance_cost_assets: topMaintenanceCostAssets,
    monthly_maintenance: monthBuckets(maintenanceInRange, row => row.performed_on || row.created_at)
  }
}

export const getForgeAiExecutiveAnalytics = async ({
  organizationId,
  userId,
  analyticsPermission,
  permissionByKey,
  range
}: AnalyticsContext & { range: ForgeAiAnalyticsRange }) => {
  const [incidents, training, inspections, assets] = await Promise.all([
    getForgeAiIncidentAnalytics({
      organizationId,
      userId,
      analyticsPermission,
      permissionByKey,
      range
    }),
    getForgeAiTrainingAnalytics({
      organizationId,
      userId,
      analyticsPermission,
      permissionByKey,
      range
    }),
    getForgeAiInspectionAnalytics({
      organizationId,
      userId,
      analyticsPermission,
      permissionByKey,
      range
    }),
    getForgeAiAssetAnalytics({
      organizationId,
      userId,
      analyticsPermission,
      permissionByKey,
      range
    })
  ])

  return {
    range,
    generated_at: new Date().toISOString(),
    incidents,
    training,
    inspections,
    assets
  }
}
