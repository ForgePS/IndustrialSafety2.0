'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { createCorrectiveAction } from '@/app/(back)/corrective-actions/actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import {
  createObservation,
  loadObservation,
  OBSERVATION_CLOSED_READ_ONLY_ERROR,
  OBSERVATION_LOCKED_STATUS,
  observationWithinScope,
  updateObservation
} from '@/lib/forgeObservations'
import { performObservationTransition } from '@/lib/forgeObservationWorkflowSync'
import { createRecordLink } from '@/lib/forgeRecordLinks'
import { createRisk } from '@/lib/forgeRiskRegister'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type ObservationFormValues = Record<string, string | boolean | number | null>

export type ObservationActionResult =
  | {
      ok: true
      id: string
      message: string
      rowVersion: number
      status: string
    }
  | {
      ok?: false
      error: string
      conflict?: boolean
    }

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const toIso = (value: unknown) => {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const validateObservationForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: ObservationFormValues
}) => {
  const form = await getEffectiveForm({
    organizationId,
    formKey: 'observations.observation'
  })

  if (!form) return { error: 'Observation form is not configured.' }

  for (const field of form.fields) {
    const value = values[field.key]

    if (field.required && (value == null || value === '')) {
      return { error: field.label + ' is required.' }
    }

    if (field.fieldType === 'select' && field.lookupOptions.length && value) {
      if (!field.lookupOptions.some(option => option.key === value)) {
        return { error: field.label + ' contains an invalid option.' }
      }
    }
  }

  return { form }
}

const validateOrgAssignment = async ({
  supabase,
  organizationId,
  locationId,
  divisionId
}: {
  supabase: any
  organizationId: string
  locationId: string | null
  divisionId: string | null
}) => {
  if (locationId) {
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', locationId)
      .maybeSingle()
    if (!data) return 'Selected location is invalid for this organization.'
  }

  if (divisionId) {
    const { data } = await supabase
      .from('divisions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', divisionId)
      .maybeSingle()
    if (!data) return 'Selected division is invalid for this organization.'
  }

  return null
}

const resolveAssignee = async ({
  supabase,
  organizationId,
  personnelId
}: {
  supabase: any
  organizationId: string
  personnelId: string | null
}) => {
  if (!personnelId) return { personnelId: null as string | null, userId: null as string | null }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id, auth_user_id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .maybeSingle()

  if (!person) return { error: 'Assigned reviewer is invalid for this organization.' }

  return {
    personnelId: person.id as string,
    userId: (person.auth_user_id as string | null) || null
  }
}

const resolveReporterPersonnel = async ({
  supabase,
  organizationId,
  userId
}: {
  supabase: any
  organizationId: string
  userId: string
}) => {
  const { data } = await supabase
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .maybeSingle()

  return data?.id ? String(data.id) : null
}

const audit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'observation',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

export const createObservationAction = async (
  values: ObservationFormValues
): Promise<ObservationActionResult> => {
  const context = await requireTenantPermission('observations.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateObservationForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const title = cleanText(values.title)
  const description = cleanText(values.description)
  const observationType = cleanText(values.observation_type) || 'UNSAFE'
  const reportingMode =
    cleanText(values.reporting_mode) === 'anonymous' ? 'anonymous' : 'named'
  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const assignedPersonnelId = cleanText(values.assigned_to_personnel_id)

  if (!title || !description) {
    return { error: 'Title and Description are required.' }
  }

  const supabase = createServiceRoleClient() as any

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId,
    divisionId
  })
  if (assignmentError) return { error: assignmentError }

  const assignee = await resolveAssignee({
    supabase,
    organizationId,
    personnelId: assignedPersonnelId
  })
  if ('error' in assignee && assignee.error) {
    return { error: assignee.error }
  }

  const assigningOtherUser = assignee.userId && assignee.userId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'observations.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Observations to other personnel.' }
  }

  const effectiveScope = assigningOtherUser
    ? assignPermission?.scope || context.permission.scope
    : context.permission.scope

  const candidate = {
    organization_id: organizationId,
    assigned_to_user_id: assignee.userId,
    created_by: context.user.id,
    reported_by_user_id: reportingMode === 'named' ? context.user.id : null,
    location_id: locationId,
    division_id: divisionId
  }

  const allowed = await observationWithinScope({
    organizationId,
    userId: context.user.id,
    scope: effectiveScope,
    observation: candidate
  })

  if (!allowed) {
    return { error: 'The selected Observation assignment is outside your permission scope.' }
  }

  const reporterPersonnelId = await resolveReporterPersonnel({
    supabase,
    organizationId,
    userId: context.user.id
  })

  const result = await createObservation({
    organizationId,
    userId: context.user.id,
    input: {
      title,
      description,
      observationType,
      categoryKey: cleanText(values.category_key),
      workArea: cleanText(values.work_area),
      occurredAt: toIso(values.occurred_at),
      reportingMode,
      immediateAction: cleanText(values.immediate_action),
      locationId,
      divisionId,
      assignedToPersonnelId: assignee.personnelId,
      assignedToUserId: assignee.userId,
      initialLikelihoodKey: cleanText(values.initial_likelihood_key),
      initialSeverityKey: cleanText(values.initial_severity_key),
      reportedByPersonnelId: reporterPersonnelId,
      status: 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'observation.created',
    entityId: result.observation.id,
    after: {
      observation_number: result.observation.observation_number,
      reporting_mode: reportingMode,
      status: result.observation.status
    }
  })

  revalidatePath('/observations')
  revalidatePath('/observations/' + result.observation.id)

  return {
    ok: true,
    id: result.observation.id,
    message: 'Observation ' + result.observation.observation_number + ' created.',
    rowVersion: Number(result.observation.row_version),
    status: result.observation.status
  }
}

