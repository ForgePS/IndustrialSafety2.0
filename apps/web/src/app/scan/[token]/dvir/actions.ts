'use server'

import { isDvirTrip, loadScanDvirContext, viewerMayDvir } from './context'
import type { DvirFormInput } from '@/components/fleet/DvirForm'
import type { SubmitDvirResult } from '@/lib/forgeFleetDvirs'
import { submitDvir } from '@/lib/forgeFleetDvirs'
import { recordScanEvent } from '@/lib/forgeScanContext'

/**
 * Port slice 11 (piece B): submit a DVIR from a vehicle QR. Only the token, the trip and the typed answers
 * come from the browser; the QR, the vehicle (still DOT-regulated and in service) and the viewer are
 * resolved again here.
 */
export const submitScanDvirAction = async (token: string, trip: string, input: DvirFormInput): Promise<SubmitDvirResult> => {
  if (!isDvirTrip(trip)) return { ok: false, error: 'Choose pre-trip or post-trip.' }

  const loaded = await loadScanDvirContext(token)

  if (loaded.kind === 'unavailable') return { ok: false, error: 'This QR code is no longer active.' }
  if (loaded.kind === 'not_vehicle') return { ok: false, error: 'This QR code is not for a vehicle.' }

  if (loaded.kind === 'not_offered') {
    await recordScanEvent({ qr: loaded.qr, action: 'dvir_submit', viewer: loaded.viewer, result: 'denied', recordType: 'fleet_dvir', metadata: { trip, reason: 'not_offered' } })

    return { ok: false, error: 'DVIRs cannot be submitted for this vehicle right now. It may be out of service or not DOT-regulated.' }
  }

  const { qr, viewer, vehicle } = loaded

  if (viewer.kind === 'anonymous' || !viewerMayDvir(viewer)) return { ok: false, error: 'Enter your employee number on the scan page first.' }

  const result = await submitDvir({
    organizationId: qr.organizationId,
    vehicle,
    input: {
      tripType: trip,
      inspectionDate: String(input?.inspectionDate || ''),
      odometer: input?.odometer ?? null,
      trailerNumbers: input?.trailerNumbers ?? null,
      items: Array.isArray(input?.items) ? input.items : [],
      remarks: input?.remarks ?? null,
      conditionSatisfactory: Boolean(input?.conditionSatisfactory),
      driverName: String(input?.driverName || viewer.name),
      driverSignatureImage: typeof input?.driverSignatureImage === 'string' ? input.driverSignatureImage : null
    },
    driver: { userId: viewer.kind === 'user' ? viewer.userId : null, personnelId: viewer.personnelId, name: viewer.name },
    via: 'scan',
    qrCodeId: qr.id
  })

  await recordScanEvent({
    qr,
    action: 'dvir_submit',
    viewer,
    result: result.ok ? 'ok' : 'failed',
    recordType: 'fleet_dvir',
    recordId: result.ok ? result.id : null,
    metadata: result.ok ? { kind: 'dvir', trip, dvir_number: result.number, defects: result.defects.length, out_of_service: result.outOfService } : { kind: 'dvir', trip }
  })

  return result
}
