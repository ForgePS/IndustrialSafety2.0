'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import {
  loadArea,
  loadAreaLookups,
  locationInList,
  waypointLocationIds,
  writeAreaActivity,
  type Area,
  type WaypointContext
} from '@/lib/forgeWaypoint'
import { areaInputToRow, changedAreaFields, describeAreaChanges, parseAreaInput } from '@/lib/forgeWaypointRules'

/**
 * Forge Waypoint, phase 0: area actions. Every action re-checks waypoint.manage and its location scope on the
 * server, loads the area from the active company, validates, writes, and records activity + audit.
 */

type Result = { ok: true; id?: string; message: string } | { ok: false; error: string; errors?: Record<string, string> }

const db = () => createServiceRoleClient() as any

const manageContext = async () => (await tenantPermissionOrNull('waypoint.manage')) as unknown as WaypointContext | null

const refresh = (areaId?: string) => {
  revalidatePath('/waypoint', 'layout')
  if (areaId) revalidatePath('/waypoint/' + areaId)
}

const NOT_ALLOWED: Result = { ok: false, error: 'You do not have permission to manage areas.' }
const NOT_FOUND: Result = { ok: false, error: 'Area not found.' }

const duplicateMessage = (error: { code?: string; message?: string } | null): Record<string, string> | null => {
  if (error?.code !== '23505') return null

  return /code/i.test(error.message || '')
    ? { code: 'Another area already uses this code.' }
    : { name: 'This location already has an area with this name.' }
}

/** The managed area, when the user's waypoint.manage scope covers its location. */
const managedArea = async (context: WaypointContext, areaId: string): Promise<Area | null> => {
  const area = await loadArea(context.activeOrganization.id, String(areaId || ''))

  if (!area) return null

  return locationInList(await waypointLocationIds(context, 'waypoint.manage'), area.location_id) ? area : null
}

const validate = async (context: WaypointContext, input: Record<string, unknown>) => {
  const organizationId = context.activeOrganization.id
  const lookups = await loadAreaLookups(organizationId)

  const parsed = parseAreaInput(input || {}, {
    hazardKeys: lookups.hazards.map(item => item.key),
    ppeKeys: lookups.ppe.map(item => item.key)
  })

  if (!parsed.ok)
    return { error: { ok: false, error: 'Check the highlighted fields.', errors: parsed.errors } as Result }

  const { data: location } = await db()
    .from('locations')
    .select('id, is_active')
    .eq('organization_id', organizationId)
    .eq('id', parsed.value.locationId)
    .maybeSingle()

  if (!location || !location.is_active) {
    return {
      error: {
        ok: false,
        error: 'Check the highlighted fields.',
        errors: { locationId: 'Choose an active location.' }
      } as Result
    }
  }

  if (!locationInList(await waypointLocationIds(context, 'waypoint.manage'), location.id)) {
    return {
      error: {
        ok: false,
        error: 'Check the highlighted fields.',
        errors: { locationId: 'This location is outside your Waypoint scope.' }
      } as Result
    }
  }

  return { value: parsed.value }
}

export const createArea = async (input: Record<string, unknown>): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const checked = await validate(context, input)

  if ('error' in checked) return checked.error as Result

  const organizationId = context.activeOrganization.id
  const row = areaInputToRow(checked.value)

  const { data, error } = await db()
    .from('forge_areas')
    .insert({ ...row, organization_id: organizationId, created_by: context.user.id, updated_by: context.user.id })
    .select('id')
    .single()

  if (error || !data) {
    const errors = duplicateMessage(error)

    return errors
      ? { ok: false, error: 'Check the highlighted fields.', errors }
      : { ok: false, error: 'Unable to save the area.' }
  }

  await writeAreaActivity({
    organizationId,
    areaId: data.id,
    actorUserId: context.user.id,
    type: 'created',
    message: `Area ${row.name} created.`
  })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.create',
    entityType: 'waypoint_area',
    entityId: data.id,
    afterValue: row
  })

  refresh(data.id)

  return { ok: true, id: data.id, message: 'Area created.' }
}

