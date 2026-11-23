'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { setCompanyStatus } from '@/app/(back)/contractors/actions'
import { COMPANY_STATUSES } from '@/lib/forgeContractorRules'

const field = 'bg-background rounded-md border px-3 py-2 text-sm'

/** Port slice 15: approve, suspend or deactivate a company (contractor_safety.approve). */
const StatusPanel = ({ companyId, status }: { companyId: string; status: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [next, setNext] = useState(status === 'approved' ? 'suspended' : 'approved')
  const [reason, setReason] = useState('')
  const needsReason = next === 'suspended' || next === 'inactive'

  return (
    <form
      className='flex flex-col gap-3'
      data-contractor-status-form
      onSubmit={event => {
        event.preventDefault()
        if (next === 'approved' && !window.confirm('Approve this company? Its cleared workers will be able to sign in.')) return
        startTransition(async () => {
          const result = await setCompanyStatus(companyId, next, reason)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          setReason('')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-3'>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Change status to
          <select name='status' value={next} onChange={event => setNext(event.target.value)} className={field}>
            {COMPANY_STATUSES.filter(item => item.key !== status).map(item => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          {needsReason ? 'Reason' : 'Reason (optional)'}
          <textarea name='reason' rows={2} maxLength={500} required={needsReason} value={reason} onChange={event => setReason(event.target.value)} className={field} />
        </label>
        <Button type='submit' variant={needsReason ? 'destructive' : 'default'}>
          {pending ? 'Saving...' : 'Update status'}
        </Button>
      </fieldset>
    </form>
  )
}

export default StatusPanel
