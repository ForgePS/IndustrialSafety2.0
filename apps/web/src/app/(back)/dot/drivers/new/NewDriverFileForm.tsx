'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { createDriverFile } from '../../actions'

const NewDriverFileForm = ({ candidates }: { candidates: Array<{ id: string; name: string; employeeNumber: string | null }> }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [personnelId, setPersonnelId] = useState('')
  const [licenseClass, setLicenseClass] = useState('cdl')

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <Label htmlFor='dqf-driver'>Driver</Label>
        <select id='dqf-driver' className='border-input bg-card mt-2 h-[38px] w-full rounded-md border px-3' value={personnelId} onChange={event => setPersonnelId(event.target.value)}>
          <option value=''>Pick a person...</option>
          {candidates.map(person => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.employeeNumber ? ' · #' + person.employeeNumber : ''}
            </option>
          ))}
        </select>
        {!candidates.length ? <p className='text-textSecondary mt-2 text-sm'>Everyone in your scope already has an open file, or no one is active.</p> : null}
      </div>
      <div>
        <Label htmlFor='dqf-class'>License</Label>
        <select id='dqf-class' className='border-input bg-card mt-2 h-[38px] w-full rounded-md border px-3' value={licenseClass} onChange={event => setLicenseClass(event.target.value)}>
          <option value='cdl'>CDL driver</option>
          <option value='non_cdl'>Non-CDL driver</option>
        </select>
      </div>
      <div>
        <Button
          disabled={pending || !personnelId}
          onClick={() =>
            startTransition(async () => {
              const result = await createDriverFile({ personnelId, licenseClass })

              if (result.error) toast('error', result.error)
              else router.push('/dot/drivers/' + result.id)
            })
          }
        >
          {pending ? 'Creating...' : 'Create Driver File'}
        </Button>
      </div>
    </div>
  )
}

export default NewDriverFileForm
