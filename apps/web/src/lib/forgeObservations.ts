import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { performTransactionalObservationUpdate } from '@/lib/forgeObservationWorkflowSync'
import {
  calculateRisk,
  getActiveRiskMatrix,
  type RiskCalculationResult
} from '@/lib/forgeRiskMatrix'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export type ObservationRow = {
  id: string
  organization_id: string
  observation_number: string
  status: string
  observation_type: string
  category_key: string | null
  work_area: string | null
  title: string
  description: string
  occurred_at: string
  submitted_at: string | null
  reporting_mode: string
  immediate_action: string | null
  location_id: string | null
  division_id: string | null
  risk_matrix_id: string | null
  risk_matrix_version: number | null
  initial_likelihood_key: string | null
  initial_severity_key: string | null
  initial_risk_score: number | null
  initial_risk_band_key: string | null
  reported_by_user_id: string | null
  reported_by_personnel_id: string | null
  assigned_to_personnel_id: string | null
  assigned_to_user_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  closure_summary: string | null
  closed_at: string | null
  closed_by: string | null
  archived_at: string | null
  row_version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ObservationListFilters = {
  status?: string | null
  observationType?: string | null
  categoryKey?: string | null
  locationId?: string | null
  divisionId?: string | null
  riskBandKey?: string | null
  search?: string | null
  includeArchived?: boolean
}

export type ObservationCreateInput = {
  title: string
  description: string
  observationType: string
  categoryKey?: string | null
  workArea?: string | null
  occurredAt?: string | null
  reportingMode: 'named' | 'anonymous'
  immediateAction?: string | null
  locationId?: string | null
  divisionId?: string | null
  assignedToPersonnelId?: string | null
  assignedToUserId?: string | null
  initialLikelihoodKey?: string | null
  initialSeverityKey?: string | null
  status?: string
  reportedByPersonnelId?: string | null
}

export type ObservationUpdateInput = {
  title?: string
  description?: string
  observationType?: string
  categoryKey?: string | null
  workArea?: string | null
  occurredAt?: string | null
  immediateAction?: string | null
  locationId?: string | null
  divisionId?: string | null
  assignedToPersonnelId?: string | null
  assignedToUserId?: string | null
  initialLikelihoodKey?: string | null
  initialSeverityKey?: string | null
  closureSummary?: string | null
}

export type ObservationReporterDisplay = {
  mode: 'named' | 'anonymous'
  label: string
  authUserId: string | null
  personnelId: string | null
}

const asRow = <T extends Record<string, unknown>>(value: unknown): T | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as T
}

export const observationWithinScope = async ({
  organizationId,
  userId,
  scope,
  observation
}: {
  organizationId: string
  userId: string
  scope: string | null
  observation: {
    organization_id: string
    assigned_to_user_id?: string | null
    created_by?: string | null
    reported_by_user_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (observation.organization_id !== organizationId) return false

  if (scope === 'organization') return true

  if (scope === 'own' || scope === 'assigned') {
    return (
      observation.assigned_to_user_id === userId ||
      observation.created_by === userId ||
      observation.reported_by_user_id === userId
    )
  }

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') {
    return Boolean(
      (observation.location_id && assignments.locationIds.includes(observation.location_id)) ||
        observation.assigned_to_user_id === userId ||
        observation.created_by === userId ||
        observation.reported_by_user_id === userId
    )
  }

  if (scope === 'division') {
    return Boolean(
      (observation.division_id && assignments.divisionIds.includes(observation.division_id)) ||
        observation.assigned_to_user_id === userId ||
        observation.created_by === userId ||
        observation.reported_by_user_id === userId
    )
  }

  return false
}

const applyListFilters = (query: any, filters: ObservationListFilters) => {
  let next = query

  if (!filters.includeArchived) next = next.is('archived_at', null)
  if (filters.status) next = next.eq('status', filters.status)
  if (filters.observationType) next = next.eq('observation_type', filters.observationType)
  if (filters.categoryKey) next = next.eq('category_key', filters.categoryKey)
  if (filters.locationId) next = next.eq('location_id', filters.locationId)
  if (filters.divisionId) next = next.eq('division_id', filters.divisionId)
  if (filters.riskBandKey) next = next.eq('initial_risk_band_key', filters.riskBandKey)

  const search = filters.search?.trim()
  if (search) {
    next = next.or(
      'observation_number.ilike.%' +
        search +
        '%,title.ilike.%' +
        search +
        '%,description.ilike.%' +
        search +
        '%,work_area.ilike.%' +
        search +
        '%'
    )
  }

  return next
}

export const listObservations = async ({
  organizationId,
  userId,
  permission,
  filters = {}
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  filters?: ObservationListFilters
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_observations')
    .select(
      '*, forge_personnel!forge_observations_assigned_to_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })

  query = applyListFilters(query, filters)

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
    case 'assigned':
      query = query.or(
        'assigned_to_user_id.eq.' +
          userId +
          ',created_by.eq.' +
          userId +
          ',reported_by_user_id.eq.' +
          userId
      )
      break
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!locationIds.length) {
        query = query.or(
          'assigned_to_user_id.eq.' +
            userId +
            ',created_by.eq.' +
            userId +
            ',reported_by_user_id.eq.' +
            userId
        )
      } else {
        query = query.or(
          'assigned_to_user_id.eq.' +
            userId +
            ',created_by.eq.' +
            userId +
            ',reported_by_user_id.eq.' +
            userId +
            ',location_id.in.(' +
            locationIds.join(',') +
            ')'
        )
      }
      break
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!divisionIds.length) {
        query = query.or(
          'assigned_to_user_id.eq.' +
            userId +
            ',created_by.eq.' +
            userId +
            ',reported_by_user_id.eq.' +
            userId
        )
      } else {
        query = query.or(
          'assigned_to_user_id.eq.' +
            userId +
            ',created_by.eq.' +
            userId +
            ',reported_by_user_id.eq.' +
            userId +
            ',division_id.in.(' +
            divisionIds.join(',') +
            ')'
        )
      }
      break
    }
    default:
      return []
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load Observations: ' + error.message)

  return data || []
}

