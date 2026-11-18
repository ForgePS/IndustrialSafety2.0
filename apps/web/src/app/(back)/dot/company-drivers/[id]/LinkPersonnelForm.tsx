'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { linkCompanyDriver } from '../../actions'

const LinkPersonnelForm = ({ driverId, candidates }: { driverId: string; candidates: Array<{ id: string; name: string }> }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [personnelId, setPersonnelId] = useState('')

  return (
    <div className='flex flex-col gap-2'>
      <select aria-label='Person to link' className='border-input bg-card h-[38px] w-full rounded-md border px-3' value={personnelId} onChange={event => setPersonnelId(event.target.value)}>
        <option value=''>Pick a person...</option>
        {candidates.map(person => (
          <option key={person.id} value={person.id}>{person.name}</option>
        ))}
      </select>
      <div>
        <Button
          disabled={pending || !personnelId}
          onClick={() =>
            startTransition(async () => {
              const result = await linkCompanyDriver({ driverId, personnelId })

              if (result.error) toast('error', result.error)
              else {
                toast('success', result.message || 'Linked.')
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Linking...' : 'Link Driver'}
        </Button>
      </div>
    </div>
  )
}

export default LinkPersonnelForm
