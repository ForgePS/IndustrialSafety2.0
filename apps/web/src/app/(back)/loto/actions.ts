'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedLotoAssets } from '@/lib/forgeLoto'
import { audit, requireProcedureInScope, storeRevisionSnapshot } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type LotoFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()

  
return cleaned ? cleaned : null
}

const validateForm = async ({
  organizationId,
  formKey,
  values
}: {
  organizationId: string
  formKey: string
  values: LotoFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey })

  if (!form) return { error: 'The required Lockout / Tagout form is not configured.' }

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

const procedurePayload = (values: LotoFormValues) => ({
  asset_id: cleanText(values.asset_id),
  title: cleanText(values.title),
  description: cleanText(values.description),
  purpose: cleanText(values.purpose),
  scope_text: cleanText(values.scope_text),
  required_ppe: cleanText(values.required_ppe),
  special_precautions: cleanText(values.special_precautions),
  authorized_employee_notes: cleanText(values.authorized_employee_notes),
  affected_employee_notes: cleanText(values.affected_employee_notes),
  shutdown_notes: cleanText(values.shutdown_notes),
  restoration_notes: cleanText(values.restoration_notes),
  next_review_date: cleanText(values.next_review_date)
})

export const createLotoProcedure = async (values: LotoFormValues) => {
  const context = await requireTenantPermission('loto.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'loto.procedure', values })

  if ('error' in validation) return validation

  const payload = procedurePayload(values)

  if (!payload.asset_id || !payload.title) {
    return { error: 'Equipment / Asset and Procedure Title are required.' }
  }

  const allowedAssets = await getScopedLotoAssets({
    organizationId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!allowedAssets.some((asset: any) => asset.id === payload.asset_id)) {
    return { error: 'Selected equipment is outside your create scope.' }
  }

  const supabase = createServiceRoleClient() as any

  const { data: procedureNumber, error: numberError } = await supabase.rpc('next_forge_loto_number', {
    p_organization_id: organizationId
  })

  if (numberError || !procedureNumber) {
    return { error: numberError?.message || 'Unable to generate LOTO procedure number.' }
  }

  const { data: procedure, error } = await supabase
    .from('forge_loto_procedures')
    .insert({
      organization_id: organizationId,
      procedure_number: procedureNumber,
      ...payload,
      status: 'draft',
      revision_number: 1,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !procedure) {
    return { error: error?.message || 'Unable to create LOTO procedure.' }
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.procedure_created',
    entityType: 'loto_procedure',
    entityId: procedure.id,
    after: procedure
  })

  revalidatePath('/loto')
  
return { id: procedure.id, message: 'LOTO procedure created as Draft.' }
}

export const updateLotoProcedure = async ({
  procedureId,
  values
}: {
  procedureId: string
  values: LotoFormValues
}) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'loto.procedure', values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (!['draft','review'].includes(before.status)) {
    return { error: 'Approved or retired LOTO procedures cannot be edited directly. Create a new revision first.' }
  }

  const payload = procedurePayload(values)

  if (!payload.asset_id || !payload.title) {
    return { error: 'Equipment / Asset and Procedure Title are required.' }
  }

  const allowedAssets = await getScopedLotoAssets({
    organizationId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!allowedAssets.some((asset: any) => asset.id === payload.asset_id)) {
    return { error: 'Selected equipment is outside your edit scope.' }
  }

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      ...payload,
      status: before.status === 'review' ? 'draft' : before.status,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to update LOTO procedure.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.procedure_updated',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before,
    after
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)
  
return { message: 'LOTO procedure saved.' }
}

export const addLotoEnergySource = async ({
  procedureId,
  values,
  componentId
}: {
  procedureId: string
  values: LotoFormValues

  /** Set to edit an existing energy source instead of adding one. */
  componentId?: string
}) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'loto.energy_source', values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped

  if (!['draft','review'].includes(scoped.procedure.status)) {
    return { error: 'Create a new procedure revision before changing energy sources.' }
  }

  const energyType = cleanText(values.energy_type)
  const sourceName = cleanText(values.source_name)
  const isolationLocation = cleanText(values.isolation_location)
  const verificationMethod = cleanText(values.verification_method)

  if (!energyType || !sourceName || !isolationLocation || !verificationMethod) {
    return { error: 'Energy Type, Source Name, Isolation Location, and Verification Method are required.' }
  }

  const fields = {
    energy_type: energyType,
    energy_code: cleanText(values.energy_code),
    source_name: sourceName,
    magnitude: cleanText(values.magnitude),
    isolation_location: isolationLocation,
    isolation_device: cleanText(values.isolation_device),
    lockout_device: cleanText(values.lockout_device),
    stored_energy_method: cleanText(values.stored_energy_method),
    verification_method: verificationMethod,
    notes: cleanText(values.notes),
    updated_by: context.user.id
  }

  if (componentId) {
    const { data: before } = await supabase
      .from('forge_loto_energy_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .eq('id', componentId)
      .maybeSingle()

    if (!before) return { error: 'Energy source not found.' }

    const { data: after, error } = await supabase
      .from('forge_loto_energy_sources')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', componentId)
      .select('*')
      .single()

    if (error || !after) return { error: error?.message || 'Unable to save energy source.' }

    await audit({
      supabase,
      actorUserId: context.user.id,
      organizationId,
      action: 'loto.energy_source_updated',
      entityType: 'loto_energy_source',
      entityId: componentId,
      before,
      after
    })

    revalidatePath('/loto/' + procedureId)
    
return { id: componentId, message: 'Energy source saved.' }
  }

  const { data: last } = await supabase
    .from('forge_loto_energy_sources')
    .select('sort_order')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: source, error } = await supabase
    .from('forge_loto_energy_sources')
    .insert({
      organization_id: organizationId,
      procedure_id: procedureId,
      ...fields,
      sort_order: Number(last?.sort_order || 0) + 10,
      created_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !source) return { error: error?.message || 'Unable to add energy source.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.energy_source_added',
    entityType: 'loto_energy_source',
    entityId: source.id,
    after: source
  })

  revalidatePath('/loto/' + procedureId)
  
return { id: source.id, message: 'Energy source added.' }
}

