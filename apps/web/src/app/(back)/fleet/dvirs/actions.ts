'use server'

import { revalidatePath } from 'next/cache'

import type { DvirFormInput } from '@/components/fleet/DvirForm'
import { loadVehicle } from '@/lib/forgeFleetAccess'
import type { SubmitDvirResult } from '@/lib/forgeFleetDvirs'
import { canOnVehicle, certifyDvir, loadDvir, memberIdentity, reviewDvir, submitDvir } from '@/lib/forgeFleetDvirs'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/**
 * Port slice 11 (piece B): office DVIR actions. Only ids and the typed answers come from the browser; the
 * permission, the vehicle's scope and the DVIR's company and status are checked again here.
 */

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)

export const submitOfficeDvirAction = async (vehicleId: string, input: DvirFormInput): Promise<SubmitDvirResult> => {
  const context = await requireTenantPermission('fleet.dvir')
  const organizationId = context.activeOrganization.id

  if (!isUuid(vehicleId)) return { ok: false, error: 'Choose a vehicle.' }

  const vehicle = await loadVehicle({ organizationId, vehicleId })

  if (!vehicle) return { ok: false, error: 'Vehicle not found.' }

  if (!(await canOnVehicle({ access: context.access, key: 'fleet.dvir', organizationId, userId: context.user.id, vehicle }))) {
    return { ok: false, error: 'You do not have permission to submit DVIRs for this vehicle.' }
  }

  const identity = await memberIdentity(organizationId, context.user.id)

  const result = await submitDvir({
    organizationId,
    vehicle,
    input: {
      tripType: String(input?.tripType || ''),
      inspectionDate: String(input?.inspectionDate || ''),
      odometer: input?.odometer ?? null,
      trailerNumbers: input?.trailerNumbers ?? null,
      items: Array.isArray(input?.items) ? input.items : [],
      remarks: input?.remarks ?? null,
      conditionSatisfactory: Boolean(input?.conditionSatisfactory),
      driverName: String(input?.driverName || identity.name),
      driverSignatureImage: typeof input?.driverSignatureImage === 'string' ? input.driverSignatureImage : null
    },
    driver: { userId: context.user.id, personnelId: identity.personnelId, name: identity.name },
    via: 'office'
  })

  if (result.ok) revalidatePath('/fleet/dvirs')

  return result
}

const loadForFollowUp = async (key: 'fleet.dvir_certify' | 'fleet.dvir', dvirId: string) => {
  const context = await requireTenantPermission(key)
  const organizationId = context.activeOrganization.id

  if (!isUuid(dvirId)) return { error: 'DVIR not found.' as const }

  const dvir = await loadDvir({ organizationId, dvirId })

  if (!dvir || !dvir.vehicle) return { error: 'DVIR not found.' as const }

  if (!(await canOnVehicle({ access: context.access, key, organizationId, userId: context.user.id, vehicle: dvir.vehicle }))) {
    return { error: 'You do not have permission for this vehicle.' as const }
  }

  return { context, organizationId, dvir }
}

export const certifyDvirAction = async (
  dvirId: string,
  input: { action: string; mechanicName: string; notes: string; signature: string | null }
): Promise<{ ok: true; message: string } | { ok: false; error: string }> => {
  const loaded = await loadForFollowUp('fleet.dvir_certify', dvirId)

  if ('error' in loaded) return { ok: false, error: loaded.error as string }

  const result = await certifyDvir({
    organizationId: loaded.organizationId,
    dvirId,
    userId: loaded.context.user.id,
    input: {
      action: String(input?.action || ''),
      mechanicName: String(input?.mechanicName || ''),
      notes: typeof input?.notes === 'string' ? input.notes : null,
      signature: typeof input?.signature === 'string' ? input.signature : null
    }
  })

  if (!result.ok) return result

  revalidatePath(`/fleet/dvirs/${dvirId}`)

  const parts = ['Certification saved. The DVIR now needs the next driver’s review.']

  if (result.returnedToService) parts.push('The vehicle is back in service.')
  if (result.repairCompleted) parts.push('The repair record was completed.')
  if (result.repairCanceled) parts.push('The repair record was canceled.')

  return { ok: true, message: parts.join(' ') }
}

export const reviewDvirAction = async (dvirId: string, input: { reviewName: string; signature: string | null }): Promise<{ ok: true; message: string } | { ok: false; error: string }> => {
  const loaded = await loadForFollowUp('fleet.dvir', dvirId)

  if ('error' in loaded) return { ok: false, error: loaded.error as string }

  const result = await reviewDvir({
    organizationId: loaded.organizationId,
    dvirId,
    userId: loaded.context.user.id,
    input: { reviewName: String(input?.reviewName || ''), signature: typeof input?.signature === 'string' ? input.signature : null }
  })

  if (!result.ok) return result

  revalidatePath(`/fleet/dvirs/${dvirId}`)

  return { ok: true, message: 'Review signed. The DVIR is closed.' }
}