export const updateArea = async (areaId: string, input: Record<string, unknown>): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const before = await managedArea(context, areaId)

  if (!before) return NOT_FOUND
  if (before.archived_at) return { ok: false, error: 'Restore this area before editing it.' }

  const checked = await validate(context, input)

  if ('error' in checked) return checked.error as Result

  const organizationId = context.activeOrganization.id
  const row = areaInputToRow(checked.value)
  const changed = changedAreaFields(before, row)

  if (!changed.length) return { ok: true, id: before.id, message: 'No changes to save.' }

  if (changed.includes('location_id')) {
    const { count } = await db()
      .from('forge_assets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('area_id', before.id)

    if ((count || 0) > 0) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        errors: { locationId: 'Remove the equipment from this area before moving it to another location.' }
      }
    }
  }

  const { error } = await db()
    .from('forge_areas')
    .update({ ...row, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('id', before.id)

  if (error) {
    const errors = duplicateMessage(error)

    return errors
      ? { ok: false, error: 'Check the highlighted fields.', errors }
      : { ok: false, error: 'Unable to save the area.' }
  }

  await writeAreaActivity({
    organizationId,
    areaId: before.id,
    actorUserId: context.user.id,
    type: 'updated',
    message: describeAreaChanges(changed),
    metadata: { fields: changed }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.update',
    entityType: 'waypoint_area',
    entityId: before.id,
    beforeValue: Object.fromEntries(changed.map(key => [key, before[key]])),
    afterValue: Object.fromEntries(changed.map(key => [key, row[key]]))
  })

  refresh(before.id)

  return { ok: true, id: before.id, message: 'Area saved.' }
}

/**
 * Archive: the area leaves lists, its equipment is released and its Area Card QRs stop resolving (they are
 * archived too). Nothing is deleted; restoring brings the area back, but not its old equipment or QRs.
 */
export const archiveArea = async (areaId: string, reason: string): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const area = await managedArea(context, areaId)

  if (!area) return NOT_FOUND
  if (area.archived_at) return { ok: true, id: area.id, message: 'Area is already archived.' }

  const organizationId = context.activeOrganization.id
  const note =
    String(reason || '')
      .trim()
      .slice(0, 500) || null
  const now = new Date().toISOString()
  const supabase = db()

  const { data: released, error: releaseError } = await supabase
    .from('forge_assets')
    .update({ area_id: null })
    .eq('organization_id', organizationId)
    .eq('area_id', area.id)
    .select('id')

  if (releaseError) return { ok: false, error: 'Unable to release the equipment in this area.' }

  const { data: qrs, error: qrError } = await supabase
    .from('forge_qr_codes')
    .update({ status: 'archived', archived_at: now, archived_by: context.user.id, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('target_type', 'area')
    .eq('target_id', area.id)
    .is('archived_at', null)
    .select('id')

  if (qrError) return { ok: false, error: 'Unable to archive the Area Card QR codes.' }

  const { error } = await supabase
    .from('forge_areas')
    .update({ archived_at: now, archived_by: context.user.id, archive_reason: note, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('id', area.id)

  if (error) return { ok: false, error: 'Unable to archive the area.' }

  const releasedCount = (released || []).length
  const qrCount = (qrs || []).length

  await writeAreaActivity({
    organizationId,
    areaId: area.id,
    actorUserId: context.user.id,
    type: 'archived',
    message: `Area archived${note ? `: ${note}` : '.'}${releasedCount ? ` ${releasedCount} equipment released.` : ''}${qrCount ? ` ${qrCount} Area Card QR archived.` : ''}`,
    metadata: {
      reason: note,
      released_asset_ids: (released || []).map((row: any) => row.id),
      archived_qr_ids: (qrs || []).map((row: any) => row.id)
    }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.archive',
    entityType: 'waypoint_area',
    entityId: area.id,
    reason: note
  })

  refresh(area.id)
  revalidatePath('/qr')

  return { ok: true, id: area.id, message: 'Area archived.' }
}

export const restoreArea = async (areaId: string): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const area = await managedArea(context, areaId)

  if (!area) return NOT_FOUND
  if (!area.archived_at) return { ok: true, id: area.id, message: 'Area is not archived.' }

  const organizationId = context.activeOrganization.id

  const { error } = await db()
    .from('forge_areas')
    .update({ archived_at: null, archived_by: null, archive_reason: null, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('id', area.id)

  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'An active area at this location already uses this name or code. Rename that one first.' }
      : { ok: false, error: 'Unable to restore the area.' }
  }

  await writeAreaActivity({
    organizationId,
    areaId: area.id,
    actorUserId: context.user.id,
    type: 'restored',
    message: 'Area restored.'
  })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.restore',
    entityType: 'waypoint_area',
    entityId: area.id
  })

  refresh(area.id)

  return { ok: true, id: area.id, message: 'Area restored.' }
}

/** Places equipment in the area. It must be at the area's location and not already in another area. */
export const addAreaEquipment = async (areaId: string, assetIds: string[]): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const area = await managedArea(context, areaId)

  if (!area) return NOT_FOUND
  if (area.archived_at) return { ok: false, error: 'This area is archived.' }

  const ids = [
    ...new Set(
      (Array.isArray(assetIds) ? assetIds : []).filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    )
  ].slice(0, 100)

  if (!ids.length) return { ok: false, error: 'Choose equipment to add.' }

  const organizationId = context.activeOrganization.id
  const supabase = db()

  const { data: assets } = await supabase
    .from('forge_assets')
    .select('id, name, location_id, area_id, status')
    .eq('organization_id', organizationId)
    .in('id', ids)

  const rows = (assets || []) as any[]

  if (rows.length !== ids.length) return { ok: false, error: 'Some of that equipment was not found.' }
  if (rows.some(row => row.location_id !== area.location_id))
    return { ok: false, error: 'Equipment can only be placed in an area at its own location.' }
  if (rows.some(row => row.area_id && row.area_id !== area.id))
    return { ok: false, error: 'Some of that equipment is already in another area. Remove it there first.' }
  if (rows.some(row => row.status === 'retired'))
    return { ok: false, error: 'Retired equipment cannot be placed in an area.' }

  const added = rows.filter(row => row.area_id !== area.id)

  if (!added.length) return { ok: true, id: area.id, message: 'That equipment is already in this area.' }

  const { error } = await supabase
    .from('forge_assets')
    .update({ area_id: area.id })
    .eq('organization_id', organizationId)
    .in(
      'id',
      added.map(row => row.id)
    )
    .is('area_id', null)

  if (error)
    return {
      ok: false,
      error:
        error.message && !/violates|column|relation/i.test(error.message)
          ? error.message
          : 'Unable to add the equipment.'
    }

  await supabase.from('forge_asset_activity').insert(
    added.map(row => ({
      organization_id: organizationId,
      asset_id: row.id,
      activity_type: 'area_assigned',
      message: `Placed in area ${area.name}.`,
      actor_user_id: context.user.id,
      metadata: { area_id: area.id }
    }))
  )

  await writeAreaActivity({
    organizationId,
    areaId: area.id,
    actorUserId: context.user.id,
    type: 'equipment_added',
    message: `Added ${added.map(row => row.name).join(', ')}.`,
    metadata: { asset_ids: added.map(row => row.id) }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.equipment_add',
    entityType: 'waypoint_area',
    entityId: area.id,
    afterValue: { asset_ids: added.map(row => row.id) }
  })

  refresh(area.id)

  return {
    ok: true,
    id: area.id,
    message: added.length === 1 ? 'Equipment added.' : `${added.length} equipment added.`
  }
}