export const updateObservationAction = async ({
  observationId,
  values,
  expectedRowVersion
}: {
  observationId: string
  values: ObservationFormValues
  expectedRowVersion: number
}): Promise<ObservationActionResult> => {
  const context = await requireTenantPermission('observations.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateObservationForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_observations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', observationId)
    .maybeSingle()

  if (!existing) return { error: 'Observation not found.' }

  const mayEdit = await observationWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    observation: existing
  })
  if (!mayEdit) return { error: 'You do not have permission to edit this Observation.' }
  if (existing.status === OBSERVATION_LOCKED_STATUS) {
    return { error: OBSERVATION_CLOSED_READ_ONLY_ERROR }
  }

  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const assignedPersonnelId = cleanText(values.assigned_to_personnel_id)

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId,
    divisionId
  })
  if (assignmentError) return { error: assignmentError }

  const assignee = await resolveAssignee({
    supabase,
    organizationId,
    personnelId: assignedPersonnelId
  })
  if ('error' in assignee && assignee.error) {
    return { error: assignee.error }
  }

  const assigningOtherUser = assignee.userId && assignee.userId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'observations.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Observations to other personnel.' }
  }

  const title = cleanText(values.title)
  const description = cleanText(values.description)
  if (!title || !description) {
    return { error: 'Title and Description are required.' }
  }

  const result = await updateObservation({
    organizationId,
    userId: context.user.id,
    observationId,
    expectedRowVersion,
    input: {
      title,
      description,
      observationType: cleanText(values.observation_type) || existing.observation_type,
      categoryKey: cleanText(values.category_key),
      workArea: cleanText(values.work_area),
      occurredAt: toIso(values.occurred_at) || existing.occurred_at,
      immediateAction: cleanText(values.immediate_action),
      locationId,
      divisionId,
      assignedToPersonnelId: assignee.personnelId,
      assignedToUserId: assignee.userId,
      initialLikelihoodKey: cleanText(values.initial_likelihood_key),
      initialSeverityKey: cleanText(values.initial_severity_key)
    }
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  // Audit is written inside forge_update_observation_transactionally.

  revalidatePath('/observations')
  revalidatePath('/observations/' + observationId)

  return {
    ok: true,
    id: result.observation.id,
    message: 'Observation saved.',
    rowVersion: Number(result.observation.row_version),
    status: result.observation.status
  }
}

export type CrossModuleActionResult =
  | { ok: true; id: string; message: string }
  | { ok?: false; error: string }

export const createCapaFromObservation = async (
  observationId: string
): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('observations.view')
  await requireTenantPermission('corrective_actions.create')

  const organizationId = context.activeOrganization.id
  const detail = await loadObservation({
    organizationId,
    observationId,
    userId: context.user.id,
    permission: context.permission,
    canViewReporterIdentity: false
  })

  if (!detail) return { error: 'Observation not found.' }

  const record = detail.observation
  const capaResult = await createCorrectiveAction({
    title: record.title,
    description: record.description || record.title,
    action_type: 'corrective',
    severity: 'moderate',
    source_type: 'observation',
    source_reference: record.observation_number,
    location_id: record.location_id || '',
    division_id: record.division_id || '',
    immediate_containment: record.immediate_action || ''
  })

  if ('error' in capaResult && capaResult.error) {
    return { error: String(capaResult.error) }
  }

  const capaId = 'id' in capaResult ? String(capaResult.id) : null
  if (!capaId) return { error: 'Unable to create Corrective Action.' }

  const supabase = createServiceRoleClient() as any
  await supabase
    .from('forge_corrective_actions')
    .update({
      source_id: record.id,
      source_type: 'observation',
      source_reference: record.observation_number,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', capaId)

  const linkResult = await createRecordLink({
    sourceResourceType: 'observation',
    sourceResourceId: record.id,
    targetResourceType: 'corrective_action',
    targetResourceId: capaId,
    relationshipType: 'generated_capa'
  })

  revalidatePath('/observations/' + observationId)
  revalidatePath('/corrective-actions/' + capaId)

  if ('error' in linkResult && linkResult.error) {
    return {
      ok: true,
      id: capaId,
      message:
        'Corrective Action created. Record link was not created: ' + String(linkResult.error)
    }
  }

  return {
    ok: true,
    id: capaId,
    message: 'Corrective Action created from observation.'
  }
}

export const createRiskFromObservation = async (
  observationId: string
): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('observations.view')
  const createContext = await requireTenantPermission('risk_register.create')

  const organizationId = context.activeOrganization.id
  const detail = await loadObservation({
    organizationId,
    observationId,
    userId: context.user.id,
    permission: context.permission,
    canViewReporterIdentity: false
  })

  if (!detail) return { error: 'Observation not found.' }

  const record = detail.observation
  const result = await createRisk({
    organizationId,
    userId: createContext.user.id,
    input: {
      title: record.title,
      description: record.description || record.title,
      hazardDescription: record.description || null,
      workArea: record.work_area || null,
      locationId: record.location_id || null,
      divisionId: record.division_id || null,
      sourceType: 'observation',
      sourceReference: record.observation_number,
      status: 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  const linkResult = await createRecordLink({
    sourceResourceType: 'observation',
    sourceResourceId: record.id,
    targetResourceType: 'risk_register',
    targetResourceId: result.risk.id,
    relationshipType: 'identified_risk'
  })

  revalidatePath('/observations/' + observationId)
  revalidatePath('/risk-register/' + result.risk.id)

  if ('error' in linkResult && linkResult.error) {
    return {
      ok: true,
      id: result.risk.id,
      message: 'Risk created. Record link was not created: ' + String(linkResult.error)
    }
  }

  return {
    ok: true,
    id: result.risk.id,
    message: 'Risk created from observation.'
  }
}

export type ObservationTransitionActionResult =
  | { ok: true; status: string; message: string; rowVersion: number }
  | { ok?: false; error: string; conflict?: boolean }

export const transitionObservation = async ({
  observationId,
  transitionKey,
  comment = null,
  expectedRowVersion
}: {
  observationId: string
  transitionKey: string
  comment?: string | null
  expectedRowVersion: number
}): Promise<ObservationTransitionActionResult> => {
  const context = await requireTenantPermission('observations.view')
  const organizationId = context.activeOrganization.id

  if (!Number.isFinite(expectedRowVersion) || expectedRowVersion < 1) {
    return { error: 'Missing record version. Refresh and try again.', conflict: true }
  }

  const detail = await loadObservation({
    organizationId,
    observationId,
    userId: context.user.id,
    permission: context.permission,
    canViewReporterIdentity: false
  })

  if (!detail) return { error: 'Observation not found.' }

  if (Number(detail.observation.row_version) !== Number(expectedRowVersion)) {
    return {
      error: 'This observation changed after you opened it. Refresh before continuing.',
      conflict: true
    }
  }

  const permissionKeys = context.access.effective
    .filter(item => item.allowed)
    .map(item => item.permissionKey)

  const result = await performObservationTransition({
    organizationId,
    observationId,
    transitionKey,
    actorUserId: context.user.id,
    comment,
    expectedRowVersion,
    expectedStatus: detail.observation.status,
    userPermissionKeys: permissionKeys
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  revalidatePath('/observations')
  revalidatePath('/observations/' + observationId)

  return {
    ok: true,
    status: result.status,
    message: result.message,
    rowVersion: result.rowVersion
  }
}

export const transitionObservationForm = async (formData: FormData) => {
  const observationId = String(formData.get('observationId') || '')
  const transitionKey = String(formData.get('transitionKey') || '')
  const comment = cleanText(formData.get('comment'))
  const expectedRowVersion = Number(formData.get('expectedRowVersion') || 0)

  if (!observationId || !transitionKey) return

  await transitionObservation({
    observationId,
    transitionKey,
    comment,
    expectedRowVersion
  })
}
