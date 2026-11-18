import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedTasks } from '@/lib/forgeTasks'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { listObservations } from '@/lib/forgeObservations'
import { listRisks } from '@/lib/forgeRiskRegister'
import {
  HIGH_RISK_BANDS,
  INCIDENT_SEVERITY_WEIGHTS,
  computeRiskScore,
  injuryRate,
  trendIncrease,
  type RiskEvidence,
  type RiskFactorInput,
  type RiskModel
} from '@/lib/forgeAiRiskScore'

type Scope = { type: 'location' | 'division'; id: string; name: string; locationIds: string[] }

const DAY = 86_400_000
const TREND_RECENT_DAYS = 30

const ref = (type: string, id: string, reference: string | null | undefined): RiskEvidence => ({ type, id, reference: reference || null })

// The tenant's active model for a key, or the platform default.
export const resolveForgeAiRiskModel = async (organizationId: string, modelKey = 'facility_risk'): Promise<RiskModel> => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_ai_risk_models')
    .select('id, organization_id, model_key, version, window_days, factors, bands, min_available_weight')
    .eq('model_key', modelKey)
    .eq('status', 'active')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('version', { ascending: false })

  const rows = data || []
  const model = rows.find((row: any) => row.organization_id === organizationId) || rows.find((row: any) => row.organization_id === null)

  if (!model) throw new Error('No active risk model is configured.')

  return { ...model, min_available_weight: Number(model.min_available_weight) }
}

// The API returns at most 1,000 rows per request, so every input is read page by page in id order.
// A factor computed from a partial read would understate the tenant's risk.
const PAGE_SIZE = 1000

const readAllPages = async (build: () => any): Promise<{ data: any[] | null; error: any }> => {
  const rows: any[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build()
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}

// Load every record the factors need once per tenant, then slice it per scope.
const loadTenantData = async (organizationId: string, windowDays: number, now: Date) => {
  const supabase = createServiceRoleClient() as any
  const since = new Date(now.getTime() - windowDays * DAY).toISOString()
  const year = now.getUTCFullYear()

  const results = await Promise.all([
    () => supabase.from('locations').select('id, name, division_id, is_active').eq('organization_id', organizationId),
    () => supabase.from('divisions').select('id, name, is_active').eq('organization_id', organizationId),
    () => supabase
      .from('forge_incidents')
      .select('id, incident_number, severity, involves_injury, status, occurred_at, location_id')
      .eq('organization_id', organizationId)
      .gte('occurred_at', since)
      .neq('status', 'draft'),
    () => supabase
      .from('forge_inspections')
      .select('id, inspection_number, location_id, inspection_date')
      .eq('organization_id', organizationId)
      .gte('inspection_date', since.slice(0, 10)),
    () => supabase
      .from('forge_inspection_findings')
      .select('id, title, severity, status, inspection_id, forge_inspections(inspection_number, location_id)')
      .eq('organization_id', organizationId)
      .in('severity', ['high', 'critical'])
      .not('status', 'in', '(closed,canceled)'),
    () => supabase
      .from('forge_tasks')
      .select('id, task_number, due_at, status, location_id')
      .eq('organization_id', organizationId)
      .eq('corrective_action', true)
      .is('archived_at', null)
      .not('status', 'in', '(completed,canceled)'),
    () => supabase
      .from('forge_training_assignments')
      .select('id, due_date, status, forge_personnel(location_id, archived_at), forge_training_courses(course_code)')
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,canceled)'),
    () => supabase
      .from('forge_risks')
      .select('id, risk_number, residual_band_key, inherent_band_key, status, location_id')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .not('status', 'in', '(closed,draft)'),
    () => supabase
      .from('forge_observations')
      .select('id, observation_number, initial_risk_band_key, status, location_id')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .not('status', 'in', '(closed,no_action,draft)'),
    () => supabase
      .from('forge_osha_establishment_years')
      .select('id, location_id, year, total_hours_worked')
      .eq('organization_id', organizationId)
      .in('year', [year, year - 1])
  ].map(readAllPages))

  const failed = results.find(result => result.error)

  if (failed) throw new Error('Risk data could not be loaded: ' + failed.error.message)

  const [locations, divisions, incidents, inspections, findings, tasks, assignments, risks, observations, hours] = results.map(result => result.data || [])

  // Hours worked: this year's figure when filed, else last year's.
  const hoursByLocation = new Map<string, number>()

  for (const row of [...hours].sort((a: any, b: any) => a.year - b.year)) {
    const value = Number(row.total_hours_worked)

    if (row.location_id && value > 0) hoursByLocation.set(row.location_id, value)
  }

  return { locations, divisions, incidents, inspections, findings, tasks, assignments, risks, observations, hoursByLocation }
}

