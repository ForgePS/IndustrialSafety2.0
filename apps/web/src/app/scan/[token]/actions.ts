'use server'

import { setVehicleServiceStatus } from '@/lib/forgeFleetAccess'
import { identifyScanEmployee, loadScanQr, recordScanEvent, resolveScanViewer, scanActor, setAssetServiceStatus, signOutScanEmployee } from '@/lib/forgeScanContext'
import { canUseScanAction } from '@/lib/forgeScanRules'

import { findScanAction, loadScanMenuContext, scanNextPath } from './menuContext'

/**
 * Port slice 10: server actions of the scan menu. Each one reloads the QR, target and viewer from the
 * token and re-checks the action; the browser only supplies the token and what the person typed.
 */

type Result = { error?: string; message?: string; redirectTo?: string; status?: string }

const UNAVAILABLE = 'This QR code is no longer active.'

/** Logs one 'open' per page load (called once from the browser, not on re-renders). */
export const recordScanOpen = async (token: string): Promise<void> => {
  const qr = await loadScanQr(token)

  if (!qr) return

  await recordScanEvent({ qr, action: 'open', viewer: await resolveScanViewer(qr) })
}

export const identifyScanEmployeeAction = async (token: string, employeeNumber: string, next?: string | null): Promise<Result> => {
  const qr = await loadScanQr(token)

  if (!qr) return { error: UNAVAILABLE }

  const result = await identifyScanEmployee(qr, String(employeeNumber || ''))

  if ('error' in result) return { error: result.error }

  return { message: `Welcome, ${result.name}.`, redirectTo: scanNextPath(qr.token, next) }
}

export const signOutScanEmployeeAction = async (token: string): Promise<Result> => {
  const qr = await loadScanQr(token)

  if (!qr) return { error: UNAVAILABLE }

  const viewer = await resolveScanViewer(qr)

  await signOutScanEmployee(qr)

  if (viewer.kind === 'employee') await recordScanEvent({ qr, action: 'sign_out', viewer })

  return { message: 'Signed out.' }
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** Out of service (reason required) or return to service, from the scan menu. */
export const setScanServiceStatusAction = async (
  token: string,
  input: { status: 'out_of_service' | 'active'; reason?: string; notes?: string }
): Promise<Result> => {
  const context = await loadScanMenuContext(token)

  if (!context) return { error: UNAVAILABLE }

  const { qr, target, viewer } = context
  const outOfService = input?.status === 'out_of_service'
  const actionId = outOfService ? 'out_of_service' : 'return_to_service'

  if (target.type !== 'asset' && target.type !== 'vehicle') return { error: 'Only equipment and vehicles can be taken out of service.' }

  const vehicle = target.type === 'vehicle'
  const noun = vehicle ? 'vehicle' : 'equipment'
  const action = findScanAction(context, actionId)

  if (!action) {
    return { error: outOfService ? `This ${noun} is already out of service.` : `This ${noun} is not out of service.` }
  }

  if (!canUseScanAction(action, viewer, qr.accessMode, qr.config)) {
    await recordScanEvent({ qr, action: actionId, viewer, result: 'denied', recordType: vehicle ? 'vehicle' : 'asset', recordId: target.id })

    return {
      error:
        viewer.kind === 'anonymous'
          ? 'Enter your employee number or sign in first.'
          : outOfService
            ? `You are not allowed to mark this ${noun} out of service.`
            : `Only a supervisor can return this ${noun} to service.`
    }
  }

  const reason = clean(input.reason, 500)
  const notes = clean(input.notes, 2000)

  if (outOfService && !reason) return { error: 'Enter the reason it is out of service.' }

  if (vehicle) {
    const actor = scanActor(viewer)

    // The fleet status history has no notes column, so notes are folded into the reason.
    const combined = [reason, notes].filter(Boolean).join(' — ').slice(0, 2000) || null

    const result = await setVehicleServiceStatus({
      organizationId: qr.organizationId,
      vehicleId: target.id,
      status: outOfService ? 'out_of_service' : 'active',
      reason: combined,
      source: 'qr_scan',
      qrCodeId: qr.id,
      actorUserId: actor.userId,
      actorPersonnelId: actor.personnelId,
      actorName: actor.name
    })

    if ('error' in result) return { error: 'Unable to change the service status right now. Try again.' }

    if (result.changed) {
      await recordScanEvent({ qr, action: actionId, viewer, recordType: 'vehicle', recordId: target.id, metadata: { source: 'qr_scan', reason: combined } })
    }

    return outOfService
      ? { message: 'Marked out of service. Nobody should drive this vehicle until it is returned to service.', status: 'out_of_service' }
      : { message: 'Returned to service. The vehicle is back in use.', status: 'active' }
  }

  const result = await setAssetServiceStatus({
    qr,
    assetId: target.id,
    status: outOfService ? 'out_of_service' : 'active',
    viewer,
    reason: outOfService ? reason : reason || null,
    notes: notes || null
  })

  if ('error' in result) return { error: 'Unable to change the service status right now. Try again.' }

  return outOfService
    ? { message: 'Marked out of service. Nobody should use this equipment until it is returned to service.', status: 'out_of_service' }
    : { message: 'Returned to service. The equipment is back in use.', status: 'active' }
}
