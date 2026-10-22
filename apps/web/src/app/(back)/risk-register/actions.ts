'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { createCorrectiveAction } from '@/app/(back)/corrective-actions/actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import {
  addRiskControl,
  addRiskTreatment,
  assessInherentRisk,
  assessResidualRisk,
  createRisk,
  loadRisk,
  riskWithinScope,
  updateRisk
} from '@/lib/forgeRiskRegister'
import {
  cloneRiskMatrixVersion,
  ensureTenantDefaultRiskMatrix
} from '@/lib/forgeRiskMatrix'
import { createRecordLink } from '@/lib/forgeRecordLinks'
import { performRiskTransition, performAtomicRiskReview } from '@/lib/forgeRiskWorkflowSync'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type RiskFormValues = Record<string, string | boolean | number | null>

export type RiskActionResult =
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

/** `closed` locks the risk record (locks_record = true) until the explicit `reopen` transition. */
const closedRiskError = (status: unknown) =>
  status === 'closed'
    ? { error: 'Closed risks are read-only. Reopen the risk before making changes.' }
    : null

const toIso = (value: unknown) => {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const validateRiskForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: RiskFormValues
}) => {
  const form = await getEffectiveForm({
    organizationId,
    formKey: 'risk_register.risk'
  })

  if (!form) return { error: 'Risk Register form is not configured.' }

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

const resolveOwner = async ({
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

  if (!person) return { error: 'Risk owner is invalid for this organization.' }

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
    entity_type: 'risk_register',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

export const createRiskAction = async (values: RiskFormValues): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateRiskForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const title = cleanText(values.title)
  const description = cleanText(values.description)
  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const ownerPersonnelId = cleanText(values.owner_personnel_id)

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

  const owner = await resolveOwner({
    supabase,
    organizationId,
    personnelId: ownerPersonnelId
  })
  if ('error' in owner && owner.error) {
    return { error: owner.error }
  }

  const assigningOtherUser = owner.userId && owner.userId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'risk_register.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Risks to other personnel.' }
  }

  const effectiveScope = assigningOtherUser
    ? assignPermission?.scope || context.permission.scope
    : context.permission.scope

  const candidate = {
    organization_id: organizationId,
    owner_user_id: owner.userId,
    created_by: context.user.id,
    location_id: locationId,
    division_id: divisionId
  }

  const allowed = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: effectiveScope,
    risk: candidate
  })

  if (!allowed) {
    return { error: 'The selected Risk assignment is outside your permission scope.' }
  }

  const result = await createRisk({
    organizationId,
    userId: context.user.id,
    input: {
      title,
      description,
      hazardDescription: cleanText(values.hazard_description),
      categoryKey: cleanText(values.category_key),
      workArea: cleanText(values.work_area),
      locationId,
      divisionId,
      ownerPersonnelId: owner.personnelId,
      ownerUserId: owner.userId,
      reviewDueAt: toIso(values.review_due_at),
      sourceType: cleanText(values.source_type),
      sourceReference: cleanText(values.source_reference),
      status: 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.created',
    entityId: result.risk.id,
    after: {
      risk_number: result.risk.risk_number,
      status: result.risk.status
    }
  })

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + result.risk.id)

  return {
    ok: true,
    id: result.risk.id,
    message: 'Risk ' + result.risk.risk_number + ' created.',
    rowVersion: Number(result.risk.row_version),
    status: result.risk.status
  }
}

export const updateRiskAction = async ({
  riskId,
  values,
  expectedRowVersion
}: {
  riskId: string
  values: RiskFormValues
  expectedRowVersion: number
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateRiskForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { error: validation.error }
  }

  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!existing) return { error: 'Risk not found.' }

  const mayEdit = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    risk: existing
  })
  if (!mayEdit) return { error: 'You do not have permission to edit this Risk.' }
  const lockedOnEdit = closedRiskError(existing.status)
  if (lockedOnEdit) return lockedOnEdit

  const locationId = cleanText(values.location_id)
  const divisionId = cleanText(values.division_id)
  const ownerPersonnelId = cleanText(values.owner_personnel_id)

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId,
    divisionId
  })
  if (assignmentError) return { error: assignmentError }

  const owner = await resolveOwner({
    supabase,
    organizationId,
    personnelId: ownerPersonnelId
  })
  if ('error' in owner && owner.error) {
    return { error: owner.error }
  }

  const assigningOtherUser = owner.userId && owner.userId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'risk_register.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Risks to other personnel.' }
  }

  const title = cleanText(values.title)
  const description = cleanText(values.description)
  if (!title || !description) {
    return { error: 'Title and Description are required.' }
  }

  const result = await updateRisk({
    organizationId,
    userId: context.user.id,
    riskId,
    expectedRowVersion,
    input: {
      title,
      description,
      hazardDescription: cleanText(values.hazard_description),
      categoryKey: cleanText(values.category_key),
      workArea: cleanText(values.work_area),
      locationId,
      divisionId,
      ownerPersonnelId: owner.personnelId,
      ownerUserId: owner.userId,
      reviewDueAt: toIso(values.review_due_at),
      sourceType: cleanText(values.source_type),
      sourceReference: cleanText(values.source_reference)
      // status intentionally omitted — lifecycle is transition-only
    }
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.updated',
    entityId: riskId,
    before: {
      row_version: existing.row_version,
      title: existing.title,
      status: existing.status
    },
    after: {
      row_version: result.risk.row_version,
      title: result.risk.title,
      status: result.risk.status
    }
  })

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: result.risk.id,
    message: 'Risk saved.',
    rowVersion: Number(result.risk.row_version),
    status: result.risk.status
  }
}

