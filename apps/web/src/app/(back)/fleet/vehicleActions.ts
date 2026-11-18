'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { fleetActivity, setVehicleServiceStatus, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { cleanVehicleInput } from '@/lib/forgeFleetImportRules'
import { isRemovedStatus, normalizeVin, vinWarning } from '@/lib/forgeFleetRules'
import {
  ensureCompanyDriver,
  loadVehicleInScope,
  personName,
  validDriver,
  validPlace,
  vehicleDbMessage,
  type FleetContext
} from '@/lib/forgeFleetVehicles'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/** Port slice 11: vehicle registry server actions. Every action checks its permission and the vehicle scope. */

type Result = { error?: string; message?: string; id?: string; warning?: string }

const db = () => createServiceRoleClient() as any

const UUID = /^[0-9a-f-]{36}$/i

const refresh = (vehicleId?: string) => {
  revalidatePath('/fleet')
  revalidatePath('/fleet/vehicles')
  revalidatePath('/fleet/renewals')
  revalidatePath('/fleet/removed')
  if (vehicleId) revalidatePath('/fleet/vehicles/' + vehicleId)
}

const text = (value: unknown, max = 500) => {
  const cleaned = typeof value === 'string' ? value.trim() : ''

  return cleaned ? cleaned.slice(0, max) : null
}

/** The first of `keys` the user holds, with its context; null when none. */
const contextFor = async (...keys: string[]) => {
  for (const key of keys) {
    const context = await tenantPermissionOrNull(key)

    if (context) return context as unknown as FleetContext & { user: { id: string; email?: string | null } }
  }

  return null
}

/** Permission + vehicle scope. With several keys, any one whose scope covers the vehicle is enough. */
const vehicleFor = async (vehicleId: string, ...keys: string[]) => {
  if (!UUID.test(vehicleId || '')) return null

  for (const key of keys) {
    const context = await contextFor(key)

    if (!context) continue

    const vehicle = await loadVehicleInScope({ context, vehicleId })

    if (vehicle) return { context, vehicle, organizationId: context.activeOrganization.id, userId: context.user.id }
  }

  return null
}

const NOT_FOUND: Result = { error: 'Vehicle not found.' }

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export type VehicleFormInput = {
  id?: string | null
  fields: Record<string, string | boolean | null>
  locationId: string | null
  divisionId: string | null
  driverId: string | null
  status: 'active' | 'inactive' | null
  initialMileage?: string | null
  initialEngineHours?: string | null
}

const readMeter = (value: string | null | undefined, label: string) => {
  const cleaned = String(value ?? '').replace(/,/g, '').trim()

  if (!cleaned) return { value: null as number | null }

  const number = Number(cleaned)

  if (!Number.isFinite(number) || number < 0 || number > 10_000_000) return { error: `${label} must be a number of 0 or more.` }

  return { value: number }
}

