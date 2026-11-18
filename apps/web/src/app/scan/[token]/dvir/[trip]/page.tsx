import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { submitScanDvirAction } from '../actions'
import { isDvirTrip, loadScanDvirContext, viewerMayDvir } from '../context'
import DvirForm from '@/components/fleet/DvirForm'
import ScanPageShell from '@/components/scan/ScanPageShell'
import { DVIR_TRIP_LABELS, todayIso, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { scanPath } from '@/lib/forgeScanRules'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'DVIR', robots: { index: false, follow: false } }

const Notice = ({ children }: { children: React.ReactNode }) => (
  <div className='rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800' data-testid='scan-dvir-notice'>
    {children}
  </div>
)

/**
 * Port slice 11 (piece B): a pre-trip or post-trip DVIR from a vehicle QR, no login. Employees identified by
 * number (or signed-in members with fleet.dvir) fill it in; anonymous viewers identify first and come back
 * through ?next=dvir-<trip>.
 */
const ScanDvirPage = async ({ params }: { params: Promise<{ token: string; trip: string }> }) => {
  const { token, trip } = await params

  if (!isDvirTrip(trip)) notFound()

  const loaded = await loadScanDvirContext(token)

  if (loaded.kind === 'unavailable') redirect('/q/unavailable')

  const { qr, target, viewer } = loaded
  const label = `${DVIR_TRIP_LABELS[trip]} DVIR`

  const shell = (children: React.ReactNode) => (
    <ScanPageShell qr={qr} target={target} viewer={viewer} title={label} back>
      {children}
    </ScanPageShell>
  )

  if (loaded.kind === 'not_vehicle') return shell(<Notice>This QR code is not for a vehicle, so it has no DVIR.</Notice>)

  if (loaded.kind === 'not_offered') {
    const outOfService = target.type === 'vehicle' && target.status === 'out_of_service'

    return shell(<Notice>DVIRs are not available for this vehicle. {outOfService ? 'It is out of service. Do not drive it.' : 'It is not set up as a DOT-regulated vehicle in service.'}</Notice>)
  }

  if (viewer.kind === 'anonymous') {
    if (qr.accessMode === 'signed_in') redirect(`/auth/login?next=${encodeURIComponent(`${scanPath(qr.token)}/dvir/${trip}`)}`)
    redirect(`${scanPath(qr.token)}?next=dvir-${trip}`)
  }

  if (!viewerMayDvir(viewer)) return shell(<Notice>You do not have permission to submit DVIRs. Ask your administrator for access.</Notice>)

  const vehicle = loaded.vehicle

  return shell(
    <DvirForm
      mode='scan'
      submit={submitScanDvirAction.bind(null, qr.token, trip)}
      vehicle={{ name: vehicleDisplayName(vehicle), number: vehicle.vehicle_number, mileage: vehicle.mileage ?? null }}
      today={todayIso()}
      defaultDriverName={viewer.name}
      lockedTrip={trip}
      menuHref={scanPath(qr.token)}
    />
  )
}

export default ScanDvirPage