export const assessInherentRiskAction = async ({
  riskId,
  expectedRowVersion,
  likelihoodKey,
  severityKey
}: {
  riskId: string
  expectedRowVersion: number
  likelihoodKey: string
  severityKey: string
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.assess')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!existing) return { error: 'Risk not found.' }

  const allowed = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    risk: existing
  })
  if (!allowed) return { error: 'You do not have permission to assess this Risk.' }
  const lockedInherent = closedRiskError(existing.status)
  if (lockedInherent) return lockedInherent

  const result = await assessInherentRisk({
    organizationId,
    userId: context.user.id,
    riskId,
    expectedRowVersion,
    likelihoodKey: likelihoodKey.trim(),
    severityKey: severityKey.trim()
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.inherent_assessed',
    entityId: riskId,
    after: {
      inherent_band_key: result.risk.inherent_band_key,
      inherent_score: result.risk.inherent_score
    }
  })

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: result.risk.id,
    message:
      'Inherent risk assessed: ' +
      (result.risk.inherent_band_key || '') +
      ' (' +
      String(result.risk.inherent_score ?? '') +
      ').',
    rowVersion: Number(result.risk.row_version),
    status: result.risk.status
  }
}

export const assessResidualRiskAction = async ({
  riskId,
  expectedRowVersion,
  likelihoodKey,
  severityKey
}: {
  riskId: string
  expectedRowVersion: number
  likelihoodKey: string
  severityKey: string
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.assess')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!existing) return { error: 'Risk not found.' }

  const allowed = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    risk: existing
  })
  if (!allowed) return { error: 'You do not have permission to assess this Risk.' }
  const lockedResidual = closedRiskError(existing.status)
  if (lockedResidual) return lockedResidual

  const result = await assessResidualRisk({
    organizationId,
    userId: context.user.id,
    riskId,
    expectedRowVersion,
    likelihoodKey: likelihoodKey.trim(),
    severityKey: severityKey.trim()
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.residual_assessed',
    entityId: riskId,
    after: {
      residual_band_key: result.risk.residual_band_key,
      residual_score: result.risk.residual_score
    }
  })

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: result.risk.id,
    message:
      'Residual risk assessed: ' +
      (result.risk.residual_band_key || '') +
      ' (' +
      String(result.risk.residual_score ?? '') +
      ').',
    rowVersion: Number(result.risk.row_version),
    status: result.risk.status
  }
}

export const addRiskControlAction = async ({
  riskId,
  controlType,
  title,
  description,
  effectivenessNotes
}: {
  riskId: string
  controlType: string
  title: string
  description?: string | null
  effectivenessNotes?: string | null
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.treat')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!existing) return { error: 'Risk not found.' }

  const allowed = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    risk: existing
  })
  if (!allowed) return { error: 'You do not have permission to treat this Risk.' }
  const lockedControl = closedRiskError(existing.status)
  if (lockedControl) return lockedControl

  const cleanedTitle = cleanText(title)
  if (!cleanedTitle) return { error: 'Control title is required.' }

  const result = await addRiskControl({
    organizationId,
    userId: context.user.id,
    riskId,
    input: {
      controlType: cleanText(controlType) || 'administrative',
      title: cleanedTitle,
      description: cleanText(description),
      effectivenessNotes: cleanText(effectivenessNotes)
    }
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.control_added',
    entityId: riskId,
    after: { control_id: result.control.id, title: result.control.title }
  })

  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: result.control.id,
    message: 'Control added.',
    rowVersion: Number(existing.row_version),
    status: existing.status
  }
}

