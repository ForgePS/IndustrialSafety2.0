'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { createCorrectiveAction } from '@/app/(back)/corrective-actions/actions'
import {
  normalizeLotoArrows,
  normalizePrecautions,
  normalizeRestorationChecks,
  normalizeSequence,
  type LotoArrow,
  type LotoPrecaution,
  type LotoRestorationCheck,
  type LotoSequenceStep
} from '@/lib/forgeLotoRules'
import { audit, cleanText, requireProcedureInScope } from '@/lib/forgeLotoServer'
import { createRecordLink } from '@/lib/forgeRecordLinks'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; id?: string }

const editableProcedure = async (procedureId: string) => {
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

  if ('error' in scoped) return { error: scoped.error } as const

  if (!['draft', 'review'].includes(scoped.procedure.status)) {
    return { error: 'Create a new revision before changing an approved or retired procedure.' } as const
  }

  return { context, organizationId, supabase, procedure: scoped.procedure } as const
}

/** Precautions, printed page-2 text, shutdown / restore sequences and restoration checks. */
export const updateLotoContent = async ({
  procedureId,
  precautions,
  printPurpose,
  printScope,
  printEnforcement,
  shutdownSequence,
  restoreSequence,
  restorationChecks
}: {
  procedureId: string
  precautions: LotoPrecaution[]
  printPurpose: string
  printScope: string
  printEnforcement: string
  shutdownSequence: LotoSequenceStep[]
  restoreSequence: LotoSequenceStep[]
  restorationChecks: LotoRestorationCheck[]
}): Promise<Result> => {
  const loaded = await editableProcedure(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase, procedure: before } = loaded

  const { data: after, error } = await supabase
    .from('forge_loto_procedures')
    .update({
      precautions: normalizePrecautions(precautions),
      print_purpose: cleanText(printPurpose),
      print_scope: cleanText(printScope),
      print_enforcement: cleanText(printEnforcement),
      shutdown_sequence: normalizeSequence(shutdownSequence),
      restore_sequence: normalizeSequence(restoreSequence),
      restoration_checks: normalizeRestorationChecks(restorationChecks),
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', procedureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to save procedure content.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.content_updated',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before: {
      precautions: before.precautions,
      shutdown_sequence: before.shutdown_sequence,
      restore_sequence: before.restore_sequence,
      restoration_checks: before.restoration_checks
    },
    after: {
      precautions: after.precautions,
      shutdown_sequence: after.shutdown_sequence,
      restore_sequence: after.restore_sequence,
      restoration_checks: after.restoration_checks
    }
  })

  revalidatePath('/loto/' + procedureId)

  return { message: 'Procedure content saved.' }
}

/** Swap an energy source or step with its neighbour. */
export const moveLotoComponent = async ({
  procedureId,
  componentType,
  componentId,
  direction
}: {
  procedureId: string
  componentType: 'energy_source' | 'step'
  componentId: string
  direction: 'up' | 'down'
}): Promise<Result> => {
  const loaded = await editableProcedure(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded
  const table = componentType === 'energy_source' ? 'forge_loto_energy_sources' : 'forge_loto_steps'

  const { data: rows } = await supabase
    .from(table)
    .select('id, sort_order')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .order('sort_order')
    .order('created_at')

  const list = (rows || []) as Array<{ id: string; sort_order: number }>
  const index = list.findIndex(row => row.id === componentId)
  const swapWith = direction === 'up' ? index - 1 : index + 1

  if (index < 0) return { error: 'Item not found.' }
  if (swapWith < 0 || swapWith >= list.length) return { message: 'Already in place.' }

  // Renumber everything so equal sort orders from older data cannot stall the move.
  const ordered = [...list]

  ;[ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]]

  for (const [position, row] of ordered.entries()) {
    const sortOrder = (position + 1) * 10

    if (row.sort_order !== sortOrder) {
      const { error } = await supabase.from(table).update({ sort_order: sortOrder, updated_by: context.user.id }).eq('id', row.id)

      if (error) return { error: error.message }
    }
  }

  revalidatePath('/loto/' + procedureId)

  return { message: 'Order saved.' }
}

/**
 * Copy a step into a new step right after it (1.0's "Duplicate"). Steps carry text only in 2.0
 * (photos belong to the equipment or an energy source), so there is nothing else to copy.
 */
export const duplicateLotoStep = async ({ procedureId, stepId }: { procedureId: string; stepId: string }): Promise<Result> => {
  const loaded = await editableProcedure(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase, procedure } = loaded

  if (procedure.status !== 'draft') return { error: 'Steps can only be duplicated while the procedure is a Draft.' }

  const { data: rows } = await supabase
    .from('forge_loto_steps')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .order('sort_order')
    .order('created_at')

  const list = (rows || []) as any[]
  const index = list.findIndex(row => row.id === stepId)

  if (index < 0) return { error: 'Procedure step not found.' }

  const source = list[index]

  const { data: copy, error } = await supabase
    .from('forge_loto_steps')
    .insert({
      organization_id: organizationId,
      procedure_id: procedureId,
      step_type: source.step_type,
      title: source.title,
      instructions: source.instructions,
      warning_text: source.warning_text,
      verification_required: source.verification_required,
      verification_instructions: source.verification_instructions,
      sort_order: source.sort_order,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !copy) return { error: error?.message || 'Unable to duplicate the step.' }

  // Renumber so the copy sits directly after the original.
  const ordered = [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]

  for (const [position, row] of ordered.entries()) {
    const sortOrder = (position + 1) * 10

    if (row.id === copy.id || row.sort_order !== sortOrder) {
      const { error: orderError } = await supabase.from('forge_loto_steps').update({ sort_order: sortOrder, updated_by: context.user.id }).eq('id', row.id)

      if (orderError) return { error: orderError.message }
    }
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.step_duplicated',
    entityType: 'loto_step',
    entityId: copy.id,
    before: { source_step_id: stepId },
    after: { ...copy, sort_order: (index + 2) * 10 }
  })

  revalidatePath('/loto/' + procedureId)

  return { id: copy.id, message: 'Step duplicated.' }
}

