import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { beginScanInspection } from '../actions'
import ScanInspectionResult from '@/components/scan/ScanInspectionResult'
import ScanInspectionRunner from '@/components/scan/ScanInspectionRunner'
import ScanPageShell from '@/components/scan/ScanPageShell'
import { loadScanQr, loadScanTarget, resolveScanViewer } from '@/lib/forgeScanContext'
import {
  canStartScanInspection,
  isScanFrequency,
  findResumableScanInspection,
  loadEmployeeScanInspection,
  loadScanInspectionSummary,
  loadScanInspectionTemplate,
  scanInspectionAction
} from '@/lib/forgeScanInspections'
import { SCAN_FREQUENCY_LABELS, scanPath } from '@/lib/forgeScanRules'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Inspection', robots: { index: false, follow: false } }

const Notice = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) => (
  <div
    className={'rounded-lg border p-4 text-sm ' + (tone === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'bg-backgroundPaper text-textPrimary')}
    data-testid='scan-inspection-notice'
  >
    {children}
  </div>
)

/**
 * Port slice 10: an inspection started from a QR scan. The template comes from the QR's action config for
 * this frequency. Signed-in members continue on the normal inspection page; employees identified by number
 * answer the checklist here.
 */
const ScanInspectionPage = async ({
  params,
  searchParams
}: {
  params: Promise<{ token: string; frequency: string }>
  searchParams: Promise<{ result?: string; error?: string }>
}) => {
  const [{ token, frequency }, { result, error }] = await Promise.all([params, searchParams])

  if (!isScanFrequency(frequency)) notFound()

  const qr = await loadScanQr(token)

  if (!qr) redirect('/q/unavailable')

  const target = await loadScanTarget(qr)

  if (!target) redirect('/q/unavailable')

  const viewer = await resolveScanViewer(qr)
  const label = `${SCAN_FREQUENCY_LABELS[frequency]} inspection`

  const shell = (children: React.ReactNode) => (
    <ScanPageShell qr={qr} target={target} viewer={viewer} title={label} back>
      {children}
    </ScanPageShell>
  )

  const action = scanInspectionAction(qr, target, frequency)
  const template = action ? await loadScanInspectionTemplate(qr, frequency) : null

  if (!action || !template) return shell(<Notice>This inspection is not set up for this QR code. Ask your supervisor to choose a {frequency} checklist for it.</Notice>)

  if (viewer.kind === 'anonymous') {
    if (qr.accessMode === 'signed_in') redirect(`/auth/login?next=${encodeURIComponent(`${scanPath(qr.token)}/inspect/${frequency}`)}`)
    redirect(`${scanPath(qr.token)}?next=inspect-${frequency}`)
  }

  if (!canStartScanInspection(qr, target, viewer, frequency)) {
    return shell(<Notice tone='error'>You do not have permission to start inspections. Ask your administrator for access.</Notice>)
  }

  if (result && viewer.kind === 'employee') {
    const summary = await loadScanInspectionSummary({ qr, viewer, inspectionId: result })

    if (summary) return shell(<ScanInspectionResult summary={summary} menuHref={scanPath(qr.token)} />)
  }

  const resumable = await findResumableScanInspection(qr, viewer, frequency)

  if (!resumable) {
    return shell(
      <div className='flex flex-col gap-4'>
        {error ? <Notice tone='error'>{error.slice(0, 300)}</Notice> : null}
        <Notice>
          <p className='font-semibold'>{template.name}</p>
          <p className='mt-1'>
            {template.items.length} {template.items.length === 1 ? 'question' : 'questions'}. Starting creates the inspection record
            {viewer.kind === 'user' ? ' and opens it in Forge.' : '. Your answers save as you go.'}
          </p>
        </Notice>
        <form action={beginScanInspection.bind(null, qr.token, frequency)}>
          <button type='submit' className='bg-primary w-full rounded-lg px-4 py-4 text-lg font-bold text-white' data-testid='scan-inspection-start'>
            Start {label.toLowerCase()}
          </button>
        </form>
      </div>
    )
  }

  if (viewer.kind === 'user') redirect(`/inspections/${resumable}`)

  const started = { inspectionId: resumable }

  const inspection = await loadEmployeeScanInspection({ qr, viewer, inspectionId: started.inspectionId })

  if (!inspection) {
    return shell(
      <Notice tone='error'>
        This inspection could not be opened. <Link href={scanPath(qr.token)} className='text-primary font-semibold'>Back to the scan menu</Link>
      </Notice>
    )
  }

  return shell(
    <ScanInspectionRunner
      token={qr.token}
      frequency={frequency}
      resumed={inspection.items.some(item => item.response_value != null && item.response_value !== '')}
      inspection={{
        id: inspection.id,
        number: inspection.number,
        templateName: inspection.templateName,
        items: inspection.items.map(item => ({
          id: item.id,
          item_key: item.item_key,
          section_label: item.section_label,
          prompt: item.prompt,
          guidance: item.guidance,
          response_type: item.response_type,
          is_required: item.is_required,
          finding_on: item.finding_on || [],
          response_value: item.response_value,
          notes: item.notes
        }))
      }}
      outOfServiceOnFailure={qr.config.outOfServiceOnFailedInspection && target.type === 'asset'}
    />
  )
}

export default ScanInspectionPage
