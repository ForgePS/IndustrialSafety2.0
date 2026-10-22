import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { assertJsaIsExecutableActive } from '@/lib/forgeJsaAssignment'
import {
  calculateRisk,
  ensureTenantDefaultRiskMatrix,
  getActiveRiskMatrix,
  type RiskCalculationResult
} from '@/lib/forgeRiskMatrix'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export type JsaRow = {
  id: string
  organization_id: string
  jsa_number: string
  title: string
  description: string | null
  location_id: string | null
  division_id: string | null
  work_area: string | null
  job_title: string | null
  task_name: string | null
  status: string
  version: number
  parent_jsa_id: string | null
  active_version_id: string | null
  is_template: boolean
  risk_matrix_id: string | null
  risk_matrix_version: number | null
  prepared_by_personnel_id: string | null
  approved_by: string | null
  approved_at: string | null
  effective_at: string | null
  review_due_at: string | null
  row_version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type JsaPpeItemRow = {
  id: string
  organization_id: string
  jsa_id: string
  label: string
  required: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type JsaTrainingRequirementRow = {
  id: string
  organization_id: string
  jsa_id: string
  training_course_id: string
  required: boolean
  created_by: string | null
  created_at: string
}

export type JsaStepRow = {
  id: string
  organization_id: string
  jsa_id: string
  step_number: number
  title: string
  description: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type JsaHazardRow = {
  id: string
  organization_id: string
  jsa_id: string
  step_id: string
  hazard_description: string
  category_key: string | null
  likelihood_key: string | null
  severity_key: string | null
  risk_score: number | null
  risk_band_key: string | null
  residual_likelihood_key: string | null
  residual_severity_key: string | null
  residual_score: number | null
  residual_band_key: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type JsaControlRow = {
  id: string
  organization_id: string
  jsa_id: string
  hazard_id: string
  control_type: string
  title: string
  description: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type JsaExecutionRow = {
  id: string
  organization_id: string
  jsa_id: string
  execution_number: string
  status: string
  started_at: string | null
  completed_at: string | null
  stopped_at: string | null
  stopped_by: string | null
  stop_reason: string | null
  stop_requires_revision: boolean
  row_version: number
  location_id: string | null
  lead_personnel_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type JsaExecutionParticipantRow = {
  id: string
  organization_id: string
  execution_id: string
  personnel_id: string
  user_id: string | null
  role: string
  acknowledged_at: string | null
  acknowledgment_id: string | null
  requires_acknowledgement: boolean
  created_at: string
}

export type JsaTrainingWarning = {
  severity: 'WARNING'
  personnelId: string
  personnelName: string | null
  trainingCourseId: string
  courseTitle: string | null
  message: string
  hasAssignment: boolean
  hasCompletion: boolean
}

export type JsaListFilters = {
  status?: string | null
  locationId?: string | null
  divisionId?: string | null
  search?: string | null
  includeArchived?: boolean
}

export type JsaCreateInput = {
  title: string
  description?: string | null
  jobTitle?: string | null
  taskName?: string | null
  workArea?: string | null
  locationId?: string | null
  divisionId?: string | null
  preparedByPersonnelId?: string | null
  effectiveAt?: string | null
  reviewDueAt?: string | null
  /** Templates only — operational creates ignore this and always start DRAFT. */
  isTemplate?: boolean
}

export type JsaUpdateInput = {
  title?: string
  description?: string | null
  jobTitle?: string | null
  taskName?: string | null
  workArea?: string | null
  locationId?: string | null
  divisionId?: string | null
  preparedByPersonnelId?: string | null
  effectiveAt?: string | null
  reviewDueAt?: string | null
  isTemplate?: boolean
}

const assertJsaDraftMutable = (status: string | null | undefined) => {
  if (status !== 'draft') {
    return {
      ok: false as const,
      error: 'JSA content can only be modified while status is draft.'
    }
  }
  return { ok: true as const }
}

export const jsaWithinScope = async ({
  organizationId,
  userId,
  scope,
  jsa
}: {
  organizationId: string
  userId: string
  scope: string | null
  jsa: {
    organization_id: string
    created_by?: string | null
    prepared_by_personnel_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (jsa.organization_id !== organizationId) return false

  if (scope === 'organization') return true

  if (scope === 'own' || scope === 'assigned') {
    if (jsa.created_by === userId) return true

    if (jsa.prepared_by_personnel_id) {
      const supabase = createServiceRoleClient() as any
      const { data: person } = await supabase
        .from('forge_personnel')
        .select('auth_user_id')
        .eq('organization_id', organizationId)
        .eq('id', jsa.prepared_by_personnel_id)
        .maybeSingle()
      if (person?.auth_user_id === userId) return true
    }

    return false
  }

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') {
    return Boolean(
      (jsa.location_id && assignments.locationIds.includes(jsa.location_id)) ||
        jsa.created_by === userId
    )
  }

  if (scope === 'division') {
    return Boolean(
      (jsa.division_id && assignments.divisionIds.includes(jsa.division_id)) ||
        jsa.created_by === userId
    )
  }

  return false
}

const applyListFilters = (query: any, filters: JsaListFilters) => {
  let next = query

  if (!filters.includeArchived) next = next.is('archived_at', null)
  if (filters.status) next = next.eq('status', filters.status)
  if (filters.locationId) next = next.eq('location_id', filters.locationId)
  if (filters.divisionId) next = next.eq('division_id', filters.divisionId)

  const search = filters.search?.trim()
  if (search) {
    next = next.or(
      'jsa_number.ilike.%' +
        search +
        '%,title.ilike.%' +
        search +
        '%,description.ilike.%' +
        search +
        '%,job_title.ilike.%' +
        search +
        '%,task_name.ilike.%' +
        search +
        '%,work_area.ilike.%' +
        search +
        '%'
    )
  }

  return next
}

export const listJsas = async ({
  organizationId,
  userId,
  permission,
  filters = {}
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  filters?: JsaListFilters
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_jsas')
    .select(
      '*, forge_personnel!forge_jsas_prepared_by_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  query = applyListFilters(query, filters)

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
    case 'assigned': {
      const { data: ownPersonnel } = await supabase
        .from('forge_personnel')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (ownPersonnel?.id) {
        query = query.or(
          'created_by.eq.' + userId + ',prepared_by_personnel_id.eq.' + ownPersonnel.id
        )
      } else {
        query = query.eq('created_by', userId)
      }
      break
    }
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!locationIds.length) {
        query = query.eq('created_by', userId)
      } else {
        query = query.or(
          'created_by.eq.' + userId + ',location_id.in.(' + locationIds.join(',') + ')'
        )
      }
      break
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!divisionIds.length) {
        query = query.eq('created_by', userId)
      } else {
        query = query.or(
          'created_by.eq.' + userId + ',division_id.in.(' + divisionIds.join(',') + ')'
        )
      }
      break
    }
    default:
      return []
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load JSAs: ' + error.message)

  return data || []
}

const resolveRiskSnapshot = async ({
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
}): Promise<{ ok: true; result: RiskCalculationResult } | { ok: false; error: string }> => {
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

export const createJsa = async ({
  organizationId,
  userId,
  input
}: {
  organizationId: string
  userId: string
  input: JsaCreateInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsaNumber, error: numberError } = await supabase.rpc('next_forge_jsa_number', {
    p_organization_id: organizationId
  })

  if (numberError || !jsaNumber) {
    return { ok: false as const, error: numberError?.message || 'Unable to generate JSA number.' }
  }

  const ensured = await ensureTenantDefaultRiskMatrix({
    organizationId,
    actorUserId: userId
  })

  let riskMatrixId: string | null = null
  let riskMatrixVersion: number | null = null
  if (ensured.ok) {
    const matrix = await getActiveRiskMatrix({ organizationId })
    riskMatrixId = ensured.matrixId
    riskMatrixVersion = matrix?.version ?? null
  }

  const { data: jsa, error } = await supabase
    .from('forge_jsas')
    .insert({
      organization_id: organizationId,
      jsa_number: jsaNumber,
      title: input.title,
      description: input.description || null,
      job_title: input.jobTitle || null,
      task_name: input.taskName || null,
      work_area: input.workArea || null,
      location_id: input.locationId || null,
      division_id: input.divisionId || null,
      prepared_by_personnel_id: input.preparedByPersonnelId || null,
      effective_at: input.effectiveAt || null,
      review_due_at: input.reviewDueAt || null,
      // Absolute invariant: operational creates always start DRAFT. Status is never client-supplied.
      status: 'draft',
      version: 1,
      is_template: Boolean(input.isTemplate),
      risk_matrix_id: riskMatrixId,
      risk_matrix_version: riskMatrixVersion,
      created_by: userId,
      updated_by: userId
    })
    .select('*')
    .single()

  if (error || !jsa) {
    return { ok: false as const, error: error?.message || 'Unable to create JSA.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsa.id,
    activity_type: 'created',
    message: 'JSA ' + jsaNumber + ' created.',
    actor_user_id: userId,
    metadata: { status: jsa.status, version: jsa.version }
  })

  return { ok: true as const, jsa: jsa as JsaRow }
}

export const updateJsa = async ({
  organizationId,
  userId,
  jsaId,
  expectedRowVersion,
  input
}: {
  organizationId: string
  userId: string
  jsaId: string
  expectedRowVersion: number
  input: JsaUpdateInput
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: existing, error: loadError } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (loadError) return { ok: false as const, error: loadError.message }
  if (!existing) return { ok: false as const, error: 'JSA not found.' }

  const draftGate = assertJsaDraftMutable(existing.status)
  if (!draftGate.ok) return draftGate

  if (Number(existing.row_version) !== Number(expectedRowVersion)) {
    return {
      ok: false as const,
      conflict: true as const,
      error: 'This JSA changed after you opened it. Refresh before saving.',
      jsa: existing as JsaRow
    }
  }

  const patch: Record<string, unknown> = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
    row_version: Number(existing.row_version) + 1
  }

  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.jobTitle !== undefined) patch.job_title = input.jobTitle
  if (input.taskName !== undefined) patch.task_name = input.taskName
  if (input.workArea !== undefined) patch.work_area = input.workArea
  if (input.locationId !== undefined) patch.location_id = input.locationId
  if (input.divisionId !== undefined) patch.division_id = input.divisionId
  if (input.preparedByPersonnelId !== undefined) {
    patch.prepared_by_personnel_id = input.preparedByPersonnelId
  }
  if (input.effectiveAt !== undefined) patch.effective_at = input.effectiveAt
  if (input.reviewDueAt !== undefined) patch.review_due_at = input.reviewDueAt
  if (input.isTemplate !== undefined) patch.is_template = Boolean(input.isTemplate)

  const { data: updated, error } = await supabase
    .from('forge_jsas')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .eq('row_version', expectedRowVersion)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle()

  if (error) return { ok: false as const, error: error.message }

  if (!updated) {
    const { data: latest } = await supabase
      .from('forge_jsas')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', jsaId)
      .maybeSingle()

    return {
      ok: false as const,
      conflict: true as const,
      error: 'This JSA changed after you opened it. Refresh before saving.',
      jsa: (latest || existing) as JsaRow
    }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsaId,
    activity_type: 'updated',
    message: 'JSA updated.',
    actor_user_id: userId,
    metadata: { row_version: updated.row_version, status: updated.status }
  })

  return { ok: true as const, jsa: updated as JsaRow }
}

export const addStep = async ({
  organizationId,
  userId,
  jsaId,
  title,
  description,
  stepNumber,
  sortOrder
}: {
  organizationId: string
  userId: string
  jsaId: string
  title: string
  description?: string | null
  stepNumber?: number
  sortOrder?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }
  const draftGate = assertJsaDraftMutable(jsa.status)
  if (!draftGate.ok) return draftGate

  let nextStepNumber = stepNumber
  if (!nextStepNumber) {
    const { data: last } = await supabase
      .from('forge_jsa_steps')
      .select('step_number')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('step_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    nextStepNumber = Number(last?.step_number || 0) + 1
  }

  const { data: step, error } = await supabase
    .from('forge_jsa_steps')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      step_number: nextStepNumber,
      title,
      description: description || null,
      sort_order: sortOrder ?? nextStepNumber * 10,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !step) {
    return { ok: false as const, error: error?.message || 'Unable to add step.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsaId,
    activity_type: 'step_added',
    message: 'Step ' + nextStepNumber + ' added: ' + title,
    actor_user_id: userId,
    metadata: { step_id: step.id, step_number: nextStepNumber }
  })

  return { ok: true as const, step: step as JsaStepRow }
}

export const addHazard = async ({
  organizationId,
  userId,
  jsaId,
  stepId,
  hazardDescription,
  categoryKey,
  likelihoodKey,
  severityKey,
  residualLikelihoodKey,
  residualSeverityKey,
  sortOrder
}: {
  organizationId: string
  userId: string
  jsaId: string
  stepId: string
  hazardDescription: string
  categoryKey?: string | null
  likelihoodKey: string
  severityKey: string
  residualLikelihoodKey?: string | null
  residualSeverityKey?: string | null
  sortOrder?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status, risk_matrix_id')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }
  const draftGate = assertJsaDraftMutable(jsa.status)
  if (!draftGate.ok) return draftGate

  const { data: step } = await supabase
    .from('forge_jsa_steps')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('jsa_id', jsaId)
    .eq('id', stepId)
    .maybeSingle()

  if (!step) return { ok: false as const, error: 'JSA step not found.' }

  const calculated = await resolveRiskSnapshot({
    organizationId,
    actorUserId: userId,
    likelihoodKey,
    severityKey,
    existingMatrixId: jsa.risk_matrix_id
  })
  if (!calculated.ok) return calculated

  let residual: RiskCalculationResult | null = null
  if (residualLikelihoodKey && residualSeverityKey) {
    const residualCalc = await resolveRiskSnapshot({
      organizationId,
      actorUserId: userId,
      likelihoodKey: residualLikelihoodKey,
      severityKey: residualSeverityKey,
      existingMatrixId: calculated.result.matrixId
    })
    if (!residualCalc.ok) return residualCalc
    residual = residualCalc.result
  }

  if (!jsa.risk_matrix_id) {
    await supabase
      .from('forge_jsas')
      .update({
        risk_matrix_id: calculated.result.matrixId,
        risk_matrix_version: calculated.result.matrixVersion,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)
      .eq('id', jsaId)
  }

  const { data: hazard, error } = await supabase
    .from('forge_jsa_hazards')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      step_id: stepId,
      hazard_description: hazardDescription,
      category_key: categoryKey || null,
      likelihood_key: calculated.result.likelihoodKey,
      severity_key: calculated.result.severityKey,
      risk_score: calculated.result.score,
      risk_band_key: calculated.result.bandKey,
      residual_likelihood_key: residual?.likelihoodKey || null,
      residual_severity_key: residual?.severityKey || null,
      residual_score: residual?.score ?? null,
      residual_band_key: residual?.bandKey || null,
      sort_order: sortOrder ?? 100,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !hazard) {
    return { ok: false as const, error: error?.message || 'Unable to add hazard.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsaId,
    activity_type: 'hazard_added',
    message:
      'Hazard added: ' +
      calculated.result.bandKey +
      ' (' +
      calculated.result.score +
      ').',
    actor_user_id: userId,
    metadata: {
      hazard_id: hazard.id,
      step_id: stepId,
      score: calculated.result.score,
      band_key: calculated.result.bandKey
    }
  })

  return {
    ok: true as const,
    hazard: hazard as JsaHazardRow,
    assessment: calculated.result
  }
}

export const addControl = async ({
  organizationId,
  userId,
  jsaId,
  hazardId,
  controlType,
  title,
  description,
  sortOrder
}: {
  organizationId: string
  userId: string
  jsaId: string
  hazardId: string
  controlType: string
  title: string
  description?: string | null
  sortOrder?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }
  const draftGate = assertJsaDraftMutable(jsa.status)
  if (!draftGate.ok) return draftGate

  const { data: hazard } = await supabase
    .from('forge_jsa_hazards')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('jsa_id', jsaId)
    .eq('id', hazardId)
    .maybeSingle()

  if (!hazard) return { ok: false as const, error: 'JSA hazard not found.' }

  const { data: control, error } = await supabase
    .from('forge_jsa_controls')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      hazard_id: hazardId,
      control_type: controlType,
      title,
      description: description || null,
      sort_order: sortOrder ?? 100,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !control) {
    return { ok: false as const, error: error?.message || 'Unable to add control.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsaId,
    activity_type: 'control_added',
    message: 'Control added: ' + title,
    actor_user_id: userId,
    metadata: { control_id: control.id, hazard_id: hazardId, control_type: controlType }
  })

  return { ok: true as const, control: control as JsaControlRow }
}

export const addPpeItem = async ({
  organizationId,
  userId,
  jsaId,
  label,
  required = true,
  sortOrder
}: {
  organizationId: string
  userId: string
  jsaId: string
  label: string
  required?: boolean
  sortOrder?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }
  const draftGate = assertJsaDraftMutable(jsa.status)
  if (!draftGate.ok) return draftGate

  const cleaned = label.trim()
  if (!cleaned) return { ok: false as const, error: 'PPE label is required.' }

  const { data: item, error } = await supabase
    .from('forge_jsa_ppe_items')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      label: cleaned,
      required: Boolean(required),
      sort_order: sortOrder ?? 100,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !item) {
    return { ok: false as const, error: error?.message || 'Unable to add PPE item.' }
  }

  return { ok: true as const, item: item as JsaPpeItemRow }
}

export const addTrainingRequirement = async ({
  organizationId,
  userId,
  jsaId,
  trainingCourseId,
  required = true
}: {
  organizationId: string
  userId: string
  jsaId: string
  trainingCourseId: string
  required?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }
  const draftGate = assertJsaDraftMutable(jsa.status)
  if (!draftGate.ok) return draftGate

  const { data: course } = await supabase
    .from('forge_training_courses')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', trainingCourseId)
    .maybeSingle()

  if (!course) return { ok: false as const, error: 'Training course is invalid for this organization.' }

  const { data: row, error } = await supabase
    .from('forge_jsa_training_requirements')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      training_course_id: trainingCourseId,
      required: Boolean(required),
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !row) {
    return { ok: false as const, error: error?.message || 'Unable to add training requirement.' }
  }

  return { ok: true as const, requirement: row as JsaTrainingRequirementRow }
}

const resolveRootJsaId = async ({
  organizationId,
  jsaId
}: {
  organizationId: string
  jsaId: string
}): Promise<string> => {
  const supabase = createServiceRoleClient() as any

  const { data: revision } = await supabase
    .from('forge_jsa_revisions')
    .select('jsa_id')
    .eq('organization_id', organizationId)
    .eq('version_jsa_id', jsaId)
    .maybeSingle()

  if (revision?.jsa_id) return String(revision.jsa_id)

  let currentId = jsaId
  for (let i = 0; i < 50; i++) {
    const { data: row } = await supabase
      .from('forge_jsas')
      .select('id, parent_jsa_id')
      .eq('organization_id', organizationId)
      .eq('id', currentId)
      .maybeSingle()

    if (!row?.parent_jsa_id) return String(row?.id || jsaId)
    currentId = String(row.parent_jsa_id)
  }

  return jsaId
}

export const createRevision = async ({
  organizationId,
  userId,
  jsaId,
  changeSummary,
  idempotencyKey
}: {
  organizationId: string
  userId: string
  jsaId: string
  changeSummary?: string | null
  idempotencyKey?: string | null
}) => {
  const supabase = createServiceRoleClient() as any

  const source = await loadJsa({
    organizationId,
    jsaId,
    userId,
    permission: { permissionKey: 'jsa_jha.edit', allowed: true, scope: 'organization' } as any,
    skipScopeCheck: true
  })

  if (!source) return { ok: false as const, error: 'JSA not found.' }

  const { data, error } = await supabase.rpc('forge_create_jsa_revision', {
    p_organization_id: organizationId,
    p_source_jsa_id: jsaId,
    p_actor_user_id: userId,
    p_change_summary: changeSummary || null,
    p_idempotency_key: idempotencyKey || null,
    p_fail_after: null
  })

  if (error) {
    return { ok: false as const, error: error.message || 'Unable to create revision.' }
  }

  const result = data as {
    ok?: boolean
    error?: string
    jsa_id?: string
    version?: number
    status?: string
    duplicate?: boolean
  }

  if (!result?.ok || !result.jsa_id) {
    return { ok: false as const, error: result?.error || 'Unable to create revision.' }
  }

  const { data: revisionJsa } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', result.jsa_id)
    .maybeSingle()

  if (!revisionJsa) {
    return { ok: false as const, error: 'Revision created but could not be reloaded.' }
  }

  return {
    ok: true as const,
    jsa: revisionJsa as JsaRow,
    duplicate: Boolean(result.duplicate)
  }
}

export const createExecution = async ({
  organizationId,
  userId,
  jsaId,
  locationId,
  leadPersonnelId,
  notes,
  participantPersonnelIds
}: {
  organizationId: string
  userId: string
  jsaId: string
  locationId?: string | null
  leadPersonnelId?: string | null
  notes?: string | null
  participantPersonnelIds?: string[]
}) => {
  const supabase = createServiceRoleClient() as any

  const executable = await assertJsaIsExecutableActive({ organizationId, jsaId })
  if (!executable.ok) return { ok: false as const, error: executable.error }

  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status, location_id, parent_jsa_id')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false as const, error: 'JSA not found.' }

  const { data: executionNumber, error: numberError } = await supabase.rpc(
    'next_forge_jsa_execution_number',
    { p_organization_id: organizationId }
  )

  if (numberError || !executionNumber) {
    return {
      ok: false as const,
      error: numberError?.message || 'Unable to generate execution number.'
    }
  }

  let leadUserId: string | null = null
  if (leadPersonnelId) {
    const { data: lead } = await supabase
      .from('forge_personnel')
      .select('id, auth_user_id')
      .eq('organization_id', organizationId)
      .eq('id', leadPersonnelId)
      .maybeSingle()
    if (!lead) return { ok: false as const, error: 'Lead personnel is invalid for this organization.' }
    leadUserId = lead.auth_user_id || null
  }

  const { data: execution, error } = await supabase
    .from('forge_jsa_executions')
    .insert({
      organization_id: organizationId,
      jsa_id: jsaId,
      execution_number: executionNumber,
      status: 'planned',
      location_id: locationId || jsa.location_id || null,
      lead_personnel_id: leadPersonnelId || null,
      notes: notes || null,
      created_by: userId
    })
    .select('*')
    .single()

  if (error || !execution) {
    return { ok: false as const, error: error?.message || 'Unable to create execution.' }
  }

  const participantIds = new Set(participantPersonnelIds || [])
  if (leadPersonnelId) participantIds.add(leadPersonnelId)

  for (const personnelId of participantIds) {
    const { data: person } = await supabase
      .from('forge_personnel')
      .select('id, auth_user_id')
      .eq('organization_id', organizationId)
      .eq('id', personnelId)
      .maybeSingle()

    if (!person) continue

    await supabase.from('forge_jsa_execution_participants').insert({
      organization_id: organizationId,
      execution_id: execution.id,
      personnel_id: person.id,
      user_id: person.auth_user_id || null,
      role: personnelId === leadPersonnelId ? 'lead' : 'crew'
    })
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: jsaId,
    activity_type: 'execution_planned',
    message: 'Execution ' + executionNumber + ' planned.',
    actor_user_id: userId,
    metadata: { execution_id: execution.id, lead_user_id: leadUserId }
  })

  return { ok: true as const, execution: execution as JsaExecutionRow }
}

/** Crew may only change before work starts or while work is stopped (re-briefing required). */
export const JSA_EXECUTION_CREW_EDITABLE_STATUSES = ['planned', 'briefing', 'stopped'] as const

export const addExecutionParticipant = async ({
  organizationId,
  userId,
  jsaId,
  executionId,
  personnelId,
  role = 'crew',
  requiresAcknowledgement = true
}: {
  organizationId: string
  userId: string
  /** The JSA the caller was authorized against; the execution must belong to it. */
  jsaId: string
  executionId: string
  personnelId: string
  role?: string
  requiresAcknowledgement?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: execution } = await supabase
    .from('forge_jsa_executions')
    .select('id, jsa_id, status')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .eq('jsa_id', jsaId)
    .maybeSingle()

  if (!execution) return { ok: false as const, error: 'Execution not found.' }
  if (!(JSA_EXECUTION_CREW_EDITABLE_STATUSES as readonly string[]).includes(execution.status)) {
    return {
      ok: false as const,
      error:
        'Crew can only be added while the execution is planned, briefing, or stopped. Current status: ' +
        execution.status +
        '.'
    }
  }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id, auth_user_id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .maybeSingle()

  if (!person) return { ok: false as const, error: 'Personnel is invalid for this organization.' }

  const cleanedRole = role === 'lead' ? 'lead' : 'crew'

  const { data: participant, error } = await supabase
    .from('forge_jsa_execution_participants')
    .insert({
      organization_id: organizationId,
      execution_id: executionId,
      personnel_id: person.id,
      user_id: person.auth_user_id || null,
      role: cleanedRole,
      requires_acknowledgement: Boolean(requiresAcknowledgement)
    })
    .select('*')
    .single()

  if (error || !participant) {
    return { ok: false as const, error: error?.message || 'Unable to add participant.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: execution.jsa_id,
    activity_type: 'crew_added',
    message: 'Crew member added to execution.',
    actor_user_id: userId,
    metadata: { execution_id: executionId, participant_id: participant.id, role: cleanedRole }
  })

  return { ok: true as const, participant: participant as JsaExecutionParticipantRow }
}

export const removeExecutionParticipant = async ({
  organizationId,
  userId,
  jsaId,
  executionId,
  participantId
}: {
  organizationId: string
  userId: string
  jsaId: string
  executionId: string
  participantId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: execution } = await supabase
    .from('forge_jsa_executions')
    .select('id, jsa_id, status')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .eq('jsa_id', jsaId)
    .maybeSingle()

  if (!execution) return { ok: false as const, error: 'Execution not found.' }
  if (['completed', 'canceled', 'active'].includes(execution.status)) {
    return { ok: false as const, error: 'Cannot remove crew from an active or closed execution.' }
  }

  const { error } = await supabase
    .from('forge_jsa_execution_participants')
    .delete()
    .eq('organization_id', organizationId)
    .eq('execution_id', executionId)
    .eq('id', participantId)

  if (error) return { ok: false as const, error: error.message }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: execution.jsa_id,
    activity_type: 'crew_removed',
    message: 'Crew member removed from execution.',
    actor_user_id: userId,
    metadata: { execution_id: executionId, participant_id: participantId }
  })

  return { ok: true as const }
}

