'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { createCapaForSource } from '@/lib/forgeCapaCreate'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { approverCandidates, covers, loadMoc, loadPha, psmRights, queuePsmNotice, todayIso, userNameMap } from '@/lib/forgeProcessSafety'
import {
  approvalOutcome,
  cleanActionInput,
  cleanApprovers,
  cleanDecision,
  cleanMocInput,
  cleanPhaInput,
  cleanPssr,
  isUuid,
  mocNotice,
  stepAllowed
} from '@/lib/forgeProcessSafetyRules'

/**
 * Port slice 16: Process Safety actions. Every check is made here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const NOT_FOUND = "That record wasn't found, or you can't change it."
const NO_MANAGE = "You don't have permission to manage process safety at that location."

const withPermission = async (key: string) => {
  const context = await tenantPermissionOrNull(key)

  if (!context) return null

  const organizationId = context.activeOrganization.id as string
  const userId = context.user.id as string
  const rights = await psmRights(organizationId, userId, context.access)

  return { organizationId, userId, rights }
}

type Who = NonNullable<Awaited<ReturnType<typeof withPermission>>>

const audit = (who: Who, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue }).catch(() => {})

const activity = async (who: Who, parent: { mocId?: string; phaId?: string }, type: string, message: string, metadata: Record<string, unknown> = {}) => {
  await db()
    .from('forge_psm_activity')
    .insert({ organization_id: who.organizationId, moc_id: parent.mocId || null, pha_id: parent.phaId || null, activity_type: type, message: message.slice(0, 1000), actor_user_id: who.userId, metadata })
}

const friendly = (message: string) => {
  if (/forge_moc_documents_unique/.test(message)) return 'That document is already linked.'
  if (/owner must be an active member/.test(message)) return 'The owner must be an active member of the company.'
  if (/one company/.test(message)) return 'Pick records from this company.'
  if (/closed or canceled/.test(message)) return "A closed or canceled change can't be changed."

  return 'Unable to save: ' + message
}

const refresh = () => revalidatePath('/process-safety', 'layout')

const nowIso = () => new Date().toISOString()

/** A change the person may manage (manage permission at its location). */
const manageableMoc = async (who: Who, id: string) => {
  const found = await loadMoc({ organizationId: who.organizationId, rights: who.rights, id })

  return found && found.canManage ? found : null
}

const checkLocation = async (who: Who, locationId: string, assetId: string | null) => {
  const supabase = db()
  const { data: location } = await supabase.from('locations').select('id').eq('organization_id', who.organizationId).eq('id', locationId).maybeSingle()

  if (!location) return 'Pick a valid location.'

  if (assetId) {
    const { data: asset } = await supabase.from('forge_assets').select('id').eq('organization_id', who.organizationId).eq('id', assetId).maybeSingle()

    if (!asset) return 'Pick valid equipment.'
  }

  return null
}

const updateMoc = (id: string, change: Record<string, unknown>, fromStatus: string) =>
  db().from('forge_moc_changes').update(change).eq('id', id).eq('status', fromStatus).select('id').maybeSingle()

// ---------------------------------------------------------------------------
// Management of change
// ---------------------------------------------------------------------------

