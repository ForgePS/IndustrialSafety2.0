import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { fleetActivity, loadFleetSettings, ownPersonnelIds, scopedVehicleIds, setVehicleServiceStatus, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import type { DvirSubmission } from '@/lib/forgeFleetRules'
import { DVIR_TRIP_LABELS, dvirDefects, initialDvirStatus, isRemovedStatus, todayIso, validateDvirSubmission, vehicleDisplayName } from '@/lib/forgeFleetRules'
import type { MechanicAction } from '@/lib/forgeFleetDvirRules'
import { dvirOutOfServiceReason, dvirSignature, odometerDecision, repairTitle, validateDriverReview, validateMechanicCertification } from '@/lib/forgeFleetDvirRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { personnelDisplayName } from '@/lib/forgeScanRules'

/**
 * Port slice 11 (piece B): Driver Vehicle Inspection Reports. Server only. Used by the office pages
 * (/fleet/dvirs) and the no-login scan DVIR (/scan/<token>/dvir/<trip>). The caller checks who may act;
 * this module checks the record itself (company, vehicle state, DVIR status).
 *
 * Fixes over 1.0: a defective DVIR takes the vehicle out of service and opens a repair (per fleet settings);
 * certification confirms the row really is a DVIR of this company; the next-driver review needs a signed-in
 * member (1.0 let anyone holding the sticker token sign it); a lower odometer never rolls the mileage back.
 */

const db = () => createServiceRoleClient() as any

export type DvirDriver = { userId: string | null; personnelId: string | null; name: string }

export type SubmitDvirResult =
  | { ok: false; error: string; errors?: Record<string, string> }
  | {
      ok: true
      id: string
      number: string
      status: string
      defects: { label: string; section: string; notes: string }[]
      outOfService: boolean
      repairNumber: string | null
      odometer: 'none' | 'apply' | 'lower'
      notes: string[]
    }

/** Name and personnel record of a signed-in user in a company. */
export const memberIdentity = async (organizationId: string, userId: string): Promise<{ personnelId: string | null; name: string }> => {
  const supabase = db()

  const [{ data: person }, { data: directory }] = await Promise.all([
    supabase
      .from('forge_personnel')
      .select('id, first_name, last_name, preferred_name')
      .eq('organization_id', organizationId)
      .eq('auth_user_id', userId)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle(),
    supabase.from('users').select('name, email').eq('user_id', userId).maybeSingle()
  ])

  return { personnelId: person?.id || null, name: person ? personnelDisplayName(person) : directory?.name || directory?.email || 'Forge user' }
}

// ---------------------------------------------------------------------------
// Notices for mechanics (fleet.dvir_certify holders whose scope covers the vehicle)
// ---------------------------------------------------------------------------

const CERTIFY_PERMISSION = 'fleet.dvir_certify'

const certifierIds = async (organizationId: string, vehicle: { location_id: string | null; division_id: string | null }) => {
  const supabase = db()
  const { data: permission } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', CERTIFY_PERMISSION).maybeSingle()

  if (!permission) return []

  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').eq('permission_id', permission.id).eq('allowed', true),
    supabase.from('forge_user_permission_overrides').select('user_id').eq('organization_id', organizationId).eq('permission_id', permission.id).eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]

  const { data: roleUsers } = roleIds.length
    ? await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)
    : { data: [] }

  const candidates = [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]

  if (!candidates.length) return []

  const { data: members } = await supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).in('user_id', candidates)

  const result: string[] = []

  await Promise.all(
    ((members || []) as { user_id: string }[]).map(async ({ user_id: userId }) => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      const grant = access.effective.find(item => item.permissionKey === CERTIFY_PERMISSION && item.allowed)

      if (!grant) return
      if (grant.scope === 'organization') return void result.push(userId)
      if (grant.scope !== 'location' && grant.scope !== 'division') return

      const assignments = await getTenantScopeAssignments({ organizationId, userId })

      const covered =
        grant.scope === 'location'
          ? Boolean(vehicle.location_id && assignments.locationIds.includes(vehicle.location_id))
          : Boolean(vehicle.division_id && assignments.divisionIds.includes(vehicle.division_id))

      if (covered) result.push(userId)
    })
  )

  return result
}

