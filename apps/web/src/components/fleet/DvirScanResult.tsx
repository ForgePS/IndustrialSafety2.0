import Link from 'next/link'

import type { SubmitDvirResult } from '@/lib/forgeFleetDvirs'

/**
 * Port slice 11 (piece B): what a driver sees after a scan DVIR. No internal links: employees identified by
 * number only get back to the scan menu.
 */
const DvirScanResult = ({ result, menuHref }: { result: Extract<SubmitDvirResult, { ok: true }>; menuHref: string }) => (
  <div className='flex flex-col gap-4' data-testid='dvir-result' data-dvir-number={result.number} data-out-of-service={result.outOfService ? 'true' : 'false'}>
    <div className={'rounded-lg border p-4 ' + (result.defects.length ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-green-300 bg-green-50 text-green-900')}>
      <p className='text-lg font-bold'>DVIR {result.number} submitted.</p>
      <p className='mt-1 text-sm'>
        {result.defects.length
          ? `${result.defects.length} defect${result.defects.length === 1 ? '' : 's'} reported. A mechanic has been notified.`
          : 'No defects. Thank you.'}
      </p>
    </div>

    {result.outOfService ? (
      <div className='rounded-lg bg-red-600 p-4 font-bold text-white' data-testid='dvir-result-oos'>
        This vehicle is now OUT OF SERVICE. Do not drive it until a mechanic certifies the repairs.
      </div>
    ) : null}

    {result.defects.length ? (
      <ul className='bg-backgroundPaper flex flex-col gap-2 rounded-lg border p-4 text-sm'>
        {result.defects.map(defect => (
          <li key={`${defect.section}-${defect.label}`}>
            <span className='font-semibold'>
              {defect.section === 'trailer' ? 'Trailer ' : ''}
              {defect.label}
            </span>
            : {defect.notes}
          </li>
        ))}
      </ul>
    ) : null}

    {result.repairNumber ? <p className='text-textSecondary text-sm'>Repair {result.repairNumber} was opened.</p> : null}

    {result.notes.map(note => (
      <p key={note} className='text-textSecondary text-sm' data-testid='dvir-result-note'>
        {note}
      </p>
    ))}

    <Link href={menuHref} className='bg-primary rounded-lg px-4 py-4 text-center text-lg font-bold text-white' data-testid='dvir-back-to-menu'>
      Back to scan menu
    </Link>
  </div>
)

export default DvirScanResult
