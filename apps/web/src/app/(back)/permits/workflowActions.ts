'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { loadCheckDefinitions, loadPermit, permitRights, rightsAt } from '@/lib/forgePermitAccess'
import { notifyPermitApproved, notifyPermitIssued, notifyPermitSentBack, notifyPermitSubmitted, notifyPermitSuspended } from '@/lib/forgePermitNotify'
import { isUuid, mergeCheckDefinitions, PERMIT_ROLE_LABELS, PERMIT_ROLES, permitPath, type PermitType } from '@/lib/forgePermitRules'

/**
 * Port slice 18: the permit workflow (submit, withdraw, approve, send back, issue, suspend, resume, work complete,
 * close, cancel), the people on a permit, the checklist, gas tests and the confined space entry log. Every action
 * checks the permission, then the permit's location against the person's grants, then calls the database
 * function, which re-checks the state and writes the history row. Its errors are plain language and shown as-is.
 */

type Result = { error?: string; message?: string; fireWatchEnd?: string | null; passed?: boolean }

const db = () => createServiceRoleClient() as any

const KEYS = ['permits.view', 'permits.request', 'permits.approve', 'permits.manage']

const rpcError = (error: { message?: string } | null) => (error?.message || 'Something went wrong.').replace(/^.*?ERROR:\s*/, '')

const clean = (value: unknown, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const refresh = (type: PermitType, permitId: string) => {
  revalidatePath(permitPath(type, permitId))
  revalidatePath(permitPath(type))
  revalidatePath('/permits')
  revalidatePath('/dashboard')
}

/** The signed-in user, the permit (in this company and their scope) and what they may do at its location. */
const load = async (permitId: string) => {
  let context: Awaited<ReturnType<typeof tenantPermissionOrNull>> = null

  for (const key of KEYS) {
    context = await tenantPermissionOrNull(key)
    if (context) break
  }

  if (!context) return { error: 'You do not have permission to do that.' as const }
  if (!isUuid(permitId)) return { error: 'Permit not found.' as const }

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const rights = await permitRights(organizationId, userId, context.access)
  const permit = await loadPermit(organizationId, rights, permitId)

  if (!permit) return { error: 'Permit not found.' as const }

  const at = rightsAt(rights, permit.location_id)
  const mine = permit.requested_by === userId || permit.created_by === userId

  return { organizationId, userId, permit, at, mine, type: permit.permit_type as PermitType }
}

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { error: string }>

const audit = (loaded: Loaded, action: string, afterValue: Record<string, unknown>, reason: string | null = null) =>
  writeForgeAudit({
    actorUserId: loaded.userId,
    organizationId: loaded.organizationId,
    action: `permit.${action}`,
    entityType: 'forge_permit',
    entityId: loaded.permit.id,
    afterValue: { permit_number: loaded.permit.permit_number, ...afterValue },
    reason
  })

const logActivity = (loaded: Loaded, action: string, detail: string | null) =>
  db().from('forge_permit_activity').insert({ organization_id: loaded.organizationId, permit_id: loaded.permit.id, action, detail: detail ? detail.slice(0, 2000) : null, actor_user_id: loaded.userId })

const NO_RIGHT = 'You do not have permission to do that on this permit.'

/** Runs one status step: rights check, RPC, audit, notice, refresh. */
const step = async (
  permitId: string,
  {
    allowed,
    rpc,
    args = {},
    action,
    message,
    reason = null,
    after
  }: {
    allowed: (loaded: Loaded) => boolean
    rpc: string
    args?: Record<string, unknown>
    action: string
    message: (loaded: Loaded) => string
    reason?: string | null
    after?: (loaded: Loaded, data: any) => Promise<unknown>
  }
): Promise<Result & { data?: any }> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!allowed(loaded)) return { error: NO_RIGHT }

  const { data, error } = await db().rpc(rpc, { p_organization_id: loaded.organizationId, p_permit_id: loaded.permit.id, p_actor_user_id: loaded.userId, ...args })

  if (error) return { error: rpcError(error) }

  await audit(loaded, action, { from_status: loaded.permit.status }, reason)
  if (after) await after(loaded, data)
  refresh(loaded.type, loaded.permit.id)

  return { message: message(loaded), data }
}

const noticeInput = (loaded: Loaded) => ({ organizationId: loaded.organizationId, permitId: loaded.permit.id, actorUserId: loaded.userId })

// ---------------------------------------------------------------------------
// Status steps
// ---------------------------------------------------------------------------

export const submitPermit = async (permitId: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.at.request,
    rpc: 'forge_permit_submit',
    action: 'submitted',
    message: l => `${l.permit.permit_number} sent for approval.`,
    after: l => notifyPermitSubmitted(noticeInput(l))
  })

