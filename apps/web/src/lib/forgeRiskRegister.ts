import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import {
  calculateRisk,
  ensureTenantDefaultRiskMatrix,
  getActiveRiskMatrix,
  type RiskCalculationResult
} from '@/lib/forgeRiskMatrix'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export type RiskRow = {
  id: string
  organization_id: string
  risk_number: string
  title: string
  description: string
  hazard_description: string | null
  category_key: string | null
  location_id: string | null
  division_id: string | null
  work_area: string | null
  status: string
  risk_matrix_id: string | null
  risk_matrix_version: number | null
  inherent_likelihood_key: string | null
  inherent_severity_key: string | null
  inherent_score: number | null
  inherent_band_key: string | null
  residual_likelihood_key: string | null
  residual_severity_key: string | null
  residual_score: number | null
  residual_band_key: string | null
  owner_personnel_id: string | null
  owner_user_id: string | null
  review_due_at: string | null
  next_review_at: string | null
  last_reviewed_at: string | null
  acceptance_required: boolean
  accepted_by: string | null
  accepted_at: string | null
  acceptance_comment: string | null
  source_type: string | null
  source_reference: string | null
  closure_summary: string | null
  closed_at: string | null
  closed_by: string | null
  row_version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type RiskControlRow = {
  id: string
  organization_id: string
  risk_id: string
  control_type: string
  title: string
  description: string | null
  effectiveness_notes: string | null
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RiskTreatmentRow = {
  id: string
  organization_id: string
  risk_id: string
  treatment_status: string
  title: string
  description: string | null
  owner_personnel_id: string | null
  due_at: string | null
  completed_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RiskListFilters = {
  status?: string | null
  bandKey?: string | null
  locationId?: string | null
  divisionId?: string | null
  search?: string | null
  includeArchived?: boolean
}

export type RiskCreateInput = {
  title: string
  description: string
  hazardDescription?: string | null
  categoryKey?: string | null
  workArea?: string | null
  locationId?: string | null
  divisionId?: string | null
  ownerPersonnelId?: string | null
  ownerUserId?: string | null
  reviewDueAt?: string | null
  sourceType?: string | null
  sourceReference?: string | null
  status?: string
}

export type RiskUpdateInput = {
  title?: string
  description?: string
  hazardDescription?: string | null
  categoryKey?: string | null
  workArea?: string | null
  locationId?: string | null
  divisionId?: string | null
  ownerPersonnelId?: string | null
  ownerUserId?: string | null
  reviewDueAt?: string | null
  nextReviewAt?: string | null
  sourceType?: string | null
  sourceReference?: string | null
  closureSummary?: string | null
  /** @deprecated Lifecycle status is transition-only; ignored by updateRisk. */
  status?: string
}

export type RiskControlInput = {
  controlType: string
  title: string
  description?: string | null
  effectivenessNotes?: string | null
  isActive?: boolean
  sortOrder?: number
}

export type RiskTreatmentInput = {
  treatmentStatus?: string
  title: string
  description?: string | null
  ownerPersonnelId?: string | null
  dueAt?: string | null
  completedAt?: string | null
  notes?: string | null
}

export const riskWithinScope = async ({
  organizationId,
  userId,
  scope,
  risk
}: {
  organizationId: string
  userId: string
  scope: string | null
  risk: {
    organization_id: string
    owner_user_id?: string | null
    created_by?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (risk.organization_id !== organizationId) return false

  if (scope === 'organization') return true

  if (scope === 'own' || scope === 'assigned') {
    return risk.owner_user_id === userId || risk.created_by === userId
  }

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') {
    return Boolean(
      (risk.location_id && assignments.locationIds.includes(risk.location_id)) ||
        risk.owner_user_id === userId ||
        risk.created_by === userId
    )
  }

  if (scope === 'division') {
    return Boolean(
      (risk.division_id && assignments.divisionIds.includes(risk.division_id)) ||
        risk.owner_user_id === userId ||
        risk.created_by === userId
    )
  }

  return false
}

const applyListFilters = (query: any, filters: RiskListFilters) => {
  let next = query

  if (!filters.includeArchived) next = next.is('archived_at', null)
  if (filters.status) next = next.eq('status', filters.status)
  if (filters.bandKey) next = next.eq('inherent_band_key', filters.bandKey)
  if (filters.locationId) next = next.eq('location_id', filters.locationId)
  if (filters.divisionId) next = next.eq('division_id', filters.divisionId)

  const search = filters.search?.trim()
  if (search) {
    next = next.or(
      'risk_number.ilike.%' +
        search +
        '%,title.ilike.%' +
        search +
        '%,description.ilike.%' +
        search +
        '%,hazard_description.ilike.%' +
        search +
        '%,work_area.ilike.%' +
        search +
        '%'
    )
  }

  return next
}

export const listRisks = async ({
  organizationId,
  userId,
  permission,
  filters = {}
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  filters?: RiskListFilters
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_risks')
    .select(
      '*, forge_personnel!forge_risks_owner_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  query = applyListFilters(query, filters)

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
    case 'assigned':
      query = query.or('owner_user_id.eq.' + userId + ',created_by.eq.' + userId)
      break
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!locationIds.length) {
        query = query.or('owner_user_id.eq.' + userId + ',created_by.eq.' + userId)
      } else {
        query = query.or(
          'owner_user_id.eq.' +
            userId +
            ',created_by.eq.' +
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
        query = query.or('owner_user_id.eq.' + userId + ',created_by.eq.' + userId)
      } else {
        query = query.or(
          'owner_user_id.eq.' +
            userId +
            ',created_by.eq.' +
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
  if (error) throw new Error('Unable to load Risk Register: ' + error.message)

  return data || []
}

const resolveAssessmentSnapshot = async ({
  organizationId,
  actorUserId,
  likelihoodKey,
  severityKey,
  existingMatrixId
}: {
  organizationId: string
  actorUserId: string
  likelihoodKey: string
  severityKey: string
  existingMatrixId?: string | null
}): Promise<
  | { ok: true; result: RiskCalculationResult }
  | { ok: false; error: string }
> => {
  let matrixId = existingMatrixId || null

  if (!matrixId) {
    const ensured = await ensureTenantDefaultRiskMatrix({
      organizationId,
      actorUserId
    })
    if (!ensured.ok) return ensured
    matrixId = ensured.matrixId
  }

  const matrix = await getActiveRiskMatrix({ organizationId })
  const calcMatrixId = matrixId || matrix?.id
  if (!calcMatrixId) return { ok: false, error: 'No active risk matrix is configured.' }

  return calculateRisk({
    matrixId: calcMatrixId,
    likelihoodKey,
    severityKey
  })
}

export const createRisk = async ({
  organizationId,
  userId,
  input
}: {
  organizationId: string
  userId: string
  input: RiskCreateInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: riskNumber, error: numberError } = await supabase.rpc('next_forge_risk_number', {
    p_organization_id: organizationId
  })

  if (numberError || !riskNumber) {
    return { ok: false as const, error: numberError?.message || 'Unable to generate Risk number.' }
  }

  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    risk_number: riskNumber,
    title: input.title,
    description: input.description,
    hazard_description: input.hazardDescription || null,
    category_key: input.categoryKey || null,
    work_area: input.workArea || null,
    location_id: input.locationId || null,
    division_id: input.divisionId || null,
    owner_personnel_id: input.ownerPersonnelId || null,
    owner_user_id: input.ownerUserId || null,
    review_due_at: input.reviewDueAt || null,
    source_type: input.sourceType || null,
    source_reference: input.sourceReference || null,
    status: input.status || 'draft',
    created_by: userId,
    updated_by: userId
  }

  const { data: risk, error } = await supabase
    .from('forge_risks')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error || !risk) {
    return { ok: false as const, error: error?.message || 'Unable to create Risk.' }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: risk.id,
    activity_type: 'created',
    message: 'Risk ' + riskNumber + ' created.',
    actor_user_id: userId,
    metadata: { status: risk.status }
  })

  return { ok: true as const, risk: risk as RiskRow }
}

export const updateRisk = async ({
  organizationId,
  userId,
  riskId,
  expectedRowVersion,
  input
}: {
  organizationId: string
  userId: string
  riskId: string
  expectedRowVersion: number
  input: RiskUpdateInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: existing, error: loadError } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (loadError) return { ok: false as const, error: loadError.message }
  if (!existing) return { ok: false as const, error: 'Risk not found.' }

  if ('status' in input && (input as { status?: string }).status !== undefined) {
    return {
      ok: false as const,
      error: 'Lifecycle status cannot be updated through field patch.'
    }
  }

  if (Number(existing.row_version) !== Number(expectedRowVersion)) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: existing as RiskRow
    }
  }

  const patch: Record<string, unknown> = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
    row_version: Number(existing.row_version) + 1
  }

  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.hazardDescription !== undefined) patch.hazard_description = input.hazardDescription
  if (input.categoryKey !== undefined) patch.category_key = input.categoryKey
  if (input.workArea !== undefined) patch.work_area = input.workArea
  if (input.locationId !== undefined) patch.location_id = input.locationId
  if (input.divisionId !== undefined) patch.division_id = input.divisionId
  if (input.ownerPersonnelId !== undefined) patch.owner_personnel_id = input.ownerPersonnelId
  if (input.ownerUserId !== undefined) patch.owner_user_id = input.ownerUserId
  if (input.reviewDueAt !== undefined) patch.review_due_at = input.reviewDueAt
  if (input.nextReviewAt !== undefined) patch.next_review_at = input.nextReviewAt
  if (input.sourceType !== undefined) patch.source_type = input.sourceType
  if (input.sourceReference !== undefined) patch.source_reference = input.sourceReference
  if (input.closureSummary !== undefined) patch.closure_summary = input.closureSummary
  // Lifecycle status is transition-only — never write status from form updates.

  const { data: updated, error } = await supabase
    .from('forge_risks')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .eq('row_version', expectedRowVersion)
    .select('*')
    .maybeSingle()

  if (error) return { ok: false as const, error: error.message }

  if (!updated) {
    const { data: latest } = await supabase
      .from('forge_risks')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', riskId)
      .maybeSingle()

    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: (latest || existing) as RiskRow
    }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: riskId,
    activity_type: 'updated',
    message: 'Risk updated.',
    actor_user_id: userId,
    metadata: { row_version: updated.row_version }
  })

  return { ok: true as const, risk: updated as RiskRow }
}