export const saveMoc = async (input: Record<string, unknown> & { id?: string; ownerUserId?: string }): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who || !who.rights.manage) return { error: NO_MANAGE }

  const clean = cleanMocInput(input, todayIso())

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only raise changes at your own locations.' }

  const existing = input.id ? await manageableMoc(who, String(input.id)) : null

  if (input.id && !existing) return { error: NOT_FOUND }
  if (existing && !stepAllowed('edit', existing.moc.status)) return { error: 'Only a draft or rejected change can be edited.' }

  const problem = await checkLocation(who, clean.locationId, clean.assetId)

  if (problem) return { error: problem }

  const ownerUserId = input.ownerUserId ? String(input.ownerUserId) : existing?.moc.owner_user_id || who.userId

  if (!isUuid(ownerUserId)) return { error: 'Pick the owner from the list.' }

  const row = {
    title: clean.title,
    change_type: clean.changeType,
    location_id: clean.locationId,
    asset_id: clean.assetId,
    description: clean.description,
    reason: clean.reason,
    technical_basis: clean.technicalBasis,
    risk_level: clean.riskLevel,
    impacts: clean.impacts,
    is_temporary: clean.isTemporary,
    temporary_until: clean.temporaryUntil,
    requires_pssr: clean.requiresPssr,
    owner_user_id: ownerUserId,
    updated_by: who.userId,
    updated_at: nowIso()
  }

  const supabase = db()

  if (existing) {
    // An approver can't own the change they approve.
    if (existing.approvals.some((approval: any) => approval.approver_user_id === ownerUserId)) return { error: 'The owner is also an approver. Change the approvers first.' }

    const { data, error } = await updateMoc(existing.moc.id, row, existing.moc.status)

    if (error || !data) return { error: friendly(error?.message || 'it changed while you were editing; reload and try again') }

    await activity(who, { mocId: existing.moc.id }, 'edited', 'Details updated')
    await audit(who, 'moc.updated', 'moc_change', existing.moc.id, row, existing.moc)
    refresh()

    return { id: existing.moc.id, message: 'Saved.' }
  }

  const { data: number, error: numberError } = await supabase.rpc('next_forge_psm_number', { p_organization_id: who.organizationId, p_kind: 'moc' })

  if (numberError || !number) return { error: 'Unable to number the change: ' + (numberError?.message || 'no number') }

  const { data, error } = await supabase
    .from('forge_moc_changes')
    .insert({ ...row, organization_id: who.organizationId, moc_number: number, status: 'draft', created_by: who.userId })
    .select('id')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await activity(who, { mocId: data.id }, 'created', `Change ${number} raised`)
  await audit(who, 'moc.created', 'moc_change', data.id, { ...row, moc_number: number })
  refresh()

  return { id: data.id, message: `${number} saved as a draft. Add approvers, then submit it for review.` }
}

/** Replace the approver list while the change is a draft or was rejected. */
export const saveApprovers = async (mocId: string, list: { userId: string; role?: string }[]): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (!stepAllowed('edit', found.moc.status)) return { error: 'Approvers can only be changed before the change is submitted.' }

  const excluded = [found.moc.owner_user_id, found.moc.created_by].filter(Boolean) as string[]
  const clean = cleanApprovers(list, excluded)

  if ('error' in clean) return { error: clean.error }

  const allowed = new Set((await approverCandidates({ organizationId: who.organizationId, locationId: found.moc.location_id, excluded })).map(item => item.id))

  if (clean.some(item => !allowed.has(item.userId))) return { error: 'Every approver must hold approval permission at this location.' }

  const supabase = db()
  const keep = new Set(clean.map(item => item.userId))
  const drop = found.approvals.filter((approval: any) => !keep.has(approval.approver_user_id)).map((approval: any) => approval.id)

  if (drop.length) {
    const { error } = await supabase.from('forge_moc_approvals').delete().in('id', drop)

    if (error) return { error: friendly(error.message) }
  }

  for (const item of clean) {
    const current = found.approvals.find((approval: any) => approval.approver_user_id === item.userId)

    const { error } = current
      ? await supabase.from('forge_moc_approvals').update({ role_label: item.role }).eq('id', current.id)
      : await supabase.from('forge_moc_approvals').insert({ organization_id: who.organizationId, moc_id: found.moc.id, approver_user_id: item.userId, role_label: item.role, created_by: who.userId })

    if (error) return { error: friendly(error.message) }
  }

  const names = await userNameMap(clean.map(item => item.userId))

  await activity(who, { mocId: found.moc.id }, 'approvers_set', 'Approvers: ' + clean.map(item => names.get(item.userId) + (item.role ? ` (${item.role})` : '')).join(', '))
  await audit(who, 'moc.approvers_set', 'moc_change', found.moc.id, { approvers: clean })
  refresh()

  return { message: 'Approvers saved.' }
}

