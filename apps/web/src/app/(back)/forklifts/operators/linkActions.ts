'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { covers, forkliftRights, forkliftRpc, loadOperator, loadTruck } from '@/lib/forgeForkliftAccess'
import { notifyOperatorStatus } from '@/lib/forgeForkliftNotify'
import { isUuid, REFRESHER_REASONS } from '@/lib/forgeForkliftRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 19: incidents linked to a forklift and / or an operator (forge_forklift_incident_links, written here
 * with the service role; a database guard keeps every reference in one company). Linking and removing need
 * forklifts.manage covering the truck's or the operator's location. "Also require refresher training" also needs
 * forklifts.authorize there and goes through the operator workflow with the incident.
 */

type Result = { error?: string; message?: string }

const db = () => createServiceRoleClient() as any

const NOT_FOUND = "That wasn't found, or you can't change it."

const manager = async () => {
  const context = await tenantPermissionOrNull('forklifts.manage')

  if (!context) return null
  const organizationId = context.activeOrganization.id as string
  const userId = context.user.id as string

  return { organizationId, userId, rights: await forkliftRights(organizationId, userId, context.access) }
}

type Who = NonNullable<Awaited<ReturnType<typeof manager>>>

/** The truck and / or operator the link is on, each checked against the manage grant. */
const targets = async (who: Who, forkliftId?: string | null, operatorId?: string | null) => {
  const truck = forkliftId ? await loadTruck(who.organizationId, who.rights, forkliftId) : null
  const operator = operatorId ? await loadOperator(who.organizationId, who.rights, operatorId) : null

  if (forkliftId && (!truck || !covers(who.rights.manage, truck.asset.location_id))) return null
  if (operatorId && (!operator || !covers(who.rights.manage, operator.person.locationId))) return null
  if (!truck && !operator) return null

  return { truck, operator }
}

const refresh = (forkliftId?: string | null, operatorId?: string | null) => {
  if (forkliftId) revalidatePath(`/forklifts/trucks/${forkliftId}`)
  if (operatorId) revalidatePath(`/forklifts/operators/${operatorId}`)
  revalidatePath('/forklifts', 'layout')
  revalidatePath('/dashboard')
}

const log = (who: Who, forkliftId: string | null, operatorId: string | null, action: string, message: string, metadata: Record<string, unknown>) =>
  forkliftRpc('forge_forklift_log', {
    p_organization_id: who.organizationId,
    p_forklift_id: forkliftId,
    p_operator_id: operatorId,
    p_action: action,
    p_message: message.slice(0, 2000),
    p_actor_user_id: who.userId,
    p_actor_name: null,
    p_metadata: metadata
  })

export type IncidentLinkInput = {
  forkliftId?: string | null
  operatorId?: string | null
  incidentId?: string
  note?: string
  requireRefresher?: boolean
  refresherReason?: string
}