export const addLotoStep = async ({
  procedureId,
  values,
  componentId
}: {
  procedureId: string
  values: LotoFormValues

  /** Set to edit an existing step instead of adding one. */
  componentId?: string
}) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'loto.step', values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped

  if (!['draft','review'].includes(scoped.procedure.status)) {
    return { error: 'Create a new procedure revision before changing procedure steps.' }
  }

  const stepType = cleanText(values.step_type)
  const title = cleanText(values.title)
  const instructions = cleanText(values.instructions)

  if (!stepType || !title || !instructions) {
    return { error: 'Step Type, Step Title, and Instructions are required.' }
  }

  const fields = {
    step_type: stepType,
    title,
    instructions,
    warning_text: cleanText(values.warning_text),
    verification_required: Boolean(cleanText(values.verification_instructions)),
    verification_instructions: cleanText(values.verification_instructions),
    updated_by: context.user.id
  }

  if (componentId) {
    const { data: before } = await supabase
      .from('forge_loto_steps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .eq('id', componentId)
      .maybeSingle()

    if (!before) return { error: 'Procedure step not found.' }

    const { data: after, error } = await supabase
      .from('forge_loto_steps')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', componentId)
      .select('*')
      .single()

    if (error || !after) return { error: error?.message || 'Unable to save LOTO step.' }

    await audit({
      supabase,
      actorUserId: context.user.id,
      organizationId,
      action: 'loto.step_updated',
      entityType: 'loto_step',
      entityId: componentId,
      before,
      after
    })

    revalidatePath('/loto/' + procedureId)
    
return { id: componentId, message: 'Procedure step saved.' }
  }

  const { data: last } = await supabase
    .from('forge_loto_steps')
    .select('sort_order')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: step, error } = await supabase
    .from('forge_loto_steps')
    .insert({
      organization_id: organizationId,
      procedure_id: procedureId,
      ...fields,
      sort_order: Number(last?.sort_order || 0) + 10,
      created_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !step) return { error: error?.message || 'Unable to add LOTO step.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.step_added',
    entityType: 'loto_step',
    entityId: step.id,
    after: step
  })

  revalidatePath('/loto/' + procedureId)
  