export const assessInherentRisk = async ({
  organizationId,
  userId,
  riskId,
  expectedRowVersion,
  likelihoodKey,
  severityKey
}: {
  organizationId: string
  userId: string
  riskId: string
  expectedRowVersion: number
  likelihoodKey: string
  severityKey: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: existing, error: loadError } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (loadError) return { ok: false as const, error: loadError.message }
  if (!existing) return { ok: false as const, error: 'Risk not found.' }

  if (Number(existing.row_version) !== Number(expectedRowVersion)) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: existing as RiskRow
    }
  }

  const calculated = await resolveAssessmentSnapshot({
    organizationId,
    actorUserId: userId,
    likelihoodKey,
    severityKey,
    existingMatrixId: existing.risk_matrix_id
  })
  if (!calculated.ok) return calculated

  const { data: updated, error } = await supabase
    .from('forge_risks')
    .update({
      risk_matrix_id: calculated.result.matrixId,
      risk_matrix_version: calculated.result.matrixVersion,
      inherent_likelihood_key: calculated.result.likelihoodKey,
      inherent_severity_key: calculated.result.severityKey,
      inherent_score: calculated.result.score,
      inherent_band_key: calculated.result.bandKey,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      row_version: Number(existing.row_version) + 1
    })
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .eq('row_version', expectedRowVersion)
    .select('*')
    .maybeSingle()

  if (error) return { ok: false as const, error: error.message }
  if (!updated) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: existing as RiskRow
    }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: riskId,
    activity_type: 'inherent_assessed',
    message:
      'Inherent risk assessed: ' +
      calculated.result.bandKey +
      ' (' +
      calculated.result.score +
      ').',
    actor_user_id: userId,
    metadata: {
      likelihood_key: calculated.result.likelihoodKey,
      severity_key: calculated.result.severityKey,
      score: calculated.result.score,
      band_key: calculated.result.bandKey
    }
  })

  return { ok: true as const, risk: updated as RiskRow, assessment: calculated.result }
}

