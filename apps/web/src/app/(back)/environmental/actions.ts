'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { createCapaForSource } from '@/lib/forgeCapaCreate'
import { covers, envRights, loadEvent, loadObligation, loadPermit, loadShipment, todayIso } from '@/lib/forgeEnvironmental'
import {
  advanceDue,
  capaSeverityForEvent,
  cleanCompletion,
  cleanEventInput,
  cleanObligationInput,
  cleanPermitInput,
  cleanShipmentInput,
  isDate,
  isUuid
} from '@/lib/forgeEnvironmentalRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 17: Environmental Safety actions. Every check is made here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const NOT_FOUND = "That record wasn't found, or you can't change it."
const NO_MANAGE = "You don't have permission to manage environmental records at that location."

const withPermission = async (key: string) => {
  const context = await tenantPermissionOrNull(key)

  if (!context) return null

  const organizationId = context.activeOrganization.id as string
  const userId = context.user.id as string

  return { organizationId, userId, rights: await envRights(organizationId, userId, context.access) }
}

type Who = NonNullable<Awaited<ReturnType<typeof withPermission>>>

const audit = (who: Who, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue }).catch(() => {})

const friendly = (message: string) => {
  if (/forge_env_waste_manifest_unique/.test(message)) return 'That manifest number is already recorded.'
  if (/forge_env_completions_once/.test(message)) return 'That occurrence is already recorded as done.'
  if (/owner must be an active member/.test(message)) return 'The owner must be an active member of the company.'
  if (/one company/.test(message)) return 'Pick records from this company.'
  if (/Reopen it first/.test(message)) return "A closed event can't be edited. Reopen it first."

  return 'Unable to save: ' + message
}

const refresh = () => revalidatePath('/environmental', 'layout')
const nowIso = () => new Date().toISOString()

const locationExists = async (organizationId: string, locationId: string) => {
  const { data } = await db().from('locations').select('id').eq('organization_id', organizationId).eq('id', locationId).maybeSingle()

  return Boolean(data)
}

/** A permit the person can see at the location, for linking (null id is fine). */
const permitUsable = async (who: Who, permitId: string | null, locationId: string) => {
  if (!permitId) return true

  const found = await loadPermit({ organizationId: who.organizationId, rights: who.rights, id: permitId })

  return Boolean(found && !found.permit.archived_at && found.permit.location_id === locationId)
}

// ---------------------------------------------------------------------------
// Permits
// ---------------------------------------------------------------------------

