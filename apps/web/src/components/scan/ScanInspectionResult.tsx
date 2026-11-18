import Link from 'next/link'

import type { ScanInspectionSummary } from '@/lib/forgeScanInspections'

/** Port slice 10: what the field worker sees after completing a scan inspection. */
const ScanInspectionResult = ({ summary, menuHref }: { summary: ScanInspectionSummary; menuHref: string }) => {
  const passed = summary.findings.length === 0

  return (
    <section
      className='flex flex-col gap-4'
      data-testid='scan-inspection-result'
      data-findings={summary.findings.length}
      data-out-of-service={summary.outOfService ? 'true' : 'false'}
    >
      <div className={'rounded-lg p-4 text-white ' + (passed ? 'bg-green-700' : 'bg-red-600')}>
        <p className='text-2xl font-extrabold'>{passed ? 'Passed' : `${summary.findings.length} problem${summary.findings.length === 1 ? '' : 's'} found`}</p>
        <p className='mt-1 text-sm opacity-90'>Inspection {summary.number} is complete and has been sent to your safety team.</p>
      </div>

      {summary.findings.length ? (
        <div className='bg-backgroundPaper rounded-lg border p-4'>
          <h3 className='text-textPrimary font-bold'>Findings</h3>
          <ul className='text-textPrimary mt-2 list-disc pl-5 text-sm' data-testid='scan-inspection-findings'>
            {summary.findings.map(finding => (
              <li key={finding.id}>{finding.title}</li>
            ))}
          </ul>
          {summary.capaNumbers.length ? (
            <p className='text-textSecondary mt-3 text-sm' data-testid='scan-inspection-capas'>
              Corrective Action{summary.capaNumbers.length === 1 ? '' : 's'} opened: <span className='text-textPrimary font-semibold'>{summary.capaNumbers.join(', ')}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className='text-textSecondary text-sm'>No problems were reported. Thank you.</p>
      )}

      {summary.outOfService ? (
        <div className='rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800' data-testid='scan-inspection-oos'>
          This equipment has been taken out of service. Do not use it until it is repaired and returned to service.
        </div>
      ) : summary.assetOutOfServiceNow ? (
        <div className='rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800'>This equipment is out of service. Do not use it.</div>
      ) : null}

      <Link href={menuHref} className='bg-primary rounded-lg px-4 py-3 text-center font-semibold text-white' data-testid='scan-inspection-back'>
        Back to the scan menu
      </Link>
    </section>
  )
}

export default ScanInspectionResult