export const assessResidualRisk = async ({
  organizationId,
  userId,
  riskId,
  expectedRowVersion,
  likelihoodKey,
  severityKey
}: {
  organizationId: string
  userId: string
  riskId: string
  expectedRowVersion: number
  likelihoodKey: string
  severityKey: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: existing, error: loadError } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (loadError) return { ok: false as const, error: loadError.message }
  if (!existing) return { ok: false as const, error: 'Risk not found.' }

  if (Number(existing.row_version) !== Number(expectedRowVersion)) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: existing as RiskRow
    }
  }

  const calculated = await resolveAssessmentSnapshot({
    organizationId,
    actorUserId: userId,
    likelihoodKey,
    severityKey,
    existingMatrixId: existing.risk_matrix_id
  })
  if (!calculated.ok) return calculated

  const { data: updated, error } = await supabase
    .from('forge_risks')
    .update({
      risk_matrix_id: calculated.result.matrixId,
      risk_matrix_version: calculated.result.matrixVersion,
      residual_likelihood_key: calculated.result.likelihoodKey,
      residual_severity_key: calculated.result.severityKey,
      residual_score: calculated.result.score,
      residual_band_key: calculated.result.bandKey,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      row_version: Number(existing.row_version) + 1
    })
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .eq('row_version', expectedRowVersion)
    .select('*')
    .maybeSingle()

  if (error) return { ok: false as const, error: error.message }
  if (!updated) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This risk changed after you opened it. Refresh before saving.',
      risk: existing as RiskRow
    }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: riskId,
    activity_type: 'residual_assessed',
    message:
      'Residual risk assessed: ' +
      calculated.result.bandKey +
      ' (' +
      calculated.result.score +
      ').',
    actor_user_id: userId,
    metadata: {
      likelihood_key: calculated.result.likelihoodKey,
      severity_key: calculated.result.severityKey,
      score: calculated.result.score,
      band_key: calculated.result.bandKey
    }
  })

  return { ok: true as const, risk: updated as RiskRow, assessment: calculated.result }
}