export const addIncidentLink = async (input: IncidentLinkInput): Promise<Result> => {
  const who = await manager()

  if (!who) return { error: 'You do not have permission to link incidents.' }
  const found = await targets(who, input.forkliftId || null, input.operatorId || null)

  if (!found) return { error: NOT_FOUND }
  if (!isUuid(input.incidentId)) return { error: 'Pick an incident.' }

  const supabase = db()
  const { data: incident } = await supabase.from('forge_incidents').select('id, incident_number, summary').eq('organization_id', who.organizationId).eq('id', input.incidentId).maybeSingle()

  if (!incident) return { error: 'Incident not found.' }

  const forkliftId = found.truck?.id || null
  const operatorId = found.operator?.id || null
  let existing = supabase.from('forge_forklift_incident_links').select('id').eq('organization_id', who.organizationId).eq('incident_id', incident.id)

  existing = forkliftId ? existing.eq('forklift_id', forkliftId) : existing.is('forklift_id', null)
  existing = operatorId ? existing.eq('operator_id', operatorId) : existing.is('operator_id', null)
  const { data: duplicate } = await existing.limit(1)

  if (duplicate?.length) return { error: 'That incident is already linked.' }

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 1000) : null

  // Refresher first, so a refused refresher (for example, a revoked authorization) links nothing.
  if (input.requireRefresher) {
    if (!found.operator) return { error: 'Refresher training is required of an operator.' }
    if (!covers(who.rights.authorize, found.operator.person.locationId)) return { error: 'You do not have permission to require refresher training for this operator.' }
    if (found.operator.refresher_required) return { error: 'This operator already needs refresher training.' }

    const reasonLabel = (input.refresherReason && REFRESHER_REASONS[input.refresherReason]) || REFRESHER_REASONS.accident
    const reason = `${reasonLabel} (incident ${incident.incident_number})${note ? ': ' + note : ''}`

    const { error } = await forkliftRpc('forge_forklift_set_operator_status', {
      p_organization_id: who.organizationId,
      p_operator_id: found.operator.id,
      p_actor_user_id: who.userId,
      p_action: 'require_refresher',
      p_reason: reason,
      p_incident_id: incident.id
    })

    if (error) return { error }
    await writeForgeAudit({
      actorUserId: who.userId,
      organizationId: who.organizationId,
      action: 'forklift_operator.require_refresher',
      entityType: 'forge_forklift_operator',
      entityId: found.operator.id,
      afterValue: { status: 'require_refresher', incident_id: incident.id },
      reason
    }).catch(() => {})
    await notifyOperatorStatus({ organizationId: who.organizationId, operatorId: found.operator.id, actorUserId: who.userId, action: 'require_refresher' })
  }

  const { data: link, error } = await supabase
    .from('forge_forklift_incident_links')
    .insert({ organization_id: who.organizationId, incident_id: incident.id, forklift_id: forkliftId, operator_id: operatorId, note, created_by: who.userId })
    .select('id')
    .single()

  if (error || !link) return { error: /unique/i.test(error?.message || '') ? 'That incident is already linked.' : error?.message || 'Something went wrong.' }

  await log(who, forkliftId, operatorId, 'incident_linked', `Linked incident ${incident.incident_number}: ${incident.summary}`, { incident_id: incident.id, link_id: link.id })
  await writeForgeAudit({
    actorUserId: who.userId,
    organizationId: who.organizationId,
    action: 'forklift.incident_linked',
    entityType: 'forge_forklift_incident_link',
    entityId: link.id,
    afterValue: { incident_id: incident.id, forklift_id: forkliftId, operator_id: operatorId, note }
  }).catch(() => {})
  refresh(forkliftId, operatorId)

  return { message: input.requireRefresher ? 'Incident linked and refresher training required.' : 'Incident linked.' }
}

export const removeIncidentLink = async (linkId: string): Promise<Result> => {
  const who = await manager()

  if (!who || !isUuid(linkId)) return { error: NOT_FOUND }

  const supabase = db()

  const { data: link } = await supabase
    .from('forge_forklift_incident_links')
    .select('id, incident_id, forklift_id, operator_id, note, forge_incidents(incident_number)')
    .eq('organization_id', who.organizationId)
    .eq('id', linkId)
    .maybeSingle()

  if (!link) return { error: NOT_FOUND }
  if (!(await targets(who, link.forklift_id, link.operator_id))) return { error: NOT_FOUND }

  const { error } = await supabase.from('forge_forklift_incident_links').delete().eq('organization_id', who.organizationId).eq('id', link.id)

  if (error) return { error: error.message }

  await log(who, link.forklift_id, link.operator_id, 'incident_unlinked', `Removed the link to incident ${link.forge_incidents?.incident_number || ''}`.trim(), { incident_id: link.incident_id })
  await writeForgeAudit({
    actorUserId: who.userId,
    organizationId: who.organizationId,
    action: 'forklift.incident_unlinked',
    entityType: 'forge_forklift_incident_link',
    entityId: link.id,
    beforeValue: { incident_id: link.incident_id, forklift_id: link.forklift_id, operator_id: link.operator_id, note: link.note }
  }).catch(() => {})
  refresh(link.forklift_id, link.operator_id)

  return { message: 'Link removed.' }
}
