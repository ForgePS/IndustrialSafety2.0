'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import { createCompanyDriver, type CompanyDriverValues } from '../actions'

export const EMPTY_COMPANY_DRIVER: CompanyDriverValues = {
  driver_name: '',
  employee_number: '',
  license_number: '',
  license_state: '',
  license_expires_on: '',
  date_of_birth: '',
  status: 'pending_mvr',
  mvr_consent_on: '',
  initial_mvr_on: '',
  last_mvr_on: '',
  next_mvr_due_on: '',
  insurance_effective_on: '',
  notes: ''
}

const AddCompanyDriverForm = ({
  candidates,
  allowUnlinked
}: {
  candidates: Array<{ id: string; name: string; employeeNumber: string | null }>
  allowUnlinked: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [personnelId, setPersonnelId] = useState('')
  const [name, setName] = useState('')
  const person = candidates.find(item => item.id === personnelId)

  return (
    <div className='flex flex-col gap-3'>
      <select aria-label='Company driver' className='border-input bg-card h-[38px] w-full rounded-md border px-3' value={personnelId} onChange={event => setPersonnelId(event.target.value)}>
        <option value=''>{allowUnlinked ? 'Someone not in personnel...' : 'Pick a person...'}</option>
        {candidates.map(item => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.employeeNumber ? ' · #' + item.employeeNumber : ''}
          </option>
        ))}
      </select>
      {!personnelId && allowUnlinked ? <Input placeholder='Driver name' value={name} onChange={event => setName(event.target.value)} /> : null}
      <div>
        <Button
          disabled={pending || (!personnelId && (!allowUnlinked || !name.trim()))}
          onClick={() =>
            startTransition(async () => {
              const result = await createCompanyDriver({
                personnelId: personnelId || null,
                values: { ...EMPTY_COMPANY_DRIVER, driver_name: person?.name || name, employee_number: person?.employeeNumber || '' }
              })

              if (result.error) toast('error', result.error)
              else router.push('/dot/company-drivers/' + result.id)
            })
          }
        >
          {pending ? 'Adding...' : 'Add Driver'}
        </Button>
      </div>
    </div>
  )
}

export default AddCompanyDriverForm