/** In-app + email notice to the mechanics for a DVIR with defects. Never throws. */
const notifyDvirDefects = async ({
  organizationId,
  dvir,
  vehicle,
  defects,
  outOfService,
  actorUserId
}: {
  organizationId: string
  dvir: { id: string; number: string; tripType: string; driverName: string }
  vehicle: { id: string; location_id: string | null; division_id: string | null; name: string }
  defects: { label: string }[]
  outOfService: boolean
  actorUserId: string | null
}) => {
  try {
    const supabase = db()
    const recipients = (await certifierIds(organizationId, vehicle)).filter(id => id !== actorUserId)

    if (!recipients.length) return { queued: 0 }

    const title = `DVIR defects on ${vehicle.name}`.slice(0, 200)

    const body = [
      `${dvir.driverName} reported ${defects.length} defect${defects.length === 1 ? '' : 's'} on the ${DVIR_TRIP_LABELS[dvir.tripType as 'pre_trip'] || ''} DVIR ${dvir.number}: ${defects.map(defect => defect.label).join(', ')}.`,
      outOfService ? 'The vehicle was taken out of service until a mechanic certifies the repairs.' : null,
      'Open the DVIR to sign the mechanic certification.'
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 2000)

    const now = new Date().toISOString()
    let queued = 0

    for (const userId of recipients) {
      const dedupeKey = `fleet-dvir:${dvir.id}:${userId}`

      const { data: event, error } = await supabase
        .from('forge_notification_events')
        .insert({
          organization_id: organizationId,
          source_module: 'fleet',
          event_type: 'fleet_dvir_defects',
          visibility: 'customer',
          resource_type: 'fleet_dvir',
          resource_id: dvir.id,
          actor_user_id: actorUserId,
          title,
          body,
          payload: { kind: 'fleet_dvir_defects', dedupe_key: dedupeKey, recipient_user_id: userId, dvir_id: dvir.id, vehicle_id: vehicle.id, out_of_service: outOfService }
        })
        .select('id')
        .single()

      if (error || !event) {
        console.error('[fleet] DVIR notice event', dvir.id, error?.message)
        continue
      }

      const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(
        (['in_app', 'email'] as const).map(channel => ({
          event_id: event.id,
          organization_id: organizationId,
          recipient_user_id: userId,
          recipient_audience: 'customer',
          channel,
          status: channel === 'in_app' ? 'sent' : 'pending',
          title,
          body,
          link_path: `/fleet/dvirs/${dvir.id}`,
          sent_at: channel === 'in_app' ? now : null
        }))
      )

      if (deliveryError) {
        await supabase.from('forge_notification_events').delete().eq('id', event.id)
        console.error('[fleet] DVIR notice delivery', dvir.id, deliveryError.message)
        continue
      }

      queued += 1
    }

    return { queued }
  } catch (error) {
    console.error('[fleet] DVIR notice', dvir.id, (error as Error).message)

    return { queued: 0 }
  }
}

const audit = async (input: Parameters<typeof writeForgeAudit>[0]) => {
  try {
    await writeForgeAudit(input)
  } catch (error) {
    console.error('[fleet] DVIR audit', (error as Error).message)
  }
}

