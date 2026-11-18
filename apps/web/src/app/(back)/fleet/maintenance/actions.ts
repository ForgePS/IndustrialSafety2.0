'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { fleetActivity, loadVehicle, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { completeMaintenanceRecord, createMaintenanceRecord, loadMaintenanceRecord } from '@/lib/forgeFleetMaintenance'
import { parseCompletionInput, parseMaintenanceInput } from '@/lib/forgeFleetMaintenanceRules'
import type { CompletionInput, MaintenanceInput } from '@/lib/forgeFleetMaintenanceRules'
import { isRemovedStatus } from '@/lib/forgeFleetRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; errors?: Record<string, string>; message?: string; id?: string; nextId?: string | null }

const UUID = /^[0-9a-f-]{36}$/i

const context = async () => {
  const ctx = await requireTenantPermission('fleet.maintenance')

  return { ctx, organizationId: ctx.activeOrganization.id as string, userId: ctx.user.id as string, scope: ctx.permission.scope }
}

/** The item, when it exists in this company and its vehicle is in the user's scope. */
const scopedRecord = async (id: string) => {
  const { organizationId, userId, scope } = await context()

  if (!UUID.test(id)) return { organizationId, userId, record: null }

  const record = await loadMaintenanceRecord({ organizationId, id })

  if (!record?.vehicle || !(await vehicleWithinScope({ organizationId, userId, scope, vehicle: record.vehicle }))) return { organizationId, userId, record: null }

  return { organizationId, userId, record }
}

const refresh = (vehicleId: string, id?: string) => {
  revalidatePath('/fleet/maintenance')
  if (id) revalidatePath(`/fleet/maintenance/${id}`)
  revalidatePath(`/fleet/vehicles/${vehicleId}`)
  revalidatePath('/fleet')
}

export const createMaintenance = async (input: MaintenanceInput & { vehicleId: string }): Promise<Result> => {
  const { organizationId, userId, scope } = await context()

  if (!UUID.test(input.vehicleId || '')) return { errors: { vehicleId: 'Choose a vehicle.' } }

  const vehicle = await loadVehicle({ organizationId, vehicleId: input.vehicleId })

  if (!vehicle || vehicle.archived_at || !(await vehicleWithinScope({ organizationId, userId, scope, vehicle }))) return { errors: { vehicleId: 'Choose a vehicle.' } }
  if (isRemovedStatus(vehicle.status)) return { errors: { vehicleId: 'This vehicle was removed from the fleet.' } }

  const parsed = parseMaintenanceInput(input)

  if (!parsed.ok) return { errors: parsed.errors }

  const created = await createMaintenanceRecord({ organizationId, vehicleId: vehicle.id, values: parsed.values, actorUserId: userId })

  if ('error' in created) return { error: created.error }

  refresh(vehicle.id)

  return { id: created.id, message: `Maintenance ${created.number} scheduled.` }
}

export const updateMaintenance = async (id: string, input: MaintenanceInput): Promise<Result> => {
  const { organizationId, userId, record } = await scopedRecord(id)

  if (!record) return { error: 'Maintenance item not found.' }
  if (record.status !== 'open') return { error: 'Only open items can be edited.' }

  const parsed = parseMaintenanceInput(input)

  if (!parsed.ok) return { errors: parsed.errors }

  const { error } = await (createServiceRoleClient() as any)
    .from('forge_fleet_maintenance')
    .update({ ...parsed.values, updated_by: userId })
    .eq('organization_id', organizationId)
    .eq('id', record.id)
    .eq('status', 'open')

  if (error) return { error: 'Unable to save the maintenance item.' }

  const before = Object.fromEntries(Object.keys(parsed.values).map(key => [key, (record as any)[key]]))

  await fleetActivity({ organizationId, vehicleId: record.vehicle_id, actorUserId: userId, type: 'maintenance_updated', message: `Maintenance ${record.maintenance_number} updated.`, metadata: { maintenance_id: record.id } })
  await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.maintenance_updated', entityType: 'fleet_maintenance', entityId: record.id, beforeValue: before, afterValue: parsed.values })
  refresh(record.vehicle_id, record.id)

  return { id: record.id, message: 'Saved.' }
}

export const completeMaintenance = async (id: string, input: CompletionInput): Promise<Result> => {
  const { organizationId, userId, record } = await scopedRecord(id)

  if (!record) return { error: 'Maintenance item not found.' }
  if (record.status !== 'open') return { error: 'This item is already completed or canceled.' }

  const parsed = parseCompletionInput(input)

  if (!parsed.ok) return { errors: parsed.errors }

  const result = await completeMaintenanceRecord({ organizationId, record, values: parsed.values, actorUserId: userId })

  if ('error' in result) return { error: result.error }

  refresh(record.vehicle_id, record.id)

  const parts = ['Marked complete.']

  if (result.readingWritten) parts.push('Odometer updated.')
  if (result.readingError) parts.push('The odometer reading was not saved: ' + result.readingError)
  if (result.next) parts.push(`Next item ${result.next.number} scheduled.`)

  return { id: record.id, nextId: result.next?.id || null, message: parts.join(' ') }
}

export const cancelMaintenance = async (id: string, reason: string): Promise<Result> => {
  const { organizationId, userId, record } = await scopedRecord(id)

  if (!record) return { error: 'Maintenance item not found.' }
  if (record.status !== 'open') return { error: 'Only open items can be canceled.' }

  const why = (reason || '').trim().slice(0, 1000)

  if (!why) return { errors: { reason: 'Say why it is canceled.' } }

  const notes = record.notes ? `${record.notes}\n\nCanceled: ${why}` : `Canceled: ${why}`

  const { data, error } = await (createServiceRoleClient() as any)
    .from('forge_fleet_maintenance')
    .update({ status: 'canceled', notes, updated_by: userId })
    .eq('organization_id', organizationId)
    .eq('id', record.id)
    .eq('status', 'open')
    .select('id')

  if (error) return { error: 'Unable to cancel the maintenance item.' }
  if (!data?.length) return { error: 'This item is already completed or canceled.' }

  await fleetActivity({ organizationId, vehicleId: record.vehicle_id, actorUserId: userId, type: 'maintenance_canceled', message: `Maintenance ${record.maintenance_number} canceled: ${why}`, metadata: { maintenance_id: record.id } })
  await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.maintenance_canceled', entityType: 'fleet_maintenance', entityId: record.id, beforeValue: { status: 'open' }, afterValue: { status: 'canceled' }, reason: why })
  refresh(record.vehicle_id, record.id)

  return { id: record.id, message: 'Canceled.' }
}
