import { loadVehicle } from '@/lib/forgeFleetAccess'
import { DVIR_TRIP_TYPES, vehicleOffersDvir } from '@/lib/forgeFleetRules'
import type { DvirTripType } from '@/lib/forgeFleetRules'
import type { ScanQr, ScanTarget } from '@/lib/forgeScanContext'
import { loadScanQr, loadScanTarget, resolveScanViewer } from '@/lib/forgeScanContext'
import type { ScanViewer } from '@/lib/forgeScanRules'

/**
 * Port slice 11 (piece B): everything a scan DVIR needs, loaded fresh from the token on every page load and
 * every submit. The vehicle must still be DOT-regulated and in service (1.0 never re-checked DOT regulation,
 * so turning it off left the DVIR link working).
 */

export const isDvirTrip = (value: string): value is DvirTripType => (DVIR_TRIP_TYPES as readonly string[]).includes(value)

type LoadedVehicle = NonNullable<Awaited<ReturnType<typeof loadVehicle>>>

export type ScanDvirContext =
  | { kind: 'unavailable' }
  | { kind: 'not_vehicle'; qr: ScanQr; target: ScanTarget; viewer: ScanViewer }
  | { kind: 'not_offered'; qr: ScanQr; target: ScanTarget; viewer: ScanViewer }
  | { kind: 'ok'; qr: ScanQr; target: ScanTarget; viewer: ScanViewer; vehicle: LoadedVehicle }

export const loadScanDvirContext = async (token: string): Promise<ScanDvirContext> => {
  const qr = await loadScanQr(String(token || ''))

  if (!qr) return { kind: 'unavailable' }

  const target = await loadScanTarget(qr)

  if (!target) return { kind: 'unavailable' }

  const viewer = await resolveScanViewer(qr)

  if (target.type !== 'vehicle') return { kind: 'not_vehicle', qr, target, viewer }

  const vehicle = await loadVehicle({ organizationId: qr.organizationId, vehicleId: target.id })

  if (!vehicle || vehicle.archived_at || !vehicleOffersDvir(vehicle)) return { kind: 'not_offered', qr, target, viewer }

  return { kind: 'ok', qr, target, viewer, vehicle }
}

/** Employees identified by number, or signed-in members of the QR's company holding fleet.dvir. */
export const viewerMayDvir = (viewer: ScanViewer) => viewer.kind === 'employee' || (viewer.kind === 'user' && viewer.permissions.includes('fleet.dvir'))