export const withdrawPermit = async (permitId: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.mine || l.at.manage,
    rpc: 'forge_permit_withdraw',
    action: 'withdrawn',
    message: l => `${l.permit.permit_number} is back in draft.`
  })

export const approvePermit = async (permitId: string, note?: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.at.approve,
    rpc: 'forge_permit_approve',
    args: { p_note: clean(note) || null },
    action: 'approved',
    message: l => `${l.permit.permit_number} approved. Issue it at the work when everything is in place.`,
    after: l => notifyPermitApproved(noticeInput(l))
  })

export const rejectPermit = async (permitId: string, reason: string): Promise<Result> => {
  if (!clean(reason)) return { error: 'Say why the permit is being sent back.' }

  return step(permitId, {
    allowed: l => l.at.approve,
    rpc: 'forge_permit_reject',
    args: { p_reason: clean(reason) },
    action: 'sent_back',
    reason: clean(reason),
    message: l => `${l.permit.permit_number} sent back to the requester.`,
    after: l => notifyPermitSentBack(noticeInput(l))
  })
}

export const issuePermit = async (permitId: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.at.approve,
    rpc: 'forge_permit_issue',
    action: 'issued',
    message: l => `${l.permit.permit_number} issued. Work may start.`,
    after: l => notifyPermitIssued(noticeInput(l))
  })

export const suspendPermit = async (permitId: string, reason: string): Promise<Result> => {
  if (!clean(reason)) return { error: 'Say why the work is being stopped.' }

  return step(permitId, {
    allowed: l => l.at.request || l.at.approve,
    rpc: 'forge_permit_suspend',
    args: { p_reason: clean(reason) },
    action: 'suspended',
    reason: clean(reason),
    message: l => `${l.permit.permit_number} suspended. Work must stop.`,
    after: l => notifyPermitSuspended({ ...noticeInput(l), gasFailed: false })
  })
}

export const resumePermit = async (permitId: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.at.approve,
    rpc: 'forge_permit_resume',
    action: 'resumed',
    message: l => `${l.permit.permit_number} is active again.`
  })

export const completePermitWork = async (permitId: string): Promise<Result> => {
  const result = await step(permitId, {
    allowed: l => l.at.request || l.at.approve,
    rpc: 'forge_permit_complete_work',
    action: 'work_completed',
    message: () => 'Work marked complete. The fire watch has started.'
  })

  return result.error ? result : { message: result.message, fireWatchEnd: result.data ? String(result.data) : null }
}

export const closePermit = async (permitId: string, note?: string): Promise<Result> =>
  step(permitId, {
    allowed: l => l.at.approve || l.mine,
    rpc: 'forge_permit_close',
    args: { p_note: clean(note) || null },
    action: 'closed',
    reason: clean(note) || null,
    message: l => `${l.permit.permit_number} closed.`
  })

export const cancelPermit = async (permitId: string, reason: string): Promise<Result> => {
  if (!clean(reason)) return { error: 'Say why the permit is being canceled.' }

  return step(permitId, {
    allowed: l => l.mine || l.at.manage || l.at.approve,
    rpc: 'forge_permit_cancel',
    args: { p_reason: clean(reason) },
    action: 'canceled',
    reason: clean(reason),
    message: l => `${l.permit.permit_number} canceled.`
  })
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const personName = async (personnelId: string | null, workerId: string | null) => {
  if (personnelId) {
    const { data } = await db().from('forge_personnel').select('first_name, last_name').eq('id', personnelId).maybeSingle()

    return data ? `${data.first_name} ${data.last_name}`.trim() : 'Unknown person'
  }

  const { data } = await db().from('forge_contractor_workers').select('first_name, last_name').eq('id', workerId).maybeSingle()

  return data ? `${data.first_name} ${data.last_name}`.trim() : 'Unknown contractor worker'
}

export const addPermitPerson = async (
  permitId: string,
  { role, personnelId, contractorWorkerId }: { role: string; personnelId?: string | null; contractorWorkerId?: string | null }
): Promise<Result> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!(loaded.at.request || loaded.at.approve)) return { error: NO_RIGHT }
  if (['closed', 'canceled'].includes(loaded.permit.status)) return { error: `This permit is ${loaded.permit.status} and can't be changed.` }
  if (!PERMIT_ROLES[loaded.type].includes(role)) return { error: "That role isn't used on this kind of permit." }

  const personnel = isUuid(personnelId) ? personnelId : null
  const worker = isUuid(contractorWorkerId) ? contractorWorkerId : null

  if (Boolean(personnel) === Boolean(worker)) return { error: 'Pick one person.' }

  const { error } = await db()
    .from('forge_permit_people')
    .insert({ organization_id: loaded.organizationId, permit_id: loaded.permit.id, role, personnel_id: personnel, contractor_worker_id: worker, added_by: loaded.userId })

  if (error) return { error: error.code === '23505' ? 'That person already has this role on the permit.' : rpcError(error) }

  const name = await personName(personnel, worker)
  const label = PERMIT_ROLE_LABELS[role] || role

  await logActivity(loaded, 'person_added', `${name} as ${label.toLowerCase()}`)
  await audit(loaded, 'person_added', { role, personnel_id: personnel, contractor_worker_id: worker })
  refresh(loaded.type, loaded.permit.id)

  return { message: `${name} added as ${label.toLowerCase()}.` }
}