const resolveRiskSnapshot = async ({
  organizationId,
  likelihoodKey,
  severityKey
}: {
  organizationId: string
  likelihoodKey?: string | null
  severityKey?: string | null
}): Promise<
  | { ok: true; snapshot: Partial<ObservationRow> & { risk?: RiskCalculationResult } }
  | { ok: false; error: string }
> => {
  if (!likelihoodKey && !severityKey) {
    return {
      ok: true,
      snapshot: {
        risk_matrix_id: null,
        risk_matrix_version: null,
        initial_likelihood_key: null,
        initial_severity_key: null,
        initial_risk_score: null,
        initial_risk_band_key: null
      }
    }
  }

  if (!likelihoodKey || !severityKey) {
    return { ok: false, error: 'Both likelihood and severity are required to calculate risk.' }
  }

  const matrix = await getActiveRiskMatrix({ organizationId })
  if (!matrix) return { ok: false, error: 'No active risk matrix is configured.' }

  const calculated = await calculateRisk({
    matrixId: matrix.id,
    likelihoodKey,
    severityKey
  })

  if (!calculated.ok) return calculated

  return {
    ok: true,
    snapshot: {
      risk_matrix_id: calculated.result.matrixId,
      risk_matrix_version: calculated.result.matrixVersion,
      initial_likelihood_key: calculated.result.likelihoodKey,
      initial_severity_key: calculated.result.severityKey,
      initial_risk_score: calculated.result.score,
      initial_risk_band_key: calculated.result.bandKey,
      risk: calculated.result
    }
  }
}