type TenantData = Awaited<ReturnType<typeof loadTenantData>>

export const buildScopeFactors = (data: TenantData, scope: Scope, windowDays: number, now: Date) => {
  const inScope = (locationId: string | null | undefined) => Boolean(locationId && scope.locationIds.includes(locationId))
  const incidents = data.incidents.filter((row: any) => inScope(row.location_id))
  const injuries = incidents.filter((row: any) => row.involves_injury)
  const inspections = data.inspections.filter((row: any) => inScope(row.location_id))
  const findings = data.findings.filter((row: any) => inScope(row.forge_inspections?.location_id))
  const overdueTasks = data.tasks.filter((row: any) => inScope(row.location_id) && row.due_at && new Date(row.due_at) < now)
  const openTasks = data.tasks.filter((row: any) => inScope(row.location_id))
  const assignments = data.assignments.filter((row: any) => inScope(row.forge_personnel?.location_id) && !row.forge_personnel?.archived_at)
  const today = now.toISOString().slice(0, 10)
  const overdueAssignments = assignments.filter((row: any) => row.due_date && row.due_date < today)
  const highRisks = data.risks.filter((row: any) => inScope(row.location_id) && HIGH_RISK_BANDS.includes(row.residual_band_key || row.inherent_band_key))
  const highObservations = data.observations.filter((row: any) => inScope(row.location_id) && HIGH_RISK_BANDS.includes(row.initial_risk_band_key))

  const hourLocations = scope.locationIds.filter(id => data.hoursByLocation.has(id))
  const annualHours = hourLocations.reduce((sum, id) => sum + (data.hoursByLocation.get(id) || 0), 0)
  const ratedInjuries = injuries.filter((row: any) => hourLocations.includes(row.location_id))
  const rate = annualHours > 0 ? injuryRate(ratedInjuries.length, annualHours, windowDays) : null

  const recentCutoff = now.getTime() - TREND_RECENT_DAYS * DAY
  const recent = incidents.filter((row: any) => new Date(row.occurred_at).getTime() >= recentCutoff)
  const prior = incidents.length - recent.length
  const severityLoad = incidents.reduce((sum: number, row: any) => sum + (INCIDENT_SEVERITY_WEIGHTS[row.severity] ?? 1), 0)

  const incidentRefs = (rows: any[]) => rows.map(row => ref('incident', row.id, row.incident_number))

  const factors: RiskFactorInput[] = [
    {
      key: 'injury_rate',
      available: rate != null,
      rawValue: rate,
      detail:
        rate == null
          ? 'No hours worked on file for this scope (OSHA 300A), so an injury rate cannot be calculated.'
          : `${ratedInjuries.length} injury incident(s) over about ${Math.round((annualHours * windowDays) / 365).toLocaleString('en-US')} hours worked: ${rate.toFixed(2)} per 200,000 hours.`,
      evidence: incidentRefs(ratedInjuries)
    },
    {
      key: 'incident_severity',
      available: true,
      rawValue: severityLoad,
      detail: `${incidents.length} incident(s) in ${windowDays} days with a severity load of ${severityLoad} (minor 1, moderate 3, serious 9).`,
      evidence: incidentRefs(incidents)
    },
    {
      key: 'incident_trend',
      available: true,
      rawValue: trendIncrease(recent.length, prior, TREND_RECENT_DAYS, windowDays - TREND_RECENT_DAYS),
      detail: `${recent.length} incident(s) in the last ${TREND_RECENT_DAYS} days vs. ${prior} in the ${windowDays - TREND_RECENT_DAYS} days before.`,
      evidence: incidentRefs(recent)
    },
    {
      key: 'open_findings',
      available: true,
      rawValue: findings.length,
      detail: `${findings.length} open high or critical inspection finding(s).`,
      evidence: findings.map((row: any) => ref('inspection', row.inspection_id, row.forge_inspections?.inspection_number))
    },
    {
      key: 'overdue_corrective_actions',
      available: true,
      rawValue: overdueTasks.length,
      detail: `${overdueTasks.length} of ${openTasks.length} open corrective action(s) are overdue.`,
      evidence: overdueTasks.map((row: any) => ref('task', row.id, row.task_number))
    },
    {
      key: 'overdue_training',
      available: assignments.length > 0,
      rawValue: assignments.length ? overdueAssignments.length / assignments.length : null,
      detail: assignments.length
        ? `${overdueAssignments.length} of ${assignments.length} open training assignment(s) are overdue.`
        : 'No open training assignments for people at this scope.',
      evidence: overdueAssignments.map((row: any) => ref('training_assignment', row.id, row.forge_training_courses?.course_code))
    },
    {
      key: 'open_high_risks',
      available: true,
      rawValue: highRisks.length + highObservations.length,
      detail: `${highRisks.length} open high-band risk(s) and ${highObservations.length} open high-band observation(s).`,
      evidence: [
        ...highRisks.map((row: any) => ref('risk', row.id, row.risk_number)),
        ...highObservations.map((row: any) => ref('observation', row.id, row.observation_number))
      ]
    }
  ]

  const recordCount =
    incidents.length + inspections.length + findings.length + openTasks.length + assignments.length + highRisks.length + highObservations.length

  return { factors, recordCount }
}