export const addRiskControl = async ({
  organizationId,
  userId,
  riskId,
  input
}: {
  organizationId: string
  userId: string
  riskId: string
  input: RiskControlInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: risk } = await supabase
    .from('forge_risks')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!risk) return { ok: false as const, error: 'Risk not found.' }

  const { data: control, error } = await supabase
    .from('forge_risk_controls')
    .insert({
      organization_id: organizationId,
      risk_id: riskId,
      control_type: input.controlType,
      title: input.title,
      description: input.description || null,
      effectiveness_notes: input.effectivenessNotes || null,
      is_active: input.isActive !== false,
      sort_order: input.sortOrder ?? 100,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !control) {
    return { ok: false as const, error: error?.message || 'Unable to add control.' }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: riskId,
    activity_type: 'control_added',
    message: 'Control added: ' + input.title,
    actor_user_id: userId,
    metadata: { control_id: control.id, control_type: input.controlType }
  })

  return { ok: true as const, control: control as RiskControlRow }
}

export const addRiskTreatment = async ({
  organizationId,
  userId,
  riskId,
  input
}: {
  organizationId: string
  userId: string
  riskId: string
  input: RiskTreatmentInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: risk } = await supabase
    .from('forge_risks')
    .select('id, status, row_version')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!risk) return { ok: false as const, error: 'Risk not found.' }

  const { data: treatment, error } = await supabase
    .from('forge_risk_treatments')
    .insert({
      organization_id: organizationId,
      risk_id: riskId,
      treatment_status: input.treatmentStatus || 'planned',
      title: input.title,
      description: input.description || null,
      owner_personnel_id: input.ownerPersonnelId || null,
      due_at: input.dueAt || null,
      completed_at: input.completedAt || null,
      notes: input.notes || null,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !treatment) {
    return { ok: false as const, error: error?.message || 'Unable to add treatment.' }
  }

  await supabase.from('forge_risk_activity').insert({
    organization_id: organizationId,
    risk_id: riskId,
    activity_type: 'treatment_added',
    message: 'Treatment added: ' + input.title,
    actor_user_id: userId,
    metadata: { treatment_id: treatment.id, treatment_status: treatment.treatment_status }
  })

  return { ok: true as const, treatment: treatment as RiskTreatmentRow }
}

export const loadRisk = async ({
  organizationId,
  riskId,
  userId,
  permission
}: {
  organizationId: string
  riskId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: risk, error } = await supabase
    .from('forge_risks')
    .select(
      '*, forge_personnel!forge_risks_owner_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (error) throw new Error('Unable to load Risk: ' + error.message)
  if (!risk) return null

  const allowed = await riskWithinScope({
    organizationId,
    userId,
    scope: permission.scope,
    risk
  })
  if (!allowed) return null

  const [
    { data: controls, error: controlsError },
    { data: treatments, error: treatmentsError },
    { data: activity, error: activityError }
  ] = await Promise.all([
    supabase
      .from('forge_risk_controls')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('risk_id', riskId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('forge_risk_treatments')
      .select(
        '*, forge_personnel!forge_risk_treatments_owner_personnel_id_fkey(first_name, last_name, employee_number)'
      )
      .eq('organization_id', organizationId)
      .eq('risk_id', riskId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('forge_risk_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
  ])

  if (controlsError) throw new Error('Unable to load Risk controls: ' + controlsError.message)
  if (treatmentsError) throw new Error('Unable to load Risk treatments: ' + treatmentsError.message)
  if (activityError) throw new Error('Unable to load Risk activity: ' + activityError.message)

  return {
    risk: risk as RiskRow & Record<string, unknown>,
    controls: (controls || []) as RiskControlRow[],
    treatments: (treatments || []) as Array<RiskTreatmentRow & Record<string, unknown>>,
    activity: activity || []
  }
}
