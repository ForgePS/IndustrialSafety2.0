'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveReport } from '@/app/(back)/reporting/actions'

/**
 * Port slice 13: save the report as it's filtered now (new, or update the one being edited). Sharing needs
 * reporting.share; shared reports still run with each viewer's own permissions.
 */
const SaveReportForm = ({
  reportKey,
  params,
  canShare,
  existing
}: {
  reportKey: string
  params: Record<string, unknown>
  canShare: boolean
  existing?: { id: string; name: string; description: string | null; shared: boolean }
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [shared, setShared] = useState(existing?.shared || false)

  if (!open) {
    return (
      <Button type='button' variant='outline' onClick={() => setOpen(true)} data-report-save-open>
        {existing ? 'Update saved report' : 'Save report'}
      </Button>
    )
  }

  return (
    <form
      className='bg-card flex w-full max-w-xl flex-col gap-3 rounded-md border p-4'
      data-report-save-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveReport({ id: existing?.id, reportKey, name, description, params, shared })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          setOpen(false)
          router.push('/reporting/saved/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-3'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='report-name'>Name</Label>
          <Input id='report-name' value={name} maxLength={120} required onChange={event => setName(event.target.value)} />
        </div>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='report-description'>Description (optional)</Label>
          <Input id='report-description' value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} />
        </div>
        {canShare ? (
          <label className='flex items-start gap-2 text-sm'>
            <input id='report-shared' type='checkbox' className='mt-1' checked={shared} onChange={event => setShared(event.target.checked)} />
            <span>
              Share with the company
              <span className='text-textSecondary block text-xs'>People see it in Saved reports, with only the records their own permissions allow.</span>
            </span>
          </label>
        ) : null}
        <p className='text-textSecondary text-xs'>Saves the filters, grouping and columns as they are now. Dates like &quot;Last 30 days&quot; move with each run.</p>
        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : 'Save'}</Button>
          <Button type='button' variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default SaveReportForm