export const addRiskTreatmentAction = async ({
  riskId,
  title,
  description,
  treatmentStatus,
  ownerPersonnelId,
  dueAt,
  notes
}: {
  riskId: string
  title: string
  description?: string | null
  treatmentStatus?: string | null
  ownerPersonnelId?: string | null
  dueAt?: string | null
  notes?: string | null
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.treat')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_risks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (!existing) return { error: 'Risk not found.' }

  const allowed = await riskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    risk: existing
  })
  if (!allowed) return { error: 'You do not have permission to treat this Risk.' }
  const lockedTreatment = closedRiskError(existing.status)
  if (lockedTreatment) return lockedTreatment

  const cleanedTitle = cleanText(title)
  if (!cleanedTitle) return { error: 'Treatment title is required.' }

  const ownerId = cleanText(ownerPersonnelId)
  if (ownerId) {
    const owner = await resolveOwner({ supabase, organizationId, personnelId: ownerId })
    if ('error' in owner && owner.error) return { error: owner.error }
  }

  const result = await addRiskTreatment({
    organizationId,
    userId: context.user.id,
    riskId,
    input: {
      title: cleanedTitle,
      description: cleanText(description),
      treatmentStatus: cleanText(treatmentStatus) || 'planned',
      ownerPersonnelId: ownerId,
      dueAt: toIso(dueAt),
      notes: cleanText(notes)
    }
  })

  if (!result.ok) return { error: result.error }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'risk_register.treatment_added',
    entityId: riskId,
    after: { treatment_id: result.treatment.id, title: result.treatment.title }
  })

  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: result.treatment.id,
    message: 'Treatment added.',
    rowVersion: Number(existing.row_version),
    status: existing.status
  }
}

export const ensureTenantDefaultRiskMatrixAction = async (): Promise<
  { ok: true; matrixId: string; created: boolean; message: string } | { error: string }
> => {
  const context = await requireTenantPermission('risk_register.assess')
  const result = await ensureTenantDefaultRiskMatrix({
    organizationId: context.activeOrganization.id,
    actorUserId: context.user.id
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/risk-register/matrices')

  return {
    ok: true,
    matrixId: result.matrixId,
    created: result.created,
    message: result.created
      ? 'Core risk matrix cloned as the organization default.'
      : 'Organization already has an active default risk matrix.'
  }
}

export const cloneCoreRiskMatrixAction = async (): Promise<
  { ok: true; matrixId: string; message: string } | { error: string }
> => {
  const context = await requireTenantPermission('risk_register.assess')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: coreRow } = await supabase
    .from('forge_risk_matrices')
    .select('id')
    .is('organization_id', null)
    .eq('matrix_key', 'forge.core.5x5')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!coreRow?.id) return { error: 'Forge core risk matrix is missing.' }

  const result = await cloneRiskMatrixVersion({
    sourceMatrixId: String(coreRow.id),
    organizationId,
    actorUserId: context.user.id,
    matrixKey: 'tenant.default.5x5',
    name: 'Organization Risk Matrix',
    activateAsDefault: true
  })

  if (!result.ok) return { error: result.error }

  revalidatePath('/risk-register/matrices')

  return {
    ok: true,
    matrixId: result.matrixId,
    message: 'Core risk matrix cloned and activated as the organization default.'
  }
}

export type CrossModuleActionResult =
  | { ok: true; id: string; message: string }
  | { ok?: false; error: string }

