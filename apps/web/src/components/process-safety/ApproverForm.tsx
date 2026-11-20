'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveApprovers } from '@/app/(back)/process-safety/actions'

const field = 'bg-background rounded-md border px-3 py-2 text-sm'

type Row = { userId: string; role: string }

/** Port slice 16: pick who approves a change (people holding approval permission at its location). */
const ApproverForm = ({ mocId, initial, candidates }: { mocId: string; initial: Row[]; candidates: { id: string; name: string }[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ userId: '', role: '' }])
  const update = (index: number, change: Partial<Row>) => setRows(current => current.map((row, at) => (at === index ? { ...row, ...change } : row)))

  if (!candidates.length) return <p className='text-textSecondary text-sm'>Nobody else holds approval permission at this location.</p>

  return (
    <form
      className='flex flex-col gap-3'
      data-approver-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveApprovers(
            mocId,
            rows.filter(row => row.userId)
          )

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-2'>
        {rows.map((row, index) => (
          <div key={index} className='flex flex-wrap items-center gap-2'>
            <select aria-label={`Approver ${index + 1}`} value={row.userId} onChange={event => update(index, { userId: event.target.value })} className={field}>
              <option value=''>Pick an approver</option>
              {candidates.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Approver ${index + 1} role`}
              placeholder='Role, e.g. Operations'
              maxLength={80}
              value={row.role}
              onChange={event => update(index, { role: event.target.value })}
              className={field}
            />
            <Button type='button' variant='outline' size='sm' onClick={() => setRows(current => current.filter((_, at) => at !== index))}>
              Remove
            </Button>
          </div>
        ))}
        <div className='flex gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={() => setRows(current => [...current, { userId: '', role: '' }])}>
            Add approver
          </Button>
          <Button type='submit' size='sm'>
            {pending ? 'Saving...' : 'Save approvers'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default ApproverForm