const listScopes = (data: TenantData): Scope[] => {
  const activeLocations = data.locations.filter((row: any) => row.is_active !== false)

  return [
    ...activeLocations.map((row: any) => ({ type: 'location' as const, id: row.id, name: row.name, locationIds: [row.id] })),
    ...data.divisions
      .filter((row: any) => row.is_active !== false)
      .map((row: any) => ({
        type: 'division' as const,
        id: row.id,
        name: row.name,
        locationIds: activeLocations.filter((location: any) => location.division_id === row.id).map((location: any) => location.id)
      }))
      .filter((scope: Scope) => scope.locationIds.length > 0)
  ]
}

// Score every active location and division. Scheduled and event runs skip storing a scope whose
// score and band have not changed in the last day, so history records changes, not repeats.
export const runForgeAiRiskAssessments = async ({
  organizationId,
  triggerType,
  actorUserId = null,
  now = new Date()
}: {
  organizationId: string
  triggerType: 'manual' | 'scheduled' | 'event' | 'system'
  actorUserId?: string | null
  now?: Date
}) => {
  const supabase = createServiceRoleClient() as any
  const model = await resolveForgeAiRiskModel(organizationId)
  const data = await loadTenantData(organizationId, model.window_days, now)
  const scopes = listScopes(data)
  const periodStart = new Date(now.getTime() - model.window_days * DAY).toISOString()
  const summary: Array<{ scopeType: string; scopeId: string; scopeName: string; score: number | null; band: string; stored: boolean }> = []

  const { data: latestRows } = await supabase
    .from('forge_ai_risk_assessments')
    .select('scope_type, scope_id, score, band, model_version, computed_at')
    .eq('organization_id', organizationId)
    .gte('computed_at', new Date(now.getTime() - DAY).toISOString())
    .order('computed_at', { ascending: false })

  for (const scope of scopes) {
    const { factors, recordCount } = buildScopeFactors(data, scope, model.window_days, now)
    const result = computeRiskScore(model, factors, recordCount)
    const recent = (latestRows || []).find((row: any) => row.scope_type === scope.type && row.scope_id === scope.id)

    const unchanged =
      recent && recent.band === result.band && Number(recent.score ?? -1) === Number(result.score ?? -1) && recent.model_version === model.version

    if (triggerType !== 'manual' && unchanged) {
      summary.push({ scopeType: scope.type, scopeId: scope.id, scopeName: scope.name, score: result.score, band: result.band, stored: false })
      continue
    }

    const { data: assessment, error } = await supabase
      .from('forge_ai_risk_assessments')
      .insert({
        organization_id: organizationId,
        model_id: model.id,
        model_key: model.model_key,
        model_version: model.version,
        scope_type: scope.type,
        scope_id: scope.id,
        scope_name: scope.name,
        period_start: periodStart,
        period_end: now.toISOString(),
        score: result.score,
        band: result.band,
        available_weight: result.availableWeight,
        record_count: recordCount,
        trigger_type: triggerType,
        computed_by: actorUserId,
        computed_at: now.toISOString(),
        metadata: result.reason ? { reason: result.reason } : {}
      })
      .select('id')
      .single()

    if (error || !assessment) throw new Error(error?.message || 'Unable to store the risk assessment.')

    const { error: indicatorError } = await supabase
      .from('forge_ai_risk_indicators')
      .insert(result.indicators.map(indicator => ({ ...indicator, organization_id: organizationId, assessment_id: assessment.id })))

    if (indicatorError) throw new Error(indicatorError.message)

    summary.push({ scopeType: scope.type, scopeId: scope.id, scopeName: scope.name, score: result.score, band: result.band, stored: true })
  }

  await recordForgeAiAudit({
    organizationId,
    actorUserId,
    actorType: actorUserId ? 'user' : 'system',
    eventType: 'risk.assessed',
    resourceType: 'forge_ai_risk_model',
    resourceId: model.id,
    detail: { trigger: triggerType, model_version: model.version, scopes: summary.length, stored: summary.filter(item => item.stored).length }
  })

  return { modelVersion: model.version, scopes: summary }
}