export const acknowledgeParticipant = async ({
  organizationId,
  userId,
  jsaId,
  executionId,
  personnelId,
  acknowledgmentId = null
}: {
  organizationId: string
  userId: string
  jsaId: string
  executionId: string
  personnelId?: string | null
  acknowledgmentId?: string | null
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: execution } = await supabase
    .from('forge_jsa_executions')
    .select('id, jsa_id, status')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .eq('jsa_id', jsaId)
    .maybeSingle()

  if (!execution) return { ok: false as const, error: 'Execution not found.' }
  if (['completed', 'canceled'].includes(execution.status)) {
    return { ok: false as const, error: 'This execution is no longer open for acknowledgment.' }
  }

  let query = supabase
    .from('forge_jsa_execution_participants')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('execution_id', executionId)

  if (personnelId) {
    query = query.eq('personnel_id', personnelId)
  } else {
    query = query.eq('user_id', userId)
  }

  const { data: participant } = await query.maybeSingle()
  if (!participant) {
    return { ok: false as const, error: 'You are not a participant on this execution.' }
  }

  if (participant.user_id && participant.user_id !== userId) {
    return { ok: false as const, error: 'You may only acknowledge your own participation.' }
  }

  if (participant.acknowledged_at && participant.acknowledgment_id) {
    return { ok: true as const, participant: participant as JsaExecutionParticipantRow }
  }

  let ackId = acknowledgmentId
  if (!ackId) {
    const { data: ack, error: ackError } = await supabase
      .from('forge_record_acknowledgements')
      .insert({
        organization_id: organizationId,
        resource_type: 'jsa',
        resource_id: execution.jsa_id,
        resource_version: executionId,
        acknowledgement_type: 'execution_briefing',
        user_id: userId,
        personnel_id: participant.personnel_id,
        signature_method: 'click_confirm',
        signature_metadata: { execution_id: executionId, participant_id: participant.id }
      })
      .select('id')
      .single()

    if (ackError?.code === '23505') {
      const { data: existingAck } = await supabase
        .from('forge_record_acknowledgements')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('resource_type', 'jsa')
        .eq('resource_id', execution.jsa_id)
        .eq('acknowledgement_type', 'execution_briefing')
        .eq('user_id', userId)
        .eq('resource_version', executionId)
        .maybeSingle()
      ackId = existingAck?.id || null
    } else if (ackError || !ack) {
      return { ok: false as const, error: ackError?.message || 'Unable to record acknowledgment.' }
    } else {
      ackId = ack.id
    }
  }

  const { data: updated, error } = await supabase
    .from('forge_jsa_execution_participants')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledgment_id: ackId
    })
    .eq('organization_id', organizationId)
    .eq('id', participant.id)
    .select('*')
    .single()

  if (error || !updated) {
    return { ok: false as const, error: error?.message || 'Unable to acknowledge participation.' }
  }

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: execution.jsa_id,
    activity_type: 'participant_acknowledged',
    message: 'Participant acknowledged execution.',
    actor_user_id: userId,
    metadata: {
      execution_id: executionId,
      participant_id: updated.id,
      acknowledgment_id: ackId
    }
  })

  return { ok: true as const, participant: updated as JsaExecutionParticipantRow }
}

