'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { COMPANY_DRIVER_STATUS_LABELS } from '@/lib/forgeDotRules'
import { updateCompanyDriver, type CompanyDriverValues } from '../../actions'

const FIELDS: Array<{ key: keyof CompanyDriverValues; label: string; type?: string }> = [
  { key: 'driver_name', label: 'Name' },
  { key: 'employee_number', label: 'Employee #' },
  { key: 'license_number', label: 'License number' },
  { key: 'license_state', label: 'License state' },
  { key: 'license_expires_on', label: 'License expires', type: 'date' },
  { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { key: 'mvr_consent_on', label: 'MVR consent signed', type: 'date' },
  { key: 'initial_mvr_on', label: 'Initial MVR', type: 'date' },
  { key: 'last_mvr_on', label: 'Last MVR', type: 'date' },
  { key: 'next_mvr_due_on', label: 'Next MVR due', type: 'date' },
  { key: 'insurance_effective_on', label: 'On insurance since', type: 'date' }
]

const CompanyDriverForm = ({ driverId, initial, canEdit }: { driverId: string; initial: CompanyDriverValues; canEdit: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  return (
    <fieldset disabled={!canEdit || pending} className='flex flex-col gap-4'>
      <div className='grid gap-4 md:grid-cols-3'>
        <div>
          <Label htmlFor='cd-status'>Status</Label>
          <select
            id='cd-status'
            className='border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3'
            value={values.status}
            onChange={event => setValues(current => ({ ...current, status: event.target.value }))}
          >
            {Object.entries(COMPANY_DRIVER_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        {FIELDS.map(field => (
          <div key={field.key}>
            <Label htmlFor={'cd-' + field.key}>{field.label}</Label>
            <Input
              id={'cd-' + field.key}
              className='mt-1'
              type={field.type || 'text'}
              value={String(values[field.key] || '')}
              maxLength={field.key === 'license_state' ? 2 : undefined}
              onChange={event =>
                setValues(current => ({ ...current, [field.key]: field.key === 'license_state' ? event.target.value.toUpperCase() : event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor='cd-notes'>Notes</Label>
        <Textarea id='cd-notes' className='mt-1' rows={2} value={values.notes} onChange={event => setValues(current => ({ ...current, notes: event.target.value }))} />
      </div>
      {canEdit ? (
        <div>
          <Button
            disabled={!dirty}
            onClick={() =>
              startTransition(async () => {
                const result = await updateCompanyDriver({ driverId, values })

                if (result.error) toast('error', result.error)
                else {
                  toast('success', result.message || 'Saved.')
                  router.refresh()
                }
              })
            }
          >
            {pending ? 'Saving...' : 'Save Driver'}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

export default CompanyDriverForm