export const removePermitPerson = async (permitId: string, personRowId: string): Promise<Result> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!(loaded.at.request || loaded.at.approve)) return { error: NO_RIGHT }
  if (!isUuid(personRowId)) return { error: 'Person not found on this permit.' }

  const { data: row } = await db()
    .from('forge_permit_people')
    .select('id, role, personnel_id, contractor_worker_id, removed_at')
    .eq('organization_id', loaded.organizationId)
    .eq('permit_id', loaded.permit.id)
    .eq('id', personRowId)
    .maybeSingle()

  if (!row || row.removed_at) return { error: 'Person not found on this permit.' }

  const { error } =
    loaded.permit.status === 'draft'
      ? await db().from('forge_permit_people').delete().eq('id', row.id)
      : await db().from('forge_permit_people').update({ removed_at: new Date().toISOString(), removed_by: loaded.userId }).eq('id', row.id)

  if (error) return { error: rpcError(error) }

  const name = await personName(row.personnel_id, row.contractor_worker_id)
  const label = PERMIT_ROLE_LABELS[row.role] || row.role

  await logActivity(loaded, 'person_removed', `${name} (${label.toLowerCase()})`)
  await audit(loaded, 'person_removed', { role: row.role, personnel_id: row.personnel_id, contractor_worker_id: row.contractor_worker_id })
  refresh(loaded.type, loaded.permit.id)

  return { message: `${name} removed from the permit.` }
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

/** Saves the checklist answers. An item sent with no answer clears it. */
export const savePermitChecklist = async (
  permitId: string,
  answers: { check_key: string; answer: 'yes' | 'no' | 'na' | '' | null; note?: string | null }[]
): Promise<Result> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!(loaded.at.request || loaded.at.approve)) return { error: NO_RIGHT }
  if (!['draft', 'requested', 'approved'].includes(loaded.permit.status)) return { error: 'The checklist is fixed once the permit is issued.' }
  if (!Array.isArray(answers)) return { error: 'Nothing to save.' }

  const definitions = new Map(mergeCheckDefinitions(await loadCheckDefinitions(loaded.organizationId, loaded.type)).map(item => [item.check_key, item]))
  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  const cleared: string[] = []

  for (const item of answers) {
    const definition = definitions.get(item?.check_key)

    if (!definition) return { error: 'Unknown checklist item.' }

    const note = clean(item.note, 1000) || null

    if (!item.answer) {
      cleared.push(definition.check_key)
      continue
    }

    if (!['yes', 'no', 'na'].includes(item.answer)) return { error: 'Answer yes, no or not applicable.' }
    if (item.answer === 'na' && !definition.allow_na) return { error: `${definition.label} can't be marked not applicable.` }
    if (item.answer === 'na' && !note) return { error: `Add a note for "${definition.label}".` }

    rows.push({ organization_id: loaded.organizationId, permit_id: loaded.permit.id, check_key: definition.check_key, answer: item.answer, note, answered_by: loaded.userId, answered_at: now })
  }

  if (rows.length) {
    const { error } = await db().from('forge_permit_checks').upsert(rows, { onConflict: 'permit_id,check_key' })

    if (error) return { error: rpcError(error) }
  }

  if (cleared.length) {
    const { error } = await db().from('forge_permit_checks').delete().eq('permit_id', loaded.permit.id).in('check_key', cleared)

    if (error) return { error: rpcError(error) }
  }

  const noCount = rows.filter(row => row.answer === 'no').length

  await logActivity(loaded, 'checklist_saved', `${rows.length} answered${noCount ? `, ${noCount} not ready` : ''}`)
  refresh(loaded.type, loaded.permit.id)

  return { message: 'Checklist saved.' }
}

// ---------------------------------------------------------------------------
// Gas tests
// ---------------------------------------------------------------------------