export const submitMoc = async (mocId: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (!stepAllowed('submit', found.moc.status)) return { error: 'Only a draft or rejected change can be submitted.' }
  if (!found.approvals.length) return { error: 'Add at least one approver first.' }

  const supabase = db()

  // A resubmitted change is reviewed again from scratch.
  const { error: resetError } = await supabase.from('forge_moc_approvals').update({ decision: 'pending', comment: null, decided_at: null }).eq('moc_id', found.moc.id)

  if (resetError) return { error: friendly(resetError.message) }

  const { data, error } = await updateMoc(found.moc.id, { status: 'in_review', submitted_at: nowIso(), approved_at: null, updated_by: who.userId, updated_at: nowIso() }, found.moc.status)

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await activity(who, { mocId: found.moc.id }, 'submitted', found.moc.status === 'rejected' ? 'Resubmitted for review' : 'Submitted for review')
  await audit(who, 'moc.submitted', 'moc_change', found.moc.id, { status: 'in_review' }, { status: found.moc.status })

  const sent = await queuePsmNotice({
    organizationId: who.organizationId,
    moc: found.moc,
    eventType: 'moc_review_requested',
    notice: mocNotice(found.moc, 'review_requested'),
    recipients: found.approvals.map((approval: any) => approval.approver_user_id),
    actorUserId: who.userId
  })

  refresh()

  return { message: 'Submitted. The approvers have been notified.' + (sent.ok ? '' : ' ' + sent.error) }
}

/** An approver's decision. All approve → approved; any rejection → rejected (back to the owner). */
export const decideMoc = async (mocId: string, raw: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('process_safety.approve')

  if (!who) return { error: "You don't have permission to approve changes." }

  const found = await loadMoc({ organizationId: who.organizationId, rights: who.rights, id: mocId })

  if (!found || !found.canApprove) return { error: NOT_FOUND }
  if (!stepAllowed('decide', found.moc.status)) return { error: 'This change is not waiting for approval.' }

  const mine = found.approvals.find((approval: any) => approval.approver_user_id === who.userId)

  if (!mine || mine.decision !== 'pending') return { error: 'You have already decided on this change.' }

  const clean = cleanDecision(raw)

  if ('error' in clean) return { error: clean.error }

  const supabase = db()

  const { data: updated, error } = await supabase
    .from('forge_moc_approvals')
    .update({ decision: clean.decision, comment: clean.comment, decided_at: nowIso() })
    .eq('id', mine.id)
    .eq('decision', 'pending')
    .select('id')
    .maybeSingle()

  if (error || !updated) return { error: friendly(error?.message || 'already decided') }

  const { data: all } = await supabase.from('forge_moc_approvals').select('decision').eq('moc_id', found.moc.id)
  const outcome = approvalOutcome(((all || []) as any[]).map(row => row.decision))
  const names = await userNameMap([who.userId])
  const by = names.get(who.userId) || 'An approver'

  await activity(who, { mocId: found.moc.id }, 'decision', `${by} ${clean.decision === 'approved' ? 'approved' : 'rejected'}${clean.comment ? ': ' + clean.comment : ''}`)
  await audit(who, 'moc.decision', 'moc_change', found.moc.id, { decision: clean.decision, comment: clean.comment })

  const people = [found.moc.owner_user_id, found.moc.created_by]
  let message = clean.decision === 'approved' ? 'Approved.' : 'Rejected. The owner has been told why.'

  if (outcome === 'in_review') {
    await queuePsmNotice({ organizationId: who.organizationId, moc: found.moc, eventType: 'moc_decision', notice: mocNotice(found.moc, clean.decision === 'approved' ? 'decision' : 'rejected', { by, comment: clean.comment }), recipients: people, actorUserId: who.userId })
  } else {
    const change = outcome === 'approved' ? { status: 'approved', approved_at: nowIso() } : { status: 'rejected' }
    const { data } = await updateMoc(found.moc.id, { ...change, updated_by: who.userId, updated_at: nowIso() }, 'in_review')

    if (data) {
      await activity(who, { mocId: found.moc.id }, outcome, outcome === 'approved' ? 'Every approver approved the change' : 'The change was rejected and goes back to its owner')
      await queuePsmNotice({
        organizationId: who.organizationId,
        moc: found.moc,
        eventType: 'moc_' + outcome,
        notice: mocNotice(found.moc, outcome, { by, comment: clean.comment }),
        recipients: people,
        actorUserId: who.userId
      })
      if (outcome === 'approved') message = 'Approved. Every approver has now approved the change.'
    }
  }

  refresh()

  return { message }
}