// Module permission each evidence type needs before a viewer may see its reference.
export const EVIDENCE_PERMISSIONS: Record<string, string> = {
  incident: 'incidents.view',
  inspection: 'inspections.view',
  task: 'tasks.view',
  training_assignment: 'training.view',
  risk: 'risk_register.view',
  observation: 'observations.view'
}

// Which facility and division scopes a viewer may see under a risk-style permission. A
// location-scoped viewer sees only their locations; a division-scoped viewer sees their
// divisions and the locations in them.
export const riskScopeVisibility = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}): Promise<(scopeType: string, scopeId: string) => boolean> => {
  if (!permission.allowed) return () => false
  if (permission.scope === 'organization') return () => true
  if (permission.scope !== 'location' && permission.scope !== 'division') return () => false

  const supabase = createServiceRoleClient() as any
  const assignments = await getTenantScopeAssignments({ organizationId, userId })
  const { data: locations } = await supabase.from('locations').select('id, division_id').eq('organization_id', organizationId)
  const divisionOf = new Map<string, string | null>((locations || []).map((row: any) => [row.id, row.division_id]))

  return (scopeType, scopeId) => {
    if (permission.scope === 'location') return scopeType === 'location' && assignments.locationIds.includes(scopeId)

    return scopeType === 'division'
      ? assignments.divisionIds.includes(scopeId)
      : assignments.divisionIds.includes(divisionOf.get(scopeId) || '')
  }
}

