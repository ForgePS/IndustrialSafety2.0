'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { companyTimeZone, covers, forkliftRights, forkliftRpc, loadForkliftSettings, loadOperator } from '@/lib/forgeForkliftAccess'
import { notifyOperatorStatus } from '@/lib/forgeForkliftNotify'
import type { OperatorActionName } from '@/lib/forgeForkliftRules'
import { authorizationProblems, isTruckClass, isUuid, operatorActions, todayIn } from '@/lib/forgeForkliftRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 19: operator authorization (authorize, re-evaluate) and status changes (suspend, reinstate, revoke,
 * require refresher). Every action checks forklifts.authorize, then the operator's location (the person's) against
 * the grant, then calls the database workflow function, which re-checks the rules and writes the history row. Its
 * errors are plain language and shown as-is.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const KEYS = ['forklifts.authorize', 'forklifts.manage', 'forklifts.check', 'forklifts.view']

const NO_RIGHT = 'You do not have permission to authorize forklift operators for this person.'

/** The signed-in user and their forklift rights, if they hold any forklift permission. */
const signedIn = async () => {
  for (const key of KEYS) {
    const context = await tenantPermissionOrNull(key)

    if (!context) continue
    const organizationId = context.activeOrganization.id as string
    const userId = context.user.id as string

    return { organizationId, userId, rights: await forkliftRights(organizationId, userId, context.access) }
  }

  return null
}

type Who = NonNullable<Awaited<ReturnType<typeof signedIn>>>

const audit = (who: Who, action: string, operatorId: string, afterValue: Record<string, unknown>, beforeValue: Record<string, unknown> | null = null, reason: string | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action: `forklift_operator.${action}`, entityType: 'forge_forklift_operator', entityId: operatorId, beforeValue, afterValue, reason }).catch(
    () => {}
  )

const refresh = (operatorId?: string, personnelId?: string) => {
  revalidatePath('/forklifts', 'layout')
  if (operatorId) revalidatePath(`/forklifts/operators/${operatorId}`)
  if (personnelId) revalidatePath(`/personnel/${personnelId}`)
  revalidatePath('/dashboard')
}

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

export type AuthorizeInput = {
  personnelId?: string
  truckClasses?: string[]
  trainingCompletedOn?: string
  evaluatedOn?: string
  evaluatorName?: string
  evaluatorPersonnelId?: string
  evaluationNotes?: string
  restrictions?: string
}

/** Authorize a person, or record a new evaluation for an existing operator (clears a refresher or suspension). */
export const authorizeOperator = async (input: AuthorizeInput): Promise<Result> => {
  const who = await signedIn()

  if (!who || !who.rights.authorize) return { error: 'You do not have permission to authorize forklift operators.' }

  const personnelId = String(input.personnelId || '')

  if (!isUuid(personnelId)) return { error: 'Choose the operator.' }

  const supabase = db()

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id, first_name, last_name, location_id')
    .eq('organization_id', who.organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) return { error: 'That person is not in this company.' }
  if (!covers(who.rights.authorize, person.location_id)) return { error: NO_RIGHT }

  const evaluatorPersonnelId = isUuid(input.evaluatorPersonnelId) ? input.evaluatorPersonnelId : null
  let evaluatorName = text(input.evaluatorName, 200)

  if (evaluatorPersonnelId) {
    const { data: evaluator } = await supabase.from('forge_personnel').select('first_name, last_name').eq('organization_id', who.organizationId).eq('id', evaluatorPersonnelId).maybeSingle()

    if (!evaluator) return { error: 'The evaluator is not in this company.' }
    evaluatorName = `${evaluator.first_name} ${evaluator.last_name}`.trim()
  }

  const classes = [...new Set((Array.isArray(input.truckClasses) ? input.truckClasses : []).filter(value => typeof value === 'string'))]
  const [settings, timeZone] = await Promise.all([loadForkliftSettings(who.organizationId), companyTimeZone(who.organizationId)])

  const problems = authorizationProblems(
    {
      personnel_id: personnelId,
      truck_classes: classes,
      training_completed_on: input.trainingCompletedOn || '',
      evaluated_on: input.evaluatedOn || '',
      evaluator_name: evaluatorName || '',
      evaluator_personnel_id: evaluatorPersonnelId
    },
    settings,
    todayIn(timeZone)
  )

  if (problems.length) return { error: problems.join(' ') }
  if (!classes.every(isTruckClass)) return { error: 'Unknown truck class.' }

  const { data: before } = await supabase
    .from('forge_forklift_operators')
    .select('id, status, truck_classes, evaluated_on, expires_on, refresher_required')
    .eq('organization_id', who.organizationId)
    .eq('personnel_id', personnelId)
    .maybeSingle()

  const { data: operatorId, error } = await forkliftRpc<string>('forge_forklift_authorize', {
    p_organization_id: who.organizationId,
    p_actor_user_id: who.userId,
    p_personnel_id: personnelId,
    p_truck_classes: classes,
    p_training_completed_on: input.trainingCompletedOn,
    p_evaluated_on: input.evaluatedOn,
    p_evaluator_name: evaluatorName,
    p_evaluator_personnel_id: evaluatorPersonnelId,
    p_evaluation_notes: text(input.evaluationNotes, 4000),
    p_restrictions: text(input.restrictions, 1000)
  })

  if (error || !operatorId) return { error: error || 'Something went wrong.' }

  const { data: after } = await supabase.from('forge_forklift_operators').select('status, truck_classes, evaluated_on, expires_on').eq('id', operatorId).maybeSingle()

  await audit(who, before ? 'evaluated' : 'authorized', operatorId, { personnel_id: personnelId, ...(after || {}) }, before || null)
  refresh(operatorId, personnelId)

  const name = `${person.first_name} ${person.last_name}`.trim()

  return { id: operatorId, message: before ? `New evaluation recorded for ${name}.` : `${name} is authorized.` }
}

