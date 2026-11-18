import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { fleetActivity, scopedVehicleIds } from '@/lib/forgeFleetAccess'
import { completionWritesReading, sortMaintenance } from '@/lib/forgeFleetMaintenanceRules'
import type { CompletionValues, MaintenanceValues } from '@/lib/forgeFleetMaintenanceRules'
import { maintenanceDueState, nextRepeat, todayIso } from '@/lib/forgeFleetRules'
import type { MaintenanceDueState } from '@/lib/forgeFleetRules'

/**
 * Port slice 11: fleet maintenance on the server (loaders and the create / complete steps). The caller checks
 * fleet.maintenance and the vehicle's scope. 1.0 kept only a title, type, due date and cost, and "complete"
 * just stamped a time; 2.0 adds due mileage, vendor, repeat intervals (the next item opens on completion),
 * the completion odometer as a meter reading, and activity / audit rows.
 */

const db = () => createServiceRoleClient() as any

const VEHICLE_FIELDS = 'id, vehicle_number, unit_number, year, make, model, status, mileage, location_id, division_id, assigned_driver_personnel_id, organization_id'

export type MaintenanceRow = {
  id: string
  maintenance_number: string
  vehicle_id: string
  title: string
  maintenance_type: string
  status: string
  due_on: string | null
  due_mileage: number | null
  completed_on: string | null
  completed_mileage: number | null
  vendor: string | null
  cost_cents: number | null
  notes: string | null
  dvir_id: string | null
  repeat_days: number | null
  repeat_miles: number | null
  repeated_from_id: string | null
  created_at: string
  updated_at: string
  vehicle: any
  dvir?: { id: string; dvir_number: string } | null
}

export const listMaintenance = async ({
  organizationId,
  userId,
  scope,
  vehicleId = null,
  status = 'open',
  type = null,
  due = null,
  warningDays = 30,
  now = new Date()
}: {
  organizationId: string
  userId: string
  scope: string | null
  vehicleId?: string | null
  status?: string | null
  type?: string | null
  due?: MaintenanceDueState | null
  warningDays?: number
  now?: Date
}) => {
  const ids = await scopedVehicleIds({ organizationId, userId, scope })

  if (ids && !ids.length) return []
  if (ids && vehicleId && !ids.includes(vehicleId)) return []

  let query = db()
    .from('forge_fleet_maintenance')
    .select(`*, vehicle:forge_fleet_vehicles!forge_fleet_maintenance_vehicle_id_fkey(${VEHICLE_FIELDS}), dvir:forge_fleet_dvirs!forge_fleet_maintenance_dvir_id_fkey(id, dvir_number)`)
    .eq('organization_id', organizationId)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(1000)

  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  else if (ids) query = query.in('vehicle_id', ids)
  if (status && status !== 'all') query = query.eq('status', status)
  if (type) query = query.eq('maintenance_type', type)

  const { data, error } = await query

  if (error) throw new Error('Unable to load maintenance: ' + error.message)

  const rows = ((data || []) as MaintenanceRow[]).map(row => ({ ...row, vehicle_mileage: row.vehicle?.mileage ?? null }))

  return sortMaintenance(rows, warningDays, now)
    .filter(item => !due || item.state === due)
    .map(item => ({ ...item.row, dueState: item.state }))
}

export const loadMaintenanceRecord = async ({ organizationId, id }: { organizationId: string; id: string }): Promise<MaintenanceRow | null> => {
  const { data } = await db()
    .from('forge_fleet_maintenance')
    .select(`*, vehicle:forge_fleet_vehicles!forge_fleet_maintenance_vehicle_id_fkey(${VEHICLE_FIELDS}), dvir:forge_fleet_dvirs!forge_fleet_maintenance_dvir_id_fkey(id, dvir_number)`)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  return data || null
}

export const dueStateOf = (record: MaintenanceRow, warningDays: number, now = new Date()) => maintenanceDueState(record, record.vehicle?.mileage ?? null, warningDays, now)