/** Sign off the pre-startup safety review. Every item answered; pre-startup actions done first. */
export const completePssr = async (mocId: string, answers: unknown): Promise<Result> => {
  const who = await withPermission('process_safety.pssr')

  if (!who) return { error: "You don't have permission to sign off pre-startup safety reviews." }

  const found = await loadMoc({ organizationId: who.organizationId, rights: who.rights, id: mocId })

  if (!found || !found.canPssr) return { error: NOT_FOUND }
  if (!stepAllowed('pssr', found.moc.status)) return { error: 'The review is done once the change is approved and before it is implemented.' }
  if (!found.moc.requires_pssr) return { error: "This change doesn't need a pre-startup safety review." }
  if (found.moc.pssr_completed_at) return { error: 'The review is already signed off.' }
  if (found.blockers.pssr.length) return { error: 'Finish the pre-startup actions first: ' + found.blockers.pssr.join('; ') }

  const clean = cleanPssr(answers)

  // PssrAnswers is keyed by item, so narrow on the error's type rather than its key.
  if (typeof clean.error === 'string') return { error: clean.error }

  const { data, error } = await updateMoc(found.moc.id, { pssr_answers: clean, pssr_completed_at: nowIso(), pssr_completed_by: who.userId, updated_by: who.userId, updated_at: nowIso() }, 'approved')

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await activity(who, { mocId: found.moc.id }, 'pssr_completed', 'Pre-startup safety review signed off')
  await audit(who, 'moc.pssr_completed', 'moc_change', found.moc.id, { answers: clean })
  refresh()

  return { message: 'Pre-startup safety review signed off.' }
}

export const implementMoc = async (mocId: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (!stepAllowed('implement', found.moc.status)) return { error: 'Only an approved change can be put into service.' }
  if (found.blockers.implement.length) return { error: 'Not ready to start up: ' + found.blockers.implement.join('; ') }

  const { data, error } = await updateMoc(found.moc.id, { status: 'implemented', implemented_at: nowIso(), implemented_by: who.userId, updated_by: who.userId, updated_at: nowIso() }, 'approved')

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await activity(who, { mocId: found.moc.id }, 'implemented', 'Change put into service')
  await audit(who, 'moc.implemented', 'moc_change', found.moc.id, { status: 'implemented' }, { status: 'approved' })
  refresh()

  return { message: 'Marked as implemented.' }
}

export const closeMoc = async (mocId: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (!stepAllowed('close', found.moc.status)) return { error: 'Only an implemented change can be closed.' }
  if (found.blockers.close.length) return { error: 'Finish the open actions first: ' + found.blockers.close.join('; ') }

  // History first: once closed, the change is frozen.
  await activity(who, { mocId: found.moc.id }, 'closed', 'Change closed')

  const { data, error } = await updateMoc(found.moc.id, { status: 'closed', closed_at: nowIso(), closed_by: who.userId, updated_by: who.userId, updated_at: nowIso() }, 'implemented')

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await audit(who, 'moc.closed', 'moc_change', found.moc.id, { status: 'closed' }, { status: 'implemented' })
  refresh()

  return { message: 'Closed.' }
}