const ACTION_MESSAGES: Record<OperatorActionName, string> = {
  suspend: 'Authorization suspended.',
  reinstate: 'Authorization reinstated.',
  revoke: 'Authorization revoked.',
  require_refresher: 'Refresher training required.'
}

/** Suspend, reinstate, revoke or require refresher training (with a reason; optionally the incident behind it). */
export const setOperatorStatus = async (operatorId: string, action: string, reason?: string, incidentId?: string | null): Promise<Result> => {
  const who = await signedIn()

  if (!who || !who.rights.authorize) return { error: 'You do not have permission to change forklift authorizations.' }

  const operator = await loadOperator(who.organizationId, who.rights, operatorId)

  if (!operator) return { error: 'Operator not found.' }
  if (!covers(who.rights.authorize, operator.person.locationId)) return { error: NO_RIGHT }
  if (!(['suspend', 'reinstate', 'revoke', 'require_refresher'] as string[]).includes(action)) return { error: 'Unknown action.' }
  if (!operatorActions(operator).includes(action as OperatorActionName)) return { error: "That can't be done to this authorization now. Reload the page." }

  const why = text(reason, 1000)

  if (action !== 'reinstate' && !why) return { error: 'Give a reason.' }

  const incident = action === 'require_refresher' && isUuid(incidentId) ? incidentId : null

  if (incident) {
    const { data: row } = await db().from('forge_incidents').select('id').eq('organization_id', who.organizationId).eq('id', incident).maybeSingle()

    if (!row) return { error: 'Incident not found.' }
  }

  const { error } = await forkliftRpc('forge_forklift_set_operator_status', {
    p_organization_id: who.organizationId,
    p_operator_id: operator.id,
    p_actor_user_id: who.userId,
    p_action: action,
    p_reason: why,
    p_incident_id: incident
  })

  if (error) return { error }

  // The incident behind a refresher is linked to the operator too (once).
  if (incident) {
    const { data: existing } = await db().from('forge_forklift_incident_links').select('id').eq('organization_id', who.organizationId).eq('incident_id', incident).eq('operator_id', operator.id).is('forklift_id', null).limit(1)

    if (!existing?.length) {
      await db().from('forge_forklift_incident_links').insert({ organization_id: who.organizationId, incident_id: incident, operator_id: operator.id, note: why, created_by: who.userId })
    }
  }

  await audit(who, action, operator.id, { status: action, incident_id: incident }, { status: operator.status, refresher_required: operator.refresher_required }, why)
  await notifyOperatorStatus({ organizationId: who.organizationId, operatorId: operator.id, actorUserId: who.userId, action })
  refresh(operator.id, operator.personnel_id)

  return { message: ACTION_MESSAGES[action as OperatorActionName] }
}
