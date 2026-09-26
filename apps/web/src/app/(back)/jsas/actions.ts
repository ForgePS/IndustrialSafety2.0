'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { createCorrectiveAction } from '@/app/(back)/corrective-actions/actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import {
  acknowledgeParticipant,
  addControl,
  addExecutionParticipant,
  addHazard,
  addPpeItem,
  addStep,
  addTrainingRequirement,
  completeExecution,
  createExecution,
  createJsa,
  createJsaFromTemplate,
  createRevision,
  getJsaTrainingWarnings,
  jsaWithinScope,
  removeExecutionParticipant,
  updateJsa
} from '@/lib/forgeJsa'
import { createAcknowledgement } from '@/lib/forgeAcknowledgements'
import { createRisk } from '@/lib/forgeRiskRegister'
import {
  performJsaExecutionTransition,
  performJsaTransition
} from '@/lib/forgeJsaWorkflowSync'
import { createRecordLink } from '@/lib/forgeRecordLinks'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type JsaFormValues = Record<string, string | boolean | number | null>

export type JsaActionResult =
  | {
      ok: true
      id: string
      message: string
      rowVersion?: number
      status?: string
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

const validateJsaForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: JsaFormValues
}) => {
  const form = await getEffectiveForm({
    organizationId,
    formKey: 'jsa_jha.jsa'
  })

  if (!form) return { error: 'JSA form is not configured.' }

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

const resolvePersonnel = async ({
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

  if (!person) return { error: 'Selected personnel is invalid for this organization.' }

  return {
    personnelId: person.id as string,
    userId: (person.auth_user_id as string | null) || null
  }
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
    entity_type: 'jsa',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const loadScopedJsa = async ({
  organizationId,
  jsaId,
  userId,
  scope
}: {
  organizationId: string
  jsaId: string
  userId: string
  scope: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  const { data: existing } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!existing) return { error: 'JSA not found.' as const }

  const allowed = await jsaWithinScope({
    organizationId,
    userId,
    scope,
    jsa: existing
  })
  if (!allowed) return { error: 'You do not have permission for this JSA.' as const }

  return { existing, supabase }
}

export const createJsaAction = async (values: JsaFormValues): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateJsaForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const title = cleanText(values.title)
  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const preparedByPersonnelId = cleanText(values.prepared_by_personnel_id)

  if (!title) return { error: 'Title is required.' }

  const supabase = createServiceRoleClient() as any

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId,
    divisionId
  })
  if (assignmentError) return { error: assignmentError }

  const preparer = await resolvePersonnel({
    supabase,
    organizationId,
    personnelId: preparedByPersonnelId
  })
  if ('error' in preparer && preparer.error) return { error: preparer.error }

  const candidate = {
    organization_id: organizationId,
    created_by: context.user.id,
    prepared_by_personnel_id: preparer.personnelId,
    location_id: locationId,
    division_id: divisionId
  }

  const allowed = await jsaWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    jsa: candidate
  })
  if (!allowed) {
    return { error: 'The selected JSA assignment is outside your permission scope.' }
  }

  const result = await createJsa({
    organizationId,
    userId: context.user.id,
    input: {
      title,
      description: cleanText(values.description),
      jobTitle: cleanText(values.job_title),
      taskName: cleanText(values.task_name),
      workArea: cleanText(values.work_area),
      locationId,
      divisionId,
      preparedByPersonnelId: preparer.personnelId,
      effectiveAt: toIso(values.effective_at),
      reviewDueAt: toIso(values.review_due_at),
      status: cleanText(values.status) || 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'jsa_jha.created',
    entityId: result.jsa.id,
    after: { jsa_number: result.jsa.jsa_number, status: result.jsa.status }
  })

  revalidatePath('/jsas')
  revalidatePath('/jsas/' + result.jsa.id)

  return {
    ok: true,
    id: result.jsa.id,
    message: 'JSA ' + result.jsa.jsa_number + ' created.',
    rowVersion: Number(result.jsa.row_version),
    status: result.jsa.status
  }
}