/** Inserts a maintenance item with the next FM- number, plus an activity row and an audit row. */
export const createMaintenanceRecord = async ({
  organizationId,
  vehicleId,
  values,
  actorUserId,
  dvirId = null,
  repeatedFromId = null,
  message
}: {
  organizationId: string
  vehicleId: string
  values: MaintenanceValues
  actorUserId: string | null
  dvirId?: string | null
  repeatedFromId?: string | null
  message?: string
}): Promise<{ error: string } | { id: string; number: string }> => {
  const supabase = db()
  const { data: number, error: numberError } = await supabase.rpc('next_forge_fleet_number', { p_organization_id: organizationId, p_kind: 'maintenance' })

  if (numberError || !number) return { error: 'Unable to number the maintenance item.' }

  const { data, error } = await supabase
    .from('forge_fleet_maintenance')
    .insert({
      organization_id: organizationId,
      maintenance_number: number,
      vehicle_id: vehicleId,
      ...values,
      status: 'open',
      dvir_id: dvirId,
      repeated_from_id: repeatedFromId,
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message?.includes('check') ? 'Some values are out of range.' : 'Unable to save the maintenance item.' }

  await fleetActivity({
    organizationId,
    vehicleId,
    actorUserId,
    type: 'maintenance_scheduled',
    message: message || `Maintenance ${number} scheduled: ${values.title}.`,
    metadata: { maintenance_id: data.id, maintenance_number: number }
  })
  await writeForgeAudit({ actorUserId, organizationId, action: 'fleet.maintenance_created', entityType: 'fleet_maintenance', entityId: data.id, afterValue: { maintenance_number: number, vehicle_id: vehicleId, ...values, dvir_id: dvirId } })

  return { id: data.id, number }
}

/**
 * Completes an open item: stamps the completion, writes the odometer as a meter reading when it is at or
 * above the vehicle's mileage, and opens the next item when the job repeats.
 */
export const completeMaintenanceRecord = async ({
  organizationId,
  record,
  values,
  actorUserId,
  now = new Date()
}: {
  organizationId: string
  record: MaintenanceRow
  values: CompletionValues
  actorUserId: string | null
  now?: Date
}): Promise<{ error: string } | { readingWritten: boolean; readingError: string | null; next: { id: string; number: string } | null }> => {
  const supabase = db()
  const notes = values.notes ? (record.notes ? `${record.notes}\n\n${values.notes}` : values.notes) : record.notes

  const { data: updated, error } = await supabase
    .from('forge_fleet_maintenance')
    .update({
      status: 'completed',
      completed_on: values.completed_on,
      completed_mileage: values.completed_mileage,
      cost_cents: values.cost_cents ?? record.cost_cents,
      notes,
      completed_by: actorUserId,
      updated_by: actorUserId
    })
    .eq('organization_id', organizationId)
    .eq('id', record.id)
    .eq('status', 'open')
    .select('id')

  if (error) return { error: 'Unable to complete the maintenance item.' }
  if (!updated?.length) return { error: 'This item is already completed or canceled.' }

  const currentMileage = record.vehicle?.mileage ?? null
  let readingWritten = false
  let readingError: string | null = null

  if (completionWritesReading(values.completed_mileage, currentMileage)) {
    const recordedAt = values.completed_on < todayIso(now) ? `${values.completed_on}T12:00:00Z` : now.toISOString()

    const { error: readingFailure } = await supabase.from('forge_fleet_meter_readings').insert({
      organization_id: organizationId,
      vehicle_id: record.vehicle_id,
      meter: 'mileage',
      value: values.completed_mileage,
      is_correction: false,
      source: 'maintenance',
      source_record_id: record.id,
      notes: `Maintenance ${record.maintenance_number} completed.`,
      recorded_at: recordedAt,
      recorded_by: actorUserId
    })

    if (readingFailure) readingError = readingFailure.message || 'The odometer reading was not saved.'
    else readingWritten = true
  }

  await fleetActivity({
    organizationId,
    vehicleId: record.vehicle_id,
    actorUserId,
    type: 'maintenance_completed',
    message: `Maintenance ${record.maintenance_number} completed: ${record.title}.`,
    metadata: { maintenance_id: record.id, completed_on: values.completed_on, completed_mileage: values.completed_mileage, reading_written: readingWritten }
  })
  await writeForgeAudit({
    actorUserId,
    organizationId,
    action: 'fleet.maintenance_completed',
    entityType: 'fleet_maintenance',
    entityId: record.id,
    beforeValue: { status: record.status },
    afterValue: { status: 'completed', ...values }
  })

  let next: { id: string; number: string } | null = null
  const repeat = nextRepeat(record, values.completed_on, values.completed_mileage ?? currentMileage)

  if (repeat) {
    const created = await createMaintenanceRecord({
      organizationId,
      vehicleId: record.vehicle_id,
      actorUserId,
      values: {
        title: record.title,
        maintenance_type: record.maintenance_type as MaintenanceValues['maintenance_type'],
        due_on: repeat.due_on,
        due_mileage: repeat.due_mileage,
        vendor: record.vendor,
        cost_cents: null,
        repeat_days: record.repeat_days,
        repeat_miles: record.repeat_miles,
        notes: null
      },
      repeatedFromId: record.id,
      message: `Next ${record.title} scheduled after ${record.maintenance_number}.`
    })

    if ('id' in created) next = created
  }

  return { readingWritten, readingError, next }
}