const nextNumber = async (organizationId: string, kind: 'dvir' | 'maintenance') => {
  const { data, error } = await db().rpc('next_forge_fleet_number', { p_organization_id: organizationId, p_kind: kind })

  if (error || !data) throw new Error(error?.message || 'Unable to number the record.')

  return data as string
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type DvirVehicle = {
  id: string
  organization_id: string
  vehicle_number: string
  unit_number?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  status: string
  dot_regulated: boolean
  mileage: number | null
  location_id: string | null
  division_id: string | null
  archived_at?: string | null
}

/**
 * Saves a driver's DVIR and runs the follow-up: mileage, out of service, repair record, activity, audit and
 * mechanic notices. The caller has checked the driver may submit for this vehicle.
 */
export const submitDvir = async ({
  organizationId,
  vehicle,
  input,
  driver,
  via,
  qrCodeId = null
}: {
  organizationId: string
  vehicle: DvirVehicle
  input: DvirSubmission
  driver: DvirDriver
  via: 'office' | 'scan'
  qrCodeId?: string | null
}): Promise<SubmitDvirResult> => {
  if (!vehicle || vehicle.organization_id !== organizationId) return { ok: false, error: 'Vehicle not found.' }
  if (vehicle.archived_at || isRemovedStatus(vehicle.status)) return { ok: false, error: 'This vehicle has been removed from the fleet. DVIRs can no longer be submitted for it.' }

  const odometer = input.odometer == null || (input.odometer as unknown) === '' ? null : Number(input.odometer)
  const submission: DvirSubmission = { ...input, odometer, driverName: (input.driverName || '').trim().slice(0, 200), conditionSatisfactory: Boolean(input.conditionSatisfactory) }
  const checked = validateDvirSubmission(submission)

  if (!checked.ok) {
    const first = Object.values(checked.errors)[0]

    return { ok: false, error: first || 'Check the DVIR and try again.', errors: checked.errors }
  }

  const supabase = db()
  const items = checked.items
  const defects = dvirDefects(items)
  const status = initialDvirStatus(items)
  const settings = await loadFleetSettings(organizationId)
  const name = vehicleDisplayName(vehicle)
  const notes: string[] = []

  let number: string

  try {
    number = await nextNumber(organizationId, 'dvir')
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  const { data: dvir, error } = await supabase
    .from('forge_fleet_dvirs')
    .insert({
      organization_id: organizationId,
      dvir_number: number,
      vehicle_id: vehicle.id,
      trip_type: submission.tripType,
      inspection_date: submission.inspectionDate,
      odometer,
      trailer_numbers: (submission.trailerNumbers || '').trim().slice(0, 200) || null,
      location_id: vehicle.location_id,
      items,
      remarks: (submission.remarks || '').trim().slice(0, 2000) || null,
      condition_satisfactory: submission.conditionSatisfactory,
      status,
      driver_personnel_id: driver.personnelId,
      driver_user_id: driver.userId,
      driver_name: submission.driverName,
      driver_signature: dvirSignature({ image: submission.driverSignatureImage as string, name: submission.driverName, userId: driver.userId, personnelId: driver.personnelId }),
      submitted_via: via,
      qr_code_id: qrCodeId,
      created_by: driver.userId
    })
    .select('id')
    .single()

  if (error || !dvir) return { ok: false, error: 'Unable to save the DVIR. Try again.' }

  if (defects.length) {
    for (const defect of defects) {
      const { error: defectError } = await supabase.from('forge_fleet_dvir_defects').insert({
        organization_id: organizationId,
        dvir_id: dvir.id,
        vehicle_id: vehicle.id,
        item_id: defect.itemId,
        item_label: defect.label,
        section: defect.section,
        notes: defect.notes
      })

      if (defectError) console.error('[fleet] DVIR defect row', dvir.id, defect.itemId, defectError.message)
    }
  }

  // Mileage: only forward. A lower odometer is kept on the DVIR but never rolls the vehicle back.
  const decision = odometerDecision(odometer, vehicle.mileage)

  if (decision === 'apply') {
    const { error: meterError } = await supabase.from('forge_fleet_meter_readings').insert({
      organization_id: organizationId,
      vehicle_id: vehicle.id,
      meter: 'mileage',
      value: odometer,
      source: 'dvir',
      source_record_id: dvir.id,
      notes: `${number} odometer`,
      recorded_by: driver.userId,
      recorded_by_personnel_id: driver.personnelId
    })

    if (meterError) notes.push('The odometer could not be applied to the vehicle mileage.')
  } else if (decision === 'lower') {
    notes.push(`The odometer (${odometer!.toLocaleString()}) is lower than the vehicle's current mileage (${vehicle.mileage!.toLocaleString()}), so the mileage was not changed. Ask the fleet office to correct it if needed.`)
  }

  let outOfService = false
  let repairNumber: string | null = null

  if (defects.length && settings.defect_out_of_service) {
    const result = await setVehicleServiceStatus({
      organizationId,
      vehicleId: vehicle.id,
      status: 'out_of_service',
      reason: dvirOutOfServiceReason(number, defects),
      source: 'dvir',
      relatedRecordType: 'fleet_dvir',
      relatedRecordId: dvir.id,
      qrCodeId,
      actorUserId: driver.userId,
      actorPersonnelId: driver.personnelId,
      actorName: submission.driverName
    })

    if ('error' in result) notes.push('The vehicle could not be marked out of service. Tag it out by hand.')
    else outOfService = true
  }

  if (defects.length && settings.defect_opens_repair) {
    try {
      repairNumber = await nextNumber(organizationId, 'maintenance')

      const { data: repair, error: repairError } = await supabase
        .from('forge_fleet_maintenance')
        .insert({
          organization_id: organizationId,
          maintenance_number: repairNumber,
          vehicle_id: vehicle.id,
          title: repairTitle(number),
          maintenance_type: 'repair',
          status: 'open',
          due_on: todayIso(),
          dvir_id: dvir.id,
          notes: defects.map(defect => `${defect.label}: ${defect.notes}`).join('\n').slice(0, 4000),
          created_by: driver.userId
        })
        .select('id')
        .single()

      if (repairError || !repair) throw new Error(repairError?.message || 'no row')

      await supabase.from('forge_fleet_dvirs').update({ repair_maintenance_id: repair.id }).eq('id', dvir.id).eq('organization_id', organizationId)
    } catch (repairFailure) {
      console.error('[fleet] DVIR repair record', dvir.id, (repairFailure as Error).message)
      repairNumber = null
      notes.push('The repair record could not be opened. Add it on the Maintenance tab.')
    }
  }

  await fleetActivity({
    organizationId,
    vehicleId: vehicle.id,
    actorUserId: driver.userId,
    type: 'dvir_submitted',
    message: `${DVIR_TRIP_LABELS[submission.tripType as 'pre_trip']} DVIR ${number} by ${submission.driverName}: ${defects.length ? `${defects.length} defect${defects.length === 1 ? '' : 's'}` : 'no defects'}.`,
    metadata: { dvir_id: dvir.id, via, qr_code_id: qrCodeId, defects: defects.length, actor_personnel_id: driver.personnelId }
  })

  await audit({
    actorUserId: driver.userId,
    organizationId,
    action: 'fleet.dvir.submitted',
    entityType: 'fleet_dvir',
    entityId: dvir.id,
    afterValue: { dvir_number: number, vehicle_id: vehicle.id, status, defects: defects.map(defect => defect.itemId), via, qr_code_id: qrCodeId, driver_personnel_id: driver.personnelId }
  })

  if (defects.length) {
    await notifyDvirDefects({
      organizationId,
      dvir: { id: dvir.id, number, tripType: submission.tripType, driverName: submission.driverName },
      vehicle: { id: vehicle.id, location_id: vehicle.location_id, division_id: vehicle.division_id, name },
      defects,
      outOfService,
      actorUserId: driver.userId
    })
  }

  return {
    ok: true,
    id: dvir.id,
    number,
    status,
    defects: defects.map(defect => ({ label: defect.label, section: defect.section, notes: defect.notes })),
    outOfService,
    repairNumber,
    odometer: decision,
    notes
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const DVIR_SELECT =
  '*, vehicle:forge_fleet_vehicles!forge_fleet_dvirs_vehicle_id_fkey(id, organization_id, vehicle_number, unit_number, year, make, model, status, dot_regulated, mileage, location_id, division_id, assigned_driver_personnel_id, archived_at, license_plate, license_state, vin), locations(name), qr:forge_qr_codes(qr_number)'

/** One DVIR of the company, with its vehicle, defects and repair record, or null. */
export const loadDvir = async ({ organizationId, dvirId }: { organizationId: string; dvirId: string }) => {
  if (!/^[0-9a-f-]{36}$/i.test(dvirId || '')) return null

  const supabase = db()
  const { data } = await supabase.from('forge_fleet_dvirs').select(DVIR_SELECT).eq('organization_id', organizationId).eq('id', dvirId).maybeSingle()

  if (!data) return null

  const [{ data: defects }, { data: repair }, { data: reading }] = await Promise.all([
    supabase.from('forge_fleet_dvir_defects').select('*').eq('organization_id', organizationId).eq('dvir_id', dvirId).order('created_at'),
    data.repair_maintenance_id
      ? supabase.from('forge_fleet_maintenance').select('id, maintenance_number, status, completed_on, title, notes').eq('organization_id', organizationId).eq('id', data.repair_maintenance_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('forge_fleet_meter_readings').select('id').eq('organization_id', organizationId).eq('source', 'dvir').eq('source_record_id', dvirId).limit(1).maybeSingle()
  ])

  return { ...data, defects: defects || [], repair: repair || null, odometerApplied: Boolean(reading) }
}

export type LoadedDvir = NonNullable<Awaited<ReturnType<typeof loadDvir>>>

/** Whether the user drove (submitted) this DVIR. */
export const isDvirDriver = async (dvir: { organization_id: string; driver_user_id: string | null; driver_personnel_id: string | null }, userId: string) => {
  if (dvir.driver_user_id && dvir.driver_user_id === userId) return true
  if (!dvir.driver_personnel_id) return false

  return (await ownPersonnelIds(dvir.organization_id, userId)).includes(dvir.driver_personnel_id)
}

/** The grant of a permission in an access object, or null. */
export const grantOf = (access: { effective: { permissionKey: string; allowed: boolean; scope: string | null }[] }, key: string) =>
  access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** Whether a user may act on a DVIR's vehicle with a permission (allowed and the vehicle in scope). */
export const canOnVehicle = async ({
  access,
  key,
  organizationId,
  userId,
  vehicle
}: {
  access: { effective: { permissionKey: string; allowed: boolean; scope: string | null }[] }
  key: string
  organizationId: string
  userId: string
  vehicle: Parameters<typeof vehicleWithinScope>[0]['vehicle']
}) => {
  const grant = grantOf(access, key)

  return Boolean(grant && (await vehicleWithinScope({ organizationId, userId, scope: grant.scope ?? null, vehicle })))
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type DvirListFilters = { vehicleId?: string; status?: string; trip?: string; from?: string; to?: string }

export const listDvirs = async ({
  organizationId,
  userId,
  scope,
  filters,
  limit = 200
}: {
  organizationId: string
  userId: string
  scope: string | null
  filters: DvirListFilters
  limit?: number
}) => {
  const vehicleIds = await scopedVehicleIds({ organizationId, userId, scope })

  let query = db()
    .from('forge_fleet_dvirs')
    .select(
      'id, dvir_number, vehicle_id, trip_type, inspection_date, odometer, status, condition_satisfactory, driver_name, driver_user_id, mechanic_signed_at, reviewed_at, submitted_via, created_at, vehicle:forge_fleet_vehicles!forge_fleet_dvirs_vehicle_id_fkey(id, vehicle_number, unit_number, year, make, model, status, dot_regulated), defects:forge_fleet_dvir_defects(count)'
    )
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('inspection_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (vehicleIds !== null) {
    // Vehicles in scope, plus the DVIRs the user signed as the driver.
    const parts = [`driver_user_id.eq.${userId}`]

    if (vehicleIds.length) parts.push(`vehicle_id.in.(${vehicleIds.join(',')})`)
    query = query.or(parts.join(','))
  }

  if (filters.vehicleId && /^[0-9a-f-]{36}$/i.test(filters.vehicleId)) query = query.eq('vehicle_id', filters.vehicleId)
  if (filters.status && ['open', 'needs_review', 'closed'].includes(filters.status)) query = query.eq('status', filters.status)
  if (filters.status === 'follow_up') query = query.neq('status', 'closed')
  if (filters.trip && ['pre_trip', 'post_trip'].includes(filters.trip)) query = query.eq('trip_type', filters.trip)
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) query = query.gte('inspection_date', filters.from)
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) query = query.lte('inspection_date', filters.to)

  const { data } = await query

  return ((data || []) as any[]).map(row => ({ ...row, defectCount: row.defects?.[0]?.count ?? 0 }))
}

/** Vehicles in scope that can take a DVIR (not removed / archived), for the office picker. */
export const dvirVehicleOptions = async ({ organizationId, userId, scope }: { organizationId: string; userId: string; scope: string | null }) => {
  const vehicleIds = await scopedVehicleIds({ organizationId, userId, scope })

  if (vehicleIds !== null && !vehicleIds.length) return []

  let query = db()
    .from('forge_fleet_vehicles')
    .select('id, vehicle_number, unit_number, year, make, model, status, dot_regulated')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('status', 'in', '(removed,sold,disposed)')
    .order('vehicle_number')

  if (vehicleIds !== null) query = query.in('id', vehicleIds)

  const { data } = await query

  return (data || []) as { id: string; vehicle_number: string; unit_number: string | null; year: number | null; make: string | null; model: string | null; status: string; dot_regulated: boolean }[]
}

// ---------------------------------------------------------------------------
// Mechanic certification
// ---------------------------------------------------------------------------

export const certifyDvir = async ({
  organizationId,
  dvirId,
  userId,
  input
}: {
  organizationId: string
  dvirId: string
  userId: string
  input: { action: string; mechanicName: string; notes?: string | null; signature: string | null }
}): Promise<{ ok: false; error: string } | { ok: true; returnedToService: boolean; repairCompleted: boolean; repairCanceled: boolean }> => {
  const supabase = db()
  const dvir = await loadDvir({ organizationId, dvirId })

  // Confirm the row really is a DVIR of this company (1.0 certified any compliance record id).
  if (!dvir) return { ok: false, error: 'DVIR not found.' }

  const mechanicName = (input.mechanicName || '').trim().slice(0, 200)
  const check = validateMechanicCertification({ status: dvir.status, action: input.action, mechanicName, signature: input.signature })

  if (!check.ok) return { ok: false, error: check.error }

  const action = input.action as MechanicAction
  const now = new Date()
  const identity = await memberIdentity(organizationId, userId)

  const { data: updated, error } = await supabase
    .from('forge_fleet_dvirs')
    .update({
      status: 'needs_review',
      mechanic_action: action,
      mechanic_name: mechanicName,
      mechanic_notes: (input.notes || '').trim().slice(0, 2000) || null,
      mechanic_signature: dvirSignature({ image: input.signature as string, name: mechanicName, userId, personnelId: identity.personnelId, now }),
      mechanic_user_id: userId,
      mechanic_signed_at: now.toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', dvirId)
    .eq('status', 'open')
    .is('mechanic_signature', null)
    .select('id')

  if (error) return { ok: false, error: 'Unable to save the certification. Try again.' }
  if (!updated?.length) return { ok: false, error: 'This DVIR was already certified.' }

  await supabase
    .from('forge_fleet_dvir_defects')
    .update({ status: action, resolved_at: now.toISOString(), resolved_by: userId })
    .eq('organization_id', organizationId)
    .eq('dvir_id', dvirId)
    .eq('status', 'open')

  // Back in service only when DVIRs took it out and no other DVIR for the vehicle still has open defects.
  let returnedToService = false
  const vehicle = dvir.vehicle

  if (vehicle?.status === 'out_of_service') {
    const [{ data: latest }, { count: stillOpen }] = await Promise.all([
      supabase
        .from('forge_fleet_status_history')
        .select('to_status, source')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicle.id)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('forge_fleet_dvirs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('vehicle_id', vehicle.id).eq('status', 'open')
    ])

    if (latest?.to_status === 'out_of_service' && latest.source === 'dvir' && !stillOpen) {
      const result = await setVehicleServiceStatus({
        organizationId,
        vehicleId: vehicle.id,
        status: 'active',
        reason: `DVIR ${dvir.dvir_number} certified by ${mechanicName}`,
        source: 'dvir_certified',
        relatedRecordType: 'fleet_dvir',
        relatedRecordId: dvirId,
        actorUserId: userId,
        actorPersonnelId: identity.personnelId,
        actorName: mechanicName
      })

      returnedToService = !('error' in result) && result.changed
    }
  }

  let repairCompleted = false
  let repairCanceled = false

  if (dvir.repair?.status === 'open') {
    const patch =
      action === 'corrected'
        ? { status: 'completed', completed_on: todayIso(), completed_mileage: vehicle?.mileage ?? null, completed_by: userId, updated_by: userId }
        : {
            status: 'canceled',
            notes: [dvir.repair.notes, 'Canceled: the mechanic certified the DVIR defects need no correction.'].filter(Boolean).join('\n').slice(0, 4000),
            updated_by: userId
          }

    const { data: done } = await supabase
      .from('forge_fleet_maintenance')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', dvir.repair.id)
      .eq('status', 'open')
      .select('id')

    repairCompleted = action === 'corrected' && Boolean(done?.length)
    repairCanceled = action === 'not_needed' && Boolean(done?.length)
  }

  if (vehicle) {
    await fleetActivity({
      organizationId,
      vehicleId: vehicle.id,
      actorUserId: userId,
      type: 'dvir_certified',
      message: `${mechanicName} certified DVIR ${dvir.dvir_number}: ${action === 'corrected' ? 'defects corrected' : 'no correction needed'}.`,
      metadata: { dvir_id: dvirId, action, repair_completed: repairCompleted, repair_canceled: repairCanceled, returned_to_service: returnedToService }
    })
  }

  await audit({
    actorUserId: userId,
    organizationId,
    action: 'fleet.dvir.certified',
    entityType: 'fleet_dvir',
    entityId: dvirId,
    beforeValue: { status: 'open' },
    afterValue: { status: 'needs_review', mechanic_action: action, mechanic_name: mechanicName, returned_to_service: returnedToService }
  })

  return { ok: true, returnedToService, repairCompleted, repairCanceled }
}

// ---------------------------------------------------------------------------
// Next-driver review
// ---------------------------------------------------------------------------

export const reviewDvir = async ({
  organizationId,
  dvirId,
  userId,
  input
}: {
  organizationId: string
  dvirId: string
  userId: string
  input: { reviewName: string; signature: string | null }
}): Promise<{ ok: false; error: string } | { ok: true }> => {
  const dvir = await loadDvir({ organizationId, dvirId })

  if (!dvir) return { ok: false, error: 'DVIR not found.' }

  const reviewName = (input.reviewName || '').trim().slice(0, 200)
  const check = validateDriverReview({ status: dvir.status, reviewName, signature: input.signature })

  if (!check.ok) return { ok: false, error: check.error }

  const now = new Date()
  const identity = await memberIdentity(organizationId, userId)

  const { data: updated, error } = await db()
    .from('forge_fleet_dvirs')
    .update({
      status: 'closed',
      review_name: reviewName,
      review_signature: dvirSignature({ image: input.signature as string, name: reviewName, userId, personnelId: identity.personnelId, now }),
      review_user_id: userId,
      review_personnel_id: identity.personnelId,
      reviewed_at: now.toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', dvirId)
    .eq('status', 'needs_review')
    .is('review_signature', null)
    .select('id')

  if (error) return { ok: false, error: 'Unable to save the review. Try again.' }
  if (!updated?.length) return { ok: false, error: 'This DVIR was already reviewed.' }

  await fleetActivity({
    organizationId,
    vehicleId: dvir.vehicle_id,
    actorUserId: userId,
    type: 'dvir_reviewed',
    message: `${reviewName} signed the driver review of DVIR ${dvir.dvir_number}.`,
    metadata: { dvir_id: dvirId }
  })

  await audit({
    actorUserId: userId,
    organizationId,
    action: 'fleet.dvir.reviewed',
    entityType: 'fleet_dvir',
    entityId: dvirId,
    beforeValue: { status: 'needs_review' },
    afterValue: { status: 'closed', review_name: reviewName }
  })

  return { ok: true }
}

/** Every DVIR for one vehicle on one day (the day print sheet), pre-trip first. */
export const loadDvirDay = async ({ organizationId, vehicleId, date }: { organizationId: string; vehicleId: string; date: string }) => {
  const { data } = await db()
    .from('forge_fleet_dvirs')
    .select(DVIR_SELECT)
    .eq('organization_id', organizationId)
    .eq('vehicle_id', vehicleId)
    .eq('inspection_date', date)
    .order('created_at')

  return ((data || []) as any[]).sort((a, b) => (a.trip_type === b.trip_type ? 0 : a.trip_type === 'pre_trip' ? -1 : 1))
}