export const updateLotoPhoto = async ({
  procedureId,
  photoId,
  caption,
  annotations
}: {
  procedureId: string
  photoId: string
  caption?: string
  annotations?: LotoArrow[]
}): Promise<Result> => {
  const loaded = await editableProcedure(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded
  const patch: Record<string, unknown> = {}

  if (caption !== undefined) patch.caption = cleanText(caption)
  if (annotations !== undefined) patch.annotations = normalizeLotoArrows(annotations)

  const { data, error } = await supabase
    .from('forge_loto_photos')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .eq('id', photoId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Photo not found.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.photo_updated',
    entityType: 'loto_procedure',
    entityId: procedureId,
    after: { photo_id: photoId, ...patch }
  })

  revalidatePath('/loto/' + procedureId)

  return { message: annotations !== undefined ? 'Arrows saved.' : 'Caption saved.' }
}

/** Removes the photo from this revision. The file stays so earlier revision snapshots still resolve. */
export const deleteLotoPhoto = async ({ procedureId, photoId }: { procedureId: string; photoId: string }): Promise<Result> => {
  const loaded = await editableProcedure(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded

  const { data, error } = await supabase
    .from('forge_loto_photos')
    .delete()
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .eq('id', photoId)
    .select('id, file_name')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Photo not found.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.photo_removed',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before: data
  })

  revalidatePath('/loto/' + procedureId)

  return { message: 'Photo removed.' }
}

/** Approver sends a procedure under review back to Draft with notes (1.0 "request changes"). */
export const returnLotoForCorrection = async ({ procedureId, notes }: { procedureId: string; notes: string }): Promise<Result> => {
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

  if ('error' in scoped) return { error: scoped.error }

  const { data: returnId, error } = await supabase.rpc('forge_loto_return_for_correction', {
    p_organization_id: organizationId,
    p_procedure_id: procedureId,
    p_notes: notes,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.returned_for_correction',
    entityType: 'loto_procedure',
    entityId: procedureId,
    before: { status: scoped.procedure.status },
    after: { status: 'draft', return_id: returnId },
    reason: notes.trim()
  })

  revalidatePath('/loto')
  revalidatePath('/loto/' + procedureId)

  return { message: 'Returned to the author for correction.' }
}

export const saveLotoSettings = async ({
  authorizedCourseId,
  requireAuthorizedTraining
}: {
  authorizedCourseId: string | null
  requireAuthorizedTraining: boolean
}): Promise<Result> => {
  const context = await requireTenantPermission('loto.settings')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const courseId = cleanText(authorizedCourseId)

  if (requireAuthorizedTraining && !courseId) return { error: 'Pick the authorized-employee course before requiring it.' }

  const { data: before } = await supabase.from('forge_loto_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  const { data: after, error } = await supabase
    .from('forge_loto_settings')
    .upsert({
      organization_id: organizationId,
      authorized_course_id: courseId,
      require_authorized_training: requireAuthorizedTraining,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to save LOTO settings.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.settings_updated',
    entityType: 'loto_settings',
    entityId: organizationId,
    before,
    after
  })

  revalidatePath('/loto/settings')

  return { message: 'LOTO settings saved.' }
}

/** A corrective action raised from a lockout (a problem found while the equipment was locked out). */
export const createCapaFromLockout = async (lockoutId: string): Promise<Result> => {
  const context = await requireTenantPermission('loto.view')

  await requireTenantPermission('corrective_actions.create')

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: lockout } = await supabase
    .from('forge_loto_applications')
    .select('id, lockout_number, procedure_id, work_description, forge_assets(id, name, asset_number, location_id, division_id), forge_loto_procedures(procedure_number, title)')
    .eq('organization_id', organizationId)
    .eq('id', lockoutId)
    .maybeSingle()

  if (!lockout) return { error: 'Lockout not found.' }

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId: lockout.procedure_id,
    supabase
  })

  if ('error' in scoped) return { error: scoped.error }

  const asset = lockout.forge_assets
  const reference = lockout.lockout_number || lockout.forge_loto_procedures?.procedure_number || 'LOTO'

  const capaResult = await createCorrectiveAction({
    title: `${reference}: ${asset?.name || lockout.forge_loto_procedures?.title || 'Lockout'}`,
    description: `Raised from lockout ${reference} (${lockout.forge_loto_procedures?.procedure_number || ''}). Work: ${lockout.work_description || 'not recorded'}.`,
    action_type: 'corrective',
    severity: 'moderate',
    source_type: 'loto',
    source_reference: reference,
    location_id: asset?.location_id || '',
    division_id: asset?.division_id || '',
    immediate_containment: ''
  })

  if ('error' in capaResult && capaResult.error) return { error: String(capaResult.error) }

  const capaId = 'id' in capaResult ? String(capaResult.id) : null

  if (!capaId) return { error: 'Unable to create Corrective Action.' }

  await supabase
    .from('forge_corrective_actions')
    .update({ source_id: lockout.id, source_type: 'loto', source_reference: reference, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', capaId)

  await createRecordLink({
    sourceResourceType: 'loto_application',
    sourceResourceId: lockout.id,
    targetResourceType: 'corrective_action',
    targetResourceId: capaId,
    relationshipType: 'generated_capa'
  })

  revalidatePath('/loto/lockouts/' + lockoutId)

  return { id: capaId, message: 'Corrective action created.' }
}
