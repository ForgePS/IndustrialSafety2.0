'use client'

import { useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'

/**
 * Form 300 CSV download. OSHA keeps a separate log for each establishment (29 CFR 1904.30), so export needs one
 * establishment selected. When cases have print issues the user must confirm with "Export anyway".
 */
const OshaLogExport = ({ href, establishmentSelected, issueCount }: { href: string; establishmentSelected: boolean; issueCount: number }) => {
  const [confirming, setConfirming] = useState(false)

  if (!establishmentSelected) {
    return (
      <div className='flex flex-col items-end gap-1'>
        <Button variant='outline' disabled data-testid='osha-log-csv-disabled'>Download CSV</Button>
        <p className='text-textSecondary max-w-xs text-right text-xs' data-testid='osha-log-csv-hint'>
          Select an establishment to export. OSHA requires a separate Form 300 log for each establishment.
        </p>
      </div>
    )
  }

  if (!issueCount) {
    return (
      <Button variant='outline' asChild>
        <a href={href} data-testid='osha-log-csv'>Download CSV</a>
      </Button>
    )
  }

  if (!confirming) {
    return (
      <Button variant='outline' onClick={() => setConfirming(true)} data-testid='osha-log-csv'>
        Download CSV
      </Button>
    )
  }

  return (
    <div className='border-warning flex max-w-md flex-col gap-2 rounded-lg border p-3' role='alert' data-testid='osha-log-csv-confirm'>
      <p className='text-textPrimary text-sm'>
        {issueCount === 1 ? 'One case has' : `${issueCount} cases have`} missing or inconsistent fields (listed under &quot;Fix before
        printing&quot;). The exported log may be incomplete.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button size='sm' asChild>
          <a href={href} onClick={() => setConfirming(false)} data-testid='osha-log-csv-confirm-export'>Export anyway</a>
        </Button>
        <Button size='sm' variant='tonalDefault' onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  )
}

export default OshaLogExport