export const cancelMoc = async (mocId: string, reasonRaw: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (!stepAllowed('cancel', found.moc.status)) return { error: "An implemented or closed change can't be canceled." }

  const reason = String(reasonRaw || '').trim().slice(0, 1000)

  if (!reason) return { error: 'Say why the change is being canceled.' }

  await activity(who, { mocId: found.moc.id }, 'canceled', 'Canceled: ' + reason)

  const { data, error } = await updateMoc(found.moc.id, { status: 'canceled', canceled_at: nowIso(), canceled_by: who.userId, cancel_reason: reason, updated_by: who.userId, updated_at: nowIso() }, found.moc.status)

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await audit(who, 'moc.canceled', 'moc_change', found.moc.id, { status: 'canceled', reason }, { status: found.moc.status })
  refresh()

  return { message: 'Canceled.' }
}

// ---------------------------------------------------------------------------
// Actions and recommendations (Corrective Actions)
// ---------------------------------------------------------------------------

const SEVERITY: Record<string, string> = { low: 'low', medium: 'moderate', high: 'high' }

/** Add an MOC action or a PHA recommendation; it opens a Corrective Action with the owner and due date. */
export const addAction = async (kind: 'moc' | 'pha', parentId: string, raw: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const clean = cleanActionInput(raw, kind)

  if ('error' in clean) return { error: clean.error }

  const supabase = db()
  let parent: { id: string; number: string; title: string; locationId: string; severity: string }

  if (kind === 'moc') {
    const found = await manageableMoc(who, parentId)

    if (!found) return { error: NOT_FOUND }
    if (found.moc.status === 'closed' || found.moc.status === 'canceled') return { error: "A closed or canceled change can't get new actions." }
    if (clean.phase === 'before_startup' && found.moc.status === 'implemented') return { error: 'The change is already in service. Add an after-startup action.' }
    parent = { id: found.moc.id, number: found.moc.moc_number, title: found.moc.title, locationId: found.moc.location_id, severity: SEVERITY[found.moc.risk_level] || 'moderate' }
  } else {
    const found = await loadPha({ organizationId: who.organizationId, rights: who.rights, id: parentId })

    if (!found || !found.canManage || found.pha.archived_at) return { error: NOT_FOUND }
    parent = { id: found.pha.id, number: found.pha.pha_number, title: found.pha.title, locationId: found.pha.location_id, severity: 'moderate' }
  }

  const { data: person } = await supabase.from('forge_personnel').select('id').eq('organization_id', who.organizationId).eq('id', clean.ownerPersonnelId).is('archived_at', null).maybeSingle()

  if (!person) return { error: 'Pick who owns it from the personnel list.' }

  const { data: action, error } = await supabase
    .from('forge_psm_actions')
    .insert({ organization_id: who.organizationId, moc_id: kind === 'moc' ? parent.id : null, pha_id: kind === 'pha' ? parent.id : null, phase: clean.phase, title: clean.title, created_by: who.userId })
    .select('id')
    .single()

  if (error || !action) return { error: friendly(error?.message || 'no record') }

  const label = kind === 'moc' ? 'management of change' : 'process hazard analysis'

  const created = await createCapaForSource({
    organizationId: who.organizationId,
    actorUserId: who.userId,
    source: { type: kind === 'moc' ? 'moc_action' : 'pha_recommendation', id: action.id, reference: parent.number, linkResourceType: kind === 'moc' ? 'moc_change' : 'pha_study', linkResourceId: parent.id },
    values: {
      title: clean.title,
      description: (clean.description ? clean.description + '\n\n' : '') + `From ${label} ${parent.number}: ${parent.title}`,
      action_type: kind === 'moc' ? 'preventive' : 'corrective',
      severity: parent.severity,
      location_id: parent.locationId,
      division_id: null,
      due_at: new Date(clean.dueOn + 'T12:00:00Z').toISOString(),
      assigned_personnel_id: clean.ownerPersonnelId
    },
    createdMessage: `Corrective Action created from ${label} ${parent.number}`
  })

  if ('error' in created) {
    await supabase.from('forge_psm_actions').delete().eq('id', action.id)

    return { error: 'Unable to open the Corrective Action: ' + created.error }
  }

  await supabase.from('forge_psm_actions').update({ capa_id: created.id }).eq('id', action.id)
  await activity(who, kind === 'moc' ? { mocId: parent.id } : { phaId: parent.id }, 'action_added', `${kind === 'moc' ? 'Action' : 'Recommendation'} added: ${created.actionNumber} ${clean.title}`)
  await audit(who, kind === 'moc' ? 'moc.action_added' : 'pha.recommendation_added', kind === 'moc' ? 'moc_change' : 'pha_study', parent.id, { action_id: action.id, capa_id: created.id, phase: clean.phase })
  refresh()

  return { id: action.id, message: `Added as Corrective Action ${created.actionNumber}.` }
}

