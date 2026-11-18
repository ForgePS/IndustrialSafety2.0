'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { audit, requireProcedureInScope } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; id?: string }

export type LockHolderInput = { personnelId: string | null; holderName: string; lockTagId: string }

/** Every lockout action needs loto.execute and the lockout's procedure inside the user's scope. */
type Loaded = {
  ok: true
  context: Awaited<ReturnType<typeof requireTenantPermission>>
  organizationId: string
  supabase: any
  procedure: any
}

const executeContext = async (procedureId: string): Promise<Loaded | { error: string }> => {
  const context = await requireTenantPermission('loto.execute')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return { error: String(scoped.error) }

  return { ok: true, context, organizationId, supabase, procedure: scoped.procedure }
}

const lockoutContext = async (lockoutId: string): Promise<(Loaded & { lockout: any }) | { error: string }> => {
  const supabase = createServiceRoleClient() as any
  const context = await requireTenantPermission('loto.execute')

  const { data: lockout } = await supabase
    .from('forge_loto_applications')
    .select('id, procedure_id, status, lockout_number')
    .eq('organization_id', context.activeOrganization.id)
    .eq('id', lockoutId)
    .maybeSingle()

  if (!lockout) return { error: 'Lockout not found.' }

  const loaded = await executeContext(lockout.procedure_id)

  if (!('ok' in loaded)) return loaded

  return { ...loaded, lockout }
}

const done = (lockoutId: string, procedureId: string) => {
  revalidatePath('/loto/lockouts')
  revalidatePath('/loto/lockouts/' + lockoutId)
  revalidatePath('/loto/' + procedureId)
}

export const issueLockout = async ({
  procedureId,
  workDescription,
  affectedEmployees,
  affectedNotified,
  tryStartRequired,
  holders
}: {
  procedureId: string
  workDescription: string
  affectedEmployees: string
  affectedNotified: boolean
  tryStartRequired: boolean
  holders: LockHolderInput[]
}): Promise<Result> => {
  const loaded = await executeContext(procedureId)

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded

  const { data: lockoutId, error } = await supabase.rpc('forge_loto_issue_lockout', {
    p_organization_id: organizationId,
    p_procedure_id: procedureId,
    p_actor_user_id: context.user.id,
    p_work_description: workDescription,
    p_affected_employees: affectedEmployees,
    p_affected_notified: affectedNotified,
    p_try_start_required: tryStartRequired,
    p_holders: holders.map(holder => ({
      personnel_id: holder.personnelId || null,
      holder_name: holder.holderName,
      lock_tag_id: holder.lockTagId
    }))
  })

  if (error || !lockoutId) return { error: error?.message || 'Unable to issue the lockout.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lockout_issued',
    entityType: 'loto_application',
    entityId: lockoutId,
    after: { procedure_id: procedureId, work_description: workDescription, holders: holders.length, try_start_required: tryStartRequired }
  })

  done(lockoutId, procedureId)

  return { id: lockoutId, message: 'Lockout issued. Work through each step, then verify zero energy.' }
}

export const checkLockoutStep = async ({ lockoutId, stepId, checked }: { lockoutId: string; stepId: string; checked: boolean }): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded

  const { error } = await supabase.rpc('forge_loto_check_step', {
    p_organization_id: organizationId,
    p_application_id: lockoutId,
    p_step_id: stepId,
    p_checked: checked,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  revalidatePath('/loto/lockouts/' + lockoutId)

  return { message: checked ? 'Step checked.' : 'Step unchecked.' }
}

export const addLockoutLock = async ({ lockoutId, holder }: { lockoutId: string; holder: LockHolderInput }): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, lockout } = loaded

  const { data: lockId, error } = await supabase.rpc('forge_loto_add_lock', {
    p_organization_id: organizationId,
    p_application_id: lockoutId,
    p_personnel_id: holder.personnelId || null,
    p_holder_name: holder.holderName,
    p_lock_tag_id: holder.lockTagId,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lock_applied',
    entityType: 'loto_application',
    entityId: lockoutId,
    after: { lock_id: lockId, holder_name: holder.holderName, lock_tag_id: holder.lockTagId || null }
  })

  done(lockoutId, lockout.procedure_id)

  return { message: 'Lock added.' }
}

export const removeLockoutLock = async ({ lockoutId, lockId, note }: { lockoutId: string; lockId: string; note: string }): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, lockout } = loaded

  const { data: lock } = await supabase
    .from('forge_loto_application_locks')
    .select('id, application_id, holder_name, lock_tag_id')
    .eq('organization_id', organizationId)
    .eq('id', lockId)
    .maybeSingle()

  if (!lock || lock.application_id !== lockoutId) return { error: 'Lock not found.' }

  const { error } = await supabase.rpc('forge_loto_remove_lock', {
    p_organization_id: organizationId,
    p_lock_id: lockId,
    p_note: note,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lock_removed',
    entityType: 'loto_application',
    entityId: lockoutId,
    before: lock,
    reason: note.trim() || null
  })

  done(lockoutId, lockout.procedure_id)

  return { message: 'Lock removed.' }
}

export const verifyLockout = async ({
  lockoutId,
  zeroEnergyConfirmed,
  tryStartCompleted,
  notes
}: {
  lockoutId: string
  zeroEnergyConfirmed: boolean
  tryStartCompleted: boolean
  notes: string
}): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, lockout } = loaded

  const { error } = await supabase.rpc('forge_loto_verify_lockout', {
    p_organization_id: organizationId,
    p_application_id: lockoutId,
    p_zero_energy_confirmed: zeroEnergyConfirmed,
    p_try_start_completed: tryStartCompleted,
    p_notes: notes,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lockout_verified',
    entityType: 'loto_application',
    entityId: lockoutId,
    before: { status: lockout.status },
    after: { status: 'verified', zero_energy_confirmed: zeroEnergyConfirmed, try_start_completed: tryStartCompleted }
  })

  done(lockoutId, lockout.procedure_id)

  return { message: 'Zero energy verified. Work may proceed.' }
}

export const completeLockout = async ({ lockoutId, checks, notes }: { lockoutId: string; checks: string[]; notes: string }): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, lockout } = loaded

  const { error } = await supabase.rpc('forge_loto_complete_lockout', {
    p_organization_id: organizationId,
    p_application_id: lockoutId,
    p_checks: checks,
    p_notes: notes,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lockout_completed',
    entityType: 'loto_application',
    entityId: lockoutId,
    before: { status: lockout.status },
    after: { status: 'completed', restoration_checks_done: checks }
  })

  done(lockoutId, lockout.procedure_id)

  return { message: 'Equipment returned to service.' }
}

export const cancelLockout = async ({ lockoutId, reason }: { lockoutId: string; reason: string }): Promise<Result> => {
  const loaded = await lockoutContext(lockoutId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, lockout } = loaded

  const { error } = await supabase.rpc('forge_loto_cancel_lockout', {
    p_organization_id: organizationId,
    p_application_id: lockoutId,
    p_reason: reason,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.lockout_canceled',
    entityType: 'loto_application',
    entityId: lockoutId,
    before: { status: lockout.status },
    after: { status: 'canceled' },
    reason: reason.trim()
  })

  done(lockoutId, lockout.procedure_id)

  return { message: 'Lockout canceled.' }
}