export const saveVehicle = async (input: VehicleFormInput): Promise<Result> => {
  const editing = Boolean(input.id)
  const loaded = editing ? await vehicleFor(String(input.id), 'fleet.edit') : null

  if (editing && !loaded) return NOT_FOUND

  const context = loaded?.context || (await contextFor('fleet.create'))

  if (!context) return { error: 'You do not have permission to add vehicles.' }

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const { values, errors } = cleanVehicleInput(input.fields || {})

  const locationId = text(input.locationId)
  const divisionId = text(input.divisionId)
  const driverId = text(input.driverId)

  if (!(await validPlace(organizationId, 'locations', locationId))) errors.push('Pick a location from the list.')
  if (!(await validPlace(organizationId, 'divisions', divisionId))) errors.push('Pick a division from the list.')

  const before = loaded?.vehicle

  // A driver who left can stay on an existing record, but new assignments must be active personnel.
  if (driverId && driverId !== before?.assigned_driver_personnel_id && !(await validDriver(organizationId, driverId))) {
    errors.push('Pick an active employee as the driver.')
  }

  const mileage = editing ? { value: null } : readMeter(input.initialMileage, 'Mileage')
  const hours = editing ? { value: null } : readMeter(input.initialEngineHours, 'Engine hours')

  if ('error' in mileage && mileage.error) errors.push(mileage.error)
  if ('error' in hours && hours.error) errors.push(hours.error)
  if (errors.length) return { error: errors.join(' ') }

  if (values.vehicle_type !== 'other') values.custom_type_label = values.custom_type_label ?? null

  const supabase = db()
  const vin = normalizeVin(values.vin as string | null)

  // Friendly duplicate checks before the unique indexes do it.
  if (vin) {
    const { data } = await supabase.from('forge_fleet_vehicles').select('id, vehicle_number').eq('organization_id', organizationId).ilike('vin', vin).is('archived_at', null)
    const other = ((data || []) as any[]).find(row => row.id !== input.id)

    if (other) return { error: `Another vehicle (${other.vehicle_number}) already has this VIN.` }
  }

  if (values.unit_number) {
    const { data } = await supabase
      .from('forge_fleet_vehicles')
      .select('id, vehicle_number')
      .eq('organization_id', organizationId)
      .ilike('unit_number', String(values.unit_number).replace(/[%_\\]/g, '\\$&'))
      .is('archived_at', null)

    const other = ((data || []) as any[]).find(row => row.id !== input.id)

    if (other) return { error: `Another vehicle (${other.vehicle_number}) already has unit number ${values.unit_number}.` }
  }

  const candidate = { organization_id: organizationId, location_id: locationId, division_id: divisionId, assigned_driver_personnel_id: driverId }

  if (!(await vehicleWithinScope({ organizationId, userId, scope: context.permission.scope ?? null, vehicle: candidate }))) {
    return { error: 'Pick a location, division or driver within your access.' }
  }

  const row: Record<string, unknown> = { ...values, vin, location_id: locationId, division_id: divisionId, assigned_driver_personnel_id: driverId, updated_by: userId }
  const status = input.status === 'inactive' || input.status === 'active' ? input.status : null

  let vehicleId: string

  if (editing && before) {
    if (status && (before.status === 'active' || before.status === 'inactive')) row.status = status

    const { error } = await supabase.from('forge_fleet_vehicles').update(row).eq('organization_id', organizationId).eq('id', before.id)

    if (error) return { error: vehicleDbMessage(error, 'Unable to save the vehicle.') }

    vehicleId = before.id

    const changed = Object.keys(row).filter(key => key !== 'updated_by' && String(row[key] ?? '') !== String(before[key] ?? ''))

    if (changed.length) {
      const pick = (source: Record<string, unknown>) => Object.fromEntries(changed.map(key => [key, source[key] ?? null]))

      await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.vehicle_updated', entityType: 'fleet_vehicle', entityId: vehicleId, beforeValue: pick(before), afterValue: pick(row) })
      await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'updated', message: `Details updated (${changed.length} field${changed.length === 1 ? '' : 's'}).`, metadata: { fields: changed } })
    }
  } else {
    const { data: number, error: numberError } = await supabase.rpc('next_forge_fleet_number', { p_organization_id: organizationId, p_kind: 'vehicle' })

    if (numberError || !number) return { error: 'Unable to number the vehicle.' }

    const { data, error } = await supabase
      .from('forge_fleet_vehicles')
      .insert({ ...row, organization_id: organizationId, vehicle_number: number, status: status || 'active', created_by: userId })
      .select('id')
      .single()

    if (error || !data) return { error: vehicleDbMessage(error, 'Unable to add the vehicle.') }

    vehicleId = data.id

    // Starting meters are readings, never a direct column write (the trigger sets the vehicle's value).
    for (const [meter, reading] of [['mileage', mileage.value], ['engine_hours', hours.value]] as const) {
      if (reading == null) continue

      await supabase.from('forge_fleet_meter_readings').insert({
        organization_id: organizationId,
        vehicle_id: vehicleId,
        meter,
        value: reading,
        source: 'manual',
        notes: 'Starting reading',
        recorded_by: userId
      })
    }

    await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.vehicle_created', entityType: 'fleet_vehicle', entityId: vehicleId, afterValue: { vehicle_number: number, vin, unit_number: values.unit_number ?? null } })
    await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'created', message: `Vehicle ${number} added.` })
  }

  if (driverId && driverId !== before?.assigned_driver_personnel_id) await ensureCompanyDriver({ organizationId, personnelId: driverId, actorUserId: userId })

  refresh(vehicleId)

  return { id: vehicleId, message: editing ? 'Vehicle saved.' : 'Vehicle added.', warning: vinWarning(vin) || undefined }
}

