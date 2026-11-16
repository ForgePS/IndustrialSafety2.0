'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { nextMvrDue } from '@/lib/forgeDotRules'
import { updateDriverFile, type DriverFileValues } from '../../actions'

const Field = ({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <Label htmlFor={id}>{label}</Label>
    <div className='mt-1'>{children}</div>
    {hint ? <p className='text-textSecondary mt-1 text-xs'>{hint}</p> : null}
  </div>
)

const DriverCredentialsForm = ({
  fileId,
  initial,
  canEdit,
  cdlRequired
}: {
  fileId: string
  initial: DriverFileValues
  canEdit: boolean
  cdlRequired: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const set = (key: keyof DriverFileValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  return (
    <fieldset disabled={!canEdit || pending} className='flex flex-col gap-4'>
      <div className='grid gap-4 md:grid-cols-4'>
        <Field id='dqf-license-class' label='License'>
          <select id='dqf-license-class' className='border-input bg-card h-[38px] w-full rounded-md border px-3' value={values.license_class} onChange={set('license_class')}>
            <option value='cdl'>CDL</option>
            <option value='non_cdl'>Non-CDL</option>
          </select>
        </Field>
        <Field id='dqf-license-number' label={cdlRequired ? 'CDL number' : 'License number'}>
          <Input id='dqf-license-number' value={values.license_number} onChange={set('license_number')} autoComplete='off' />
        </Field>
        <Field id='dqf-license-state' label='Issuing state'>
          <Input id='dqf-license-state' value={values.license_state} maxLength={2} placeholder='AR' onChange={event => setValues(current => ({ ...current, license_state: event.target.value.toUpperCase() }))} />
        </Field>
        <Field id='dqf-license-expires' label='License expires'>
          <Input id='dqf-license-expires' type='date' value={values.license_expires_on} onChange={set('license_expires_on')} />
        </Field>
      </div>
      <Field id='dqf-restrictions' label='Driver restrictions' hint='Mentioning diabetes makes the diabetic eye exam required.'>
        <Input id='dqf-restrictions' value={values.driver_restrictions} onChange={set('driver_restrictions')} placeholder='e.g. Corrective lenses' />
      </Field>
      <div className='grid gap-4 md:grid-cols-4'>
        <Field id='dqf-mec-expires' label='Medical certificate expires'>
          <Input id='dqf-mec-expires' type='date' value={values.medical_certificate_expires_on} onChange={set('medical_certificate_expires_on')} />
        </Field>
        <Field id='dqf-registry' label='National Registry #'>
          <Input id='dqf-registry' value={values.national_registry_number} onChange={set('national_registry_number')} />
        </Field>
        <Field id='dqf-registry-verified' label='Examiner verified on registry'>
          <label className='flex h-[38px] items-center gap-2 text-sm'>
            <input id='dqf-registry-verified' type='checkbox' checked={values.registry_verified} onChange={event => setValues(current => ({ ...current, registry_verified: event.target.checked }))} />
            Verified
          </label>
        </Field>
        <Field id='dqf-diabetic' label='Diabetic eye exam expires'>
          <Input id='dqf-diabetic' type='date' value={values.diabetic_eye_exam_expires_on} onChange={set('diabetic_eye_exam_expires_on')} />
        </Field>
      </div>
      <div className='grid gap-4 md:grid-cols-4'>
        <Field id='dqf-mvr-done' label='Last MVR pulled'>
          <Input
            id='dqf-mvr-done'
            type='date'
            value={values.mvr_completed_on}
            onChange={event => {
              const done = event.target.value

              // The annual MVR is due a year after it was pulled; fill it in unless already later.
              setValues(current => ({
                ...current,
                mvr_completed_on: done,
                mvr_expires_on: done && (!current.mvr_expires_on || current.mvr_expires_on < nextMvrDue(done)) ? nextMvrDue(done) : current.mvr_expires_on
              }))
            }}
          />
        </Field>
        <Field id='dqf-mvr-due' label='Next MVR due'>
          <Input id='dqf-mvr-due' type='date' value={values.mvr_expires_on} onChange={set('mvr_expires_on')} />
        </Field>
      </div>
      <Field id='dqf-notes' label='Notes'>
        <Textarea id='dqf-notes' rows={2} value={values.notes} onChange={set('notes')} />
      </Field>
      {canEdit ? (
        <div className='flex gap-2'>
          <Button
            disabled={!dirty}
            onClick={() =>
              startTransition(async () => {
                const result = await updateDriverFile({ fileId, values })

                if (result.error) toast('error', result.error)
                else {
                  toast('success', result.message || 'Saved.')
                  router.refresh()
                }
              })
            }
          >
            {pending ? 'Saving...' : 'Save Credentials'}
          </Button>
          {dirty ? <Button variant='outline' onClick={() => setValues(initial)}>Undo</Button> : null}
        </div>
      ) : null}
    </fieldset>
  )
}

export default DriverCredentialsForm
