import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import ScanPageShell from '@/components/scan/ScanPageShell'
import { recordScanEvent } from '@/lib/forgeScanContext'
import { loadScanHistory, loadVehicleScanHistory } from '@/lib/forgeScanHistory'
import type { ScanHistoryKind } from '@/lib/forgeScanHistory'
import { allowsEmployeeIdentification, canUseScanAction } from '@/lib/forgeScanRules'

import { findScanAction, loadScanMenuContext } from '../menuContext'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Equipment History', robots: { index: false, follow: false } }

const KIND_LABELS: Record<ScanHistoryKind, string> = { status: 'Status', inspection: 'Inspection', issue: 'Issue', scan: 'Scan', dvir: 'DVIR', maintenance: 'Maintenance' }

const KIND_CLASSES: Record<ScanHistoryKind, string> = {
  status: 'bg-red-100 text-red-800',
  inspection: 'bg-blue-100 text-blue-800',
  issue: 'bg-amber-100 text-amber-900',
  scan: 'bg-slate-100 text-slate-700',
  dvir: 'bg-indigo-100 text-indigo-800',
  maintenance: 'bg-emerald-100 text-emerald-800'
}

const when = (value: string, timeZone: string) => {
  try {
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
  } catch {
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  }
}

/**
 * Port slice 10: equipment history from a scan (asset QRs). Employees identified on the QR see names
 * but no links into Forge; signed-in members also get links to the inspection and Corrective Action.
 */
const ScanHistoryPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const context = await loadScanMenuContext(token)

  if (!context) redirect('/q/unavailable')

  const { qr, target, viewer } = context
  const action = findScanAction(context, 'history')

  if ((target.type !== 'asset' && target.type !== 'vehicle') || !action) redirect(`/scan/${qr.token}`)

  const vehicle = target.type === 'vehicle'
  const recordType = vehicle ? 'vehicle' : 'asset'
  const pageTitle = vehicle ? 'Vehicle history' : 'Equipment history'

  if (viewer.kind === 'anonymous') {
    redirect(allowsEmployeeIdentification(qr.accessMode) ? `/scan/${qr.token}?next=history` : '/auth/login?next=' + encodeURIComponent(`/scan/${qr.token}/history`))
  }

  if (!canUseScanAction(action, viewer, qr.accessMode, qr.config)) {
    await recordScanEvent({ qr, action: 'history', viewer, result: 'denied', recordType, recordId: target.id })

    return (
      <ScanPageShell qr={qr} target={target} viewer={viewer} title={pageTitle} back>
        <p className='text-textSecondary rounded-lg border p-6 text-center' role='alert'>
          Your Forge role does not include {vehicle ? 'vehicle' : 'equipment'} history. Ask your administrator for access.
        </p>
      </ScanPageShell>
    )
  }

  const [rows, { data: organization }] = await Promise.all([
    vehicle ? loadVehicleScanHistory({ qr, vehicleId: target.id }) : loadScanHistory({ qr, assetId: target.id }),
    (createServiceRoleClient() as any).from('organizations').select('timezone').eq('id', qr.organizationId).maybeSingle()
  ])

  const timeZone: string = organization?.timezone || 'UTC'
  const links = viewer.kind === 'user'

  await recordScanEvent({ qr, action: 'history', viewer, recordType, recordId: target.id })

  return (
    <ScanPageShell qr={qr} target={target} viewer={viewer} title={pageTitle} back>
      {!rows.length ? <p className='text-textSecondary rounded-lg border p-6 text-center'>No history yet.</p> : null}
      <ol className='flex flex-col gap-2' data-testid='scan-history'>
        {rows.map(row => (
          <li key={row.id} className='bg-card rounded-lg border p-3' data-testid='scan-history-row' data-kind={row.kind}>
            <div className='flex items-start justify-between gap-2'>
              <span className={'rounded px-2 py-0.5 text-xs font-semibold ' + KIND_CLASSES[row.kind]}>{KIND_LABELS[row.kind]}</span>
              <time className='text-textSecondary text-xs' dateTime={row.at}>
                {when(row.at, timeZone)}
              </time>
            </div>
            <p className='text-textPrimary mt-1 font-semibold'>
              {links && row.href ? (
                <Link className='text-primary underline' href={row.href}>
                  {row.title}
                </Link>
              ) : (
                row.title
              )}
            </p>
            {row.detail ? <p className='text-textSecondary text-sm'>{row.detail}</p> : null}
            {row.who ? <p className='text-textSecondary text-xs'>By {row.who}</p> : null}
          </li>
        ))}
      </ol>
    </ScanPageShell>
  )
}

export default ScanHistoryPage