// ---------------------------------------------------------------------------
// Driver assignment
// ---------------------------------------------------------------------------

export const assignDriver = async ({ vehicleId, personnelId, note }: { vehicleId: string; personnelId: string | null; note?: string | null }): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.edit')

  if (!loaded) return NOT_FOUND

  const { organizationId, userId, vehicle } = loaded
  const driverId = text(personnelId)

  if (isRemovedStatus(vehicle.status)) return { error: 'Restore the vehicle before assigning a driver.' }
  if (driverId === (vehicle.assigned_driver_personnel_id || null)) return { message: 'No change.' }
  if (driverId && !(await validDriver(organizationId, driverId))) return { error: 'Pick an active employee as the driver.' }

  const startedAt = new Date(Date.now() - 1000).toISOString()
  const supabase = db()

  const { error } = await supabase
    .from('forge_fleet_vehicles')
    .update({ assigned_driver_personnel_id: driverId, updated_by: userId })
    .eq('organization_id', organizationId)
    .eq('id', vehicleId)

  if (error) return { error: vehicleDbMessage(error, 'Unable to change the driver.') }

  const cleanNote = text(note, 1000)

  // The trigger wrote the history rows; attach the note to them.
  if (cleanNote) {
    await supabase
      .from('forge_fleet_assignment_history')
      .update({ notes: cleanNote })
      .eq('organization_id', organizationId)
      .eq('vehicle_id', vehicleId)
      .gte('effective_at', startedAt)
      .is('notes', null)
  }

  let name = ''

  if (driverId) {
    await ensureCompanyDriver({ organizationId, personnelId: driverId, actorUserId: userId })

    const { data: person } = await supabase.from('forge_personnel').select('first_name, last_name, preferred_name').eq('id', driverId).maybeSingle()

    name = personName(person)
  }

  await fleetActivity({
    organizationId,
    vehicleId,
    actorUserId: userId,
    type: driverId ? 'driver_assigned' : 'driver_unassigned',
    message: driverId ? `Assigned to ${name}.` : 'Driver unassigned.',
    metadata: { personnel_id: driverId, previous_personnel_id: vehicle.assigned_driver_personnel_id, note: cleanNote }
  })
  await writeForgeAudit({
    actorUserId: userId,
    organizationId,
    action: driverId ? 'fleet.driver_assigned' : 'fleet.driver_unassigned',
    entityType: 'fleet_vehicle',
    entityId: vehicleId,
    beforeValue: { assigned_driver_personnel_id: vehicle.assigned_driver_personnel_id },
    afterValue: { assigned_driver_personnel_id: driverId },
    reason: cleanNote
  })
  refresh(vehicleId)

  return { message: driverId ? 'Driver assigned.' : 'Driver unassigned.' }
}

// ---------------------------------------------------------------------------
// Mileage / engine hours
// ---------------------------------------------------------------------------

