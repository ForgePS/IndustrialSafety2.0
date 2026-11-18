import Link from 'next/link'

import { VEHICLE_STATUS_LABELS } from '@/lib/forgeFleetRules'
import type { ScanQr, ScanTarget } from '@/lib/forgeScanContext'
import type { ScanViewer } from '@/lib/forgeScanRules'
import { scanPath } from '@/lib/forgeScanRules'

const STATUS_LABELS: Record<string, string> = {
  active: 'In service',
  out_of_service: 'Out of service',
  maintenance: 'In maintenance',
  reserved: 'Reserved',
  retired: 'Retired'
}

/**
 * Port slice 10: the frame for every public scan page (/scan/<token>/...). Mobile first, no app chrome:
 * company, what was scanned (with the asset's service status), who is using it, then the page.
 */
const ScanPageShell = ({
  qr,
  target,
  viewer,
  title,
  back = false,
  children
}: {
  qr: ScanQr
  target: ScanTarget
  viewer: ScanViewer

  /** Page heading below the header; omitted on the menu itself. */
  title?: string

  /** Show a "Back to scan menu" link. */
  back?: boolean
  children: React.ReactNode
}) => {
  const hasStatus = target.type === 'asset' || target.type === 'vehicle'
  const outOfService = hasStatus && target.status === 'out_of_service'
  const statusLabels: Record<string, string> = target.type === 'vehicle' ? VEHICLE_STATUS_LABELS : STATUS_LABELS

  return (
    <main className='bg-background min-h-screen px-4 py-6' data-scan-page={qr.qrNumber}>
      <div className='mx-auto flex w-full max-w-xl flex-col gap-4'>
        <header className={'rounded-lg p-4 text-white ' + (outOfService ? 'bg-red-600' : 'bg-slate-800')} data-testid='scan-header'>
          <p className='text-xs font-semibold uppercase tracking-wide opacity-90'>{qr.organizationName}</p>
          <h1 className='text-2xl font-extrabold' data-testid='scan-target-name'>
            {target.name}
          </h1>
          <p className='mt-1 text-sm opacity-90'>
            {target.type === 'asset' || target.type === 'vehicle'
              ? [target.type === 'vehicle' ? 'Vehicle ' + target.number : target.number, target.locationName].filter(Boolean).join(' · ')
              : target.type === 'location'
                ? 'Location'
                : 'Form'}
            {' · '}
            {qr.qrNumber}
          </p>
          {hasStatus ? (
            <p className='mt-2 inline-block rounded bg-white/20 px-2 py-0.5 text-sm font-bold' data-testid='scan-asset-status' data-status={target.status}>
              {outOfService ? 'OUT OF SERVICE — DO NOT USE' : statusLabels[target.status] || target.status}
            </p>
          ) : null}
        </header>

        <p className='text-textSecondary text-sm' data-testid='scan-viewer' data-viewer={viewer.kind}>
          {viewer.kind === 'anonymous' ? 'Not identified.' : `Using as ${viewer.name}${viewer.kind === 'user' ? ' (signed in)' : ' (employee number)'}.`}
        </p>

        {back ? (
          <Link href={scanPath(qr.token)} className='text-primary text-sm font-semibold'>
            ← Back to scan menu
          </Link>
        ) : null}

        {title ? <h2 className='text-textPrimary text-xl font-bold'>{title}</h2> : null}

        {children}
      </div>
    </main>
  )
}

export default ScanPageShell