/** Take an action off the change or study (it stays in the history; its Corrective Action is untouched). */
export const removeAction = async (actionId: string, reasonRaw: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who || !isUuid(actionId)) return { error: NO_MANAGE }

  const reason = String(reasonRaw || '').trim().slice(0, 500)

  if (!reason) return { error: 'Say why it is being removed.' }

  const supabase = db()
  const { data: action } = await supabase.from('forge_psm_actions').select('id, moc_id, pha_id, title, removed_at').eq('organization_id', who.organizationId).eq('id', actionId).maybeSingle()

  if (!action || action.removed_at) return { error: NOT_FOUND }

  if (action.moc_id) {
    const found = await manageableMoc(who, action.moc_id)

    if (!found) return { error: NOT_FOUND }
    if (found.moc.status === 'closed' || found.moc.status === 'canceled') return { error: "A closed or canceled change can't be changed." }
  } else {
    const found = await loadPha({ organizationId: who.organizationId, rights: who.rights, id: action.pha_id })

    if (!found || !found.canManage) return { error: NOT_FOUND }
  }

  const { error } = await supabase.from('forge_psm_actions').update({ removed_at: nowIso(), removed_by: who.userId, removed_reason: reason }).eq('id', action.id)

  if (error) return { error: friendly(error.message) }

  await activity(who, action.moc_id ? { mocId: action.moc_id } : { phaId: action.pha_id }, 'action_removed', `Removed "${action.title}": ${reason}`)
  await audit(who, 'psm.action_removed', action.moc_id ? 'moc_change' : 'pha_study', action.moc_id || action.pha_id, { action_id: action.id, reason })
  refresh()

  return { message: 'Removed. Its Corrective Action is unchanged.' }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const linkDocument = async (mocId: string, documentId: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who || !isUuid(documentId)) return { error: 'Pick a document.' }

  const found = await manageableMoc(who, mocId)

  if (!found) return { error: NOT_FOUND }
  if (found.moc.status === 'closed' || found.moc.status === 'canceled') return { error: "A closed or canceled change can't be changed." }

  const { data: document } = await db().from('forge_documents').select('id, document_number, name').eq('organization_id', who.organizationId).eq('id', documentId).is('archived_at', null).maybeSingle()

  if (!document) return { error: 'Pick a document from the library.' }

  const { error } = await db().from('forge_moc_documents').insert({ organization_id: who.organizationId, moc_id: found.moc.id, document_id: document.id, linked_by: who.userId })

  if (error) return { error: friendly(error.message) }

  await activity(who, { mocId: found.moc.id }, 'document_linked', `Document linked: ${document.document_number} ${document.name}`)
  refresh()

  return { message: 'Document linked.' }
}