export const completeExecution = async ({
  organizationId,
  userId,
  jsaId,
  executionId,
  notes
}: {
  organizationId: string
  userId: string
  jsaId: string
  executionId: string
  notes?: string | null
}) => {
  const { performJsaExecutionTransition } = await import('@/lib/forgeJsaWorkflowSync')
  const supabase = createServiceRoleClient() as any

  const { data: execution } = await supabase
    .from('forge_jsa_executions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .eq('jsa_id', jsaId)
    .maybeSingle()

  if (!execution) return { ok: false as const, error: 'Execution not found.' }
  if (execution.status === 'completed') {
    return { ok: true as const, execution: execution as JsaExecutionRow }
  }

  const result = await performJsaExecutionTransition({
    organizationId,
    executionId,
    fromStatus: execution.status,
    toStatus: 'completed',
    actorUserId: userId,
    patch: notes !== undefined ? { notes } : {},
    expectedRowVersion: Number(execution.row_version)
  })

  if (!result.ok) return { ok: false as const, error: result.error }

  const { data: updated } = await supabase
    .from('forge_jsa_executions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .maybeSingle()

  return { ok: true as const, execution: (updated || execution) as JsaExecutionRow }
}

export const getJsaTrainingWarnings = async ({
  organizationId,
  jsaId,
  personnelIds
}: {
  organizationId: string
  jsaId: string
  personnelIds: string[]
}): Promise<JsaTrainingWarning[]> => {
  if (!personnelIds.length) return []

  const supabase = createServiceRoleClient() as any

  const { data: requirements } = await supabase
    .from('forge_jsa_training_requirements')
    .select('*, forge_training_courses(title, course_code)')
    .eq('organization_id', organizationId)
    .eq('jsa_id', jsaId)
    .eq('required', true)

  if (!requirements?.length) return []

  const { data: personnel } = await supabase
    .from('forge_personnel')
    .select('id, first_name, last_name')
    .eq('organization_id', organizationId)
    .in('id', personnelIds)

  const personMap = new Map(
    (personnel || []).map((p: any) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ') || null
    ])
  )

  const warnings: JsaTrainingWarning[] = []

  for (const req of requirements) {
    const courseId = req.training_course_id as string
    const courseTitle =
      (req.forge_training_courses as { title?: string } | null)?.title || null

    for (const personnelId of personnelIds) {
      const { data: completions } = await supabase
        .from('forge_training_completions')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('personnel_id', personnelId)
        .eq('course_id', courseId)
        .limit(1)

      const { data: assignments } = await supabase
        .from('forge_training_assignments')
        .select('id, status')
        .eq('organization_id', organizationId)
        .eq('personnel_id', personnelId)
        .eq('course_id', courseId)
        .limit(1)

      const hasCompletion = Boolean(completions?.length)
      const hasAssignment = Boolean(assignments?.length)

      if (!hasCompletion) {
        warnings.push({
          severity: 'WARNING',
          personnelId,
          personnelName: (personMap.get(personnelId) as string | null) || null,
          trainingCourseId: courseId,
          courseTitle,
          message:
            (personMap.get(personnelId) || 'Crew member') +
            ' may be missing required training' +
            (courseTitle ? ': ' + courseTitle : '') +
            '.',
          hasAssignment,
          hasCompletion
        })
      }
    }
  }

  return warnings
}

export const createJsaFromTemplate = async ({
  organizationId,
  userId,
  templateJsaId
}: {
  organizationId: string
  userId: string
  templateJsaId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: template } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', templateJsaId)
    .eq('is_template', true)
    .maybeSingle()

  if (!template) return { ok: false as const, error: 'JSA template not found.' }

  const cloned = await createRevision({
    organizationId,
    userId,
    jsaId: templateJsaId,
    changeSummary: 'Created from template ' + template.jsa_number
  })

  if (!cloned.ok) return cloned

  // Operational draft from template is not a revision lineage of the template.
  await supabase
    .from('forge_jsas')
    .update({
      parent_jsa_id: null,
      version: 1,
      is_template: false,
      title: template.title,
      updated_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', cloned.jsa.id)

  await supabase
    .from('forge_jsa_revisions')
    .delete()
    .eq('organization_id', organizationId)
    .eq('version_jsa_id', cloned.jsa.id)

  const { data: refreshed } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('id', cloned.jsa.id)
    .maybeSingle()

  await supabase.from('forge_jsa_activity').insert({
    organization_id: organizationId,
    jsa_id: cloned.jsa.id,
    activity_type: 'created_from_template',
    message: 'Operational draft created from template ' + template.jsa_number + '.',
    actor_user_id: userId,
    metadata: { template_jsa_id: templateJsaId }
  })

  return { ok: true as const, jsa: (refreshed || cloned.jsa) as JsaRow }
}

export const loadJsa = async ({
  organizationId,
  jsaId,
  userId,
  permission,
  skipScopeCheck = false
}: {
  organizationId: string
  jsaId: string
  userId: string
  permission: EffectivePermission
  skipScopeCheck?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa, error } = await supabase
    .from('forge_jsas')
    .select(
      '*, forge_personnel!forge_jsas_prepared_by_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)'
    )
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (error) throw new Error('Unable to load JSA: ' + error.message)
  if (!jsa) return null

  if (!skipScopeCheck) {
    const allowed = await jsaWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      jsa
    })
    if (!allowed) return null
  }

  const [
    { data: steps, error: stepsError },
    { data: hazards, error: hazardsError },
    { data: controls, error: controlsError },
    { data: ppeItems, error: ppeError },
    { data: trainingRequirements, error: trainingError },
    { data: revisions, error: revisionsError },
    { data: executions, error: executionsError },
    { data: activity, error: activityError }
  ] = await Promise.all([
    supabase
      .from('forge_jsa_steps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('sort_order', { ascending: true })
      .order('step_number', { ascending: true }),
    supabase
      .from('forge_jsa_hazards')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('forge_jsa_controls')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('forge_jsa_ppe_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('forge_jsa_training_requirements')
      .select('*, forge_training_courses(title, course_code)')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('created_at', { ascending: true }),
    supabase
      .from('forge_jsa_revisions')
      .select('*')
      .eq('organization_id', organizationId)
      .or('jsa_id.eq.' + jsaId + ',version_jsa_id.eq.' + jsaId)
      .order('version', { ascending: false }),
    supabase
      .from('forge_jsa_executions')
      .select(
        '*, forge_personnel!forge_jsa_executions_lead_personnel_id_fkey(first_name, last_name, employee_number)'
      )
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('forge_jsa_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('jsa_id', jsaId)
      .order('created_at', { ascending: false })
  ])

  if (stepsError) throw new Error('Unable to load JSA steps: ' + stepsError.message)
  if (hazardsError) throw new Error('Unable to load JSA hazards: ' + hazardsError.message)
  if (controlsError) throw new Error('Unable to load JSA controls: ' + controlsError.message)
  if (ppeError) throw new Error('Unable to load JSA PPE items: ' + ppeError.message)
  if (trainingError) {
    throw new Error('Unable to load JSA training requirements: ' + trainingError.message)
  }
  if (revisionsError) throw new Error('Unable to load JSA revisions: ' + revisionsError.message)
  if (executionsError) throw new Error('Unable to load JSA executions: ' + executionsError.message)
  if (activityError) throw new Error('Unable to load JSA activity: ' + activityError.message)

  return {
    jsa: jsa as JsaRow & Record<string, unknown>,
    steps: (steps || []) as JsaStepRow[],
    hazards: (hazards || []) as JsaHazardRow[],
    controls: (controls || []) as JsaControlRow[],
    ppeItems: (ppeItems || []) as JsaPpeItemRow[],
    trainingRequirements: (trainingRequirements || []) as Array<
      JsaTrainingRequirementRow & Record<string, unknown>
    >,
    revisions: revisions || [],
    executions: (executions || []) as Array<JsaExecutionRow & Record<string, unknown>>,
    activity: activity || []
  }
}

export const loadExecution = async ({
  organizationId,
  executionId,
  userId,
  permission
}: {
  organizationId: string
  executionId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: execution, error } = await supabase
    .from('forge_jsa_executions')
    .select(
      '*, forge_personnel!forge_jsa_executions_lead_personnel_id_fkey(first_name, last_name, employee_number), locations(name, code)'
    )
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .maybeSingle()

  if (error) throw new Error('Unable to load execution: ' + error.message)
  if (!execution) return null

  const jsa = await loadJsa({
    organizationId,
    jsaId: execution.jsa_id,
    userId,
    permission
  })
  if (!jsa) return null

  const { data: participants, error: participantsError } = await supabase
    .from('forge_jsa_execution_participants')
    .select(
      '*, forge_personnel!forge_jsa_execution_participants_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id)'
    )
    .eq('organization_id', organizationId)
    .eq('execution_id', executionId)
    .order('role', { ascending: true })
    .order('created_at', { ascending: true })

  if (participantsError) {
    throw new Error('Unable to load participants: ' + participantsError.message)
  }

  return {
    execution: execution as JsaExecutionRow & Record<string, unknown>,
    jsa: jsa.jsa,
    participants: (participants || []) as Array<
      JsaExecutionParticipantRow & Record<string, unknown>
    >
  }
}