export const removeAreaEquipment = async (areaId: string, assetId: string): Promise<Result> => {
  const context = await manageContext()

  if (!context) return NOT_ALLOWED

  const area = await managedArea(context, areaId)

  if (!area) return NOT_FOUND

  const organizationId = context.activeOrganization.id
  const supabase = db()

  const { data: asset } = await supabase
    .from('forge_assets')
    .select('id, name, area_id')
    .eq('organization_id', organizationId)
    .eq('id', String(assetId || ''))
    .eq('area_id', area.id)
    .maybeSingle()

  if (!asset) return { ok: false, error: 'That equipment is not in this area.' }

  const { error } = await supabase
    .from('forge_assets')
    .update({ area_id: null })
    .eq('organization_id', organizationId)
    .eq('id', asset.id)
    .eq('area_id', area.id)

  if (error) return { ok: false, error: 'Unable to remove the equipment.' }

  await supabase.from('forge_asset_activity').insert({
    organization_id: organizationId,
    asset_id: asset.id,
    activity_type: 'area_removed',
    message: `Removed from area ${area.name}.`,
    actor_user_id: context.user.id,
    metadata: { area_id: area.id }
  })

  await writeAreaActivity({
    organizationId,
    areaId: area.id,
    actorUserId: context.user.id,
    type: 'equipment_removed',
    message: `Removed ${asset.name}.`,
    metadata: { asset_id: asset.id }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'waypoint.area.equipment_remove',
    entityType: 'waypoint_area',
    entityId: area.id,
    beforeValue: { asset_id: asset.id }
  })

  refresh(area.id)

  return { ok: true, id: area.id, message: 'Equipment removed.' }
}