export const createCapaFromRisk = async (riskId: string): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('risk_register.view')
  await requireTenantPermission('corrective_actions.create')

  const organizationId = context.activeOrganization.id
  const detail = await loadRisk({
    organizationId,
    riskId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!detail) return { error: 'Risk not found.' }

  const record = detail.risk
  const capaResult = await createCorrectiveAction({
    title: 'CAPA for ' + record.title,
    description: record.description || record.hazard_description || record.title,
    action_type: 'corrective',
    severity: 'moderate',
    source_type: 'risk',
    source_reference: record.risk_number,
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
      source_type: 'risk',
      source_reference: record.risk_number,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', capaId)

  const linkResult = await createRecordLink({
    sourceResourceType: 'risk_register',
    sourceResourceId: record.id,
    targetResourceType: 'corrective_action',
    targetResourceId: capaId,
    relationshipType: 'generated_capa'
  })

  revalidatePath('/risk-register/' + riskId)
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
    message: 'Corrective Action created from risk.'
  }
}

export type RiskTransitionActionResult =
  | { ok: true; status: string; message: string }
  | { ok?: false; error: string; conflict?: boolean }

export const transitionRisk = async ({
  riskId,
  transitionKey,
  comment = null
}: {
  riskId: string
  transitionKey: string
  comment?: string | null
}): Promise<RiskTransitionActionResult> => {
  const context = await requireTenantPermission('risk_register.view')
  const organizationId = context.activeOrganization.id

  const detail = await loadRisk({
    organizationId,
    riskId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!detail) return { error: 'Risk not found.' }

  const permissionKeys = context.access.effective
    .filter(item => item.allowed)
    .map(item => item.permissionKey)

  const result = await performRiskTransition({
    organizationId,
    riskId,
    transitionKey,
    actorUserId: context.user.id,
    comment,
    expectedRowVersion: detail.risk.row_version,
    userPermissionKeys: permissionKeys
  })

  if (!result.ok) {
    return {
      error: result.error,
      conflict: 'conflict' in result ? Boolean(result.conflict) : false
    }
  }

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    status: result.status,
    message: result.message
  }
}

export const transitionRiskForm = async (formData: FormData) => {
  const riskId = String(formData.get('riskId') || '')
  const transitionKey = String(formData.get('transitionKey') || '')
  const comment = cleanText(formData.get('comment'))

  if (!riskId || !transitionKey) return

  await transitionRisk({
    riskId,
    transitionKey,
    comment
  })
}

export const acceptRisk = async ({
  riskId,
  expectedRowVersion,
  acceptanceComment
}: {
  riskId: string
  expectedRowVersion: number
  acceptanceComment: string
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.accept')
  const organizationId = context.activeOrganization.id

  const detail = await loadRisk({
    organizationId,
    riskId,
    userId: context.user.id,
    permission: context.permission
  })
  if (!detail) return { error: 'Risk not found.' }
  const lockedAccept = closedRiskError(detail.risk.status)
  if (lockedAccept) return lockedAccept

  const comment = cleanText(acceptanceComment)
  if (!comment) return { error: 'Acceptance comment is required.' }

  const { performAtomicRiskAcceptance } = await import('@/lib/forgeRiskWorkflowSync')
  const result = await performAtomicRiskAcceptance({
    organizationId,
    riskId,
    expectedRowVersion,
    actorUserId: context.user.id,
    acceptanceComment: comment
  })

  if (result.error || !result.result?.ok) {
    return {
      error: result.error || 'Unable to accept risk.',
      conflict: Boolean(result.conflict)
    }
  }

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: riskId,
    message: 'Risk acceptance recorded.',
    rowVersion: Number(result.result.row_version || expectedRowVersion + 1),
    status: detail.risk.status
  }
}

export const acceptRiskForm = async (formData: FormData) => {
  const riskId = String(formData.get('riskId') || '')
  const expectedRowVersion = Number(formData.get('expectedRowVersion') || 0)
  const acceptanceComment = cleanText(formData.get('acceptanceComment'))

  if (!riskId || !expectedRowVersion || !acceptanceComment) return

  await acceptRisk({
    riskId,
    expectedRowVersion,
    acceptanceComment
  })
}

export const createRiskReview = async ({
  riskId,
  expectedRowVersion,
  reviewNotes,
  nextReviewAt
}: {
  riskId: string
  expectedRowVersion: number
  reviewNotes?: string | null
  nextReviewAt: string
}): Promise<RiskActionResult> => {
  const context = await requireTenantPermission('risk_register.review')
  const organizationId = context.activeOrganization.id

  const detail = await loadRisk({
    organizationId,
    riskId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!detail) return { error: 'Risk not found.' }
  const lockedReview = closedRiskError(detail.risk.status)
  if (lockedReview) return lockedReview

  const nextAt = toIso(nextReviewAt)
  if (!nextAt) return { error: 'Next review date is required.' }

  const result = await performAtomicRiskReview({
    organizationId,
    riskId,
    expectedRowVersion,
    actorUserId: context.user.id,
    reviewNotes: cleanText(reviewNotes),
    nextReviewAt: nextAt
  })

  if (result.error || !result.result?.ok) {
    return {
      error: result.error || result.result?.error || 'Unable to create risk review.',
      conflict: Boolean(result.conflict || result.result?.conflict)
    }
  }

  revalidatePath('/risk-register')
  revalidatePath('/risk-register/' + riskId)

  return {
    ok: true,
    id: String(result.result.review_id || riskId),
    message: 'Risk review recorded.',
    rowVersion: Number(result.result.row_version || expectedRowVersion + 1),
    status: detail.risk.status
  }
}

export const createRiskReviewForm = async (formData: FormData) => {
  const riskId = String(formData.get('riskId') || '')
  const expectedRowVersion = Number(formData.get('expectedRowVersion') || 0)
  const reviewNotes = cleanText(formData.get('reviewNotes'))
  const nextReviewAt = cleanText(formData.get('nextReviewAt'))

  if (!riskId || !expectedRowVersion || !nextReviewAt) return

  await createRiskReview({
    riskId,
    expectedRowVersion,
    reviewNotes,
    nextReviewAt
  })
}