export const recordMeterReading = async ({
  vehicleId,
  meter,
  value,
  isCorrection,
  notes
}: {
  vehicleId: string
  meter: 'mileage' | 'engine_hours'
  value: string
  isCorrection: boolean
  notes?: string | null
}): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.edit', 'fleet.maintenance')

  if (!loaded) return NOT_FOUND
  if (meter !== 'mileage' && meter !== 'engine_hours') return { error: 'Pick mileage or engine hours.' }

  const label = meter === 'mileage' ? 'Mileage' : 'Engine hours'
  const reading = readMeter(value, label)

  if ('error' in reading) return { error: reading.error }
  if (reading.value == null) return { error: `Enter the ${label.toLowerCase()}.` }

  const { organizationId, userId, vehicle } = loaded

  if (isRemovedStatus(vehicle.status)) return { error: 'This vehicle is removed from the fleet.' }

  const value_ = meter === 'mileage' ? Math.round(reading.value) : Math.round(reading.value * 10) / 10
  const current = meter === 'mileage' ? vehicle.mileage : vehicle.engine_hours

  const { error } = await db()
    .from('forge_fleet_meter_readings')
    .insert({
      organization_id: organizationId,
      vehicle_id: vehicleId,
      meter,
      value: value_,
      is_correction: Boolean(isCorrection),
      source: 'manual',
      notes: text(notes, 1000),
      recorded_by: userId
    })

  if (error) {
    if (error.code === '23514' && /lower than the current/.test(error.message || '')) {
      return { error: `${value_.toLocaleString('en-US')} is lower than the current ${label.toLowerCase()} (${Number(current).toLocaleString('en-US')}). Tick "This is a correction" if the meter was replaced or the last reading was wrong.` }
    }

    return { error: vehicleDbMessage(error, 'Unable to record the reading.') }
  }

  await fleetActivity({
    organizationId,
    vehicleId,
    actorUserId: userId,
    type: 'meter_reading',
    message: `${label} recorded: ${value_.toLocaleString('en-US')}${isCorrection ? ' (correction)' : ''}.`,
    metadata: { meter, value: value_, previous: current, is_correction: Boolean(isCorrection) }
  })

  if (isCorrection && current != null && value_ < Number(current)) {
    await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.meter_corrected', entityType: 'fleet_vehicle', entityId: vehicleId, beforeValue: { [meter]: current }, afterValue: { [meter]: value_ }, reason: text(notes, 1000) })
  }

  refresh(vehicleId)

  return { message: `${label} recorded.` }
}

// ---------------------------------------------------------------------------
// Service status
// ---------------------------------------------------------------------------

export const setOutOfService = async ({ vehicleId, outOfService, reason }: { vehicleId: string; outOfService: boolean; reason?: string | null }): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.edit')

  if (!loaded) return NOT_FOUND

  const cleanReason = text(reason, 1000)

  if (outOfService && !cleanReason) return { error: 'Give a reason for taking the vehicle out of service.' }

  const { organizationId, userId, context } = loaded

  const result = await setVehicleServiceStatus({
    organizationId,
    vehicleId,
    status: outOfService ? 'out_of_service' : 'active',
    reason: cleanReason,
    source: 'record_edit',
    actorUserId: userId,
    actorName: (context.user as { email?: string | null }).email || null
  })

  if ('error' in result) return { error: result.error }
  if (!result.changed) return { message: 'No change.' }

  await writeForgeAudit({
    actorUserId: userId,
    organizationId,
    action: outOfService ? 'fleet.out_of_service' : 'fleet.returned_to_service',
    entityType: 'fleet_vehicle',
    entityId: vehicleId,
    afterValue: { status: outOfService ? 'out_of_service' : 'active' },
    reason: cleanReason
  })
  refresh(vehicleId)

  return { message: outOfService ? 'Vehicle marked out of service.' : 'Vehicle returned to service.' }
}

// ---------------------------------------------------------------------------
// Remove / restore / archive
// ---------------------------------------------------------------------------