export const unlinkDocument = async (mocId: string, linkId: string): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await manageableMoc(who, mocId)
  const link = found?.documents.find((item: any) => item.id === linkId)

  if (!found || !link) return { error: NOT_FOUND }
  if (found.moc.status === 'closed' || found.moc.status === 'canceled') return { error: "A closed or canceled change can't be changed." }

  const { error } = await db().from('forge_moc_documents').delete().eq('id', link.id)

  if (error) return { error: friendly(error.message) }

  await activity(who, { mocId: found.moc.id }, 'document_unlinked', `Document unlinked: ${link.forge_documents?.document_number || ''} ${link.forge_documents?.name || ''}`.trim())
  refresh()

  return { message: 'Document unlinked.' }
}

// ---------------------------------------------------------------------------
// Process hazard analyses
// ---------------------------------------------------------------------------

export const savePha = async (input: Record<string, unknown> & { id?: string }): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who || !who.rights.manage) return { error: NO_MANAGE }

  const clean = cleanPhaInput(input, todayIso())

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only record studies at your own locations.' }

  const existing = input.id ? await loadPha({ organizationId: who.organizationId, rights: who.rights, id: String(input.id) }) : null

  if (input.id && (!existing || !existing.canManage)) return { error: NOT_FOUND }
  if (existing?.pha.archived_at) return { error: 'Restore it before changing it.' }

  const problem = await checkLocation(who, clean.locationId, null)

  if (problem) return { error: problem }

  if (clean.mocId) {
    const moc = await loadMoc({ organizationId: who.organizationId, rights: who.rights, id: clean.mocId })

    if (!moc) return { error: 'Pick a change from the list.' }
  }

  const row = {
    title: clean.title,
    process_unit: clean.processUnit,
    location_id: clean.locationId,
    method: clean.method,
    status: clean.status,
    leader_name: clean.leaderName,
    team: clean.team,
    started_on: clean.startedOn,
    completed_on: clean.completedOn,
    revalidate_by: clean.revalidateBy,
    summary: clean.summary,
    moc_id: clean.mocId,
    updated_by: who.userId,
    updated_at: nowIso()
  }

  const supabase = db()

  if (existing) {
    const { error } = await supabase.from('forge_pha_studies').update(row).eq('id', existing.pha.id)

    if (error) return { error: friendly(error.message) }

    await activity(who, { phaId: existing.pha.id }, existing.pha.status !== clean.status && clean.status === 'completed' ? 'completed' : 'edited', clean.status === 'completed' && existing.pha.status !== 'completed' ? `Completed; revalidate by ${clean.revalidateBy}` : 'Details updated')
    await audit(who, 'pha.updated', 'pha_study', existing.pha.id, row, existing.pha)
    refresh()

    return { id: existing.pha.id, message: 'Saved.' }
  }

  const { data: number, error: numberError } = await supabase.rpc('next_forge_psm_number', { p_organization_id: who.organizationId, p_kind: 'pha' })

  if (numberError || !number) return { error: 'Unable to number the study: ' + (numberError?.message || 'no number') }

  const { data, error } = await supabase.from('forge_pha_studies').insert({ ...row, organization_id: who.organizationId, pha_number: number, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await activity(who, { phaId: data.id }, 'created', `Study ${number} recorded`)
  await audit(who, 'pha.created', 'pha_study', data.id, { ...row, pha_number: number })
  refresh()

  return { id: data.id, message: `${number} saved.` }
}

export const archivePha = async (id: string, archive: boolean): Promise<Result> => {
  const who = await withPermission('process_safety.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadPha({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }

  const { error } = await db().from('forge_pha_studies').update({ archived_at: archive ? nowIso() : null, updated_by: who.userId, updated_at: nowIso() }).eq('id', found.pha.id)

  if (error) return { error: friendly(error.message) }

  await activity(who, { phaId: found.pha.id }, archive ? 'archived' : 'restored', archive ? 'Archived' : 'Restored')
  await audit(who, archive ? 'pha.archived' : 'pha.restored', 'pha_study', found.pha.id, null)
  refresh()

  return { message: archive ? 'Archived.' : 'Restored.' }
}