export const savePermit = async (id: string | null, input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const clean = cleanPermitInput(input)

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only keep permits for your own locations.' }
  if (!(await locationExists(who.organizationId, clean.locationId))) return { error: 'Pick a valid location.' }

  const existing = id ? await loadPermit({ organizationId: who.organizationId, rights: who.rights, id }) : null

  if (id && (!existing || !existing.canManage)) return { error: NOT_FOUND }
  if (existing?.permit.archived_at) return { error: 'Restore it before changing it.' }

  const documentId = input.documentId ? String(input.documentId) : null

  if (documentId && !isUuid(documentId)) return { error: 'Pick the document from the library.' }

  const row = {
    title: clean.title,
    permit_number: clean.permitNumber,
    permit_type: clean.permitType,
    agency: clean.agency,
    location_id: clean.locationId,
    status: clean.status,
    issued_on: clean.issuedOn,
    effective_on: clean.effectiveOn,
    expires_on: clean.expiresOn,
    document_id: documentId,
    notes: clean.notes,
    updated_by: who.userId,
    updated_at: nowIso()
  }

  const supabase = db()

  // Obligations follow their permit's location.
  if (existing && existing.permit.location_id !== clean.locationId && existing.obligations.length) return { error: 'This permit has obligations. Its location can’t change.' }

  const { data, error } = existing
    ? await supabase.from('forge_env_permits').update(row).eq('id', existing.permit.id).select('id').single()
    : await supabase.from('forge_env_permits').insert({ ...row, organization_id: who.organizationId, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, existing ? 'env_permit.updated' : 'env_permit.created', 'env_permit', data.id, row, existing?.permit || null)
  refresh()

  return { id: data.id, message: existing ? 'Saved.' : 'Permit added. Add the obligations it brings with it.' }
}

export const archivePermit = async (id: string, archive: boolean): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadPermit({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }

  const supabase = db()
  const { error } = await supabase.from('forge_env_permits').update({ archived_at: archive ? nowIso() : null, updated_by: who.userId, updated_at: nowIso() }).eq('id', found.permit.id)

  if (error) return { error: friendly(error.message) }

  // An archived permit's obligations stop coming due.
  if (archive) await supabase.from('forge_env_obligations').update({ active: false, updated_by: who.userId, updated_at: nowIso() }).eq('permit_id', found.permit.id).eq('active', true)

  await audit(who, archive ? 'env_permit.archived' : 'env_permit.restored', 'env_permit', found.permit.id, null)
  refresh()

  return { message: archive ? 'Archived. Its obligations are paused.' : 'Restored. Turn its obligations back on where they still apply.' }
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

export const saveObligation = async (id: string | null, input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const clean = cleanObligationInput(input)

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only keep obligations for your own locations.' }
  if (!(await locationExists(who.organizationId, clean.locationId))) return { error: 'Pick a valid location.' }
  if (!(await permitUsable(who, clean.permitId, clean.locationId))) return { error: 'Pick a current permit at the same location.' }

  const existing = id ? await loadObligation({ organizationId: who.organizationId, rights: who.rights, id }) : null

  if (id && (!existing || !existing.canManage)) return { error: NOT_FOUND }

  const row = {
    title: clean.title,
    obligation_type: clean.obligationType,
    frequency: clean.frequency,
    next_due_on: clean.nextDueOn,
    location_id: clean.locationId,
    permit_id: clean.permitId,
    owner_user_id: clean.ownerUserId,
    notes: clean.notes,
    active: true,
    updated_by: who.userId,
    updated_at: nowIso()
  }

  const supabase = db()

  const { data, error } = existing
    ? await supabase.from('forge_env_obligations').update(row).eq('id', existing.obligation.id).select('id').single()
    : await supabase.from('forge_env_obligations').insert({ ...row, organization_id: who.organizationId, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, existing ? 'env_obligation.updated' : 'env_obligation.created', 'env_obligation', data.id, row, existing?.obligation || null)
  refresh()

  return { id: data.id, message: 'Saved.' }
}

export const setObligationActive = async (id: string, active: boolean): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadObligation({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (active && !found.obligation.next_due_on) return { error: 'Edit it and give it a next due date first.' }

  const { error } = await db().from('forge_env_obligations').update({ active, updated_by: who.userId, updated_at: nowIso() }).eq('id', found.obligation.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, active ? 'env_obligation.resumed' : 'env_obligation.paused', 'env_obligation', found.obligation.id, null)
  refresh()

  return { message: active ? 'Resumed.' : 'Paused. It no longer comes due.' }
}

/** Record the occurrence due now as done, and move the due date on by one period. */
export const completeObligation = async (id: string, raw: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadObligation({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (!found.obligation.active || !found.obligation.next_due_on) return { error: 'This obligation is paused.' }

  const clean = cleanCompletion(raw, todayIso())

  if ('error' in clean) return { error: clean.error }

  const due = found.obligation.next_due_on as string
  const next = advanceDue(due, found.obligation.frequency)
  const supabase = db()

  // Move the schedule first, only if nobody else just did; then log the occurrence.
  const { data: moved, error } = await supabase
    .from('forge_env_obligations')
    .update({ next_due_on: next, active: next !== null, updated_by: who.userId, updated_at: nowIso() })
    .eq('id', found.obligation.id)
    .eq('next_due_on', due)
    .select('id')
    .maybeSingle()

  if (error || !moved) return { error: friendly(error?.message || 'it was just completed by someone else; reload') }

  const { error: logError } = await supabase.from('forge_env_obligation_completions').insert({
    organization_id: who.organizationId,
    obligation_id: found.obligation.id,
    due_on: due,
    completed_on: clean.completedOn,
    result: clean.result,
    notes: clean.notes,
    completed_by: who.userId
  })

  if (logError) {
    await supabase.from('forge_env_obligations').update({ next_due_on: due, active: true }).eq('id', found.obligation.id)

    return { error: friendly(logError.message) }
  }

  await audit(who, 'env_obligation.completed', 'env_obligation', found.obligation.id, { due_on: due, ...clean, next_due_on: next })
  refresh()

  return { message: next ? `Recorded. Next due ${next}.` : 'Recorded. This one-time obligation is done.' }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const eventRow = (clean: Exclude<ReturnType<typeof cleanEventInput>, { error: string }>) => ({
  event_type: clean.eventType,
  occurred_at: clean.occurredAt,
  location_id: clean.locationId,
  permit_id: clean.permitId,
  substance: clean.substance,
  quantity: clean.quantity,
  unit: clean.unit,
  media: clean.media,
  contained: clean.contained,
  reportable: clean.reportable,
  agency_name: clean.agencyName,
  agency_notified_at: clean.agencyNotifiedAt,
  agency_reference: clean.agencyReference,
  description: clean.description,
  immediate_actions: clean.immediateActions
})

/** Report an event (environmental.report at the location). */
export const reportEvent = async (input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.report')

  if (!who) return { error: "You don't have permission to report environmental events." }

  const clean = cleanEventInput(input, nowIso())

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.report, clean.locationId)) return { error: 'You can only report events at your own locations.' }
  if (!(await locationExists(who.organizationId, clean.locationId))) return { error: 'Pick a valid location.' }
  if (!(await permitUsable(who, clean.permitId, clean.locationId))) return { error: 'Pick a permit at the same location.' }

  const supabase = db()
  const { data: number, error: numberError } = await supabase.rpc('next_forge_env_number', { p_organization_id: who.organizationId })

  if (numberError || !number) return { error: 'Unable to number the event: ' + (numberError?.message || 'no number') }

  const row = eventRow(clean)

  const { data, error } = await supabase
    .from('forge_env_events')
    .insert({ ...row, organization_id: who.organizationId, event_number: number, reported_by: who.userId, updated_by: who.userId })
    .select('id')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, 'env_event.reported', 'env_event', data.id, { ...row, event_number: number })
  refresh()

  return {
    id: data.id,
    message: clean.reportable && !clean.agencyNotifiedAt ? `${number} recorded. It is reportable: record the agency notice as soon as it is made.` : `${number} recorded.`
  }
}

export const updateEvent = async (id: string, input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadEvent({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (found.event.status === 'closed') return { error: "A closed event can't be edited. Reopen it first." }

  const clean = cleanEventInput(input, nowIso())

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only move events to your own locations.' }
  if (!(await locationExists(who.organizationId, clean.locationId))) return { error: 'Pick a valid location.' }
  if (!(await permitUsable(who, clean.permitId, clean.locationId))) return { error: 'Pick a permit at the same location.' }

  const row = { ...eventRow(clean), updated_by: who.userId, updated_at: nowIso() }
  const { error } = await db().from('forge_env_events').update(row).eq('id', found.event.id).eq('status', 'open')

  if (error) return { error: friendly(error.message) }

  await audit(who, 'env_event.updated', 'env_event', found.event.id, row, found.event)
  refresh()

  return { id: found.event.id, message: 'Saved.' }
}

export const closeEvent = async (id: string, notesRaw: string): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadEvent({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (found.event.status === 'closed') return { error: 'It is already closed.' }
  if (found.blockers.length) return { error: 'Not ready to close: ' + found.blockers.join('; ') }

  const notes = String(notesRaw || '').trim().slice(0, 2000) || null

  const { data, error } = await db()
    .from('forge_env_events')
    .update({ status: 'closed', closed_at: nowIso(), closed_by: who.userId, closure_notes: notes, updated_by: who.userId, updated_at: nowIso() })
    .eq('id', found.event.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle()

  if (error || !data) return { error: friendly(error?.message || 'it changed; reload and try again') }

  await audit(who, 'env_event.closed', 'env_event', found.event.id, { notes })
  refresh()

  return { message: 'Closed.' }
}

export const reopenEvent = async (id: string, reasonRaw: string): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadEvent({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (found.event.status !== 'closed') return { error: 'It is not closed.' }

  const reason = String(reasonRaw || '').trim().slice(0, 500)

  if (!reason) return { error: 'Say why it is being reopened.' }

  const { error } = await db()
    .from('forge_env_events')
    .update({ status: 'open', closed_at: null, closed_by: null, closure_notes: null, updated_by: who.userId, updated_at: nowIso() })
    .eq('id', found.event.id)
    .eq('status', 'closed')

  if (error) return { error: friendly(error.message) }

  await audit(who, 'env_event.reopened', 'env_event', found.event.id, { reason }, { closed_at: found.event.closed_at, closure_notes: found.event.closure_notes })
  refresh()

  return { message: 'Reopened.' }
}

/** Add a corrective action to an event; it opens a Corrective Action with the owner and due date. */
export const addEventAction = async (eventId: string, raw: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadEvent({ organizationId: who.organizationId, rights: who.rights, id: eventId })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (found.event.status === 'closed') return { error: 'Reopen the event to add actions.' }

  const title = String(raw.title || '').replace(/\s+/g, ' ').trim()
  const description = String(raw.description || '').trim()

  if (!title || title.length > 200) return { error: 'Say what needs to be done (up to 200 characters).' }
  if (description.length > 5000) return { error: 'Keep the details to 5,000 characters.' }
  if (!isUuid(raw.ownerPersonnelId)) return { error: 'Pick who owns it.' }
  if (!isDate(raw.dueOn)) return { error: 'Enter a due date.' }

  const supabase = db()
  const { data: person } = await supabase.from('forge_personnel').select('id').eq('organization_id', who.organizationId).eq('id', raw.ownerPersonnelId).is('archived_at', null).maybeSingle()

  if (!person) return { error: 'Pick who owns it from the personnel list.' }

  const { data: action, error } = await supabase.from('forge_env_event_actions').insert({ organization_id: who.organizationId, event_id: found.event.id, title, created_by: who.userId }).select('id').single()

  if (error || !action) return { error: friendly(error?.message || 'no record') }

  const created = await createCapaForSource({
    organizationId: who.organizationId,
    actorUserId: who.userId,
    source: { type: 'env_event_action', id: action.id, reference: found.event.event_number, linkResourceType: 'env_event', linkResourceId: found.event.id },
    values: {
      title,
      description: (description ? description + '\n\n' : '') + `From environmental event ${found.event.event_number}: ${found.event.description.slice(0, 500)}`,
      action_type: 'corrective',
      severity: capaSeverityForEvent(found.event),
      location_id: found.event.location_id,
      division_id: null,
      due_at: new Date(raw.dueOn + 'T12:00:00Z').toISOString(),
      assigned_personnel_id: raw.ownerPersonnelId
    },
    createdMessage: `Corrective Action created from environmental event ${found.event.event_number}`
  })

  if ('error' in created) {
    await supabase.from('forge_env_event_actions').delete().eq('id', action.id)

    return { error: 'Unable to open the Corrective Action: ' + created.error }
  }

  await supabase.from('forge_env_event_actions').update({ capa_id: created.id }).eq('id', action.id)
  await audit(who, 'env_event.action_added', 'env_event', found.event.id, { action_id: action.id, capa_id: created.id })
  refresh()

  return { id: action.id, message: `Added as Corrective Action ${created.actionNumber}.` }
}

export const removeEventAction = async (actionId: string, reasonRaw: string): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who || !isUuid(actionId)) return { error: NO_MANAGE }

  const reason = String(reasonRaw || '').trim().slice(0, 500)

  if (!reason) return { error: 'Say why it is being removed.' }

  const supabase = db()
  const { data: action } = await supabase.from('forge_env_event_actions').select('id, event_id, title, removed_at').eq('organization_id', who.organizationId).eq('id', actionId).maybeSingle()

  if (!action || action.removed_at) return { error: NOT_FOUND }

  const found = await loadEvent({ organizationId: who.organizationId, rights: who.rights, id: action.event_id })

  if (!found || !found.canManage) return { error: NOT_FOUND }
  if (found.event.status === 'closed') return { error: 'Reopen the event to change its actions.' }

  const { error } = await supabase.from('forge_env_event_actions').update({ removed_at: nowIso(), removed_by: who.userId, removed_reason: reason }).eq('id', action.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, 'env_event.action_removed', 'env_event', action.event_id, { action_id: action.id, reason })
  refresh()

  return { message: 'Removed. Its Corrective Action is unchanged.' }
}

// ---------------------------------------------------------------------------
// Waste shipments
// ---------------------------------------------------------------------------

export const saveShipment = async (id: string | null, input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const clean = cleanShipmentInput(input, todayIso())

  if ('error' in clean) return { error: clean.error }
  if (!covers(who.rights.manage, clean.locationId)) return { error: 'You can only record shipments from your own locations.' }
  if (!(await locationExists(who.organizationId, clean.locationId))) return { error: 'Pick a valid location.' }

  const existing = id ? await loadShipment({ organizationId: who.organizationId, rights: who.rights, id }) : null

  if (id && (!existing || !existing.canManage)) return { error: NOT_FOUND }
  if (existing?.shipment.archived_at) return { error: 'Restore it before changing it.' }

  const row = {
    manifest_number: clean.manifestNumber,
    location_id: clean.locationId,
    shipped_on: clean.shippedOn,
    generator_status: clean.generatorStatus,
    waste_description: clean.wasteDescription,
    waste_codes: clean.wasteCodes,
    quantity: clean.quantity,
    unit: clean.unit,
    transporter: clean.transporter,
    facility: clean.facility,
    return_received_on: clean.returnReceivedOn,
    exception_filed_on: clean.exceptionFiledOn,
    notes: clean.notes,
    updated_by: who.userId,
    updated_at: nowIso()
  }

  const supabase = db()

  const { data, error } = existing
    ? await supabase.from('forge_env_waste_shipments').update(row).eq('id', existing.shipment.id).select('id').single()
    : await supabase.from('forge_env_waste_shipments').insert({ ...row, organization_id: who.organizationId, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, existing ? 'env_waste.updated' : 'env_waste.recorded', 'env_waste_shipment', data.id, row, existing?.shipment || null)
  refresh()

  return { id: data.id, message: 'Saved.' }
}

export const archiveShipment = async (id: string, archive: boolean): Promise<Result> => {
  const who = await withPermission('environmental.manage')

  if (!who) return { error: NO_MANAGE }

  const found = await loadShipment({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage) return { error: NOT_FOUND }

  const { error } = await db().from('forge_env_waste_shipments').update({ archived_at: archive ? nowIso() : null, updated_by: who.userId, updated_at: nowIso() }).eq('id', found.shipment.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, archive ? 'env_waste.archived' : 'env_waste.restored', 'env_waste_shipment', found.shipment.id, null)
  refresh()

  return { message: archive ? 'Archived.' : 'Restored.' }
}
