import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import ScanIssueForm from '@/components/scan/ScanIssueForm'
import ScanPageShell from '@/components/scan/ScanPageShell'
import { scanPath } from '@/lib/forgeScanRules'

import { loadReportContext } from './reportContext'

export const metadata: Metadata = { title: 'Report an issue', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Port slice 10: report an issue from a QR scan. Anonymous visitors may report only on public_report QRs;
 * otherwise they are sent to identify by employee number (or to sign in on signed_in QRs) and come back.
 */
const ScanReportPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params
  const context = await loadReportContext(token)

  if (!context) notFound()

  const { qr, target, viewer, reportOffered, canReport, canMarkOutOfService } = context

  if (reportOffered && !canReport && viewer.kind === 'anonymous') {
    if (qr.accessMode === 'signed_in') redirect('/auth/login?next=' + encodeURIComponent(`${scanPath(qr.token)}/report`))
    redirect(`${scanPath(qr.token)}?next=report`)
  }

  return (
    <ScanPageShell qr={qr} target={target} viewer={viewer} title='Report an issue' back>
      {canReport ? (
        <ScanIssueForm
          token={qr.token}
          targetName={target.name}
          isAsset={target.type === 'asset' || target.type === 'vehicle'}
          noun={target.type === 'vehicle' ? 'vehicle' : 'equipment'}
          anonymous={viewer.kind === 'anonymous'}
          canMarkOutOfService={canMarkOutOfService}
          menuHref={scanPath(qr.token)}
        />
      ) : (
        <p className='rounded-lg border p-4' data-testid='scan-issue-unavailable'>
          {reportOffered ? 'You cannot report an issue on this QR code. Ask your supervisor.' : 'Issue reporting is turned off for this QR code.'}
        </p>
      )}
    </ScanPageShell>
  )
}

export default ScanReportPage