export const removeVehicle = async ({ vehicleId, disposition, date, notes }: { vehicleId: string; disposition: string; date?: string | null; notes?: string | null }): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.retire')

  if (!loaded) return NOT_FOUND
  if (!['removed', 'sold', 'disposed'].includes(disposition)) return { error: 'Choose removed, sold or disposed.' }

  const day = text(date, 10)

  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Enter a valid date.' }

  const { organizationId, userId } = loaded
  const cleanNotes = text(notes, 2000)

  const { error } = await db().rpc('forge_fleet_set_disposition', {
    p_organization_id: organizationId,
    p_vehicle_id: vehicleId,
    p_status: disposition,
    p_date: day,
    p_notes: cleanNotes,
    p_actor_user_id: userId
  })

  if (error) return { error: vehicleDbMessage(error, 'Unable to remove the vehicle.') }

  await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'removed', message: `Removed from the fleet (${disposition}).`, metadata: { disposition, date: day, notes: cleanNotes } })
  await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.vehicle_removed', entityType: 'fleet_vehicle', entityId: vehicleId, afterValue: { status: disposition, disposition_date: day }, reason: cleanNotes })
  refresh(vehicleId)

  return { message: 'Vehicle removed from the fleet.' }
}

export const restoreVehicle = async ({ vehicleId }: { vehicleId: string }): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.retire')

  if (!loaded) return NOT_FOUND

  const { organizationId, userId, vehicle } = loaded
  const { error } = await db().rpc('forge_fleet_set_disposition', { p_organization_id: organizationId, p_vehicle_id: vehicleId, p_status: 'inactive', p_actor_user_id: userId })

  if (error) return { error: vehicleDbMessage(error, 'Unable to restore the vehicle.') }

  await fleetActivity({ organizationId, vehicleId, actorUserId: userId, type: 'restored', message: 'Restored to the fleet as inactive.', metadata: { previous_status: vehicle.status } })
  await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.vehicle_restored', entityType: 'fleet_vehicle', entityId: vehicleId, beforeValue: { status: vehicle.status }, afterValue: { status: 'inactive' } })
  refresh(vehicleId)

  return { message: 'Vehicle restored as inactive.' }
}

export const archiveVehicle = async ({ vehicleId }: { vehicleId: string }): Promise<Result> => {
  const loaded = await vehicleFor(vehicleId, 'fleet.retire')

  if (!loaded) return NOT_FOUND

  const { organizationId, userId, vehicle } = loaded

  if (!isRemovedStatus(vehicle.status)) return { error: 'Remove the vehicle from the fleet before archiving it.' }

  const { error } = await db()
    .from('forge_fleet_vehicles')
    .update({ archived_at: new Date().toISOString(), archived_by: userId, updated_by: userId })
    .eq('organization_id', organizationId)
    .eq('id', vehicleId)

  if (error) return { error: vehicleDbMessage(error, 'Unable to archive the vehicle.') }

  await writeForgeAudit({ actorUserId: userId, organizationId, action: 'fleet.vehicle_archived', entityType: 'fleet_vehicle', entityId: vehicleId, afterValue: { vehicle_number: vehicle.vehicle_number } })
  refresh(vehicleId)

  return { message: 'Vehicle archived.' }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const archiveVehicleDocument = async ({ documentId }: { documentId: string }): Promise<Result> => {
  const context = await contextFor('fleet.edit')

  if (!context || !UUID.test(documentId || '')) return { error: 'Document not found.' }

  const organizationId = context.activeOrganization.id
  const supabase = db()
  const { data: document } = await supabase.from('forge_fleet_documents').select('id, vehicle_id, file_name, archived_at').eq('organization_id', organizationId).eq('id', documentId).maybeSingle()

  if (!document || document.archived_at) return { error: 'Document not found.' }

  const vehicle = await loadVehicleInScope({ context, vehicleId: document.vehicle_id })

  if (!vehicle) return { error: 'Document not found.' }

  const { error } = await supabase.from('forge_fleet_documents').update({ archived_at: new Date().toISOString(), archived_by: context.user.id }).eq('id', documentId)

  if (error) return { error: 'Unable to archive the document.' }

  await fleetActivity({ organizationId, vehicleId: vehicle.id, actorUserId: context.user.id, type: 'document_archived', message: `Document archived: ${document.file_name}.`, metadata: { document_id: documentId } })
  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'fleet.document_archived', entityType: 'fleet_vehicle', entityId: vehicle.id, afterValue: { document_id: documentId, file_name: document.file_name } })
  refresh(vehicle.id)

  return { message: 'Document archived.' }
}