export const createObservation = async ({
  organizationId,
  userId,
  input
}: {
  organizationId: string
  userId: string
  input: ObservationCreateInput
}) => {
  const supabase = createServiceRoleClient() as any
  const reportingMode = input.reportingMode === 'anonymous' ? 'anonymous' : 'named'

  const risk = await resolveRiskSnapshot({
    organizationId,
    likelihoodKey: input.initialLikelihoodKey,
    severityKey: input.initialSeverityKey
  })
  if (!risk.ok) return risk

  const { data: observationNumber, error: numberError } = await supabase.rpc(
    'next_forge_observation_number',
    { p_organization_id: organizationId }
  )

  if (numberError || !observationNumber) {
    return { ok: false as const, error: numberError?.message || 'Unable to generate Observation number.' }
  }

  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    observation_number: observationNumber,
    title: input.title,
    description: input.description,
    observation_type: input.observationType,
    category_key: input.categoryKey || null,
    work_area: input.workArea || null,
    occurred_at: input.occurredAt || new Date().toISOString(),
    reporting_mode: reportingMode,
    immediate_action: input.immediateAction || null,
    location_id: input.locationId || null,
    division_id: input.divisionId || null,
    assigned_to_personnel_id: input.assignedToPersonnelId || null,
    assigned_to_user_id: input.assignedToUserId || null,
    status: input.status || 'draft',
    risk_matrix_id: risk.snapshot.risk_matrix_id ?? null,
    risk_matrix_version: risk.snapshot.risk_matrix_version ?? null,
    initial_likelihood_key: risk.snapshot.initial_likelihood_key ?? null,
    initial_severity_key: risk.snapshot.initial_severity_key ?? null,
    initial_risk_score: risk.snapshot.initial_risk_score ?? null,
    initial_risk_band_key: risk.snapshot.initial_risk_band_key ?? null,
    created_by: userId,
    updated_by: userId
  }

  if (reportingMode === 'named') {
    insertPayload.reported_by_user_id = userId
    insertPayload.reported_by_personnel_id = input.reportedByPersonnelId || null
  } else {
    insertPayload.reported_by_user_id = null
    insertPayload.reported_by_personnel_id = null
  }

  const { data: observation, error } = await supabase
    .from('forge_observations')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error || !observation) {
    return { ok: false as const, error: error?.message || 'Unable to create Observation.' }
  }

  if (reportingMode === 'anonymous') {
    const { error: reporterError } = await supabase.from('forge_observation_reporters').insert({
      observation_id: observation.id,
      organization_id: organizationId,
      auth_user_id: userId,
      personnel_id: input.reportedByPersonnelId || null
    })

    if (reporterError) {
      await supabase
        .from('forge_observations')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', observation.id)
      return { ok: false as const, error: reporterError.message || 'Unable to store anonymous reporter.' }
    }
  }

  await supabase.from('forge_observation_activity').insert({
    organization_id: organizationId,
    observation_id: observation.id,
    activity_type: 'created',
    message: 'Observation ' + observationNumber + ' created.',
    actor_user_id: userId,
    metadata: { reporting_mode: reportingMode }
  })

  return { ok: true as const, observation: observation as ObservationRow }
}

/** `closed` is terminal and record-locking in observations.lifecycle (no reopen transition). */
export const OBSERVATION_LOCKED_STATUS = 'closed'
export const OBSERVATION_CLOSED_READ_ONLY_ERROR = 'Closed observations are read-only.'

export const updateObservation = async ({
  organizationId,
  userId,
  observationId,
  expectedRowVersion,
  input
}: {
  organizationId: string
  userId: string
  observationId: string
  expectedRowVersion: number
  input: ObservationUpdateInput & { status?: never }
}) => {
  if ('status' in (input as Record<string, unknown>)) {
    return {
      ok: false as const,
      error: 'Lifecycle status cannot be updated through field patch. Use a workflow transition.'
    }
  }

  const supabase = createServiceRoleClient() as any

  const { data: existing, error: loadError } = await supabase
    .from('forge_observations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', observationId)
    .maybeSingle()

  if (loadError) return { ok: false as const, error: loadError.message }
  if (!existing) return { ok: false as const, error: 'Observation not found.' }
  if (existing.status === OBSERVATION_LOCKED_STATUS) {
    return { ok: false as const, error: OBSERVATION_CLOSED_READ_ONLY_ERROR }
  }

  if (Number(existing.row_version) !== Number(expectedRowVersion)) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This observation changed after you opened it. Refresh before saving.',
      observation: existing as ObservationRow
    }
  }

  const likelihoodKey =
    input.initialLikelihoodKey !== undefined
      ? input.initialLikelihoodKey
      : existing.initial_likelihood_key
  const severityKey =
    input.initialSeverityKey !== undefined
      ? input.initialSeverityKey
      : existing.initial_severity_key

  const riskTouched =
    input.initialLikelihoodKey !== undefined || input.initialSeverityKey !== undefined

  let riskSnapshot: Record<string, unknown> = {}
  if (riskTouched) {
    const risk = await resolveRiskSnapshot({
      organizationId,
      likelihoodKey,
      severityKey
    })
    if (!risk.ok) return risk
    riskSnapshot = {
      risk_matrix_id: risk.snapshot.risk_matrix_id ?? null,
      risk_matrix_version: risk.snapshot.risk_matrix_version ?? null,
      initial_likelihood_key: risk.snapshot.initial_likelihood_key ?? null,
      initial_severity_key: risk.snapshot.initial_severity_key ?? null,
      initial_risk_score: risk.snapshot.initial_risk_score ?? null,
      initial_risk_band_key: risk.snapshot.initial_risk_band_key ?? null
    }
  }

  const fields: Record<string, unknown> = { ...riskSnapshot }

  if (input.title !== undefined) fields.title = input.title
  if (input.description !== undefined) fields.description = input.description
  if (input.observationType !== undefined) fields.observation_type = input.observationType
  if (input.categoryKey !== undefined) fields.category_key = input.categoryKey
  if (input.workArea !== undefined) fields.work_area = input.workArea
  if (input.occurredAt !== undefined) fields.occurred_at = input.occurredAt
  if (input.immediateAction !== undefined) fields.immediate_action = input.immediateAction
  if (input.locationId !== undefined) fields.location_id = input.locationId
  if (input.divisionId !== undefined) fields.division_id = input.divisionId
  if (input.assignedToPersonnelId !== undefined) {
    fields.assigned_to_personnel_id = input.assignedToPersonnelId
  }
  if (input.assignedToUserId !== undefined) fields.assigned_to_user_id = input.assignedToUserId
  if (input.closureSummary !== undefined) fields.closure_summary = input.closureSummary

  const atomic = await performTransactionalObservationUpdate({
    organizationId,
    observationId,
    expectedRowVersion,
    actorUserId: userId,
    fields
  })

  if (atomic.error || !atomic.result?.ok) {
    const { data: latest } = await supabase
      .from('forge_observations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', observationId)
      .maybeSingle()

    return {
      ok: false as const,
      conflict: Boolean(atomic.conflict || atomic.result?.conflict) as true | false,
      error: atomic.error || 'Unable to update Observation.',
      observation: (latest || existing) as ObservationRow
    }
  }

  const { data: updated, error: reloadError } = await supabase
    .from('forge_observations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', observationId)
    .maybeSingle()

  if (reloadError || !updated) {
    return {
      ok: false as const,
      error: reloadError?.message || 'Unable to reload Observation after update.'
    }
  }

  return { ok: true as const, observation: updated as ObservationRow }
}