return { id: step.id, message: 'Procedure step added.' }
}

export const deleteLotoComponent = async ({
  procedureId,
  componentType,
  componentId
}: {
  procedureId: string
  componentType: 'energy_source' | 'step'
  componentId: string
}) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped

  if (!['draft','review'].includes(scoped.procedure.status)) {
    return { error: 'Approved or retired procedure components cannot be removed.' }
  }

  const table = componentType === 'energy_source'
    ? 'forge_loto_energy_sources'
    : 'forge_loto_steps'

  const { data: before } = await supabase
    .from(table)
    .select('*')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .eq('id', componentId)
    .maybeSingle()

  if (!before) return { error: 'LOTO procedure component not found.' }

  const { error } = await supabase.from(table).delete().eq('id', componentId)

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: componentType === 'energy_source' ? 'loto.energy_source_deleted' : 'loto.step_deleted',
    entityType: componentType === 'energy_source' ? 'loto_energy_source' : 'loto_step',
    entityId: componentId,
    before
  })

  revalidatePath('/loto/' + procedureId)
  
return { message: componentType === 'energy_source' ? 'Energy source removed.' : 'Procedure step removed.' }
}

export const submitLotoProcedureForReview = async (procedureId: string) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (before.status !== 'draft') return { error: 'Only Draft procedures can be submitted for review.' }

  const [{ count: sourceCount }, { count: stepCount }, { count: verifyCount }] = await Promise.all([
    supabase
      .from('forge_loto_energy_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId),
    supabase
      .from('forge_loto_steps')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId),
    supabase
      .from('forge_loto_steps')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .eq('step_type', 'verify')
  ])

  if (!sourceCount) return { error: 'Add at least one hazardous energy source before review.' }
  if (!stepCount) return { error: 'Add the required procedure steps before review.' }
  if (!verifyCount) return { error: 'Add a Verify Isolation step before review.' }

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      status: 'review',
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to submit LOTO procedure for review.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.submitted_for_review',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before,
    after
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)
  
return { message: 'LOTO procedure submitted for review.' }
}

export const approveLotoProcedure = async (procedureId: string) => {
  const context = await requireTenantPermission('loto.approve')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (before.status !== 'review') return { error: 'Only procedures Under Review can be approved.' }

  const [{ count: sourceCount }, { count: stepCount }, { count: verifyCount }] = await Promise.all([
    supabase.from('forge_loto_energy_sources').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('procedure_id', procedureId),
    supabase.from('forge_loto_steps').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('procedure_id', procedureId),
    supabase.from('forge_loto_steps').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('procedure_id', procedureId).eq('step_type', 'verify')
  ])

  if (!sourceCount || !stepCount || !verifyCount) {
    return { error: 'Approval requires at least one energy source, procedure steps, and a Verify Isolation step.' }
  }

  const today = new Date()

  const defaultNextReview = new Date(Date.UTC(
    today.getUTCFullYear() + 1,
    today.getUTCMonth(),
    today.getUTCDate()
  )).toISOString().slice(0, 10)

  const now = new Date().toISOString()

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      status: 'approved',
      effective_date: before.effective_date || now.slice(0, 10),
      next_review_date: before.next_review_date || defaultNextReview,
      approved_at: now,
      approved_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to approve LOTO procedure.' }

  await storeRevisionSnapshot({
    supabase,
    organizationId,
    procedure: after,
    userId: context.user.id
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.approved',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before,
    after
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)
  
return { message: 'LOTO procedure approved for operational use.' }
}

export const createLotoRevision = async (procedureId: string) => {
  const context = await requireTenantPermission('loto.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (before.status !== 'approved') {
    return { error: 'Only an Approved procedure can be opened as a new revision.' }
  }

  await storeRevisionSnapshot({
    supabase,
    organizationId,
    procedure: before,
    userId: context.user.id
  })

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      revision_number: Number(before.revision_number) + 1,
      status: 'draft',
      approved_at: null,
      approved_by: null,
      effective_date: null,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to create LOTO revision.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.revision_created',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before,
    after
  })

  revalidatePath('/loto/' + procedureId)
  