const reading = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export const recordPermitGasTest = async (
  permitId: string,
  input: {
    o2?: number | string | null
    lel?: number | string | null
    h2s?: number | string | null
    co?: number | string | null
    otherGas?: string | null
    otherValue?: number | string | null
    otherLimit?: number | string | null
    instrument?: string | null
    bumpTested?: boolean
    testPoint?: string | null
    note?: string | null
  }
): Promise<Result> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!(loaded.at.request || loaded.at.approve)) return { error: NO_RIGHT }

  const values = { o2: reading(input.o2), lel: reading(input.lel), h2s: reading(input.h2s), co: reading(input.co), otherValue: reading(input.otherValue), otherLimit: reading(input.otherLimit) }

  if (Object.values(values).some(value => Number.isNaN(value))) return { error: 'Readings must be numbers.' }
  if ([values.o2, values.lel].some(value => value !== null && (value < 0 || value > 100))) return { error: 'Oxygen and LEL are percentages from 0 to 100.' }
  if ([values.h2s, values.co].some(value => value !== null && (value < 0 || value > 10000))) return { error: 'H2S and CO readings must be between 0 and 10,000 ppm.' }

  const otherGas = clean(input.otherGas, 80) || null

  if (otherGas && values.otherValue === null) return { error: `Enter the ${otherGas} reading.` }

  const wasActive = loaded.permit.status === 'active'

  const { data, error } = await db().rpc('forge_permit_record_gas_test', {
    p_organization_id: loaded.organizationId,
    p_permit_id: loaded.permit.id,
    p_actor_user_id: loaded.userId,
    p_o2: values.o2,
    p_lel: values.lel,
    p_h2s: values.h2s,
    p_co: values.co,
    p_other_gas: otherGas,
    p_other_value: otherGas ? values.otherValue : null,
    p_other_limit: otherGas ? values.otherLimit : null,
    p_instrument: clean(input.instrument, 200) || null,
    p_bump_tested: Boolean(input.bumpTested),
    p_test_point: clean(input.testPoint, 200) || null,
    p_note: clean(input.note, 1000) || null
  })

  if (error) return { error: rpcError(error) }

  const row = Array.isArray(data) ? data[0] : data
  const passed = Boolean(row?.passed)

  await audit(loaded, passed ? 'gas_test_passed' : 'gas_test_failed', { gas_test_id: row?.id, problems: row?.problems || [] })

  if (!passed && wasActive) {
    await notifyPermitSuspended({ ...noticeInput(loaded), gasFailed: true })
    refresh(loaded.type, loaded.permit.id)

    return {
      passed,
      message: `Gas test failed: ${(row?.problems || []).join('; ')}. The permit is suspended. Get everyone out of the space.`
    }
  }

  refresh(loaded.type, loaded.permit.id)

  return { passed, message: passed ? 'Gas test passed.' : `Gas test failed: ${(row?.problems || []).join('; ')}.` }
}

// ---------------------------------------------------------------------------
// Confined space entry log
// ---------------------------------------------------------------------------

const entryStep = async (permitId: string, personRowId: string, direction: 'in' | 'out'): Promise<Result> => {
  const loaded = await load(permitId)

  if ('error' in loaded) return { error: loaded.error }
  if (!(loaded.at.request || loaded.at.approve)) return { error: NO_RIGHT }
  if (!isUuid(personRowId)) return { error: 'Person not found on this permit.' }

  const { data: row } = await db()
    .from('forge_permit_people')
    .select('id, personnel_id, contractor_worker_id')
    .eq('organization_id', loaded.organizationId)
    .eq('permit_id', loaded.permit.id)
    .eq('id', personRowId)
    .maybeSingle()

  if (!row) return { error: 'Person not found on this permit.' }

  const { error } = await db().rpc(direction === 'in' ? 'forge_permit_sign_in' : 'forge_permit_sign_out', {
    p_organization_id: loaded.organizationId,
    p_permit_id: loaded.permit.id,
    p_person_id: row.id,
    p_actor_user_id: loaded.userId
  })

  if (error) return { error: rpcError(error) }

  const name = await personName(row.personnel_id, row.contractor_worker_id)

  refresh(loaded.type, loaded.permit.id)

  return { message: direction === 'in' ? `${name} signed in to the space.` : `${name} signed out of the space.` }
}

export const signInEntrant = async (permitId: string, personRowId: string): Promise<Result> => entryStep(permitId, personRowId, 'in')

export const signOutEntrant = async (permitId: string, personRowId: string): Promise<Result> => entryStep(permitId, personRowId, 'out')