export const resolveObservationReporterDisplay = async ({
  organizationId,
  observation,
  canViewReporterIdentity
}: {
  organizationId: string
  observation: ObservationRow | Record<string, unknown>
  canViewReporterIdentity: boolean
}): Promise<ObservationReporterDisplay> => {
  const mode = String(observation.reporting_mode || 'named') === 'anonymous' ? 'anonymous' : 'named'

  if (mode === 'named') {
    const reportedBy = observation.reported_by_user_id
      ? String(observation.reported_by_user_id)
      : null
    return {
      mode: 'named',
      label: reportedBy ? 'Named reporter' : 'Unknown reporter',
      authUserId: reportedBy,
      personnelId: observation.reported_by_personnel_id
        ? String(observation.reported_by_personnel_id)
        : null
    }
  }

  if (!canViewReporterIdentity) {
    return {
      mode: 'anonymous',
      label: 'Anonymous',
      authUserId: null,
      personnelId: null
    }
  }

  const supabase = createServiceRoleClient() as any
  const { data: reporter } = await supabase
    .from('forge_observation_reporters')
    .select('auth_user_id, personnel_id')
    .eq('organization_id', organizationId)
    .eq('observation_id', String(observation.id))
    .maybeSingle()

  const row = asRow<Record<string, unknown>>(reporter)
  return {
    mode: 'anonymous',
    label: row?.auth_user_id ? 'Anonymous (identity revealed)' : 'Anonymous',
    authUserId: row?.auth_user_id ? String(row.auth_user_id) : null,
    personnelId: row?.personnel_id ? String(row.personnel_id) : null
  }
}

export const loadObservation = async ({
  organizationId,
  observationId,
  userId,
  permission,
  canViewReporterIdentity = false
}: {
  organizationId: string
  observationId: string
  userId: string
  permission: EffectivePermission
  canViewReporterIdentity?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: observation, error } = await supabase
    .from('forge_observations')
    .select(
      '*, forge_personnel!forge_observations_assigned_to_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .eq('id', observationId)
    .maybeSingle()

  if (error) throw new Error('Unable to load Observation: ' + error.message)
  if (!observation) return null

  const allowed = await observationWithinScope({
    organizationId,
    userId,
    scope: permission.scope,
    observation
  })
  if (!allowed) return null

  const [{ data: activity, error: activityError }, reporter] = await Promise.all([
    supabase
      .from('forge_observation_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false }),
    resolveObservationReporterDisplay({
      organizationId,
      observation,
      canViewReporterIdentity
    })
  ])

  if (activityError) throw new Error('Unable to load Observation activity: ' + activityError.message)

  return {
    observation: observation as ObservationRow & Record<string, unknown>,
    activity: activity || [],
    reporter
  }
}