return { message: 'Revision ' + String(after.revision_number) + ' opened as Draft.' }
}

export const recordLotoReview = async ({
  procedureId,
  values
}: {
  procedureId: string
  values: LotoFormValues
}) => {
  const context = await requireTenantPermission('loto.review')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'loto.review', values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (before.status !== 'approved') return { error: 'Periodic reviews can only be recorded for Approved procedures.' }

  const reviewResult = cleanText(values.review_result)

  if (!reviewResult) return { error: 'Review Result is required.' }

  const nextReviewDate = cleanText(values.next_review_date)

  const { data: review, error } = await supabase
    .from('forge_loto_reviews')
    .insert({
      organization_id: organizationId,
      procedure_id: procedureId,
      reviewed_by: context.user.id,
      review_result: reviewResult,
      employee_observed: cleanText(values.employee_observed),
      deviations_found: cleanText(values.deviations_found),
      corrective_actions: cleanText(values.corrective_actions),
      notes: cleanText(values.notes),
      next_review_date: nextReviewDate
    })
    .select('*')
    .single()

  if (error || !review) return { error: error?.message || 'Unable to record LOTO review.' }

  let procedureUpdate: Record<string, unknown> = {
    next_review_date: nextReviewDate || before.next_review_date,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  if (reviewResult !== 'satisfactory') {
    await storeRevisionSnapshot({
      supabase,
      organizationId,
      procedure: before,
      userId: context.user.id
    })

    procedureUpdate = {
      ...procedureUpdate,
      status: 'draft',
      revision_number: Number(before.revision_number) + 1,
      approved_at: null,
      approved_by: null,
      effective_date: null
    }
  }

  const { data: after } = await supabase
    .from('forge_loto_procedures')
    .update(procedureUpdate)
    .eq('id', procedureId)
    .select('*')
    .single()

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.periodic_review_recorded',
    entityType: 'loto_review',
    entityId: review.id,
    before,
    after: {
      review,
      procedure: after
    }
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)

  return {
    message: reviewResult === 'satisfactory'
      ? 'Periodic LOTO review recorded.'
      : 'Review recorded and procedure opened as a new Draft revision for correction.'
  }
}

export const retireLotoProcedure = async ({
  procedureId,
  reason
}: {
  procedureId: string
  reason: string
}) => {
  const context = await requireTenantPermission('loto.retire')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return scoped
  const before = scoped.procedure

  if (before.status === 'retired') return { error: 'Procedure is already retired.' }

  const { data: activeApplication } = await supabase
    .from('forge_loto_applications')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .in('status', ['in_progress', 'verified'])
    .maybeSingle()

  if (activeApplication) {
    return { error: 'Return the equipment to service or cancel the open lockout before retiring this procedure.' }
  }

  if (before.status === 'approved') {
    await storeRevisionSnapshot({
      supabase,
      organizationId,
      procedure: before,
      userId: context.user.id
    })
  }

  const now = new Date().toISOString()

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      status: 'retired',
      retired_at: now,
      retired_by: context.user.id,
      retirement_reason: reason.trim() || null,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to retire LOTO procedure.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.procedure_retired',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before,
    after,
    reason: reason.trim() || null
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)
  
return { message: 'LOTO procedure retired and preserved in history.' }
}