export const updateJsaAction = async ({
  jsaId,
  values,
  expectedRowVersion
}: {
  jsaId: string
  values: JsaFormValues
  expectedRowVersion: number
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateJsaForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const title = cleanText(values.title)
  if (!title) return { error: 'Title is required.' }

  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const preparedByPersonnelId = cleanText(values.prepared_by_personnel_id)

  const assignmentError = await validateOrgAssignment({
    supabase: scoped.supabase,
    organizationId,
    locationId,
    divisionId
  })
  if (assignmentError) return { error: assignmentError }

  const preparer = await resolvePersonnel({
    supabase: scoped.supabase,
    organizationId,
    personnelId: preparedByPersonnelId
  })
  if ('error' in preparer && preparer.error) return { error: preparer.error }

  const result = await updateJsa({
    organizationId,
    userId: context.user.id,
    jsaId,
    expectedRowVersion,
    input: {
      title,
      description: cleanText(values.description),
      jobTitle: cleanText(values.job_title),
      taskName: cleanText(values.task_name),
      workArea: cleanText(values.work_area),
      locationId,
      divisionId,
      preparedByPersonnelId: preparer.personnelId,
      effectiveAt: toIso(values.effective_at),
      reviewDueAt: toIso(values.review_due_at),
      isTemplate:
        values.is_template === true ||
        values.is_template === 'true' ||
        values.is_template === 1
    }
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  await audit({
    supabase: scoped.supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'jsa_jha.updated',
    entityId: jsaId,
    before: { row_version: scoped.existing.row_version, status: scoped.existing.status },
    after: { row_version: result.jsa.row_version, status: result.jsa.status }
  })

  revalidatePath('/jsas')
  revalidatePath('/jsas/' + jsaId)

  return {
    ok: true,
    id: result.jsa.id,
    message: 'JSA saved.',
    rowVersion: Number(result.jsa.row_version),
    status: result.jsa.status
  }
}

export const addStepAction = async ({
  jsaId,
  title,
  description
}: {
  jsaId: string
  title: string
  description?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id
  const cleanedTitle = cleanText(title)
  if (!cleanedTitle) return { error: 'Step title is required.' }

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await addStep({
    organizationId,
    userId: context.user.id,
    jsaId,
    title: cleanedTitle,
    description: cleanText(description)
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  return { ok: true, id: result.step.id, message: 'Step added.' }
}

export const addHazardAction = async ({
  jsaId,
  stepId,
  hazardDescription,
  categoryKey,
  likelihoodKey,
  severityKey,
  residualLikelihoodKey,
  residualSeverityKey
}: {
  jsaId: string
  stepId: string
  hazardDescription: string
  categoryKey?: string | null
  likelihoodKey: string
  severityKey: string
  residualLikelihoodKey?: string | null
  residualSeverityKey?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const description = cleanText(hazardDescription)
  const likelihood = cleanText(likelihoodKey)
  const severity = cleanText(severityKey)
  if (!description) return { error: 'Hazard description is required.' }
  if (!likelihood || !severity) return { error: 'Likelihood and severity are required.' }

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await addHazard({
    organizationId,
    userId: context.user.id,
    jsaId,
    stepId,
    hazardDescription: description,
    categoryKey: cleanText(categoryKey),
    likelihoodKey: likelihood,
    severityKey: severity,
    residualLikelihoodKey: cleanText(residualLikelihoodKey),
    residualSeverityKey: cleanText(residualSeverityKey)
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  return {
    ok: true,
    id: result.hazard.id,
    message:
      'Hazard added · ' +
      result.assessment.bandKey +
      ' (score ' +
      result.assessment.score +
      ').'
  }
}

export const addControlAction = async ({
  jsaId,
  hazardId,
  controlType,
  title,
  description
}: {
  jsaId: string
  hazardId: string
  controlType: string
  title: string
  description?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const cleanedTitle = cleanText(title)
  const cleanedType = cleanText(controlType)
  if (!cleanedTitle) return { error: 'Control title is required.' }
  if (!cleanedType) return { error: 'Control type is required.' }

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await addControl({
    organizationId,
    userId: context.user.id,
    jsaId,
    hazardId,
    controlType: cleanedType,
    title: cleanedTitle,
    description: cleanText(description)
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  return { ok: true, id: result.control.id, message: 'Control added.' }
}

export const addPpeItemAction = async ({
  jsaId,
  label,
  required = true
}: {
  jsaId: string
  label: string
  required?: boolean
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await addPpeItem({
    organizationId,
    userId: context.user.id,
    jsaId,
    label: cleanText(label) || '',
    required
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  return { ok: true, id: result.item.id, message: 'PPE item added.' }
}

export const addTrainingRequirementAction = async ({
  jsaId,
  trainingCourseId,
  required = true
}: {
  jsaId: string
  trainingCourseId: string
  required?: boolean
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await addTrainingRequirement({
    organizationId,
    userId: context.user.id,
    jsaId,
    trainingCourseId: cleanText(trainingCourseId) || '',
    required
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  return { ok: true, id: result.requirement.id, message: 'Training requirement added.' }
}

export const createJsaFromTemplateAction = async (
  templateJsaId: string
): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.create')
  const organizationId = context.activeOrganization.id

  const result = await createJsaFromTemplate({
    organizationId,
    userId: context.user.id,
    templateJsaId
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas')
  revalidatePath('/jsas/' + result.jsa.id)

  return {
    ok: true,
    id: result.jsa.id,
    message: 'Draft created from template.',
    status: result.jsa.status
  }
}

export const createRevisionAction = async ({
  jsaId,
  changeSummary
}: {
  jsaId: string
  changeSummary?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await createRevision({
    organizationId,
    userId: context.user.id,
    jsaId,
    changeSummary: cleanText(changeSummary)
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase: scoped.supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'jsa_jha.revision_created',
    entityId: result.jsa.id,
    after: {
      jsa_number: result.jsa.jsa_number,
      version: result.jsa.version,
      parent_jsa_id: result.jsa.parent_jsa_id
    }
  })

  revalidatePath('/jsas')
  revalidatePath('/jsas/' + jsaId)
  revalidatePath('/jsas/' + result.jsa.id)

  return {
    ok: true,
    id: result.jsa.id,
    message: 'Revision v' + result.jsa.version + ' created as draft.',
    status: result.jsa.status
  }
}

export const createExecutionAction = async ({
  jsaId,
  locationId,
  leadPersonnelId,
  notes,
  participantPersonnelIds
}: {
  jsaId: string
  locationId?: string | null
  leadPersonnelId?: string | null
  notes?: string | null
  participantPersonnelIds?: string[]
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.execute')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const cleanedLocation = cleanText(locationId)
  const assignmentError = await validateOrgAssignment({
    supabase: scoped.supabase,
    organizationId,
    locationId: cleanedLocation,
    divisionId: null
  })
  if (assignmentError) return { error: assignmentError }

  if (leadPersonnelId) {
    const lead = await resolvePersonnel({
      supabase: scoped.supabase,
      organizationId,
      personnelId: cleanText(leadPersonnelId)
    })
    if ('error' in lead && lead.error) return { error: lead.error }
  }

  const result = await createExecution({
    organizationId,
    userId: context.user.id,
    jsaId,
    locationId: cleanedLocation,
    leadPersonnelId: cleanText(leadPersonnelId),
    notes: cleanText(notes),
    participantPersonnelIds
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  revalidatePath('/jsas/' + jsaId + '/executions/' + result.execution.id)

  return {
    ok: true,
    id: result.execution.id,
    message: 'Execution ' + result.execution.execution_number + ' planned.',
    status: result.execution.status
  }
}

export const addExecutionParticipantAction = async ({
  jsaId,
  executionId,
  personnelId,
  role = 'crew'
}: {
  jsaId: string
  executionId: string
  personnelId: string
  role?: string
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.execute')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const person = await resolvePersonnel({
    supabase: scoped.supabase,
    organizationId,
    personnelId: cleanText(personnelId)
  })
  if ('error' in person && person.error) return { error: person.error }

  const result = await addExecutionParticipant({
    organizationId,
    userId: context.user.id,
    executionId,
    personnelId: person.personnelId!,
    role
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId + '/executions/' + executionId)
  return { ok: true, id: result.participant.id, message: 'Crew member added.' }
}

export const removeExecutionParticipantAction = async ({
  jsaId,
  executionId,
  participantId
}: {
  jsaId: string
  executionId: string
  participantId: string
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.execute')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await removeExecutionParticipant({
    organizationId,
    userId: context.user.id,
    executionId,
    participantId
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId + '/executions/' + executionId)
  return { ok: true, id: participantId, message: 'Crew member removed.' }
}

export const transitionExecutionAction = async ({
  jsaId,
  executionId,
  toStatus,
  comment = null,
  stopReason = null,
  stopRequiresRevision = false,
  notes = null
}: {
  jsaId: string
  executionId: string
  toStatus: string
  comment?: string | null
  stopReason?: string | null
  stopRequiresRevision?: boolean
  notes?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.execute')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const { data: execution } = await scoped.supabase
    .from('forge_jsa_executions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', executionId)
    .eq('jsa_id', jsaId)
    .maybeSingle()

  if (!execution) return { error: 'Execution not found.' }

  const patch: Record<string, unknown> = {}
  if (notes != null) patch.notes = notes
  if (toStatus === 'stopped') {
    patch.stop_reason = stopReason || comment
    patch.stop_requires_revision = stopRequiresRevision
  }

  const result = await performJsaExecutionTransition({
    organizationId,
    executionId,
    fromStatus: execution.status,
    toStatus,
    actorUserId: context.user.id,
    comment,
    patch,
    expectedRowVersion: Number(execution.row_version || 1)
  })

  if (!result.ok) {
    return { error: result.error, conflict: Boolean(result.conflict) }
  }

  revalidatePath('/jsas/' + jsaId)
  revalidatePath('/jsas/' + jsaId + '/executions/' + executionId)

  return {
    ok: true,
    id: executionId,
    message: result.message,
    status: result.status,
    rowVersion: result.rowVersion
  }
}

export const acknowledgeParticipantAction = async ({
  jsaId,
  executionId
}: {
  jsaId: string
  executionId: string
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.acknowledge')
  const organizationId = context.activeOrganization.id

  const ackResult = await createAcknowledgement({
    resourceType: 'jsa',
    resourceId: jsaId,
    acknowledgementType: 'execution_briefing',
    resourceVersion: executionId,
    signatureMethod: 'click_confirm',
    signatureMetadata: { execution_id: executionId }
  })

  if ('error' in ackResult && ackResult.error) {
    return { error: String(ackResult.error) }
  }

  const acknowledgmentId =
    ackResult.acknowledgement && typeof ackResult.acknowledgement.id === 'string'
      ? ackResult.acknowledgement.id
      : null

  const result = await acknowledgeParticipant({
    organizationId,
    userId: context.user.id,
    executionId,
    acknowledgmentId
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId + '/executions/' + executionId)
  return { ok: true, id: result.participant.id, message: 'Participation acknowledged.' }
}

export const completeExecutionAction = async ({
  jsaId,
  executionId,
  notes
}: {
  jsaId: string
  executionId: string
  notes?: string | null
}): Promise<JsaActionResult> => {
  const context = await requireTenantPermission('jsa_jha.execute')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const result = await completeExecution({
    organizationId,
    userId: context.user.id,
    executionId,
    notes: cleanText(notes)
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/jsas/' + jsaId)
  revalidatePath('/jsas/' + jsaId + '/executions/' + executionId)

  return {
    ok: true,
    id: result.execution.id,
    message: 'Execution completed.',
    status: result.execution.status
  }
}

export type CrossModuleActionResult =
  | { ok: true; id: string; message: string }
  | { ok?: false; error: string }

export const createCapaFromJsa = async (jsaId: string): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('jsa_jha.view')
  await requireTenantPermission('corrective_actions.create')

  const organizationId = context.activeOrganization.id
  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const record = scoped.existing
  const capaResult = await createCorrectiveAction({
    title: 'CAPA for ' + record.title,
    description: record.description || record.job_title || record.title,
    action_type: 'corrective',
    severity: 'moderate',
    source_type: 'jsa',
    source_reference: record.jsa_number,
    location_id: record.location_id || '',
    division_id: record.division_id || ''
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
      source_type: 'jsa',
      source_reference: record.jsa_number,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', capaId)

  const linkResult = await createRecordLink({
    sourceResourceType: 'jsa',
    sourceResourceId: record.id,
    targetResourceType: 'corrective_action',
    targetResourceId: capaId,
    relationshipType: 'generated_capa'
  })

  revalidatePath('/jsas/' + jsaId)
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
    message: 'Corrective Action created from JSA.'
  }
}

export const createRiskFromJsa = async (jsaId: string): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('jsa_jha.view')
  const createContext = await requireTenantPermission('risk_register.create')

  const organizationId = context.activeOrganization.id
  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const record = scoped.existing
  const result = await createRisk({
    organizationId,
    userId: createContext.user.id,
    input: {
      title: record.title,
      description: record.description || record.title,
      hazardDescription: record.description || record.task_name || null,
      workArea: record.work_area || null,
      locationId: record.location_id || null,
      divisionId: record.division_id || null,
      sourceType: 'jsa',
      sourceReference: record.jsa_number,
      status: 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  const linkResult = await createRecordLink({
    sourceResourceType: 'jsa',
    sourceResourceId: record.id,
    targetResourceType: 'risk_register',
    targetResourceId: result.risk.id,
    relationshipType: 'identified_risk'
  })

  revalidatePath('/jsas/' + jsaId)
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
    message: 'Risk created from JSA.'
  }
}

export const createAssetLinkFromJsa = async ({
  jsaId,
  assetId
}: {
  jsaId: string
  assetId: string
}): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('jsa_jha.edit')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const cleanedAssetId = cleanText(assetId)
  if (!cleanedAssetId) return { error: 'Asset is required.' }

  const { data: asset } = await scoped.supabase
    .from('forge_assets')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', cleanedAssetId)
    .maybeSingle()

  if (!asset) return { error: 'Selected asset is invalid for this organization.' }

  const linkResult = await createRecordLink({
    sourceResourceType: 'jsa',
    sourceResourceId: jsaId,
    targetResourceType: 'asset',
    targetResourceId: cleanedAssetId,
    relationshipType: 'involves_asset'
  })

  if ('error' in linkResult && linkResult.error) {
    return { error: String(linkResult.error) }
  }

  revalidatePath('/jsas/' + jsaId)
  return {
    ok: true,
    id: cleanedAssetId,
    message: 'Asset linked to JSA.'
  }
}

export const loadJsaTrainingWarningsAction = async ({
  jsaId,
  personnelIds
}: {
  jsaId: string
  personnelIds: string[]
}) => {
  const context = await requireTenantPermission('jsa_jha.view')
  return getJsaTrainingWarnings({
    organizationId: context.activeOrganization.id,
    jsaId,
    personnelIds
  })
}

export type JsaTransitionActionResult =
  | { ok: true; status: string; message: string }
  | { ok?: false; error: string; conflict?: boolean }

export const transitionJsa = async ({
  jsaId,
  transitionKey,
  comment = null
}: {
  jsaId: string
  transitionKey: string
  comment?: string | null
}): Promise<JsaTransitionActionResult> => {
  const context = await requireTenantPermission('jsa_jha.view')
  const organizationId = context.activeOrganization.id

  const scoped = await loadScopedJsa({
    organizationId,
    jsaId,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in scoped && scoped.error) return { error: scoped.error }

  const permissionKeys = context.access.effective
    .filter(item => item.allowed)
    .map(item => item.permissionKey)

  const result = await performJsaTransition({
    organizationId,
    jsaId,
    transitionKey,
    actorUserId: context.user.id,
    comment,
    expectedRowVersion: Number(scoped.existing.row_version),
    userPermissionKeys: permissionKeys
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  await audit({
    supabase: scoped.supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'jsa.transitioned',
    entityId: jsaId,
    before: { status: scoped.existing.status },
    after: { status: result.status, transition_key: transitionKey }
  })

  revalidatePath('/jsas')
  revalidatePath('/jsas/' + jsaId)

  return {
    ok: true,
    status: result.status,
    message: result.message
  }
}

export const transitionJsaForm = async (formData: FormData) => {
  const jsaId = String(formData.get('jsaId') || '')
  const transitionKey = String(formData.get('transitionKey') || '')
  const comment = cleanText(formData.get('comment'))

  if (!jsaId || !transitionKey) return

  await transitionJsa({
    jsaId,
    transitionKey,
    comment
  })
}