// Which evidence records a viewer may see. A module permission alone is not enough: the record
// must be in that module's own scoped list for the viewer (for example, a location-scoped
// incidents.view shows only incidents at those locations). Only the record types present are loaded.
export const evidenceVisibility = async ({
  organizationId,
  userId,
  permissionByKey,
  types
}: {
  organizationId: string
  userId: string
  permissionByKey: Map<string, EffectivePermission>
  types: Iterable<string>
}) => {
  const wanted = new Set(types)

  const permission = (type: string) => {
    const item = permissionByKey.get(EVIDENCE_PERMISSIONS[type] || '')

    return wanted.has(type) && item?.allowed ? item : null
  }

  const ids = (rows: any[] | null | undefined) => new Set((rows || []).map((row: any) => String(row.id)))

  const load = async (type: string, read: (item: EffectivePermission) => Promise<any[]>) => {
    const item = permission(type)

    return [type, item ? ids(await read(item)) : new Set<string>()] as const
  }

  const visible = new Map(
    await Promise.all([
      load('incident', item => getScopedIncidents({ organizationId, userId, permission: item })),
      load('inspection', item => getScopedInspections({ organizationId, userId, permission: item })),
      load('task', item => getScopedTasks({ organizationId, userId, permission: item, includeArchived: true })),
      load('training_assignment', async item => (await getTrainingOverview({ organizationId, userId, permission: item })).assignments),
      load('risk', item => listRisks({ organizationId, userId, permission: item })),
      load('observation', item => listObservations({ organizationId, userId, permission: item }))
    ])
  )

  return (entry: RiskEvidence) => Boolean(visible.get(entry.type)?.has(String(entry.id)))
}

// Latest assessment per scope the viewer may see. A location-scoped viewer sees only their
// locations; a division-scoped viewer sees their divisions and the locations in them. Evidence
// references from modules the viewer cannot open are removed (the counts stay).
export const getScopedForgeAiRiskAssessments = async ({
  organizationId,
  userId,
  permission,
  permissionByKey,
  includeIndicators = true
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  permissionByKey: Map<string, EffectivePermission>
  includeIndicators?: boolean
}) => {
  if (!permission.allowed) return []

  const supabase = createServiceRoleClient() as any

  const { data: rows, error } = await supabase
    .from('forge_ai_risk_assessments')
    .select('*')
    .eq('organization_id', organizationId)
    .order('computed_at', { ascending: false })
    .limit(2000)

  if (error) throw new Error('Unable to load risk indicators: ' + error.message)

  const latest = new Map<string, any>()

  for (const row of rows || []) {
    const key = row.scope_type + ':' + row.scope_id

    if (!latest.has(key)) latest.set(key, row)
  }

  const canSeeScope = await riskScopeVisibility({ organizationId, userId, permission })
  const visible = [...latest.values()].filter(row => canSeeScope(row.scope_type, row.scope_id))

  visible.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || String(a.scope_name).localeCompare(String(b.scope_name)))

  if (!includeIndicators || !visible.length) return visible.map(row => ({ ...row, indicators: [] }))

  const { data: indicators } = await supabase
    .from('forge_ai_risk_indicators')
    .select('assessment_id, factor_key, label, available, raw_value, normalized, weight, contribution, detail, evidence')
    .in('assessment_id', visible.map(row => row.id))
    .order('id')

  const canSee = await evidenceVisibility({
    organizationId,
    userId,
    permissionByKey,
    types: (indicators || []).flatMap((item: any) => (item.evidence || []).map((entry: RiskEvidence) => entry.type))
  })

  return visible.map(row => ({
    ...row,
    indicators: (indicators || [])
      .filter((item: any) => item.assessment_id === row.id)
      .map((item: any) => {
        const evidence = (item.evidence || []) as RiskEvidence[]
        const shown = evidence.filter(canSee)

        return { ...item, evidence: shown, hidden_evidence: evidence.length - shown.length }
      })
  }))
}
